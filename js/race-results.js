(function () {
  const root = document.querySelector("[data-results]");
  if (!root) return;

  const SHEET_ID = "11e8-4Uf5cP1nP3oH8ztnmiRfSqsP3f0xBIBbmAOiwHQ";
  const CALLBACK = "sacResultsFromSheet";

  function cellValue(cell) {
    if (!cell) return "";
    if (cell.f) return String(cell.f);
    if (typeof cell.v === "string" && cell.v.indexOf("Date(") === 0) {
      const m = cell.v.match(/Date\((\d+),(\d+),(\d+)/);
      if (m) {
        const y = Number(m[1]);
        const mo = String(Number(m[2]) + 1).padStart(2, "0");
        const d = String(Number(m[3])).padStart(2, "0");
        return y + "-" + mo + "-" + d;
      }
    }
    if (cell.v == null) return "";
    return String(cell.v);
  }

  function toIso(value) {
    const raw = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (uk) {
      let y = uk[3];
      if (y.length === 2) y = (Number(y) >= 70 ? "19" : "20") + y;
      return y + "-" + uk[2].padStart(2, "0") + "-" + uk[1].padStart(2, "0");
    }
    return raw;
  }

  function monthKey(iso) {
    return String(iso || "").slice(0, 7);
  }

  function monthLabel(key) {
    const m = String(key).match(/^(\d{4})-(\d{2})$/);
    if (!m) return key || "All dates";
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
    return months[Number(m[2]) - 1] + " " + m[1];
  }

  function findCol(cols, names) {
    for (let i = 0; i < names.length; i++) {
      const j = cols.indexOf(names[i]);
      if (j >= 0) return j;
    }
    return -1;
  }

  function parseTable(table) {
    const cols = (table.cols || []).map((c) => String(c.label || "").toLowerCase().trim());
    const iDate = findCol(cols, ["date"]);
    const iRace = findCol(cols, ["race"]);
    const iDist = findCol(cols, ["distance"]);
    const iPos = findCol(cols, ["position", "pos"]);
    const iName = findCol(cols, ["name", "master name", "athlete"]);
    const iTime = findCol(cols, ["time", "time fixed"]);
    const iGp = findCol(cols, ["gp", "new gp"]);
    const iType = findCol(cols, ["type"]);
    if (iRace < 0 || iName < 0) return [];
    return (table.rows || [])
      .map((row) => {
        const c = row.c || [];
        const name = cellValue(c[iName]).trim();
        const race = cellValue(c[iRace]).trim();
        if (!name || !race) return null;
        const date = toIso(iDate >= 0 ? cellValue(c[iDate]) : "");
        const typeRaw = iType >= 0 ? cellValue(c[iType]).toLowerCase() : "";
        const type = typeRaw.indexOf("track") >= 0 ? "track" : "road";
        const gp = iGp >= 0 ? cellValue(c[iGp]).trim() : "";
        return {
          date: date,
          month: monthKey(date),
          race: race,
          distance: iDist >= 0 ? cellValue(c[iDist]).trim() : "",
          position: iPos >= 0 ? cellValue(c[iPos]).trim() : "",
          name: name,
          time: iTime >= 0 ? cellValue(c[iTime]).trim() : "",
          gp: gp === "0" ? "" : gp,
          type: type
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.race.localeCompare(b.race) || a.name.localeCompare(b.name)));
  }

  let ROWS = [];
  let type = "all";
  let month = null;
  let query = "";

  function filtered() {
    return ROWS.filter((r) => {
      if (type !== "all" && r.type !== type) return false;
      if (month && r.month !== month) return false;
      if (query && r.name.toLowerCase().indexOf(query) < 0 && r.race.toLowerCase().indexOf(query) < 0) return false;
      return true;
    });
  }

  function paint(keepSearch) {
    const months = [];
    ROWS.forEach((r) => {
      if (type !== "all" && r.type !== type) return;
      if (r.month && months.indexOf(r.month) < 0) months.push(r.month);
    });
    months.sort().reverse();
    if (month === null && months[0]) month = months[0];
    else if (month && months.indexOf(month) < 0) month = months[0] || "";
    const rows = filtered();
    const monthOptions =
      '<option value=""' +
      (month === "" ? " selected" : "") +
      ">All months</option>" +
      months
        .map(
          (m) =>
            '<option value="' + m + '"' + (m === month ? " selected" : "") + ">" + monthLabel(m) + "</option>"
        )
        .join("");
    const body = rows
      .map(
        (r) =>
          "<tr><td>" +
          r.date +
          "</td><td>" +
          r.race +
          "</td><td>" +
          r.distance +
          "</td><td class='gp-num'>" +
          (r.position || "—") +
          "</td><td>" +
          r.name +
          "</td><td class='gp-num'>" +
          (r.time || "—") +
          "</td><td class='gp-num'>" +
          (r.gp || "—") +
          "</td></tr>"
      )
      .join("");
    root.innerHTML =
      '<div class="tabs" role="tablist">' +
      '<button type="button" data-res-type="all" aria-selected="' +
      (type === "all" ? "true" : "false") +
      '">All</button>' +
      '<button type="button" data-res-type="road" aria-selected="' +
      (type === "road" ? "true" : "false") +
      '">Road</button>' +
      '<button type="button" data-res-type="track" aria-selected="' +
      (type === "track" ? "true" : "false") +
      '">Track and field</button>' +
      "</div>" +
      '<div class="gp-when">' +
      '<p class="sub">' +
      rows.length +
      " result" +
      (rows.length === 1 ? "" : "s") +
      "</p>" +
      '<label class="gp-month">Month <select data-res-month>' +
      monthOptions +
      "</select></label>" +
      '<label class="gp-month">Search <input data-res-q type="search" value="' +
      query.replace(/"/g, "&quot;") +
      '" placeholder="Name or race"></label>' +
      "</div>" +
      "<div class='data-table gp-table'><table><thead><tr>" +
      "<th>Date</th><th>Race</th><th>Distance</th><th class='gp-num'>Pos</th><th>Name</th><th class='gp-num'>Time</th><th class='gp-num'>GP</th>" +
      "</tr></thead><tbody>" +
      (body || "<tr><td colspan='7'>No results match.</td></tr>") +
      "</tbody></table></div>";
    if (keepSearch) {
      const input = root.querySelector("[data-res-q]");
      if (input) {
        input.focus();
        const n = input.value.length;
        input.setSelectionRange(n, n);
      }
    }
  }

  root.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-res-type]");
    if (!btn) return;
    type = btn.dataset.resType;
    paint();
  });
  root.addEventListener("change", function (e) {
    if (e.target && e.target.hasAttribute("data-res-month")) {
      month = e.target.value;
      paint();
    }
  });
  root.addEventListener("input", function (e) {
    if (e.target && e.target.hasAttribute("data-res-q")) {
      query = e.target.value.trim().toLowerCase();
      paint(true);
    }
  });

  root.innerHTML = '<p class="sub">Loading results from Google Sheets…</p>';

  const timeout = setTimeout(() => {
    if (!ROWS.length) {
      root.innerHTML =
        '<p class="sub">Couldn’t load the results sheet. Check the Results tab is shared with anyone with the link.</p>';
    }
  }, 8000);

  window[CALLBACK] = function (payload) {
    clearTimeout(timeout);
    if (!payload || payload.status !== "ok" || !payload.table) {
      root.innerHTML = '<p class="sub">Couldn’t read the Results tab.</p>';
      return;
    }
    ROWS = parseTable(payload.table);
    if (!ROWS.length) {
      root.innerHTML = '<p class="sub">The Results tab loaded but had no rows.</p>';
      return;
    }
    paint();
  };

  const script = document.createElement("script");
  script.src =
    "https://docs.google.com/spreadsheets/d/" +
    SHEET_ID +
    "/gviz/tq?sheet=" +
    encodeURIComponent("Results") +
    "&tqx=out:json;responseHandler:" +
    CALLBACK;
  script.async = true;
  script.onerror = function () {
    clearTimeout(timeout);
    root.innerHTML = '<p class="sub">Couldn’t load the Results tab from Google Sheets.</p>';
  };
  document.head.appendChild(script);
})();
