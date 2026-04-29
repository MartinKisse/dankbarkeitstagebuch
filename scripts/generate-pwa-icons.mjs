import sharp from "sharp";

const icons = [
  ["favicon-16.png", 16],
  ["favicon-32.png", 32],
  ["apple-touch.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
];

const background = "#f5f3ef";
const logoPath = "public/logo.png";

async function prepareLogo(size) {
  const trimmed = await sharp(logoPath)
    .trim({ background: "#ffffff", threshold: 8 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = trimmed.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];

    if (red > 248 && green > 248 && blue > 248) {
      pixels[index + 3] = 0;
    }
  }

  return sharp(pixels, { raw: trimmed.info })
    .resize({
      width: size,
      height: size,
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
}

for (const [fileName, size] of icons) {
  const logoSize = Math.round(size * 0.6);
  const logo = await prepareLogo(logoSize);

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(`public/${fileName}`);

  console.log(`Generated ${fileName} (${size}x${size})`);
}
