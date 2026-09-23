const fs = require("fs");
const https = require("https");
const path = require("path");

const SRC = "https://www.7oaks-ac.org.uk/junior-club-records";
const outDir = path.join(__dirname, "..", "data");

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "user-agent": "Mozilla/5.0 SevenoaksAC" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetch(new URL(res.headers.location, url).href).then(resolve, reject);
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function cellText(td) {
  const sheets = td.match(/data-sheets-value="(\{[^"]+\})"/);
  if (sheets) {
    try {
      const json = JSON.parse(sheets[1].replace(/&quot;/g, '"'));
      if (json[2]) return String(json[2]).trim();
    } catch (err) {}
  }
  const inner = td.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  return inner.replace(/\s+/g, " ").trim();
}

function parseRows(html) {
  const body = (html.match(/<tbody>([\s\S]*?)<\/tbody>/i) || [])[1] || "";
  const rows = [];
  body.replace(/<tr[\s\S]*?<\/tr>/gi, (tr) => {
    const cells = [];
    tr.replace(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi, (_, attrs, inner) => {
      cells.push(cellText("<td " + attrs + ">" + inner + "</td>"));
    });
    if (cells.length) rows.push(cells);
    return "";
  });
  return rows;
}

function indoorOf(event) {
  return /indoor/i.test(event) ? "Indoors" : "Outdoors";
}

function eventName(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/\s*\(indoors?\)/i, "")
    .trim();
}

function recordsFrom(rows) {
  const out = [];
  let event = "";
  rows.forEach((cells) => {
    const first = cells[0] || "";
    if (/junior club records/i.test(first)) return;
    if (/^(male|female|boys|girls)$/i.test(first)) return;
    if (first && !/^u\d/i.test(first)) {
      event = first.replace(/^Hept$/i, "Heptathlon");
    }
    const maleCat = cells[2] || "";
    const femaleCat = cells[8] || "";
    if (/^u\d/i.test(maleCat) && cells[3] && cells[4]) {
      const ev = eventName(event);
      out.push({
        event: ev,
        extra: indoorOf(event),
        gender: "Men",
        category: maleCat.trim(),
        rank: "1",
        name: cells[3],
        mark: cells[4],
        date: cells[5] || "",
        venue: cells[6] || ""
      });
    }
    if (/^u\d/i.test(femaleCat) && cells[9] && cells[10]) {
      const ev = eventName(event);
      out.push({
        event: ev,
        extra: indoorOf(event),
        gender: "Women",
        category: femaleCat.trim(),
        rank: "1",
        name: cells[9],
        mark: cells[10],
        date: cells[11] || "",
        venue: cells[12] || ""
      });
    }
  });
  return out.filter((r) => r.event && r.name && r.mark);
}

function csvEscape(value) {
  const s = String(value || "");
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(rows) {
  const head = ["Event", "Surface", "Gender", "Category", "Rank", "Name", "Performance", "Date", "Venue"];
  const lines = [head.join(",")];
  rows.forEach((r) => {
    lines.push(
      [r.event, r.extra, r.gender, r.category, r.rank, r.name, r.mark, r.date, r.venue].map(csvEscape).join(",")
    );
  });
  return lines.join("\n") + "\n";
}

function yearOf(date) {
  const m = String(date || "").match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : 0;
}

(async () => {
  const html = await fetch(SRC);
  const rows = recordsFrom(parseRows(html));
  if (!rows.length) {
    console.error("no rows parsed");
    process.exit(1);
  }
  fs.writeFileSync(path.join(outDir, "junior-club-bests.csv"), toCsv(rows));
  const men = rows.filter((r) => r.gender === "Men");
  const women = rows.filter((r) => r.gender === "Women");
  function rec(r) {
    return {
      event: r.extra === "Indoors" ? r.event + " indoor" : r.event,
      category: r.category,
      name: r.name,
      mark: r.mark,
      date: r.date,
      venue: r.venue
    };
  }
  const json = {
    track: {
      men: men.map(rec),
      women: women.map(rec)
    },
    trackNew: {
      men: men.filter((r) => yearOf(r.date) >= 2025).map((r) => Object.assign(rec(r), { rank: r.rank })),
      women: women.filter((r) => yearOf(r.date) >= 2025).map((r) => Object.assign(rec(r), { rank: r.rank }))
    }
  };
  fs.writeFileSync(path.join(outDir, "junior-club-bests.json"), JSON.stringify(json, null, 2));
  console.log("rows", rows.length, "men", men.length, "women", women.length, "new", json.trackNew.men.length + json.trackNew.women.length);
  console.log("events", [...new Set(rows.map((r) => r.event))].join(" | "));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
