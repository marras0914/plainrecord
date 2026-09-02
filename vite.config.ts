import { defineConfig } from 'vite';

/**
 * Static build. No server, no runtime data fetching: the quiz payload is
 * imported at build time so the output is a folder of files any host can serve,
 * and so `scoring.ts`'s promise of being I/O-free and SSG-safe still holds.
 */
export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // One page, one bundle. Inlining keeps the deploy to a handful of files and
    // removes a round trip on a page whose whole job is to feel instant.
    assetsInlineLimit: 8192,
    sourcemap: false,
  },
  server: { port: 5173, open: true },
});
