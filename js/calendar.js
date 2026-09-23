(function () {
  const root = document.querySelector("[data-calendar]");
  const comingUpEl = document.querySelector("[data-coming-up]");
  if (!root && !comingUpEl) return;

  const siteRoot = document.body.dataset.root || "";
  const SHEET_ID = "11e8-4Uf5cP1nP3oH8ztnmiRfSqsP3f0xBIBbmAOiwHQ";
  const CALLBACK = "sacRacesFromSheet";
  const COMING_UP_LIMIT = 5;

  let EVENTS = [];
  let LINKS = [];
  let active = new URLSearchParams(window.location.search).get("series") || "all";
  const filtersEl = root ? root.querySelector("[data-cal-filters]") : null;
  const listEl = root ? root.querySelector("[data-cal-list]") : null;
  const noteEl = root ? root.querySelector("[data-cal-note]") : null;

  function slug(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function cellValue(cell) {
    if (!cell) return "";
    if (cell.f) return String(cell.f);
    if (cell.v == null) return "";
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

  function parseTable(table) {
    const cols = (table.cols || []).map((c) => (c.label || c.id || "").toLowerCase().trim());
    const idx = (name) => cols.indexOf(name);
    const iDate = idx("date");
    const iLabel = idx("label") >= 0 ? idx("label") : idx("series");
    const iTitle = idx("title");
    const iDetail = idx("detail");
    const iHref = ["href", "url", "link", "entry"].map(idx).find((i) => i >= 0);
    return (table.rows || [])
      .map((row, order) => {
        const c = row.c || [];
        const label = cellValue(c[iLabel]).trim();
        return {
          order: order,
          date: toIso(cellValue(c[iDate])),
          label: label,
          slug: slug(label),
          title: cellValue(c[iTitle]).trim(),
          detail: cellValue(c[iDetail]).trim(),
          href: iHref >= 0 ? cellValue(c[iHref]).trim() : ""
        };
      })
      .filter((ev) => ev.date && ev.title && ev.label);
  }

  function normTitle(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[—–]/g, "-")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function titleScore(a, b) {
    const left = new Set(normTitle(a).split(" ").filter((w) => w.length > 2));
    const right = normTitle(b).split(" ").filter((w) => w.length > 2);
    if (!left.size || !right.length) return 0;
    return right.filter((w) => left.has(w)).length / Math.max(left.size, right.length);
  }

  function safeUrl(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    try {
      const url = new URL(value, window.location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      if (url.origin === window.location.origin) return "";
      return url.href;
    } catch (err) {}
    return "";
  }

  function findEntryUrl(ev) {
    const name = normTitle(ev.title);
    if (!name) return "";
    const exact = LINKS.filter((item) => normTitle(item.title) === name);
    if (exact.length === 1) return safeUrl(exact[0].url);
    const sameDayExact = exact.find((item) => item.date === ev.date);
    if (sameDayExact) return safeUrl(sameDayExact.url);
    if (exact.length) return safeUrl(exact[0].url);
    const sameDay = LINKS.filter((item) => item.date === ev.date);
    const contained = sameDay.find((item) => {
      const other = normTitle(item.title);
      return other.includes(name) || name.includes(other);
    });
    if (contained) return safeUrl(contained.url);
    let best = null;
    let top = 0;
    sameDay.forEach((item) => {
      const s = titleScore(ev.title, item.title);
      if (s > top) {
        top = s;
        best = item;
      }
    });
    return top >= 0.5 && best ? safeUrl(best.url) : "";
  }

  function attachLinks() {
    EVENTS.forEach((ev) => {
      ev.href = safeUrl(ev.href) || findEntryUrl(ev);
    });
  }

  function uniqueLabels() {
    const seen = {};
    const out = [];
    EVENTS.forEach((ev) => {
      if (!seen[ev.slug]) {
        seen[ev.slug] = true;
        out.push(ev.label);
      }
    });
    return out;
  }

  function buildFilters() {
    const buttons = [`<button type="button" class="cal-filter is-on" data-filter="all" aria-pressed="true">All races</button>`];
    uniqueLabels().forEach((label) => {
      buttons.push(
        `<button type="button" class="cal-filter" data-filter="${escapeHtml(slug(label))}" aria-pressed="false">${escapeHtml(label)}</button>`
      );
    });
    filtersEl.innerHTML = buttons.join("");
  }

  function formatDay(iso) {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short"
    });
  }

  function monthLabel(iso) {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric"
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function upcoming() {
    const today = new Date().toISOString().slice(0, 10);
    return EVENTS.filter((ev) => ev.date >= today).sort((a, b) =>
      a.date === b.date ? a.order - b.order : a.date.localeCompare(b.date)
    );
  }

  function eventRowHtml(ev) {
    const heading = ev.href
      ? `<h3><a href="${escapeHtml(ev.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ev.title)}</a></h3>`
      : `<h3>${escapeHtml(ev.title)}</h3>`;
    return `<article class="event-row">
          <div class="date">${formatDay(ev.date)}</div>
          <div>
            ${heading}
            <p>${escapeHtml(ev.detail)}</p>
          </div>
          <span class="tag series-${escapeHtml(ev.slug)}">${escapeHtml(ev.label)}</span>
        </article>`;
  }

  function renderComingUp() {
    if (!comingUpEl) return;
    const list = upcoming().slice(0, COMING_UP_LIMIT);
    comingUpEl.innerHTML = list.length
      ? list.map(eventRowHtml).join("")
      : `<p class="sub">No upcoming races just now. See <a class="link-more" href="events.html">What’s on</a>.</p>`;
  }

  function render() {
    if (!filtersEl || !listEl) return;
    filtersEl.querySelectorAll(".cal-filter").forEach((btn) => {
      const on = btn.dataset.filter === active;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });

    const list = upcoming().filter((ev) => active === "all" || ev.slug === active);

    if (!list.length) {
      listEl.innerHTML = `<p class="sub">No races in this series just now.</p>`;
    } else {
      let html = "";
      let lastMonth = "";
      list.forEach((ev) => {
        const month = monthLabel(ev.date);
        if (month !== lastMonth) {
          html += `<h3 class="cal-list-title">${month}</h3>`;
          lastMonth = month;
        }
        html += eventRowHtml(ev);
      });
      listEl.innerHTML = html;
    }

    if (noteEl) {
      if (active === "all") {
        noteEl.textContent = "Click a race name to open its entry page. Weekly training is listed above.";
      } else {
        const match = EVENTS.find((ev) => ev.slug === active);
        noteEl.textContent = match ? `Showing ${match.label} only.` : "";
      }
    }
  }

  function applyFilter(slug) {
    active = slug || "all";
    if (EVENTS.length) paint();
  }

  function showError(msg) {
    const html = `<p class="sub">${msg}</p>`;
    if (listEl) listEl.innerHTML = html;
    if (comingUpEl) comingUpEl.innerHTML = html;
  }

  function paint() {
    attachLinks();
    if (root) {
      buildFilters();
      render();
    }
    renderComingUp();
  }

  if (filtersEl) {
    filtersEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-filter]");
      if (!btn) return;
      applyFilter(btn.dataset.filter);
    });
  }

  document.querySelectorAll("[data-series-filter]").forEach((el) => {
    el.addEventListener("click", () => applyFilter(el.dataset.seriesFilter));
  });

  if (listEl) listEl.innerHTML = `<p class="sub">Loading fixtures from Google Sheets…</p>`;

  const timeout = setTimeout(() => {
    if (!EVENTS.length) {
      showError("Couldn’t load the race list from Google Sheets. Check the sheet is shared with “anyone with the link”.");
    }
  }, 8000);

  window[CALLBACK] = function (payload) {
    clearTimeout(timeout);
    try {
      if (!payload || payload.status !== "ok" || !payload.table) {
        throw new Error("bad payload");
      }
      EVENTS = parseTable(payload.table);
      if (!EVENTS.length) {
        showError("The Google Sheet loaded but had no races. Check there is a Label column.");
        return;
      }
      paint();
    } catch (err) {
      showError("Couldn’t read the race list from Google Sheets.");
    }
  };

  const script = document.createElement("script");
  script.src =
    "https://docs.google.com/spreadsheets/d/" +
    SHEET_ID +
    "/gviz/tq?gid=0&tqx=out:json;responseHandler:" +
    CALLBACK;
  script.async = true;
  script.onerror = function () {
    clearTimeout(timeout);
    showError("Couldn’t load the race list from Google Sheets.");
  };
  document.head.appendChild(script);

  fetch(siteRoot + "data/race-entry.json")
    .then((res) => (res.ok ? res.json() : []))
    .then((data) => {
      LINKS = Array.isArray(data) ? data : [];
      if (EVENTS.length) paint();
    })
    .catch(() => {});
})();
