const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const srcPath = path.join(__dirname, "..", "images", "celebrating-50.png");
const destPath = path.join(__dirname, "..", "images", "celebrating-50-hero.png");

(async () => {
  const img = await loadImage(srcPath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const image = ctx.getImageData(0, 0, img.width, img.height);
  const { data, width, height } = image;

  const shield = new Uint8Array(width * height);
  const queue = [];
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a > 20 && r > 180 && g > 140 && b < 90) {
      shield[p] = 1;
      queue.push(p);
    }
  }

  const dirs = [-1, 1, -width, width];
  for (let q = 0; q < queue.length; q++) {
    const p = queue[q];
    const x = p % width;
    for (let d = 0; d < 4; d++) {
      if (d < 2 && ((d === 0 && x === 0) || (d === 1 && x === width - 1))) continue;
      const n = p + dirs[d];
      if (n < 0 || n >= width * height || shield[n]) continue;
      if (data[n * 4 + 3] < 12) continue;
      shield[n] = 1;
      queue.push(n);
    }
  }

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] < 12 || shield[p]) continue;
    data[i] = 243;
    data[i + 1] = 238;
    data[i + 2] = 228;
  }

  ctx.putImageData(image, 0, 0);
  fs.writeFileSync(destPath, canvas.toBuffer("image/png"));
  console.log({ bytes: fs.statSync(destPath).size });
})();
