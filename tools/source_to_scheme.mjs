/**
 * Builds light and dark color schemes from a source color, following
 * dev_guide/creating_color_scheme.md.
 *
 * Takes either a hex color or the source JSON written by
 * tools/colors_to_source.mjs (its first, best color is used). Uses the
 * published @material/material-color-utilities package, so run
 * `npm install` in tools/ once first; no build step is needed.
 *
 * Usage:
 *   node tools/source_to_scheme.mjs sunday-image-128x128.source.json
 *   node tools/source_to_scheme.mjs #546b5c --variant content --contrast 0.5
 *   node tools/source_to_scheme.mjs #546b5c --spec 2025 -o scheme.json
 *
 * Writes JSON with every color role as a hex string, for light and dark:
 *   {"source": "#546b5c", "variant": "tonal_spot", "contrast": 0,
 *    "specVersion": "2021", "light": {"primary": "#...", ...}, "dark": {...}}
 */

import {readFileSync, writeFileSync} from 'node:fs';

import mcu from './load_mcu.mjs';

const {DynamicScheme, Hct, MaterialDynamicColors, Variant, argbFromHex,
       hexFromArgb} = mcu;

const VARIANTS = Object.keys(Variant)
                     .filter(name => Number.isNaN(Number(name)))
                     .map(name => name.toLowerCase());
const SPEC_VERSIONS = ['2021', '2025'];
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const ACCENT_DIM = /^(primary|secondary|tertiary|error)_dim$/;

// Roles printed to the terminal; the JSON output has all of them.
const PREVIEW_ROLES = [
  'primary', 'on_primary', 'primary_container', 'secondary',
  'secondary_container', 'tertiary', 'tertiary_container', 'surface',
  'on_surface', 'surface_container', 'outline', 'error',
];

/**
 * Returns every color role of the scheme as a hex string, keyed by role name.
 *
 * @param {number} sourceArgb The source color.
 * @param {{variant?: string, isDark?: boolean, contrastLevel?: number,
 *     specVersion?: string}} options
 * @return {Object<string, string>}
 */
export function sourceToScheme(sourceArgb, {
  variant = 'tonal_spot',
  isDark = false,
  contrastLevel = 0,
  specVersion = '2021',
} = {}) {
  const scheme = new DynamicScheme({
    sourceColorHct: Hct.fromInt(sourceArgb),
    variant: Variant[variant.toUpperCase()],
    isDark,
    contrastLevel,
    specVersion,
  });
  const roles = {};
  for (const color of new MaterialDynamicColors().allColors) {
    // allColors comes from the 2025 spec; the 2021 spec has no *_dim accent
    // roles (see color_spec_2021.ts), so leave them out rather than report
    // 2025 values for a 2021 scheme.
    if (specVersion === '2021' && ACCENT_DIM.test(color.name)) continue;
    roles[color.name] = hexFromArgb(color.getArgb(scheme));
  }
  return roles;
}

function swatch(hex) {
  const argb = argbFromHex(hex);
  const [r, g, b] = [(argb >> 16) & 255, (argb >> 8) & 255, argb & 255];
  return `\x1b[48;2;${r};${g};${b}m    \x1b[0m`;
}

function readSource(input) {
  if (HEX.test(input)) return argbFromHex(input);
  const source = JSON.parse(readFileSync(input, 'utf8'));
  if (!Array.isArray(source) || typeof source[0] !== 'number') {
    throw new Error(`${input} is not a source colors JSON array`);
  }
  return source[0];
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
        'usage: node tools/source_to_scheme.mjs <#rrggbb | source.json> ' +
        '[-o out.json] [--variant NAME] [--contrast -1..1] [--spec 2021|2025]\n' +
        `variants: ${VARIANTS.join(', ')}`);
    return 2;
  }
  if (!output) {
    output = HEX.test(input) ?
        `scheme-${input.replace('#', '').toLowerCase()}.json` :
        input.replace(/(\.source)?\.json$/, '') + '.scheme.json';
  }

  try {
    const sourceArgb = readSource(input);
    const options = {variant, contrastLevel, specVersion};
    const scheme = {
      source: hexFromArgb(sourceArgb),
      variant,
      contrast: contrastLevel,
      specVersion,
      light: sourceToScheme(sourceArgb, {...options, isDark: false}),
      dark: sourceToScheme(sourceArgb, {...options, isDark: true}),
    };
    writeFileSync(output, JSON.stringify(scheme, null, 2) + '\n');

    const roleCount = Object.keys(scheme.light).length;
    console.log(
        `${output} (${variant}, contrast ${contrastLevel}, spec ` +
        `${specVersion}, ${roleCount} roles)`);
    console.log(`  source ${swatch(scheme.source)} ${scheme.source}\n`);
    console.log(`  ${'role'.padEnd(20)} light          dark`);
    for (const role of PREVIEW_ROLES) {
      const light = scheme.light[role];
      const dark = scheme.dark[role];
      console.log(
          `  ${role.padEnd(20)} ${swatch(light)} ${light}  ` +
          `${swatch(dark)} ${dark}`);
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
