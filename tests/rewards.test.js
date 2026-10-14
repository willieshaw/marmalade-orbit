import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRewardsDoc,
  occurrences,
  nextOccurrences,
  milestoneProgress,
  owed,
  groupByRule,
  celebrationsFor,
  validateRules,
} from '../js/rewards.js';

const once = (id, at, reward = id) => ({ id, kind: 'once', at, reward });
const every = (id, n, reward = id) => ({ id, kind: 'every', every: n, reward });

test('normalizeRewardsDoc keeps valid rules in order and dedupes redeemed keys', () => {
  const doc = normalizeRewardsDoc({
    rules: [
      every('d', 10, 'Dessert'),
      once('t', 100, '  Trip  '),
      { id: 'x', kind: 'once', at: 0, reward: 'zero' },
      { id: 'y', kind: 'every', every: 2.5, reward: 'frac' },
      { id: '', kind: 'once', at: 5, reward: 'no id' },
      { id: 'z', kind: 'sometimes', at: 5, reward: 'bad kind' },
      once('w', 5, '   '),
      null,
    ],
    redeemed: ['d@10', 'd@10', 7, 'd@20'],
  });
  assert.deepEqual(doc.rules, [every('d', 10, 'Dessert'), once('t', 100, 'Trip')]);
  assert.deepEqual(doc.redeemed, ['d@10', 'd@20']);
});

test('normalizeRewardsDoc tolerates junk and upgrades the old array format', () => {
  assert.deepEqual(normalizeRewardsDoc(null), { rules: [], redeemed: [] });
  assert.deepEqual(normalizeRewardsDoc([{ at: 5, reward: 'Breakfast' }]), {
    rules: [once('r5', 5, 'Breakfast')],
    redeemed: [],
  });
});

test('occurrences expands one-off and repeating rules up to a count, in star order', () => {
  const rules = [every('d', 10, 'Dessert'), once('t', 15, 'Trip')];
  assert.deepEqual(occurrences(rules, 25).map(o => o.key), ['d@10', 't@15', 'd@20']);
  const o = occurrences(rules, 25)[1];
  assert.deepEqual(o, { key: 't@15', ruleId: 't', at: 15, reward: 'Trip' });
  assert.deepEqual(occurrences(rules, 9), []);
});

test('occurrences can start after a given count', () => {
  const rules = [every('d', 10)];
  assert.deepEqual(occurrences(rules, 40, 20).map(o => o.at), [30, 40]);
});

test('nextOccurrences finds the upcoming rewards past the count', () => {
  const rules = [every('d', 10), once('t', 25), once('old', 3)];
  assert.deepEqual(nextOccurrences(rules, 12, 3).map(o => o.key), ['d@20', 't@25', 'd@30']);
  assert.deepEqual(nextOccurrences(rules, 20, 1).map(o => o.key), ['t@25']);
  assert.deepEqual(nextOccurrences([once('t', 5)], 5, 3), []);
});

test('milestoneProgress uses occurrences, including repeating ones', () => {
  const rules = [every('d', 10, 'Dessert')];
  const p = milestoneProgress(13, rules);
  assert.equal(p.next.key, 'd@20');
  assert.equal(p.remaining, 7);
  assert.equal(p.from, 10);
  assert.equal(p.fraction, 3 / 10);
  assert.deepEqual(p.unlocked.map(o => o.key), ['d@10']);
});

test('milestoneProgress with zero stars and past the last one-off', () => {
  assert.equal(milestoneProgress(0, [once('t', 5)]).remaining, 5);
  assert.equal(milestoneProgress(0, [once('t', 5)]).fraction, 0);
  const done = milestoneProgress(9, [once('t', 5)]);
  assert.equal(done.next, null);
  assert.equal(done.fraction, 1);
  assert.equal(milestoneProgress(3, []).next, null);
});

test('owed is unlocked minus redeemed', () => {
  const unlocked = occurrences([every('d', 10)], 30);
  assert.deepEqual(owed(unlocked, ['d@20']).map(o => o.key), ['d@10', 'd@30']);
});

test('groupByRule bundles repeats with a count and oldest-first keys', () => {
  const list = occurrences([every('d', 10, 'Dessert'), once('t', 15, 'Trip')], 30);
  const groups = groupByRule(list);
  assert.deepEqual(groups.map(g => [g.ruleId, g.reward, g.count, g.latestAt]), [
    ['d', 'Dessert', 3, 30],
    ['t', 'Trip', 1, 15],
  ]);
  assert.deepEqual(groups[0].keys, ['d@10', 'd@20', 'd@30']);
});

test('celebrationsFor shows up to two rewards one at a time', () => {
  const unlocked = occurrences([every('d', 10, 'Dessert')], 20);
  const certs = celebrationsFor(unlocked, []);
  assert.equal(certs.length, 2);
  assert.deepEqual(certs[0], { at: 10, lines: [{ reward: 'Dessert', times: 1 }], keys: ['d@10'] });
});

test('celebrationsFor skips celebrated rewards', () => {
  const unlocked = occurrences([every('d', 10, 'Dessert')], 20);
  const certs = celebrationsFor(unlocked, ['d@10']);
  assert.deepEqual(certs.map(c => c.keys), [['d@20']]);
  assert.deepEqual(celebrationsFor(unlocked, ['d@10', 'd@20']), []);
});

test('celebrationsFor collapses three or more into one grouped certificate', () => {
  const unlocked = occurrences([every('d', 10, 'Dessert'), once('t', 25, 'Trip')], 300);
  const certs = celebrationsFor(unlocked, []);
  assert.equal(certs.length, 1);
  assert.equal(certs[0].at, 300);
  assert.deepEqual(certs[0].lines, [{ reward: 'Dessert', times: 30 }, { reward: 'Trip', times: 1 }]);
  assert.equal(certs[0].keys.length, 31);
});

test('validateRules accepts good rules', () => {
  assert.deepEqual(validateRules([every('d', 10, 'Dessert'), once('t', 10, 'Trip')]), []);
});

test('validateRules flags blank text, bad numbers and duplicate one-offs', () => {
  const errors = validateRules([
    once('a', 5, ''),
    once('b', 0, 'Zero'),
    every('c', 2.5, 'Frac'),
    once('d', 50, 'Trip'),
    once('e', 50, 'Spa'),
  ]);
  assert.deepEqual(errors.map(e => e.index), [0, 1, 2, 4]);
  assert.match(errors[0].message, /what/i);
  assert.match(errors[1].message, /whole number/i);
  assert.match(errors[3].message, /already/i);
});
