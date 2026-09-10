/**
 * PlainRecord — hand a shared link on to the real page.
 *
 * An EXTERNAL file, not an inline script, and that is the whole reason it
 * exists. This site's CSP is `script-src 'self'` with no 'unsafe-inline', so an
 * inline redirect on the result pages is blocked and every shared link
 * dead-ends on a page whose only job was to not be seen. The build's own
 * verifier applies the production headers, which is what caught it.
 *
 * It derives the target from its own location rather than being told, so one
 * file serves all eleven pages in both languages.
 *
 * Generated pages reference this at an absolute path, so /es/r/8 loads the same
 * copy of it.
 */
(function () {
  var m = /^(\/es)?\/r\/(\d{1,2})(?:\.html)?\/?$/.exec(location.pathname);
  if (!m) return;
  var bin = Number(m[2]);
  if (!(bin >= 0 && bin <= 10)) return;
  // replace(), not assign(): the redirect page should not sit in history where
  // Back would bounce the reader straight out of the site again.
  location.replace((m[1] || '') + '/#r=' + bin);
})();
