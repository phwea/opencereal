'use strict';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
const NAME_NOUNS = ['Sprout', 'Pounce', 'Fang', 'Wisp', 'Warden', 'Stride', 'Tide', 'Spark', 'Grove', 'Raptor', 'Echo', 'Gloom', 'Nimbus', 'Rune'];

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

let opened = 0;
let currentBox = BOXES.standard;
let pack = null;
let pulled = [];
let autoRunning = false;

/* -------------------------------------------------------------------------- */
/* Binder helpers                                                             */
/* -------------------------------------------------------------------------- */

const LS_BINDER = 'cb_stack_binder_v1';

function loadBinder() {
  try {
    return JSON.parse(localStorage.getItem(LS_BINDER)) || {};
  } catch (err) {
    console.warn('Failed to parse binder data', err);
    return {};
  }
}

function saveBinder(data) {
  localStorage.setItem(LS_BINDER, JSON.stringify(data));
}

const binder = loadBinder();
RARITIES.forEach((rarity) => {
  if (!(rarity.key in binder)) binder[rarity.key] = 0;
});
saveBinder(binder);

function renderBinder() {
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
        <div class="thumb-count">${binder[rarity.key]}</div>
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

/* -------------------------------------------------------------------------- */
/* Boxes UI                                                                   */
/* -------------------------------------------------------------------------- */

function renderBoxes() {
  boxesGrid.innerHTML = '';
  Object.values(BOXES).forEach((box) => {
    const card = document.createElement('button');
    card.className = 'boxCard';
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
  setTimeout(() => card.classList.remove('selected'), 420);
}

function setBox(key) {
  currentBox = BOXES[key] || BOXES.standard;
  document.querySelector('.tab[data-page="packs"]').disabled = false;
  elTitle.textContent = `Cereal Box — ${currentBox.title}`;
  elSubtitle.textContent = `${currentBox.slots.length} cards • ${currentBox.desc}`;
}

/* -------------------------------------------------------------------------- */
/* Progress UI                                                                */
/* -------------------------------------------------------------------------- */

function buildDots() {
  elProgress.innerHTML = '';
  for (let i = 0; i < currentBox.slots.length; i += 1) {
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
  elSummary.innerHTML = '';
  elSummary.classList.remove('show');
}

function spawnCenterBox() {
  clearBoard();
  buildDots();
  pulled = [];
  pack = null;

  const container = document.createElement('div');
  container.className = 'centerBox';
  container.id = 'centerBox';
  container.innerHTML = `
    <div class="cube"></div>
    <div class="label">${currentBox.title}</div>
    <div class="left"></div>
    <div class="right"></div>
  `;

  container.addEventListener('click', () => {
    container.classList.add('break');
    setTimeout(() => {
      container.remove();
      buildPack();
    }, prefersReducedMotion ? 0 : 420);
  });

  elArea.appendChild(container);
  btnPrimary.textContent = 'Break Box';
  btnPrimary.disabled = true;
}

function buildPack() {
  const results = currentBox.slots.map((slot) => ({ key: sampleFromWeights(slot.weights), name: null }));
  results.forEach((result) => {
    result.name = makeCardName(result.key);
  });
  pack = { results, clicks: 0 };

  elArea.querySelectorAll('.card').forEach((node) => node.remove());
  results.forEach((result, index) => {
    const rarity = RAR_INDEX[result.key];
    const card = document.createElement('div');
    card.className = `card ${rarity.cls}`;
    card.style.zIndex = String(800 + index);
    card.innerHTML = `
      <div class="ribbon">${rarity.label}</div>
      <div class="card-icon">${rarity.icon === '👑' ? '👑' : rarity.icon.repeat(rarity.repeat)}</div>
      <div class="name">${result.name}</div>
    `;

    card.addEventListener('click', () => handleCardClick(card, result));

    elArea.appendChild(card);
  });

  markProgress(-1);
}

function handleCardClick(card, result) {
  binder[result.key] = (binder[result.key] || 0) + 1;
  saveBinder(binder);
  renderBinder();
  pulled.push({ key: result.key, name: result.name });

  if (!prefersReducedMotion) {
    card.style.transition = 'transform 0.42s cubic-bezier(.2,.8,.2,1), opacity 0.42s ease';
    card.style.transform = `translate(calc(50% + ${elArea.clientWidth * 0.35}px), -20%) rotate(6deg) scale(.84)`;
    card.style.opacity = '0';
  }

  setTimeout(() => {
    card.remove();
    if (pack) {
      pack.clicks += 1;
      markProgress(pack.clicks - 1);
      if (pack.clicks >= pack.results.length) finishPack();
    }
  }, prefersReducedMotion ? 40 : 420);
}

function finishPack() {
  opened += 1;
  openedEl.textContent = opened;
  showSummary();
  btnPrimary.textContent = 'Open Another';
  btnPrimary.disabled = false;
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

function showSummary() {
  elSummary.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'sumCard';

  const head = document.createElement('div');
  head.className = 'sumHeader';
  head.innerHTML = `
    <div class="sumPack">${currentBox.emoji}</div>
    <div>
      <div class="sumTitle">${currentBox.title} — Results</div>
      <div class="sumSubtitle">${pulled.length} cards added to your binder</div>
    </div>
  `;

  const grid = document.createElement('div');
  grid.className = 'sumGrid';
  pulled.forEach((pull) => {
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
  shelf.textContent = 'Back to Boxes';
  shelf.addEventListener('click', () => {
    elSummary.classList.remove('show');
    activate('boxes');
  });

  const again = document.createElement('button');
  again.className = 'ok';
  again.textContent = 'Open Another';
  again.addEventListener('click', () => {
    elSummary.classList.remove('show');
    spawnCenterBox();
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

function autoStepPack() {
  const step = () => {
    const list = [...document.querySelectorAll('.card')];
    if (list.length === 0) return;
    list[list.length - 1].click();
    if (autoRunning) {
      setTimeout(step, prefersReducedMotion ? 80 : 420);
    }
  };
  step();
}

function toggleAuto() {
  autoRunning = !autoRunning;
  btnAuto.textContent = autoRunning ? 'Auto: ON' : 'Auto Collect';
  if (autoRunning) {
    if (!document.getElementById('centerBox')) {
      spawnCenterBox();
    }
    setTimeout(() => {
      const center = document.getElementById('centerBox');
      if (center) center.click();
      setTimeout(() => autoStepPack(), prefersReducedMotion ? 80 : 480);
    }, prefersReducedMotion ? 0 : 160);
  }
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

function activate(page) {
  ['home', 'boxes', 'packs', 'binder'].forEach((key) => {
    const el = getPage(key);
    const tab = document.querySelector(`.tab[data-page="${key}"]`);
    const on = key === page;
    el.classList.toggle('active', on);
    tab.classList.toggle('active', on);
  });
  updateHeader(page);
}

function updateHeader(page) {
  const names = {
    home: 'Home',
    boxes: 'Boxes',
    packs: `${currentBox.title}`,
    binder: 'Binder'
  };
  elTitle.textContent = `Cereal Box — ${names[page]}`;
  elSubtitle.textContent =
    page === 'packs'
      ? `${currentBox.slots.length} cards • ${currentBox.desc}`
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
  setTimeout(() => {
    const list = [...document.querySelectorAll('.card')];
    ok('All cards overlapped', list.length === currentBox.slots.length);
    let i = 0;
    const go = () => {
      const live = [...document.querySelectorAll('.card')];
      if (!live.length) return;
      live[live.length - 1].click();
      i += 1;
      if (i < currentBox.slots.length) setTimeout(go, 480);
    };
    go();
    setTimeout(() => {
      ok('Summary shown', document.getElementById('summary').classList.contains('show'));
      alert(logs.join('\n'));
    }, 520 * currentBox.slots.length + 600);
  }, 520);
}

/* -------------------------------------------------------------------------- */
/* Init                                                                       */
/* -------------------------------------------------------------------------- */

renderBoxes();
renderBinder();

document.querySelectorAll('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    if (tab.disabled) return;
    activate(tab.dataset.page);
  })
);

goBoxes.addEventListener('click', () => activate('boxes'));
btnPrimary.addEventListener('click', () => spawnCenterBox());
btnAuto.addEventListener('click', () => toggleAuto());

window.runTests = runTests;
