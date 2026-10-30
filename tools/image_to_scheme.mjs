/**
 * Runs the whole pipeline: image of any size -> scheme JSON.
 *
 *   1. Resize to 128 x 128 PNG    (tools/resize_image.py, needs Python + Pillow)
 *   2. Image to ARGB pixels       (tools/image_to_pixels.mjs)
 *   3. Pixels to prominent colors (tools/pixels_to_colors.mjs)
 *   4. Colors to source colors    (tools/colors_to_source.mjs)
 *   5. Source color to scheme     (tools/source_to_scheme.mjs)
 *
 * Intermediate files are written to a temporary directory and deleted; only
 * the scheme JSON is kept. Run `npm install` in tools/ once first.
 *
 * Usage:
 *   node tools/image_to_scheme.mjs photo.jpg
 *   node tools/image_to_scheme.mjs photo.jpg -o theme.json --variant content
 *
 * Options --variant, --contrast, and --spec are the same as in
 * source_to_scheme.mjs. Set PYTHON to choose the Python interpreter.
 */

import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, dirname, extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

import {colorsToSource} from './colors_to_source.mjs';
import {decodePng, imageToPixels} from './image_to_pixels.mjs';
import {pixelsToColors} from './pixels_to_colors.mjs';
import {sourceToScheme} from './source_to_scheme.mjs';
import mcu from './load_mcu.mjs';

const {Variant, hexFromArgb} = mcu;

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const VARIANTS = Object.keys(Variant)
                     .filter(name => Number.isNaN(Number(name)))
                     .map(name => name.toLowerCase());
const SPEC_VERSIONS = ['2021', '2025'];

/** Runs resize_image.py, trying python3 then python unless PYTHON is set. */
function resize(input, output) {
  const script = join(TOOLS_DIR, 'resize_image.py');
  const pythons = process.env.PYTHON ? [process.env.PYTHON] : ['python3', 'python'];
  for (const python of pythons) {
    const result = spawnSync(python, [script, input, '-o', output], {encoding: 'utf8'});
    if (result.error?.code === 'ENOENT') continue;
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`resize failed: ${(result.stderr || result.stdout).trim()}`);
    }
    return;
  }
  throw new Error('Python not found; install it or set PYTHON');
}

/**
 * Builds light and dark schemes from an image file.
 *
 * @param {string} imagePath Any image format Pillow can read.
 * @param {{variant?: string, contrastLevel?: number, specVersion?: string}}
 *     options Passed through to sourceToScheme.
 * @return {Object} The same shape that source_to_scheme.mjs writes.
 */
export function imageToScheme(imagePath, options = {}) {
  const {variant = 'tonal_spot', contrastLevel = 0, specVersion = '2021'} = options;
  const tempDir = mkdtempSync(join(tmpdir(), 'image-to-scheme-'));
  let pixels;
  try {
    const resized = join(tempDir, 'resized.png');
    resize(imagePath, resized);
    pixels = imageToPixels(decodePng(readFileSync(resized)));
  } finally {
    rmSync(tempDir, {recursive: true, force: true});
  }

  const source = colorsToSource(pixelsToColors(pixels))[0];
  const schemeOptions = {variant, contrastLevel, specVersion};
  return {
    source: hexFromArgb(source),
    variant,
    contrast: contrastLevel,
    specVersion,
    light: sourceToScheme(source, {...schemeOptions, isDark: false}),
    dark: sourceToScheme(source, {...schemeOptions, isDark: true}),
  };
}

function main(args) {
  let input;
  let output;
  let variant = 'tonal_spot';
  let contrastLevel = 0;
  let specVersion = '2021';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' || args[i] === '--output') {
      output = args[++i];
    } else if (args[i] === '--variant') {
      variant = (args[++i] ?? '').toLowerCase().replace(/-/g, '_');
    } else if (args[i] === '--contrast') {
      contrastLevel = Number(args[++i]);
    } else if (args[i] === '--spec') {
      specVersion = args[++i];
    } else if (!input) {
      input = args[i];
    }
  }
  const contrastOk = contrastLevel >= -1 && contrastLevel <= 1;
  if (!input || !VARIANTS.includes(variant) || !contrastOk ||
      !SPEC_VERSIONS.includes(specVersion)) {
    console.error(
        'usage: node tools/image_to_scheme.mjs <image> [-o scheme.json] ' +
        '[--variant NAME] [--contrast -1..1] [--spec 2021|2025]\n' +
        `variants: ${VARIANTS.join(', ')}`);
    return 2;
  }
  output ??= join(dirname(input), `${basename(input, extname(input))}.scheme.json`);

  try {
    const scheme = imageToScheme(input, {variant, contrastLevel, specVersion});
    writeFileSync(output, JSON.stringify(scheme, null, 2) + '\n');
    console.log(
        `${output} (source ${scheme.source}, ${variant}, contrast ` +
        `${contrastLevel}, spec ${specVersion})`);
    return 0;
  } catch (e) {
    console.error(`error: ${e.message}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2));
}
