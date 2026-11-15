// The front page took / and /es from the quiz on 14 Nov 2026. A comparison
// link sent before then reads rightnleft.com/#d=... (or /es#d=...), and the
// server never sees a fragment, so only the page can pass it on. Anything else
// stays here. (scripts/build_home.mjs; verify_site.mjs checks both languages.)
(function () {
  if (!/(?:^#|&)[cd]=/.test(location.hash)) return;
  var es = location.pathname === '/es' || location.pathname.indexOf('/es/') === 0;
  location.replace((es ? '/es/cuestionario' : '/quiz') + location.hash);
})();
