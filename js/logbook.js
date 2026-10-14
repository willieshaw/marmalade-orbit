// The logbook: every star, grouped by month, newest first.

const MONTH_RE = /^(\d{4})-(\d{2})/;

export function groupByMonth(stars) {
  const groups = new Map();
  stars.forEach((star, index) => {
    const m = MONTH_RE.exec(star.date || '');
    const key = m ? `${m[1]}-${m[2]}` : 'undated';
    if (!groups.has(key)) groups.set(key, { key, items: [] });
    groups.get(key).items.push({ index, star });
  });
  return [...groups.values()]
    .sort((a, b) => (a.key === 'undated') - (b.key === 'undated') || b.key.localeCompare(a.key))
    .map(g => ({ ...g, items: g.items.sort((a, b) => b.index - a.index) }));
}

export function monthLabel(key) {
  if (key === 'undated') return 'Undated';
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
