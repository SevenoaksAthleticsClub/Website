#!/usr/bin/env node
/**
 * Crawl https://www.7oaks-ac.org.uk/news (every pager URL) and generate
 * the Reports archive: inventory, card images, dedicated pages, listing.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCRATCH =
  process.env.SCRATCH ||
  "C:\\Users\\Rob\\AppData\\Local\\Temp\\grok-goal-e974a1cef3fa\\implementer";
const BASE = "https://www.7oaks-ac.org.uk";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const SKIP_IMG = /fbLogo|strava|twitterLogo|Instagram|50thMashead|joomla-favicon/i;
const FALLBACK_IMAGE = "images/hero-knole.jpg";
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
  december: "12"
};
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const { normalizeReportBody } = require("./normalize-report-body");

const EXCERPTS = {
  "1571-sac-at-east-peckham-10k-2026":
    "Seven SAC runners, four category wins on a hot afternoon.",
  "1570-scvac-t-f-2026": "Men’s team second — strongest league finish in years.",
  "1562-north-downs-run-2026": "Club group on the 30k trail along the ridge.",
  "1560-pauline-dalton-trophy-handicap-2026":
    "Inaugural 3k handicap for juniors and seniors, in Pauline’s memory.",
  "1549-sac-at-london-marathon-2026":
    "SAC vests from The Mall to Birdcage Walk.",
  sevenoaks7: "164 runners through Knole Park, plus the free junior 3.5k."
};

function log(line) {
  const stamp = new Date().toISOString();
  const msg = `[${stamp}] ${line}\n`;
  fs.appendFileSync(path.join(SCRATCH, "news-crawl.log"), msg);
  process.stdout.write(msg);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripTags(html) {
  return decodeEntities(String(html || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function absUrl(src) {
  if (!src) return "";
  src = decodeEntities(src).trim();
  if (/^https?:\/\//i.test(src)) return src.replace(/^http:\/\//i, "https://");
  if (src.startsWith("//")) return "https:" + src;
  if (src.startsWith("/")) return BASE + src;
  return BASE + "/" + src;
}

function slugFromUrl(url) {
  const u = url.replace(/\/$/, "");
  const m = u.match(/\/news\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : "";
}

function idFromSlug(slug) {
  const m = String(slug).match(/^(\d+)/);
  return m ? m[1] : slug.replace(/[^a-z0-9]+/gi, "-");
}

function extOf(url) {
  const clean = url.split("?")[0].split("#")[0];
  const ext = path.extname(clean).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) return ext;
  return ".jpg";
}

function isUsefulImage(src) {
  if (!src) return false;
  if (SKIP_IMG.test(src)) return false;
  if (/\.svg($|\?)/i.test(src)) return false;
  return /\/images\//i.test(src) || /^https?:\/\//i.test(src);
}

function firstImage(html) {
  const re = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (isUsefulImage(m[1])) return absUrl(m[1]);
  }
  return "";
}

const MONTH_RE =
  "January|February|March|April|May|June|July|August|September|October|November|December";

function toIso(day, monthName, year) {
  const mo = MONTHS[String(monthName).toLowerCase()];
  if (!mo || !year) return "";
  const d = Number(day);
  if (!d || d < 1 || d > 31) return "";
  const y = Number(year);
  if (y < 1990 || y > 2035) return "";
  return `${y}-${mo}-${String(d).padStart(2, "0")}`;
}

function seasonYear(title, monthNum) {
  const season = String(title).match(/\b(20\d{2})\s*[\/–-]\s*(?:20)?(\d{2})\b/);
  if (!season) return null;
  const start = Number(season[1]);
  const endTwo = Number(season[2]);
  const end = endTwo < 100 ? Math.floor(start / 100) * 100 + endTwo : endTwo;
  return monthNum >= 8 ? start : end;
}

function contextAround(text, index, len) {
  const from = Math.max(0, index - 70);
  const to = Math.min(text.length, index + len + 70);
  return text.slice(from, to);
}

function extractDate(title, bodyText) {
  const titleText = String(title || "");
  const body = String(bodyText || "");
  const head = body.slice(0, 1400);
  const skip = /passed away|who died|born on|next meeting|next race|next edition|entries close|closing date|deadline|will take place on|upcoming/i;

  const hits = [];
  function add(iso, index, haystack, weight) {
    if (!iso) return;
    const ctx = contextAround(haystack, index, 20);
    if (skip.test(ctx)) return;
    hits.push({ iso, index, weight });
  }

  const reDayMonthYear = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\s+(20\\d{2})\\b`,
    "gi"
  );
  const reMonthDayYear = new RegExp(
    `\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`,
    "gi"
  );
  let m;
  while ((m = reDayMonthYear.exec(titleText))) {
    add(toIso(m[1], m[2], m[3]), m.index, titleText, 100);
  }
  while ((m = reMonthDayYear.exec(titleText))) {
    add(toIso(m[2], m[1], m[3]), m.index, titleText, 100);
  }
  while ((m = reDayMonthYear.exec(head))) {
    add(toIso(m[1], m[2], m[3]), m.index, head, 40);
  }
  while ((m = reMonthDayYear.exec(head))) {
    add(toIso(m[2], m[1], m[3]), m.index, head, 40);
  }
  if (hits.length) {
    hits.sort((a, b) => b.weight - a.weight || a.index - b.index);
    return hits[0].iso;
  }

  const titleMY = titleText.match(new RegExp(`\\b(${MONTH_RE})\\s+(20\\d{2})\\b`, "i"));
  if (titleMY) {
    const month = titleMY[1];
    const year = titleMY[2];
    const dayA = head.match(
      new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${month}\\b`, "i")
    );
    const dayB = head.match(
      new RegExp(`\\b${month}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i")
    );
    const day = (dayA && dayA[1]) || (dayB && dayB[1]) || "15";
    return toIso(day, month, year);
  }

  const loose = [];
  const reDM = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\b`, "gi");
  const reMD = new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "gi");
  while ((m = reDM.exec(head))) {
    loose.push({ day: m[1], month: m[2], index: m.index });
  }
  while ((m = reMD.exec(head))) {
    loose.push({ day: m[2], month: m[1], index: m.index });
  }
  loose.sort((a, b) => a.index - b.index);
  for (const hit of loose) {
    if (skip.test(contextAround(head, hit.index, 24))) continue;
    const monthNum = Number(MONTHS[hit.month.toLowerCase()]);
    const season = seasonYear(titleText, monthNum);
    const nearby = contextAround(head, hit.index, 24);
    const nearYear = [...nearby.matchAll(/\b(20\d{2})\b/g)].map((x) => Number(x[1]))[0];
    const yearBlob = `${titleText} ${head.slice(0, 400)}`;
    const years = [...yearBlob.matchAll(/\b(20\d{2})\b/g)].map((x) => Number(x[1]));
    const year = season || nearYear || years[0];
    if (year) return toIso(hit.day, hit.month, year);
  }

  return "";
}

function fillMissingDates(articles) {
  for (let i = 0; i < articles.length; i++) {
    if (articles[i].date) continue;
    let prev = null;
    let next = null;
    for (let j = i - 1; j >= 0; j--) {
      if (articles[j].date) {
        prev = articles[j].date;
        break;
      }
    }
    for (let j = i + 1; j < articles.length; j++) {
      if (articles[j].date) {
        next = articles[j].date;
        break;
      }
    }
    if (prev && next) {
      const p = Date.parse(prev + "T12:00:00");
      const n = Date.parse(next + "T12:00:00");
      articles[i].date = new Date((p + n) / 2).toISOString().slice(0, 10);
    } else {
      articles[i].date = prev || next || "";
    }
    if (articles[i].date) articles[i].dateLabel = formatDateLabel(articles[i].date);
  }
}

function sortByDateDesc(articles) {
  articles.forEach((a, i) => {
    if (a.order == null) a.order = i;
  });
  articles.sort((a, b) => {
    const dd = String(b.date || "").localeCompare(String(a.date || ""));
    if (dd) return dd;
    return (a.order || 0) - (b.order || 0);
  });
}

function formatDateLabel(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

function excerptFrom(slug, bodyHtml) {
  if (EXCERPTS[slug]) return EXCERPTS[slug];
  const text = stripTags(bodyHtml);
  if (!text) return "Club report from the Sevenoaks AC archive.";
  const cut = text.length > 180 ? text.slice(0, 177).replace(/\s+\S*$/, "") + "…" : text;
  return cut;
}

function extractArticleBody(html) {
  const marker = "com-content-article__body";
  const idx = html.indexOf(marker);
  if (idx < 0) return "";
  let rest = html.slice(idx + marker.length).replace(/^"\s*>/, "");
  const end = rest.search(/<\/main>/i);
  if (end >= 0) rest = rest.slice(0, end);
  rest = rest.replace(/(<\/div>\s*)+$/i, "").trim();
  return rest;
}

function extractBlogItems(html) {
  const parts = html.split("com-content-category-blog__item blog-item");
  const items = [];
  for (let i = 1; i < parts.length; i++) {
    let chunk = parts[i];
    chunk = chunk.split("com-content-blog__links")[0];
    chunk = chunk.split("com-content-category-blog__navigation")[0];
    const link = chunk.match(/<h2>\s*<a href="(\/news\/[^"]+)">([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const href = link[1].trim();
    const title = stripTags(link[2]);
    const headerEnd = chunk.search(/<\/div>\s*<\/div>/);
    let body = chunk;
    const itemContent = chunk.match(
      /<div class="item-content">([\s\S]*)$/i
    );
    if (itemContent) {
      body = itemContent[1];
      const header = body.match(/<div class="page-header">[\s\S]*?<\/div>/i);
      if (header) body = body.slice(header.index + header[0].length);
      const close = body.lastIndexOf("</div>");
      if (close > 0) body = body.slice(0, close);
    } else if (headerEnd > 0) {
      body = chunk.slice(headerEnd);
    }
    body = body.replace(/^\s*/, "");
    items.push({
      path: href,
      sourceUrl: absUrl(href),
      title,
      bodyHtml: body.trim(),
      imageUrl: firstImage(body) || firstImage(chunk)
    });
  }
  return items;
}

function parseLastStart(html) {
  const last = html.match(/Go to last page[^>]*href="\/news\?start=(\d+)"/i) ||
    html.match(/href="\/news\?start=(\d+)"[^>]*>[\s\S]*?last page/i) ||
    html.match(/href="\/news\?start=(\d+)" class="page-link">\s*<span class="icon-angle-double-right"/i);
  if (last) return Number(last[1]);
  const counter = html.match(/Page\s+1\s+of\s+(\d+)/i);
  if (counter) return (Number(counter[1]) - 1) * 4;
  throw new Error("Could not parse last listing page offset");
}

async function fetchText(url) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
        redirect: "follow"
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      log(`retry ${attempt} ${url} ${err.message}`);
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw lastErr;
}

async function fetchBuffer(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "image/*,*/*;q=0.8" },
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 80) throw new Error(`tiny image ${buf.length}b`);
  return buf;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

function sanitizeBody(html, imageMap, rootPrefix) {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<\/?joomla-[\w-]+[^>]*>/gi, "");
  s = s.replace(/This email address is being protected from spambots\.[^<]*/gi, "");
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "");
  s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, (m) => {
    const src = (m.match(/\bsrc=["']([^"']+)["']/i) || [])[1];
    if (!src) return "";
    return `<p>This report originally embedded another page. <a href="${escapeHtml(
      absUrl(src)
    )}">Open the original archive</a>.</p>`;
  });
  s = s.replace(/<\/?center>/gi, "");
  s = s.replace(/<\/?font[^>]*>/gi, "");
  s = s.replace(/<\/?span\b[^>]*>/gi, "");
  s = s.replace(/<\/?section\b[^>]*>/gi, "");
  s = s.replace(/<sup\b[^>]*>/gi, "");
  s = s.replace(/<\/sup>/gi, "");
  s = s.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = (tag.match(/\bsrc=["']([^"']+)["']/i) || [])[1];
    const alt = stripTags((tag.match(/\balt=["']([^"']*)["']/i) || [])[1] || "");
    if (!src || !isUsefulImage(src)) return "";
    const abs = absUrl(src);
    const local = imageMap.get(abs);
    if (!local) return "";
    return `<img src="${rootPrefix}${local}" alt="${escapeHtml(alt)}">`;
  });
  s = s.replace(/<a\b([^>]*)>/gi, (full, attrs) => {
    const href = decodeEntities((attrs.match(/\bhref=["']([^"']+)["']/i) || [])[1] || "");
    if (!href) return "<a>";
    if (/^mailto:/i.test(href) || /^https?:\/\//i.test(href)) {
      return `<a href="${escapeHtml(href)}">`;
    }
    if (/\/news\//i.test(href)) {
      const slug = slugFromUrl(href.startsWith("http") ? href : absUrl(href));
      if (slug) return `<a href="${rootPrefix}reports/${escapeHtml(slug)}.html">`;
    }
    if (/\/images\//i.test(href)) {
      const abs = absUrl(href);
      const local = imageMap.get(abs);
      if (local) return `<a href="${rootPrefix}${local}">`;
      return "<span>";
    }
    if (href.startsWith("#")) return `<a href="${escapeHtml(href)}">`;
    return `<a href="${escapeHtml(absUrl(href))}">`;
  });
  s = s.replace(/<span>/g, "");
  s = s.replace(/<\/span>/g, "");
  s = s.replace(/<p>\s*<a[^>]*>\s*Read more:[\s\S]*?<\/a>\s*<\/p>/gi, "");
  s = s.replace(/<a[^>]*>\s*Read more:[\s\S]*?<\/a>/gi, "");
  s = s.replace(
    /<(p|h1|h2|h3|h4|li|td|th|thead|tbody|tr|blockquote)\b([^>]*)>/gi,
    (_, tag) => `<${tag}>`
  );
  s = s.replace(/<div\b[^>]*>/gi, "<p>");
  s = s.replace(/<\/div>/gi, "</p>");
  s = s.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    const clean = table.replace(
      /\s(?:class|style|width|height|data-[\w-]+|border|cellpadding|cellspacing|align|valign)="[^"]*"/gi,
      ""
    );
    return `<figure class="table-wrap">${clean}</figure>`;
  });
  s = s.replace(/<p>\s*<p>/gi, "<p>");
  s = s.replace(/<\/p>\s*<\/p>/gi, "</p>");
  s = s.replace(/<p>\s*<\/p>/gi, "");
  s = s.replace(/<\/a>/g, (m, offset, str) => {
    const before = str.slice(0, offset);
    const opens = (before.match(/<a\b/gi) || []).length;
    const closes = (before.match(/<\/a>/gi) || []).length;
    return opens > closes ? "</a>" : "";
  });
  s = s.replace(/(?:\s|&nbsp;)+/g, " ");
  s = s.replace(/> </g, "><");
  s = s.replace(/<\/p>\s*<\/p>/g, "</p>");
  s = s.trim();
  const text = stripTags(s);
  if (!/<p[\s>]/i.test(s) && text.length > 0) {
    s = `<p>${s}</p>`;
  }
  if (text.length < 40) {
    s += `<p>${escapeHtml(text || "A club report from the Sevenoaks AC news archive.")}</p>`;
  }
  if (!stripTags(s)) {
    s = "<p>A club report from the Sevenoaks AC news archive.</p>";
  }
  return s;
}

function lightRephrase(body, title) {
  // Keep names, times and tables; tidy the lead so it does not read as a raw paste.
  return body.replace(/<p>([\s\S]*?)<\/p>/i, (full, inner) => {
    let t = inner.trim();
    t = t.replace(/^The full Sevenoaks AC results were as follows:?\s*/i, "");
    if (/^Seven SAC runners contested/i.test(stripTags(t))) {
      t = t.replace(
        /^Seven SAC runners contested the eighth running of the East Peckham 10k near Paddock Wood on 2nd August with four of them finishing first in their categories\./i,
        "Seven club runners lined up at the eighth East Peckham 10k near Paddock Wood on 2 August, and four of them won their categories."
      );
    }
    t = t.replace(/\bon (\d{1,2})(?:st|nd|rd|th) /gi, "on $1 ");
    t = t.replace(/\s+/g, " ");
    return `<p>${t}</p>`;
  });
}

function cardHtml(article, rootPrefix, lazy) {
  const href = article.href;
  const img = article.localImage || FALLBACK_IMAGE;
  const date = article.dateLabel
    ? `<time datetime="${escapeHtml(article.date)}">${escapeHtml(article.dateLabel)}</time>`
    : article.date
      ? `<time datetime="${escapeHtml(article.date)}">${escapeHtml(article.date)}</time>`
      : `<time>Archive</time>`;
  const lazyAttr = lazy ? ` loading="lazy"` : "";
  return `<a class="card" href="${escapeHtml(href)}" data-source-url="${escapeHtml(
    article.sourceUrl
  )}">
            <img src="${rootPrefix}${img}" alt="${escapeHtml(article.title)}"${lazyAttr}>
            <div class="card-body">
              ${date}
              <h3>${escapeHtml(article.title)}</h3>
              <p>${escapeHtml(article.excerpt)}</p>
            </div>
          </a>`;
}

function reportPage(article) {
  const root = "../";
  const img = article.localImage || FALLBACK_IMAGE;
  const dateLine = article.dateLabel || "Club report";
  const body = normalizeReportBody(lightRephrase(article.bodyClean, article.title), img);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(article.title)} · Sevenoaks Athletics Club</title>
  <meta name="description" content="${escapeHtml(article.excerpt)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/styles.css">
</head>
<body data-page="past" data-root="../">
  <!-- source: ${escapeHtml(article.sourceUrl)} -->
  <a class="skip" href="#main">Skip to content</a>
  <div data-header></div>

  <header class="hero page-hero">
    <img class="hero-bg" src="${root}${img}" alt="">
    <div class="wrap hero-copy">
      <span class="kicker">Club report</span>
      <h1>${escapeHtml(article.title)}</h1>
      <p class="lead">${escapeHtml(dateLine)}</p>
    </div>
  </header>

  <main id="main">
    <section>
      <div class="wrap">
        <article class="report-body prose">
          ${body}
          <p class="report-back"><a class="link-more" href="../past.html">← All reports</a></p>
        </article>
      </div>
    </section>
  </main>

  <div data-footer></div>
  <script src="../js/site.js"></script>
</body>
</html>
`;
}

function listingPage(recent, further) {
  const recentCards = recent.map((a) => cardHtml(a, "", false)).join("\n          ");
  const furtherCards = further.map((a) => cardHtml(a, "", true)).join("\n          ");
  return `<!DOCTYPE html>
<html lang="en" class="reports-pending">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reports · Sevenoaks Athletics Club</title>
  <meta name="description" content="Race reports and club news from Sevenoaks Athletics Club.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/styles.css">
  <noscript><style>html.reports-pending [data-report-group="recent"] { visibility: visible; }</style></noscript>
</head>
<body data-page="past">
  <a class="skip" href="#main">Skip to content</a>
  <div data-header></div>

  <header class="hero page-hero">
    <img class="hero-bg hero-bg-relay" src="images/relay.jpeg" alt="Sevenoaks AC members after a relay">
    <div class="wrap hero-copy">
      <span class="kicker">Club reports</span>
      <h1>Reports</h1>
      <p class="lead">Races, league matches and club days already run. For what’s coming, see the calendar.</p>
    </div>
  </header>

  <main id="main">
    <section>
      <div class="wrap">
        <div class="section-head">
          <div>
            <h2>Recent reports</h2>
            <p class="sub">The latest from the club.</p>
          </div>
          <a class="link-more" href="events.html">Club calendar →</a>
        </div>
        <div class="cards" data-report-group="recent">
          ${recentCards}
        </div>
      </div>
    </section>

    <section>
      <div class="wrap">
        <div class="section-head">
          <div>
            <h2>Further back</h2>
            <p class="sub">The rest of the news archive.</p>
          </div>
        </div>
        <div class="cards cards-compact" data-report-group="further">
          ${furtherCards}
        </div>
      </div>
    </section>
  </main>

  <div data-footer></div>
  <script src="js/site.js"></script>
  <script src="js/reports-feed.js"></script>
</body>
</html>
`;
}

function sevenoaks7Record() {
  return {
    extra: true,
    skipPage: true,
    sourceUrl: "https://www.7oaks-ac.org.uk/sevenoaks-7/1569-sevenoaks-7-2026-report",
    title: "Sevenoaks 7",
    slug: "sevenoaks-7",
    href: "sevenoaks-7.html",
    date: "2026-07-12",
    dateLabel: "12 July 2026",
    imageUrl: "",
    localImage: "images/s7-start.jpg",
    excerpt: EXCERPTS.sevenoaks7,
    bodyHtml: "",
    bodyClean: ""
  };
}

async function crawlListings() {
  ensureDir(path.join(SCRATCH, "listings"));
  log("Fetching news page 1");
  const firstCache = path.join(SCRATCH, "listings", "start-0.html");
  let firstHtml;
  if (fs.existsSync(firstCache) && fs.statSync(firstCache).size > 500) {
    firstHtml = fs.readFileSync(firstCache, "utf8");
    log("using cached news page 1");
  } else {
    firstHtml = await fetchText(BASE + "/news");
    fs.writeFileSync(firstCache, firstHtml);
  }
  const lastStart = parseLastStart(firstHtml);
  const pageCountMatch = firstHtml.match(/Page\s+1\s+of\s+(\d+)/i);
  log(`lastStart=${lastStart} pages=${pageCountMatch ? pageCountMatch[1] : "?"}`);

  const starts = [];
  for (let s = 0; s <= lastStart; s += 4) starts.push(s);

  const articles = [];
  const seen = new Set();

  function ingest(html, start) {
    const items = extractBlogItems(html);
    log(`start=${start} items=${items.length}`);
    for (const item of items) {
      if (seen.has(item.sourceUrl)) continue;
      seen.add(item.sourceUrl);
      const slug = slugFromUrl(item.sourceUrl);
      const text = stripTags(item.bodyHtml);
      const date = extractDate(item.title, text);
      articles.push({
        extra: false,
        skipPage: false,
        sourceUrl: item.sourceUrl,
        title: item.title,
        slug,
        href: `reports/${slug}.html`,
        date,
        dateLabel: formatDateLabel(date),
        imageUrl: item.imageUrl || "",
        localImage: "",
        excerpt: excerptFrom(slug, item.bodyHtml),
        bodyHtml: item.bodyHtml,
        bodyClean: "",
        order: articles.length
      });
    }
  }

  ingest(firstHtml, 0);

  await pool(
    starts.filter((s) => s !== 0),
    4,
    async (start) => {
      const url = `${BASE}/news?start=${start}`;
      const cache = path.join(SCRATCH, "listings", `start-${start}.html`);
      let html;
      if (fs.existsSync(cache) && fs.statSync(cache).size > 500) {
        html = fs.readFileSync(cache, "utf8");
      } else {
        html = await fetchText(url);
        fs.writeFileSync(cache, html);
      }
      return { start, html };
    }
  ).then((pages) => {
    pages.sort((a, b) => a.start - b.start);
    for (const p of pages) ingest(p.html, p.start);
  });

  return articles;
}

async function downloadImages(articles) {
  ensureDir(path.join(ROOT, "images", "reports"));
  const imageMap = new Map();
  const jobs = [];
  for (const a of articles) {
    if (a.skipPage) continue;
    const urls = new Set();
    if (a.imageUrl) urls.add(a.imageUrl);
    const re = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(a.bodyHtml))) {
      if (isUsefulImage(m[1])) urls.add(absUrl(m[1]));
    }
    a.imageUrls = [...urls];
    for (const url of a.imageUrls) {
      jobs.push({ article: a, url });
    }
  }

  const seenFile = new Set();
  await pool(jobs, 6, async (job) => {
    const { url, article } = job;
    if (imageMap.has(url)) return;
    const id = idFromSlug(article.slug);
    const base = path.basename(url.split("?")[0]);
    let file = `images/reports/${id}-${base.replace(/[^\w.-]+/g, "_")}`;
    if (!path.extname(file)) file += extOf(url);
    let dest = path.join(ROOT, file.replace(/\//g, path.sep));
    let n = 1;
    while (seenFile.has(file) && imageMap.get(url) !== file) {
      file = `images/reports/${id}-${n}-${base.replace(/[^\w.-]+/g, "_")}`;
      dest = path.join(ROOT, file.replace(/\//g, path.sep));
      n++;
    }
    try {
      if (!fs.existsSync(dest) || fs.statSync(dest).size < 80) {
        const buf = await fetchBuffer(url);
        ensureDir(path.dirname(dest));
        fs.writeFileSync(dest, buf);
      }
      seenFile.add(file);
      imageMap.set(url, file.replace(/\\/g, "/"));
    } catch (err) {
      log(`image fail ${url} ${err.message}`);
    }
  });

  for (const a of articles) {
    if (a.localImage) continue;
    if (a.imageUrl && imageMap.get(a.imageUrl)) {
      a.localImage = imageMap.get(a.imageUrl);
    } else if (a.imageUrls) {
      for (const u of a.imageUrls) {
        if (imageMap.get(u)) {
          a.localImage = imageMap.get(u);
          break;
        }
      }
    }
    if (!a.localImage) a.localImage = FALLBACK_IMAGE;
  }
  return imageMap;
}

function writeInventory(newsArticles) {
  const inventory = newsArticles.map((a) => ({
    sourceUrl: a.sourceUrl,
    title: a.title,
    date: a.date || null,
    imageUrl: a.imageUrl || null
  }));
  const destScratch = path.join(SCRATCH, "news-inventory.json");
  fs.writeFileSync(destScratch, JSON.stringify(inventory, null, 2));
  fs.writeFileSync(path.join(ROOT, "data", "news-inventory.json"), JSON.stringify(inventory, null, 2));
  log(`inventory ${inventory.length} -> ${destScratch}`);
  return inventory;
}

function writeReportsJson(all) {
  const rows = all.map((a) => ({
    sourceUrl: a.sourceUrl,
    title: a.title,
    date: a.date || null,
    href: a.href,
    image: a.localImage,
    extra: !!a.extra
  }));
  fs.writeFileSync(path.join(ROOT, "data", "reports.json"), JSON.stringify(rows, null, 2));
}

async function main() {
  ensureDir(SCRATCH);
  ensureDir(path.join(ROOT, "reports"));
  ensureDir(path.join(ROOT, "data"));
  fs.writeFileSync(path.join(SCRATCH, "news-crawl.log"), "");
  log("import-news start");

  const newsArticles = await crawlListings();
  log(`unique news articles ${newsArticles.length}`);
  if (newsArticles.length < 10) {
    throw new Error(`Too few articles (${newsArticles.length}); aborting`);
  }
  writeInventory(newsArticles);

  const truncated = newsArticles.filter(
    (a) => /read more/i.test(a.bodyHtml) || stripTags(a.bodyHtml).length < 80
  );
  log(`fetching full article pages for ${truncated.length} truncated items`);
  ensureDir(path.join(SCRATCH, "articles"));
  await pool(truncated, 4, async (a) => {
    const cache = path.join(SCRATCH, "articles", `${a.slug}.html`);
    try {
      let html;
      if (fs.existsSync(cache) && fs.statSync(cache).size > 400) {
        html = fs.readFileSync(cache, "utf8");
      } else {
        html = await fetchText(a.sourceUrl);
        fs.writeFileSync(cache, html);
      }
      const full = extractArticleBody(html);
      if (stripTags(full).length > stripTags(a.bodyHtml).length) {
        a.bodyHtml = full;
        if (!a.imageUrl) a.imageUrl = firstImage(full);
        a.excerpt = excerptFrom(a.slug, full);
        const date = extractDate(a.title, stripTags(full));
        if (date) {
          a.date = date;
          a.dateLabel = formatDateLabel(date);
        }
        log(`expanded ${a.slug}`);
      }
    } catch (err) {
      log(`article fetch fail ${a.slug} ${err.message}`);
    }
  });

  const all = newsArticles.slice();
  const s7 = sevenoaks7Record();
  const scvacIdx = all.findIndex((a) => /scvac/i.test(a.title));
  const insertAt = scvacIdx >= 0 ? scvacIdx + 1 : 2;
  all.splice(insertAt, 0, s7);

  const imageMap = await downloadImages(all);
  log(`images mapped ${imageMap.size}`);

  for (const a of all) {
    if (a.skipPage) continue;
    a.bodyClean = sanitizeBody(a.bodyHtml, imageMap, "../");
  }
  for (const a of all) {
    const text = stripTags(a.bodyClean || a.bodyHtml || "");
    const d = extractDate(a.title, text);
    if (d) {
      a.date = d;
      a.dateLabel = formatDateLabel(d);
    }
  }
  fillMissingDates(all);
  sortByDateDesc(all);
  for (const a of all) {
    if (a.skipPage) continue;
    const dest = path.join(ROOT, "reports", `${a.slug}.html`);
    fs.writeFileSync(dest, reportPage(a));
  }

  const recent = all.slice(0, 6);
  const further = all.slice(6);
  fs.writeFileSync(path.join(ROOT, "past.html"), listingPage(recent, further));
  writeReportsJson(all);
  log(`wrote listing recent=${recent.length} further=${further.length} total=${all.length}`);
  log("import-news done");
}

module.exports = {
  extractDate,
  formatDateLabel,
  fillMissingDates,
  sortByDateDesc,
  listingPage,
  cardHtml,
  stripTags,
  escapeHtml
};

if (require.main === module) {
  main().catch((err) => {
    log(`FAILED ${err.stack || err.message}`);
    console.error(err);
    process.exit(1);
  });
}
