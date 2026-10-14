// Animations: the fly-in slap, sparkles, confetti, notes and the certificate.

import { starSvg } from './chart.js';
import * as sfx from './sound.js';

const $ = id => document.getElementById(id);
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(r => setTimeout(r, ms));

// A giant star spins in from the middle of the screen and slaps onto `slot`.
export async function slapOnto(slot, { fast = false } = {}) {
  const sticker = slot.querySelector('.sticker');
  slot.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  await wait(reducedMotion() ? 0 : 350);

  if (reducedMotion()) {
    slot.classList.remove('pending');
    sticker.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    sfx.thwack();
    return;
  }

  const r = sticker.getBoundingClientRect();
  const size = r.width;
  const flyer = document.createElement('div');
  flyer.className = 'flyer';
  flyer.style.width = flyer.style.height = `${size}px`;
  flyer.append(starSvg());
  document.body.append(flyer);

  const startX = window.innerWidth / 2 - size / 2;
  const startY = window.innerHeight / 2 - size / 2;
  const rot = getComputedStyle(sticker).getPropertyValue('--rot') || '0deg';
  const dur = fast ? 520 : 950;

  sfx.whoosh(dur / 1000);
  await flyer.animate([
    { transform: `translate(${startX}px, ${startY}px) scale(.2) rotate(-200deg)`, opacity: 0 },
    { transform: `translate(${startX}px, ${startY - 40}px) scale(4.2) rotate(-40deg)`, opacity: 1, offset: .35 },
    { transform: `translate(${startX}px, ${startY - 40}px) scale(4.4) rotate(-20deg)`, offset: .5 },
    { transform: `translate(${r.left}px, ${r.top}px) scale(1) rotate(${rot})` },
  ], { duration: dur, easing: 'cubic-bezier(.55, 0, .75, .3)', fill: 'forwards' }).finished;

  flyer.remove();
  slot.classList.remove('pending');
  sticker.classList.add('landing');
  sticker.addEventListener('animationend', () => sticker.classList.remove('landing'), { once: true });
  sfx.thwack();
  shake();
  sparkleBurst(r.left + size / 2, r.top + size / 2, fast ? 10 : 18);
}

export function shake() {
  const paper = $('paper');
  paper.classList.remove('shake');
  void paper.offsetWidth;
  paper.classList.add('shake');
}

const SPARK_COLORS = ['#ffd23f', '#fff3b0', '#e5432d', '#8cd2c8', '#ffaabe'];

export function sparkleBurst(x, y, n = 16) {
  if (reducedMotion()) return;
  sfx.twinkle();
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.setProperty('--c', SPARK_COLORS[i % SPARK_COLORS.length]);
    const angle = (i / n) * Math.PI * 2 + Math.random() * .4;
    const dist = 50 + Math.random() * 60;
    const scale = .8 + Math.random() * 1.4;
    document.body.append(s);
    s.animate([
      { transform: 'translate(0, 0) scale(0) rotate(0)', opacity: 1 },
      { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(${scale}) rotate(180deg)`, opacity: 1, offset: .6 },
      { transform: `translate(${Math.cos(angle) * dist * 1.2}px, ${Math.sin(angle) * dist * 1.2 + 20}px) scale(0) rotate(270deg)`, opacity: 0 },
    ], { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.2, .8, .3, 1)' }).finished.then(() => s.remove());
  }
}

export function bumpCount() {
  const badge = document.querySelector('.count-badge');
  badge.classList.remove('bump');
  void badge.offsetWidth;
  badge.classList.add('bump');
}

let noteTimer = 0;
export function showNote(kicker, label, date = '', ms = 4200) {
  const note = $('note');
  $('note-kicker').textContent = kicker;
  $('note-label').textContent = label;
  $('note-date').textContent = date;
  note.hidden = false;
  note.classList.remove('show');
  void note.offsetWidth;
  note.classList.add('show');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(hideNote, ms);
}

export function hideNote() {
  $('note').hidden = true;
}

// Falling star-shaped confetti on a full-screen canvas.
export function confetti(duration = 2600) {
  if (reducedMotion()) return;
  const canvas = $('confetti');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width = window.innerWidth * dpr;
  const h = canvas.height = window.innerHeight * dpr;
  const g = canvas.getContext('2d');
  const pieces = Array.from({ length: 140 }, () => ({
    x: Math.random() * w,
    y: -Math.random() * h * .5,
    vx: (Math.random() - .5) * 3 * dpr,
    vy: (2 + Math.random() * 4) * dpr,
    r: (5 + Math.random() * 8) * dpr,
    a: Math.random() * Math.PI,
    va: (Math.random() - .5) * .3,
    c: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
  }));
  const star = (x, y, r, a) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? r * .45 : r;
      const t = a + (i * Math.PI) / 5;
      g.lineTo(x + Math.cos(t) * rad, y + Math.sin(t) * rad);
    }
    g.closePath();
    g.fill();
  };
  const start = performance.now();
  const frame = now => {
    const t = now - start;
    g.clearRect(0, 0, w, h);
    g.globalAlpha = t > duration - 600 ? Math.max(0, (duration - t) / 600) : 1;
    for (const p of pieces) {
      p.x += p.vx; p.y += p.vy; p.vy += .05 * dpr; p.a += p.va;
      g.fillStyle = p.c;
      star(p.x, p.y, p.r, p.a);
    }
    if (t < duration) requestAnimationFrame(frame);
    else g.clearRect(0, 0, w, h);
  };
  requestAnimationFrame(frame);
}

// Certificate with a rubber stamp. Resolves when it is closed.
export function showCertificate({ name, signer, reward, at }) {
  $('cert-name').textContent = name;
  $('cert-signer').textContent = signer;
  $('cert-reward').textContent = reward;
  $('cert-for').textContent = `for collecting ${at} gold stars`;
  const cert = $('certificate');
  const scrim = $('scrim');
  const stamp = $('stamp');
  scrim.hidden = false;
  cert.hidden = false;
  cert.classList.remove('show');
  stamp.classList.remove('thump');
  void cert.offsetWidth;
  cert.classList.add('show');
  stamp.classList.add('thump');
  sfx.fanfare();
  confetti();
  const stampTimer = setTimeout(() => { sfx.stampThump(); shakeEl(cert); }, reducedMotion() ? 0 : 800);
  $('cert-close').focus({ preventScroll: true });

  return new Promise(resolve => {
    const close = () => {
      clearTimeout(stampTimer);
      cert.hidden = true;
      scrim.hidden = true;
      $('cert-close').removeEventListener('click', close);
      scrim.removeEventListener('click', close);
      resolve();
    };
    $('cert-close').addEventListener('click', close);
    scrim.addEventListener('click', close);
  });
}

function shakeEl(el) {
  if (reducedMotion()) return;
  el.animate([
    { translate: '0 0' }, { translate: '-3px 2px' }, { translate: '3px -1px' }, { translate: '0 0' },
  ], { duration: 220 });
}

// Turn the pad: the sheet lifts away, `swap()` re-renders, the new sheet settles in.
export async function turnPage(direction, swap) {
  const paper = $('paper');
  if (reducedMotion()) { swap(); return; }
  sfx.flip();
  const lift = direction > 0
    ? 'translate(-40%, -30px) rotate(-12deg)'
    : 'translate(40%, -30px) rotate(12deg)';
  await paper.animate(
    [{ transform: 'rotate(.6deg)', opacity: 1 }, { transform: lift, opacity: 0 }],
    { duration: 240, easing: 'cubic-bezier(.5, 0, .9, .5)' },
  ).finished;
  swap();
  const from = direction > 0
    ? 'translate(20%, 16px) rotate(5deg)'
    : 'translate(-20%, 16px) rotate(-5deg)';
  await paper.animate(
    [{ transform: from, opacity: 0 }, { transform: 'rotate(.6deg)', opacity: 1 }],
    { duration: 320, easing: 'cubic-bezier(.3, 1.4, .5, 1)' },
  ).finished;
}

// A sheet just filled up: COMPLETE stamp, fanfare, confetti.
export async function sheetComplete() {
  const stamp = $('sheet-stamp');
  stamp.hidden = false;
  stamp.classList.remove('thump');
  void stamp.offsetWidth;
  stamp.classList.add('thump');
  sfx.fanfare();
  await wait(reducedMotion() ? 300 : 380);
  sfx.stampThump();
  shake();
  confetti(2200);
  await wait(reducedMotion() ? 600 : 1500);
}

// Every so often one random sticker catches the light. One sheen at a time keeps phones cool.
export function startShine(intervalMs = 1300) {
  if (reducedMotion()) return;
  setInterval(() => {
    if (document.hidden) return;
    const stickers = document.querySelectorAll('.slot:not(.pending) .sticker:not(.shine)');
    if (!stickers.length) return;
    const el = stickers[Math.floor(Math.random() * stickers.length)];
    el.classList.add('shine');
    el.addEventListener('animationend', () => el.classList.remove('shine'), { once: true });
  }, intervalMs);
}
