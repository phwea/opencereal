"use strict";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CARD_REVEAL_MS = prefersReducedMotion ? 40 : 420;
const BOX_BREAK_MS = prefersReducedMotion ? 0 : 420;
const AUTO_STEP_MS = prefersReducedMotion ? 80 : 420;
const WAIT_AFTER_BREAK_MS = prefersReducedMotion ? 80 : BOX_BREAK_MS + 160;

const RARITIES = [
  { key: '1d', label: '1◆', icon: '◆', repeat: 1, cls: 'rar-1d', pool: 'common' },
  { key: '2d', label: '2◆', icon: '◆', repeat: 2, cls: 'rar-2d', pool: 'uncommon' },
  { key: '3d', label: '3◆', icon: '◆', repeat: 3, cls: 'rar-3d', pool: 'rare' },
  { key: '4d', label: '4◆', icon: '◆', repeat: 4, cls: 'rar-4d', pool: 'ex' },
  { key: '1s', label: '1★', icon: '★', repeat: 1, cls: 'rar-1s', pool: 'illustration' },
  { key: '2s', label: '2★', icon: '★', repeat: 2, cls: 'rar-2s', pool: 'special' },
  { key: '3s', label: '3★', icon: '★', repeat: 3, cls: 'rar-3s', pool: 'immersive' },
  { key: 'cr', label: '👑', icon: '👑', repeat: 1, cls: 'rar-cr', pool: 'crown' }
];

const RAR_INDEX = Object.fromEntries(RARITIES.map((rarity) => [rarity.key, rarity]));

const NAME_ADJ_COMMON = ['Chewy', 'Sunny', 'Rustle', 'Brisk', 'Hollow', 'Misty', 'Snappy', 'Pebbly', 'Crisp', 'Breezy'];
const NAME_ADJ_RARE = ['Luminous', 'Feral', 'Arc', 'Gale', 'Blazing', 'Nebula', 'Auric', 'Prismatic', 'Cryo', 'Volt'];
const NAME_NOUNS = [
  'Sprout',
  'Pounce',
  'Fang',
  'Wisp',
  'Warden',
  'Stride',
  'Tide',
  'Spark',
  'Grove',
  'Raptor',
  'Echo',
  'Gloom',
  'Nimbus',
  'Rune'
];

const BOXES = {
  mini: {
    key: 'mini',
    title: 'Mini Box',
    emoji: '🥣',
    slots: [
      { weights: { '1d': 1 } },
      { weights: { '1d': 1 } },
      { weights: { '1d': 65, '2d': 35 } },
      { weights: { '2d': 70, '3d': 20, '4d': 8, '1s': 1.7, '2s': 0.28, '3s': 0.02 } }
    ],
    desc: '4 cards • budget odds'
  },
  standard: {
    key: 'standard',
    title: 'Standard Box',
    emoji: '📦',
    slots: [
      { weights: { '1d': 1 } },
      { weights: { '1d': 1 } },
      { weights: { '1d': 1 } },
      { weights: { '1d': 70, '2d': 30 } },
      { weights: { '2d': 70, '3d': 20, '4d': 7, '1s': 2.5, '2s': 0.9, '3s': 0.09, cr: 0.01 } }
    ],
    desc: '5 cards • baseline odds'
  },
  premium: {
    key: 'premium',
    title: 'Premium Box',
    emoji: '🎁',
    slots: [
      { weights: { '1d': 1 } },
      { weights: { '1d': 1 } },
      { weights: { '1d': 1 } },
      { weights: { '2d': 60, '3d': 30, '4d': 10 } },
      { weights: { '3d': 45, '4d': 25, '1s': 15, '2s': 8, '3s': 2.8, cr: 0.2 } }
    ],
    desc: '5 cards • juiced odds'
  }
};

/* -------------------------------------------------------------------------- */
/* DOM references                                                             */
/* -------------------------------------------------------------------------- */

const getPage = (key) => document.getElementById(`page-${key}`);
const elTitle = document.getElementById('title');
const elSubtitle = document.getElementById('subtitle');
const elArea = document.getElementById('area');
const elProgress = document.getElementById('progress');
const elSummary = document.getElementById('summary');
const elBinder = document.getElementById('binder');
const btnPrimary = document.getElementById('btnPrimary');
const btnAuto = document.getElementById('btnAuto');
const boxesGrid = document.getElementById('boxesGrid');
const goBoxes = document.getElementById('goBoxes');
const openedEl = document.getElementById('opened');

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

const state = {
  currentPage: 'home',
  currentBox: BOXES.standard,
  pack: null,
  pulled: [],
  opened: 0,
  autoRunning: false,
  autoTimer: null,
  binder: {}
};

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

const LS_STATE = 'cb_stack_state_v2';
const LEGACY_BINDER_KEY = 'cb_stack_binder_v1';
const LEGACY_OPENED_KEY = 'cb_stack_opened_v1';

function ensureBinderDefaults(value) {
  const result = {};
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, count]) => {
      if (Number.isFinite(count) && count >= 0) {
        result[key] = Math.floor(count);
      }
    });
  }
  RARITIES.forEach((rarity) => {
    if (!Number.isFinite(result[rarity.key])) {
      result[rarity.key] = 0;
    }
  });
  return result;
}

function loadLegacyBinder() {
  try {
    const raw = localStorage.getItem(LEGACY_BINDER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn('Failed to parse legacy binder data', err);
    return {};
  }
}

function loadLegacyOpened() {
  const raw = localStorage.getItem(LEGACY_OPENED_KEY);
  const value = Number.parseInt(raw || '0', 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(LS_STATE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          binder: ensureBinderDefaults(parsed.binder),
          opened: Number.isFinite(parsed.opened) && parsed.opened >= 0 ? parsed.opened : 0
        };
      }
    }
  } catch (err) {
    console.warn('Failed to parse saved state', err);
  }

  return {
    binder: ensureBinderDefaults(loadLegacyBinder()),
    opened: loadLegacyOpened()
  };
}

function savePersistedState() {
  try {
    const payload = {
      binder: state.binder,
      opened: state.opened
    };
    localStorage.setItem(LS_STATE, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to persist state', err);
  }
}

/* -------------------------------------------------------------------------- */
/* Binder helpers                                                             */
/* -------------------------------------------------------------------------- */

function renderBinder() {
  if (!state.binder) return;

  elBinder.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'binder-grid';

  RARITIES.slice()
    .reverse()
    .forEach((rarity) => {
      const cell = document.createElement('div');
      cell.className = 'thumb';
      cell.setAttribute('role', 'presentation');
      cell.innerHTML = `
        <div>${rarity.icon === '👑' ? '👑' : rarity.icon.repeat(rarity.repeat)}</div>
        <div class="thumb-count">${state.binder[rarity.key]}</div>
      `;
      wrap.appendChild(cell);
    });

  elBinder.appendChild(wrap);
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

function sampleFromWeights(weights) {
  const entries = Object.entries(weights);
  let total = 0;
  for (const [, weight] of entries) total += weight;
  let r = Math.random() * total;
  let acc = 0;
  for (const [key, weight] of entries) {
    acc += weight;
    if (r <= acc) return key;
  }
  return entries[0][0];
}

function makeCardName(rKey) {
  const adjPool = ['3d', '4d', '1s', '2s', '3s', 'cr'].includes(rKey) ? NAME_ADJ_RARE : NAME_ADJ_COMMON;
  const adj = adjPool[Math.floor(Math.random() * adjPool.length)];
  const noun = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)];
  return `${adj} ${noun}`;
}

function topTier(box) {
  const last = box.slots[box.slots.length - 1];
  const keys = Object.keys(last.weights);
  const order = ['1d', '2d', '3d', '4d', '1s', '2s', '3s', 'cr'];
  keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return RAR_INDEX[keys[keys.length - 1]].label;
}

function getTopCard() {
  const cards = [...elArea.querySelectorAll('.card')];
  return cards.length ? cards[cards.length - 1] : null;
}

function updatePrimary(label, disabled) {
  btnPrimary.textContent = label;
  btnPrimary.disabled = Boolean(disabled);
}

function hideSummary() {
  elSummary.classList.remove('show');
  elSummary.innerHTML = '';
}

/* -------------------------------------------------------------------------- */
/* Boxes UI                                                                   */
/* -------------------------------------------------------------------------- */

function renderBoxes() {
  boxesGrid.innerHTML = '';
  Object.values(BOXES).forEach((box) => {
    const card = document.createElement('button');
    card.className = 'boxCard';
    card.type = 'button';
    card.dataset.key = box.key;
    card.setAttribute('role', 'listitem');
    card.innerHTML = `
      <div class="boxTop"><div class="boxEmoji" aria-hidden="true">${box.emoji}</div></div>
      <div class="boxTitle">${box.title}</div>
      <p class="boxMeta">${box.desc}</p>
      <div class="boxChips">
        <span class="chip">Slots: ${box.slots.length}</span>
        <span class="chip">Top: ${topTier(box)}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      setBox(box.key);
      activate('packs');
      spawnCenterBox();
      animateBoxSelection(card);
    });

    boxesGrid.appendChild(card);
  });
}

function animateBoxSelection(card) {
  if (prefersReducedMotion) return;
  card.classList.add('selected');
  window.setTimeout(() => card.classList.remove('selected'), 420);
}

function setBox(key) {
  state.currentBox = BOXES[key] || BOXES.standard;
  const packsTab = document.querySelector('.tab[data-page="packs"]');
  if (packsTab) packsTab.disabled = false;
  if (state.currentPage === 'packs') {
    updateHeader('packs');
  }
}

/* -------------------------------------------------------------------------- */
/* Progress UI                                                                */
/* -------------------------------------------------------------------------- */

function buildDots() {
  elProgress.innerHTML = '';
  for (let i = 0; i < state.currentBox.slots.length; i += 1) {
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.animationDelay = `${i * 60}ms`;
    elProgress.appendChild(dot);
  }
}

function markProgress(idx) {
  const dots = [...elProgress.children];
  dots.forEach((dot, index) => dot.classList.toggle('on', index <= idx));
}

/* -------------------------------------------------------------------------- */
/* Pack Opening                                                               */
/* -------------------------------------------------------------------------- */

function clearBoard() {
  elArea.querySelectorAll('.card, .centerBox').forEach((node) => node.remove());
  elProgress.innerHTML = '';
  hideSummary();
}

function spawnCenterBox() {
  clearBoard();
  state.pulled = [];
  state.pack = null;
  buildDots();

  const container = document.createElement('div');
  container.className = 'centerBox';
  container.id = 'centerBox';
  container.innerHTML = `
    <div class="cube"></div>
    <div class="label">${state.currentBox.title}</div>
    <div class="left"></div>
    <div class="right"></div>
  `;

  container.addEventListener('click', () => {
    container.classList.add('break');
    window.setTimeout(() => {
      container.remove();
      buildPack();
    }, BOX_BREAK_MS);
  });

  elArea.appendChild(container);
  updatePrimary('Break Box', true);
}

function buildPack() {
  const results = state.currentBox.slots.map((slot) => {
    const key = sampleFromWeights(slot.weights);
    return { key, name: makeCardName(key) };
  });

  state.pack = { results, index: 0 };

  elArea.querySelectorAll('.card').forEach((node) => node.remove());
  results.forEach((result, index) => {
    const card = createCardElement(result, index);
    elArea.appendChild(card);
  });

  markProgress(-1);
  updatePrimary('Collect Cards', true);
}

function createCardElement(result, index) {
  const rarity = RAR_INDEX[result.key];
  const card = document.createElement('div');
  card.className = `card ${rarity.cls}`;
  card.dataset.index = String(index);
  card.style.zIndex = String(800 + index);
  card.innerHTML = `
    <div class="ribbon">${rarity.label}</div>
    <div class="card-icon">${rarity.icon === '👑' ? '👑' : rarity.icon.repeat(rarity.repeat)}</div>
    <div class="name">${result.name}</div>
  `;

  card.addEventListener('click', () => handleCardClick(card, result));

  return card;
}

function handleCardClick(card, result) {
  if (!state.pack) return;
  if (card.dataset.revealed === '1') return;
  const topCard = getTopCard();
  if (topCard && topCard !== card) return;

  card.dataset.revealed = '1';

  state.binder[result.key] = (state.binder[result.key] || 0) + 1;
  state.pulled.push({ key: result.key, name: result.name });
  savePersistedState();
  renderBinder();

  if (!prefersReducedMotion) {
    card.style.transition = 'transform 0.42s cubic-bezier(.2,.8,.2,1), opacity 0.42s ease';
    card.style.transform = `translate(calc(50% + ${elArea.clientWidth * 0.35}px), -20%) rotate(6deg) scale(.84)`;
    card.style.opacity = '0';
  }

  window.setTimeout(() => {
    card.remove();
    if (!state.pack) return;
    state.pack.index += 1;
    markProgress(state.pack.index - 1);
    if (state.pack.index >= state.pack.results.length) {
      finishPack();
    }
  }, CARD_REVEAL_MS);
}

function finishPack() {
  state.pack = null;
  state.opened += 1;
  openedEl.textContent = state.opened;
  savePersistedState();
  showSummary();
  updatePrimary('Open Another', false);
  if (state.autoRunning) scheduleAutoStep(AUTO_STEP_MS);
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

function showSummary() {
  hideSummary();

  const wrap = document.createElement('div');
  wrap.className = 'sumCard';

  const head = document.createElement('div');
  head.className = 'sumHeader';
  head.innerHTML = `
    <div class="sumPack">${state.currentBox.emoji}</div>
    <div>
      <div class="sumTitle">${state.currentBox.title} — Results</div>
      <div class="sumSubtitle">${state.pulled.length} cards added to your binder</div>
    </div>
  `;

  const grid = document.createElement('div');
  grid.className = 'sumGrid';
  state.pulled.forEach((pull) => {
    const rarity = RAR_INDEX[pull.key];
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    thumb.innerHTML = `
      <div class="card ${rarity.cls}" style="position:relative;width:100%;height:100%;left:auto;top:auto;transform:none;cursor:default">
        <div class="card-icon" style="font-size:28px">${rarity.icon === '👑' ? '👑' : rarity.icon.repeat(rarity.repeat)}</div>
        <div class="name" style="font-size:11px">${pull.name}</div>
      </div>
    `;
    grid.appendChild(thumb);
  });

  const actions = document.createElement('div');
  actions.className = 'sumActions';

  const shelf = document.createElement('button');
  shelf.className = 'ghost';
  shelf.type = 'button';
  shelf.textContent = 'Back to Boxes';
  shelf.addEventListener('click', () => {
    hideSummary();
    stopAuto();
    activate('boxes');
  });

  const again = document.createElement('button');
  again.className = 'ok';
  again.type = 'button';
  again.textContent = 'Open Another';
  again.addEventListener('click', () => {
    hideSummary();
    spawnCenterBox();
    if (state.autoRunning) scheduleAutoStep(AUTO_STEP_MS);
  });

  actions.appendChild(shelf);
  actions.appendChild(again);

  wrap.appendChild(head);
  wrap.appendChild(grid);
  wrap.appendChild(actions);

  elSummary.appendChild(wrap);
  elSummary.classList.add('show');
}

/* -------------------------------------------------------------------------- */
/* Auto Collect                                                               */
/* -------------------------------------------------------------------------- */

function startAuto() {
  state.autoRunning = true;
  btnAuto.textContent = 'Auto: ON';
  btnAuto.setAttribute('aria-pressed', 'true');
  activate('packs');
  scheduleAutoStep(AUTO_STEP_MS);
}

function stopAuto() {
  if (!state.autoRunning) return;
  state.autoRunning = false;
  btnAuto.textContent = 'Auto Collect';
  btnAuto.setAttribute('aria-pressed', 'false');
  if (state.autoTimer) window.clearTimeout(state.autoTimer);
  state.autoTimer = null;
}

function toggleAuto() {
  if (state.autoRunning) {
    stopAuto();
  } else {
    startAuto();
  }
}

function scheduleAutoStep(delay = AUTO_STEP_MS) {
  if (!state.autoRunning) return;
  if (state.autoTimer) window.clearTimeout(state.autoTimer);
  state.autoTimer = window.setTimeout(() => {
    if (!state.autoRunning) return;

    if (state.currentPage !== 'packs') {
      activate('packs');
    }

    if (elSummary.classList.contains('show')) {
      hideSummary();
      spawnCenterBox();
      scheduleAutoStep(AUTO_STEP_MS);
      return;
    }

    const center = document.getElementById('centerBox');
    if (center) {
      center.click();
      scheduleAutoStep(WAIT_AFTER_BREAK_MS);
      return;
    }

    const topCard = getTopCard();
    if (topCard) {
      topCard.click();
      scheduleAutoStep(CARD_REVEAL_MS);
      return;
    }

    spawnCenterBox();
    scheduleAutoStep(AUTO_STEP_MS);
  }, delay);
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

function activate(page) {
  state.currentPage = page;
  ['home', 'boxes', 'packs', 'binder'].forEach((key) => {
    const el = getPage(key);
    const tab = document.querySelector(`.tab[data-page="${key}"]`);
    const on = key === page;
    if (el) el.classList.toggle('active', on);
    if (tab) tab.classList.toggle('active', on);
  });
  if (page !== 'packs') {
    stopAuto();
  }
  updateHeader(page);
}

function updateHeader(page) {
  const names = {
    home: 'Home',
    boxes: 'Boxes',
    packs: `${state.currentBox.title}`,
    binder: 'Binder'
  };
  elTitle.textContent = `Cereal Box — ${names[page]}`;
  elSubtitle.textContent =
    page === 'packs'
      ? `${state.currentBox.slots.length} cards • ${state.currentBox.desc}`
      : page === 'boxes'
      ? 'Pick a box. Each has different slots and odds.'
      : page === 'home'
      ? 'Click a box → stacked cards → click to collect → summary.'
      : 'Totals by rarity symbol.';
}

/* -------------------------------------------------------------------------- */
/* Tests (exposed for manual verification)                                    */
/* -------------------------------------------------------------------------- */

function runTests() {
  const logs = [];
  const ok = (name, pass) => logs.push(`${pass ? '✅' : '❌'} ${name}`);

  const S5 = BOXES.standard.slots;
  ok('Standard: 5 slots', S5.length === 5);
  let pass = true;
  for (let t = 0; t < 150; t += 1) {
    for (let i = 0; i < 3; i += 1) if (sampleFromWeights(S5[i].weights) !== '1d') pass = false;
  }
  ok('Std first 3 are 1◆', pass);
  pass = true;
  for (let t = 0; t < 800; t += 1) {
    const k = sampleFromWeights(S5[4].weights);
    if (k === '1d') {
      pass = false;
      break;
    }
  }
  ok('Std last ≠ 1◆', pass);

  activate('packs');
  setBox('standard');
  spawnCenterBox();
  document.getElementById('centerBox').click();
  window.setTimeout(() => {
    const list = [...document.querySelectorAll('.card')];
    ok('All cards overlapped', list.length === state.currentBox.slots.length);
    let i = 0;
    const go = () => {
      const live = [...document.querySelectorAll('.card')];
      if (!live.length) return;
      live[live.length - 1].click();
      i += 1;
      if (i < state.currentBox.slots.length) window.setTimeout(go, CARD_REVEAL_MS + 60);
    };
    go();
    window.setTimeout(() => {
      ok('Summary shown', document.getElementById('summary').classList.contains('show'));
      alert(logs.join('\n'));
    }, (CARD_REVEAL_MS + 60) * state.currentBox.slots.length + 600);
  }, BOX_BREAK_MS + 120);
}

/* -------------------------------------------------------------------------- */
/* Init                                                                       */
/* -------------------------------------------------------------------------- */

function init() {
  const persisted = loadPersistedState();
  state.binder = ensureBinderDefaults(persisted.binder);
  state.opened = persisted.opened;
  openedEl.textContent = state.opened;

  renderBoxes();
  renderBinder();

  updatePrimary('Choose a box first', true);
  updateHeader(state.currentPage);
  btnAuto.setAttribute('aria-pressed', 'false');

  document.querySelectorAll('.tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      if (tab.disabled) return;
      activate(tab.dataset.page);
    })
  );

  goBoxes.addEventListener('click', () => activate('boxes'));
  btnPrimary.addEventListener('click', () => {
    if (btnPrimary.disabled) return;
    spawnCenterBox();
  });
  btnAuto.addEventListener('click', () => toggleAuto());

  window.runTests = runTests;
}

init();
