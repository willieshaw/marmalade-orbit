import { config } from './config.js';
import { normalizeStars, normalizeRewards, unseenCount, newlyUnlocked } from './data.js';
import { currentSheet, sheetOf, planReveal } from './sheets.js';
import { groupByMonth, monthLabel } from './logbook.js';
import { renderChart, renderCount, renderRuler, renderShelf, slotEl, formatDate } from './chart.js';
import {
  slapOnto, sparkleBurst, bumpCount, showNote, hideNote, showCertificate, reducedMotion,
  turnPage, sheetComplete, startShine,
} from './fx.js';
import { initAdmin } from './admin.js';
import * as sfx from './sound.js';

const SEEN_KEY = 'mo.seen';
const $ = id => document.getElementById(id);

// `shown` is how many stars are on the chart right now; during a reveal it trails stars.length.
const state = { stars: [], rewards: [], sheet: 0, shown: 0, busy: false };

function getSeen() {
  try {
    const v = parseInt(localStorage.getItem(SEEN_KEY), 10);
    return Number.isFinite(v) ? v : 0;
  } catch { return 0; }
}
function setSeen(n) {
  try { localStorage.setItem(SEEN_KEY, String(n)); } catch {}
}

async function fetchJson(path) {
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

async function loadStars() {
  // In admin mode read straight from the repo so a fresh award never looks undone
  // while GitHub Pages is still rebuilding.
  const doc = admin.unlocked ? (await admin.read()).doc : await fetchJson(config.starsPath);
  return normalizeStars(doc);
}

function renderAll() {
  renderChart({ stars: state.stars, rewards: state.rewards, sheet: state.sheet, shown: state.shown });
}

async function goToSheet(sheet, { animate = true } = {}) {
  const target = Math.max(0, Math.min(sheet, currentSheet(state.shown)));
  if (target === state.sheet) return;
  const direction = target > state.sheet ? 1 : -1;
  hideNote();
  const swap = () => { state.sheet = target; renderAll(); };
  if (animate) await turnPage(direction, swap);
  else swap();
}

function celebrateMilestones(prev, count) {
  return newlyUnlocked(prev, count, state.rewards).reduce(
    (p, r) => p.then(() => showCertificate({ name: config.herName, signer: config.signedBy, reward: r.reward, at: r.at })),
    Promise.resolve(),
  );
}

// Plays the reveal plan for stars [from, to): slaps, sheet stamps, page turns.
async function runReveal(from, to) {
  for (const step of planReveal(from, to)) {
    if (step.type === 'instant') {
      state.shown = step.to;
      renderAll();
    } else if (step.type === 'slap') {
      if (sheetOf(step.index) !== state.sheet) await goToSheet(sheetOf(step.index));
      await slapOnto(slotEl(step.index), { fast: step.index < to - 1 });
      state.shown = step.index + 1;
      renderCount(state.shown);
      renderRuler(state.shown, state.rewards);
      bumpCount();
    } else if (step.type === 'sheetDone') {
      await sheetComplete();
    } else if (step.type === 'flipTo') {
      await goToSheet(step.sheet);
    }
  }
  state.shown = to;
}

async function revealRange(from, to) {
  await runReveal(from, to);
  const last = state.stars[to - 1];
  const n = to - from;
  showNote(n === 1 ? 'New star!' : `${n} new stars!`, last.label, formatDate(last.date));
  await celebrateMilestones(from, to);
  renderAll();
  setSeen(to);
}

function offerReveal(seen) {
  const n = unseenCount(state.stars.length, seen);
  state.shown = seen;
  state.sheet = currentSheet(seen);
  renderAll();
  if (!n) return;
  const env = $('envelope');
  $('envelope-text').textContent = n === 1 ? 'You got a new star!' : `You got ${n} new stars!`;
  env.hidden = false;
  env.focus({ preventScroll: true });
  env.onclick = async () => {
    sfx.unlockAudio();
    env.hidden = true;
    state.busy = true;
    try { await revealRange(seen, state.stars.length); } finally { state.busy = false; }
  };
}

async function refresh() {
  if (state.busy || !$('envelope').hidden) return;
  let stars;
  try { stars = await loadStars(); } catch { return; }
  const seen = Math.min(getSeen(), stars.length);
  const changed = stars.length !== state.stars.length || stars.some((s, i) => s.id !== state.stars[i]?.id || s.label !== state.stars[i]?.label);
  state.stars = stars;
  setSeen(seen);
  if (unseenCount(stars.length, seen)) offerReveal(seen);
  else if (changed) {
    state.shown = stars.length;
    state.sheet = Math.min(state.sheet, currentSheet(state.shown));
    renderAll();
  }
}

// ---------- interactions ----------

function peel(btn, { quiet = false } = {}) {
  const i = Number(btn.dataset.index);
  const star = state.stars[i];
  const wasPeeled = btn.classList.contains('peeled');
  document.querySelectorAll('.sticker.peeled').forEach(el => el.classList.remove('peeled'));
  btn.classList.remove('wobble');
  void btn.offsetWidth;
  btn.classList.add('wobble');
  sfx.pop();
  if (wasPeeled && !quiet) return;
  btn.classList.add('peeled');
  const r = btn.getBoundingClientRect();
  sparkleBurst(r.left + r.width / 2, r.top + r.height / 2, 8);
  showNote(`Star #${i + 1}`, star.label, formatDate(star.date));
}

function onStarTap(e) {
  const btn = e.target.closest('.sticker');
  if (!btn || state.busy) return;
  sfx.unlockAudio();
  peel(btn);
}

function onCouponTap(e) {
  const c = e.target.closest('.coupon.unlocked');
  if (!c) return;
  sfx.unlockAudio();
  const r = state.rewards.find(x => x.at === Number(c.dataset.at));
  if (r) showCertificate({ name: config.herName, signer: config.signedBy, reward: r.reward, at: r.at });
}

function wireSheetNav() {
  const step = d => {
    if (state.busy) return;
    sfx.unlockAudio();
    goToSheet(state.sheet + d);
  };
  $('sheet-prev').addEventListener('click', () => step(-1));
  $('sheet-next').addEventListener('click', () => step(1));

  // Horizontal swipe on the paper turns the page.
  const paper = $('paper');
  let start = null;
  paper.addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY }; });
  paper.addEventListener('pointerup', e => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50) step(dx < 0 ? 1 : -1);
  });
  paper.addEventListener('pointercancel', () => { start = null; });
}

function wireLogbook() {
  const book = $('logbook');
  const body = $('logbook-body');

  function open() {
    sfx.unlockAudio();
    const stars = state.stars.slice(0, state.shown);
    $('logbook-sub').textContent = stars.length
      ? `${stars.length} star${stars.length === 1 ? '' : 's'} so far`
      : 'Nothing here yet. The first star is coming.';
    const frag = document.createDocumentFragment();
    for (const group of groupByMonth(stars)) {
      const h = document.createElement('h3');
      h.className = 'log-month';
      const small = document.createElement('small');
      small.textContent = ` · ${group.items.length} star${group.items.length === 1 ? '' : 's'}`;
      h.append(monthLabel(group.key), small);
      const ul = document.createElement('ul');
      ul.className = 'log-list';
      for (const { index, star } of group.items) {
        const li = document.createElement('li');
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'log-row';
        row.dataset.index = String(index);
        const num = document.createElement('span');
        num.className = 'log-num';
        num.textContent = `#${index + 1}`;
        const label = document.createElement('span');
        label.className = 'log-label';
        label.textContent = star.label;
        const date = document.createElement('span');
        date.className = 'log-date';
        date.textContent = formatDate(star.date).replace(/,? \d{4}$/, '');
        row.append(num, label, date);
        li.append(row);
        ul.append(li);
      }
      frag.append(h, ul);
    }
    body.replaceChildren(frag);
    body.scrollTop = 0;
    hideNote();
    book.hidden = false;
    $('logbook-close').focus({ preventScroll: true });
  }

  function close() {
    book.hidden = true;
    body.replaceChildren();
  }

  $('logbook-open').addEventListener('click', open);
  $('logbook-close').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !book.hidden) close(); });

  // Tap a line: close the book, turn to that star's sheet and give it a wiggle.
  body.addEventListener('click', async e => {
    const row = e.target.closest('.log-row');
    if (!row) return;
    const index = Number(row.dataset.index);
    close();
    await goToSheet(sheetOf(index));
    const slot = slotEl(index);
    if (!slot) return;
    slot.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    setTimeout(() => peel(slot.querySelector('.sticker'), { quiet: true }), reducedMotion() ? 0 : 350);
  });
}

function wireMute() {
  const btn = $('mute');
  const paint = () => {
    btn.textContent = sfx.isMuted() ? '🔇' : '🔊';
    btn.setAttribute('aria-label', sfx.isMuted() ? 'Sound off' : 'Sound on');
  };
  paint();
  btn.addEventListener('click', () => {
    sfx.setMuted(!sfx.isMuted());
    sfx.unlockAudio();
    paint();
    sfx.pop();
  });
}

// Five quick taps on the title opens the teacher's desk.
function wireSecretTaps() {
  let taps = [];
  $('title').addEventListener('click', () => {
    const now = Date.now();
    taps = [...taps.filter(t => now - t < 2500), now];
    if (taps.length >= 5) { taps = []; admin.open(); }
  });
}

// ---------- admin hooks ----------

const admin = initAdmin({
  currentStars: () => state.stars,
  async award(star) {
    sfx.unlockAudio();
    const prev = state.stars.length;
    state.stars = [...state.stars, star];
    state.shown = prev;
    state.busy = true;
    try {
      if (state.sheet !== currentSheet(prev)) await goToSheet(currentSheet(prev));
      renderAll();
      await runReveal(prev, prev + 1);
      renderShelf(prev + 1, state.rewards);
      showNote('Star awarded!', star.label, 'saving…', 2500);
      await celebrateMilestones(prev, prev + 1);
    } finally {
      state.busy = false;
    }
  },
  commit(stars) {
    state.stars = normalizeStars({ stars });
    state.shown = state.stars.length;
    state.sheet = Math.min(state.sheet, currentSheet(state.shown));
    setSeen(state.stars.length);
    renderAll();
  },
  note: (kicker, label) => showNote(kicker, label),
});

// ---------- boot ----------

async function boot() {
  $('title').querySelector('.title-name').textContent = `${config.herName}’s`;
  wireMute();
  wireSecretTaps();
  wireSheetNav();
  wireLogbook();
  $('grid').addEventListener('click', onStarTap);
  $('shelf').addEventListener('click', onCouponTap);
  document.addEventListener('pointerdown', () => sfx.unlockAudio(), { once: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

  try {
    const [stars, rewards] = await Promise.all([loadStars(), fetchJson(config.rewardsPath)]);
    state.stars = stars;
    state.rewards = normalizeRewards(rewards);
  } catch (err) {
    console.error(err);
    showNote('Oops', 'Couldn’t load the chart. Pull to refresh?', '', 8000);
  }

  const seen = Math.min(getSeen(), state.stars.length);
  setSeen(seen);
  offerReveal(seen);
  startShine();
  if (location.hash === '#admin') admin.open();
}

boot();
