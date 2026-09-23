#!/usr/bin/env node
/**
 * Pull inline Joomla photos out of report paragraphs into galleries,
 * drop a lone hero duplicate, and tidy dangling links / table photo-links.
 */
const fs = require("fs");
const path = require("path");

const IMG_UNIT = /(?:<a\b[^>]*>\s*)?<img\b[^>]*>\s*(?:<\/a>)?/gi;
const BLOCK =
  /<(p|figure|h2|h3|h4|blockquote|ul|ol)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

function fileName(src) {
  return String(src || "")
    .split("?")[0]
    .split("#")[0]
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .toLowerCase();
}

function srcOf(html) {
  const m = String(html || "").match(/\bsrc=["']([^"']+)["']/i);
  return m ? m[1] : "";
}

function closeDanglingAnchors(html) {
  let s = String(html || "");
  const opens = (s.match(/<a\b/gi) || []).length;
  const closes = (s.match(/<\/a>/gi) || []).length;
  if (opens > closes) s += "</a>".repeat(opens - closes);
  return s;
}

function tidyText(html) {
  let s = closeDanglingAnchors(String(html || ""));
  s = s.replace(/^(?:<br\s*\/?>|\s)+/gi, "");
  s = s.replace(/(?:<br\s*\/?>|\s)+$/gi, "");
  s = s.replace(/^(?:&nbsp;|\s)+|(?:&nbsp;|\s)+$/gi, "").trim();
  s = s.replace(/<a ([^>]+)>here\.<\/a>/gi, "<a $1>here</a>.");
  return s;
}

function unwrapTableImageLinks(html) {
  return String(html || "").replace(
    /<a\b[^>]*href=["'][^"']+\.(?:jpe?g|png|gif|webp)(?:\?[^"']*)?["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, inner) => {
      if (/<img\b/i.test(inner)) return inner;
      return inner;
    }
  );
}

function splitParagraph(inner) {
  const parts = [];
  let last = 0;
  String(inner || "").replace(IMG_UNIT, (match, offset) => {
    if (offset > last) parts.push({ kind: "html", html: inner.slice(last, offset) });
    parts.push({ kind: "img", html: match });
    last = offset + match.length;
    return match;
  });
  if (last < inner.length) parts.push({ kind: "html", html: inner.slice(last) });
  return parts;
}

function photoBlock(imgs) {
  if (imgs.length === 1) {
    return { kind: "photo", imgs };
  }
  return { kind: "gallery", imgs };
}

function blocksFromParagraph(inner) {
  const parts = splitParagraph(inner);
  const out = [];
  let imgs = [];
  function flushImgs() {
    if (!imgs.length) return;
    out.push(photoBlock(imgs));
    imgs = [];
  }
  for (const part of parts) {
    if (part.kind === "img") {
      imgs.push(part.html.trim());
      continue;
    }
    const text = tidyText(part.html);
    if (!text) continue;
    flushImgs();
    out.push({ kind: "html", html: `<p>${text}</p>` });
  }
  flushImgs();
  return out;
}

function mergeMedia(blocks) {
  const out = [];
  for (const block of blocks) {
    const prev = out[out.length - 1];
    const media = block.kind === "photo" || block.kind === "gallery";
    const prevMedia = prev && (prev.kind === "photo" || prev.kind === "gallery");
    if (media && prevMedia) {
      prev.imgs = prev.imgs.concat(block.imgs);
      prev.kind = prev.imgs.length > 1 ? "gallery" : "photo";
      continue;
    }
    out.push(block);
  }
  return out;
}

function dropHeroDuplicate(blocks, heroSrc) {
  const hero = fileName(heroSrc);
  if (!hero || !blocks.length) return blocks;
  const first = blocks[0];
  if (first.kind !== "photo") return blocks;
  if (fileName(srcOf(first.imgs[0])) !== hero) return blocks;
  return blocks.slice(1);
}

function renderBlock(block) {
  if (block.kind === "gallery") {
    return `<div class="report-gallery">${block.imgs.join("")}</div>`;
  }
  if (block.kind === "photo") {
    return `<figure class="report-photo">${block.imgs[0]}</figure>`;
  }
  return block.html;
}

function normalizeReportBody(html, heroSrc) {
  const source = String(html || "").trim();
  if (!source) return "";
  const blocks = [];
  let last = 0;
  String(source).replace(BLOCK, (full, tag, attrs, inner, offset) => {
    if (offset > last) {
      const gap = source.slice(last, offset).trim();
      if (gap) blocks.push({ kind: "html", html: gap });
    }
    last = offset + full.length;
    const attr = String(attrs || "");
    if (/\breport-back\b/.test(attr)) {
      blocks.push({ kind: "html", html: full });
      return full;
    }
    if (tag === "p") {
      blocks.push(...blocksFromParagraph(inner));
      return full;
    }
    if (tag === "figure") {
      blocks.push({
        kind: "html",
        html: `<figure${attr}>${unwrapTableImageLinks(inner)}</figure>`
      });
      return full;
    }
    blocks.push({ kind: "html", html: full });
    return full;
  });
  if (last < source.length) {
    const gap = source.slice(last).trim();
    if (gap) blocks.push({ kind: "html", html: gap });
  }
  if (!blocks.length) {
    blocks.push(...blocksFromParagraph(source));
  }
  return mergeMedia(dropHeroDuplicate(blocks, heroSrc))
    .map(renderBlock)
    .join("\n          ");
}

function rewriteReportPage(html) {
  const hero = (html.match(/<img class="hero-bg[^>]*\bsrc=["']([^"']+)["']/i) || [])[1] || "";
  if (!/<article class="report-body/i.test(html)) return html;
  return html.replace(
    /<article class="report-body prose">([\s\S]*?)<\/article>/i,
    (_, inner) => {
      const backMatch = inner.match(/<p class="report-back"[\s\S]*?<\/p>\s*$/i);
      const body = inner.replace(/<p class="report-back"[\s\S]*$/i, "").trim();
      const next = normalizeReportBody(body, hero);
      const back = backMatch
        ? backMatch[0].trim()
        : `<p class="report-back"><a class="link-more" href="../past.html">← All reports</a></p>`;
      return `<article class="report-body prose">\n          ${next}\n          ${back}\n        </article>`;
    }
  );
}

function rewriteAll(root) {
  const dir = path.join(root, "reports");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html"));
  let changed = 0;
  for (const file of files) {
    const dest = path.join(dir, file);
    const before = fs.readFileSync(dest, "utf8");
    const after = rewriteReportPage(before);
    if (after !== before) {
      fs.writeFileSync(dest, after);
      changed += 1;
    }
  }
  return { files: files.length, changed };
}

module.exports = {
  normalizeReportBody,
  rewriteReportPage,
  rewriteAll,
  fileName,
  srcOf
};

if (require.main === module) {
  const root = path.join(__dirname, "..");
  const result = rewriteAll(root);
  console.log(`normalized ${result.changed}/${result.files} report pages`);
}
