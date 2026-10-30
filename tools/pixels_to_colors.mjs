/**
 * Quantizes ARGB pixels into prominent colors (step 2 of
 * dev_guide/extracting_colors.md) using QuantizerCelebi.
 *
 * Reads the pixels JSON written by tools/image_to_pixels.mjs. Uses the
 * published @material/material-color-utilities package, so run
 * `npm install` in tools/ once first; no build step is needed.
 *
 * Usage:
 *   node tools/pixels_to_colors.mjs sunday-image-128x128.pixels.json
 *   node tools/pixels_to_colors.mjs in.pixels.json -o colors.json --max-colors 64
 *
 * Writes a JSON array of [argb, pixelCount] pairs, most common first. Pass it
 * to Score.score as `new Map(pairs)` for step 3.
 */

import {readFileSync, writeFileSync} from 'node:fs';

// The package's index.js fails to load in Node (dynamiccolor/color_spec_2025.js
// imports './dynamic_color' without an extension) and its "exports" field
// blocks subpath imports, so import the needed modules by file path.
import {QuantizerCelebi} from './node_modules/@material/material-color-utilities/quantize/quantizer_celebi.js';
import {hexFromArgb} from './node_modules/@material/material-color-utilities/utils/string_utils.js';

/**
 * Returns prominent colors and their pixel counts, most common first.
 *
 * @param {number[]} pixels ARGB pixels.
 * @param {number} maxColors Upper limit on the number of colors returned.
 * @return {Array<[number, number]>} [argb, pixelCount] pairs.
 */
export function pixelsToColors(pixels, maxColors = 128) {
  // Like sourceColorFromImageBytes, ignore pixels that are not fully opaque.
  const opaque = pixels.filter(argb => argb >>> 24 === 255);
  const result = QuantizerCelebi.quantize(opaque, maxColors);
  return [...result.entries()].sort((a, b) => b[1] - a[1]);
}

function main(args) {
  let input;
  let output;
  let maxColors = 128;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' || args[i] === '--output') {
      output = args[++i];
    } else if (args[i] === '--max-colors') {
      maxColors = Number(args[++i]);
    } else if (!input) {
      input = args[i];
    }
  }
  if (!input || !Number.isInteger(maxColors) || maxColors <= 0) {
    console.error(
        'usage: node tools/pixels_to_colors.mjs <pixels.json> ' +
        '[-o out.json] [--max-colors N]');
    return 2;
  }
  output ??= input.replace(/(\.pixels)?\.json$/, '') + '.colors.json';

  try {
    const pixels = JSON.parse(readFileSync(input, 'utf8'));
    const colors = pixelsToColors(pixels, maxColors);
    writeFileSync(output, JSON.stringify(colors));

    const total = colors.reduce((sum, [, count]) => sum + count, 0);
    console.log(`${output} (${colors.length} colors from ${total} pixels)`);
    for (const [argb, count] of colors.slice(0, 10)) {
      const percent = (100 * count / total).toFixed(1).padStart(5);
      console.log(`  ${hexFromArgb(argb)}  ${percent}%`);
    }
    return 0;
  } catch (e) {
    console.error(`error: ${e.message}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2));
}
