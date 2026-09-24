/**
 * The ZIP box on /districts and /distritos.
 *
 * An external file because the site's CSP is script-src 'self', so an inline
 * script would be blocked. Every string comes from the page, written there at
 * build time from the approved rep.* entries in i18n/copy.json, so this file
 * holds no copy in either language and cannot drift from the quiz's own lookup.
 *
 * Same three share cases as src/main.ts: a real zero says nobody lived there, a
 * share that rounds to nothing says under 1%, and anything else is a percent of
 * PEOPLE, never of land.
 */
(function () {
  var root = document.getElementById('ziplookup');
  if (!root) return;
  var S = JSON.parse(root.getAttribute('data-strings'));
  var names = JSON.parse(root.getAttribute('data-members'));
  var base = root.getAttribute('data-base');
  var input = root.querySelector('input');
  var out = root.querySelector('.zipout');
  var zips = null;
  var failed = false;

  function fill(s, vars) {
    return s.replace(/\{(\w+)\}/g, function (m, k) { return k in vars ? String(vars[k]) : m; });
  }
  function para(text) {
    var p = document.createElement('p');
    p.textContent = text;
    return p;
  }
  // {link} is the one placeholder that is markup, so the sentence is split on it
  // and the link is built as an element rather than parsed from a string.
  function paraWithLink(template, vars) {
    var p = document.createElement('p');
    var parts = fill(template, vars).split('{link}');
    p.appendChild(document.createTextNode(parts[0]));
    if (parts.length > 1) {
      var a = document.createElement('a');
      a.href = 'https://wrm.capitol.texas.gov/home';
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = S.linkText;
      p.appendChild(a);
      p.appendChild(document.createTextNode(parts.slice(1).join('{link}')));
    }
    return p;
  }
  function districtItem(d, share) {
    var li = document.createElement('li');
    var name = names[d];
    if (name) {
      var a = document.createElement('a');
      a.href = base + d;
      a.textContent = name + ', ' + fill(S.district, { d: d });
      li.appendChild(a);
    } else {
      li.appendChild(document.createTextNode(fill(S.noSuchDistrict, { d: d })));
    }
    if (share) {
      var sp = document.createElement('span');
      sp.className = 'small';
      sp.textContent = ' ' + share;
      li.appendChild(sp);
    }
    return li;
  }

  function show() {
    var zip = input.value.replace(/\D/g, '');
    out.textContent = '';
    if (zip.length !== 5) return;
    if (failed) { out.appendChild(para(S.zipFailed)); return; }
    if (!zips) return; // still loading; load() calls show() again when it lands
    var v = zips[zip];
    if (v === undefined) { out.appendChild(para(fill(S.zipUnknown, { zip: zip }))); return; }
    var ul = document.createElement('ul');
    ul.className = 'stand';
    if (!Array.isArray(v)) {
      out.appendChild(para(fill(S.zipWhole, { zip: zip, d: v })));
      ul.appendChild(districtItem(v, null));
    } else {
      out.appendChild(paraWithLink(S.zipSpans, { zip: zip, n: v.length }));
      v.forEach(function (row) {
        var people = row[1], pct = row[2];
        var share = pct === null || pct === undefined ? null
          : people === 0 ? S.zipShareNone
          : pct >= 1 ? fill(S.zipShare, { pct: pct })
          : S.zipShareSmall;
        ul.appendChild(districtItem(row[0], share));
      });
    }
    out.appendChild(ul);
  }

  function load() {
    fetch('/data/zips_89R.json')
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (j) { zips = j.zips; show(); })
      .catch(function () { failed = true; show(); });
  }

  // Fetched on first focus rather than on page load: 51 KB most readers of the
  // list below never need.
  input.addEventListener('focus', function once() {
    input.removeEventListener('focus', once);
    load();
  });
  input.addEventListener('input', show);
  root.hidden = false;
})();
