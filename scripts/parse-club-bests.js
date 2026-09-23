const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const src = path.join(__dirname, "..", "data", "clubbests.xlsx");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xlsx-"));
fs.copyFileSync(src, path.join(dir, "c.zip"));
execSync("tar -xf c.zip", { cwd: dir });

const ssXml = fs.readFileSync(path.join(dir, "xl/sharedStrings.xml"), "utf8");
const strings = [];
ssXml.replace(/<si>([\s\S]*?)<\/si>/g, (_, si) => {
  const t = [...si.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]).join("");
  strings.push(t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  return _;
});

function colRow(ref) {
  const m = String(ref).match(/^([A-Z]+)(\d+)$/);
  const col = m[1].split("").reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
  return { col, row: Number(m[2]) };
}

function excelDate(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 20000) return String(n || "");
  const d = new Date(Math.round((num - 25569) * 86400 * 1000));
  if (Number.isNaN(d.getTime())) return String(n);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function excelYear(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 20000) return 0;
  return new Date(Math.round((num - 25569) * 86400 * 1000)).getUTCFullYear();
}

function parseSheet(file) {
  const xml = fs.readFileSync(path.join(dir, "xl/worksheets", file), "utf8");
  const rows = {};
  xml.replace(/<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g, (_, ref, attrs, inner) => {
    const { col, row } = colRow(ref);
    if (!rows[row]) rows[row] = [];
    const v = (inner.match(/<v>([^<]*)<\/v>/) || [])[1];
    let val = "";
    if (/t="s"/.test(attrs)) val = strings[Number(v)] || "";
    else if (v != null) val = v;
    const is = (inner.match(/<t[^>]*>([^<]*)<\/t>/) || [])[1];
    if (is) val = is.replace(/&amp;/g, "&");
    rows[row][col] = val;
    return _;
  });
  return Object.keys(rows)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => rows[n] || []);
}

function genderOf(value) {
  const g = String(value || "").toLowerCase();
  if (g.indexOf("women") >= 0 || g === "w") return "women";
  if (g.indexOf("men") >= 0 || g === "m") return "men";
  return "";
}

const tf = parseSheet("sheet2.xml");
const road = parseSheet("sheet3.xml");

function tfRecord(r, withRank) {
  const indoor = String(r[1] || "").toLowerCase().indexOf("indoor") >= 0;
  const rec = {
    event: (r[0] || "") + (indoor ? " indoor" : ""),
    category: r[3] || "",
    name: r[5] || "",
    mark: r[6] || "",
    date: excelDate(r[7]),
    venue: r[8] || ""
  };
  if (withRank) rec.rank = r[4] || "";
  return rec;
}

function tfRows() {
  const out = { men: [], women: [] };
  tf.slice(1).forEach((r) => {
    if (String(r[4]) !== "1") return;
    const g = genderOf(r[2]);
    if (!g) return;
    out[g].push(tfRecord(r, false));
  });
  return out;
}

function tfNew() {
  const out = { men: [], women: [] };
  tf.slice(1).forEach((r) => {
    const y = excelYear(r[7]);
    if (y !== 2025 && y !== 2026) return;
    const g = genderOf(r[2]);
    if (!g) return;
    out[g].push(tfRecord(r, true));
  });
  return out;
}

function roadRecord(r, withRank) {
  const terrain = r[1] && r[1] !== "Road" ? " (" + r[1] + ")" : "";
  const rec = {
    event: (r[0] || "") + terrain,
    category: r[3] || "",
    name: r[5] || "",
    mark: r[6] || "",
    date: excelDate(r[7]),
    venue: r[8] || ""
  };
  if (withRank) rec.rank = r[4] || "";
  return rec;
}

function roadRows() {
  const out = { men: [], women: [] };
  road.slice(1).forEach((r) => {
    if (String(r[4]) !== "1") return;
    const g = genderOf(r[2]);
    if (!g) return;
    out[g].push(roadRecord(r, false));
  });
  return out;
}

function roadNew() {
  const out = { men: [], women: [] };
  road.slice(1).forEach((r) => {
    const y = excelYear(r[7]);
    if (y !== 2025 && y !== 2026) return;
    const g = genderOf(r[2]);
    if (!g) return;
    out[g].push(roadRecord(r, true));
  });
  return out;
}

const data = { track: tfRows(), road: roadRows(), roadNew: roadNew(), trackNew: tfNew() };
const dest = path.join(__dirname, "..", "data", "club-bests.json");
fs.writeFileSync(dest, JSON.stringify(data));
console.log(
  "road men",
  data.road.men.length,
  "road women",
  data.road.women.length,
  "tf men",
  data.track.men.length,
  "tf women",
  data.track.women.length,
  "new road men",
  data.roadNew.men.length,
  "new road women",
  data.roadNew.women.length,
  "new tf men",
  data.trackNew.men.length,
  "new tf women",
  data.trackNew.women.length
);
console.log("wrote", dest);
console.log("sample road men", data.road.men[0]);
console.log("sample tf women", data.track.women[0]);
