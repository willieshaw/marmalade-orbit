import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByMonth } from '../js/logbook.js';

const star = (id, date) => ({ id, label: id, date });

test('groupByMonth lists months newest first with stars newest first', () => {
  const stars = [
    star('a', '2026-09-28'),
    star('b', '2026-10-01'),
    star('c', '2026-10-12'),
  ];
  const groups = groupByMonth(stars);
  assert.deepEqual(groups.map(g => g.key), ['2026-10', '2026-09']);
  assert.deepEqual(groups[0].items.map(i => i.star.id), ['c', 'b']);
  assert.deepEqual(groups[0].items.map(i => i.index), [2, 1]);
  assert.deepEqual(groups[1].items.map(i => i.index), [0]);
});

test('groupByMonth keeps the chart index even when dates are out of order', () => {
  const groups = groupByMonth([star('a', '2026-10-05'), star('b', '2026-10-02')]);
  assert.deepEqual(groups[0].items.map(i => i.index), [1, 0]);
});

test('groupByMonth puts undated stars in their own group at the end', () => {
  const groups = groupByMonth([star('a', ''), star('b', '2026-10-02')]);
  assert.deepEqual(groups.map(g => g.key), ['2026-10', 'undated']);
});

test('groupByMonth handles no stars', () => {
  assert.deepEqual(groupByMonth([]), []);
});
