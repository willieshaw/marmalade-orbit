import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStars, unseenCount } from '../js/data.js';

test('normalizeStars keeps valid stars in order', () => {
  const raw = { stars: [
    { id: 'a', label: 'Called the dentist', date: '2026-10-12' },
    { id: 'b', label: 'Laundry', date: '2026-10-13' },
  ] };
  assert.deepEqual(normalizeStars(raw).map(s => s.id), ['a', 'b']);
});

test('normalizeStars drops malformed entries and tolerates junk input', () => {
  const raw = { stars: [
    { id: 'a', label: 'ok', date: '2026-10-12' },
    { id: 'b', label: '', date: '2026-10-12' },
    { label: 'no id', date: '2026-10-12' },
    null,
    'nope',
  ] };
  assert.deepEqual(normalizeStars(raw).map(s => s.id), ['a']);
  assert.deepEqual(normalizeStars(null), []);
  assert.deepEqual(normalizeStars({}), []);
  assert.deepEqual(normalizeStars({ stars: 'x' }), []);
});

test('unseenCount never goes negative', () => {
  assert.equal(unseenCount(5, 3), 2);
  assert.equal(unseenCount(3, 3), 0);
  assert.equal(unseenCount(2, 5), 0);
  assert.equal(unseenCount(4, null), 4);
});
