/* ==========================================
   app.js — KanaTest Application Logic
   ========================================== */

'use strict';

/* =============================================
   STATE
   ============================================= */
const state = {
  // UI
  currentSection: 'study',
  studyTab: 'hiragana',
  darkMode: false,

  // Config
  questionCount: 50,

  // Test runtime — all reset in startTest()
  configuredCount: 0,
  newQueue: [],          // questions not yet presented for the first time
  repeatQueue: [],       // questions queued to redo (answered wrong)
  currentQuestion: null,
  isRepeat: false,       // is the current question a redo?

  correctCount: 0,       // unique questions answered correctly first time
  mistakes: [],          // { kana, romaji, userAnswer } — unique wrong answers

  timerInterval: null,
  startTime: null,
  elapsedSeconds: 0,
  timerEnabled: false,
};

/* =============================================
   INIT
   ============================================= */
document.addEventListener('DOMContentLoaded', () => {
  // Dark mode
  const saved = localStorage.getItem('kanatest-dark');
  if (saved === 'true' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    enableDark();
  }

  // Study tables
  renderStudyTables('hiragana');

  // Reference section
  renderReference();

  // Config watchers
  watchConfig();

  // Initial pool preview
  updatePoolPreview();

  // Enter key on romaji input
  const input = document.getElementById('romaji-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitAnswer();
    });
  }

  // Escape → quit
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.currentSection === 'test') {
      const active = document.getElementById('test-active');
      if (active && !active.classList.contains('hidden')) quitTest();
    }
  });
});

/* =============================================
   DARK MODE
   ============================================= */
function toggleDarkMode() {
  state.darkMode ? disableDark() : enableDark();
}
function enableDark() {
  document.documentElement.classList.add('dark');
  state.darkMode = true;
  localStorage.setItem('kanatest-dark', 'true');
  document.getElementById('icon-moon').classList.add('hidden');
  document.getElementById('icon-sun').classList.remove('hidden');
}
function disableDark() {
  document.documentElement.classList.remove('dark');
  state.darkMode = false;
  localStorage.setItem('kanatest-dark', 'false');
  document.getElementById('icon-sun').classList.add('hidden');
  document.getElementById('icon-moon').classList.remove('hidden');
}

/* =============================================
   SECTION NAVIGATION
   ============================================= */
function showSection(name) {
  state.currentSection = name;
  ['study', 'test', 'reference'].forEach(s => {
    document.getElementById(`section-${s}`).classList.toggle('hidden', s !== name);
    document.getElementById(`tab-${s}`).classList.toggle('active', s === name);
  });
  if (name === 'test') updatePoolPreview();
}

/* =============================================
   STUDY TABLES
   ============================================= */
function switchStudyTab(tab) {
  state.studyTab = tab;
  ['hiragana', 'katakana', 'both'].forEach(t => {
    const el = document.getElementById(`study-tab-${t}`);
    if (el) el.classList.toggle('active', t === tab);
  });
  renderStudyTables(tab);
}

function renderStudyTables(tab) {
  const container = document.getElementById('study-tables-container');
  container.innerHTML = '';
  let tables = [];
  if (tab === 'hiragana' || tab === 'both') tables = tables.concat(STUDY_TABLES.hiragana);
  if (tab === 'katakana' || tab === 'both') tables = tables.concat(STUDY_TABLES.katakana);
  tables.forEach(t => container.appendChild(buildKanaTableCard(t)));
}

function buildKanaTableCard({ id, title, badge, badgeColor, data, rows }) {
  const section = document.createElement('div');
  section.className = 'kana-table-section';
  section.id = `table-${id}`;

  const titleEl = document.createElement('div');
  titleEl.className = 'kana-table-title font-sans';
  titleEl.innerHTML = `${escapeHtml(title)}<span class="badge ${escapeHtml(badgeColor)}">${escapeHtml(badge)}</span>`;
  section.appendChild(titleEl);

  // Detect column count from rows (combo = 3 cols, everything else = 5)
  const colCount = (rows && rows[0]) ? rows[0].length : 5;

  if (rows) {
    // Row-based grid layout (proper Gojūon order)
    const grid = document.createElement('div');
    grid.className = 'kana-row-grid';
    grid.style.cssText = `display:grid; grid-template-columns: repeat(${colCount}, minmax(52px, 1fr)); gap: 3px;`;

    rows.forEach((row, rowIdx) => {
      row.forEach(cell => {
        const div = document.createElement('div');
        if (cell === null) {
          div.className = 'kana-cell kana-cell-empty';
          div.style.cssText = 'background:transparent; border:1px dashed transparent;';
        } else {
          div.className = 'kana-cell';
          div.title = cell.romaji;
          // Alternate row tint for readability
          if (rowIdx % 2 === 1) div.style.background = 'rgba(255,45,114,0.03)';
          div.innerHTML = `<span class="kana-char font-jp">${escapeHtml(cell.kana)}</span><span class="kana-rom">${escapeHtml(cell.romaji)}</span>`;
        }
        grid.appendChild(div);
      });
    });
    section.appendChild(grid);
  } else {
    // Fallback: flat grid
    const grid = document.createElement('div');
    grid.className = 'kana-table-grid';
    data.forEach(({ kana, romaji }) => {
      const cell = document.createElement('div');
      cell.className = 'kana-cell';
      cell.title = romaji;
      cell.innerHTML = `<span class="kana-char font-jp">${escapeHtml(kana)}</span><span class="kana-rom">${escapeHtml(romaji)}</span>`;
      grid.appendChild(cell);
    });
    section.appendChild(grid);
  }
  return section;
}

/* =============================================
   REFERENCE TABLES
   ============================================= */
function renderReference() {
  const container = document.getElementById('reference-container');
  if (!container) return;

  const sections = [
    { title: 'Hiragana → Romaji (Basic)', subtitle: 'Complete Gojūon mapping for Hiragana', data: KANA.hiragana_basic, label: 'Hiragana' },
    { title: 'Katakana → Romaji (Basic)', subtitle: 'Complete Gojūon mapping for Katakana', data: KANA.katakana_basic, label: 'Katakana' },
    { title: 'Dakuon Transformations (濁音)', subtitle: 'Voiced consonant variations using ゛', isDakuon: true },
    { title: 'Handakuten Transformations (半濁音)', subtitle: 'Semi-voiced variations using ゜', isHandakuten: true },
    { title: 'Combination Kana (組み合わせ)', subtitle: 'Hiragana and Katakana combinations', isCombo: true },
  ];

  sections.forEach(s => {
    const wrap = document.createElement('div');
    wrap.className = 'bg-white dark:bg-gray-900 rounded-2xl border border-stone-200 dark:border-gray-800 overflow-hidden shadow-sm';
    wrap.innerHTML = `<div class="px-5 py-4 border-b border-stone-100 dark:border-gray-800">
      <h2 class="font-semibold text-gray-800 dark:text-gray-200 text-base">${escapeHtml(s.title)}</h2>
      <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">${escapeHtml(s.subtitle)}</p>
    </div>`;
    const content = document.createElement('div');
    content.className = 'overflow-x-auto';
    if (s.isDakuon) content.appendChild(buildDakuonTable());
    else if (s.isHandakuten) content.appendChild(buildHandakutenTable());
    else if (s.isCombo) content.appendChild(buildComboTable());
    else content.appendChild(buildBasicRefTable(s.data, s.label));
    wrap.appendChild(content);
    container.appendChild(wrap);
  });
}

function buildBasicRefTable(data, label) {
  const table = document.createElement('table');
  table.className = 'ref-table';
  table.innerHTML = `<thead><tr><th>${escapeHtml(label)}</th><th>Romaji</th><th>${escapeHtml(label)}</th><th>Romaji</th><th>${escapeHtml(label)}</th><th>Romaji</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  for (let i = 0; i < data.length; i += 3) {
    const tr = document.createElement('tr');
    for (let j = 0; j < 3; j++) {
      const item = data[i + j];
      tr.innerHTML += item
        ? `<td><span class="ref-kana-char">${escapeHtml(item.kana)}</span></td><td class="text-gray-500 dark:text-gray-400 font-mono text-sm">${escapeHtml(item.romaji)}</td>`
        : '<td></td><td></td>';
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function buildDakuonTable() {
  const pairs = [
    { from: 'か→が', h: 'ka→ga', k: 'カ→ガ' }, { from: 'き→ぎ', h: 'ki→gi', k: 'キ→ギ' },
    { from: 'く→ぐ', h: 'ku→gu', k: 'ク→グ' }, { from: 'け→げ', h: 'ke→ge', k: 'ケ→ゲ' },
    { from: 'こ→ご', h: 'ko→go', k: 'コ→ゴ' }, { from: 'さ→ざ', h: 'sa→za', k: 'サ→ザ' },
    { from: 'し→じ', h: 'shi→ji', k: 'シ→ジ' }, { from: 'す→ず', h: 'su→zu', k: 'ス→ズ' },
    { from: 'せ→ぜ', h: 'se→ze', k: 'セ→ゼ' }, { from: 'そ→ぞ', h: 'so→zo', k: 'ソ→ゾ' },
    { from: 'た→だ', h: 'ta→da', k: 'タ→ダ' }, { from: 'て→で', h: 'te→de', k: 'テ→デ' },
    { from: 'と→ど', h: 'to→do', k: 'ト→ド' }, { from: 'は→ば', h: 'ha→ba', k: 'ハ→バ' },
    { from: 'ひ→び', h: 'hi→bi', k: 'ヒ→ビ' }, { from: 'ふ→ぶ', h: 'fu→bu', k: 'フ→ブ' },
    { from: 'へ→べ', h: 'he→be', k: 'ヘ→ベ' }, { from: 'ほ→ぼ', h: 'ho→bo', k: 'ホ→ボ' },
  ];
  const table = document.createElement('table');
  table.className = 'ref-table';
  table.innerHTML = `<thead><tr><th>Hiragana Pair</th><th>Change</th><th>Katakana Pair</th><th>Change</th><th>Hiragana Pair</th><th>Change</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  for (let i = 0; i < pairs.length; i += 2) {
    const tr = document.createElement('tr');
    const a = pairs[i], b = pairs[i + 1] || {};
    tr.innerHTML = `
      <td class="ref-kana-char">${escapeHtml(a.from || '')}</td><td class="text-gray-500 font-mono text-xs">${escapeHtml(a.h || '')}</td>
      <td class="ref-kana-char">${escapeHtml(a.k || '')}</td><td class="text-gray-500 font-mono text-xs">${escapeHtml(a.h || '')}</td>
      <td class="ref-kana-char">${escapeHtml(b.from || '')}</td><td class="text-gray-500 font-mono text-xs">${escapeHtml(b.h || '')}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function buildHandakutenTable() {
  const table = document.createElement('table');
  table.className = 'ref-table';
  table.innerHTML = `<thead><tr><th>Hiragana</th><th>Romaji</th><th>Katakana</th><th>Romaji</th><th>Note</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  [['ぱ', 'pa', 'パ', 'pa', 'は→ぱ (ha→pa)'], ['ぴ', 'pi', 'ピ', 'pi', 'ひ→ぴ (hi→pi)'],
  ['ぷ', 'pu', 'プ', 'pu', 'ふ→ぷ (fu→pu)'], ['ぺ', 'pe', 'ペ', 'pe', 'へ→ぺ (he→pe)'],
  ['ぽ', 'po', 'ポ', 'po', 'ほ→ぽ (ho→po)']].forEach(([h, hr, k, kr, note]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="ref-kana-char">${h}</td><td class="text-gray-500 font-mono text-sm">${hr}</td><td class="ref-kana-char">${k}</td><td class="text-gray-500 font-mono text-sm">${kr}</td><td class="text-xs text-gray-400">${note}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function buildComboTable() {
  const table = document.createElement('table');
  table.className = 'ref-table';
  table.innerHTML = `<thead><tr><th>Hiragana</th><th>Romaji</th><th>Katakana</th><th>Romaji</th><th>Hiragana</th><th>Romaji</th><th>Katakana</th><th>Romaji</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  const hc = KANA.hiragana_combo, kc = KANA.katakana_combo;
  for (let i = 0; i < Math.max(hc.length, kc.length); i += 2) {
    const tr = document.createElement('tr');
    const ha = hc[i] || {}, ka = kc[i] || {}, hb = hc[i + 1] || {}, kb = kc[i + 1] || {};
    tr.innerHTML = `<td class="ref-kana-char">${escapeHtml(ha.kana || '')}</td><td class="text-gray-500 font-mono text-xs">${escapeHtml(ha.romaji || '')}</td>
    <td class="ref-kana-char">${escapeHtml(ka.kana || '')}</td><td class="text-gray-500 font-mono text-xs">${escapeHtml(ka.romaji || '')}</td>
    <td class="ref-kana-char">${escapeHtml(hb.kana || '')}</td><td class="text-gray-500 font-mono text-xs">${escapeHtml(hb.romaji || '')}</td>
    <td class="ref-kana-char">${escapeHtml(kb.kana || '')}</td><td class="text-gray-500 font-mono text-xs">${escapeHtml(kb.romaji || '')}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

/* =============================================
   CONFIG WATCHERS
   ============================================= */
function watchConfig() {
  document.querySelectorAll('input[name="kana-type"]').forEach(r => {
    r.addEventListener('change', updatePoolPreview);
  });
  ['mod-dakuon', 'mod-handakuten', 'mod-combo', 'mod-halfwidth'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updatePoolPreview);
  });
  const customCount = document.getElementById('custom-count');
  if (customCount) {
    customCount.addEventListener('input', () => {
      const val = parseInt(customCount.value);
      if (val > 0) {
        state.questionCount = val;
        document.querySelectorAll('.q-count-btn').forEach(b => b.classList.remove('active'));
      }
    });
  }
}

function setQuestionCount(n) {
  state.questionCount = n;
  document.querySelectorAll('.q-count-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.count) === n);
  });
  document.getElementById('custom-count').value = '';
}

function getSelectedKanaType() {
  const r = document.querySelector('input[name="kana-type"]:checked');
  return r ? r.value : 'simple-hiragana';
}

function buildPool() {
  const type = getSelectedKanaType();
  const dakuon = document.getElementById('mod-dakuon').checked;
  const handakuten = document.getElementById('mod-handakuten').checked;
  const combo = document.getElementById('mod-combo').checked;
  const halfwidth = document.getElementById('mod-halfwidth').checked;

  let pool = [];

  const addHiragana = (mods) => {
    pool = pool.concat(KANA.hiragana_basic);
    if (mods && dakuon) pool = pool.concat(KANA.hiragana_dakuon);
    if (mods && handakuten) pool = pool.concat(KANA.hiragana_handakuten);
    if (mods && combo) pool = pool.concat(KANA.hiragana_combo);
  };
  const addKatakana = (mods) => {
    pool = pool.concat(KANA.katakana_basic);
    if (mods && dakuon) pool = pool.concat(KANA.katakana_dakuon);
    if (mods && handakuten) pool = pool.concat(KANA.katakana_handakuten);
    if (mods && combo) pool = pool.concat(KANA.katakana_combo);
    if (mods && halfwidth) pool = pool.concat(KANA.halfwidth_katakana);
  };

  switch (type) {
    case 'simple-hiragana': pool = [...KANA.hiragana_basic]; break;
    case 'all-hiragana': addHiragana(true); break;
    case 'simple-katakana': pool = [...KANA.katakana_basic]; break;
    case 'all-katakana': addKatakana(true); break;
    case 'mixed': addHiragana(true); addKatakana(true); break;
  }

  // Deduplicate
  const seen = new Set();
  return pool.filter(item => {
    if (seen.has(item.kana)) return false;
    seen.add(item.kana);
    return true;
  });
}

function updatePoolPreview() {
  const pool = buildPool();
  const text = document.getElementById('pool-preview-text');
  const chips = document.getElementById('pool-preview-chips');
  if (!text || !chips) return;
  text.textContent = `${pool.length} characters available:`;
  chips.innerHTML = '';
  pool.slice(0, 60).forEach(({ kana }) => {
    const chip = document.createElement('span');
    chip.className = 'pool-chip font-jp';
    chip.textContent = kana;
    chips.appendChild(chip);
  });
  if (pool.length > 60) {
    const more = document.createElement('span');
    more.className = 'pool-chip text-xs text-gray-400 dark:text-gray-600';
    more.textContent = `+${pool.length - 60}`;
    chips.appendChild(more);
  }
}

/* =============================================
   TEST SYSTEM
   ============================================= */
function startTest() {
  const pool = buildPool();
  if (pool.length === 0) { alert('No kana selected. Please choose a kana type.'); return; }

  // Determine question count
  const customEl = document.getElementById('custom-count');
  const customVal = parseInt(customEl.value);
  const count = (customVal > 0) ? customVal : state.questionCount;

  // ---- FULL STATE RESET ----
  state.configuredCount = count;
  state.correctCount = 0;
  state.mistakes = [];
  state.currentQuestion = null;
  state.isRepeat = false;
  state.elapsedSeconds = 0;
  state.timerEnabled = document.getElementById('timer-mode').checked;
  if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
  state.startTime = null;

  // Build newQueue: random sample of `count` from pool
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  state.newQueue = [];
  state.repeatQueue = [];
  for (let i = 0; i < count; i++) {
    state.newQueue.push({ ...shuffled[i % shuffled.length] });
  }

  // ---- Reset DOM ----
  document.getElementById('q-total').textContent = count;
  document.getElementById('q-current').textContent = '0';
  document.getElementById('hud-new').textContent = '0';
  document.getElementById('hud-redo').textContent = '0';
  document.getElementById('hud-pending').textContent = count;
  document.getElementById('progress-bar').style.width = '0%';
  resetInputUI();

  // Timer
  const timerDisplay = document.getElementById('timer-display');
  if (state.timerEnabled) {
    timerDisplay.style.display = 'flex';
    state.startTime = Date.now();
    state.timerInterval = setInterval(() => {
      state.elapsedSeconds = Math.floor((Date.now() - state.startTime) / 1000);
      document.getElementById('timer-value').textContent = formatTime(state.elapsedSeconds);
    }, 500);
  } else {
    timerDisplay.style.display = 'none';
    state.startTime = Date.now();
  }

  // Switch panels
  document.getElementById('test-config').classList.add('hidden');
  document.getElementById('test-results').classList.add('hidden');
  document.getElementById('test-active').classList.remove('hidden');

  showNextQuestion();
}

function showNextQuestion() {
  // Decide: pick from repeatQueue first (if has items), else newQueue
  // We interleave repeats: every 2 new questions, insert a repeat if available
  let question = null;
  let isRepeat = false;

  if (state.repeatQueue.length > 0 && (state.newQueue.length === 0 || shouldPickRepeat())) {
    question = state.repeatQueue.shift();
    isRepeat = true;
  } else if (state.newQueue.length > 0) {
    question = state.newQueue.shift();
    isRepeat = false;
  } else if (state.repeatQueue.length > 0) {
    // Only repeats left
    question = state.repeatQueue.shift();
    isRepeat = true;
  } else {
    // All done!
    endTest();
    return;
  }

  state.currentQuestion = question;
  state.isRepeat = isRepeat;
  updateHUD();

  // Animate kana card
  const charEl = document.getElementById('kana-character');
  charEl.classList.remove('animate-pop');
  void charEl.offsetWidth;
  charEl.classList.add('animate-pop');
  charEl.textContent = question.kana;

  // Type badge
  const badge = document.getElementById('kana-type-badge');
  const isHiragana = /[\u3040-\u309F]/.test(question.kana);
  badge.textContent = isHiragana ? 'Hiragana' : 'Katakana';
  badge.className = `absolute bottom-4 text-xs font-medium px-2.5 py-1 rounded-full ${isHiragana
    ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400'
    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
    }`;

  // If it's a redo, show a subtle redo indicator on the card
  const card = document.getElementById('kana-card');
  if (isRepeat) {
    card.style.borderColor = '#fed7aa'; // amber for redo
  } else {
    card.style.borderColor = '';
  }

  resetInputUI();
  setTimeout(() => document.getElementById('romaji-input').focus(), 50);
}

// Interleave strategy: show a repeat every 3 new questions, or when no new left
let _newsSinceLastRepeat = 0;
function shouldPickRepeat() {
  if (state.newQueue.length === 0) return true;
  _newsSinceLastRepeat++;
  if (_newsSinceLastRepeat >= 3) {
    _newsSinceLastRepeat = 0;
    return true;
  }
  return false;
}

function updateHUD() {
  // New = correctly answered (first-time correct)
  document.getElementById('hud-new').textContent = state.correctCount;
  // Redo = items currently in repeatQueue + (1 if current is repeat)
  const redoCount = state.repeatQueue.length + (state.isRepeat ? 1 : 0);
  document.getElementById('hud-redo').textContent = redoCount;
  // Pending = new questions not yet seen
  document.getElementById('hud-pending').textContent = state.newQueue.length;

  // Progress bar = correct / configuredCount
  const pct = state.configuredCount > 0
    ? (state.correctCount / state.configuredCount) * 100
    : 0;
  document.getElementById('progress-bar').style.width = `${Math.min(pct, 100)}%`;

  // q-current = total unique questions presented so far = correct + unique mistakes seen
  const uniqueSeen = state.correctCount + state.mistakes.length;
  document.getElementById('q-current').textContent = Math.min(uniqueSeen, state.configuredCount);
}

function resetInputUI() {
  const input = document.getElementById('romaji-input');
  input.value = '';
  input.style.borderColor = '';

  document.getElementById('feedback-msg').classList.add('hidden');
  document.getElementById('wrong-reveal').classList.add('hidden');
  document.getElementById('input-icon').classList.add('hidden');

  const card = document.getElementById('kana-card');
  card.style.borderColor = state.isRepeat ? '#fed7aa' : '';
}

function submitAnswer() {
  const input = document.getElementById('romaji-input');
  const userAnswer = input.value.trim().toLowerCase();
  if (!userAnswer) return;

  const accepted = acceptedAnswers(state.currentQuestion.romaji);
  const isCorrect = accepted.includes(userAnswer);

  if (isCorrect) {
    handleCorrect();
  } else {
    handleWrong(userAnswer);
  }
}

function acceptedAnswers(romaji) {
  const base = romaji.toLowerCase();
  const map = {
    'shi': ['si'], 'chi': ['ti'], 'tsu': ['tu'], 'fu': ['hu'],
    'ji': ['zi', 'di'], 'zu': ['du'],
    'sha': ['sya'], 'shu': ['syu'], 'sho': ['syo'],
    'cha': ['tya', 'cya'], 'chu': ['tyu', 'cyu'], 'cho': ['tyo', 'cyo'],
    'ja': ['zya', 'jya', 'dya'], 'ju': ['zyu', 'jyu', 'dyu'], 'jo': ['zyo', 'jyo', 'dyo'],
    'wo': ['o'], 'n': ['nn'],
  };
  const rev = {};
  Object.entries(map).forEach(([k, vals]) => vals.forEach(v => { rev[v] = rev[v] || []; rev[v].push(k); }));
  return [...new Set([base, ...(map[base] || []), ...(rev[base] || [])])];
}

function handleCorrect() {
  const input = document.getElementById('romaji-input');
  const card = document.getElementById('kana-card');

  // Visual
  input.style.borderColor = '#4ade80';
  card.style.borderColor = '#4ade80';

  const icon = document.getElementById('input-icon');
  icon.textContent = '✅'; icon.classList.remove('hidden');

  const msg = document.getElementById('feedback-msg');
  msg.textContent = state.isRepeat ? 'Got it! ✓' : 'Correct!';
  msg.className = 'text-base font-semibold text-green-600 dark:text-green-400';
  msg.classList.remove('hidden');

  // Only count as a new correct if this was NOT a repeat
  if (!state.isRepeat) {
    state.correctCount++;
  }
  // Remove from mistakes if it was there (they finally got it)
  // (mistakes list is for results display only, don't remove mid-test)

  updateHUD();

  setTimeout(() => showNextQuestion(), 600);
}

function handleWrong(userAnswer) {
  const input = document.getElementById('romaji-input');
  const card = document.getElementById('kana-card');

  // Visual
  input.style.borderColor = '#f87171';
  card.style.borderColor = '#f87171';
  card.classList.add('animate-shake');
  setTimeout(() => card.classList.remove('animate-shake'), 400);

  const icon = document.getElementById('input-icon');
  icon.textContent = '❌'; icon.classList.remove('hidden');

  const msg = document.getElementById('feedback-msg');
  msg.textContent = 'Incorrect — try again!';
  msg.className = 'text-base font-semibold text-red-500 dark:text-red-400';
  msg.classList.remove('hidden');

  // Show answer reveal
  document.getElementById('correct-answer-display').textContent =
    `${state.currentQuestion.kana} = ${state.currentQuestion.romaji}`;
  document.getElementById('wrong-reveal').classList.remove('hidden');

  // Track unique mistakes (only add once per kana)
  if (!state.isRepeat) {
    const alreadyTracked = state.mistakes.some(m => m.kana === state.currentQuestion.kana);
    if (!alreadyTracked) {
      state.mistakes.push({ kana: state.currentQuestion.kana, romaji: state.currentQuestion.romaji, userAnswer });
    }
  }

  // Re-queue at back of repeatQueue (so it comes back later)
  state.repeatQueue.push({ ...state.currentQuestion });

  updateHUD();

  // Clear input after delay, keep focus
  setTimeout(() => {
    input.value = '';
    input.style.borderColor = state.isRepeat ? '#fed7aa' : '';
    icon.classList.add('hidden');
    document.getElementById('romaji-input').focus();
  }, 1300);
}

function endTest() {
  if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
  if (state.startTime) state.elapsedSeconds = Math.floor((Date.now() - state.startTime) / 1000);

  // Switch panels
  document.getElementById('test-active').classList.add('hidden');
  document.getElementById('test-results').classList.remove('hidden');

  // Stats
  const total = state.configuredCount;
  const correct = state.correctCount;
  const wrong = state.mistakes.length;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-correct').textContent = correct;
  document.getElementById('stat-wrong').textContent = wrong;
  document.getElementById('stat-accuracy').textContent = `${accuracy}%`;

  // Emoji + subtitle
  let emoji, subtitle;
  if (accuracy === 100) { emoji = '🎉'; subtitle = 'Perfect score! Incredible!'; }
  else if (accuracy >= 90) { emoji = '⭐'; subtitle = 'Amazing — almost perfect!'; }
  else if (accuracy >= 75) { emoji = '👏'; subtitle = 'Great job! Keep practising!'; }
  else if (accuracy >= 60) { emoji = '📚'; subtitle = 'Good effort! Review your mistakes.'; }
  else { emoji = '💪'; subtitle = 'Keep going — practice makes perfect!'; }
  document.getElementById('results-emoji').textContent = emoji;
  document.getElementById('results-subtitle').textContent = subtitle;

  // Time
  const tsb = document.getElementById('time-stat-block');
  if (state.timerEnabled || state.elapsedSeconds > 0) {
    tsb.style.display = 'flex';
    tsb.style.alignItems = 'center';
    tsb.style.justifyContent = 'center';
    tsb.style.gap = '0.5rem';
    document.getElementById('stat-time').textContent = formatTime(state.elapsedSeconds);
  } else {
    tsb.style.display = 'none';
  }

  // Mistakes
  const mistakesSection = document.getElementById('mistakes-section');
  if (state.mistakes.length > 0) {
    mistakesSection.classList.remove('hidden');
    const list = document.getElementById('mistakes-list');
    list.innerHTML = '';
    state.mistakes.forEach(({ kana, romaji, userAnswer }) => {
      const card = document.createElement('div');
      card.className = 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-3 text-center';
      card.innerHTML = `
        <div class="font-jp text-2xl font-bold text-gray-900 dark:text-white mb-1">${escapeHtml(kana)}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Correct: <span class="font-semibold text-green-600 dark:text-green-400">${escapeHtml(romaji)}</span></div>
        <div class="text-xs text-gray-400 dark:text-gray-600">You typed: <span class="text-red-500">${escapeHtml(userAnswer)}</span></div>`;
      list.appendChild(card);
    });
  } else {
    mistakesSection.classList.add('hidden');
  }

  // Progress bar to 100%
  document.getElementById('progress-bar').style.width = '100%';

  // Save to localStorage
  saveProgress({ accuracy, total, correct, wrong, time: state.elapsedSeconds });
}

function quitTest() {
  if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
  backToConfig();
}

function backToConfig() {
  document.getElementById('test-active').classList.add('hidden');
  document.getElementById('test-results').classList.add('hidden');
  document.getElementById('test-config').classList.remove('hidden');
  state.startTime = null;
  _newsSinceLastRepeat = 0;
  updatePoolPreview();
}

function restartTest() {
  document.getElementById('test-results').classList.add('hidden');
  document.getElementById('test-config').classList.remove('hidden');
  _newsSinceLastRepeat = 0;
  setTimeout(() => startTest(), 50);
}

/* =============================================
   LOCALSTORAGE
   ============================================= */
function saveProgress({ accuracy, total, correct, wrong, time }) {
  const history = JSON.parse(localStorage.getItem('kanatest-history') || '[]');
  history.unshift({ date: new Date().toISOString(), accuracy, total, correct, wrong, time });
  history.splice(50);
  localStorage.setItem('kanatest-history', JSON.stringify(history));
}

/* =============================================
   UTILITIES
   ============================================= */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* =============================================
   GLOBAL EXPORTS (onclick handlers)
   ============================================= */
window.showSection = showSection;
window.switchStudyTab = switchStudyTab;
window.toggleDarkMode = toggleDarkMode;
window.setQuestionCount = setQuestionCount;
window.startTest = startTest;
window.submitAnswer = submitAnswer;
window.quitTest = quitTest;
window.backToConfig = backToConfig;
window.restartTest = restartTest;
