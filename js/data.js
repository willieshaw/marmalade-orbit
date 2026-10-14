// Pure helpers for star and reward data. No DOM, no fetch.

const isNonEmptyString = v => typeof v === 'string' && v.trim() !== '';

export function normalizeStars(raw) {
  const list = raw && Array.isArray(raw.stars) ? raw.stars : [];
  return list
    .filter(s => s && typeof s === 'object' && isNonEmptyString(s.id) && isNonEmptyString(s.label))
    .map(s => ({ id: s.id, label: s.label.trim(), date: typeof s.date === 'string' ? s.date : '' }));
}

export function unseenCount(total, seen) {
  return Math.max(0, total - (Number.isFinite(seen) ? seen : 0));
}
