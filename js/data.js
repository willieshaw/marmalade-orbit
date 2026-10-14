// Pure helpers for star and reward data. No DOM, no fetch.

const isNonEmptyString = v => typeof v === 'string' && v.trim() !== '';

export function normalizeStars(raw) {
  const list = raw && Array.isArray(raw.stars) ? raw.stars : [];
  return list
    .filter(s => s && typeof s === 'object' && isNonEmptyString(s.id) && isNonEmptyString(s.label))
    .map(s => ({ id: s.id, label: s.label.trim(), date: typeof s.date === 'string' ? s.date : '' }));
}

export function normalizeRewards(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter(r => r && Number.isInteger(r.at) && r.at > 0 && isNonEmptyString(r.reward))
    .map(r => ({ at: r.at, reward: r.reward.trim() }))
    .sort((a, b) => a.at - b.at);
}

export function unseenCount(total, seen) {
  return Math.max(0, total - (Number.isFinite(seen) ? seen : 0));
}

export function milestoneProgress(count, rewards) {
  const unlocked = rewards.filter(r => r.at <= count);
  const next = rewards.find(r => r.at > count) || null;
  const from = unlocked.length ? unlocked[unlocked.length - 1].at : 0;
  if (!next) return { unlocked, next: null, remaining: 0, from, fraction: 1 };
  return {
    unlocked,
    next,
    remaining: next.at - count,
    from,
    fraction: (count - from) / (next.at - from),
  };
}

export function newlyUnlocked(prevCount, count, rewards) {
  return rewards.filter(r => r.at > prevCount && r.at <= count);
}
