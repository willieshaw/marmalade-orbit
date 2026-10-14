// Renders the paper chart, the progress ruler and the reward shelf.

import { milestoneProgress } from './data.js';
import { sheetRange, currentSheet } from './sheets.js';

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
  btn.setAttribute('aria-label', `Star ${index + 1}: ${star.label}`);
  const sheen = document.createElement('span');
  sheen.className = 'sheen';
  btn.append(starSvg(), sheen);
  return btn;
}

// Renders one sheet of the pad. Stars at index >= `shown` are hidden until a reveal slaps them on.
export function renderChart({ stars, rewards, sheet, shown }) {
  const grid = $('grid');
  const count = stars.length;
  const { start, end } = sheetRange(sheet);
  const milestones = new Set(rewards.map(r => r.at));
  const frag = document.createDocumentFragment();

  for (let i = start; i < end; i++) {
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
      if (i >= shown) li.classList.add('pending');
      li.append(sticker(stars[i], i));
    } else {
      li.classList.add('empty');
      if (i === count && shown === count) li.classList.add('next');
    }
    frag.append(li);
  }
  grid.replaceChildren(frag);

  renderPad({ sheet, shown });
  $('empty-hint').hidden = count > 0;
  renderCount(shown);
  renderRuler(shown, rewards);
  renderShelf(shown, rewards);
}

// Sheet label, nav arrows, COMPLETE stamp and the stack of filled sheets underneath.
export function renderPad({ sheet, shown }) {
  const { start, end } = sheetRange(sheet);
  const top = currentSheet(shown);
  $('sheet-label').textContent = `Sheet ${sheet + 1} · stars ${start + 1}–${end}`;
  $('sheet-prev').disabled = sheet === 0;
  $('sheet-next').disabled = sheet >= top;
  $('sheet-stamp').hidden = shown < end;
  const layers = Math.min(5, top);
  const shadows = Array.from({ length: layers }, (_, k) => {
    const n = k + 1;
    const x = (n % 2 ? 1 : -1) * n * 1.5;
    return `${x}px ${n * 4}px 0 -1px ${n % 2 ? '#f3ecd8' : '#ebe2c8'}, ${x}px ${n * 4 + 1}px 0 -1px rgba(120, 90, 50, .35)`;
  });
  $('paper').style.setProperty('--pad', shadows.length ? `${shadows.join(', ')},` : '');
}

export function renderCount(count) {
  $('count').textContent = String(count);
  document.querySelector('.count-badge').classList.toggle('wide', count >= 100);
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
