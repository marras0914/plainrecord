/**
 * Dark mode on the static pages, by the quiz's rule: light by default on every
 * device, dark only when the reader chose it.
 *
 * The static pages used to follow prefers-color-scheme, so a reader whose phone
 * was set to dark went from a light quiz to a dark race page. The quiz stopped
 * following the OS on purpose (see the comment above :root[data-theme="dark"]
 * in src/styles.css), and a site that changes colour between pages reads as two
 * sites.
 *
 * Loaded synchronously in <head>, before any paint, so a dark reader never sees
 * a flash of light first. External rather than inline because the CSP is
 * script-src 'self'. The key is the quiz's own: localStorage 'theme', so a
 * choice made on any page holds on every page, the quiz included.
 *
 * It also wires the switch in each page's header (.themetoggle, drawn by
 * themeToggleHtml in scripts/_page_shell.mjs). Until 25 Nov 2026 only the quiz
 * had a switch, so the front page lost it when the quiz moved to /quiz. The
 * button's word is chosen by CSS from data-theme; this sets only the state.
 */
(function () {
  var root = document.documentElement;
  try {
    if (localStorage.getItem('theme') === 'dark') root.setAttribute('data-theme', 'dark');
  } catch (e) { /* storage blocked: light, which is the default anyway */ }

  function wire() {
    var btns = document.querySelectorAll('.themetoggle');
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      btn.setAttribute('aria-pressed', String(root.getAttribute('data-theme') === 'dark'));
      btn.addEventListener('click', function () {
        var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        for (var j = 0; j < btns.length; j++) btns[j].setAttribute('aria-pressed', String(next === 'dark'));
        try { localStorage.setItem('theme', next); } catch (e) { /* nothing to remember it with */ }
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
