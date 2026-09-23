#!/usr/bin/env node
/**
 * Re-extract dates from shipped report pages, sort newest first,
 * and rewrite the Reports listing. Does not crawl the live site.
 */
const fs = require("fs");
const path = require("path");
const {
  extractDate,
  formatDateLabel,
  fillMissingDates,
  sortByDateDesc,
  listingPage,
  stripTags
} = require("./import-news");

const ROOT = path.join(__dirname, "..");

function bodyTextFromPage(html) {
  const art = html.match(/<article class="report-body[\s\S]*?<\/article>/i);
  const chunk = art ? art[0] : html;
  return stripTags(chunk.replace(/<p class="report-back"[\s\S]*$/i, ""));
}

function excerptFromPage(html, fallback) {
  const paras = [...html.matchAll(/<article[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  for (const p of paras) {
    const text = stripTags(p[1]);
    if (text.length < 40) continue;
    if (/all reports/i.test(text)) continue;
    return text.length > 180 ? text.slice(0, 177).replace(/\s+\S*$/, "") + "…" : text;
  }
  return fallback || "Club report from the Sevenoaks AC archive.";
}

function existingExcerpts() {
  const past = fs.readFileSync(path.join(ROOT, "past.html"), "utf8");
  const map = new Map();
  const re = /<a class="card" href="([^"]+)"[\s\S]*?<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(past))) {
    map.set(m[1], stripTags(m[3]));
  }
  return map;
}

function patchReportLead(file, dateLabel) {
  let html = fs.readFileSync(file, "utf8");
  if (!/<p class="lead">/.test(html)) return;
  html = html.replace(
    /<p class="lead">[\s\S]*?<\/p>/,
    `<p class="lead">${dateLabel || "Club report"}</p>`
  );
  fs.writeFileSync(file, html);
}

function main() {
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "reports.json"), "utf8"));
  const excerpts = existingExcerpts();
  const articles = rows.map((row, order) => {
    const file = path.join(ROOT, String(row.href).replace(/\//g, path.sep));
    const html = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const text = html ? bodyTextFromPage(html) : "";
    let date = extractDate(row.title, text) || "";
    if (row.extra && /sevenoaks 7/i.test(row.title)) date = "2026-07-12";
    return {
      sourceUrl: row.sourceUrl,
      title: row.title,
      href: row.href,
      extra: !!row.extra,
      skipPage: !!row.extra,
      localImage: row.image,
      excerpt: excerpts.get(row.href) || excerptFromPage(html, ""),
      date,
      dateLabel: formatDateLabel(date),
      order
    };
  });

  function articleId(a) {
    const m = String(a.sourceUrl || a.href || "").match(/\/(\d{3,})/);
    return m ? Number(m[1]) : 0;
  }
  articles.sort((a, b) => articleId(b) - articleId(a) || a.order - b.order);
  articles.forEach((a, i) => {
    a.order = i;
  });
  fillMissingDates(articles);
  sortByDateDesc(articles);

  const recent = articles.slice(0, 6);
  const further = articles.slice(6);
  fs.writeFileSync(path.join(ROOT, "past.html"), listingPage(recent, further));

  const out = articles.map((a) => ({
    sourceUrl: a.sourceUrl,
    title: a.title,
    date: a.date || null,
    href: a.href,
    image: a.localImage,
    extra: !!a.extra
  }));
  fs.writeFileSync(path.join(ROOT, "data", "reports.json"), JSON.stringify(out, null, 2));

  for (const a of articles) {
    if (a.skipPage) continue;
    const file = path.join(ROOT, String(a.href).replace(/\//g, path.sep));
    if (fs.existsSync(file)) patchReportLead(file, a.dateLabel);
  }

  const undated = articles.filter((a) => !a.date).length;
  let inversions = 0;
  for (let i = 1; i < articles.length; i++) {
    if (articles[i - 1].date && articles[i].date && articles[i].date > articles[i - 1].date) {
      inversions++;
    }
  }
  console.log(
    `rebuild-listing: total=${articles.length} recent=${recent.length} further=${further.length} undated=${undated} inversions=${inversions}`
  );
  console.log("recent:");
  recent.forEach((a) => console.log(`  ${a.date}  ${a.title}`));
}

main();
