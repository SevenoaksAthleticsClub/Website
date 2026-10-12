(function () {
  const mounts = document.querySelectorAll("[data-training-changes]");
  const cards = document.querySelectorAll("[data-session], [data-notice]");
  if (!mounts.length && !cards.length) return;

  const SHEET_ID = "11e8-4Uf5cP1nP3oH8ztnmiRfSqsP3f0xBIBbmAOiwHQ";
  const GID = "1499812430";
  const siteRoot = document.body.dataset.root || "";
  const LABELS = {
    tuesday: "Tuesday run",
    thursday: "Thursday track",
    sunday: "Sunday track",
    juniors: "Juniors",
    all: "All sessions"
  };
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let quoted = false;
    const src = String(text || "").replace(/^\uFEFF/, "");
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"') {
          if (src[i + 1] === '"') {
            cur += '"';
            i++;
          } else quoted = false;
        } else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") {
        row.push(cur);
        cur = "";
      } else if (ch === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (ch !== "\r") cur += ch;
    }
    if (cur.length || row.length) {
      row.push(cur);
      rows.push(row);
    }
    return rows;
  }

  function toIso(value) {
    const raw = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (uk) return uk[3] + "-" + uk[2].padStart(2, "0") + "-" + uk[1].padStart(2, "0");
    return "";
  }

  function classify(who) {
    const s = String(who || "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
    if (!s) return "";
    if (s === "all" || s.startsWith("all ")) return "all";
    if (s.includes("junior")) return "juniors";
    if (s.includes("thu")) return "thursday";
    if (s.includes("sun")) return "sunday";
    if (s.includes("tue")) return "tuesday";
    return "";
  }

  function weekday(iso) {
    const parts = iso.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  }

  function todayIso(now) {
    return (
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0")
    );
  }

  function findCol(header, names) {
    for (let i = 0; i < names.length; i++) {
      const at = header.indexOf(names[i]);
      if (at >= 0) return at;
    }
    return -1;
  }

  function addDays(iso, days) {
    const parts = iso.split("-").map(Number);
    const cursor = new Date(parts[0], parts[1] - 1, parts[2]);
    cursor.setDate(cursor.getDate() + days);
    return todayIso(cursor);
  }

  function rangeIncludesWeekday(start, end, day) {
    for (let i = 0; i < 7; i++) {
      const iso = addDays(start, i);
      if (iso > end) return false;
      if (weekday(iso) === day) return true;
    }
    return false;
  }

  function endMinutes(notice) {
    const day = weekday(notice.date);
    if (notice.who === "sunday" || (notice.who === "all" && day === 0)) return 10 * 60;
    if (notice.who === "thursday" || (notice.who === "all" && day === 4)) return 20 * 60;
    if (notice.who === "juniors") return 19 * 60 + 45;
    return 21 * 60;
  }

  function isCurrent(notice, now) {
    const today = todayIso(now);
    const end = notice.end || notice.date;
    if (today < notice.date) return true;
    if (today > end) return false;
    if (today < end) return true;
    if (notice.end && notice.kind === "notice") return true;
    return now.getHours() * 60 + now.getMinutes() < endMinutes({ who: notice.who, date: end });
  }

  function noticesFromCsv(text) {
    const table = parseCsv(text);
    if (table.length < 2) return [];
    const header = table[0].map((cell) => String(cell || "").trim().toLowerCase());
    const col = (name) => header.indexOf(name);
    const iDate = col("date");
    const iEnd = findCol(header, ["end date", "end", "ends", "until"]);
    const iWho = col("who");
    const iStatus = col("status");
    const iMessage = col("message");
    if (iDate < 0) return [];
    return table
      .slice(1)
      .map((cells) => {
        const date = toIso(cells[iDate]);
        const endRaw = iEnd >= 0 ? toIso(cells[iEnd]) : "";
        const whoText = iWho >= 0 ? String(cells[iWho] || "").trim() : "";
        const statusText = iStatus >= 0 ? String(cells[iStatus] || "").trim() : "";
        const message = iMessage >= 0 ? String(cells[iMessage] || "").trim() : "";
        const who = classify(whoText);
        if (!date || (!whoText && !statusText && !message)) return null;
        const kind = /mov/i.test(statusText) ? "moved" : /cancel/i.test(statusText) || !statusText ? "cancelled" : "notice";
        return {
          date: date,
          end: endRaw && endRaw > date ? endRaw : "",
          who: who,
          whoText: whoText,
          label: LABELS[who] || whoText || "Training",
          statusText: statusText || (kind === "moved" ? "Moved" : "Cancelled"),
          message: message,
          kind: kind
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.label.localeCompare(b.label)));
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
    );
  }

  function dateLabel(iso, now) {
    const parts = iso.split("-").map(Number);
    const label = WEEKDAYS[weekday(iso)] + " " + parts[2] + " " + MONTHS[parts[1] - 1];
    return parts[0] === now.getFullYear() ? label : label + " " + parts[0];
  }

  function coversJuniors(notice) {
    if (notice.who === "juniors") return true;
    if (notice.who !== "all") return false;
    if (!notice.end) return weekday(notice.date) === 2;
    return rangeIncludesWeekday(notice.date, notice.end, 2);
  }

  function whenLabel(notice, now) {
    if (!notice.end) return dateLabel(notice.date, now);
    return dateLabel(notice.date, now) + " to " + dateLabel(notice.end, now);
  }

  function forMount(notices, el) {
    if (el.dataset.trainingChanges !== "juniors") return notices;
    return notices.filter(coversJuniors);
  }

  function paintList(el, notices, now) {
    const view = forMount(notices, el);
    if (!view.length) {
      el.remove();
      return;
    }
    el.classList.add("notice", "training-changes");
    el.innerHTML =
      "<h3>Training changes and notices</h3><ul>" +
      view
        .map((notice) => {
          const message = notice.message ? "<p>" + escapeHtml(notice.message) + "</p>" : "";
          return (
            '<li class="change-' +
            notice.kind +
            '"><p class="change-when"><time datetime="' +
            notice.date +
            '">' +
            escapeHtml(whenLabel(notice, now)) +
            "</time> · " +
            escapeHtml(notice.label) +
            " · " +
            escapeHtml(notice.statusText) +
            "</p>" +
            message +
            "</li>"
          );
        })
        .join("") +
      "</ul>";
  }

  function cardSlot(card) {
    const named = card.dataset.notice;
    if (named === "juniors" || named === "tuesday" || named === "thursday" || named === "sunday") return named;
    const day = Number(card.dataset.session);
    if (day === 2) return "tuesday";
    if (day === 4) return "thursday";
    if (day === 0) return "sunday";
    return "";
  }

  function slotDay(slot) {
    if (slot === "tuesday" || slot === "juniors") return 2;
    if (slot === "thursday") return 4;
    if (slot === "sunday") return 0;
    return -1;
  }

  function sessionStillAhead(slot, now) {
    if (now.getDay() !== slotDay(slot)) return false;
    const mins = now.getHours() * 60 + now.getMinutes();
    if (slot === "sunday") return mins < 10 * 60;
    if (slot === "thursday") return mins < 20 * 60;
    if (slot === "juniors") return mins < 19 * 60 + 45;
    return mins < 21 * 60;
  }

  function matches(notice, slot, iso) {
    if (!slot) return false;
    const day = weekday(iso);
    if (notice.end) {
      if (day !== slotDay(slot)) return false;
      if (notice.who === "all") return slot === "tuesday" || slot === "thursday" || slot === "sunday" || slot === "juniors";
      return notice.who === slot;
    }
    if (notice.who === slot) return true;
    if (notice.who !== "all") return false;
    if (slot === "juniors") return day === 2;
    return (day === 2 && slot === "tuesday") || (day === 4 && slot === "thursday") || (day === 0 && slot === "sunday");
  }

  function markCards(notices, now) {
    const today = todayIso(now);
    const todays = notices.filter((notice) => {
      const end = notice.end || notice.date;
      return today >= notice.date && today <= end;
    });
    if (!todays.length) return;
    cards.forEach((card) => {
      const slot = cardSlot(card);
      const hits = todays.filter((notice) => matches(notice, slot, today) && sessionStillAhead(slot, now));
      if (!hits.length || card.querySelector(".session-flag")) return;
      const kinds = hits.map((notice) => notice.kind);
      card.classList.add(kinds.indexOf("cancelled") >= 0 ? "is-cancelled" : kinds.indexOf("moved") >= 0 ? "is-moved" : "is-notice");
      const flag = document.createElement("p");
      flag.className = "session-flag";
      flag.textContent = hits
        .map((notice) => (notice.message ? notice.statusText + ". " + notice.message : notice.statusText + "."))
        .join(" ");
      const day = card.querySelector(".day");
      if (day) day.insertAdjacentElement("afterend", flag);
      else card.prepend(flag);
    });
  }

  function load(url) {
    return fetch(url).then((res) => {
      if (!res.ok) throw new Error("csv");
      return res.text();
    });
  }

  const published =
    "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/export?format=csv&gid=" + GID;
  const local = siteRoot + "api/sheet-csv?gid=" + GID;
  const byName =
    "https://docs.google.com/spreadsheets/d/" +
    SHEET_ID +
    "/gviz/tq?tqx=out:csv&sheet=" +
    encodeURIComponent("Notices");

  load(published)
    .catch(() => load(local))
    .catch(() => load(byName))
    .then((text) => {
      const now = new Date();
      const notices = noticesFromCsv(text).filter((notice) => isCurrent(notice, now));
      mounts.forEach((el) => paintList(el, notices, now));
      markCards(notices, now);
    })
    .catch(() => {
      mounts.forEach((el) => el.remove());
    });
})();
