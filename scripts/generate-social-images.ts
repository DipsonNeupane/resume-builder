import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { publicPages } from '../src/seo/policy';

const check = process.argv.includes('--check');
const width = 1200;
const height = 630;

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

function render(source: string): Buffer {
  const seed = hash(source);
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  const accent = [[183, 47, 69], [242, 168, 188], [242, 200, 75]][seed % 3];
  const secondary = [[45, 12, 27], [58, 16, 36], [77, 22, 48]][(seed >>> 3) % 3];
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1); pixels[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      const band = x > 760 + (seed % 120) || y > 500 - (seed % 80);
      const stripe = ((x + y + (seed % 97)) % (150 + seed % 90)) < 12;
      const color = stripe ? accent : band ? secondary : [24, 6, 15];
      pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2]; pixels[offset + 3] = 255;
    }
  }
  // Two forward strokes are the brand mark. Their position varies by route while
  // remaining decorative and content-free.
  const originX = 90 + (seed % 180); const originY = 120 + ((seed >>> 8) % 130);
  for (let y = originY; y < originY + 280; y += 1) for (let x = originX; x < originX + 58; x += 1) {
    const shifted = x - Math.floor((y - originY) * .24);
    for (const [dx, color] of [[0, [255, 208, 223]], [105, [242, 200, 75]]] as const) {
      const px = shifted + dx; if (px >= width) continue;
      const offset = y * (width * 4 + 1) + 1 + px * 4;
      pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2]; pixels[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

for (const [path, details] of Object.entries(publicPages)) {
  const file = `public${details.socialImage}`;
  // Relevant public metadata participates in the image bytes, so a title or
  // description revision makes the checked artifact stale without exposing content.
  const image = render(`${path}\0${details.title}\0${details.description}\0${details.lastModified}`);
  if (check) {
    if (!readFileSync(file).equals(image)) throw new Error(`Social image stale: ${file}. Run npm run social:generate.`);
  } else {
    mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
    writeFileSync(file, image);
  }
}
const defaultCard = readFileSync('public/social/home.png');
if (check) {
  if (!readFileSync('public/social-card.png').equals(defaultCard)) throw new Error('Default social image stale: public/social-card.png. Run npm run social:generate.');
} else writeFileSync('public/social-card.png', defaultCard);
console.log(check ? 'Social images match the public route registry.' : `Generated ${Object.keys(publicPages).length} route-specific social images.`);
