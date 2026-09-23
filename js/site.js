(function () {
  const page = document.body.dataset.page || "";
  const root = document.body.dataset.root || "";
  const nav = [
    { href: "train.html", id: "train", label: "Train" },
    { href: "join.html", id: "join", label: "Join" },
    { href: "events.html", id: "events", label: "Events" },
    { href: "past.html", id: "past", label: "Reports" },
    { href: "juniors.html", id: "juniors", label: "Juniors" },
    { href: "about.html", id: "about", label: "About" },
    {
      href: "members.html",
      id: "members",
      label: "Members",
      children: [
        { href: "club-bests.html", id: "club-bests", label: "Club bests" },
        { href: "grand-prix.html", id: "grand-prix", label: "Grand Prix" },
        { href: "race-results.html", id: "race-results", label: "Race results" },
        { href: "calculators.html", id: "calculators", label: "Calculators" }
      ]
    }
  ];

  function current(id, asParent) {
    if (page === id) return ' aria-current="page"';
    if ((page === "sevenoaks-7" || page === "racing") && id === "events") return ' aria-current="page"';
    if (
      asParent &&
      id === "members" &&
      (page === "club-bests" || page === "grand-prix" || page === "race-results" || page === "calculators")
    ) {
      return ' aria-current="page"';
    }
    if (
      (page === "juniors-join" || page === "juniors-train" || page === "juniors-reports" || page === "juniors-records") &&
      id === "juniors"
    ) {
      return ' aria-current="page"';
    }
    return "";
  }

  function navItem(item) {
    if (item.children) {
      const links = item.children
        .map(
          (child) =>
            `<a href="${root}${child.href}"${current(child.id)}>${child.label}</a>`
        )
        .join("");
      return `<div class="nav-drop">
            <a href="${root}${item.href}"${current(item.id, true)} aria-haspopup="true">${item.label}<span class="nav-caret" aria-hidden="true"></span></a>
            <div class="nav-drop-menu">${links}</div>
          </div>`;
    }
    return `<a href="${root}${item.href}"${current(item.id)}>${item.label}</a>`;
  }

  const header = document.querySelector("[data-header]");
  if (header) {
    header.innerHTML = `
      <div class="promo">Your next running adventure starts here · Come and join us · <a href="${root}join.html#get-in-touch">Contact us</a></div>
      <div class="site-header">
        <div class="wrap header-inner">
          <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav">
            <span class="bars" aria-hidden="true"></span> Menu
          </button>
          <a class="brand brand-50" href="${root}index.html">
            <img src="${root}images/celebrating-50.png" width="210" height="114" alt="Sevenoaks Athletics Club, celebrating 50 years, 1976 to 2026">
          </a>
          <nav class="nav" id="site-nav">
            ${nav.map(navItem).join("")}
            <a class="nav-cta" href="${root}join.html#get-in-touch">Get in touch</a>
          </nav>
        </div>
      </div>`;
  }

  const footer = document.querySelector("[data-footer]");
  if (footer) {
    footer.innerHTML = `
      <footer class="site-footer">
        <div class="wrap footer-grid">
          <div>
            <a class="brand" href="${root}index.html" style="color:#f3eee4">
              <img class="footer-badge" src="${root}images/badge.jpg" width="88" height="88" alt="Sevenoaks Athletics Club">
              <span class="brand-text">
                <strong>Sevenoaks AC</strong>
                <span style="color:#e4c77a">Est. 1976 · Sevenoaks, Kent</span>
              </span>
            </a>
            <p style="color:rgba(243,238,228,.7);margin:1rem 0 0;max-width:22rem">A friendly mixed club for runners and athletes of every pace — from first Tuesday night to county medals.</p>
            <div class="socials">
              <a href="https://en-gb.facebook.com/sevenoaksathleticsclub/" target="_blank" rel="noopener">Facebook</a>
              <a href="https://www.instagram.com/sevenoaksathleticsclub" target="_blank" rel="noopener">Instagram</a>
              <a href="https://www.strava.com/clubs/sevenoaks-athletics-club-66804" target="_blank" rel="noopener">Strava</a>
              <a href="https://twitter.com/SevenoaksAC" target="_blank" rel="noopener">X</a>
            </div>
          </div>
          <div>
            <h4>Visit</h4>
            <ul>
              <li><a href="${root}train.html">Training times</a></li>
              <li><a href="${root}join.html">Join the club</a></li>
              <li><a href="${root}juniors.html">Juniors</a></li>
              <li><a href="${root}juniors-join.html">Join juniors</a></li>
              <li><a href="${root}juniors-reports.html">Junior reports</a></li>
              <li><a href="${root}juniors-records.html">Junior records</a></li>
            </ul>
          </div>
          <div>
            <h4>Club life</h4>
            <ul>
              <li><a href="${root}events.html">Club calendar</a></li>
              <li><a href="${root}past.html">Reports</a></li>
              <li><a href="${root}sevenoaks-7.html">Sevenoaks 7</a></li>
              <li><a href="${root}about.html">About &amp; history</a></li>
              <li><a href="${root}policies.html">Policies</a></li>
              <li><a href="${root}members.html">Members</a></li>
              <li><a href="${root}club-bests.html">Club bests</a></li>
              <li><a href="${root}grand-prix.html">Grand Prix</a></li>
            </ul>
          </div>
          <div>
            <h4>Get in touch</h4>
            <ul>
              <li>Kerri Folkesson</li>
              <li>Membership secretary</li>
              <li><a href="mailto:membership@7oaks-ac.org.uk">membership@7oaks-ac.org.uk</a></li>
            </ul>
          </div>
        </div>
        <div class="wrap legal">
          <span>© ${new Date().getFullYear()} Sevenoaks Athletics Club · Affiliated to England Athletics</span>
          <span>Template for review — content taken from the current club site</span>
        </div>
      </footer>`;
  }

  const btn = document.querySelector(".menu-btn");
  const navEl = document.getElementById("site-nav");
  if (btn && navEl) {
    btn.addEventListener("click", () => {
      const open = navEl.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  markNextSession();
  setupTabs();
  setupForm();
})();

function markNextSession() {
  const cards = document.querySelectorAll("[data-session]");
  if (!cards.length) return;
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const sessions = [
    { day: 2, hour: 19 },
    { day: 4, hour: 19 },
    { day: 0, hour: 10 }
  ];
  let next = 2;
  for (let i = 0; i < 8; i++) {
    const d = (day + i) % 7;
    const match = sessions.find((s) => s.day === d);
    if (!match) continue;
    if (i === 0 && hour >= match.hour) continue;
    next = match.day;
    break;
  }
  cards.forEach((card) => {
    if (Number(card.dataset.session) === next) card.classList.add("next");
  });
}

function setupTabs() {
  const tabs = document.querySelectorAll("[data-tab]");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const group = tab.closest("[data-tabs]");
      group.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-selected", t === tab ? "true" : "false"));
      group.querySelectorAll("[data-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.panel !== tab.dataset.tab;
      });
      if (tab.dataset.tab === "past") history.replaceState(null, "", "#past");
    });
  });
  if (location.hash === "#past") {
    const past = document.querySelector('[data-tab="past"]');
    if (past) past.click();
  }
}

function setupForm() {
  const form = document.querySelector("[data-contact-form]");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const subject = encodeURIComponent(data.subject || "Sevenoaks AC enquiry");
    const body = encodeURIComponent(
      `Name: ${data.name}\nEmail: ${data.email}\n\n${data.message}`
    );
    const to = /welfare/i.test(data.subject || "") ? "paul@7oaks-ac.org.uk" : "membership@7oaks-ac.org.uk";
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    const note = form.querySelector(".form-note");
    if (note) note.textContent = `Opening your email app — if nothing happens, write to ${to}.`;
  });
}
