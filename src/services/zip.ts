// Minimal dependency-free ZIP reader/writer, just enough to produce and parse
// genuine OOXML (.docx) packages without pulling in a third-party zip library.
// Writing always uses the STORE method (no compression) — a fully legal ZIP
// variant that every OOXML-capable app (Word, LibreOffice, Google Docs) opens
// fine, and it sidesteps needing a streaming compressor for the write path.
// Reading must still handle both STORE and DEFLATE, since real Word documents
// downloaded from elsewhere are almost always DEFLATE-compressed.

export interface ZipEntry { name: string; data: Uint8Array }

// Generous cap on total decompressed bytes a ZIP is allowed to expand to.
// Resumes are small text documents; this is far above any legitimate .docx
// while still rejecting a crafted "zip bomb" long before it exhausts memory.
export const zipBombLimitBytes = 25_000_000;

const crcTable = (() => {
 const table = new Uint32Array(256);
 for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  table[n] = c >>> 0;
 }
 return table;
})();

function crc32(data: Uint8Array): number {
 let crc = 0xffffffff;
 for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
 return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(): { time: number; date: number } {
 const now = new Date();
 const time = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((Math.floor(now.getSeconds() / 2)) & 0x1f);
 const date = (((now.getFullYear() - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0xf) << 5) | (now.getDate() & 0x1f);
 return { time, date };
}

export function createZip(entries: ZipEntry[]): Blob {
 const encoder = new TextEncoder();
 const { time, date } = dosDateTime();
 const parts: Uint8Array[] = [];
 const centralParts: Uint8Array[] = [];
 let offset = 0;
 for (const entry of entries) {
  const nameBytes = encoder.encode(entry.name);
  const crc = crc32(entry.data);
  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true);
  local.setUint16(4, 20, true);
  local.setUint16(6, 0, true);
  local.setUint16(8, 0, true);
  local.setUint16(10, time, true);
  local.setUint16(12, date, true);
  local.setUint32(14, crc, true);
  local.setUint32(18, entry.data.length, true);
  local.setUint32(22, entry.data.length, true);
  local.setUint16(26, nameBytes.length, true);
  local.setUint16(28, 0, true);
  parts.push(new Uint8Array(local.buffer), nameBytes, entry.data);
  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true);
  central.setUint16(4, 20, true);
  central.setUint16(6, 20, true);
  central.setUint16(8, 0, true);
  central.setUint16(10, 0, true);
  central.setUint16(12, time, true);
  central.setUint16(14, date, true);
  central.setUint32(16, crc, true);
  central.setUint32(20, entry.data.length, true);
  central.setUint32(24, entry.data.length, true);
  central.setUint16(28, nameBytes.length, true);
  central.setUint16(30, 0, true);
  central.setUint16(32, 0, true);
  central.setUint16(34, 0, true);
  central.setUint16(36, 0, true);
  central.setUint32(38, 0, true);
  central.setUint32(42, offset, true);
  centralParts.push(new Uint8Array(central.buffer), nameBytes);
  offset += 30 + nameBytes.length + entry.data.length;
 }
 const centralStart = offset;
 const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
 const end = new DataView(new ArrayBuffer(22));
 end.setUint32(0, 0x06054b50, true);
 end.setUint16(4, 0, true);
 end.setUint16(6, 0, true);
 end.setUint16(8, entries.length, true);
 end.setUint16(10, entries.length, true);
 end.setUint32(12, centralSize, true);
 end.setUint32(16, centralStart, true);
 end.setUint16(20, 0, true);
 // Cast needed: TS's lib.dom types BlobPart as requiring an ArrayBuffer-backed
 // view, but these Uint8Arrays are typed as ArrayBufferLike-backed; at runtime
 // Blob accepts any Uint8Array regardless of its backing buffer type.
 return new Blob([...parts, ...centralParts, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' });
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
 if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed Word documents. Try a recent version of Chrome, Edge, Firefox, or Safari.');
 const stream = new DecompressionStream('deflate-raw');
 const writer = stream.writable.getWriter();
 // Cast needed: same ArrayBufferLike-vs-ArrayBuffer generic mismatch as above;
 // WritableStream<BufferSource> accepts this Uint8Array fine at runtime.
 const bodyPromise = writer.write(data as BufferSource).then(() => writer.close());
 const chunks: Uint8Array[] = [];
 const reader = stream.readable.getReader();
 let total = 0;
 for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push(value);
  total += value.length;
  if (total > zipBombLimitBytes) throw new Error('This file is too large to import safely.');
 }
 await bodyPromise;
 const out = new Uint8Array(total);
 let pos = 0;
 for (const chunk of chunks) { out.set(chunk, pos); pos += chunk.length; }
 return out;
}

const badZipMessage = 'This file is not a valid Word document (.docx) or ZIP archive.';

export async function readZip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
 const bytes = new Uint8Array(buffer);
 const view = new DataView(buffer);
 const maxBack = Math.min(bytes.length, 65535 + 22);
 let eocdOffset = -1;
 for (let i = bytes.length - 22; i >= bytes.length - maxBack && i >= 0; i--) {
  if (view.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break; }
 }
 if (eocdOffset === -1) throw new Error(badZipMessage);
 const entryCount = view.getUint16(eocdOffset + 10, true);
 const centralSize = view.getUint32(eocdOffset + 12, true);
 const centralOffset = view.getUint32(eocdOffset + 16, true);
 if (centralOffset + centralSize > bytes.length) throw new Error(badZipMessage);
 const decoder = new TextDecoder();
 const result = new Map<string, Uint8Array>();
 let totalUncompressed = 0;
 let pointer = centralOffset;
 for (let i = 0; i < entryCount; i++) {
  if (pointer + 46 > bytes.length || view.getUint32(pointer, true) !== 0x02014b50) throw new Error(badZipMessage);
  const method = view.getUint16(pointer + 10, true);
  const compressedSize = view.getUint32(pointer + 20, true);
  const uncompressedSize = view.getUint32(pointer + 24, true);
  const nameLen = view.getUint16(pointer + 28, true);
  const extraLen = view.getUint16(pointer + 30, true);
  const commentLen = view.getUint16(pointer + 32, true);
  const localOffset = view.getUint32(pointer + 42, true);
  const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLen));
  totalUncompressed += uncompressedSize;
  if (totalUncompressed > zipBombLimitBytes) throw new Error('This file is too large to import safely.');
  if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(badZipMessage);
  const localNameLen = view.getUint16(localOffset + 26, true);
  const localExtraLen = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + localNameLen + localExtraLen;
  if (dataStart + compressedSize > bytes.length) throw new Error(badZipMessage);
  const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
  let data: Uint8Array;
  if (method === 0) data = compressed;
  else if (method === 8) data = await inflateRaw(compressed);
  else throw new Error('This Word document uses an unsupported compression method.');
  if (data.length !== uncompressedSize) throw new Error(badZipMessage);
  result.set(name, data);
  pointer += 46 + nameLen + extraLen + commentLen;
 }
 return result;
}
