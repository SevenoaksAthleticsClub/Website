const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const srcPath = path.join(
  __dirname,
  "..",
  "images",
  "celebrating-50",
  "V2 Celebrating 50 years SAC copy.png"
);
const destPath = path.join(__dirname, "..", "images", "celebrating-50.png");

(async () => {
  const img = await loadImage(srcPath);
  const src = createCanvas(img.width, img.height);
  const ctx = src.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const pad = 24;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const targetW = 1400;
  const targetH = Math.round((ch * targetW) / cw);
  const out = createCanvas(targetW, targetH);
  const octx = out.getContext("2d");
  octx.drawImage(img, minX, minY, cw, ch, 0, 0, targetW, targetH);
  fs.writeFileSync(destPath, out.toBuffer("image/png"));
  console.log({ crop: [minX, minY, cw, ch], out: [targetW, targetH], bytes: fs.statSync(destPath).size });
})();
