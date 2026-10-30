/**
 * Writes a minimal HTML page of color swatches from a scheme JSON written by
 * tools/source_to_scheme.mjs or tools/image_to_scheme.mjs.
 *
 * Has no dependencies. Open the output file in any browser.
 *
 * Usage:
 *   node tools/scheme_to_html.mjs sunday-image.scheme.json
 *   node tools/scheme_to_html.mjs in.scheme.json -o swatches.html
 */

import {readFileSync, writeFileSync} from 'node:fs';

const HEX = /^#[0-9a-f]{6}$/i;

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

const LIGHT_TEXT = '#ffffff';
const DARK_TEXT = '#000000';

/** WCAG relative luminance of a #rrggbb color, from 0 (black) to 1 (white). */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Returns white text unless dark text contrasts better with the background.
 * The two WCAG contrast ratios are equal at a luminance of about 0.18.
 */
function textColor(background) {
  const l = luminance(background);
  const onWhite = (1 + 0.05) / (l + 0.05);
  const onBlack = (l + 0.05) / (0 + 0.05);
  return onWhite >= onBlack ? LIGHT_TEXT : DARK_TEXT;
}

// Rows of related roles, in display order. Roles missing from a scheme (such as
// the *_dim accents, which only the 2025 spec has) are skipped; roles not
// listed here go in a final "other" row so nothing is dropped.
const ROWS = [
  ['background', ['background', 'on_background']],
  ['surface', ['surface', 'surface_dim', 'surface_bright', 'on_surface',
               'on_surface_variant']],
  ['surface containers', ['surface_container_lowest', 'surface_container_low',
                          'surface_container', 'surface_container_high',
                          'surface_container_highest']],
  ['inverse', ['inverse_surface', 'inverse_on_surface', 'inverse_primary']],
  ['outline', ['outline', 'outline_variant']],
  ...['primary', 'secondary', 'tertiary'].flatMap(accent => [
    [accent, [accent, `${accent}_dim`, `on_${accent}`, `${accent}_container`,
              `on_${accent}_container`]],
    [`${accent} fixed`, [`${accent}_fixed`, `${accent}_fixed_dim`,
                         `on_${accent}_fixed`, `on_${accent}_fixed_variant`]],
  ]),
  ['error', ['error', 'error_dim', 'on_error', 'error_container',
             'on_error_container']],
];

function swatch(role, hex) {
  return `<div style="background:${hex}; color:${textColor(hex)}">` +
      // <wbr> lets long names wrap after underscores, not mid-word.
      `<span>${escapeHtml(role).replace(/_/g, '_<wbr>')}</span>${hex}</div>`;
}

function swatchRows(roles) {
  const listed = new Set(ROWS.flatMap(([, names]) => names));
  const other = Object.keys(roles).filter(role => !listed.has(role));
  return [...ROWS, ['other', other]]
      .map(([label, names]) => [label, names.filter(n => HEX.test(roles[n]))])
      .filter(([, names]) => names.length > 0)
      .map(([label, names]) =>
          `<h3>${escapeHtml(label)}</h3>\n<div class="swatches">\n` +
          names.map(name => swatch(name, roles[name])).join('\n') +
          '\n</div>')
      .join('\n');
}

/**
 * Returns an HTML page showing every color in the scheme.
 *
 * @param {{source: string, light: Object<string, string>,
 *     dark: Object<string, string>}} scheme
 * @return {string}
 */
export function schemeToHtml(scheme) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Scheme ${escapeHtml(scheme.source)}</title>
<style>
  body { font-family: sans-serif; }
  h3 { margin: 16px 0 6px; font-size: 13px; font-weight: normal; color: #555; }
  .swatches { display: flex; gap: 8px; overflow-x: auto; }
  .swatches div { flex: none; width: 160px; height: 72px; display: flex;
                  flex-direction: column; align-items: center;
                  justify-content: center; gap: 4px; font-family: monospace;
                  font-size: 12px; text-align: center; }
</style>
</head>
<body>
<h2>Light</h2>
${swatchRows(scheme.light)}
<h2>Dark</h2>
${swatchRows(scheme.dark)}
</body>
</html>
`;
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
    console.error('usage: node tools/scheme_to_html.mjs <scheme.json> [-o out.html]');
    return 2;
  }
  output ??= input.replace(/\.json$/, '') + '.html';

  try {
    const scheme = JSON.parse(readFileSync(input, 'utf8'));
    if (!scheme.light || !scheme.dark) {
      throw new Error(`${input} is not a scheme JSON (missing light/dark)`);
    }
    writeFileSync(output, schemeToHtml(scheme));
    console.log(output);
    return 0;
  } catch (e) {
    console.error(`error: ${e.message}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2));
}
