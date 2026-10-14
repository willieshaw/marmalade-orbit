// Renders the paper chart, the progress ruler and the reward shelf.

import { milestoneProgress } from './data.js';

const $ = id => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';

// Stable pseudo-random number in [0, 1) from a star id, so each sticker keeps its tilt.
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export function formatDate(iso) {
  const [y, m, d] = (iso || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function starSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  for (const cls of ['s-back', 's-foil', 's-shine']) {
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#star-shape');
    use.setAttribute('class', cls);
    svg.append(use);
  }
  return svg;
}

function sticker(star, index) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sticker';
  btn.dataset.index = String(index);
  btn.style.setProperty('--rot', `${Math.round((hash01(star.id) - .5) * 30)}deg`);
  btn.style.setProperty('--sheen-delay', `${(index * .37) % 7}s`);
  btn.setAttribute('aria-label', `Star ${index + 1}: ${star.label}`);
  const sheen = document.createElement('span');
  sheen.className = 'sheen';
  btn.append(starSvg(), sheen);
  return btn;
}

function slotCount(count, rewards) {
  const next = rewards.find(r => r.at > count);
  return Math.max(10, count + 1, next ? next.at : 0);
}

export function renderChart({ stars, rewards, pending = 0 }) {
  const grid = $('grid');
  const count = stars.length;
  const milestones = new Set(rewards.map(r => r.at));
  const total = slotCount(count, rewards);
  const frag = document.createDocumentFragment();

  for (let i = 0; i < total; i++) {
    const li = document.createElement('li');
    li.className = 'slot';
    li.dataset.index = String(i);
    if (milestones.has(i + 1)) li.classList.add('milestone');
    const num = document.createElement('span');
    num.className = 'slot-num';
    num.textContent = String(i + 1);
    li.append(num);
    if (i < count) {
      li.classList.add('filled');
      // The last `pending` stars are hidden until the reveal animation slaps them on.
      if (i >= count - pending) li.classList.add('pending');
      li.append(sticker(stars[i], i));
    } else {
      li.classList.add('empty');
      if (i === count) li.classList.add('next');
    }
    frag.append(li);
  }
  grid.replaceChildren(frag);

  $('empty-hint').hidden = count > 0;
  renderCount(count - pending);
  renderRuler(count - pending, rewards);
  renderShelf(count - pending, rewards);
}

export function renderCount(count) {
  $('count').textContent = String(count);
}

export function renderRuler(count, rewards) {
  const p = milestoneProgress(count, rewards);
  const text = $('ruler-text');
  text.replaceChildren();
  if (p.next) {
    const strong = document.createElement('strong');
    strong.textContent = String(p.remaining);
    text.append(strong, ` more star${p.remaining === 1 ? '' : 's'} until: ${p.next.reward}`);
  } else if (rewards.length) {
    text.textContent = 'Every reward unlocked. Legend status.';
  } else {
    text.textContent = 'Keep collecting!';
  }
  const pct = `${Math.round(p.fraction * 100)}%`;
  $('ruler-fill').style.width = pct;
  $('pencil').style.left = pct;
}

export function renderShelf(count, rewards) {
  const shelf = $('shelf');
  shelf.replaceChildren(...rewards.map(r => {
    const li = document.createElement('li');
    const el = document.createElement(r.at <= count ? 'button' : 'div');
    el.className = `coupon ${r.at <= count ? 'unlocked' : 'locked'}`;
    if (r.at <= count) {
      el.type = 'button';
      el.dataset.at = String(r.at);
    }
    const at = document.createElement('span');
    at.className = 'coupon-at';
    at.textContent = `${r.at}★`;
    const txt = document.createElement('span');
    txt.className = 'coupon-text';
    txt.textContent = r.reward;
    el.append(at, txt);
    li.append(el);
    return li;
  }));
}

export function slotEl(index) {
  return document.querySelector(`.slot[data-index="${index}"]`);
}
