/**
 * Ranks prominent colors by how suitable they are as theme seed colors
 * (step 3 of dev_guide/extracting_colors.md) using Score.score.
 *
 * Reads the colors JSON written by tools/pixels_to_colors.mjs. Uses the
 * published @material/material-color-utilities package, so run
 * `npm install` in tools/ once first; no build step is needed.
 *
 * Usage:
 *   node tools/colors_to_source.mjs sunday-image-128x128.colors.json
 *   node tools/colors_to_source.mjs in.colors.json -o source.json --desired 8
 *   node tools/colors_to_source.mjs in.colors.json --no-filter --fallback #6750a4
 *
 * Writes a JSON array of ARGB source colors, best first. The first entry is
 * the source color to build a scheme from.
 */

import {readFileSync, writeFileSync} from 'node:fs';

// Imported by file path for the same reason as in pixels_to_colors.mjs.
import {Hct} from './node_modules/@material/material-color-utilities/hct/hct.js';
import {Score} from './node_modules/@material/material-color-utilities/score/score.js';
import {argbFromHex, hexFromArgb} from './node_modules/@material/material-color-utilities/utils/string_utils.js';

/**
 * Returns source colors ranked by decreasing suitability.
 *
 * @param {Array<[number, number]>} colors [argb, pixelCount] pairs.
 * @param {{desired?: number, fallbackColorARGB?: number, filter?: boolean}}
 *     options Passed through to Score.score.
 * @return {number[]} ARGB colors.
 */
export function colorsToSource(colors, options = {}) {
  return Score.score(new Map(colors), options);
}

function main(args) {
  let input;
  let output;
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' || args[i] === '--output') {
      output = args[++i];
    } else if (args[i] === '--desired') {
      options.desired = Number(args[++i]);
    } else if (args[i] === '--fallback') {
      const hex = args[++i] ?? '';
      options.fallbackColorARGB =
          /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex) ?
          argbFromHex(hex) :
          NaN;
    } else if (args[i] === '--no-filter') {
      options.filter = false;
    } else if (!input) {
      input = args[i];
    }
  }
  const desiredOk = options.desired === undefined ||
      (Number.isInteger(options.desired) && options.desired > 0);
  const fallbackOk = options.fallbackColorARGB === undefined ||
      !Number.isNaN(options.fallbackColorARGB);
  if (!input || !desiredOk || !fallbackOk) {
    console.error(
        'usage: node tools/colors_to_source.mjs <colors.json> [-o out.json] ' +
        '[--desired N] [--fallback #rrggbb] [--no-filter]');
    return 2;
  }
  output ??= input.replace(/(\.colors)?\.json$/, '') + '.source.json';

  try {
    const colors = JSON.parse(readFileSync(input, 'utf8'));
    const source = colorsToSource(colors, options);
    writeFileSync(output, JSON.stringify(source));

    console.log(`${output} (${source.length} source colors)`);
    for (const argb of source) {
      const hct = Hct.fromInt(argb);
      console.log(
          `  ${hexFromArgb(argb)}  hue ${hct.hue.toFixed(0).padStart(3)}  ` +
          `chroma ${hct.chroma.toFixed(0).padStart(3)}  ` +
          `tone ${hct.tone.toFixed(0).padStart(3)}`);
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
