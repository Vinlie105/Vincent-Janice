// games.js: the "call games" (Guess Me, This or That, Would You Rather, Deep Talk).
// Runs on each phone by itself. A shared room code seeds the shuffle, so both phones see the same question order.
(function () {
  'use strict';

  var KEY = 'vj_cg';
  var CUSTOM_KEY = 'vj_cq';
  var CATS = ['All', 'Favourites', 'Childhood', 'Habits', 'Us', 'Dreams', 'Random'];
  var ROUNDS = [10, 20, 30];
  var MODES = {
    guess: { name: 'Guess Me', emoji: '🔮', blurb: 'One answers about themselves, the other guesses out loud.' },
    tt: { name: 'This or That', emoji: '⚖️', blurb: 'Pick secretly, then reveal together on the call.' },
    wyr: { name: 'Would You Rather', emoji: '🤔', blurb: 'Answer out loud and explain why.' },
    deep: { name: 'Deep Talk', emoji: '🌙', blurb: 'Gentle questions for late-night calls. Skip anything, any time.' }
  };

  function create(ctx) {
    var esc = ctx.esc;
    var S = ctx.S;
    var toast = ctx.toast;
    var Q = window.VJ_QUESTIONS || { guess: {}, tt: [], wyr: [], deep: [] };
    var G = read(KEY, { stage: 'setup', rounds: 10, cat: 'All', code: '' });
    var custom = read(CUSTOM_KEY, {});
    var timer = null;

    ['guess', 'tt', 'wyr', 'deep'].forEach(function (k) {
      if (!Array.isArray(custom[k])) custom[k] = [];
    });
    G.count = 0;

    /* ---------- storage ---------- */
    function read(key, def) {
      try {
        var v = JSON.parse(ctx.store.get(key) || 'null');
        return v && typeof v === 'object' ? v : def;
      } catch (e) {
        return def;
      }
    }
    function save() { ctx.store.set(KEY, JSON.stringify(G)); }
    function saveCustom() { ctx.store.set(CUSTOM_KEY, JSON.stringify(custom)); }

    /* ---------- shared shuffle: same code + same pool = same order ---------- */
    function hash(str) {
      var h = 2166136261;
      for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }
    function rng(seed) {
      return function () {
        seed = (seed + 0x6D2B79F5) | 0;
        var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function shuffle(arr, seedStr) {
      var a = arr.slice();
      var rand = rng(hash(seedStr));
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1));
        var tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
      }
      return a;
    }
    function pool(mode, cat) {
      var base = [];
      var extra = [];
      if (mode === 'guess') {
        var cats = cat === 'All' ? Object.keys(Q.guess) : [cat];
        cats.forEach(function (c) { (Q.guess[c] || []).forEach(function (q) { base.push(q); }); });
        custom.guess.forEach(function (x) { if (cat === 'All' || x.cat === cat) extra.push(x.q); });
      } else {
        (Q[mode] || []).forEach(function (q) { base.push(q); });
        custom[mode].forEach(function (q) { extra.push(q); });
      }
      return base.concat(extra.sort());
    }
    function fingerprint(list) {
      return ('0000' + hash(list.join('|')).toString(16)).slice(-4).toUpperCase();
    }

    /* ---------- round state ---------- */
    function resetRound() {
      clearTimeout(timer);
      G.locked = false;
      G.revealed = false;
      G.pick = null;
      G.shown = false;
      G.count = 0;
      G.draft = '';
    }
    function other(name) { return name === 'Janice' ? 'Vincent' : 'Janice'; }
    function subjectOf(i) { return i % 2 === 0 ? 'Janice' : 'Vincent'; }
    function splitChoice(q) {
      var i = q.indexOf(' or ');
      var parts = i < 0 ? [q, 'Something else'] : [q.slice(0, i), q.slice(i + 4)];
      return parts.map(function (s) { return s.charAt(0).toUpperCase() + s.slice(1); });
    }
    function guessScore(guesser) {
      var yes = 0;
      var total = 0;
      Object.keys(G.verdicts || {}).forEach(function (k) {
        if (other(subjectOf(+k)) !== guesser) return;
        total += 1;
        if (G.verdicts[k] === 'y') yes += 1;
      });
      return { yes: yes, total: total };
    }
    function cute(ratio) {
      if (ratio >= 0.8) return 'You two really know each other 💞';
      if (ratio >= 0.5) return 'Getting there. Keep asking 🌸';
      return 'So much left to learn, and that is the fun part 💗';
    }
    function finish() {
      G.stage = 'end';
      var ratio = 0;
      if (G.mode === 'guess') {
        var a = guessScore('Vincent');
        var b = guessScore('Janice');
        ratio = a.total + b.total ? (a.yes + b.yes) / (a.total + b.total) : 0;
      } else if (G.mode === 'tt') {
        var marks = Object.keys(G.marks || {});
        var same = marks.filter(function (k) { return G.marks[k] === 'same'; }).length;
        ratio = marks.length ? same / marks.length : 0;
      }
      if (ratio >= 0.5) ctx.burst(['💞', '🎉', '✨', '🩷'], 30);
    }
    function advance() {
      G.i += 1;
      if (G.i >= G.deck.length) finish();
      else resetRound();
    }

    /* ---------- views ---------- */
    function header() {
      var m = MODES[G.mode];
      return '<div class="sec-title"><h2 class="hand" style="font-size:36px">' + m.emoji + ' ' + esc(m.name) +
        '</h2><button class="btn ghost small" data-act="cg-menu">Games</button></div>';
    }
    function chips(list, current, act) {
      return '<div class="chips">' + list.map(function (v) {
        return '<button type="button" data-act="' + act + '" data-v="' + esc(v) + '" aria-pressed="' + (String(v) === String(current)) + '">' + esc(v) + '</button>';
      }).join('') + '</div>';
    }
    function customView() {
      var mode = G.mode;
      var items = custom[mode].map(function (x, i) {
        var text = mode === 'guess' ? x.q + ' (' + x.cat + ')' : x;
        return '<div class="row"><div class="mid"><b>' + esc(text) + '</b></div><span class="acts"><button class="icon-btn" data-act="cg-delcus" data-i="' + i + '" aria-label="Remove question">🗑️</button></span></div>';
      }).join('');
      var hint = mode === 'tt' ? 'Write it as “A or B”. ' : '';
      var catPick = mode === 'guess'
        ? '<div class="field"><label for="cg-newcat" class="muted">Category</label><select id="cg-newcat">' +
          CATS.slice(1).map(function (c) { return '<option' + (c === (G.newcat || 'Favourites') ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></div>'
        : '';
      return '<div class="card stack"><b>+ Add your own question</b>' +
        '<div class="field"><label for="cg-new" class="muted">' + hint + 'Add it on both phones, or the order will differ.</label><input id="cg-new" maxlength="140" value="' + esc(G.newq || '') + '"></div>' +
        catPick + '<div><button class="btn small" data-act="cg-add">Add</button></div>' +
        (items ? '<div class="stack">' + items + '</div>' : '') + '</div>';
    }
    function setupView() {
      var list = pool(G.mode, G.cat);
      var catBlock = G.mode === 'guess'
        ? '<div><p class="label" style="margin-bottom:6px">Category</p>' + chips(CATS, G.cat, 'cg-cat') + '</div>'
        : '';
      return header() + '<div class="card stack"><p class="muted" style="font-weight:700">' + esc(MODES[G.mode].blurb) + '</p>' +
        '<div class="field"><label for="cg-code">Room code: enter the same 4 digits on both phones</label>' +
        '<div style="display:flex;gap:8px"><input id="cg-code" inputmode="numeric" maxlength="4" autocomplete="off" value="' + esc(G.code || '') + '"><button class="btn ghost small" data-act="cg-rand">Random</button></div></div>' +
        '<div><p class="label" style="margin-bottom:6px">Rounds</p>' + chips(ROUNDS, G.rounds, 'cg-rounds') + '</div>' + catBlock +
        '<p class="muted" style="font-size:13px">' + list.length + ' questions in this deck. Deck check <b class="fp">' + fingerprint(list) + '</b> should match on both phones.</p>' +
        '<button class="btn" data-act="cg-start">Start</button></div>' + customView();
    }
    function guessCard(q) {
      var subject = subjectOf(G.i);
      var guesser = other(subject);
      var verdict = (G.verdicts || {})[G.i];
      var html = '<div class="qcard"><span class="pill" style="align-self:center">About ' + subject + '</span><p class="q">' + esc(q) + '</p>' +
        '<p class="muted" style="font-weight:700;font-size:14px">“I” and “my” mean ' + subject + '.</p>';
      if (S.me === subject) {
        html += G.locked
          ? '<div class="ans' + (G.revealed ? '' : ' blur') + '">' + esc(G.draft) + '</div>'
          : '<div class="field"><label for="cg-ans" class="muted">Your real answer. Only you see it.</label><textarea id="cg-ans" maxlength="140">' + esc(G.draft || '') + '</textarea></div><button class="btn" data-act="cg-lock">Lock in 🔒</button>';
      } else {
        html += '<p style="font-weight:800">' + guesser + ', say your guess out loud 🎙️</p><p class="muted">' + subject + ' is writing the real answer.</p>';
      }
      if (!G.revealed) html += '<button class="btn ghost" data-act="cg-reveal">Reveal</button>';
      else if (!verdict) html += '<p style="font-weight:800">Did ' + guesser + ' get it?</p><div class="cg-actions"><button class="btn" data-act="cg-yes">Got it ✅</button><button class="btn ghost" data-act="cg-no">Nope ❌</button></div>';
      else html += '<p style="font-weight:800">' + (verdict === 'y' ? 'Got it ✅' : 'Nope ❌') + '</p>';
      return html + '</div>';
    }
    function ttCard(q) {
      var parts = splitChoice(q);
      var mark = (G.marks || {})[G.i];
      var locked = G.shown || G.count > 0;
      var html = '<div class="qcard"><p class="label">Pick secretly 🤫</p><div class="choice">' + parts.map(function (t, i) {
        return '<button data-act="cg-pick" data-v="' + i + '" aria-pressed="' + (G.pick === i) + '"' + (locked ? ' disabled' : '') + '>' + esc(t) + '</button>';
      }).join('') + '</div>';
      if (G.count > 0) html += '<div class="count" role="timer">' + G.count + '</div>';
      else if (!G.shown) html += '<button class="btn" data-act="cg-count"' + (G.pick == null ? ' disabled' : '') + '>Reveal in 3, 2, 1</button>';
      else {
        html += '<p style="font-weight:800">You picked <span style="color:var(--red)">' + esc(parts[G.pick]) + '</span>. Say yours on the call!</p>';
        html += mark
          ? '<p style="font-weight:800">' + (mark === 'same' ? 'Same 🤝' : 'Different') + '</p>'
          : '<div class="cg-actions"><button class="btn" data-act="cg-same">Same 🤝</button><button class="btn ghost" data-act="cg-diff">Different</button></div>';
      }
      return html + '</div>';
    }
    function plainCard(q) {
      return '<div class="qcard"><p class="q">' + esc(q) + '</p></div>';
    }
    function playView() {
      var total = G.deck.length;
      var card = { guess: guessCard, tt: ttCard, wyr: plainCard, deep: plainCard }[G.mode](G.deck[G.i]);
      return header() +
        '<p class="label" style="text-align:center">Question ' + (G.i + 1) + ' / ' + total + ' · deck <span class="fp">' + esc(G.fp || '') + '</span></p>' + card +
        '<div class="cg-actions"><button class="btn ghost small" data-act="cg-prev"' + (G.i === 0 ? ' disabled' : '') + '>Back</button>' +
        '<button class="btn ghost small" data-act="cg-skip">Skip</button>' +
        '<button class="btn" data-act="cg-next">' + (G.i + 1 >= total ? 'Finish' : 'Next') + '</button></div>' +
        '<p style="text-align:center"><button class="btn ghost small" data-act="cg-quit">End game</button></p>';
    }
    function endView() {
      var body = '';
      if (G.mode === 'guess') {
        var a = guessScore('Vincent');
        var b = guessScore('Janice');
        var ratio = a.total + b.total ? (a.yes + b.yes) / (a.total + b.total) : 0;
        body = '<p class="status">Vincent knows Janice ' + a.yes + '/' + a.total + '</p><p class="status">Janice knows Vincent ' + b.yes + '/' + b.total + '</p><p style="font-weight:800">' + cute(ratio) + '</p>';
      } else if (G.mode === 'tt') {
        var marks = Object.keys(G.marks || {});
        var same = marks.filter(function (k) { return G.marks[k] === 'same'; }).length;
        body = '<p class="status">You matched ' + same + '/' + marks.length + '</p><p style="font-weight:800">' + cute(marks.length ? same / marks.length : 0) + '</p>';
      } else {
        body = '<p class="status">That was ' + G.deck.length + ' questions 💗</p><p class="muted" style="font-weight:700">Thanks for talking.</p>';
      }
      return header() + '<div class="qcard">' + body + '</div>' +
        '<div class="cg-actions"><button class="btn" data-act="cg-again">Play again</button><button class="btn ghost" data-act="cg-menu">Games</button></div>';
    }
    function view() {
      if (G.stage === 'play' && G.deck && G.deck.length) return playView();
      if (G.stage === 'end' && G.deck) return endView();
      return setupView();
    }

    /* ---------- actions ---------- */
    function startGame() {
      if (!/^\d{4}$/.test(G.code || '')) { toast('Enter a 4-digit room code.'); return false; }
      var list = pool(G.mode, G.cat);
      if (!list.length) { toast('No questions in this deck.'); return false; }
      var seed = G.mode + '|' + G.code + '|' + (G.mode === 'guess' ? G.cat : 'all');
      G.deck = shuffle(list, seed).slice(0, G.rounds || 10);
      G.fp = fingerprint(list);
      G.i = 0;
      G.verdicts = {};
      G.marks = {};
      G.stage = 'play';
      resetRound();
      return true;
    }
    function setVerdict(value) {
      G.verdicts[G.i] = value;
      if (value === 'y') ctx.burst(['💗', '✨'], 12);
    }
    function setMark(value) {
      G.marks[G.i] = value;
      if (value === 'same') ctx.burst(['💗', '🤝'], 12);
    }
    function countdown() {
      G.count = 3;
      (function step() {
        timer = setTimeout(function () {
          G.count -= 1;
          if (G.count <= 0) { G.count = 0; G.shown = true; ctx.burst(['✨'], 6); }
          save();
          ctx.render();
          if (G.count > 0) step();
        }, 1000);
      })();
    }
    function addCustom() {
      var text = (G.newq || '').trim();
      if (text.length < 6) { toast('Write the whole question first.'); return; }
      if (G.mode === 'tt' && text.indexOf(' or ') < 0) { toast('Write it as “A or B”.'); return; }
      if (G.mode === 'guess') custom.guess.push({ cat: G.newcat || 'Favourites', q: text });
      else custom[G.mode].push(text);
      G.newq = '';
      saveCustom();
    }

    var handlers = {
      'cg-open': function (el) {
        var mode = el.dataset.v;
        S.play = 'call';
        if (G.mode === mode && G.stage === 'play' && G.deck) return;
        G.mode = mode;
        G.stage = 'setup';
        G.cat = 'All';
        G.newq = '';
      },
      'cg-menu': function () { clearTimeout(timer); S.play = 'menu'; },
      'cg-rand': function () { G.code = String(1000 + Math.floor(Math.random() * 9000)); },
      'cg-rounds': function (el) { G.rounds = +el.dataset.v; },
      'cg-cat': function (el) { G.cat = el.dataset.v; },
      'cg-start': function () { startGame(); },
      'cg-lock': function () {
        if (!(G.draft || '').trim()) { toast('Write your answer first.'); return; }
        G.locked = true;
      },
      'cg-reveal': function () { G.revealed = true; },
      'cg-yes': function () { setVerdict('y'); },
      'cg-no': function () { setVerdict('n'); },
      'cg-pick': function (el) { G.pick = +el.dataset.v; },
      'cg-count': function () { if (G.pick != null) countdown(); },
      'cg-same': function () { setMark('same'); },
      'cg-diff': function () { setMark('diff'); },
      'cg-next': advance,
      'cg-skip': advance,
      'cg-prev': function () { if (G.i > 0) { G.i -= 1; resetRound(); } },
      'cg-quit': function () { clearTimeout(timer); G.stage = 'setup'; },
      'cg-again': function () { clearTimeout(timer); G.stage = 'setup'; G.code = ''; },
      'cg-add': addCustom,
      'cg-delcus': function (el) { custom[G.mode].splice(+el.dataset.i, 1); saveCustom(); }
    };

    function act(name, el) {
      var h = handlers[name];
      if (!h) return;
      h(el);
      save();
      ctx.render();
    }
    function input(el) {
      if (el.id === 'cg-code') { G.code = el.value.replace(/\D/g, '').slice(0, 4); el.value = G.code; save(); }
      else if (el.id === 'cg-ans') { G.draft = el.value; save(); }
      else if (el.id === 'cg-new') { G.newq = el.value; }
      else if (el.id === 'cg-newcat') { G.newcat = el.value; }
    }
    function resume(mode) { return G.mode === mode && G.stage === 'play' && !!G.deck; }

    return { view: view, act: act, input: input, resume: resume };
  }

  window.VJ_GAMES = { create: create };
})();
