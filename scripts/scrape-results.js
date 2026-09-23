const fs = require("fs");
const https = require("https");
const path = require("path");

const BASE = "https://www.7oaks-ac.org.uk";
const OUT = path.join(__dirname, "..", "data", "results-2026.csv");

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

function decode(html) {
  return String(html || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function text(html) {
  return decode(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toIso(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return s;
  let y = m[3];
  if (y.length === 2) y = (Number(y) >= 70 ? "19" : "20") + y;
  return y + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
}

function csvEscape(value) {
  const s = String(value == null ? "" : value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function listingUrls() {
  const found = [];
  const seen = {};
  for (let start = 0; start <= 40; start += 5) {
    const url = start ? BASE + "/results-5?start=" + start : BASE + "/results-5";
    const html = await get(url);
    const matches = [...html.matchAll(/href="(\/results-5\/\d+-[^"]+)"/g)];
    let added = 0;
    matches.forEach((m) => {
      const href = m[1];
      if (seen[href]) return;
      if (!/2026/.test(href)) return;
      seen[href] = true;
      found.push(BASE + href);
      added += 1;
    });
    if (!added && start > 0) break;
  }
  return found;
}

function parseArticle(html, source) {
  const title = (html.match(/<title>([^<]+)<\/title>/i) || [, ""])[1].trim();
  const kind = /track/i.test(title) || /track-field/.test(source) ? "track" : "road";
  const rows = [];
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  tables.forEach((table) => {
    const trs = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    let map = null;
    trs.forEach((tr) => {
      const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => text(m[1]));
      if (!cells.length) return;
      const lower = cells.map((c) => c.toLowerCase().replace(/\s+/g, " ").trim());
      if (lower.some((c) => c === "race") && lower.some((c) => c.indexOf("date") >= 0)) {
        map = {};
        lower.forEach((c, i) => {
          if (c === "race") map.race = i;
          else if (c.indexOf("date") >= 0) map.date = i;
          else if (c.indexOf("distance") >= 0) map.distance = i;
          else if (c.indexOf("position") >= 0 || c === "pos") map.position = i;
          else if (c.indexOf("name") >= 0) map.name = i;
          else if (c.indexOf("time") >= 0) map.time = i;
          else if (c.indexOf("gp") >= 0) map.gp = i;
        });
        return;
      }
      if (!map || map.race == null || map.name == null) return;
      const race = cells[map.race] || "";
      const name = cells[map.name] || "";
      if (!race || !name || /^race$/i.test(race) || /^master name$/i.test(name)) return;
      rows.push({
        race: race,
        date: toIso(map.date != null ? cells[map.date] : ""),
        distance: map.distance != null ? cells[map.distance] : "",
        position: map.position != null ? cells[map.position] : "",
        name: name,
        time: map.time != null ? cells[map.time] : "",
        gp: map.gp != null ? cells[map.gp] : "",
        type: kind,
        source: source
      });
    });
  });
  return rows;
}

function key(row) {
  return [row.date, row.race, row.name, row.time, row.distance].join("|").toLowerCase();
}

(async () => {
  const urls = await listingUrls();
  console.log("articles", urls.length);
  urls.forEach((u) => console.log(" ", u));
  const all = [];
  for (const url of urls) {
    const html = await get(url);
    const rows = parseArticle(html, url);
    console.log(rows.length, url.replace(BASE, ""));
    all.push.apply(all, rows);
  }
  const seen = {};
  const unique = [];
  all.forEach((row) => {
    const k = key(row);
    if (seen[k]) return;
    seen[k] = true;
    unique.push(row);
  });
  unique.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.race.localeCompare(b.race)));
  const header = ["Date", "Race", "Distance", "Position", "Name", "Time", "GP", "Type"];
  const lines = [header.join(",")].concat(
    unique.map((r) =>
      [r.date, r.race, r.distance, r.position, r.name, r.time, r.gp, r.type].map(csvEscape).join(",")
    )
  );
  fs.writeFileSync(OUT, lines.join("\n"));
  console.log("wrote", OUT, unique.length, "rows (from", all.length, "scraped)");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
