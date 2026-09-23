(function () {
  const root = document.querySelector("[data-gp]");
  if (!root) return;

  const SHEET_ID = "11e8-4Uf5cP1nP3oH8ztnmiRfSqsP3f0xBIBbmAOiwHQ";
  const tabs = [
    { id: "road", sheet: "GP Road", label: "Road", best: 6, kind: "individual" },
    { id: "track", sheet: "GP Track", label: "Track and field", best: 3, kind: "individual" },
    { id: "team", sheet: "GP Team", label: "Team", best: 0, kind: "team" }
  ];

  const panels = {};
  let active = tabs[0].id;

  function cellValue(cell) {
    if (!cell) return "";
    if (typeof cell.v === "string" && cell.v.indexOf("Date(") === 0) {
      const m = cell.v.match(/Date\((\d+),(\d+),(\d+)/);
      if (m) {
        const y = Number(m[1]);
        const mo = String(Number(m[2]) + 1).padStart(2, "0");
        const d = String(Number(m[3])).padStart(2, "0");
        return y + "-" + mo + "-" + d;
      }
    }
    if (cell.f) return String(cell.f);
    if (cell.v == null) return "";
    return String(cell.v);
  }

  function toKey(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (uk) return uk[3] + "-" + uk[2].padStart(2, "0") + "-" + uk[1].padStart(2, "0");
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
    return raw;
  }

  function toLabel(key) {
    if (!key) return "";
    const m = String(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return key;
    const months = [
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
    return Number(m[3]) + " " + months[Number(m[2]) - 1] + " " + m[1];
  }

  function num(value) {
    const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function fmt(value) {
    if (!value) return "—";
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    return n.toFixed(2);
  }

  function colNames(table) {
    return (table.cols || []).map((c) => String(c.label || c.id || "").toLowerCase().trim());
  }

  function findCol(cols, names) {
    for (let i = 0; i < names.length; i++) {
      const j = cols.indexOf(names[i]);
      if (j >= 0) return j;
    }
    return -1;
  }

  function rowLabels(row) {
    return (row.c || []).map((cell) => {
      const raw = cellValue(cell).trim();
      if (/^\d+(?:\.0+)?$/.test(raw)) return String(parseInt(raw, 10));
      return raw.toLowerCase();
    });
  }

  function prepareTable(table) {
    const rawCols = table.cols || [];
    let cols = colNames(table);
    let rows = table.rows || [];
    if (findCol(cols, ["name", "person a"]) < 0 && rows[0]) {
      const guessed = rowLabels(rows[0]);
      if (findCol(guessed, ["name", "person a"]) >= 0) {
        cols = guessed;
        rows = rows.slice(1);
      }
    }
    while (cols.length < rawCols.length) cols.push("");
    if (!cols[0] && rawCols[0] && rawCols[0].type === "date") cols[0] = "to";
    const iName = findCol(cols, ["name"]);
    if (iName > 0 && !cols[iName - 1] && rawCols[iName - 1] && rawCols[iName - 1].type === "number") {
      cols[iName - 1] = "rank";
    }
    const numbered = [];
    cols.forEach((name, i) => {
      if (/^\d+$/.test(name)) numbered.push(i);
    });
    if (numbered.length) {
      const last = numbered[numbered.length - 1];
      if (!cols[last + 1] && rawCols[last + 1] && rawCols[last + 1].type === "number") cols[last + 1] = "total";
      if (!cols[last + 2] && rawCols[last + 2] && rawCols[last + 2].type === "number") cols[last + 2] = "previous";
    }
    return { cols: cols, rows: rows };
  }

  function scoreCols(cols) {
    const out = [];
    cols.forEach((name, i) => {
      if (/^\d+$/.test(name) && Number(name) >= 1 && Number(name) <= 12) out.push({ i: i, n: Number(name) });
    });
    return out.sort((a, b) => a.n - b.n);
  }

  function parseIndividual(table, bestN) {
    const prepared = prepareTable(table);
    const cols = prepared.cols;
    const iName = findCol(cols, ["name", "athlete", "runner"]);
    const iRank = findCol(cols, ["rank"]);
    const iTotal = findCol(cols, ["top 6", "top6", "top 3", "top3", "total", "score"]);
    const iPrev = findCol(cols, ["previous", "2025", "last year", "last"]);
    const iDiff = findCol(cols, ["diff", "difference"]);
    const iImp = findCol(cols, ["improvement rank", "improvement"]);
    const iTo = findCol(cols, ["to", "updated", "month", "as of", "as-of"]);
    const scores = scoreCols(cols);
    if (iName < 0) return [];
    return prepared.rows
      .map((row, order) => {
        const c = row.c || [];
        const name = cellValue(c[iName]).trim();
        if (!name || name.toLowerCase() === "name") return null;
        const marks = scores.map((s) => num(cellValue(c[s.i]))).filter((n) => n > 0);
        marks.sort((a, b) => b - a);
        const total =
          iTotal >= 0
            ? num(cellValue(c[iTotal]))
            : marks.slice(0, bestN).reduce((sum, n) => sum + n, 0);
        return {
          order: order,
          rank: iRank >= 0 ? num(cellValue(c[iRank])) : 0,
          name: name,
          scores: scores.map((s) => num(cellValue(c[s.i]))),
          scoreLabels: scores.map((s) => String(s.n)),
          total: total,
          previous: iPrev >= 0 ? num(cellValue(c[iPrev])) : 0,
          diff: iDiff >= 0 ? num(cellValue(c[iDiff])) : 0,
          improvement: iImp >= 0 ? cellValue(c[iImp]).trim() : "",
          to: iTo >= 0 ? toKey(cellValue(c[iTo])) : ""
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.rank && b.rank ? a.rank - b.rank : b.total - a.total));
  }

  function parseTeam(table) {
    const prepared = prepareTable(table);
    const cols = prepared.cols;
    const iTeam = findCol(cols, ["t", "team"]);
    const iRank = findCol(cols, ["rank"]);
    const iTotal = findCol(cols, ["total", "score"]);
    const iA = findCol(cols, ["person a", "athlete a", "a"]);
    const iB = findCol(cols, ["person b", "athlete b", "b"]);
    const iC = findCol(cols, ["person c", "athlete c", "c"]);
    const iTo = findCol(cols, ["to", "updated", "month", "as of", "as-of"]);
    if (iTeam < 0 && iA < 0) return [];
    return prepared.rows
      .map((row, order) => {
        const c = row.c || [];
        const team = iTeam >= 0 ? cellValue(c[iTeam]).trim() : "";
        function pair(nameI) {
          if (nameI < 0) return { name: "", s1: 0, s2: 0 };
          return {
            name: cellValue(c[nameI]).trim(),
            s1: num(cellValue(c[nameI + 1])),
            s2: num(cellValue(c[nameI + 2]))
          };
        }
        const A = pair(iA);
        const B = pair(iB);
        const C = pair(iC);
        if (!team && !A.name) return null;
        const total = iTotal >= 0 ? num(cellValue(c[iTotal])) : A.s1 + A.s2 + B.s1 + B.s2 + C.s1 + C.s2;
        return {
          order: order,
          rank: iRank >= 0 ? num(cellValue(c[iRank])) : 0,
          team: team || "Team",
          people: [A, B, C],
          total: total,
          to: iTo >= 0 ? toKey(cellValue(c[iTo])) : ""
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.rank && b.rank ? a.rank - b.rank : b.total - a.total));
  }

  function individualTable(rows, bestN) {
    if (!rows.length) return emptyNote();
    const scoreCount = Math.max.apply(
      null,
      rows.map((r) => r.scoreLabels.length)
    );
    const labels = rows[0] && rows[0].scoreLabels.length ? rows[0].scoreLabels : [];
    const head =
      "<th>Rank</th><th>Name</th>" +
      labels.map((n) => "<th class='gp-num'>" + n + "</th>").join("") +
      "<th class='gp-num'>Top " +
      bestN +
      "</th><th class='gp-num'>Previous</th><th class='gp-num'>Diff</th><th class='gp-num'>Imp.</th>";
    const body = rows
      .map((r, i) => {
        const rank = r.rank || i + 1;
        const marks = r.scores
          .map((n) => "<td class='gp-num'>" + fmt(n) + "</td>")
          .join("");
        return (
          "<tr><td>" +
          rank +
          "</td><td>" +
          r.name +
          "</td>" +
          marks +
          "<td class='gp-num'><strong>" +
          fmt(r.total) +
          "</strong></td><td class='gp-num'>" +
          fmt(r.previous) +
          "</td><td class='gp-num'>" +
          fmt(r.diff) +
          "</td><td class='gp-num'>" +
          (r.improvement && r.improvement.toUpperCase() !== "N/A" ? r.improvement : "—") +
          "</td></tr>"
        );
      })
      .join("");
    return wrapTable(head, body, scoreCount);
  }

  function teamTable(rows) {
    if (!rows.length) return emptyNote();
    const head =
      "<th>Rank</th><th>Team</th><th>Athlete</th><th class='gp-num'>1</th><th class='gp-num'>2</th><th>Athlete</th><th class='gp-num'>1</th><th class='gp-num'>2</th><th>Athlete</th><th class='gp-num'>1</th><th class='gp-num'>2</th><th class='gp-num'>Total</th>";
    const body = rows
      .map((r, i) => {
        const p = r.people;
        return (
          "<tr><td>" +
          (r.rank || i + 1) +
          "</td><td>" +
          r.team +
          "</td>" +
          p
            .map(
              (person) =>
                "<td>" +
                (person.name || "—") +
                "</td><td class='gp-num'>" +
                fmt(person.s1) +
                "</td><td class='gp-num'>" +
                fmt(person.s2) +
                "</td>"
            )
            .join("") +
          "<td class='gp-num'><strong>" +
          fmt(r.total) +
          "</strong></td></tr>"
        );
      })
      .join("");
    return wrapTable(head, body, 0);
  }

  function wrapTable(head, body) {
    return "<div class='data-table gp-table'><table><thead><tr>" + head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  function monthsOf(rows) {
    const keys = [];
    rows.forEach((r) => {
      if (r.to && keys.indexOf(r.to) < 0) keys.push(r.to);
    });
    return keys.sort().reverse();
  }

  function paintRows(tab, rows, month) {
    const keys = monthsOf(rows);
    const chosen = month || keys[0] || "";
    const view = chosen ? rows.filter((r) => r.to === chosen) : rows;
    const tableHtml =
      tab.kind === "team" ? teamTable(view) : individualTable(view, tab.best);
    if (!keys.length) return tableHtml;
    const title = "<p class='sub'>To " + toLabel(chosen) + "</p>";
    const picker =
      keys.length > 1
        ? "<label class='gp-month'>Month <select data-gp-month>" +
          keys
            .map(
              (k) =>
                "<option value='" +
                k +
                "'" +
                (k === chosen ? " selected" : "") +
                ">To " +
                toLabel(k) +
                "</option>"
            )
            .join("") +
          "</select></label>"
        : "";
    return "<div class='gp-when'>" + title + picker + "</div>" + tableHtml;
  }

  function emptyNote() {
    return "<p class='sub'>This table will appear here once the matching tab is in the club Google Sheet and shared with anyone with the link.</p>";
  }

  function showTab(id) {
    active = id;
    root.querySelectorAll("[data-gp-tab]").forEach((btn) => {
      btn.setAttribute("aria-selected", btn.dataset.gpTab === id ? "true" : "false");
    });
    tabs.forEach((tab) => {
      const panel = panels[tab.id];
      if (panel) panel.hidden = tab.id !== id;
    });
  }

  root.innerHTML =
    '<div class="tabs" role="tablist">' +
    tabs
      .map(
        (tab, i) =>
          '<button type="button" data-gp-tab="' +
          tab.id +
          '" aria-selected="' +
          (i === 0 ? "true" : "false") +
          '">' +
          tab.label +
          "</button>"
      )
      .join("") +
    "</div>" +
    tabs
      .map(
        (tab) =>
          '<div data-gp-panel="' +
          tab.id +
          '"' +
          (tab.id === active ? "" : " hidden") +
          '><p class="sub">Loading ' +
          tab.label +
          " table…</p></div>"
      )
      .join("");

  tabs.forEach((tab) => {
    panels[tab.id] = root.querySelector('[data-gp-panel="' + tab.id + '"]');
  });

  root.querySelectorAll("[data-gp-tab]").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.gpTab));
  });

  function loadSheet(tab) {
    return new Promise((resolve) => {
      const cb = "sacGp_" + tab.id;
      const timeout = setTimeout(() => resolve({ tab: tab, table: null }), 8000);
      window[cb] = function (payload) {
        clearTimeout(timeout);
        try {
          delete window[cb];
        } catch (e) {}
        if (payload && payload.status === "ok" && payload.table) resolve({ tab: tab, table: payload.table });
        else resolve({ tab: tab, table: null });
      };
      const script = document.createElement("script");
      script.src =
        "https://docs.google.com/spreadsheets/d/" +
        SHEET_ID +
        "/gviz/tq?sheet=" +
        encodeURIComponent(tab.sheet) +
        "&tqx=out:json;responseHandler:" +
        cb;
      script.async = true;
      script.onerror = function () {
        clearTimeout(timeout);
        resolve({ tab: tab, table: null });
      };
      document.head.appendChild(script);
    });
  }

  Promise.all(tabs.map(loadSheet)).then((results) => {
    results.forEach((res) => {
      const panel = panels[res.tab.id];
      if (!panel) return;
      if (!res.table) {
        panel.innerHTML = emptyNote();
        return;
      }
      const rows =
        res.tab.kind === "team" ? parseTeam(res.table) : parseIndividual(res.table, res.tab.best);
      panel.innerHTML = paintRows(res.tab, rows);
      panel.addEventListener("change", function (e) {
        if (!e.target || !e.target.closest("[data-gp-month]")) return;
        const month = e.target.value;
        panel.innerHTML = paintRows(res.tab, rows, month);
      });
    });
  });
})();
