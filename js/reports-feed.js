(function () {
  const feedEl = document.querySelector("[data-report-feed]");
  const listEl = document.querySelector("[data-live-reports]");
  const recentEl = document.querySelector("[data-report-group='recent']");
  const furtherEl = document.querySelector("[data-report-group='further']");
  const furtherHead = document.querySelector("[data-further-head]");
  const homeEl = document.querySelector("[data-home-reports]");
  const articleEl = document.querySelector("[data-live-report]");
  if (!listEl && !recentEl && !articleEl && !homeEl) return;

  const LATEST_COUNT = 6;
  const HOME_COUNT = 3;
  const settings = (feedEl && feedEl.dataset) || (articleEl && articleEl.dataset) || {};
  const sheetName = settings.sheet || "Reports";
  const viewPage = settings.view || "report.html";
  const backHref = settings.back || "past.html";
  const backLabel = settings.backLabel || "← All reports";

  const siteRoot = document.body.dataset.root || "";
  const SHEET_ID = "11e8-4Uf5cP1nP3oH8ztnmiRfSqsP3f0xBIBbmAOiwHQ";
  const CALLBACK = sheetName === "Reports" ? "sacReportsFromSheet" : "sacJuniorReportsFromSheet";
  const useDriveProxy = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

  function driveImageUrl(id) {
    const encoded = encodeURIComponent(id);
    // Local Node server can proxy Drive images. Static hosts need the public
    // thumbnail URL, and <img> must use referrerpolicy="no-referrer".
    if (useDriveProxy) return siteRoot + "api/drive-img?id=" + encoded;
    return "https://drive.google.com/thumbnail?id=" + encoded + "&sz=w1600";
  }

  function snapshotCards(scope) {
    if (!scope) return [];
    return Array.prototype.slice.call(scope.querySelectorAll("a.card")).map((el) => {
      const heading = el.querySelector("h3");
      return {
        date: (el.querySelector("time") && el.querySelector("time").getAttribute("datetime")) || "",
        slug: heading ? slug(heading.textContent) : "",
        el: el.cloneNode(true)
      };
    });
  }

  const homeArchive = snapshotCards(homeEl);

  function slug(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function cellValue(cell) {
    if (!cell) return "";
    if (cell.v == null) return cell.f ? String(cell.f) : "";
    if (typeof cell.v === "string" && cell.v.indexOf("Date(") === 0) {
      const m = cell.v.match(/Date\((\d+),(\d+),(\d+)/);
      if (m) {
        const y = Number(m[1]);
        const mo = String(Number(m[2]) + 1).padStart(2, "0");
        const d = String(Number(m[3])).padStart(2, "0");
        return y + "-" + mo + "-" + d;
      }
    }
    return String(cell.v);
  }

  function toIso(value) {
    const raw = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (uk) {
      return uk[3] + "-" + uk[2].padStart(2, "0") + "-" + uk[1].padStart(2, "0");
    }
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
    return "";
  }

  function parseImageCell(raw) {
    const value = String(raw || "").trim();
    if (!value) return { folderId: "", image: "" };
    const folder = value.match(/drive\.google\.com\/(?:drive\/)?folders\/([a-zA-Z0-9_-]+)/i);
    if (folder) return { folderId: folder[1], image: "" };
    const formula = value.match(/IMAGE\s*\(\s*"([^"]+)"/i);
    if (formula) return parseImageCell(formula[1]);
    const file = value.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (file) return { folderId: "", image: driveImageUrl(file[1]) };
    const open = value.match(/drive\.google\.com\/open\?id=([^&]+)/);
    if (open) return { folderId: "", image: driveImageUrl(open[1]) };
    const byId = value.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (byId && /drive\.google\.com/i.test(value)) {
      return { folderId: "", image: driveImageUrl(byId[1]) };
    }
    const http = value.match(/https?:\/\/[^\s"']+/i);
    if (http) return { folderId: "", image: http[0] };
    return { folderId: "", image: value };
  }

  function collectMedia(cells, imageIndexes) {
    const images = [];
    const seen = {};
    let folderId = "";
    function add(parsed) {
      if (parsed.folderId && !folderId) folderId = parsed.folderId;
      if (parsed.image && !seen[parsed.image]) {
        seen[parsed.image] = true;
        images.push(parsed.image);
      }
    }
    imageIndexes.forEach((i) => add(parseImageCell(cellValue(cells[i]))));
    if (!images.length && !folderId) {
      (cells || []).forEach((cell) => add(parseImageCell(cellValue(cell))));
    }
    return { folderId: folderId, images: images, image: images[0] || "" };
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDateLabel(iso) {
    if (!iso) return "";
    return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function excerptOf(row) {
    if (row.excerpt) return row.excerpt;
    const text = String(row.body || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length <= 180) return text;
    return text.slice(0, 177).replace(/\s+\S*$/, "") + "…";
  }

  function formatBody(raw) {
    const value = String(raw || "").trim();
    if (!value) return "<p>No write-up yet.</p>";
    if (/<[a-z][\s\S]*>/i.test(value)) {
      return value
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/\son\w+="[^"]*"/gi, "");
    }
    return value
      .split(/\n{2,}/)
      .map((block) => "<p>" + escapeHtml(block).replace(/\n/g, "<br>") + "</p>")
      .join("\n");
  }

  function parseTable(table) {
    let cols = (table.cols || []).map((c) => (c.label || "").toLowerCase().trim());
    let rows = table.rows || [];
    if (cols.indexOf("title") < 0 && rows[0]) {
      const fromRow = (rows[0].c || []).map((cell) => cellValue(cell).toLowerCase().trim());
      if (fromRow.indexOf("title") >= 0) {
        cols = fromRow;
        rows = rows.slice(1);
      }
    }
    if (cols.indexOf("title") < 0) return [];
    const idx = (name) => cols.indexOf(name);
    const first = (...names) => {
      for (const name of names) {
        const i = idx(name);
        if (i >= 0) return i;
      }
      return -1;
    };
    const iDate = idx("date");
    const iTitle = idx("title");
    const iExcerpt = first("excerpt", "exerpt", "summary", "standfirst", "blurb");
    const imageIndexes = cols
      .map((label, i) => (/image|photo|picture|img|cover/.test(label) ? i : -1))
      .filter((i) => i >= 0);
    const iBody = first("body", "report", "text", "write-up", "writeup");
    const iAuthor = first("author", "by");
    return rows
      .map((row, order) => {
        const c = row.c || [];
        const title = cellValue(c[iTitle]).trim();
        const date = toIso(cellValue(c[iDate]));
        const media = collectMedia(c, imageIndexes);
        return {
          order: order,
          date: date,
          title: title,
          slug: slug(title),
          excerpt: iExcerpt >= 0 ? cellValue(c[iExcerpt]).trim() : "",
          image: media.image,
          images: media.images,
          folderId: media.folderId,
          body: iBody >= 0 ? cellValue(c[iBody]).trim() : "",
          author: iAuthor >= 0 ? cellValue(c[iAuthor]).trim() : ""
        };
      })
      .filter((row) => row.title)
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.order - b.order);
  }

  function cardHtml(row) {
    const when = formatDateLabel(row.date);
    const img = row.image
      ? `<img src="${escapeHtml(row.image)}" alt="${escapeHtml(row.title)}" loading="lazy" referrerpolicy="no-referrer" decoding="async">`
      : "";
    return `<a class="card" href="${escapeHtml(viewPage)}?r=${encodeURIComponent(row.slug)}">
            ${img}
            <div class="card-body">
              ${row.date ? `<time datetime="${escapeHtml(row.date)}">${escapeHtml(when)}</time>` : ""}
              <h3>${escapeHtml(row.title)}</h3>
              <p>${escapeHtml(excerptOf(row) || "Club report.")}</p>
            </div>
          </a>`;
  }

  function placeCard(item, frag, lazy) {
    let card = item.el;
    if (item.html) {
      const wrap = document.createElement("div");
      wrap.innerHTML = item.html.trim();
      card = wrap.firstElementChild;
    } else if (card) {
      card = card.cloneNode(true);
    }
    if (!card) return;
    if (lazy) {
      const img = card.querySelector("img");
      if (img) img.setAttribute("loading", "lazy");
    }
    frag.appendChild(card);
  }

  function renderList(rows) {
    if (recentEl && furtherEl) {
      const recentSlugs = {};
      recentEl.querySelectorAll(":scope > a.card h3").forEach((h) => {
        recentSlugs[slug(h.textContent)] = true;
      });
      const fresh = rows
        .filter((row) => row.slug && !recentSlugs[row.slug])
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      if (!fresh.length) return;
      const frag = document.createDocumentFragment();
      fresh.forEach((row) => {
        const wrap = document.createElement("div");
        wrap.innerHTML = cardHtml(row).trim();
        if (wrap.firstElementChild) frag.appendChild(wrap.firstElementChild);
      });
      recentEl.insertBefore(frag, recentEl.firstChild);
      const cards = recentEl.querySelectorAll(":scope > a.card");
      for (let i = cards.length - 1; i >= LATEST_COUNT; i--) {
        furtherEl.insertBefore(cards[i], furtherEl.firstChild);
      }
      if (furtherHead) furtherHead.hidden = !furtherEl.querySelector("a.card");
      return;
    }
    if (!listEl) return;
    if (!rows.length) return;
    listEl.className = "cards";
    listEl.innerHTML = rows.map(cardHtml).join("");
  }

  function renderHome(rows) {
    if (!homeEl) return;
    const liveSlugs = {};
    rows.forEach((row) => {
      liveSlugs[row.slug] = true;
    });
    const archive = homeArchive.filter((item) => item.slug && !liveSlugs[item.slug]);
    const live = rows.map((row) => ({ date: row.date || "", html: cardHtml(row) }));
    const latest = live.concat(archive).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, HOME_COUNT);
    const frag = document.createDocumentFragment();
    latest.forEach((item) => placeCard(item, frag, false));
    homeEl.innerHTML = "";
    homeEl.appendChild(frag);
  }

  function renderArticle(rows) {
    if (!articleEl) return;
    const wanted = new URLSearchParams(window.location.search).get("r") || "";
    const item = rows.find((row) => row.slug === wanted);
    if (!item) {
      articleEl.innerHTML = `<p>That report isn’t on the sheet. <a class="link-more" href="${escapeHtml(backHref)}">${escapeHtml(backLabel)}</a></p>`;
      return;
    }
    const img = item.image;
    const when = formatDateLabel(item.date);
    const lead = [when, item.author].filter(Boolean).join(" · ");
    const hero = document.querySelector("[data-live-hero]");
    const titleEl = document.querySelector("[data-live-title]");
    const leadEl = document.querySelector("[data-live-lead]");
    if (hero && img) {
      hero.setAttribute("referrerpolicy", "no-referrer");
      hero.src = img;
      hero.alt = item.title;
    }
    if (titleEl) titleEl.textContent = item.title;
    if (leadEl) leadEl.textContent = lead || "Club report";
    document.title = item.title + " · Sevenoaks Athletics Club";
    const standfirst = item.excerpt
      ? `<p class="report-standfirst">${escapeHtml(item.excerpt)}</p>`
      : "";
    const extras = (item.images || []).slice(item.image ? 1 : 0);
    const gallery = extras.length
      ? `<div class="report-gallery">${extras
          .map(
            (src) =>
              `<a href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(src)}" alt="" referrerpolicy="no-referrer" loading="lazy"></a>`
          )
          .join("")}</div>`
      : "";
    articleEl.innerHTML =
      standfirst +
      gallery +
      formatBody(item.body) +
      `<p class="report-back"><a class="link-more" href="${escapeHtml(backHref)}">${escapeHtml(backLabel)}</a></p>`;
  }

  function loadFolderImages(folderId) {
    return fetch(siteRoot + "api/drive-folder?id=" + encodeURIComponent(folderId))
      .then((res) => (res.ok ? res.json() : { images: [] }))
      .then((data) =>
        (data.images || []).map((item) => {
          const src = item.src || item;
          const idMatch = String(src).match(/[?&]id=([a-zA-Z0-9_-]+)/);
          if (idMatch && (/\/api\/drive-img\b/.test(String(src)) || /drive\.google\.com/i.test(String(src)))) {
            return driveImageUrl(idMatch[1]);
          }
          return src;
        })
      )
      .catch(() => []);
  }

  function enrich(rows) {
    return Promise.all(
      rows.map((row) => {
        if (!row.folderId) return row;
        return loadFolderImages(row.folderId).then((srcs) => {
          const seen = {};
          const merged = [];
          row.images.concat(srcs).forEach((src) => {
            if (src && !seen[src]) {
              seen[src] = true;
              merged.push(src);
            }
          });
          row.images = merged;
          row.image = merged[0] || "";
          return row;
        });
      })
    );
  }

  function revealReports() {
    document.documentElement.classList.remove("reports-pending");
  }

  function paint(rows) {
    renderList(rows);
    renderHome(rows);
    renderArticle(rows);
    revealReports();
  }

  window[CALLBACK] = function (payload) {
    try {
      if (!payload || payload.status !== "ok" || !payload.table) {
        revealReports();
        return;
      }
      const rows = parseTable(payload.table);
      enrich(rows).then(paint).catch(() => {
        paint(rows);
      });
    } catch (err) {
      revealReports();
    }
  };

  const script = document.createElement("script");
  script.src =
    "https://docs.google.com/spreadsheets/d/" +
    SHEET_ID +
    "/gviz/tq?sheet=" +
    encodeURIComponent(sheetName) +
    "&tqx=out:json;responseHandler:" +
    CALLBACK;
  script.async = true;
  script.onerror = revealReports;
  document.head.appendChild(script);
  window.setTimeout(revealReports, 4000);
})();
