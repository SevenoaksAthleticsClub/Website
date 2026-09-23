#!/usr/bin/env node
/**
 * Structural tests for the shipped Reports listing and dedicated pages.
 * Does not hard-code article counts from the live site; completeness vs
 * the captured news inventory is checked when that file is present.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const listingPath = path.join(ROOT, "past.html");
const inventoryPath =
  process.env.NEWS_INVENTORY ||
  path.join(ROOT, "data", "news-inventory.json");
const reportsMapPath = path.join(ROOT, "data", "reports.json");

let failed = 0;
function pass(msg) {
  console.log("OK  " + msg);
}
function fail(msg) {
  failed += 1;
  console.error("FAIL  " + msg);
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html) {
  return decodeEntities(String(html || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function parseCards(html) {
  const cards = [];
  const re = /<a\b[^>]*class="[^"]*\bcard\b[^"]*"[^>]*>[\s\S]*?<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const open = tag.match(/^<a\b[^>]*>/i)[0];
    const href = (open.match(/\bhref="([^"]+)"/) || [])[1] || "";
    const sourceUrl = (open.match(/\bdata-source-url="([^"]+)"/) || [])[1] || "";
    const title = stripTags((tag.match(/<h3>([\s\S]*?)<\/h3>/i) || [])[1] || "");
    const date = (tag.match(/<time[^>]*datetime="([^"]+)"/) || [])[1] || "";
    cards.push({ href, sourceUrl: decodeEntities(sourceUrl), title, date, html: tag });
  }
  return cards;
}

function headingIndex(html, text) {
  const re = new RegExp(`<h2[^>]*>\\s*${text}\\s*</h2>`, "i");
  const m = html.match(re);
  return m ? m.index : -1;
}

if (!fs.existsSync(listingPath)) {
  fail("missing past.html listing");
  process.exit(1);
}

const listing = fs.readFileSync(listingPath, "utf8");

if (!/<html\b[^>]*\breports-pending\b/.test(listing)) {
  fail("past.html must hide recent cards until the sheet applies (html.reports-pending)");
} else {
  pass("past.html reports-pending until live order is ready");
}

const recentHead = headingIndex(listing, "Recent reports");
const furtherHead = headingIndex(listing, "Further back");
if (recentHead < 0) fail("listing missing heading 'Recent reports'");
else pass("heading Recent reports");
if (furtherHead < 0) fail("listing missing heading 'Further back'");
else pass("heading Further back");
if (recentHead >= 0 && furtherHead >= 0 && furtherHead <= recentHead) {
  fail("Further back heading must come after Recent reports");
} else if (recentHead >= 0 && furtherHead >= 0) {
  pass("Further back follows Recent reports");
}

const recentSlice = listing.slice(recentHead, furtherHead);
const furtherSlice = listing.slice(furtherHead);
const recentCards = parseCards(recentSlice);
const furtherCards = parseCards(furtherSlice);
const allCards = recentCards.concat(furtherCards);

if (recentCards.length !== 6) fail(`Recent reports must contain exactly 6 cards, found ${recentCards.length}`);
else pass("Recent reports has 6 cards");
if (furtherCards.length < 1) fail("Further back must contain at least 1 card");
else pass(`Further back has ${furtherCards.length} cards`);
if (allCards.length !== recentCards.length + furtherCards.length) {
  fail("card total mismatch");
} else {
  pass(`total cards ${allCards.length} = 6 + ${furtherCards.length}`);
}

let prevDate = "9999-99-99";
let dateOrderOk = true;
let dated = 0;
for (const card of allCards) {
  if (!card.date) {
    fail(`card '${card.title}' has no datetime`);
    dateOrderOk = false;
    continue;
  }
  dated++;
  if (card.date > prevDate) {
    fail(`out of date order: ${prevDate} then ${card.date} (${card.title})`);
    dateOrderOk = false;
  }
  prevDate = card.date;
}
if (dateOrderOk && dated === allCards.length) {
  pass(`cards newest-first (${dated} dated, first ${allCards[0].date}, last ${allCards[allCards.length - 1].date})`);
}

const requiredTitles = [
  /east peckham/i,
  /scvac/i,
  /north downs/i,
  /pauline dalton/i,
  /london marathon/i,
  /sevenoaks 7/i
];
for (const re of requiredTitles) {
  const hit = allCards.find((c) => re.test(c.title));
  if (!hit) fail(`missing required card matching ${re}`);
  else pass(`required card '${hit.title}' -> ${hit.href}`);
}

for (const card of allCards) {
  if (!card.href) {
    fail(`card '${card.title}' has no href`);
    continue;
  }
  if (/^https?:\/\//i.test(card.href) && !/^\.\.?\/|^[a-z0-9].*\.html/i.test(card.href)) {
    fail(`card '${card.title}' href is not same-origin: ${card.href}`);
    continue;
  }
  if (!/\.html(\?|#|$)/i.test(card.href) && !/^[a-z0-9/_.-]+\.html$/i.test(card.href)) {
    fail(`card '${card.title}' href is not a same-origin path: ${card.href}`);
  }
  const dest = path.join(ROOT, card.href.replace(/[?#].*$/, "").replace(/\//g, path.sep));
  if (!fs.existsSync(dest)) {
    fail(`href does not resolve in tree: ${card.href}`);
    continue;
  }
  const page = fs.readFileSync(dest, "utf8");
  const pageTitle = stripTags((page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "");
  const paras = [...page.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => stripTags(m[1]));
  const substantial = paras.filter((p) => p.length >= 40);
  if (!pageTitle) fail(`${card.href} missing title`);
  if (card.title && pageTitle && pageTitle.replace(/\.$/, "") !== card.title.replace(/\.$/, "") && !pageTitle.includes(card.title) && !card.title.includes(pageTitle.replace(/\.$/, ""))) {
    fail(`${card.href} title mismatch listing='${card.title}' page='${pageTitle}'`);
  }
  if (substantial.length < 1) fail(`${card.href} has no substantial body paragraph`);
}

if (failed === 0) pass("every card links to a page with title and body");

const reportsDir = path.join(ROOT, "reports");
const reportFiles = fs.existsSync(reportsDir)
  ? fs.readdirSync(reportsDir).filter((f) => f.endsWith(".html"))
  : [];
let mixed = 0;
let mixedSample = "";
for (const file of reportFiles) {
  const html = fs.readFileSync(path.join(reportsDir, file), "utf8");
  const art = (html.match(/<article class="report-body[\s\S]*?<\/article>/i) || [""])[0];
  for (const m of art.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)) {
    if (/\breport-back\b/.test(m[1] || "")) continue;
    const inner = m[2];
    if (!/<img\b/i.test(inner)) continue;
    const text = stripTags(inner.replace(/<img\b[^>]*>/gi, " "));
    if (text.length > 20) {
      mixed += 1;
      if (!mixedSample) mixedSample = file;
    }
  }
}
if (mixed) fail(`${mixed} report paragraphs still mix photos with story text (e.g. ${mixedSample})`);
else pass(`report photos pulled out of story text (${reportFiles.length} pages)`);

const northDownsPath = path.join(reportsDir, "1562-north-downs-run-2026.html");
if (fs.existsSync(northDownsPath)) {
  const nd = fs.readFileSync(northDownsPath, "utf8");
  const galleryImgs = (nd.match(/<div class="report-gallery">([\s\S]*?)<\/div>/) || ["", ""])[1].match(/<img\b/gi) || [];
  if (galleryImgs.length !== 3) fail(`North Downs 2026 gallery should have 3 photos, found ${galleryImgs.length}`);
  else pass("North Downs 2026 has a 3-photo gallery");
  if (/<p>[^<]*<img\b/i.test(nd) && /<p>[\s\S]*<img[\s\S]{0,200}North Downs/i.test(nd)) {
    fail("North Downs 2026 still inlines photos in the opening paragraph");
  } else {
    pass("North Downs 2026 story starts as text, not full-width photos");
  }
} else {
  fail("missing reports/1562-north-downs-run-2026.html");
}

if (fs.existsSync(inventoryPath) && fs.existsSync(reportsMapPath)) {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  const reports = JSON.parse(fs.readFileSync(reportsMapPath, "utf8"));
  const byUrl = new Map(reports.map((r) => [r.sourceUrl, r]));
  const byTitle = new Map(reports.map((r) => [r.title.trim().toLowerCase(), r]));
  const missing = [];
  for (const item of inventory) {
    const hit =
      byUrl.get(item.sourceUrl) ||
      byTitle.get(String(item.title || "").trim().toLowerCase());
    if (!hit) {
      missing.push(item);
      continue;
    }
    const dest = path.join(ROOT, String(hit.href).replace(/\//g, path.sep));
    if (!fs.existsSync(dest)) missing.push({ ...item, reason: "file missing " + hit.href });
  }
  console.log(`LIVE_COUNT ${inventory.length}`);
  console.log(`LOCAL_COUNT ${reports.filter((r) => !r.extra).length}`);
  if (missing.length) {
    fail(`coverage missing ${missing.length} live articles`);
    missing.slice(0, 20).forEach((m) => console.error("  missing", m.sourceUrl, m.title));
  } else {
    pass(`coverage ${inventory.length}/${inventory.length}`);
  }
} else {
  console.log("SKIP coverage (inventory or reports.json not found)");
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll reports tests passed");
