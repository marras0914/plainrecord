/**
 * The economy blind round, on /economy and /economia.
 *
 * An external file because the site's CSP is script-src 'self'. Every word
 * comes from the page's data-strings, written at build time from the approved
 * i18n/economy.json, so this file holds no copy in either language.
 *
 * THE ORDER OF REQUESTS IS THE POINT. The cards come from econ_blind.json,
 * which carries values under opaque keys and nothing else. The labeled file,
 * econ_terms.json, is requested only when the reader asks for the reveal, so
 * no party label is in the page, in memory or in the network log before then.
 * verify_site.mjs asserts that.
 *
 * Nothing is stored and nothing is sent. Ratings live in this page's memory
 * and are gone on reload.
 *
 * Text is set with textContent throughout; nothing here parses HTML.
 */
(function () {
  var root = document.getElementById('econ-blind');
  if (!root) return;
  var S = JSON.parse(root.getAttribute('data-strings'));
  var C = JSON.parse(root.getAttribute('data-config'));
  var fmt = new Intl.NumberFormat(C.lang, { maximumFractionDigits: 2 });
  var fmt1 = new Intl.NumberFormat(C.lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  var cards = [];     // { key, metrics, baseline }, shuffled per reader
  var answers = {};   // key -> { rating, recognized }
  var prediction = null;
  var at = 0;

  function fill(s, vars) {
    return s.replace(/\{(\w+)\}/g, function (m, k) { return k in vars ? String(vars[k]) : m; });
  }
  function plain(s) { return String(s).replace(/<[^>]+>/g, ''); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function button(text, cls, onClick) {
    var b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function num(v) { return v === null || v === undefined ? S.noData : fmt.format(v); }
  function clear() { while (root.firstChild) root.removeChild(root.firstChild); }
  function focusFirst() {
    var h = root.querySelector('h2, p');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: false }); }
  }

  // Fisher-Yates with the browser's own randomness, so each reader sees a
  // different order and no one sees one era first by default.
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // --- the prediction --------------------------------------------------------

  function showPrediction() {
    clear();
    var box = el('div', 'card');
    box.appendChild(el('p', 'label', S['bl.predictQ']));
    var row = el('p');
    [['D', S['bl.predictD']], ['R', S['bl.predictR']], ['same', S['bl.predictSame']]].forEach(function (o) {
      row.appendChild(button(o[1], 'choice', function () { prediction = o[0]; showCard(); }));
      row.appendChild(document.createTextNode(' '));
    });
    box.appendChild(row);
    box.appendChild(button(S['bl.predictSkip'], 'linkish', function () { prediction = null; showCard(); }));
    root.appendChild(box);
  }

  // --- a card ----------------------------------------------------------------

  function showCard() {
    clear();
    var c = cards[at];
    var a = answers[c.key] || (answers[c.key] = { rating: null, recognized: false });
    var box = el('section', 'card');
    box.appendChild(el('p', 'small', fill(S['bl.progress'], { i: at + 1, n: cards.length })));
    box.appendChild(el('h2', null, fill(S['bl.cardHead'], { k: c.key.replace('term-', '').toUpperCase() })));

    var table = el('table', 'chart-table');
    var head = el('tr');
    head.appendChild(el('th', null, ''));
    head.appendChild(el('th', 'num', S['bl.colThis']));
    head.appendChild(el('th', 'num', S['bl.colInherited']));
    table.appendChild(head);
    C.metrics.forEach(function (m) {
      var tr = el('tr');
      tr.appendChild(el('td', null, S['m.' + m]));
      tr.appendChild(el('td', 'num', num(c.metrics[m])));
      tr.appendChild(el('td', 'num', num(c.baseline[m])));
      table.appendChild(tr);
    });
    box.appendChild(table);

    var fs = el('fieldset', 'rate');
    fs.appendChild(el('legend', 'label', S['bl.rateQ']));
    var scale = el('p', 'scale');
    scale.appendChild(el('span', 'small', S['bl.rate1']));
    for (var v = 1; v <= 5; v++) {
      (function (v) {
        var lab = el('label', 'pick');
        var input = el('input');
        input.type = 'radio';
        input.name = 'rating';
        input.value = String(v);
        input.checked = a.rating === v;
        input.addEventListener('change', function () { a.rating = v; next.disabled = false; });
        lab.appendChild(input);
        lab.appendChild(document.createTextNode(' ' + v));
        scale.appendChild(lab);
      })(v);
    }
    scale.appendChild(el('span', 'small', S['bl.rate5']));
    fs.appendChild(scale);
    box.appendChild(fs);

    var rec = el('label', 'small');
    var cb = el('input');
    cb.type = 'checkbox';
    cb.checked = a.recognized;
    cb.addEventListener('change', function () { a.recognized = cb.checked; });
    rec.appendChild(cb);
    rec.appendChild(document.createTextNode(' ' + S['bl.recognize']));
    box.appendChild(el('p')).appendChild(rec);

    var last = at === cards.length - 1;
    var next = button(last ? S['bl.finish'] : S['bl.next'], 'cta', function () {
      if (last) reveal(); else { at++; showCard(); }
    });
    next.disabled = a.rating === null;
    box.appendChild(el('p')).appendChild(next);
    box.appendChild(button(S['bl.stopEarly'], 'linkish', reveal));
    root.appendChild(box);
    focusFirst();
  }

  // --- the reveal: the only place the labeled file is fetched -----------------

  function avg(list) {
    if (!list.length) return S['bl.none'];
    return fmt1.format(list.reduce(function (s, x) { return s + x; }, 0) / list.length);
  }

  function termLabel(t) {
    var names = t.presidents.map(function (p) { return p.name.replace(/ Jr\.$/, '').split(' ').pop(); })
      .join(C.lang.indexOf('es') === 0 ? ' y ' : ' and ');
    return t.end
      ? fill(S.termLabel, { names: names, from: t.start.slice(0, 4), to: t.end.slice(0, 4) })
      : fill(S.termNow, { names: names, from: t.start.slice(0, 4) });
  }

  function reveal() {
    clear();
    root.appendChild(el('p', 'small', '…'));
    fetch(C.termsUrl).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    }).then(function (data) {
      clear();
      var byId = {};
      data.terms.forEach(function (t) { byId[t.id] = t; });
      var rated = cards.filter(function (c) { return answers[c.key] && answers[c.key].rating !== null; });

      root.appendChild(el('h2', null, S['bl.revealH']));
      root.appendChild(el('p', null, fill(S['bl.rated'], { n: rated.length, total: cards.length })));

      var all = { D: [], R: [] }, unrec = { D: [], R: [] };
      rated.forEach(function (c) {
        var t = byId[data.blindKey[c.key]];
        var a = answers[c.key];
        all[t.party].push(a.rating);
        if (!a.recognized) unrec[t.party].push(a.rating);
      });
      if (rated.length) {
        root.appendChild(el('p', null, fill(S['bl.avgAll'], { d: avg(all.D), r: avg(all.R) })));
        root.appendChild(el('p', null, fill(S['bl.avgUnrec'], { d: avg(unrec.D), r: avg(unrec.R) })));
      }
      if (prediction) {
        var pred = prediction === 'D' ? S['bl.predictD'] : prediction === 'R' ? S['bl.predictR'] : S['bl.predictSame'];
        // As written, not lowercased: "democratic presidents" is wrong in English.
        root.appendChild(el('p', null, fill(S['bl.predLine'], { pred: pred })));
      }

      var list = el('ul', 'stand');
      rated.forEach(function (c) {
        var t = byId[data.blindKey[c.key]];
        var a = answers[c.key];
        var li = el('li');
        var head = el('p');
        head.appendChild(el('b', null, fill(S['bl.cardHead'], { k: c.key.replace('term-', '').toUpperCase() }) + ': ' + termLabel(t)));
        head.appendChild(document.createTextNode(' · ' + (t.party === 'D' ? S.D : S.R)));
        li.appendChild(head);
        li.appendChild(el('p', 'small', fill(S['bl.yourRating'], { v: a.rating }) + (a.recognized ? ' · ' + S['bl.recognizedTag'] : '')));
        if (t.notes.length) {
          li.appendChild(el('p', 'small label', S['bl.notesHead']));
          var ul = el('ul', 'small');
          t.notes.forEach(function (n) {
            var item = el('li', null, n.text + ' ');
            var src = el('a', 'hist', S['ex.source']);
            src.href = n.source.url;
            item.appendChild(src);
            ul.appendChild(item);
          });
          li.appendChild(ul);
        }
        list.appendChild(li);
      });
      root.appendChild(list);

      root.appendChild(el('h2', null, S['bl.researchH']));
      root.appendChild(el('p', null, plain(S['me.research'])));
      var links = el('p');
      var ex = el('a', null, S.exploreLink); ex.href = C.exploreUrl;
      var me = el('a', null, S.methodLink); me.href = C.methodUrl;
      links.appendChild(ex); links.appendChild(document.createTextNode(' · ')); links.appendChild(me);
      root.appendChild(links);
      root.appendChild(button(S['bl.again'], 'linkish', start));
      focusFirst();
    }).catch(function () {
      clear();
      var p = el('p', null, S['bl.loadFailed'] + ' ');
      var a = el('a', null, S.exploreLink); a.href = C.exploreUrl;
      p.appendChild(a);
      root.appendChild(p);
    });
  }

  // --- start -----------------------------------------------------------------

  function start() {
    answers = {}; at = 0; prediction = null;
    cards = shuffle(cards.slice());
    showPrediction();
  }

  fetch(C.blindUrl).then(function (r) {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }).then(function (blind) {
    cards = blind.terms;
    start();
  }).catch(function () {
    var p = el('p', null, S['bl.loadFailed'] + ' ');
    var a = el('a', null, S.exploreLink); a.href = C.exploreUrl;
    p.appendChild(a);
    root.appendChild(p);
  });
})();
