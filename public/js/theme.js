/**
 * Dark mode on the static pages, by the quiz's rule: light by default on every
 * device, dark only when the reader chose it with the quiz's toggle.
 *
 * The static pages used to follow prefers-color-scheme, so a reader whose phone
 * was set to dark went from a light quiz to a dark race page. The quiz stopped
 * following the OS on purpose (see the comment above :root[data-theme="dark"]
 * in src/styles.css), and a site that changes colour between pages reads as two
 * sites.
 *
 * Loaded synchronously in <head>, before any paint, so a dark reader never sees
 * a flash of light first. External rather than inline because the CSP is
 * script-src 'self'. The key is the quiz's own: localStorage 'theme'.
 */
try {
  if (localStorage.getItem('theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
} catch (e) { /* storage blocked: light, which is the default anyway */ }
