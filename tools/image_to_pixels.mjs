/**
 * Converts a PNG image to an array of ARGB pixels (step 1 of
 * dev_guide/extracting_colors.md), ready for QuantizerCelebi.quantize.
 *
 * Has no dependencies: PNG decoding uses node:zlib. Supports 8-bit,
 * non-interlaced grayscale, gray+alpha, RGB, and RGBA PNGs, which covers the
 * output of tools/resize_image.py.
 *
 * Usage:
 *   node tools/image_to_pixels.mjs sunday-image-128x128.png
 *   node tools/image_to_pixels.mjs in.png -o pixels.json
 *
 * Writes a JSON array of unsigned 32-bit ARGB integers in row-major order,
 * the same format as argbFromRgb in typescript/utils/color_utils.ts.
 */

import {readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname, extname, join} from 'node:path';
import {inflateSync} from 'node:zlib';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Bytes per pixel for each supported PNG color type at bit depth 8.
const CHANNELS = {0: 1, 2: 3, 4: 2, 6: 4};

/**
 * Decodes a PNG file.
 *
 * @param {Uint8Array} file The PNG file contents.
 * @return {{width: number, height: number, colorType: number,
 *     data: Uint8Array}} The image, with unfiltered scanlines in `data`.
 */
export function decodePng(file) {
  if (!PNG_SIGNATURE.every((byte, i) => file[i] === byte)) {
    throw new Error('not a PNG file');
  }
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat = [];

  for (let pos = 8; pos < file.length;) {
    const length = view.getUint32(pos);
    const type = String.fromCharCode(...file.subarray(pos + 4, pos + 8));
    const bodyStart = pos + 8;
    const body = file.subarray(bodyStart, bodyStart + length);
    pos += 12 + length;  // length + type + body + CRC

    if (type === 'IHDR') {
      width = view.getUint32(bodyStart);
      height = view.getUint32(bodyStart + 4);
      const bitDepth = body[8];
      colorType = body[9];
      const interlace = body[12];
      if (bitDepth !== 8 || !(colorType in CHANNELS) || interlace !== 0) {
        throw new Error(
            `unsupported PNG (bit depth ${bitDepth}, color type ${colorType}, ` +
            `interlace ${interlace}); re-save with tools/resize_image.py`);
      }
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (colorType < 0) throw new Error('PNG is missing IHDR');

  const bpp = CHANNELS[colorType];
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const data = new Uint8Array(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? data[out + x - bpp] : 0;
      const up = y > 0 ? data[out - stride + x] : 0;
      const upLeft = y > 0 && x >= bpp ? data[out - stride + x - bpp] : 0;
      let predictor;
      switch (filter) {
        case 0: predictor = 0; break;
        case 1: predictor = left; break;
        case 2: predictor = up; break;
        case 3: predictor = (left + up) >> 1; break;
        case 4: predictor = paeth(left, up, upLeft); break;
        default: throw new Error(`invalid PNG filter type ${filter}`);
      }
      data[out + x] = (line[x] + predictor) & 0xff;
    }
  }
  return {width, height, colorType, data};
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Returns the image's pixels as unsigned ARGB integers, row by row.
 *
 * @param {{colorType: number, data: Uint8Array}} png A decoded PNG.
 * @return {number[]}
 */
export function imageToPixels(png) {
  const bpp = CHANNELS[png.colorType];
  const d = png.data;
  const pixels = [];
  for (let i = 0; i < d.length; i += bpp) {
    let r, g, b, a;
    switch (png.colorType) {
      case 0: r = g = b = d[i]; a = 255; break;
      case 4: r = g = b = d[i]; a = d[i + 1]; break;
      case 2: r = d[i]; g = d[i + 1]; b = d[i + 2]; a = 255; break;
      default: r = d[i]; g = d[i + 1]; b = d[i + 2]; a = d[i + 3];
    }
    pixels.push(((a << 24) | (r << 16) | (g << 8) | b) >>> 0);
  }
  return pixels;
}

function main(args) {
  let input;
  let output;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' || args[i] === '--output') {
      output = args[++i];
    } else if (!input) {
      input = args[i];
    }
  }
  if (!input) {
    console.error('usage: node tools/image_to_pixels.mjs <image.png> [-o out.json]');
    return 2;
  }
  output ??= join(dirname(input), `${basename(input, extname(input))}.pixels.json`);

  try {
    const png = decodePng(readFileSync(input));
    const pixels = imageToPixels(png);
    writeFileSync(output, JSON.stringify(pixels));
    console.log(`${output} (${png.width}x${png.height}, ${pixels.length} pixels)`);
    return 0;
  } catch (e) {
    console.error(`error: ${e.message}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2));
}
