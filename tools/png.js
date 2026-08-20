// Minimal PNG reader and writer, shared by the tracing tools.
//
// PNG is zlib over filtered scanlines and node ships zlib, so this is all it
// takes. Reading handles 8 bit truecolour with and without alpha, which is what
// every converter produces for this kind of image.

import { inflateSync, deflateSync } from 'node:zlib';

export function decodePng(buffer) {
  let pos = 8; // skip the signature
  const idat = [];
  let width = 0;
  let height = 0;
  let channels = 3;

  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length; // length, type, data, crc

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const colourType = data[9];
      if (data[8] !== 8) throw new Error(`only 8 bit images, got ${data[8]}`);
      if (colourType === 2) channels = 3;
      else if (colourType === 6) channels = 4;
      else throw new Error(`unsupported colour type ${colourType}`);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4, 255);

  // Each scanline carries a filter byte, and every filter is defined against
  // the pixel to the left and the line above, so this has to run in order.
  const line = Buffer.alloc(stride);
  const previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    raw.copy(line, 0, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);

    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? line[i - channels] : 0;
      const up = previous[i];
      const upLeft = i >= channels ? previous[i - channels] : 0;

      if (filter === 1) line[i] = (line[i] + left) & 255;
      else if (filter === 2) line[i] = (line[i] + up) & 255;
      else if (filter === 3) line[i] = (line[i] + ((left + up) >> 1)) & 255;
      else if (filter === 4) line[i] = (line[i] + paeth(left, up, upLeft)) & 255;
    }

    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      out[to] = line[from];
      out[to + 1] = line[from + 1];
      out[to + 2] = line[from + 2];
      out[to + 3] = channels === 4 ? line[from + 3] : 255;
    }

    line.copy(previous);
  }

  return { width, height, pixels: out };
}

// Writing one out, which is the other half of the job. Useful for looking at a
// sprite grid without a browser in the way: the grid is pure data, so it can be
// turned into a picture from a script and checked like any other output.
export function encodePng(width, height, rgb) {
  const raw = Buffer.alloc(height * (width * 3 + 1));

  for (let y = 0; y < height; y += 1) {
    // Filter type 0, none. These are flat blocks of colour and deflate handles
    // them well enough that a real filter would only cost time.
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // truecolour

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, body) {
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, body.length + 8)), body.length + 8);
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}
