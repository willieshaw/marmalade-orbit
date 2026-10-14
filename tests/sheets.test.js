import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHEET_SIZE, sheetOf, currentSheet, sheetRange, planReveal } from '../js/sheets.js';

test('sheets hold 50 stars', () => {
  assert.equal(SHEET_SIZE, 50);
});

test('sheetOf maps a star index to its sheet', () => {
  assert.equal(sheetOf(0), 0);
  assert.equal(sheetOf(49), 0);
  assert.equal(sheetOf(50), 1);
  assert.equal(sheetOf(499), 9);
});

test('currentSheet is the sheet the next star goes on', () => {
  assert.equal(currentSheet(0), 0);
  assert.equal(currentSheet(49), 0);
  assert.equal(currentSheet(50), 1);
  assert.equal(currentSheet(51), 1);
  assert.equal(currentSheet(500), 10);
});

test('sheetRange gives the half-open index range', () => {
  assert.deepEqual(sheetRange(0), { start: 0, end: 50 });
  assert.deepEqual(sheetRange(2), { start: 100, end: 150 });
});

const slaps = (...idx) => idx.map(index => ({ type: 'slap', index }));

test('planReveal: nothing unseen means no steps', () => {
  assert.deepEqual(planReveal(5, 5), []);
  assert.deepEqual(planReveal(7, 5), []);
});

test('planReveal: a single new star slaps on', () => {
  assert.deepEqual(planReveal(0, 1), slaps(0));
});

test('planReveal: crossing a sheet celebrates and flips mid-reveal', () => {
  assert.deepEqual(planReveal(48, 53), [
    ...slaps(48, 49),
    { type: 'sheetDone', sheet: 0 },
    { type: 'flipTo', sheet: 1 },
    ...slaps(50, 51, 52),
  ]);
});

test('planReveal: filling a sheet exactly still flips to the fresh one', () => {
  assert.deepEqual(planReveal(49, 50), [
    ...slaps(49),
    { type: 'sheetDone', sheet: 0 },
    { type: 'flipTo', sheet: 1 },
  ]);
});

test('planReveal: only the last 6 animate; earlier ones appear at once', () => {
  assert.deepEqual(planReveal(2, 12), [
    { type: 'instant', from: 2, to: 6 },
    ...slaps(6, 7, 8, 9, 10, 11),
  ]);
});

test('planReveal: instant fill that completes the sheet celebrates before flipping', () => {
  assert.deepEqual(planReveal(40, 60), [
    { type: 'instant', from: 40, to: 54 },
    { type: 'sheetDone', sheet: 0 },
    { type: 'flipTo', sheet: 1 },
    ...slaps(54, 55, 56, 57, 58, 59),
  ]);
});

test('planReveal: catching up across many sheets jumps straight to the last one', () => {
  assert.deepEqual(planReveal(0, 130), [
    { type: 'instant', from: 0, to: 124 },
    { type: 'sheetDone', sheet: 0 },
    { type: 'flipTo', sheet: 2 },
    ...slaps(124, 125, 126, 127, 128, 129),
  ]);
});

test('planReveal: starting on a fresh sheet needs no flip', () => {
  assert.deepEqual(planReveal(50, 51), slaps(50));
});
