import { config } from './config.js';
import { normalizeStars, normalizeRewards, unseenCount, newlyUnlocked } from './data.js';
import { renderChart, renderCount, renderRuler, renderShelf, slotEl, formatDate } from './chart.js';
import { slapOnto, sparkleBurst, bumpCount, showNote, showCertificate, reducedMotion } from './fx.js';
import { initAdmin } from './admin.js';
import * as sfx from './sound.js';

const SEEN_KEY = 'mo.seen';
const MAX_ANIMATED = 6;
const $ = id => document.getElementById(id);

const state = { stars: [], rewards: [], busy: false };

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

function renderAll(pending = 0) {
  renderChart({ stars: state.stars, rewards: state.rewards, pending });
}

function celebrateMilestones(prev, count) {
  return newlyUnlocked(prev, count, state.rewards).reduce(
    (p, r) => p.then(() => showCertificate({ name: config.herName, signer: config.signedBy, reward: r.reward, at: r.at })),
    Promise.resolve(),
  );
}

// Slap stars [from, to) onto the chart one after another.
async function revealRange(from, to) {
  const count = to;
  const start = Math.max(from, to - MAX_ANIMATED);
  for (let i = from; i < start; i++) slotEl(i).classList.remove('pending');
  for (let i = start; i < to; i++) {
    await slapOnto(slotEl(i), { fast: i < to - 1 });
    renderCount(i + 1);
    renderRuler(i + 1, state.rewards);
    bumpCount();
  }
  const last = state.stars[count - 1];
  const n = to - from;
  showNote(n === 1 ? 'New star!' : `${n} new stars!`, last.label, formatDate(last.date));
  await celebrateMilestones(from, count);
  renderAll();
  setSeen(count);
}

function offerReveal(seen) {
  const n = unseenCount(state.stars.length, seen);
  renderAll(n);
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
  const changed = stars.length !== state.stars.length || stars.some((s, i) => s.id !== state.stars[i]?.id);
  state.stars = stars;
  setSeen(seen);
  if (unseenCount(stars.length, seen)) offerReveal(seen);
  else if (changed) renderAll();
}

// ---------- interactions ----------

function onStarTap(e) {
  const btn = e.target.closest('.sticker');
  if (!btn) return;
  sfx.unlockAudio();
  const i = Number(btn.dataset.index);
  const star = state.stars[i];
  const wasPeeled = btn.classList.contains('peeled');
  document.querySelectorAll('.sticker.peeled').forEach(el => el.classList.remove('peeled'));
  btn.classList.remove('wobble');
  void btn.offsetWidth;
  btn.classList.add('wobble');
  sfx.pop();
  if (wasPeeled) return;
  btn.classList.add('peeled');
  const r = btn.getBoundingClientRect();
  sparkleBurst(r.left + r.width / 2, r.top + r.height / 2, 8);
  showNote(`Star #${i + 1}`, star.label, formatDate(star.date));
}

function onCouponTap(e) {
  const c = e.target.closest('.coupon.unlocked');
  if (!c) return;
  sfx.unlockAudio();
  const r = state.rewards.find(x => x.at === Number(c.dataset.at));
  if (r) showCertificate({ name: config.herName, signer: config.signedBy, reward: r.reward, at: r.at });
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
    renderAll(1);
    state.busy = true;
    try {
      await slapOnto(slotEl(prev));
      renderCount(prev + 1);
      renderRuler(prev + 1, state.rewards);
      renderShelf(prev + 1, state.rewards);
      bumpCount();
      showNote('Star awarded!', star.label, 'saving…', 2500);
      await celebrateMilestones(prev, prev + 1);
    } finally {
      state.busy = false;
    }
  },
  commit(stars) {
    state.stars = normalizeStars({ stars });
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
  $('grid').addEventListener('click', onStarTap);
  $('shelf').addEventListener('click', onCouponTap);
  document.addEventListener('pointerdown', () => sfx.unlockAudio(), { once: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  if (reducedMotion()) document.documentElement.classList.add('reduced');

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
  if (location.hash === '#admin') admin.open();
}

boot();
