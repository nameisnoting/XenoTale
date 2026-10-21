import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Render every app icon from the editable SVG; no background is added.
const publicDir = new URL('../public/', import.meta.url);
const svg = await fs.readFile(new URL('favicon.svg', publicDir), 'utf8');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const frames = new Map();
  for (const size of [16, 24, 32, 48, 64, 128, 192, 256, 512]) {
    const data = await page.evaluate(
      async ({ svg, size }) => {
        const image = new Image();
        image.src = 'data:image/svg+xml;base64,' + btoa(svg);
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, size, size);
        return canvas.toDataURL('image/png').split(',')[1];
      },
      { svg, size },
    );
    frames.set(size, Buffer.from(data, 'base64'));
    if (size === 192 || size === 512)
      await fs.writeFile(new URL(`icon-${size}.png`, publicDir), frames.get(size));
  }
  // Windows ICO directory with PNG frames for crisp rendering at each shell size.
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const entry = 6 + i * 16;
    const frame = frames.get(size);
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(frame.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += frame.length;
  });
  await fs.writeFile(
    new URL('xenotale.ico', publicDir),
    Buffer.concat([header, ...sizes.map((size) => frames.get(size))]),
  );
  console.log(
    `Generated transparent PNG and Windows icons from ${fileURLToPath(new URL('favicon.svg', publicDir))}`,
  );
} finally {
  await browser.close();
}
