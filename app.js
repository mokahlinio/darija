'use strict';

/* =========================================================
   Speicher
   ========================================================= */
const KEY = 'darija-app-v1';
const DAY = 86400000;

const defaultState = () => ({
  lessons: [],
  cards: [],
  stats: { streak: 0, lastDay: null },
  settings: { direction: 'de-da', courseStart: '2026-10-15', lastLesson: '', newPerDay: 30 },
});

let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.cards)) {
      const d = defaultState();
      const st = { ...d, ...s, stats: { ...d.stats, ...s.stats }, settings: { ...d.settings, ...s.settings } };
      // Einmalig: Tageslimit für neue Karten von 15 auf 30 anheben
      if (!st.settings.limit30) { st.settings.newPerDay = 30; st.settings.limit30 = true; }
      return st;
    }
  } catch (e) { /* leerer oder kaputter Speicher → Neustart */ }
  return defaultState();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('Speichern fehlgeschlagen – bitte Backup exportieren!'); }
  updateDuePill();
}

/* =========================================================
   Helfer
   ========================================================= */
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const localDate = (d = new Date()) => d.toLocaleDateString('sv-SE');
const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmtDate = s => s ? new Date(s + 'T12:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const getCard = id => state.cards.find(c => c.id === id);
const getLesson = id => state.lessons.find(l => l.id === id);
const lessonCards = id => state.cards.filter(c => !id ? true : id === 'none' ? !c.lessonId : c.lessonId === id);
const isDue = c => c.srs.due <= Date.now();
const isNew = c => !c.srs.seen && c.srs.reps === 0 && c.srs.lapses === 0;
const newSeenToday = () => state.cards.filter(c => c.srs.seen >= startOfDay()).length;
// Fällig = alle fälligen Wiederholungen + neue Karten bis zum Tageslimit
function dueCards(id) {
  const due = lessonCards(id).filter(isDue);
  const room = Math.max(0, (+state.settings.newPerDay || 30) - newSeenToday());
  return [...due.filter(c => !isNew(c)), ...due.filter(isNew).slice(0, room)];
}
const sortedLessons = () => [...state.lessons].sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.created - b.created);
const lessonTitle = id => id === 'none' ? 'Ohne Lektion' : (getLesson(id)?.title || 'Alle Karten');

function newCard(de, da, note, lessonId) {
  return {
    id: uid(), de: de.trim(), da: da.trim(), note: (note || '').trim(),
    lessonId: lessonId || null, created: Date.now(),
    srs: { due: Date.now(), interval: 0, ease: 2.5, reps: 0, lapses: 0 },
  };
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

function updateDuePill() {
  const n = dueCards().length, pill = $('#duePill');
  pill.hidden = n === 0;
  pill.textContent = `${n} fällig`;
}

/* =========================================================
   Wiederholung (vereinfachtes SM-2 wie bei Anki)
   grade: 0 = Nochmal, 1 = Schwer, 2 = Gut, 3 = Leicht
   ========================================================= */
function nextInterval(s, g) {
  if (g === 0) return 0;
  if (s.reps === 0) return [0, 1, 1, 3][g];
  if (s.reps === 1) return [0, 2, 3, 6][g];
  const base = Math.max(1, s.interval);
  return Math.max(base + 1, Math.round(base * [0, 1.2, s.ease, s.ease * 1.3][g]));
}

function schedule(card, g) {
  const s = card.srs;
  if (!s.seen) s.seen = Date.now();
  if (g === 0) {
    s.reps = 0; s.interval = 0; s.lapses++;
    s.ease = Math.max(1.3, s.ease - 0.2);
    s.due = Date.now() + 10 * 60000;
    return;
  }
  s.interval = nextInterval(s, g);
  if (g === 1) s.ease = Math.max(1.3, s.ease - 0.15);
  if (g === 3) s.ease += 0.15;
  s.reps++;
  s.due = startOfDay() + s.interval * DAY;
}

const ivLabel = d => d === 0 ? '10 Min' : d < 30 ? `${d} T` : d < 365 ? `${Math.round(d / 30)} Mon` : `${(d / 365).toFixed(1)} J`;

function srsBadge(c) {
  if (c.srs.reps === 0) return '<span class="badge new">neu</span>';
  if (isDue(c)) return '<span class="badge due">fällig</span>';
  const d = Math.max(1, Math.round((c.srs.due - startOfDay()) / DAY));
  return `<span class="badge ok">in ${d} T</span>`;
}

function markActivity() {
  const st = state.stats, today = localDate();
  if (st.lastDay === today) return;
  st.streak = st.lastDay === localDate(new Date(Date.now() - DAY)) ? st.streak + 1 : 1;
  st.lastDay = today;
}

function currentStreak() {
  const st = state.stats;
  return st.lastDay === localDate() || st.lastDay === localDate(new Date(Date.now() - DAY)) ? st.streak : 0;
}

function pickDir(dir = state.settings.direction) {
  return dir === 'mixed' ? (Math.random() < 0.5 ? 'de-da' : 'da-de') : dir;
}
const dirLabel = d => d === 'de-da' ? 'Deutsch → Darija' : 'Darija → Deutsch';

/* =========================================================
   Antwort prüfen (tolerant bei Umschrift-Varianten)
   ========================================================= */
function norm(s) {
  return String(s).toLowerCase()
    .replace(/sh/g, 'ch') // sh und ch sind dieselbe Umschrift für ش
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/(^| )w(?= |$)/g, '$1u'); // „und“: w und u sind dieselbe Umschrift
}

function lev(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// Das Pronomen am Anfang ist optional – im Darija lässt man es meist weg ("ana kanchrob" = "kanchrob")
const bare = s => s.replace(/^(ana|nta|nti|howa|huwa|hiya|7na|ntuma|ntoma|huma|homa) (?=\S)/, '');

// Mehrere erlaubte Antworten mit "/" trennen, z. B. "chokran / shukran"
function checkAnswer(input, answer) {
  const n = bare(norm(input));
  if (!n) return 'wrong';
  const alts = answer.split('/').map(a => bare(norm(a))).filter(Boolean);
  if (alts.includes(n)) return 'right';
  if (alts.some(a => lev(a, n) <= (a.length >= 8 ? 2 : a.length >= 4 ? 1 : 0))) return 'close';
  return 'wrong';
}

/* =========================================================
   Router
   ========================================================= */
const app = $('#app');
let session = null;
let currentView = 'home';

const tabFor = v => ({ home: 'home', review: 'home', quiz: 'home', lessons: 'lessons', lesson: 'lessons', lessonEdit: 'lessons', bulk: 'lessons', add: 'add', edit: 'cards', cards: 'cards', settings: 'settings' }[v] || 'home');

function route() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, q] = raw.split('?');
  const [view, id] = path.split('/');
  const p = new URLSearchParams(q || '');
  const fn = views[view] ? view : 'home';
  if (session && session.finished && fn !== session.type) session = null;
  if (fn !== currentView) window.scrollTo(0, 0);
  currentView = fn;
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tabFor(fn)));
  app.innerHTML = views[fn](id, p);
  const af = app.querySelector('[autofocus]');
  if (af && matchMedia('(hover: hover)').matches) af.focus();
}

const go = h => { if (location.hash === h) route(); else location.hash = h; };

/* =========================================================
   Ansichten
   ========================================================= */
function lessonOptions(selected, withAll) {
  const opts = sortedLessons().map(l => `<option value="${l.id}" ${l.id === selected ? 'selected' : ''}>${esc(l.title)}</option>`).join('');
  return (withAll ? `<option value="">Alle Karten</option>` : `<option value="">Keine Lektion</option>`) + opts;
}

function cardRow(c, showLesson) {
  const l = showLesson && c.lessonId ? getLesson(c.lessonId) : null;
  const search = esc(norm(`${c.de} ${c.da} ${c.note}`));
  return `<a class="item" href="#/edit/${c.id}" data-search="${search}">
    <div>
      <div class="da">${esc(c.da)}</div>
      <div class="de">${esc(c.de)}</div>
      ${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}
      ${l ? `<div class="lesson-name">${esc(l.title)}</div>` : ''}
    </div>
    ${srsBadge(c)}
  </a>`;
}

/* ---------- Aussprache-Hilfe für die Startseite ---------- */
const SOUNDS = [
  ['3', 'ع', 'Gepresster Laut tief aus der Kehle – wie ein „a“, bei dem man den Hals zusammendrückt.', '3afak = bitte · 3ndi = ich habe'],
  ['7', 'ح', 'Kräftig gehauchtes H aus dem Hals – wie beim Anhauchen einer Brille, nur rauer.', '7na = wir · lb7er = das Meer'],
  ['9', 'ق', 'K ganz hinten im Rachen, dumpfer als das deutsche K.', '9rib = nah · l9ahwa = der Kaffee'],
  ['2', 'ء', 'Kurzer Stopp in der Stimme – wie zwischen „be“ und „achten“.', 'l3a2ila = die Familie'],
  ['kh', 'خ', 'Wie „ch“ in „Bach“.', 'lkhobz = das Brot · khoya = mein Bruder'],
  ['gh', 'غ', 'Gerolltes Rachen-R wie im Französischen „Paris“.', 'ghedda = morgen · ghali = teuer'],
  ['ch', 'ش', 'Wie deutsches „sch“ (manche schreiben auch sh).', 'chokran = danke · chwiya = ein bisschen'],
];

let soundsOpen = true;
try { soundsOpen = localStorage.getItem('darija-sounds-open') !== '0'; } catch (e) { /* egal */ }

function soundsCard() {
  return `<details class="card sounds" data-sounds ${soundsOpen ? 'open' : ''}>
    <summary><b>🔤 Aussprache: Zahlen in der Umschrift</b></summary>
    <p class="muted small">Für Laute, die es im Deutschen nicht gibt, schreibt man in Marokko Zahlen, die dem arabischen Buchstaben ähnlich sehen – so auch in WhatsApp.</p>
    <div class="sound-list">${SOUNDS.map(([sym, ar, how, ex]) => `<div class="sound">
      <div class="sym">${esc(sym)}<span>${ar}</span></div>
      <div><p>${esc(how)}</p><p class="ex">${esc(ex)}</p></div>
    </div>`).join('')}</div>
  </details>`;
}

const views = {
  /* ---------- Start ---------- */
  home() {
    const due = dueCards().length, total = state.cards.length;
    const learned = state.cards.filter(c => c.srs.reps > 0).length;
    const start = new Date(state.settings.courseStart + 'T00:00').getTime();
    const days = Math.round((start - startOfDay()) / DAY);
    let banner = '';
    if (days > 0) banner = `<div class="banner">🇲🇦 Noch <b>${plural(days, 'Tag', 'Tage')}</b> bis zum Sprachkurs (${fmtDate(state.settings.courseStart)})</div>`;
    else if (days === 0) banner = `<div class="banner">🎉 Heute startet dein Sprachkurs! Leg danach direkt eine <a href="#/lessonEdit/new"><b>neue Lektion</b></a> an.</div>`;

    if (!total) {
      return `<div class="stack">
        <h1>Salam! 👋</h1>
        ${banner}
        <div class="card empty">
          <span class="emoji">📚</span>
          <p>Noch keine Karten. Importier unten die Basics und Video-Lektionen – oder leg eine eigene Lektion an.</p>
        </div>
        ${packSection()}
        <a class="btn block" href="#/lessonEdit/new">Eigene Lektion anlegen</a>
        ${soundsCard()}
      </div>`;
    }

    const recent = sortedLessons().slice(0, 3).map(l => {
      const n = lessonCards(l.id).length, d = dueCards(l.id).length;
      return `<a class="item" href="#/lesson/${l.id}"><div><div class="da">${esc(l.title)}</div><div class="de">${fmtDate(l.date)} · ${plural(n, 'Karte', 'Karten')}</div></div>${d ? `<span class="badge due">${d} fällig</span>` : ''}</a>`;
    }).join('');

    return `<div class="stack">
      <h1>Salam! 👋</h1>
      ${banner}
      <div class="stats">
        <div class="stat"><b>${due}</b><span>fällig</span></div>
        <div class="stat"><b>${learned}/${total}</b><span>gelernt</span></div>
        <div class="stat"><b>${currentStreak()}🔥</b><span>Tage am Stück</span></div>
      </div>
      ${due
        ? `<a class="btn primary big block" href="#/review">Jetzt wiederholen (${due})</a>`
        : `<div class="card"><b>Alles erledigt für jetzt ✅</b><p class="muted small">Neue Karten oder Quiz gehen trotzdem immer.</p></div>`}
      <div class="row-flex">
        <a class="btn" style="flex:1" href="#/quiz">🎯 Quiz</a>
        <a class="btn" style="flex:1" href="#/review?all=1">🔁 Alles üben</a>
      </div>
      ${packSection(true)}
      ${recent ? `<div class="spread"><h2>Letzte Lektionen</h2><a class="muted small" href="#/lessons">Alle →</a></div><div class="list">${recent}</div>` : ''}
      ${soundsCard()}
    </div>`;
  },

  /* ---------- Lektionen ---------- */
  lessons() {
    const rows = sortedLessons().map(l => {
      const n = lessonCards(l.id).length, d = dueCards(l.id).length;
      return `<a class="item" href="#/lesson/${l.id}"><div><div class="da">${esc(l.title)}</div><div class="de">${fmtDate(l.date)} · ${plural(n, 'Karte', 'Karten')}</div></div>${d ? `<span class="badge due">${d} fällig</span>` : ''}</a>`;
    }).join('');
    const loose = lessonCards('none').length;
    return `<div class="stack">
      <div class="spread"><h1>Lektionen</h1><a class="btn primary" href="#/lessonEdit/new">+ Neu</a></div>
      ${packSection()}
      ${rows || loose ? `<div class="list">${rows}${loose ? `<a class="item" href="#/lesson/none"><div><div class="da">Ohne Lektion</div><div class="de">${plural(loose, 'Karte', 'Karten')}</div></div></a>` : ''}</div>`
        : `<div class="card empty"><span class="emoji">🗂️</span>Leg pro Kursstunde oder Video eine Lektion an, z. B. „Stunde 1 – Begrüßung“.</div>`}
    </div>`;
  },

  lesson(id) {
    const l = id === 'none' ? { id: 'none', title: 'Ohne Lektion' } : getLesson(id);
    if (!l) return views.notFound();
    const cards = lessonCards(id).sort((a, b) => a.created - b.created);
    const due = cards.filter(isDue).length;
    return `<div class="stack">
      <div>
        <a class="muted small" href="#/lessons">← Lektionen</a>
        <h1>${esc(l.title)}</h1>
        ${l.date ? `<p class="muted">${fmtDate(l.date)} · ${plural(cards.length, 'Karte', 'Karten')}</p>` : ''}
      </div>
      ${l.notes ? `<div class="card"><p class="small" style="white-space:pre-wrap">${esc(l.notes)}</p></div>` : ''}
      ${cards.length ? `<div class="row-flex">
        <a class="btn primary" style="flex:1" href="#/review?lesson=${id}${due ? '' : '&all=1'}">${due ? `Wiederholen (${due})` : 'Alle üben'}</a>
        <a class="btn" style="flex:1" href="#/quiz?lesson=${id}">🎯 Quiz</a>
      </div>` : ''}
      <div class="row-flex">
        <a class="btn" style="flex:1" href="#/add?lesson=${id === 'none' ? '' : id}">+ Karte</a>
        <a class="btn" style="flex:1" href="#/bulk?lesson=${id === 'none' ? '' : id}">📋 Liste einfügen</a>
      </div>
      ${cards.length ? `<div class="list">${cards.map(c => cardRow(c)).join('')}</div>` : `<div class="card empty">Noch keine Karten in dieser Lektion.</div>`}
      ${id !== 'none' ? `<div class="row-flex"><a class="btn" href="#/lessonEdit/${id}">Bearbeiten</a><button class="btn danger" data-action="delete-lesson" data-id="${id}">Lektion löschen</button></div>` : ''}
    </div>`;
  },

  lessonEdit(id) {
    const l = id === 'new' ? null : getLesson(id);
    if (id !== 'new' && !l) return views.notFound();
    const n = state.lessons.length + 1;
    return `<form class="stack" data-form="lesson" data-id="${l ? l.id : ''}">
      <h1>${l ? 'Lektion bearbeiten' : 'Neue Lektion'}</h1>
      <label>Titel<input name="title" required autofocus value="${esc(l ? l.title : `Kursstunde ${n}`)}" placeholder="z. B. Stunde 1 – Begrüßung"></label>
      <label>Datum<input type="date" name="date" value="${esc(l ? l.date : localDate())}"></label>
      <label>Notizen <span class="hint">Grammatik, Regeln, Hausaufgaben – alles was keine Vokabel ist</span>
        <textarea name="notes" rows="5">${esc(l ? l.notes : '')}</textarea></label>
      <button class="btn primary big">Speichern</button>
    </form>`;
  },

  /* ---------- Karten anlegen ---------- */
  add(_, p) {
    const lid = p.has('lesson') ? p.get('lesson') : state.settings.lastLesson;
    const recent = lessonCards(lid || 'none').sort((a, b) => b.created - a.created).slice(0, 5);
    return `<div class="stack">
      <form class="stack" data-form="card">
        <h1>Neue Karte</h1>
        <label>Deutsch<input name="de" required autofocus autocomplete="off" placeholder="z. B. Danke"></label>
        <label>Darija<input name="da" required autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="z. B. chokran"><span class="hint">Mehrere Schreibweisen mit „/“ trennen: chokran / shukran</span></label>
        <label>Notiz <span class="hint">optional – Aussprache, Beispiel, männlich/weiblich …</span><input name="note" autocomplete="off"></label>
        <label>Lektion<select name="lesson">${lessonOptions(lid)}</select></label>
        <button class="btn primary big">Speichern & nächste</button>
        <a class="muted small" href="#/bulk${lid ? `?lesson=${lid}` : ''}" style="text-align:center">Viele auf einmal? → Liste einfügen</a>
      </form>
      ${recent.length ? `<h2>Zuletzt in „${esc(lessonTitle(lid || 'none'))}“</h2><div class="list">${recent.map(c => cardRow(c)).join('')}</div>` : ''}
    </div>`;
  },

  edit(id) {
    const c = getCard(id);
    if (!c) return views.notFound();
    return `<form class="stack" data-form="card" data-id="${c.id}">
      <h1>Karte bearbeiten</h1>
      <label>Deutsch<input name="de" required value="${esc(c.de)}"></label>
      <label>Darija<input name="da" required autocapitalize="off" spellcheck="false" value="${esc(c.da)}"></label>
      <label>Notiz<input name="note" value="${esc(c.note)}"></label>
      <label>Lektion<select name="lesson">${lessonOptions(c.lessonId)}</select></label>
      <p class="muted small">Lernstand: ${c.srs.reps === 0 ? 'neu' : `${plural(c.srs.reps, 'Wiederholung', 'Wiederholungen')}, Intervall ${ivLabel(c.srs.interval)}`}, ${plural(c.srs.lapses, 'mal vergessen', 'mal vergessen')}</p>
      <button class="btn primary big">Speichern</button>
      <div class="row-flex">
        <button type="button" class="btn" data-action="reset-card" data-id="${c.id}">Lernstand zurücksetzen</button>
        <button type="button" class="btn danger" data-action="delete-card" data-id="${c.id}">Löschen</button>
      </div>
    </form>`;
  },

  bulk(_, p) {
    const lid = p.get('lesson') || state.settings.lastLesson;
    return `<form class="stack" data-form="bulk">
      <div><h1>Liste einfügen</h1>
      <p class="muted small">Eine Karte pro Zeile: <b>Deutsch = Darija</b>. Optional eine Notiz mit „|“ dahinter. Zeilen mit # werden ignoriert. Auch Tab, „;“ oder „ - “ funktionieren als Trenner – praktisch zum Kopieren aus Notizen oder Tabellen.</p></div>
      <label>Lektion<select name="lesson">${lessonOptions(lid)}</select></label>
      <textarea name="text" class="mono" rows="12" required placeholder="Danke = chokran / shukran&#10;Wasser = lma&#10;Wie viel kostet das? = bchhal hada? | beim Einkaufen"></textarea>
      <button class="btn primary big">Karten hinzufügen</button>
    </form>`;
  },

  /* ---------- Alle Karten ---------- */
  cards() {
    const cards = [...state.cards].sort((a, b) => b.created - a.created);
    return `<div class="stack">
      <div class="spread"><h1>Karten</h1><span class="muted">${cards.length}</span></div>
      ${cards.length ? `<input type="search" data-filter placeholder="Suchen (Deutsch oder Darija) …">
        <div class="list" id="cardList">${cards.map(c => cardRow(c, true)).join('')}</div>`
        : `<div class="card empty"><span class="emoji">🃏</span>Noch keine Karten.</div>`}
    </div>`;
  },

  /* ---------- Wiederholen ---------- */
  review(_, p) {
    const key = p.toString();
    if (!session || session.type !== 'review' || session.key !== key || session.finished) {
      const lid = p.get('lesson') || '';
      let cards = lessonCards(lid);
      if (!p.get('all')) cards = dueCards(lid);
      session = { type: 'review', key, lid, queue: shuffle(cards.map(c => c.id)), total: cards.length, done: 0, revealed: false, dir: null };
    }
    const s = session;
    while (s.queue.length && !getCard(s.queue[0])) s.queue.shift();

    if (!s.queue.length) {
      s.finished = true;
      if (!s.total) return `<div class="stack"><div class="card empty"><span class="emoji">🎉</span><b>Nichts fällig.</b><p>Deine nächsten Wiederholungen kommen später.</p></div>
        ${lessonCards(s.lid).length ? `<a class="btn primary block" href="#/review?all=1${s.lid ? `&lesson=${s.lid}` : ''}">Trotzdem alles üben</a>` : ''}
        <a class="btn block" href="#/home">Zur Startseite</a></div>`;
      return `<div class="stack"><div class="card empty"><span class="emoji">💪</span><b>Geschafft!</b><p>${plural(s.done, 'Karte', 'Karten')} wiederholt. Bssa7tek!</p></div>
        <a class="btn primary block" href="#/quiz${s.lid ? `?lesson=${s.lid}` : ''}">🎯 Noch ein Quiz</a>
        <a class="btn block" href="#/home">Zur Startseite</a></div>`;
    }

    const c = getCard(s.queue[0]);
    if (!s.dir) s.dir = pickDir();
    const [front, back] = s.dir === 'de-da' ? [c.de, c.da] : [c.da, c.de];
    const pct = Math.round(100 * s.done / (s.done + s.queue.length));
    const grades = [['Nochmal', 'again'], ['Schwer', 'hard'], ['Gut', 'good'], ['Leicht', 'easy']]
      .map(([t, cls], g) => `<button class="grade ${cls}" data-action="grade" data-g="${g}"><b>${t}</b><small>${ivLabel(nextInterval(c.srs, g))}</small></button>`).join('');

    return `<div class="stack">
      <div class="spread small muted"><span>${esc(lessonTitle(s.lid))}</span><span>${s.queue.length} übrig</span></div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="flash" data-action="reveal">
        <div class="dir">${dirLabel(s.dir)}</div>
        <div class="prompt">${esc(front)}</div>
        ${s.revealed
          ? `<hr><div class="answer">${esc(back)}</div>${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}`
          : `<div class="tap">Antwort im Kopf sagen, dann tippen</div>`}
      </div>
      ${s.revealed ? `<div class="grades">${grades}</div>` : `<button class="btn primary big block" data-action="reveal">Aufdecken</button>`}
      <p class="muted small" style="text-align:center">Tastatur: Leertaste = aufdecken, 1–4 = bewerten</p>
    </div>`;
  },

  /* ---------- Quiz ---------- */
  quiz(_, p) {
    if (!session || session.type !== 'quiz') return quizSetup(p);
    const s = session;
    while (s.i < s.items.length && !getCard(s.items[s.i].id)) s.i++;
    if (s.i >= s.items.length) return quizResult();

    const it = s.items[s.i], c = getCard(it.id);
    const question = it.dir === 'de-da' ? c.de : c.da;
    const pct = Math.round(100 * s.i / s.items.length);
    let body;

    if (it.mode === 'mc') {
      body = `<div class="options">${it.options.map((o, i) => {
        let cls = '';
        if (it.answered && o === it.right) cls = 'right';
        else if (it.answered && i === it.pick) cls = 'wrong';
        return `<button class="option ${cls}" data-action="mc" data-i="${i}" ${it.answered ? 'disabled' : ''}>${esc(o)}</button>`;
      }).join('')}</div>`;
    } else {
      const fb = !it.answered ? '' : {
        right: `<div class="feedback right">Richtig! ✓${it.right.includes('/') ? `<span>Alle Varianten: ${esc(it.right)}</span>` : ''}</div>`,
        close: `<div class="feedback close">Fast – kleiner Tippfehler, zählt als richtig.<span>Korrekt: ${esc(it.right)}</span></div>`,
        wrong: `<div class="feedback wrong">Leider falsch.<span>Richtig: ${esc(it.right)}</span></div>`,
      }[it.result];
      body = `<form class="stack" data-form="type-answer">
        <input name="answer" autocomplete="off" autocapitalize="off" spellcheck="false" autofocus placeholder="Antwort eintippen …" value="${esc(it.given || '')}" ${it.answered ? 'readonly' : ''}>
        ${fb}
        ${it.answered ? '' : `<button class="btn primary big block">Prüfen</button>`}
      </form>`;
    }

    return `<div class="stack">
      <div class="spread small muted"><span>Frage ${s.i + 1} von ${s.items.length}</span><button class="btn" style="padding:4px 10px" data-action="quiz-quit">Abbrechen</button></div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="flash" style="min-height:160px;cursor:default">
        <div class="dir">${dirLabel(it.dir)}</div>
        <div class="prompt">${esc(question)}</div>
        ${it.answered && c.note ? `<div class="note">${esc(c.note)}</div>` : ''}
      </div>
      ${body}
      ${it.answered ? `<button class="btn primary big block" data-action="quiz-next" autofocus>Weiter</button>` : ''}
    </div>`;
  },

  /* ---------- Mehr ---------- */
  settings() {
    const st = state.settings;
    return `<div class="stack">
      <h1>Mehr</h1>
      <form class="card stack" data-form="settings">
        <h2>Einstellungen</h2>
        <label>Richtung beim Wiederholen
          <select name="direction">
            <option value="de-da" ${st.direction === 'de-da' ? 'selected' : ''}>Deutsch → Darija</option>
            <option value="da-de" ${st.direction === 'da-de' ? 'selected' : ''}>Darija → Deutsch</option>
            <option value="mixed" ${st.direction === 'mixed' ? 'selected' : ''}>Gemischt</option>
          </select></label>
        <label>Neue Karten pro Tag
          <select name="newPerDay">${[5, 10, 15, 20, 30, 50, 9999].map(n => `<option value="${n}" ${+st.newPerDay === n ? 'selected' : ''}>${n === 9999 ? 'Unbegrenzt' : n}</option>`).join('')}</select></label>
        <label>Kursstart<input type="date" name="courseStart" value="${esc(st.courseStart)}"></label>
      </form>

      <div class="card stack">
        <h2>Backup</h2>
        <p class="muted small">Deine Karten liegen nur auf diesem Gerät. Exportiere regelmäßig ein Backup – damit kannst du sie auch auf ein anderes Gerät (Mac ↔ iPhone) übertragen. Beim Import werden Karten zusammengeführt, nichts wird gelöscht.</p>
        <div class="row-flex">
          <button class="btn" data-action="export">⬇️ Exportieren</button>
          <label class="btn" style="flex-direction:row">⬆️ Importieren<input type="file" accept=".json,application/json" data-import hidden></label>
        </div>
      </div>

      <div class="card stack">
        <h2>Als App installieren</h2>
        <p class="muted small"><b>iPhone:</b> In Safari öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.<br><b>Mac:</b> In Safari → Ablage → „Zum Dock hinzufügen“, oder in Chrome das Installieren-Symbol in der Adressleiste.</p>
      </div>

      <p class="muted small" style="text-align:center">${plural(state.cards.length, 'Karte', 'Karten')} · ${plural(state.lessons.length, 'Lektion', 'Lektionen')}</p>
      <button class="btn danger" data-action="reset-all">Alle Daten löschen</button>
    </div>`;
  },

  notFound() {
    return `<div class="card empty"><span class="emoji">🤷</span>Nicht gefunden.<br><br><a class="btn" href="#/home">Zur Startseite</a></div>`;
  },
};

/* ---------- Quiz-Logik ---------- */
function quizSetup(p) {
  const lid = p.get('lesson') || '';
  return `<form class="stack" data-form="quiz-setup">
    <h1>Quiz</h1>
    <label>Lektion<select name="lesson">${lessonOptions(lid, true)}${lessonCards('none').length ? `<option value="none" ${lid === 'none' ? 'selected' : ''}>Ohne Lektion</option>` : ''}</select></label>
    <label>Modus<select name="mode">
      <option value="mc">Multiple Choice</option>
      <option value="type">Eintippen</option>
      <option value="mix">Gemischt</option>
    </select></label>
    <label>Richtung<select name="dir">
      <option value="de-da">Deutsch → Darija</option>
      <option value="da-de">Darija → Deutsch</option>
      <option value="mixed">Gemischt</option>
    </select></label>
    <label>Anzahl Fragen<select name="count">
      <option>5</option><option selected>10</option><option>20</option><option value="999">Alle</option>
    </select></label>
    <button class="btn primary big">Quiz starten</button>
  </form>`;
}

function buildQuizItem(c, mode, dir) {
  const d = pickDir(dir);
  const field = d === 'de-da' ? 'da' : 'de';
  const right = c[field];
  let m = mode === 'mix' ? (Math.random() < 0.5 ? 'mc' : 'type') : mode;
  let options = null;
  if (m === 'mc') {
    // Ablenker bevorzugt aus derselben Lektion, dann aus allen Karten
    const others = state.cards.filter(x => x.id !== c.id);
    const pool = [...shuffle(others.filter(x => x.lessonId === c.lessonId)), ...shuffle(others.filter(x => x.lessonId !== c.lessonId))];
    const seen = new Set([norm(right)]), wrong = [];
    for (const o of pool) {
      if (wrong.length === 3) break;
      const k = norm(o[field]);
      if (!seen.has(k)) { seen.add(k); wrong.push(o[field]); }
    }
    if (wrong.length) options = shuffle([right, ...wrong]);
    else m = 'type';
  }
  return { id: c.id, dir: d, mode: m, right, options, answered: false };
}

function startQuiz(cards, mode, dir, count) {
  const picked = shuffle([...cards]).slice(0, count);
  session = { type: 'quiz', mode, dir, items: picked.map(c => buildQuizItem(c, mode, dir)), i: 0, correct: 0, wrong: [] };
  route();
}

function recordQuiz(ok, it) {
  const c = getCard(it.id);
  if (ok) session.correct++;
  else {
    session.wrong.push(it.id);
    if (c) c.srs.due = Math.min(c.srs.due, Date.now()); // Fehler landen in der nächsten Wiederholung
  }
  markActivity();
  save();
}

function quizResult() {
  const s = session;
  s.finished = true;
  const total = s.items.length, pct = Math.round(100 * s.correct / total);
  const msg = pct === 100 ? 'Perfekt! Tbarkallah 🌟' : pct >= 70 ? 'Stark! 💪' : 'Weiter üben – das wird! 🙂';
  const wrongCards = [...new Set(s.wrong)].map(getCard).filter(Boolean);
  return `<div class="stack">
    <div class="card stack" style="text-align:center">
      <div class="score">${s.correct}/${total}</div>
      <b>${msg}</b>
    </div>
    ${wrongCards.length ? `<h2>Nochmal anschauen</h2><div class="list">${wrongCards.map(c => cardRow(c, true)).join('')}</div>
      <button class="btn primary big block" data-action="quiz-wrong">Fehler nochmal üben</button>` : ''}
    <button class="btn block" data-action="quiz-quit">Neues Quiz</button>
    <a class="btn block" href="#/home">Zur Startseite</a>
  </div>`;
}

/* =========================================================
   Daten-Aktionen
   ========================================================= */
function parseBulk(text) {
  const out = [], bad = [];
  text.split('\n').forEach(line => {
    const l = line.trim();
    if (!l || l.startsWith('#')) return;
    const [main, ...rest] = l.split('|');
    const m = main.match(/^(.+?)\s*(?:=|\t|;| - | – )\s*(.+)$/);
    if (!m) { bad.push(l); return; }
    out.push({ de: m[1].trim(), da: m[2].trim(), note: rest.join('|').trim() });
  });
  return { out, bad };
}

/* ---------- Inhaltspakete (packs/*.json, z. B. aufbereitete Videos) ---------- */
let packs = [];
let importing = false;
const packLesson = id => state.lessons.find(l => l.packId === id);
const newPacks = () => packs.filter(p => !packLesson(p.id));
const updatedPacks = () => packs.filter(p => { const l = packLesson(p.id); return l && (p.version || 1) > (l.packVersion || 1); });
const fetchPack = async meta => (await fetch(`packs/${meta.file}`, { cache: 'no-cache' })).json();

async function fetchPacks() {
  try {
    const res = await fetch('packs/index.json', { cache: 'no-cache' });
    if (!res.ok) return;
    packs = await res.json();
    if (['home', 'lessons'].includes(currentView)) route();
  } catch (e) { /* offline – dann eben keine neuen Pakete */ }
}

async function importPacks(ids) {
  const todo = newPacks().filter(p => ids.includes(p.id));
  if (!todo.length || importing) return;
  importing = true;
  const known = new Set(state.cards.map(c => norm(c.de) + '|' + norm(c.da)));
  let added = 0, last = null;
  try {
    for (const [i, meta] of todo.entries()) {
      const pack = await fetchPack(meta);
      const l = { id: uid(), packId: pack.id, packVersion: pack.version || 1, title: pack.title, date: localDate(), notes: pack.notes || '', created: Date.now() + i };
      state.lessons.push(l);
      pack.cards.forEach(([de, da, note]) => {
        const k = norm(de) + '|' + norm(da);
        if (known.has(k)) return; // gleiche Karte gibt es schon
        known.add(k);
        state.cards.push({ ...newCard(de, da, note, l.id), pack: pack.id });
        added++;
      });
      last = l;
    }
  } catch (e) { toast('Paket konnte nicht geladen werden'); }
  importing = false;
  save();
  if (!last) return;
  toast(`${plural(added, 'Karte', 'Karten')} importiert`);
  go(todo.length === 1 ? `#/lesson/${last.id}` : '#/lessons');
}

// Neue Paketversion einspielen: gleiche deutsche Seite → Inhalt ersetzen, Lernstand behalten
async function updatePacks(ids) {
  const todo = updatedPacks().filter(p => ids.includes(p.id));
  if (!todo.length || importing) return;
  importing = true;
  let done = 0;
  try {
    for (const meta of todo) {
      const pack = await fetchPack(meta);
      const l = packLesson(pack.id);
      // Karten aus dem Paket (ältere Importe haben noch kein "pack"-Feld, sind aber zeitgleich mit der Lektion entstanden)
      const old = state.cards.filter(c => c.lessonId === l.id && (c.pack === pack.id || (!c.pack && Math.abs(c.created - l.created) < 10000)));
      const key = t => t.trim().toLowerCase();
      const byDe = new Map(old.map(c => [key(c.de), c]));
      const byDa = new Map(old.map(c => [key(c.da), c]));
      const keep = new Set();
      pack.cards.forEach(([de, da, note]) => {
        // erst über die deutsche Seite zuordnen, sonst über die Darija-Seite (falls nur der deutsche Text umformuliert wurde)
        const c = [byDe.get(key(de)), byDa.get(key(da))].find(x => x && !keep.has(x));
        if (c) { Object.assign(c, { de, da, note, pack: pack.id }); keep.add(c); }
        else state.cards.push({ ...newCard(de, da, note, l.id), pack: pack.id });
      });
      state.cards = state.cards.filter(c => !old.includes(c) || keep.has(c));
      Object.assign(l, { title: pack.title, notes: pack.notes || '', packVersion: pack.version || 1 });
      done++;
    }
  } catch (e) { toast('Aktualisierung fehlgeschlagen'); }
  importing = false;
  save();
  if (done) { toast(`${plural(done, 'Lektion', 'Lektionen')} aktualisiert`); route(); }
}

function packSection(compact) {
  const fresh = newPacks(), upd = updatedPacks();
  if (!fresh.length && !upd.length) return '';
  if (compact) {
    const parts = [fresh.length && plural(fresh.length, 'neue Lektion', 'neue Lektionen'), upd.length && plural(upd.length, 'Update', 'Updates')].filter(Boolean);
    return `<a class="banner" href="#/lessons">📦 <b>${parts.join(' · ')}</b> bereit →</a>`;
  }
  const row = (p, action, label) => `<div class="item"><div><div class="da">${esc(p.title)}</div><div class="de">${esc(p.source || '')}</div></div><button class="btn" data-action="${action}" data-id="${esc(p.id)}">${label}</button></div>`;
  return (upd.length ? `<div class="spread"><h2>🔄 Verbesserte Inhalte</h2>${upd.length > 1 ? `<button class="btn primary" data-action="update-all">Alle aktualisieren</button>` : ''}</div>
      <p class="muted small">Korrigierte Fassungen schon importierter Lektionen. Dein Lernstand bleibt erhalten.</p>
      <div class="list">${upd.map(p => row(p, 'update-pack', 'Aktualisieren')).join('')}</div>` : '')
    + (fresh.length ? `<div class="spread"><h2>📦 Neue Inhalte</h2>${fresh.length > 1 ? `<button class="btn primary" data-action="import-all">Alle importieren</button>` : ''}</div>
      <div class="list">${fresh.map(p => row(p, 'import-pack', 'Importieren')).join('')}</div>` : '');
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `darija-backup-${localDate()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.cards) || !Array.isArray(data.lessons)) throw new Error('format');
    let added = 0, updated = 0;
    const merge = (list, items) => items.forEach(x => {
      const i = list.findIndex(y => y.id === x.id);
      if (i === -1) { list.push(x); added++; } else { list[i] = x; updated++; }
    });
    merge(state.lessons, data.lessons);
    merge(state.cards, data.cards);
    save();
    toast(`Import: ${added} neu, ${updated} aktualisiert`);
    route();
  } catch (e) {
    toast('Datei konnte nicht gelesen werden');
  }
}

/* =========================================================
   Events
   ========================================================= */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;

  if (a === 'reveal' && session?.type === 'review' && !session.revealed) { session.revealed = true; route(); }

  else if (a === 'grade') gradeCurrent(+el.dataset.g);

  else if (a === 'mc') {
    const it = session.items[session.i];
    if (it.answered) return;
    it.answered = true; it.pick = +el.dataset.i;
    recordQuiz(it.options[it.pick] === it.right, it);
    route();
  }
  else if (a === 'quiz-next') { session.i++; route(); }
  else if (a === 'quiz-quit') { session = null; route(); }
  else if (a === 'quiz-wrong') {
    const cards = [...new Set(session.wrong)].map(getCard).filter(Boolean);
    startQuiz(cards, session.mode, session.dir, cards.length);
  }

  else if (a === 'delete-card') {
    if (!confirm('Karte wirklich löschen?')) return;
    const c = getCard(el.dataset.id);
    state.cards = state.cards.filter(x => x.id !== el.dataset.id);
    save(); toast('Gelöscht');
    go(c?.lessonId ? `#/lesson/${c.lessonId}` : '#/cards');
  }
  else if (a === 'reset-card') {
    const c = getCard(el.dataset.id);
    c.srs = newCard('', '').srs;
    save(); toast('Lernstand zurückgesetzt'); route();
  }
  else if (a === 'delete-lesson') {
    const l = getLesson(el.dataset.id);
    const n = lessonCards(l.id).length;
    if (!confirm(`„${l.title}“ löschen?${n ? `\n\nDie ${n} Karten bleiben erhalten und landen unter „Ohne Lektion“.` : ''}`)) return;
    state.lessons = state.lessons.filter(x => x.id !== l.id);
    state.cards.forEach(c => { if (c.lessonId === l.id) c.lessonId = null; });
    if (state.settings.lastLesson === l.id) state.settings.lastLesson = '';
    save(); go('#/lessons');
  }
  else if (a === 'import-pack') importPacks([el.dataset.id]);
  else if (a === 'import-all') importPacks(newPacks().map(p => p.id));
  else if (a === 'update-pack') updatePacks([el.dataset.id]);
  else if (a === 'update-all') updatePacks(updatedPacks().map(p => p.id));
  else if (a === 'export') exportData();
  else if (a === 'reset-all') {
    if (!confirm('Wirklich ALLE Karten und Lektionen löschen? Das kann nicht rückgängig gemacht werden.\n\nTipp: Vorher exportieren.')) return;
    state = defaultState(); save(); go('#/home');
  }
});

function gradeCurrent(g) {
  const s = session;
  if (!s || s.type !== 'review' || !s.revealed) return;
  const id = s.queue.shift(), c = getCard(id);
  if (c) schedule(c, g);
  if (g === 0) s.queue.splice(Math.min(3, s.queue.length), 0, id); // gleich nochmal zeigen
  else s.done++;
  s.revealed = false; s.dir = null;
  markActivity(); save(); route();
}

document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(f));
  const kind = f.dataset.form;

  if (kind === 'card') {
    if (!d.de.trim() || !d.da.trim()) return;
    const lessonId = d.lesson || null;
    if (f.dataset.id) {
      Object.assign(getCard(f.dataset.id), { de: d.de.trim(), da: d.da.trim(), note: d.note.trim(), lessonId });
      save(); toast('Gespeichert');
      go(lessonId ? `#/lesson/${lessonId}` : '#/cards');
    } else {
      state.cards.push(newCard(d.de, d.da, d.note, lessonId));
      state.settings.lastLesson = lessonId || '';
      save(); toast('Gespeichert ✓');
      go(`#/add?lesson=${lessonId || ''}`);
    }
  }

  else if (kind === 'lesson') {
    let l = f.dataset.id ? getLesson(f.dataset.id) : null;
    if (l) Object.assign(l, { title: d.title.trim(), date: d.date, notes: d.notes });
    else { l = { id: uid(), title: d.title.trim(), date: d.date, notes: d.notes, created: Date.now() }; state.lessons.push(l); }
    state.settings.lastLesson = l.id;
    save(); go(`#/lesson/${l.id}`);
  }

  else if (kind === 'bulk') {
    const { out, bad } = parseBulk(d.text);
    if (!out.length) { toast('Keine Zeile erkannt – Format: Deutsch = Darija'); return; }
    const lessonId = d.lesson || null;
    const existing = new Set(lessonCards(lessonId || 'none').map(c => norm(c.de) + '|' + norm(c.da)));
    let dup = 0;
    out.forEach(x => {
      if (existing.has(norm(x.de) + '|' + norm(x.da))) { dup++; return; }
      state.cards.push(newCard(x.de, x.da, x.note, lessonId));
    });
    state.settings.lastLesson = lessonId || '';
    save();
    toast(`${out.length - dup} Karten hinzugefügt${dup ? `, ${dup} doppelt übersprungen` : ''}`);
    if (bad.length) alert(`Diese Zeilen konnten nicht gelesen werden:\n\n${bad.join('\n')}`);
    go(`#/lesson/${lessonId || 'none'}`);
  }

  else if (kind === 'quiz-setup') {
    const cards = lessonCards(d.lesson);
    if (!cards.length) { toast('Keine Karten in dieser Auswahl'); return; }
    startQuiz(cards, d.mode, d.dir, +d.count);
  }

  else if (kind === 'type-answer') {
    const it = session.items[session.i];
    if (it.answered) { session.i++; route(); return; }
    if (!d.answer.trim()) return;
    it.answered = true; it.given = d.answer;
    it.result = checkAnswer(d.answer, it.right);
    recordQuiz(it.result !== 'wrong', it);
    route();
  }
});

// Auf-/Zuklappen der Aussprache-Hilfe merken
document.addEventListener('toggle', e => {
  if (!e.target.matches?.('[data-sounds]')) return;
  soundsOpen = e.target.open;
  try { localStorage.setItem('darija-sounds-open', soundsOpen ? '1' : '0'); } catch (err) { /* egal */ }
}, true);

document.addEventListener('change', e => {
  if (e.target.matches('[data-import]') && e.target.files[0]) importData(e.target.files[0]);
  const f = e.target.closest('[data-form="settings"]');
  if (f) {
    Object.assign(state.settings, Object.fromEntries(new FormData(f)));
    save(); toast('Gespeichert');
  }
});

document.addEventListener('input', e => {
  if (!e.target.matches('[data-filter]')) return;
  const q = norm(e.target.value);
  document.querySelectorAll('#cardList [data-search]').forEach(el => { el.hidden = q && !el.dataset.search.includes(q); });
});

document.addEventListener('keydown', e => {
  if (!session || e.metaKey || e.ctrlKey) return;
  const typing = /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName);
  if (session.type === 'review' && !typing && currentView === 'review') {
    if ((e.key === ' ' || e.key === 'Enter') && !session.revealed) { e.preventDefault(); session.revealed = true; route(); }
    else if (session.revealed && '1234'.includes(e.key)) gradeCurrent(+e.key - 1);
  }
  if (session.type === 'quiz' && currentView === 'quiz' && !typing && e.key === 'Enter') {
    const it = session.items[session.i];
    if (it?.answered) { e.preventDefault(); session.i++; route(); }
  }
});

/* =========================================================
   Start
   ========================================================= */
window.addEventListener('hashchange', route);
route();
updateDuePill();
fetchPacks();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
if (navigator.storage?.persist) navigator.storage.persist();
