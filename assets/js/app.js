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
const SUMMARY_ORDER = ["1d", "2d", "3d", "4d", "1s", "2s", "3s", "cr"];
const RARITY_SCORE = Object.fromEntries(SUMMARY_ORDER.map((key, index) => [key, index]));

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
  autoTimer: null
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

function hideSummary() {
  elSummary.classList.remove("show");
  elSummary.innerHTML = "";
}

function updateRotateAvailability() {
  if (!btnRotate) return;
  const topCard = getTopCard();
  btnRotate.disabled = !topCard || topCard.dataset.revealed === "1";
}

function rotateCard(card, direction = 1) {
  if (!card || card.dataset.revealed === "1") return;
  const topCard = getTopCard();
  if (topCard && topCard !== card) return;
  const current = Number(card.dataset.rotation || "0");
  const next = (current + direction + 4) % 4;
  const angle = next * 90;
  card.dataset.rotation = String(next);
  card.dataset.rotationAngle = String(angle);
  card.style.setProperty("--card-rotation", `${angle}deg`);
}

function rotateTopCard(direction = 1) {
  rotateCard(getTopCard(), direction);
  updateRotateAvailability();
}

function pickFeaturedCard(items) {
  if (!items.length) return null;
  let winnerIndex = 0;
  let winnerScore = -Infinity;
  items.forEach((item, index) => {
    const score = RARITY_SCORE[item.key] ?? 0;
    if (score > winnerScore) {
      winnerScore = score;
      winnerIndex = index;
    }
  });
  return { index: winnerIndex, item: items[winnerIndex] };
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
  updateRotateAvailability();
  updatePrimary("Break the cereal box", false);
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
  updateRotateAvailability();
  updatePrimary("Send top card to binder", false);
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
  card.dataset.rotation = "0";
  card.dataset.rotationAngle = "0";
  card.dataset.revealed = "0";
  const total = state.currentBox ? state.currentBox.slots.length : index + 1;
  const depth = total - 1 - index;
  const tilt = depth * -2.4;
  card.style.setProperty("--card-tilt", `${tilt}deg`);
  card.style.setProperty("--card-rotation", "0deg");
  card.style.setProperty("--card-translate-x", `${depth * -12}px`);
  card.style.setProperty("--card-translate-y", `${depth * 10}px`);
  card.style.setProperty("--card-scale", `${1 - depth * 0.04}`);
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
    if (event.key === "r" || event.key === "R" || event.key === "ArrowRight") {
      event.preventDefault();
      rotateCard(card, 1);
      updateRotateAvailability();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      rotateCard(card, -1);
      updateRotateAvailability();
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

  card.dataset.revealed = "1";
  updateRotateAvailability();
  state.binder[result.key] = (state.binder[result.key] || 0) + 1;
  state.pulled.push({ key: result.key, name: result.name });

  if (!prefersReducedMotion) {
    const angle = Number(card.dataset.rotationAngle || "0");
    card.classList.add("collecting");
    card.style.setProperty("--card-rotation", `${angle}deg`);
    card.style.setProperty("--card-translate-x", `calc(50% + ${elArea.clientWidth * 0.32}px)`);
    card.style.setProperty("--card-translate-y", "-18%");
    card.style.setProperty("--card-scale", "0.86");
  }

  window.setTimeout(() => {
    card.remove();
    if (!state.pack) return;
    state.pack.index += 1;
    markProgress(state.pack.index - 1);
    updateRotateAvailability();
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
  updateRotateAvailability();
  updatePrimary("Break another box", false);
  if (state.autoRunning) scheduleAutoStep(AUTO_STEP_MS);
}

function showSummary() {
  elSummary.innerHTML = "";
  const heading = document.createElement("h4");
  heading.textContent = "Pack Summary";
  elSummary.appendChild(heading);

  const featureData = pickFeaturedCard(state.pulled);
  if (featureData) {
    const rarity = RAR_INDEX[featureData.item.key];
    const feature = document.createElement("div");
    feature.className = `summary-feature ${rarity.cls}`;
    feature.innerHTML = `
      <div class="summary-feature-icon">${rarity.icon === "👑" ? "👑" : rarity.icon.repeat(rarity.repeat)}</div>
      <div class="summary-feature-body">
        <span class="summary-feature-rarity">${rarity.label}</span>
        <span class="summary-feature-name">${featureData.item.name}</span>
      </div>
    `;
    elSummary.appendChild(feature);
  }

  const row = document.createElement("div");
  row.className = "summary-row";
  state.pulled.forEach((item, index) => {
    const rarity = RAR_INDEX[item.key];
    const chip = document.createElement("div");
    chip.className = `summary-chip ${rarity.cls}${featureData && featureData.index === index ? " is-featured" : ""}`;
    chip.innerHTML = `
      <span class="rar">${rarity.label}</span>
      <span class="name">${item.name}</span>
    `;
    row.appendChild(chip);
  });
  elSummary.appendChild(row);

  const note = document.createElement("p");
  note.className = "summary-note";
  note.textContent = "Tip: rotate cards with R or the Rotate button before sending them to your binder.";
  elSummary.appendChild(note);

  if (btnRotate) {
    btnRotate.disabled = true;
  }
  elSummary.classList.add("show");
  renderBinder();
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
    elSubtitle.textContent = `${state.currentBox.slots.length} cards • ${state.currentBox.desc} • Rotate with R or the Rotate button.`;
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

  if (btnRotate) {
    btnRotate.addEventListener("click", () => {
      rotateTopCard(1);
    });
  }

  btnAuto.addEventListener("click", () => {
    toggleAuto();
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
  updateRotateAvailability();
  updatePrimary("Choose a cereal box first", true);
  updateHeader("home");
}

window.addEventListener("DOMContentLoaded", init);

