#!/usr/bin/env node
/** Pull race-name entry URLs from the live SAC flexcal. */
const https = require("https");
const fs = require("fs");
const path = require("path");

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

const SRC = "https://www.7oaks-ac.org.uk/WebPages/Calc/flexcal.php";

https
  .get(SRC, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
    let html = "";
    res.on("data", (chunk) => (html += chunk));
    res.on("end", () => {
      const events = [];
      html.split(/<CAPTION>/i).forEach((section) => {
        const head = section.match(/>([A-Za-z]+) (\d{4})</);
        if (!head) return;
        const month = MONTHS[head[1].toLowerCase()];
        if (!month) return;
        const year = head[2];
        section.split(/<TR vAlign=center>/i).slice(1).forEach((row) => {
          const day = (row.match(/<TD align=center width=27>(\d+)<\/TD>/i) || [])[1];
          const url = (row.match(/name="detlink" value="([^"]*)"/i) || [])[1];
          const title = (row.match(/alt="([^"]*)"/i) || [])[1];
          if (!day || !url || !title) return;
          if (/^mailto:/i.test(url)) return;
          events.push({
            date: year + "-" + month + "-" + String(day).padStart(2, "0"),
            title,
            url
          });
        });
      });
      const dest = path.join(__dirname, "..", "data", "race-entry.json");
      fs.writeFileSync(dest, JSON.stringify(events, null, 2) + "\n");
      console.log("wrote " + events.length + " race entry links");
    });
  })
  .on("error", (err) => {
    console.error(err.message);
    process.exit(1);
  });
