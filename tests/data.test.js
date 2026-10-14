import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStars,
  normalizeRewards,
  unseenCount,
  milestoneProgress,
  newlyUnlocked,
} from '../js/data.js';

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

test('normalizeRewards sorts by threshold and drops invalid ones', () => {
  const raw = [
    { at: 10, reward: 'Dinner' },
    { at: 5, reward: 'Breakfast in bed' },
    { at: 0, reward: 'zero' },
    { at: 'x', reward: 'bad' },
    { at: 7 },
  ];
  assert.deepEqual(normalizeRewards(raw), [
    { at: 5, reward: 'Breakfast in bed' },
    { at: 10, reward: 'Dinner' },
  ]);
  assert.deepEqual(normalizeRewards('junk'), []);
});

test('unseenCount never goes negative', () => {
  assert.equal(unseenCount(5, 3), 2);
  assert.equal(unseenCount(3, 3), 0);
  assert.equal(unseenCount(2, 5), 0);
  assert.equal(unseenCount(4, null), 4);
});

const rewards = [
  { at: 5, reward: 'Breakfast in bed' },
  { at: 10, reward: 'Dinner' },
];

test('milestoneProgress with zero stars points at the first reward', () => {
  const p = milestoneProgress(0, rewards);
  assert.deepEqual(p.unlocked, []);
  assert.equal(p.next.reward, 'Breakfast in bed');
  assert.equal(p.remaining, 5);
  assert.equal(p.from, 0);
  assert.equal(p.fraction, 0);
});

test('milestoneProgress exactly on a milestone unlocks it and aims at the next', () => {
  const p = milestoneProgress(5, rewards);
  assert.deepEqual(p.unlocked.map(r => r.at), [5]);
  assert.equal(p.next.at, 10);
  assert.equal(p.remaining, 5);
  assert.equal(p.from, 5);
  assert.equal(p.fraction, 0);
});

test('milestoneProgress mid-way reports fraction since previous milestone', () => {
  const p = milestoneProgress(8, rewards);
  assert.equal(p.remaining, 2);
  assert.equal(p.fraction, 3 / 5);
});

test('milestoneProgress past the last milestone has no next', () => {
  const p = milestoneProgress(12, rewards);
  assert.deepEqual(p.unlocked.map(r => r.at), [5, 10]);
  assert.equal(p.next, null);
  assert.equal(p.remaining, 0);
  assert.equal(p.fraction, 1);
});

test('milestoneProgress with no rewards', () => {
  const p = milestoneProgress(3, []);
  assert.equal(p.next, null);
  assert.deepEqual(p.unlocked, []);
});

test('newlyUnlocked returns rewards crossed between two counts', () => {
  assert.deepEqual(newlyUnlocked(4, 5, rewards).map(r => r.at), [5]);
  assert.deepEqual(newlyUnlocked(3, 11, rewards).map(r => r.at), [5, 10]);
  assert.deepEqual(newlyUnlocked(5, 6, rewards), []);
  assert.deepEqual(newlyUnlocked(6, 4, rewards), []);
});
