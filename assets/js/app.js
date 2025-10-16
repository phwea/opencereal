"use strict";

/* -------------------------------------------------------------------------- */
/* Data                                                                        */
/* -------------------------------------------------------------------------- */

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const CARD_REVEAL_MS = prefersReducedMotion ? 40 : 420;
const BOX_BREAK_MS = prefersReducedMotion ? 0 : 420;
const AUTO_STEP_MS = prefersReducedMotion ? 80 : 420;
const WAIT_AFTER_BREAK_MS = prefersReducedMotion ? 80 : BOX_BREAK_MS + 160;

const RARITIES = [
  { key: "1d", label: "1◆", icon: "◆", repeat: 1, cls: "rar-1d", pool: "common" },
  { key: "2d", label: "2◆", icon: "◆", repeat: 2, cls: "rar-2d", pool: "uncommon" },
  { key: "3d", label: "3◆", icon: "◆", repeat: 3, cls: "rar-3d", pool: "rare" },
  { key: "4d", label: "4◆", icon: "◆", repeat: 4, cls: "rar-4d", pool: "ex" },
  { key: "1s", label: "1★", icon: "★", repeat: 1, cls: "rar-1s", pool: "illustration" },
  { key: "2s", label: "2★", icon: "★", repeat: 2, cls: "rar-2s", pool: "special" },
  { key: "3s", label: "3★", icon: "★", repeat: 3, cls: "rar-3s", pool: "immersive" },
  { key: "cr", label: "👑", icon: "👑", repeat: 1, cls: "rar-cr", pool: "crown" }
];

const RAR_INDEX = Object.fromEntries(RARITIES.map((rarity) => [rarity.key, rarity]));
const RARITY_ORDER = Object.fromEntries(RARITIES.map((rarity, index) => [rarity.key, index]));

const NAME_ADJ_COMMON = ["Chewy", "Sunny", "Rustle", "Brisk", "Hollow", "Misty", "Snappy", "Pebbly", "Crisp", "Breezy"];
const NAME_ADJ_RARE = ["Luminous", "Feral", "Arc", "Gale", "Blazing", "Nebula", "Auric", "Prismatic", "Cryo", "Volt"];
const NAME_NOUNS = [
  "Sprout",
  "Pounce",
  "Fang",
  "Wisp",
  "Warden",
  "Stride",
  "Tide",
  "Spark",
  "Grove",
  "Raptor",
  "Echo",
  "Gloom",
  "Nimbus",
  "Rune"
];

const BOXES = {
  mini: {
    key: "mini",
    title: "Mini Box",
    emoji: "🥣",
    slots: [
      { weights: { "1d": 1 } },
      { weights: { "1d": 1 } },
      { weights: { "1d": 65, "2d": 35 } },
      { weights: { "2d": 70, "3d": 20, "4d": 8, "1s": 1.7, "2s": 0.28, "3s": 0.02 } }
    ],
    desc: "4 cards • budget odds"
  },
  standard: {
    key: "standard",
    title: "Standard Box",
    emoji: "📦",
    slots: [
      { weights: { "1d": 1 } },
      { weights: { "1d": 1 } },
      { weights: { "1d": 1 } },
      { weights: { "1d": 70, "2d": 30 } },
      { weights: { "2d": 70, "3d": 20, "4d": 7, "1s": 2.5, "2s": 0.9, "3s": 0.09, cr: 0.01 } }
    ],
    desc: "5 cards • baseline odds"
  },
  premium: {
    key: "premium",
    title: "Premium Box",
    emoji: "🎁",
    slots: [
      { weights: { "1d": 1 } },
      { weights: { "1d": 1 } },
      { weights: { "1d": 1 } },
      { weights: { "2d": 60, "3d": 30, "4d": 10 } },
      { weights: { "3d": 45, "4d": 25, "1s": 15, "2s": 8, "3s": 2.8, cr: 0.2 } }
    ],
    desc: "5 cards • juiced odds"
  }
};

/* -------------------------------------------------------------------------- */
/* State                                                                       */
/* -------------------------------------------------------------------------- */

const state = {
  currentPage: "home",
  currentBox: BOXES.standard,
  pack: null,
  pulled: [],
  binder: {},
  opened: 0,
  autoRunning: false,
  autoTimer: null,
  cardRotation: false
};

/* -------------------------------------------------------------------------- */
/* DOM references                                                              */
/* -------------------------------------------------------------------------- */

const getPage = (key) => document.getElementById(`page-${key}`);
const elTitle = document.getElementById("title");
const elSubtitle = document.getElementById("subtitle");
const elArea = document.getElementById("area");
const elProgress = document.getElementById("progress");
const elSummary = document.getElementById("summary");
const elBinder = document.getElementById("binder");
const btnPrimary = document.getElementById("btnPrimary");
const btnAuto = document.getElementById("btnAuto");
const btnRotate = document.getElementById("btnRotate");
const boxesGrid = document.getElementById("boxesGrid");
const goBoxes = document.getElementById("goBoxes");
const openedEl = document.getElementById("opened");

/* -------------------------------------------------------------------------- */
/* Persistence                                                                 */
/* -------------------------------------------------------------------------- */

const LS_STATE = "cb_stack_state_v3";

function ensureBinderDefaults(value) {
  const result = {};
  if (value && typeof value === "object") {
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

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(LS_STATE);
    if (!raw) {
      return { binder: ensureBinderDefaults({}), opened: 0 };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { binder: ensureBinderDefaults({}), opened: 0 };
    }
    return {
      binder: ensureBinderDefaults(parsed.binder),
      opened: Number.isFinite(parsed.opened) && parsed.opened >= 0 ? parsed.opened : 0
    };
  } catch (error) {
    console.warn("Failed to read saved state", error);
    return { binder: ensureBinderDefaults({}), opened: 0 };
  }
}

function savePersistedState() {
  try {
    const payload = { binder: state.binder, opened: state.opened };
    localStorage.setItem(LS_STATE, JSON.stringify(payload));
  } catch (error) {
    console.warn("Failed to save state", error);
  }
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                   */
/* -------------------------------------------------------------------------- */

function sampleFromWeights(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((acc, [, weight]) => acc + weight, 0);
  let r = Math.random() * total;
  for (const [key, weight] of entries) {
    if (r < weight) return key;
    r -= weight;
  }
  return entries[0][0];
}

function makeCardName(rarityKey) {
  const adjPool = ["3d", "4d", "1s", "2s", "3s", "cr"].includes(rarityKey) ? NAME_ADJ_RARE : NAME_ADJ_COMMON;
  const adj = adjPool[Math.floor(Math.random() * adjPool.length)];
  const noun = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)];
  return `${adj} ${noun}`;
}

function topTierLabel(box) {
  const slot = box.slots[box.slots.length - 1];
  const options = Object.keys(slot.weights);
  const order = ["1d", "2d", "3d", "4d", "1s", "2s", "3s", "cr"];
  options.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const key = options[options.length - 1];
  return RAR_INDEX[key].label;
}

function ensurePacksTabEnabled() {
  const packsTab = document.querySelector('.tab[data-page="packs"]');
  if (packsTab) {
    packsTab.disabled = false;
  }
}

function getTopCard() {
  const cards = [...elArea.querySelectorAll(".card")];
  return cards.length ? cards[cards.length - 1] : null;
}

function updatePrimary(label, disabled) {
  btnPrimary.textContent = label;
  btnPrimary.disabled = Boolean(disabled);
}

function setRotatePressed(on) {
  btnRotate.setAttribute("aria-pressed", on ? "true" : "false");
  btnRotate.classList.toggle("active", Boolean(on));
}

function updateRotateControl(enabled) {
  btnRotate.disabled = !enabled;
  if (!enabled) {
    state.cardRotation = false;
    setRotatePressed(false);
  }
}

function hideSummary() {
  elSummary.classList.remove("show");
  elSummary.innerHTML = "";
}

/* -------------------------------------------------------------------------- */
/* Binder                                                                      */
/* -------------------------------------------------------------------------- */

function renderBinder() {
  elBinder.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "binder-grid";
  RARITIES.slice()
    .reverse()
    .forEach((rarity) => {
      const cell = document.createElement("div");
      cell.className = "thumb";
      cell.innerHTML = `
        <div class="thumb-icon">${rarity.icon === "👑" ? "👑" : rarity.icon.repeat(rarity.repeat)}</div>
        <div class="thumb-count">${state.binder[rarity.key]}</div>
      `;
      grid.appendChild(cell);
    });
  elBinder.appendChild(grid);
}

/* -------------------------------------------------------------------------- */
/* Boxes                                                                       */
/* -------------------------------------------------------------------------- */

function renderBoxes() {
  boxesGrid.innerHTML = "";
  Object.values(BOXES).forEach((box) => {
    const card = document.createElement("button");
    card.className = "boxCard";
    card.type = "button";
    card.dataset.key = box.key;
    card.innerHTML = `
      <div class="boxTop"><div class="boxEmoji" aria-hidden="true">${box.emoji}</div></div>
      <div class="boxTitle">${box.title}</div>
      <p class="boxMeta">${box.desc}</p>
      <div class="boxChips">
        <span class="chip">Slots: ${box.slots.length}</span>
        <span class="chip">Top: ${topTierLabel(box)}</span>
      </div>
    `;

    card.addEventListener("click", () => {
      setBox(box.key);
      activate("packs");
      spawnCenterBox();
      animateBoxSelection(card);
    });

    boxesGrid.appendChild(card);
  });
}

function animateBoxSelection(card) {
  if (prefersReducedMotion) return;
  card.classList.add("selected");
  window.setTimeout(() => card.classList.remove("selected"), 420);
}

function setBox(key) {
  state.currentBox = BOXES[key] || BOXES.standard;
  ensurePacksTabEnabled();
  if (state.currentPage === "packs") {
    updateHeader("packs");
  }
}

/* -------------------------------------------------------------------------- */
/* Pack flow                                                                   */
/* -------------------------------------------------------------------------- */

function clearBoard() {
  elArea.querySelectorAll(".card, .centerBox").forEach((node) => node.remove());
  elProgress.innerHTML = "";
  hideSummary();
  updateRotateControl(false);
}

function buildDots() {
  elProgress.innerHTML = "";
  for (let i = 0; i < state.currentBox.slots.length; i += 1) {
    const dot = document.createElement("div");
    dot.className = "dot";
    dot.style.animationDelay = `${i * 60}ms`;
    elProgress.appendChild(dot);
  }
}

function markProgress(idx) {
  const dots = [...elProgress.children];
  dots.forEach((dot, index) => {
    dot.classList.toggle("on", index <= idx);
  });
}

function spawnCenterBox() {
  clearBoard();
  state.pulled = [];
  state.pack = null;
  state.cardRotation = false;
  buildDots();

  const button = document.createElement("button");
  button.type = "button";
  button.className = "centerBox";
  button.id = "centerBox";
  button.innerHTML = `
    <span class="visually-hidden">Break ${state.currentBox.title}</span>
    <div class="cube" aria-hidden="true"></div>
    <div class="label">${state.currentBox.title}</div>
    <div class="left" aria-hidden="true"></div>
    <div class="right" aria-hidden="true"></div>
  `;

  const triggerBreak = () => {
    button.disabled = true;
    button.classList.add("break");
    window.setTimeout(() => {
      button.remove();
      buildPack();
    }, BOX_BREAK_MS);
  };

  button.addEventListener("click", () => {
    triggerBreak();
  });

  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      triggerBreak();
    }
  });

  elArea.appendChild(button);
  updatePrimary("Break Box", false);
  updateRotateControl(false);
  window.setTimeout(() => button.focus(), 20);
}

function buildPack() {
  const results = state.currentBox.slots.map((slot) => {
    const key = sampleFromWeights(slot.weights);
    return { key, name: makeCardName(key) };
  });

  state.pack = { results, index: 0 };
  elArea.querySelectorAll(".card").forEach((node) => node.remove());

  results.forEach((result, index) => {
    const card = createCardElement(result, index);
    elArea.appendChild(card);
  });

  markProgress(-1);
  updatePrimary("Collect Top Card", false);
  updateRotateControl(true);
  setRotatePressed(false);
  state.cardRotation = false;
  window.setTimeout(() => {
    const topCard = getTopCard();
    if (topCard) topCard.focus();
  }, 60);
}

function createCardElement(result, index) {
  const rarity = RAR_INDEX[result.key];
  const card = document.createElement("div");
  card.className = `card ${rarity.cls}`;
  card.dataset.index = String(index);
  card.style.zIndex = String(800 + index);
  card.innerHTML = `
    <div class="ribbon">${rarity.label}</div>
    <div class="card-icon">${rarity.icon === "👑" ? "👑" : rarity.icon.repeat(rarity.repeat)}</div>
    <div class="name">${result.name}</div>
  `;
  card.addEventListener("click", () => handleCardClick(card, result));
  card.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && card === getTopCard()) {
      event.preventDefault();
      handleCardClick(card, result);
      return;
    }
    if ((event.key === "r" || event.key === "R") && card === getTopCard()) {
      event.preventDefault();
      toggleTopCardRotation();
    }
  });
  card.tabIndex = 0;
  return card;
}

function handleCardClick(card, result) {
  if (!state.pack) return;
  if (card.dataset.revealed === "1") return;
  const topCard = getTopCard();
  if (topCard && topCard !== card) return;

  if (state.cardRotation) {
    card.classList.remove("rotated");
    state.cardRotation = false;
    setRotatePressed(false);
  }
  card.dataset.revealed = "1";
  state.binder[result.key] = (state.binder[result.key] || 0) + 1;
  state.pulled.push({ key: result.key, name: result.name });

  if (!prefersReducedMotion) {
    card.style.transition = "transform 0.42s cubic-bezier(.2,.8,.2,1), opacity 0.42s ease";
    card.style.transform = `translate(calc(50% + ${elArea.clientWidth * 0.35}px), -20%) rotate(6deg) scale(.84)`;
    card.style.opacity = "0";
  }

  window.setTimeout(() => {
    card.remove();
    if (!state.pack) return;
    state.pack.index += 1;
    markProgress(state.pack.index - 1);
    const next = getTopCard();
    if (next) {
      updateRotateControl(true);
      window.setTimeout(() => {
        next.focus();
      }, 40);
    } else {
      updateRotateControl(false);
    }
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
  updatePrimary("Open Another", false);
  updateRotateControl(false);
  if (state.autoRunning) scheduleAutoStep(AUTO_STEP_MS);
}

function showSummary() {
  elSummary.innerHTML = "";
  const heading = document.createElement("h4");
  heading.textContent = "Pack Summary";
  elSummary.appendChild(heading);

  const hero = state.pulled.reduce((best, item) => {
    if (!best) return item;
    return RARITY_ORDER[item.key] > RARITY_ORDER[best.key] ? item : best;
  }, null);
  if (hero) {
    const rarity = RAR_INDEX[hero.key];
    const heroCard = document.createElement("div");
    heroCard.className = `summary-hero ${rarity.cls}`;
    heroCard.innerHTML = `
      <div class="summary-hero-label">Highlight Pull</div>
      <div class="summary-hero-name">${hero.name}</div>
      <div class="summary-hero-rarity">${rarity.label}</div>
    `;
    elSummary.appendChild(heroCard);
  }

  const list = document.createElement("ul");
  list.className = "summary-list";
  state.pulled.forEach((item) => {
    if (hero && item === hero) return;
    const rarity = RAR_INDEX[item.key];
    const li = document.createElement("li");
    li.className = rarity.cls;
    li.innerHTML = `
      <span class="rar">${rarity.label}</span>
      <span class="name">${item.name}</span>
    `;
    list.appendChild(li);
  });
  if (list.children.length) {
    elSummary.appendChild(list);
  }

  elSummary.classList.add("show");
  renderBinder();
}

function toggleTopCardRotation() {
  if (btnRotate.disabled) return;
  if (!state.pack) return;
  const card = getTopCard();
  if (!card) return;
  const nowRotated = card.classList.toggle("rotated");
  state.cardRotation = nowRotated;
  setRotatePressed(nowRotated);
}

/* -------------------------------------------------------------------------- */
/* Auto collect                                                                */
/* -------------------------------------------------------------------------- */

function scheduleAutoStep(delay = AUTO_STEP_MS) {
  if (!state.autoRunning) return;
  if (state.autoTimer) {
    window.clearTimeout(state.autoTimer);
  }
  state.autoTimer = window.setTimeout(() => {
    if (!state.autoRunning) return;

    if (state.currentPage !== "packs") {
      activate("packs");
    }

    if (elSummary.classList.contains("show")) {
      hideSummary();
      spawnCenterBox();
      scheduleAutoStep(AUTO_STEP_MS);
      return;
    }

    const center = document.getElementById("centerBox");
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

function startAuto() {
  state.autoRunning = true;
  ensurePacksTabEnabled();
  if (!state.currentBox) {
    state.currentBox = BOXES.standard;
  }
  btnAuto.textContent = "Auto: ON";
  btnAuto.setAttribute("aria-pressed", "true");
  activate("packs");
  scheduleAutoStep(AUTO_STEP_MS);
}

function stopAuto() {
  if (!state.autoRunning) return;
  state.autoRunning = false;
  btnAuto.textContent = "Auto Collect";
  btnAuto.setAttribute("aria-pressed", "false");
  if (state.autoTimer) {
    window.clearTimeout(state.autoTimer);
  }
  state.autoTimer = null;
}

function toggleAuto() {
  if (state.autoRunning) {
    stopAuto();
  } else {
    startAuto();
  }
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                  */
/* -------------------------------------------------------------------------- */

function activate(page) {
  state.currentPage = page;
  ["home", "boxes", "packs", "binder"].forEach((key) => {
    const panel = getPage(key);
    const tab = document.querySelector(`.tab[data-page="${key}"]`);
    const on = key === page;
    if (panel) panel.classList.toggle("active", on);
    if (tab) tab.classList.toggle("active", on);
  });
  if (page !== "packs") {
    stopAuto();
    updateRotateControl(false);
  }
  updateHeader(page);
}

function updateHeader(page) {
  const titles = {
    home: "Home",
    boxes: "Boxes",
    packs: state.currentBox ? state.currentBox.title : "Packs",
    binder: "Binder"
  };
  elTitle.textContent = `Cereal Box — ${titles[page]}`;
  if (page === "packs" && state.currentBox) {
    elSubtitle.textContent = `${state.currentBox.slots.length} cards • ${state.currentBox.desc}`;
  } else if (page === "boxes") {
    elSubtitle.textContent = "Pick a box. Each has different slots and odds.";
  } else if (page === "binder") {
    elSubtitle.textContent = "Totals by rarity symbol.";
  } else {
    elSubtitle.textContent = "Click a box → stacked cards → click to collect → summary.";
  }
}

/* -------------------------------------------------------------------------- */
/* Event wiring                                                                */
/* -------------------------------------------------------------------------- */

function wireNav() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const { page } = tab.dataset;
      if (tab.disabled) return;
      activate(page);
      if (page === "packs" && !elArea.querySelector(".card, #centerBox")) {
        spawnCenterBox();
      }
    });
  });
}

function wireControls() {
  goBoxes.addEventListener("click", () => {
    activate("boxes");
  });

  btnPrimary.addEventListener("click", () => {
    if (elSummary.classList.contains("show")) {
      hideSummary();
      spawnCenterBox();
      return;
    }
    const centerBox = document.getElementById("centerBox");
    if (centerBox) {
      centerBox.click();
      return;
    }
    const topCard = getTopCard();
    if (topCard) {
      topCard.click();
      return;
    }
    if (state.pack) {
      return;
    }
    spawnCenterBox();
  });

  btnAuto.addEventListener("click", () => {
    toggleAuto();
  });

  btnRotate.addEventListener("click", () => {
    toggleTopCardRotation();
  });
}

/* -------------------------------------------------------------------------- */
/* Init                                                                         */
/* -------------------------------------------------------------------------- */

function init() {
  const saved = loadPersistedState();
  state.binder = saved.binder;
  state.opened = saved.opened;
  openedEl.textContent = state.opened;
  renderBinder();
  renderBoxes();
  wireNav();
  wireControls();
  ensurePacksTabEnabled();
  updatePrimary("Choose a box first", true);
  updateRotateControl(false);
  updateHeader("home");
}

window.addEventListener("DOMContentLoaded", init);

