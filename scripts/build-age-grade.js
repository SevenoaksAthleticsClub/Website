const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const agDir = path.join(root, "data", "age-grade");
const filesDir = path.join(agDir, "agegrade-files");

function parseHms(s) {
  const parts = String(s)
    .trim()
    .split(":")
    .map((n) => Number(n));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

function parseXlsx(filePath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xlsx-"));
  fs.copyFileSync(filePath, path.join(dir, "c.zip"));
  execSync("tar -xf c.zip", { cwd: dir });
  const ssXml = fs.readFileSync(path.join(dir, "xl", "sharedStrings.xml"), "utf8");
  const strings = [];
  ssXml.replace(/<si>([\s\S]*?)<\/si>/g, (_, si) => {
    strings.push([...si.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]).join(""));
    return _;
  });
  function colRow(ref) {
    const m = String(ref).match(/^([A-Z]+)(\d+)$/);
    const col = m[1].split("").reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
    return { col, row: Number(m[2]) };
  }
  function parseSheet(file) {
    const xml = fs.readFileSync(path.join(dir, "xl", "worksheets", file), "utf8");
    const rows = {};
    xml.replace(/<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g, (_, ref, attrs, inner) => {
      const { col, row } = colRow(ref);
      if (!rows[row]) rows[row] = [];
      const v = (inner.match(/<v>([^<]*)<\/v>/) || [])[1];
      let val = "";
      if (/t="s"/.test(attrs)) val = strings[Number(v)] || "";
      else if (v != null) val = v;
      rows[row][col] = val;
      return _;
    });
    return Object.keys(rows)
      .map(Number)
      .sort((a, b) => a - b)
      .map((n) => rows[n] || []);
  }
  return { parseSheet };
}

const roadSpec = [
  ["AgeGrade.1mi", "1-mile", "1 mile", 1.609344],
  ["AgeGrade.5k", "5k", "5 km", 5],
  ["AgeGrade.6k", "6k", "6 km", 6],
  ["AgeGrade.4mi", "4-mile", "4 miles", 6.437376],
  ["AgeGrade.8k", "8k", "8 km", 8],
  ["AgeGrade.5mi", "5-mile", "5 miles", 8.04672],
  ["AgeGrade.10k", "10k", "10 km", 10],
  ["AgeGrade.7mi", "7-mile", "7 miles", 11.265408],
  ["AgeGrade.12k", "12k", "12 km", 12],
  ["AgeGrade.15k", "15k", "15 km", 15],
  ["AgeGrade.10mi", "10-mile", "10 miles", 16.09344],
  ["AgeGrade.20k", "20k", "20 km", 20],
  ["AgeGrade.hm", "half", "Half marathon", 21.0975],
  ["AgeGrade.25k", "25k", "25 km", 25],
  ["AgeGrade.30k", "30k", "30 km", 30],
  ["AgeGrade.42k", "marathon", "Marathon", 42.195],
  ["AgeGrade.50k", "50k", "50 km", 50],
  ["AgeGrade.50mi", "50-mile", "50 miles", 80.4672],
  ["AgeGrade.100k", "100k", "100 km", 100],
  ["AgeGrade.150k", "150k", "150 km", 150],
  ["AgeGrade.100mi", "100-mile", "100 miles", 160.9344],
  ["AgeGrade.200k", "200k", "200 km", 200]
];

const roadEvents = [];
for (const [file, id, label, km] of roadSpec) {
  const p = path.join(filesDir, file);
  if (!fs.existsSync(p)) {
    console.warn("missing", file);
    continue;
  }
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
  const open = { M: 0, F: 0 };
  const factor = { M: {}, F: {} };
  for (const line of lines) {
    const openM = line.match(/^M\s+(\d+:\d+:\d+(?:\.\d+)?|\d+:\d+(?:\.\d+)?)\s*$/);
    const openF = line.match(/^F\s+(\d+:\d+:\d+(?:\.\d+)?|\d+:\d+(?:\.\d+)?)\s*$/);
    const fac = line.match(/^(M|F)\s+(\d+)\s+([\d.]+)/);
    if (openM) open.M = parseHms(openM[1]);
    else if (openF) open.F = parseHms(openF[1]);
    else if (fac) factor[fac[1]][Number(fac[2])] = Number(Number(fac[3]).toFixed(4));
  }
  roadEvents.push({ id, label, km, kind: "time", open, factor });
}

const { parseSheet } = parseXlsx(path.join(agDir, "Appendix-B_2023.xlsx"));
const femaleFac = parseSheet("sheet1.xml");
const maleFac = parseSheet("sheet2.xml");
const headers = femaleFac[1].slice(1);
const tfMap = {
  "60m": ["60m", "60m", "time"],
  "100m": ["100m", "100m", "time"],
  "200m": ["200m", "200m", "time"],
  "400m": ["400m", "400m", "time"],
  "800m": ["800m", "800m", "time"],
  "1000m": ["1000m", "1000m", "time"],
  "1500m": ["1500m", "1500m", "time"],
  Mile: ["mile", "Mile", "time"],
  "3000m": ["3000m", "3000m", "time"],
  "5000m": ["5000m", "5000m", "time"],
  "10000m": ["10000m", "10000m", "time"],
  "60mHurdles": ["60h", "60m hurdles", "time"],
  ShortHurdles: ["short-h", "Sprint hurdles", "time"],
  LongHurdles: ["long-h", "Long hurdles", "time"],
  SteepleChase: ["steeple", "Steeplechase", "time"],
  HighJump: ["hj", "High jump", "field"],
  PoleVault: ["pv", "Pole vault", "field"],
  LongJump: ["lj", "Long jump", "field"],
  TripleJump: ["tj", "Triple jump", "field"],
  ShotPut: ["sp", "Shot put", "field"],
  Discus: ["dt", "Discus", "field"],
  Hammer: ["ht", "Hammer", "field"],
  Javelin: ["jt", "Javelin", "field"],
  Weight: ["wt", "Weight", "field"],
  "3000mRaceWalk": ["3000w", "3000m walk", "time"],
  "5000mRaceWalk": ["5000w", "5000m walk", "time"],
  "10kRaceWalk": ["10kw", "10 km walk", "time"],
  "20kRaceWalk": ["20kw", "20 km walk", "time"],
  HalfMarathon: ["tf-half", "Half marathon (track tables)", "time"],
  Marathon: ["tf-marathon", "Marathon (track tables)", "time"]
};

const stdParse = parseXlsx(path.join(agDir, "WMAAgeGradingCalculator-2023-v3.xlsx"));
const stdRows = stdParse.parseSheet("sheet4.xml");
const openStd = { M: {}, F: {} };
const stdKey = {
  "60m": "60m",
  "100m": "100m",
  "200m": "200m",
  "400m": "400m",
  "800m": "800m",
  "1000m": "1000m",
  "1500m": "1500m",
  Mile: "Mile",
  "3000m": "3000m",
  "5000m": "5000m",
  "10000m": "10000m",
  HJ: "HighJump",
  PV: "PoleVault",
  LJ: "LongJump",
  TJ: "TripleJump",
  SP: "ShotPut",
  DT: "Discus",
  HT: "Hammer",
  JT: "Javelin",
  WT: "Weight",
  "60mH": "60mHurdles",
  SH: "ShortHurdles",
  LH: "LongHurdles",
  SC: "SteepleChase",
  "3000 Walk": "3000mRaceWalk",
  "5000 Walk": "5000mRaceWalk",
  "10K Walk": "10kRaceWalk",
  "20K Walk": "20kRaceWalk",
  "Half Marathon": "HalfMarathon",
  Marathon: "Marathon"
};
for (const r of stdRows.slice(1)) {
  const code = String(r[0] || "");
  const sex = code[0];
  const rest = code.slice(1);
  const header = stdKey[rest];
  if ((sex === "M" || sex === "F") && header) openStd[sex][header] = Number(r[2]);
}

const tfEvents = [];
headers.forEach((header, i) => {
  const meta = tfMap[header];
  if (!meta) return;
  const [id, label, kind] = meta;
  const factor = { M: {}, F: {} };
  function fill(sheet, sex) {
    for (let r = 2; r < sheet.length; r++) {
      const age = Number(sheet[r][0]);
      const fac = Number(sheet[r][i + 1]);
      if (Number.isFinite(age) && Number.isFinite(fac)) factor[sex][age] = Number(fac.toFixed(4));
    }
  }
  fill(maleFac, "M");
  fill(femaleFac, "F");
  tfEvents.push({
    id,
    label,
    kind,
    open: { M: openStd.M[header] || 0, F: openStd.F[header] || 0 },
    factor
  });
});

const data = {
  road: { year: 2025, source: "USATF MLDR 2025 (Alan Jones / Tom Bernhard)", events: roadEvents },
  tf: { year: 2023, source: "WMA 2023 age factors", events: tfEvents }
};

const dest = path.join(root, "data", "age-grade.json");
fs.writeFileSync(dest, JSON.stringify(data));
console.log("wrote", dest, fs.statSync(dest).size, "bytes");
console.log("road events", roadEvents.length, "tf events", tfEvents.length);
const five = roadEvents.find((e) => e.id === "5k");
console.log("5k open", five.open, "M60 factor", five.factor.M[60]);
const hundred = tfEvents.find((e) => e.id === "100m");
console.log("100m open", hundred.open, "M60 factor", hundred.factor.M[60]);
