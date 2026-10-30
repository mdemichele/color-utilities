/**
 * Loads the published @material/material-color-utilities package in Node.
 *
 * The package's dynamiccolor/color_spec_2025.js imports './dynamic_color'
 * without a file extension, which Node's ESM loader rejects. That breaks
 * index.js and every scheme. This registers a resolve hook that retries such
 * imports inside the package with '.js' appended, then loads the package, so
 * node_modules is never edited.
 *
 * Usage:
 *   import mcu from './load_mcu.mjs';
 *   const {SchemeTonalSpot, Hct} = mcu;
 */

import {registerHooks} from 'node:module';

const PACKAGE_PATH = '/node_modules/@material/material-color-utilities/';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (e) {
      const fromPackage = context.parentURL?.includes(PACKAGE_PATH);
      const isExtensionless =
          specifier.startsWith('.') && !/\.[cm]?js$/.test(specifier);
      if (e.code === 'ERR_MODULE_NOT_FOUND' && fromPackage && isExtensionless) {
        return nextResolve(`${specifier}.js`, context);
      }
      throw e;
    }
  },
});

// Imported dynamically so the hook above is registered first; static imports
// would be resolved before this module's body runs.
export default await import('@material/material-color-utilities');
