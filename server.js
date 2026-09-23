const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const root = __dirname;
const port = process.env.PORT || 5173;
const SHEET_ID = "11e8-4Uf5cP1nP3oH8ztnmiRfSqsP3f0xBIBbmAOiwHQ";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf"
};

function fetchUrl(url, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 6) return reject(new Error("too many redirects"));
    https
      .get(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "*/*"
          }
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const next = new URL(res.headers.location, url).href;
            res.resume();
            return resolve(fetchUrl(next, hops + 1));
          }
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              type: res.headers["content-type"] || "",
              body: Buffer.concat(chunks)
            })
          );
        }
      )
      .on("error", reject);
  });
}

function parseDriveFileIds(html, folderId) {
  const ids = [];
  const seen = {};
  const re = /\/d\/([a-zA-Z0-9_-]{20,})/g;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    if (id === folderId || seen[id]) continue;
    seen[id] = true;
    ids.push(id);
  }
  return ids;
}

async function listDriveFolder(folderId) {
  const key = process.env.GOOGLE_API_KEY || "";
  if (key) {
    const q = encodeURIComponent("'" + folderId + "' in parents and trashed = false");
    const api =
      "https://www.googleapis.com/drive/v3/files?q=" +
      q +
      "&fields=files(id,name,mimeType)&pageSize=50&key=" +
      encodeURIComponent(key);
    const res = await fetchUrl(api);
    if (res.status === 200) {
      const data = JSON.parse(res.body.toString("utf8"));
      return (data.files || [])
        .filter((f) => /^image\//.test(f.mimeType || "") || /\.(jpe?g|png|gif|webp)$/i.test(f.name || ""))
        .map((f) => ({
          id: f.id,
          name: f.name,
          src: "https://drive.google.com/thumbnail?id=" + encodeURIComponent(f.id) + "&sz=w1600"
        }));
    }
  }

  const views = [
    "https://drive.google.com/embeddedfolderview?id=" + folderId + "#grid",
    "https://drive.google.com/drive/folders/" + folderId + "?usp=sharing",
    "https://drive.google.com/folderview?id=" + folderId + "&usp=sharing"
  ];
  for (const url of views) {
    const res = await fetchUrl(url);
    const html = res.body.toString("utf8");
    if (/accounts\.google\.com\/v3\/signin/i.test(html) || res.status === 401) continue;
    const ids = parseDriveFileIds(html, folderId);
    if (ids.length) {
      return ids.map((id) => ({
        id: id,
        name: id,
        src: "https://drive.google.com/thumbnail?id=" + encodeURIComponent(id) + "&sz=w1600"
      }));
    }
  }
  return [];
}

const folderCache = {};

http
  .createServer((req, res) => {
    const reqUrl = new URL(req.url, "http://localhost");
    if (reqUrl.pathname === "/api/drive-folder") {
      const id = (reqUrl.searchParams.get("id") || "").replace(/[^a-zA-Z0-9_-]/g, "");
      if (!id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ images: [], error: "missing" }));
        return;
      }
      const cached = folderCache[id];
      if (cached && Date.now() - cached.at < 120000) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ images: cached.images, error: cached.error || "" }));
        return;
      }
      listDriveFolder(id)
        .then((images) => {
          const error = images.length ? "" : "private";
          folderCache[id] = { at: Date.now(), images: images, error: error };
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ images: images, error: error }));
        })
        .catch(() => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ images: [], error: "private" }));
        });
      return;
    }

    if (reqUrl.pathname === "/api/sheet-csv") {
      const gid = (reqUrl.searchParams.get("gid") || "").replace(/[^0-9-]/g, "");
      if (!gid) {
        res.writeHead(400);
        res.end();
        return;
      }
      const src =
        "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/export?format=csv&gid=" + gid;
      fetchUrl(src)
        .then((out) => {
          const text = out.body.toString("utf8");
          if (out.status !== 200 || /accounts\.google\.com/i.test(text.slice(0, 400))) {
            res.writeHead(404);
            res.end();
            return;
          }
          res.writeHead(200, {
            "Content-Type": "text/csv; charset=utf-8",
            "Cache-Control": "public, max-age=120"
          });
          res.end(out.body);
        })
        .catch(() => {
          res.writeHead(502);
          res.end();
        });
      return;
    }

    if (reqUrl.pathname === "/api/drive-img") {
      const id = (reqUrl.searchParams.get("id") || "").replace(/[^a-zA-Z0-9_-]/g, "");
      if (!id) {
        res.writeHead(400);
        res.end();
        return;
      }
      const src = "https://drive.google.com/thumbnail?id=" + id + "&sz=w1600";
      fetchUrl(src)
        .then((out) => {
          if (out.status !== 200 || !/^image\//.test(out.type)) {
            res.writeHead(404);
            res.end();
            return;
          }
          res.writeHead(200, { "Content-Type": out.type, "Cache-Control": "public, max-age=3600" });
          res.end(out.body);
        })
        .catch(() => {
          res.writeHead(404);
          res.end();
        });
      return;
    }

    let urlPath = decodeURIComponent(reqUrl.pathname);
    if (urlPath === "/") urlPath = "/index.html";
    const file = path.normalize(path.join(root, urlPath));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(port, "0.0.0.0", () => {
    console.log(`Sevenoaks AC template at http://localhost:${port}`);
  });
