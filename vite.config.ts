import { defineConfig } from 'vite';

/**
 * Which locale this build is for. Read from the environment because the site is
 * built TWICE — once per language — so each bundle carries only its own strings.
 * See scripts/build_locales.mjs for the orchestration.
 */
const BUILD_LOCALE = process.env.BUILD_LOCALE === 'es' ? 'es' : 'en';

/**
 * Where this build writes. Relative to `root`, which is `src`.
 *
 * The two locale builds cannot share an outDir because `emptyOutDir` would have
 * the second wipe the first. scripts/build_locales.mjs sends the Spanish build
 * somewhere temporary and then merges its assets in — safe because vite
 * content-hashes filenames, so two bundles never collide.
 */
const BUILD_OUTDIR = process.env.BUILD_OUTDIR || '../dist';

/**
 * Static build. No server, no runtime data fetching: the quiz payload is
 * imported at build time so the output is a folder of files any host can serve,
 * and so `scoring.ts`'s promise of being I/O-free and SSG-safe still holds.
 */
export default defineConfig({
  // Folded at build time, which is what lets Rollup drop the other language's
  // copy table and the Spanish payload sidecar entirely.
  define: { __BUILD_LOCALE__: JSON.stringify(BUILD_LOCALE) },
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: BUILD_OUTDIR,
    emptyOutDir: true,
    // One page, one bundle. Inlining keeps the deploy to a handful of files and
    // removes a round trip on a page whose whole job is to feel instant.
    assetsInlineLimit: 8192,
    sourcemap: false,
  },
  server: { port: 5173, open: true },
});
