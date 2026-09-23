(function () {
  const root = document.getElementById("calc-app");
  if (!root) return;

  const clubRoadOrder = [
    "5k",
    "5-mile",
    "10k",
    "10-mile",
    "half",
    "marathon",
    "1-mile",
    "4-mile",
    "8k",
    "15k",
    "20k",
    "25k",
    "30k"
  ];
  const grubbOrder = [
    "1-mile",
    "5k",
    "6k",
    "4-mile",
    "8k",
    "5-mile",
    "10k",
    "7-mile",
    "12k",
    "15k",
    "10-mile",
    "20k",
    "half",
    "25k",
    "30k",
    "marathon",
    "50k",
    "50-mile",
    "100k",
    "150k",
    "100-mile",
    "200k"
  ];

  function parseMark(raw, kind) {
    const s = String(raw || "").trim().replace(",", ".");
    if (!s) return NaN;
    if (kind === "field") return Number(s);
    if (s.indexOf(":") === -1) return Number(s);
    const parts = s.split(":").map((n) => Number(n));
    if (parts.some((n) => Number.isNaN(n))) return NaN;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return "—";
    const sign = sec < 0 ? "-" : "";
    sec = Math.abs(sec);
    if (sec < 60) return sign + sec.toFixed(2);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const ss = s.toFixed(2).padStart(5, "0");
    if (h) return sign + h + ":" + String(m).padStart(2, "0") + ":" + ss;
    return sign + m + ":" + ss;
  }

  function formatMark(value, kind) {
    if (!Number.isFinite(value)) return "—";
    if (kind === "field") return value.toFixed(2) + " m";
    return formatTime(value);
  }

  function lookup(event, sex, age) {
    const table = event.factor[sex];
    if (!table) return null;
    const ages = Object.keys(table)
      .map(Number)
      .sort((a, b) => a - b);
    if (!ages.length) return null;
    if (age <= ages[0]) return table[ages[0]];
    if (age >= ages[ages.length - 1]) return table[ages[ages.length - 1]];
    if (table[age] != null) return table[age];
    return null;
  }

  function grade(event, sex, age, mark) {
    const factor = lookup(event, sex, age);
    const open = event.open[sex];
    if (!factor || !open || !mark) return null;
    const kind = event.kind;
    if (kind === "time") {
      const ageStd = open / factor;
      const percent = (100 * ageStd) / mark;
      return {
        factor,
        open,
        ageStd,
        percent,
        graded: mark * factor
      };
    }
    const ageStd = open / factor;
    const percent = (100 * mark) / ageStd;
    return {
      factor,
      open,
      ageStd,
      percent,
      graded: mark * factor
    };
  }

  function options(events, order, extra) {
    const list = order
      ? order.map((id) => events.find((e) => e.id === id)).filter(Boolean)
      : events;
    const html = list.map((e) => `<option value="${e.id}">${e.label}</option>`).join("");
    return extra ? html + extra : html;
  }

  function interpolateRoad(events, km, sex, age) {
    const sorted = events
      .filter((e) => e.km)
      .slice()
      .sort((a, b) => a.km - b.km);
    if (!sorted.length || km < sorted[0].km || km > sorted[sorted.length - 1].km) return null;
    let lo = sorted[0];
    let hi = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length; i++) {
      if (Math.abs(sorted[i].km - km) < 0.0001) return sorted[i];
      if (sorted[i].km <= km) lo = sorted[i];
      if (sorted[i].km >= km) {
        hi = sorted[i];
        break;
      }
    }
    if (lo.id === hi.id) return lo;
    const u = (Math.log(km) - Math.log(lo.km)) / (Math.log(hi.km) - Math.log(lo.km));
    const facLo = lookup(lo, sex, age);
    const facHi = lookup(hi, sex, age);
    if (!facLo || !facHi) return null;
    return {
      id: "custom",
      label: km + " km",
      km,
      kind: "time",
      open: { [sex]: lo.open[sex] * (1 - u) + hi.open[sex] * u },
      factor: { [sex]: { [age]: facLo * (1 - u) + facHi * u } }
    };
  }

  fetch("data/age-grade.json")
    .then((r) => r.json())
    .then((data) => {
      root.innerHTML = `
        <div class="tabs" role="tablist">
          <button type="button" aria-selected="true" data-tab="club">Club road</button>
          <button type="button" aria-selected="false" data-tab="grubb">Howard Grubb</button>
          <button type="button" aria-selected="false" data-tab="masters">Masters Athletics</button>
        </div>
        <form class="calc-form" id="calc-form">
          <div class="calc-grid">
            <label>Gender
              <select name="sex">
                <option value="M">Men</option>
                <option value="F">Women</option>
              </select>
            </label>
            <label>Age on the day
              <input name="age" type="number" min="5" max="110" value="45" required>
            </label>
            <label>Event
              <select name="event">${options(data.road.events, clubRoadOrder)}</select>
            </label>
            <label class="calc-custom" data-custom>
              Distance (km)
              <input name="km" type="number" min="1.6" max="200" step="0.1" placeholder="e.g. 8.05">
            </label>
            <label>Performance
              <input name="mark" type="text" placeholder="e.g. 21:30 or 1:23:45" required>
            </label>
          </div>
          <p class="form-note" data-hint>SAC’s road-only calculator, 2025 tables. Times as mm:ss or h:mm:ss. Parkrun is 5 km.</p>
          <button class="btn btn-navy" type="submit">Calculate</button>
        </form>
        <div class="calc-out" id="calc-out" hidden></div>
      `;

      const form = root.querySelector("#calc-form");
      const out = root.querySelector("#calc-out");
      const hint = root.querySelector("[data-hint]");
      const eventSel = form.event;
      const customBox = root.querySelector("[data-custom]");
      let set = "club";

      function events() {
        return set === "masters" ? data.tf.events : data.road.events;
      }

      function syncCustom() {
        const on = set === "grubb" && eventSel.value === "custom";
        customBox.classList.toggle("is-on", on);
      }

      function setTab(name) {
        set = name;
        root.querySelectorAll("[data-tab]").forEach((b) =>
          b.setAttribute("aria-selected", b.dataset.tab === name ? "true" : "false")
        );
        if (name === "club") {
          eventSel.innerHTML = options(data.road.events, clubRoadOrder);
          hint.textContent =
            "SAC’s road-only calculator, 2025 tables. Times as mm:ss or h:mm:ss. Parkrun is 5 km.";
        } else if (name === "grubb") {
          eventSel.innerHTML = options(
            data.road.events,
            grubbOrder,
            '<option value="custom">Other distance (km)</option>'
          );
          hint.textContent =
            "Howard Grubb 2025 road tables — every listed distance, or enter a custom km.";
        } else {
          eventSel.innerHTML = options(data.tf.events);
          hint.textContent = "Masters Athletics / WMA 2023. Times as seconds or mm:ss. Jumps and throws in metres.";
        }
        syncCustom();
        out.hidden = true;
      }

      root.querySelectorAll("[data-tab]").forEach((btn) => {
        btn.addEventListener("click", () => setTab(btn.dataset.tab));
      });
      eventSel.addEventListener("change", syncCustom);

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const sex = form.sex.value;
        const age = Number(form.age.value);
        let event = events().find((ev) => ev.id === form.event.value);
        if (set === "grubb" && form.event.value === "custom") {
          event = interpolateRoad(data.road.events, Number(form.km.value), sex, age);
        }
        if (!event) {
          out.hidden = false;
          out.innerHTML = "<p>Check the age, event and performance and try again.</p>";
          return;
        }
        const mark = parseMark(form.mark.value, event.kind);
        const result = grade(event, sex, age, mark);
        if (!result) {
          out.hidden = false;
          out.innerHTML = "<p>Check the age, event and performance and try again.</p>";
          return;
        }
        out.hidden = false;
        out.innerHTML = `
          <p class="calc-percent">${result.percent.toFixed(1)}<span>%</span></p>
          <p class="calc-label">Grand Prix / age-grade score</p>
          <dl class="calc-facts">
            <div><dt>Age standard</dt><dd>${formatMark(result.ageStd, event.kind)}</dd></div>
            <div><dt>Age-graded equivalent</dt><dd>${formatMark(result.graded, event.kind)}</dd></div>
            <div><dt>Open standard</dt><dd>${formatMark(result.open, event.kind)}</dd></div>
            <div><dt>Factor</dt><dd>${result.factor.toFixed(4)}</dd></div>
          </dl>
        `;
      });
    })
    .catch(() => {
      root.innerHTML = "<p>The calculator tables could not be loaded. Refresh the page and try again.</p>";
    });
})();
