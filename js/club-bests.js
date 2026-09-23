(function () {
  const seniorRoot = document.querySelector("[data-alltime]");
  const juniorRoot = document.querySelector("[data-junior-bests]");
  if (!seniorRoot && !juniorRoot) return;

  const SHEET_ID = "11e8-4Uf5cP1nP3oH8ztnmiRfSqsP3f0xBIBbmAOiwHQ";
  const LOCAL = "data/club-bests.json";
  const JUNIOR_LOCAL = "data/junior-club-bests.json";
  const siteRoot = document.body.dataset.root || "";
  const NEW_YEARS = { 2025: true, 2026: true };
  const tabs = [
    { sheet: "Club Bests T&F", kind: "track", gid: "267925596", callback: "sacBestsTrack" },
    { sheet: "Club Bests Road", kind: "road", gid: "333762967", callback: "sacBestsRoad" }
  ];
  const juniorTab = { sheet: "Club Bests Juniors", kind: "track", callback: "sacBestsJuniors" };

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function tableHtml(rows) {
    if (!rows || !rows.length) return "<p class=\"sub\">No records in this list yet.</p>";
    const withRank = rows.some((row) => row.rank);
    return `<table>
      <thead>
        <tr>
          <th>Event</th>
          <th>Category</th>
          ${withRank ? "<th>Rank</th>" : ""}
          <th>Athlete</th>
          <th>Mark</th>
          <th>Venue</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) =>
              `<tr><td>${esc(row.event)}</td><td>${esc(row.category)}</td>${
                withRank ? `<td>${esc(row.rank)}</td>` : ""
              }<td>${esc(row.name)}</td><td>${esc(row.mark)}</td><td>${esc(row.venue)}</td><td>${esc(row.date)}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>`;
  }

  function fill(id, rows) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = tableHtml(rows);
  }

  function paint(data) {
    if (!data) return;
    fill("new-road-men", data.roadNew && data.roadNew.men);
    fill("new-road-women", data.roadNew && data.roadNew.women);
    fill("new-tf-men", data.trackNew && data.trackNew.men);
    fill("new-tf-women", data.trackNew && data.trackNew.women);
    fill("alltime-road-men", data.road && data.road.men);
    fill("alltime-road-women", data.road && data.road.women);
    fill("alltime-tf-men", data.track && data.track.men);
    fill("alltime-tf-women", data.track && data.track.women);
  }

  function paintJunior(data) {
    if (!data) return;
    fill("new-junior-men", data.trackNew && data.trackNew.men);
    fill("new-junior-women", data.trackNew && data.trackNew.women);
    fill("alltime-junior-men", data.track && data.track.men);
    fill("alltime-junior-women", data.track && data.track.women);
  }

  function tidyTime(value) {
    return String(value || "").trim().replace(/^0(\d:)/, "$1");
  }

  function formatMark(event, mark) {
    const raw = tidyTime(mark);
    if (!raw) return "";
    if (/jump|shot|discus|javelin|hammer|pole vault/i.test(event) && /^\d+(?:\.\d+)?$/.test(raw)) {
      return raw + "m";
    }
    return raw;
  }

  function cellValue(cell) {
    if (!cell) return "";
    if (typeof cell.v === "string" && cell.v.indexOf("Date(") === 0) {
      const m = cell.v.match(/Date\((-?\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+(?:\.\d+)?))?\)/);
      if (m && m[4] != null) return tidyTime(cell.f);
      if (m) {
        const y = Number(m[1]);
        const mo = String(Number(m[2]) + 1).padStart(2, "0");
        const d = String(Number(m[3])).padStart(2, "0");
        return y + "-" + mo + "-" + d;
      }
    }
    if (cell.f != null && cell.f !== "" && (typeof cell.v === "number" || cell.v == null)) {
      return String(cell.f);
    }
    if (cell.v == null) return cell.f ? String(cell.f) : "";
    return String(cell.v);
  }

  function toIso(value) {
    const raw = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (uk) return uk[3] + "-" + uk[2].padStart(2, "0") + "-" + uk[1].padStart(2, "0");
    const named = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
    if (named) {
      const months = {
        jan: "01",
        feb: "02",
        mar: "03",
        apr: "04",
        may: "05",
        jun: "06",
        jul: "07",
        aug: "08",
        sep: "09",
        sept: "09",
        oct: "10",
        nov: "11",
        dec: "12"
      };
      const key = named[2].slice(0, 4).toLowerCase();
      const mo = months[key] || months[named[2].slice(0, 3).toLowerCase()];
      if (mo) return named[3] + "-" + mo + "-" + String(named[1]).padStart(2, "0");
    }
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
    return "";
  }

  function yearOf(value) {
    const iso = toIso(value);
    if (iso) return Number(iso.slice(0, 4));
    const y = String(value || "").match(/(19|20)\d{2}/);
    return y ? Number(y[0]) : 0;
  }

  function formatDateLabel(value) {
    const iso = toIso(value);
    if (iso) {
      return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    }
    return String(value || "").trim();
  }

  function genderOf(value, category) {
    const g = String(value || "").toLowerCase();
    if (g.indexOf("women") >= 0 || g === "w" || g === "f") return "women";
    if (g.indexOf("men") >= 0 || g === "m") return "men";
    const cat = String(category || "").toUpperCase();
    if (/^W\d|^SW|^U\d+W/.test(cat) || cat === "SW") return "women";
    if (/^M\d|^SM|^U\d+/.test(cat) || cat === "SM") return "men";
    return "";
  }

  function findCol(cols, names) {
    for (let i = 0; i < names.length; i++) {
      const j = cols.indexOf(names[i]);
      if (j >= 0) return j;
    }
    return -1;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let i = 0;
    let inQ = false;
    const s = String(text || "").replace(/^\uFEFF/, "");
    while (i < s.length) {
      const ch = s[i];
      if (inQ) {
        if (ch === '"') {
          if (s[i + 1] === '"') {
            cell += '"';
            i += 2;
            continue;
          }
          inQ = false;
          i += 1;
          continue;
        }
        cell += ch;
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQ = true;
        i += 1;
        continue;
      }
      if (ch === ",") {
        row.push(cell);
        cell = "";
        i += 1;
        continue;
      }
      if (ch === "\r") {
        i += 1;
        continue;
      }
      if (ch === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
    }
    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter((r) => r.some((v) => String(v || "").trim()));
  }

  function makeRecord(kind, eventName, extra, genderRaw, category, rank, name, mark, dateRaw, venue) {
    if (!name || !eventName || !mark) return null;
    if (/^(name|athlete)$/i.test(name) || /^(event|distance)$/i.test(eventName)) return null;
    const gender = genderOf(genderRaw, category);
    if (!gender) return null;
    let event = eventName;
    if (kind === "track" && /indoor/i.test(extra)) event += " indoor";
    if (kind === "road" && extra && !/^road$/i.test(extra)) event += " (" + extra + ")";
    return {
      event: event,
      category: category,
      name: name,
      mark: formatMark(event, mark),
      date: formatDateLabel(dateRaw) || dateRaw,
      year: yearOf(dateRaw),
      venue: venue,
      rank: String(rank || "").replace(/\.0$/, ""),
      gender: gender
    };
  }

  function parseRows(kind, cols, rows, get) {
    let iEvent = findCol(cols, ["event", "distance"]);
    let iExtra = findCol(cols, ["indoor", "indoors", "terrain", "surface", "type"]);
    let iGender = findCol(cols, ["gender", "sex", "m/w"]);
    let iCat = findCol(cols, ["category", "cat", "age group", "age"]);
    let iRank = findCol(cols, ["rank"]);
    let iName = findCol(cols, ["name", "athlete", "runner"]);
    let iMark = findCol(cols, ["performance", "mark", "time", "result"]);
    let iDate = findCol(cols, ["date"]);
    let iVenue = findCol(cols, ["venue", "place", "location", "meeting"]);
    if (iEvent < 0 || iName < 0 || iMark < 0) return [];
    if (iExtra < 0) iExtra = 1;
    if (iGender < 0) iGender = 2;
    return rows
      .map((row) =>
        makeRecord(
          kind,
          get(row, iEvent),
          iExtra >= 0 ? get(row, iExtra) : "",
          iGender >= 0 ? get(row, iGender) : "",
          iCat >= 0 ? get(row, iCat) : "",
          iRank >= 0 ? get(row, iRank) : "",
          get(row, iName),
          get(row, iMark),
          iDate >= 0 ? get(row, iDate) : "",
          iVenue >= 0 ? get(row, iVenue) : ""
        )
      )
      .filter(Boolean);
  }

  function parseCsvTable(text, kind) {
    const grid = parseCsv(text);
    if (grid.length < 2) return [];
    const cols = grid[0].map((v) => String(v || "").toLowerCase().trim());
    return parseRows(kind, cols, grid.slice(1), (row, i) => String((row && row[i]) || "").trim());
  }

  function normCols(table) {
    let cols = (table.cols || []).map((c) => String(c.label || "").toLowerCase().trim());
    let rows = table.rows || [];
    const needed = ["event", "distance", "name", "athlete", "performance", "mark", "time"];
    if (findCol(cols, needed) < 0 && rows[0]) {
      const fromRow = (rows[0].c || []).map((cell) => cellValue(cell).toLowerCase().trim());
      if (findCol(fromRow, needed) >= 0) {
        cols = fromRow;
        rows = rows.slice(1);
      }
    }
    return { cols: cols, rows: rows };
  }

  function parseTable(table, kind) {
    const prepared = normCols(table);
    return parseRows(kind, prepared.cols, prepared.rows, (row, i) => cellValue((row.c || [])[i]).trim());
  }

  function splitAllTime(rows) {
    const out = { men: [], women: [] };
    rows.forEach((row) => {
      if (row.rank && row.rank !== "1") return;
      out[row.gender].push({
        event: row.event,
        category: row.category,
        name: row.name,
        mark: row.mark,
        date: row.date,
        venue: row.venue
      });
    });
    return out;
  }

  function splitNew(rows) {
    const out = { men: [], women: [] };
    rows.forEach((row) => {
      if (!NEW_YEARS[row.year]) return;
      const rec = {
        event: row.event,
        category: row.category,
        name: row.name,
        mark: row.mark,
        date: row.date,
        venue: row.venue
      };
      if (row.rank) rec.rank = row.rank;
      out[row.gender].push(rec);
    });
    return out;
  }

  function fromLocal() {
    fetch(siteRoot + LOCAL)
      .then((res) => (res.ok ? res.json() : null))
      .then(paint)
      .catch(() => {});
  }

  function loadViaCsv(tab) {
    return fetch(siteRoot + "api/sheet-csv?gid=" + encodeURIComponent(tab.gid)).then((res) => {
      if (!res.ok) throw new Error("csv");
      return res.text();
    }).then((text) => {
      const rows = parseCsvTable(text, tab.kind);
      if (!rows.length) throw new Error("empty");
      return rows;
    });
  }

  function loadViaGviz(tab) {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve([]), 3500);
      window[tab.callback] = function (payload) {
        window.clearTimeout(timer);
        try {
          resolve(payload && payload.status === "ok" && payload.table ? parseTable(payload.table, tab.kind) : []);
        } catch (err) {
          resolve([]);
        }
      };
      const script = document.createElement("script");
      script.src =
        "https://docs.google.com/spreadsheets/d/" +
        SHEET_ID +
        "/gviz/tq?sheet=" +
        encodeURIComponent(tab.sheet) +
        "&tqx=out:json;responseHandler:" +
        tab.callback;
      script.async = true;
      script.onerror = function () {
        window.clearTimeout(timer);
        resolve([]);
      };
      document.head.appendChild(script);
    });
  }

  function loadTab(tab) {
    if (!tab.gid) return loadViaGviz(tab);
    return loadViaCsv(tab).catch(() => loadViaGviz(tab));
  }

  function fromJuniorLocal() {
    fetch(siteRoot + JUNIOR_LOCAL)
      .then((res) => (res.ok ? res.json() : null))
      .then(paintJunior)
      .catch(() => {});
  }

  if (seniorRoot) {
    Promise.all(tabs.map(loadTab))
      .then((results) => {
        const track = results[0] || [];
        const road = results[1] || [];
        if (!track.length && !road.length) {
          fromLocal();
          return;
        }
        paint({
          track: splitAllTime(track),
          road: splitAllTime(road),
          trackNew: splitNew(track),
          roadNew: splitNew(road)
        });
      })
      .catch(fromLocal);
  }

  if (juniorRoot) {
    loadTab(juniorTab)
      .then((rows) => {
        if (!rows || !rows.length) {
          fromJuniorLocal();
          return;
        }
        paintJunior({
          track: splitAllTime(rows),
          trackNew: splitNew(rows)
        });
      })
      .catch(fromJuniorLocal);
  }
})();
