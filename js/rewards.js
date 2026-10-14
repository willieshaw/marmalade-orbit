// Reward rules and everything derived from them. Pure, no DOM.
//
// A rule is either one-off  { id, kind: 'once',  at: 100,   reward }
//               or repeating { id, kind: 'every', every: 10, reward }.
// Each time a rule pays out is an occurrence keyed "ruleId@starCount", e.g. "r2@20".
// rewards.json also lists the keys that have been redeemed.

const isText = v => typeof v === 'string' && v.trim() !== '';
const isCount = n => Number.isInteger(n) && n > 0;

function normalizeRule(r) {
  if (!r || typeof r !== 'object' || !isText(r.id) || !isText(r.reward)) return null;
  const reward = r.reward.trim();
  if (r.kind === 'once' && isCount(r.at)) return { id: r.id, kind: 'once', at: r.at, reward };
  if (r.kind === 'every' && isCount(r.every)) return { id: r.id, kind: 'every', every: r.every, reward };
  return null;
}

export function normalizeRewardsDoc(raw) {
  // The first version stored a bare array of { at, reward }.
  if (Array.isArray(raw)) {
    raw = { rules: raw.map(r => r && { id: `r${r.at}`, kind: 'once', at: r.at, reward: r.reward }) };
  }
  const rules = (raw && Array.isArray(raw.rules) ? raw.rules : []).map(normalizeRule).filter(Boolean);
  const redeemed = [...new Set((raw && Array.isArray(raw.redeemed) ? raw.redeemed : []).filter(isText))];
  return { rules, redeemed };
}

const occ = (rule, at) => ({ key: `${rule.id}@${at}`, ruleId: rule.id, at, reward: rule.reward });
const byStar = (a, b) => a.at - b.at;

// Every payout with after < at <= upTo, in star order (rule order breaks ties).
export function occurrences(rules, upTo, after = 0) {
  const out = [];
  for (const rule of rules) {
    if (rule.kind === 'once') {
      if (rule.at > after && rule.at <= upTo) out.push(occ(rule, rule.at));
    } else {
      for (let at = (Math.floor(after / rule.every) + 1) * rule.every; at <= upTo; at += rule.every) {
        out.push(occ(rule, at));
      }
    }
  }
  return out.sort(byStar);
}

export function nextOccurrences(rules, count, n = 3) {
  const out = [];
  for (const rule of rules) {
    if (rule.kind === 'once') {
      if (rule.at > count) out.push(occ(rule, rule.at));
    } else {
      const first = (Math.floor(count / rule.every) + 1) * rule.every;
      for (let k = 0; k < n; k++) out.push(occ(rule, first + k * rule.every));
    }
  }
  return out.sort(byStar).slice(0, n);
}

export function milestoneProgress(count, rules) {
  const unlocked = occurrences(rules, count);
  const next = nextOccurrences(rules, count, 1)[0] || null;
  const from = unlocked.length ? unlocked[unlocked.length - 1].at : 0;
  if (!next) return { unlocked, next: null, remaining: 0, from, fraction: 1 };
  return { unlocked, next, remaining: next.at - count, from, fraction: (count - from) / (next.at - from) };
}

export function owed(unlocked, redeemed) {
  const done = new Set(redeemed);
  return unlocked.filter(o => !done.has(o.key));
}

// Bundle occurrences of the same rule: "Dessert ×3". Groups keep first-appearance order.
export function groupByRule(list) {
  const groups = new Map();
  for (const o of list) {
    if (!groups.has(o.ruleId)) groups.set(o.ruleId, { ruleId: o.ruleId, reward: o.reward, count: 0, latestAt: 0, keys: [] });
    const g = groups.get(o.ruleId);
    g.count += 1;
    g.latestAt = Math.max(g.latestAt, o.at);
    g.keys.push(o.key);
  }
  return [...groups.values()];
}

// Certificates to show for rewards not yet celebrated on this device.
// Up to two get their own certificate; more collapse into one so a first visit stays fun.
export function celebrationsFor(unlocked, celebrated, maxSingle = 2) {
  const seen = new Set(celebrated);
  const pending = unlocked.filter(o => !seen.has(o.key));
  if (pending.length <= maxSingle) {
    return pending.map(o => ({ at: o.at, lines: [{ reward: o.reward, times: 1 }], keys: [o.key] }));
  }
  return [{
    at: Math.max(...pending.map(o => o.at)),
    lines: groupByRule(pending).map(g => ({ reward: g.reward, times: g.count })),
    keys: pending.map(o => o.key),
  }];
}

export function validateRules(rules) {
  const errors = [];
  const onceAt = new Set();
  rules.forEach((r, index) => {
    const n = r.kind === 'once' ? r.at : r.every;
    if (!isText(r.reward)) {
      errors.push({ index, message: 'Say what the reward is.' });
    } else if (!isCount(n)) {
      errors.push({ index, message: 'Use a whole number of stars (1 or more).' });
    } else if (r.kind === 'once' && onceAt.has(n)) {
      errors.push({ index, message: `Another one-off reward is already at ${n} stars.` });
    }
    if (r.kind === 'once' && isCount(n)) onceAt.add(n);
  });
  return errors;
}
