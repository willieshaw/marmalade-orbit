// Renders the paper chart, the progress ruler and the reward shelf.

import { milestoneProgress, occurrences, nextOccurrences, owed, groupByRule } from './rewards.js';
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
  const milestones = new Set(occurrences(rewards.rules, end, start).map(o => o.at));
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

export function renderRuler(count, { rules }) {
  const p = milestoneProgress(count, rules);
  const text = $('ruler-text');
  text.replaceChildren();
  if (p.next) {
    const strong = document.createElement('strong');
    strong.textContent = String(p.remaining);
    text.append(strong, ` more star${p.remaining === 1 ? '' : 's'} until: ${p.next.reward}`);
  } else if (rules.length) {
    text.textContent = 'Every reward unlocked. Legend status.';
  } else {
    text.textContent = 'Keep collecting!';
  }
  const pct = `${Math.round(p.fraction * 100)}%`;
  $('ruler-fill').style.width = pct;
  $('pencil').style.left = pct;
}

function coupon({ state, at, reward, count = 1, ruleId }) {
  const unlocked = state !== 'locked';
  const el = document.createElement(unlocked ? 'button' : 'div');
  el.className = `coupon ${state === 'locked' ? 'locked' : 'unlocked'}${state === 'redeemed' ? ' redeemed' : ''}`;
  if (unlocked) {
    el.type = 'button';
    el.dataset.rule = ruleId;
    el.dataset.state = state;
  }
  const atEl = document.createElement('span');
  atEl.className = 'coupon-at';
  atEl.textContent = `${at}★`;
  const txt = document.createElement('span');
  txt.className = 'coupon-text';
  txt.textContent = reward;
  el.append(atEl, txt);
  if (count > 1) {
    const times = document.createElement('span');
    times.className = 'coupon-times';
    times.textContent = `×${count}`;
    el.append(times);
  }
  const li = document.createElement('li');
  li.append(el);
  return li;
}

// Owed rewards first (bundled per rule), then the next few coming up, then a fold of redeemed ones.
export function renderShelf(count, { rules, redeemed }) {
  $('shelf-wrap').hidden = rules.length === 0;
  const unlocked = occurrences(rules, count);
  const done = new Set(redeemed);
  const items = [
    ...groupByRule(owed(unlocked, redeemed)).map(g =>
      coupon({ state: 'owed', at: g.latestAt, reward: g.reward, count: g.count, ruleId: g.ruleId })),
    ...nextOccurrences(rules, count, 3).map(o => coupon({ state: 'locked', at: o.at, reward: o.reward })),
  ];
  const redeemedGroups = groupByRule(unlocked.filter(o => done.has(o.key)));
  if (redeemedGroups.length) {
    const total = redeemedGroups.reduce((n, g) => n + g.count, 0);
    const details = document.createElement('details');
    details.className = 'shelf-redeemed';
    const summary = document.createElement('summary');
    summary.textContent = `${total} redeemed`;
    const ul = document.createElement('ul');
    ul.className = 'shelf';
    ul.append(...redeemedGroups.map(g =>
      coupon({ state: 'redeemed', at: g.latestAt, reward: g.reward, count: g.count, ruleId: g.ruleId })));
    details.append(summary, ul);
    const li = document.createElement('li');
    li.append(details);
    items.push(li);
  }
  $('shelf').replaceChildren(...items);
}

export function slotEl(index) {
  return document.querySelector(`.slot[data-index="${index}"]`);
}
