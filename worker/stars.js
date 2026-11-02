// What an agent can do to the chart: everything the desk's Award and Stars tabs
// can, plus the Rewards tab from rewards.js. Every reply is written to be passed
// on by text.

import { config } from '../js/config.js';
import { appendStars, createClient, deleteStar, editStar, localDate, makeStars, removeLastStar } from '../js/github.js';
import { normalizeStars } from '../js/data.js';
import { nextOccurrences, normalizeRewardsDoc, occurrences } from '../js/rewards.js';
import { cleanText, StarError } from './clean.js';
import { createRewardDesk } from './rewards.js';

const MAX_LABEL = 80;
const MAX_STARS = 10;
const MAX_LISTED = 50;
const RETRY_WINDOW_MS = 2 * 60 * 1000;

class AlreadyAdded extends Error {}

function cleanLabels(labels) {
  if (!Array.isArray(labels)) throw new StarError('Send labels as a list of what she did.');
  const clean = labels.map(cleanText).filter(Boolean);
  if (!clean.length) throw new StarError('A star needs a label.');
  if (clean.length > MAX_STARS) throw new StarError(`That's a lot of stars! ${MAX_STARS} at a time, please.`);
  if (clean.some(l => l.length > MAX_LABEL)) throw new StarError(`Keep each star to ${MAX_LABEL} characters.`);
  return clean;
}

function cleanDate(date, today) {
  if (date === undefined || date === null || date === '') return undefined;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new StarError('Dates look like 2026-11-01.');
  }
  if (date > today) throw new StarError("A star can't be dated in the future.");
  return date;
}

// The same stars, from an agent, moments ago: a retry rather than a new award.
function isRetry(doc, labels, now) {
  const tail = (doc?.stars ?? []).slice(-labels.length);
  return tail.length === labels.length && tail.every((star, i) =>
    star.source === 'agent' && star.label === labels[i] && now - Date.parse(star.addedAt) < RETRY_WINDOW_MS);
}

function rewardNews(before, total, rules) {
  const earned = occurrences(rules, total, before).map(o => o.reward);
  const next = nextOccurrences(rules, total, 1)[0];
  return [
    earned.length ? `🏆 ${config.herName} just earned: ${earned.join(', ')}!` : '',
    next ? `${next.at - total} more until ${next.reward}.` : '',
  ].filter(Boolean).join(' ');
}

const plural = n => (n === 1 ? '1 star' : `${n} stars`);

export function createDesk({ fetch, token, timeZone, now }) {
  const repo = { owner: config.owner, repo: config.repo, token, fetch };
  const stars = createClient({ ...repo, path: config.starsPath });
  const rewards = createClient({ ...repo, path: config.rewardsPath });
  // A reward line is a nicety, so it never gets in the way of the star itself.
  const loadRules = () => rewards.read().then(({ doc }) => normalizeRewardsDoc(doc).rules).catch(() => []);

  async function add({ labels, date }) {
    const clean = cleanLabels(labels);
    const day = cleanDate(date, localDate(now, timeZone));
    const fresh = makeStars({ labels: clean, now, timeZone, date: day })
      .map(star => ({ ...star, source: 'agent', addedAt: now.toISOString() }));
    const message = clean.length === 1 ? `Star: ${clean[0]}` : `Stars (${clean.length}): ${clean.join(', ')}`;

    let before = 0;
    let saved;
    try {
      saved = await stars.update(doc => {
        if (isRetry(doc, clean, now)) throw new AlreadyAdded();
        before = normalizeStars(doc).length;
        return appendStars(doc, fresh);
      }, message);
    } catch (err) {
      if (err instanceof AlreadyAdded) return 'Already on the chart, so nothing was added twice.';
      throw err;
    }

    const total = normalizeStars(saved).length;
    const headline = clean.length === 1
      ? `★ Star #${total}: “${clean[0]}”!`
      : `${'★'.repeat(clean.length)} ${clean.length} new stars! That makes ${total}.`;
    return [headline, rewardNews(before, total, await loadRules()), `${config.herName} will see it in about a minute.`]
      .filter(Boolean).join(' ');
  }

  async function undo() {
    const { doc: current } = await stars.read();
    const saved = await stars.update(doc => {
      const last = doc?.stars?.at(-1);
      if (!last) throw new StarError('The chart is empty.');
      return removeLastStar(doc);
    }, `Undo star: ${current?.stars?.at(-1)?.label}`);
    return `Peeled off “${current.stars.at(-1).label}”. ${plural(normalizeStars(saved).length)} left on the chart.`;
  }

  async function find(id) {
    const { doc } = await stars.read();
    const star = doc?.stars?.find(s => s.id === id);
    if (!star) throw new StarError('No star with that id. list_stars shows them.');
    return star;
  }

  async function list({ query } = {}) {
    const { doc } = await stars.read();
    const q = String(query ?? '').trim().toLowerCase();
    const hits = normalizeStars(doc)
      .filter(s => !q || s.label.toLowerCase().includes(q) || s.date.includes(q))
      .reverse();
    if (!hits.length) return q ? `No stars match “${query}”.` : 'No stars yet.';
    const lines = hits.slice(0, MAX_LISTED).map(s => `${s.date}  ${s.label}  (id: ${s.id})`);
    if (hits.length > MAX_LISTED) lines.unshift(`Newest ${MAX_LISTED} of ${hits.length}:`);
    return lines.join('\n');
  }

  async function edit({ id, label, date }) {
    const newLabel = label === undefined ? undefined : cleanLabels([label])[0];
    const newDate = cleanDate(date, localDate(now, timeZone));
    if (newLabel === undefined && newDate === undefined) throw new StarError('Send a new label or date.');
    const star = await find(id);
    const name = newLabel ?? star.label;
    await stars.update(doc => editStar(doc, id, { label: newLabel, date: newDate }), `Edit star: ${name}`);
    return `Fixed: “${name}” (${newDate ?? star.date}).`;
  }

  async function remove({ id }) {
    const star = await find(id);
    const saved = await stars.update(doc => deleteStar(doc, id), `Delete star: ${star.label}`);
    return `Deleted “${star.label}”. ${plural(normalizeStars(saved).length)} left on the chart.`;
  }

  async function status() {
    const [{ doc }, rules] = await Promise.all([stars.read(), loadRules()]);
    const all = normalizeStars(doc);
    const recent = all.slice(-5).reverse().map(s => `“${s.label}” (${s.date})`).join(', ');
    return [
      `${plural(all.length)} on ${config.herName}'s chart.`,
      recent ? `Latest: ${recent}.` : '',
      rewardNews(all.length, all.length, rules),
    ].filter(Boolean).join(' ');
  }

  return { add, undo, list, edit, remove, status, ...createRewardDesk({ stars, rewards }) };
}
