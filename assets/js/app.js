"use strict";

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const RARITIES = [
  { key: "common", label: "Common", odds: 0.735, color: "var(--ink-soft)" },
  { key: "uncommon", label: "Uncommon", odds: 0.18, color: "var(--accent)" },
  { key: "rare", label: "Rare", odds: 0.08, color: "var(--rare)" },
  { key: "ultra", label: "Ultra Rare", odds: 0.005, color: "var(--ultra)" },
  { key: "secret", label: "Secret Rare", odds: 0.002, color: "var(--secret)" }
];

const RARITY_MAP = Object.fromEntries(RARITIES.map((rarity) => [rarity.key, rarity]));

const EXPANSIONS = [
  {
    key: "base",
    name: "Base Set",
    tagline: "Where it all began. Crisp borders, primal monsters, nostalgia guaranteed.",
    palette: ["#ff8f53", "#6fffe9"],
    cards: {
      common: [
        "Sparkling Badger",
        "Mistwing Fawn",
        "Pebbleback Cub",
        "Brass Ember",
        "Treetop Skipper",
        "Glintscale Minnow",
        "Bramble Scout",
        "Glowvine Puff"
      ],
      uncommon: [
        "Stormcall Jackal",
        "Hollowroot Sage",
        "Pyreline Racer",
        "Abyssal Smudge",
        "Runeveil Owl"
      ],
      rare: ["Prismatic Lynx", "Glacier Titan", "Sunflare Dragonling", "Nightmare Bloom"],
      ultra: ["Auric Seraphim", "Chaos Gear Leviathan"],
      secret: ["Chromatic Arc Relic"]
    }
  },
  {
    key: "galactic",
    name: "Galactic Apex",
    tagline: "Cosmic beasts and neon circuitry fuse in a synthwave frontier.",
    palette: ["#ff4fd4", "#6d8bff"],
    cards: {
      common: [
        "Luminous Bytecat",
        "Comet Nomad",
        "Nebula Flicker",
        "Circuit Pup",
        "Graveloop Imp",
        "Astro Slicer",
        "Vacuum Hopper"
      ],
      uncommon: [
        "Photon Vanguard",
        "Satellite Idol",
        "Ionstream Dancer",
        "Meteor Golem",
        "Warp Rift Weaver"
      ],
      rare: ["Stellar Forge Hydra", "Nova Pulse Wyvern", "Eventide Pulse"],
      ultra: ["Synthwave Phoenix", "Binary Monarch"],
      secret: ["Eclipse Horizon Shard"]
    }
  },
  {
    key: "neo",
    name: "Neo Flash",
    tagline: "Glitchy sprites resurrected with holofoil swagger and electric grit.",
    palette: ["#ffe066", "#9b5cff"],
    cards: {
      common: [
        "Pixel Bloom",
        "Retro Fang",
        "Arcade Slug",
        "Neon Sprout",
        "Voltage Tadpole",
        "Sprite Runner",
        "Synth Badger",
        "Laser Pup"
      ],
      uncommon: [
        "Shockstep Lynx",
        "Bugged Ronin",
        "Prism Druid",
        "Cyber Lotus",
        "Backline Specter"
      ],
      rare: ["Glitched Eclipse", "Mirage Breaker", "Thunder Idol"],
      ultra: ["Overclocked Chimera", "Hyperdrive Kitsune"],
      secret: ["Mythic Debug Relic"]
    }
  }
];

const PACK_SIZE_RANGE = [6, 9];
const SUSPENSE_CARD_COUNT = 2;
const STORAGE_KEY = "opencereal_breaker_state";

const app = document.getElementById("app");
const packDisplay = document.getElementById("packDisplay");
const cardStack = document.getElementById("cardStack");
const openPackBtn = document.getElementById("openPackBtn");
const expansionSelect = document.getElementById("expansionSelect");
const summaryList = document.getElementById("summaryList");
const summaryRevealed = document.getElementById("summaryRevealed");
const summaryNew = document.getElementById("summaryNew");
const summaryDupes = document.getElementById("summaryDupes");
const inventoryGrid = document.getElementById("inventoryGrid");
const inventoryUnique = document.getElementById("inventoryUnique");
const inventoryTotal = document.getElementById("inventoryTotal");
const inventoryCompletion = document.getElementById("inventoryCompletion");
const inventoryFilters = document.querySelectorAll(".filter");
const tabs = document.querySelectorAll(".nav__tab");
const pages = document.querySelectorAll(".page");

const initialBinder = loadSavedBinder();

const state = {
  expansion: EXPANSIONS[0],
  pack: null,
  revealCount: 0,
  newCount: 0,
  duplicateCount: 0,
  binder: initialBinder,
  totalUniqueCards: countUniqueCards(initialBinder),
  filter: "all",
  isPackOpen: false
};

function loadSavedBinder() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.binder) {
      return parsed.binder;
    }
  } catch (error) {
    console.warn("Failed to load binder", error);
  }
  return {};
}

function saveBinder() {
  try {
    const payload = {
      binder: state.binder,
      expansion: state.expansion.key
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Failed to save binder", error);
  }
}

function countUniqueCards(binder) {
  return Object.keys(binder || {}).length;
}

function initExpansionPicker() {
  expansionSelect.innerHTML = EXPANSIONS.map((set) => `<option value="${set.key}">${set.name}</option>`).join("");
  expansionSelect.value = state.expansion.key;
  expansionSelect.addEventListener("change", (event) => {
    const next = EXPANSIONS.find((set) => set.key === event.target.value);
    if (!next) return;
    state.expansion = next;
    if (!state.isPackOpen) {
      renderPackPlaceholder();
    }
  });
}

function renderPackPlaceholder() {
  packDisplay.className = "breaker__pack placeholder";
  packDisplay.textContent = "Awaiting summoning";
  packDisplay.removeAttribute("aria-hidden");
  packDisplay.style.removeProperty("background");
  cardStack.replaceChildren();
  cardStack.dataset.state = "waiting";
}

function drawRarity() {
  const roll = Math.random();
  let cumulative = 0;
  for (const rarity of RARITIES) {
    cumulative += rarity.odds;
    if (roll <= cumulative) {
      return rarity.key;
    }
  }
  return "common";
}

function pickCard(set, rarity) {
  const pool = set.cards[rarity];
  if (!pool || pool.length === 0) {
    return {
      name: `${rarity.toUpperCase()} Placeholder`,
      flavour: "A mysterious card yet to be illustrated."
    };
  }
  const name = pool[Math.floor(Math.random() * pool.length)];
  return {
    name,
    flavour: getFlavourText(rarity, set),
    rarity
  };
}

function getFlavourText(rarity, set) {
  const base = {
    common: [
      "A familiar friend from the neighborhood league.",
      "Training partner for every rookie handler.",
      "Smells faintly of cardboard stardust."
    ],
    uncommon: [
      "Carries a faint hum of untapped potential.",
      "Glows under arcade lights and moonbeams alike.",
      "Rumored to appear only on clear nights."
    ],
    rare: [
      "Crowds gather when this one flashes its crest.",
      "Sought after in every vintage trade meet.",
      "Legends whisper about its decisive victories."
    ],
    ultra: [
      "Every flip reshapes the local meta for weeks.",
      "Foil so bright it leaves afterimages.",
      "Collectors have crossed oceans for this shine."
    ],
    secret: [
      "You were never guaranteed to see this in your lifetime.",
      "Rumors said the print run was myth. They're wrong now.",
      "When it appears, the room stops breathing."
    ]
  };
  const options = base[rarity] || ["The card resonates with unseen power."];
  return options[Math.floor(Math.random() * options.length)];
}

function buildPack() {
  const count = getRandomInt(PACK_SIZE_RANGE[0], PACK_SIZE_RANGE[1]);
  const cards = [];
  for (let i = 0; i < count; i++) {
    const rarity = drawRarity();
    const card = pickCard(state.expansion, rarity);
    cards.push({ ...card, id: `${state.expansion.key}-${Date.now()}-${i}-${Math.random().toString(16).slice(2, 8)}` });
  }
  return cards;
}

function getRandomInt(min, max) {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

function setActivePage(key) {
  pages.forEach((page) => page.classList.toggle("is-active", page.id === `page-${key}`));
  tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.page === key));
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setActivePage(tab.dataset.page);
  });
});

function setupPackButton() {
  openPackBtn.addEventListener("click", () => {
    if (state.isPackOpen) return;
    state.pack = buildPack();
    state.revealCount = 0;
    state.newCount = 0;
    state.duplicateCount = 0;
    state.isPackOpen = true;
    openPackBtn.disabled = true;
    openPackBtn.textContent = "Pack ready — flip the stack";
    summaryList.replaceChildren();
    summaryRevealed.textContent = "0";
    summaryNew.textContent = "0";
    summaryDupes.textContent = "0";
    spawnPack();
  });
}

function spawnPack() {
  packDisplay.className = "breaker__pack is-floating";
  packDisplay.innerHTML = `<span class="pack-title">${state.expansion.name}</span><span class="pack-tag">${state.expansion.tagline}</span>`;
  packDisplay.style.background = `linear-gradient(160deg, ${state.expansion.palette[0]}, ${state.expansion.palette[1]})`;
  packDisplay.dataset.tagline = state.expansion.tagline;
  packDisplay.setAttribute("role", "button");
  packDisplay.tabIndex = 0;
  packDisplay.addEventListener("click", openPack, { once: true });
  packDisplay.addEventListener("keydown", packKeyHandler);
}

function openPack() {
  playPackTear();
  packDisplay.classList.add("is-open");
  packDisplay.setAttribute("aria-hidden", "true");
  packDisplay.removeEventListener("click", openPack);
  packDisplay.removeAttribute("role");
  packDisplay.removeAttribute("tabindex");
  packDisplay.removeEventListener("keydown", packKeyHandler);
  setTimeout(() => {
    packDisplay.textContent = "";
    renderCardStack();
  }, prefersReducedMotion ? 0 : 600);
}

function packKeyHandler(event) {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    openPack();
  }
}

function renderCardStack() {
  cardStack.replaceChildren();
  cardStack.dataset.state = "revealing";
  const total = state.pack.length;
  const suspenseThreshold = Math.max(total - SUSPENSE_CARD_COUNT, 0);
  state.pack.forEach((card, index) => {
    const element = createCardElement(card, index >= suspenseThreshold, index);
    cardStack.appendChild(element);
  });
}

function createCardElement(card, isSuspense, index) {
  const wrapper = document.createElement("button");
  wrapper.className = "card";
  wrapper.type = "button";
  wrapper.dataset.rarity = card.rarity;
  wrapper.dataset.state = "sealed";
  wrapper.style.setProperty("--offset", `${index}`);
  wrapper.style.zIndex = String(200 - index);
  if (isSuspense) {
    wrapper.dataset.suspense = "true";
  }
  wrapper.setAttribute("aria-label", `${card.name}, ${card.rarity} rarity`);

  const inner = document.createElement("div");
  inner.className = "card__inner";

  const back = document.createElement("div");
  back.className = "card__face card__back";
  back.textContent = "Opencereal";

  const front = document.createElement("div");
  front.className = "card__face card__front";

  const rarity = document.createElement("span");
  rarity.className = "card__rarity";
  rarity.textContent = card.rarity.toUpperCase();

  const name = document.createElement("h3");
  name.className = "card__name";
  name.textContent = card.name;

  const flavour = document.createElement("p");
  flavour.className = "card__flavour";
  flavour.textContent = card.flavour;

  const meta = document.createElement("span");
  meta.className = "card__meta";
  meta.textContent = `${state.expansion.name}`;

  front.append(rarity, name, flavour, meta);
  inner.append(back, front);
  wrapper.append(inner);

  wrapper.addEventListener("click", () => revealCard(wrapper, card));

  if (!prefersReducedMotion) {
    wrapper.style.transitionDelay = `${Math.min(0.4, 0.05 * Number(wrapper.style.getPropertyValue("--offset")))}s`;
  }

  return wrapper;
}

function revealCard(element, card) {
  if (element.dataset.state === "revealed") return;
  element.dataset.state = "revealed";
  cardStack.dataset.state = "revealing";
  element.classList.remove("is-waiting");
  playCardFlip();

  const rarityData = RARITY_MAP[card.rarity];
  if (rarityData && (card.rarity === "rare" || card.rarity === "ultra" || card.rarity === "secret")) {
    triggerRareEffect(element);
    playRareSting();
  }

  const wasNew = recordCard(card);
  state.revealCount += 1;
  if (wasNew) {
    state.newCount += 1;
  } else {
    state.duplicateCount += 1;
  }

  updateSummary(card, wasNew);
  updateInventory();

  if (state.revealCount === state.pack.length) {
    concludePack();
  }
}

function recordCard(card) {
  if (!state.binder[card.name]) {
    state.binder[card.name] = { count: 1, rarity: card.rarity, expansion: state.expansion.name };
    state.totalUniqueCards = countUniqueCards(state.binder);
    saveBinder();
    return true;
  }
  state.binder[card.name].count += 1;
  saveBinder();
  return false;
}

function updateSummary(card, isNew) {
  const item = document.createElement("div");
  item.className = "summary__item";
  item.dataset.rarity = card.rarity;

  const rarity = document.createElement("span");
  rarity.className = "summary__rarity";
  rarity.textContent = `${card.rarity.toUpperCase()}${isNew ? " • NEW" : ""}`;

  const name = document.createElement("h4");
  name.className = "summary__name";
  name.textContent = card.name;

  const meta = document.createElement("span");
  meta.className = "summary__rarity";
  meta.textContent = state.expansion.name;

  item.append(rarity, name, meta);
  summaryList.prepend(item);

  summaryRevealed.textContent = String(state.revealCount);
  summaryNew.textContent = String(state.newCount);
  summaryDupes.textContent = String(state.duplicateCount);
}

function concludePack() {
  state.isPackOpen = false;
  openPackBtn.disabled = false;
  openPackBtn.textContent = "Summon Pack";
  cardStack.dataset.state = "empty";
  if (!prefersReducedMotion) {
    setTimeout(() => {
      renderPackPlaceholder();
    }, 1400);
  } else {
    renderPackPlaceholder();
  }
}

function updateInventory() {
  const entries = Object.entries(state.binder);
  const totalCards = entries.reduce((acc, [, info]) => acc + info.count, 0);
  const allCards = getAllCardNames();
  const completion = allCards === 0 ? 0 : Math.round((state.totalUniqueCards / allCards) * 100);

  inventoryUnique.textContent = String(state.totalUniqueCards);
  inventoryTotal.textContent = String(totalCards);
  inventoryCompletion.textContent = `${completion}%`;

  const fragment = document.createDocumentFragment();
  entries
    .filter(([, info]) => state.filter === "all" || info.rarity === state.filter)
    .sort((a, b) => rarityRank(a[1].rarity) - rarityRank(b[1].rarity) || a[0].localeCompare(b[0]))
    .forEach(([name, info]) => {
      const card = document.createElement("div");
      card.className = "inventory-card";
      card.dataset.rarity = info.rarity;
      card.setAttribute("role", "listitem");

      const rarity = document.createElement("span");
      rarity.className = "inventory-card__rarity";
      rarity.textContent = info.rarity.toUpperCase();

      const title = document.createElement("h4");
      title.className = "inventory-card__name";
      title.textContent = name;

      const meta = document.createElement("span");
      meta.className = "inventory-card__meta";
      meta.textContent = info.expansion;

      const count = document.createElement("span");
      count.className = "inventory-card__count";
      count.textContent = info.count > 1 ? `x${info.count}` : "Unique";

      card.append(rarity, title, meta, count);
      fragment.append(card);
    });

  inventoryGrid.replaceChildren(fragment);
}

function getAllCardNames() {
  return EXPANSIONS.reduce((total, expansion) => {
    return (
      total +
      Object.values(expansion.cards).reduce((acc, pool) => {
        return acc + (Array.isArray(pool) ? pool.length : 0);
      }, 0)
    );
  }, 0);
}

function rarityRank(key) {
  const order = { common: 0, uncommon: 1, rare: 2, ultra: 3, secret: 4 };
  return order[key] ?? 0;
}

inventoryFilters.forEach((filterBtn) => {
  filterBtn.addEventListener("click", () => {
    inventoryFilters.forEach((btn) => btn.classList.remove("is-active"));
    filterBtn.classList.add("is-active");
    state.filter = filterBtn.dataset.filter;
    updateInventory();
  });
});

function triggerRareEffect(element) {
  element.animate(
    [
      { transform: "scale(1)", boxShadow: "0 0 0 rgba(255, 209, 102, 0)" },
      { transform: "scale(1.05)", boxShadow: "0 0 40px rgba(255, 209, 102, 0.45)" },
      { transform: "scale(1)", boxShadow: "0 0 0 rgba(255, 209, 102, 0)" }
    ],
    {
      duration: prefersReducedMotion ? 200 : 900,
      easing: "cubic-bezier(0.21, 0.62, 0.35, 1)",
      iterations: 1
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Audio                                                                       */
/* -------------------------------------------------------------------------- */

let audioCtx;

function getAudioContext() {
  if (prefersReducedMotion) return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playPackTear() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const duration = 0.4;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const progress = i / data.length;
    data[i] = (Math.random() * 2 - 1) * (1 - progress) * (progress + 0.3);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.9, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  source.connect(gain).connect(ctx.destination);
  source.start();
}

function playCardFlip() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(240, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.12);
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.25);
}

function playRareSting() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(110, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.8, ctx.currentTime + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1200, ctx.currentTime);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.9);
}

/* -------------------------------------------------------------------------- */
/* Init                                                                         */
/* -------------------------------------------------------------------------- */

function hydrateState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.expansion) {
      const found = EXPANSIONS.find((set) => set.key === parsed.expansion);
      if (found) {
        state.expansion = found;
      }
    }
  } catch (error) {
    console.warn("Failed to hydrate expansion", error);
  }
}

function init() {
  hydrateState();
  initExpansionPicker();
  setupPackButton();
  renderPackPlaceholder();
  updateInventory();
}

init();
