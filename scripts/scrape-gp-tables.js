const fs = require("fs");
const https = require("https");
const path = require("path");

const BASE = "https://www.7oaks-ac.org.uk";
const OUT = path.join(__dirname, "..", "data");

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "SevenoaksAC-rebuild/1.0" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith("http")
            ? res.headers.location
            : BASE + res.headers.location;
          return get(next).then(resolve, reject);
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function text(html) {
  return String(html || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellText(td) {
  const inner = td.replace(/^<td\b[^>]*>/i, "").replace(/<\/td>$/i, "");
  const visible = text(inner);
  if (visible) return visible;
  const sheets = td.match(/data-sheets-value="(\{[\s\S]*?\})"/);
  if (sheets) {
    try {
      const json = JSON.parse(sheets[1].replace(/&quot;/g, '"'));
      if (json[2] != null) return String(json[2]).trim();
      if (json[3] != null) return String(json[3]).trim();
    } catch (err) {}
  }
  return "";
}

function parseTable(html) {
  const body = (html.match(/<tbody>([\s\S]*?)<\/tbody>/i) || [])[1] || "";
  const rows = [];
  body.replace(/<tr[\s\S]*?<\/tr>/gi, (tr) => {
    const cells = [];
    tr.replace(/<td\b[\s\S]*?<\/td>/gi, (td) => {
      cells.push(cellText(td));
    });
    if (cells.some((c) => c)) rows.push(cells);
    return "";
  });
  return rows;
}

function csvEscape(value) {
  const s = String(value == null ? "" : value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const MONTHS = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  sept: "09",
  oct: "10",
  nov: "11",
  dec: "12"
};

function toFromSlug(slug) {
  const m = slug.match(/to-(\d{1,2})-([a-z]+)-(\d{4})/i);
  if (m && MONTHS[m[2].toLowerCase()]) {
    return m[3] + "-" + MONTHS[m[2].toLowerCase()] + "-" + m[1].padStart(2, "0");
  }
  const m2 = slug.match(/to-(\d{1,2})-([a-z]+)-(\d{2})(?:-|$)/i);
  if (m2 && MONTHS[m2[2].toLowerCase()]) {
    const y = Number(m2[3]) >= 70 ? "19" + m2[3] : "20" + m2[3];
    return y + "-" + MONTHS[m2[2].toLowerCase()] + "-" + m2[1].padStart(2, "0");
  }
  return "";
}

function kindFromSlug(slug) {
  if (/team/.test(slug)) return "team";
  if (/track/.test(slug)) return "track";
  if (/road/.test(slug)) return "road";
  return "";
}

async function listing() {
  const found = [];
  const seen = {};
  for (let start = 0; start <= 20; start += 5) {
    const url = start ? BASE + "/tables-6?start=" + start : BASE + "/tables-6";
    const html = await get(url);
    const matches = [...html.matchAll(/href="(\/tables-6\/\d+-[^"]+)"/g)];
    let added = 0;
    matches.forEach((m) => {
      const href = m[1];
      if (seen[href]) return;
      if (!/2026/.test(href)) return;
      const kind = kindFromSlug(href);
      if (!kind) return;
      seen[href] = true;
      found.push({ href: href, kind: kind, to: toFromSlug(href) });
      added += 1;
    });
    if (!added && start > 0) break;
  }
  return found;
}

function toCsv(rows) {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
}

(async () => {
  const articles = await listing();
  console.log("articles", articles.length);
  const buckets = { road: [], track: [], team: [] };
  for (const art of articles) {
    const html = await get(BASE + art.href);
    const table = parseTable(html);
    if (!table.length) {
      console.log("empty", art.href);
      continue;
    }
    const header = ["To"].concat(table[0]);
    const data = table.slice(1).map((row) => [art.to].concat(row));
    if (!buckets[art.kind].header) buckets[art.kind].header = header;
    buckets[art.kind].push.apply(buckets[art.kind], data);
    console.log(art.kind, art.to, data.length, art.href.replace("/tables-6/", ""));
  }
  ["road", "track", "team"].forEach((kind) => {
    const rows = buckets[kind];
    if (!rows.length) return;
    rows.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
    const out = [rows.header].concat(rows);
    const file = path.join(OUT, "gp-" + kind + "-2026.csv");
    fs.writeFileSync(file, toCsv(out));
    console.log("wrote", file, rows.length, "rows");
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
