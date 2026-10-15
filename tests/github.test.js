import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeBase64Utf8,
  decodeBase64Utf8,
  makeStar,
  appendStar,
  removeLastStar,
  serializeStars,
  createClient,
} from '../js/github.js';

test('base64 round-trips UTF-8 and emoji', () => {
  const s = 'Grace ⭐ fixed the café sink 🚰';
  assert.equal(decodeBase64Utf8(encodeBase64Utf8(s)), s);
});

test('decodeBase64Utf8 tolerates the newlines GitHub puts in content', () => {
  const b64 = encodeBase64Utf8('{"stars":[]}\n');
  const wrapped = b64.slice(0, 4) + '\n' + b64.slice(4) + '\n';
  assert.equal(decodeBase64Utf8(wrapped), '{"stars":[]}\n');
});

test('makeStar trims the label and defaults the date to today (local)', () => {
  const now = new Date(2026, 9, 3, 23, 30);
  const star = makeStar({ label: '  Did the dishes  ', now });
  assert.equal(star.label, 'Did the dishes');
  assert.equal(star.date, '2026-10-03');
  assert.match(star.id, /^[a-z0-9]{6,}$/);
});

test('makeStar rejects an empty label', () => {
  assert.throws(() => makeStar({ label: '   ' }), /label/i);
});

test('appendStar and removeLastStar do not mutate the input', () => {
  const doc = { stars: [{ id: 'a', label: 'x', date: '2026-10-01' }] };
  const added = appendStar(doc, { id: 'b', label: 'y', date: '2026-10-02' });
  assert.equal(doc.stars.length, 1);
  assert.deepEqual(added.stars.map(s => s.id), ['a', 'b']);
  const removed = removeLastStar(added);
  assert.deepEqual(removed.stars.map(s => s.id), ['a']);
  assert.equal(added.stars.length, 2);
  assert.deepEqual(removeLastStar({ stars: [] }).stars, []);
});

test('appendStar works on a missing or malformed doc', () => {
  assert.deepEqual(appendStar(null, { id: 'a', label: 'x', date: 'd' }).stars.length, 1);
});

test('serializeStars is pretty JSON with a trailing newline', () => {
  assert.equal(serializeStars({ stars: [] }), '{\n  "stars": []\n}\n');
});

function fakeGitHub(initialDoc, { failPutsWith = [] } = {}) {
  let doc = initialDoc;
  let sha = 'sha1';
  const calls = [];
  const fetch = async (url, opts = {}) => {
    calls.push({ url, ...opts });
    const method = opts.method || 'GET';
    if (method === 'GET') {
      return { ok: true, status: 200, json: async () => ({ sha, content: encodeBase64Utf8(serializeStars(doc)) }) };
    }
    const failure = failPutsWith.shift();
    if (failure) return { ok: false, status: failure, json: async () => ({ message: 'nope' }) };
    const body = JSON.parse(opts.body);
    if (body.sha !== sha) return { ok: false, status: 409, json: async () => ({ message: 'sha mismatch' }) };
    doc = JSON.parse(decodeBase64Utf8(body.content));
    sha = sha + 'x';
    return { ok: true, status: 200, json: async () => ({ content: { sha } }) };
  };
  return { fetch, calls, get doc() { return doc; } };
}

const repo = { owner: 'willieshaw', repo: 'marmalade-orbit', path: 'data/stars.json', token: 'TEST' };

test('client.update reads, mutates and PUTs with sha + auth header', async () => {
  const gh = fakeGitHub({ stars: [] });
  const client = createClient({ ...repo, fetch: gh.fetch });
  const result = await client.update(d => appendStar(d, { id: 'a', label: 'Laundry ⭐', date: '2026-10-13' }), 'Star: Laundry');
  assert.deepEqual(gh.doc.stars.map(s => s.label), ['Laundry ⭐']);
  assert.deepEqual(result.stars.map(s => s.id), ['a']);
  const put = gh.calls.find(c => c.method === 'PUT');
  assert.equal(put.url, 'https://api.github.com/repos/willieshaw/marmalade-orbit/contents/data/stars.json');
  assert.equal(put.headers.Authorization, 'Bearer TEST');
  const body = JSON.parse(put.body);
  assert.equal(body.message, 'Star: Laundry');
  assert.equal(body.sha, 'sha1');
});

test('client.update retries once on a stale sha (409)', async () => {
  const gh = fakeGitHub({ stars: [] }, { failPutsWith: [409] });
  const client = createClient({ ...repo, fetch: gh.fetch });
  await client.update(d => appendStar(d, { id: 'a', label: 'x', date: 'd' }), 'm');
  assert.equal(gh.doc.stars.length, 1);
  assert.equal(gh.calls.filter(c => c.method === 'PUT').length, 2);
});

test('client.update surfaces auth errors without retrying', async () => {
  const gh = fakeGitHub({ stars: [] }, { failPutsWith: [401] });
  const client = createClient({ ...repo, fetch: gh.fetch });
  await assert.rejects(client.update(d => d, 'm'), err => err.status === 401);
  assert.equal(gh.calls.filter(c => c.method === 'PUT').length, 1);
});

test('client GETs bypass caches', async () => {
  const gh = fakeGitHub({ stars: [] });
  const client = createClient({ ...repo, fetch: gh.fetch });
  await client.read();
  assert.equal(gh.calls[0].cache, 'no-store');
});

import { editStar, deleteStar, setRules, markRedeemed, unmarkRedeemed } from '../js/github.js';

const twoStars = () => ({ stars: [
  { id: 'a', label: 'Laundry', date: '2026-10-01' },
  { id: 'b', label: 'Dentist', date: '2026-10-02' },
] });

test('editStar patches one star by id and trims the label', () => {
  const doc = twoStars();
  const out = editStar(doc, 'b', { label: '  Dentist ✔ ', date: '2026-10-03' });
  assert.deepEqual(out.stars[1], { id: 'b', label: 'Dentist ✔', date: '2026-10-03' });
  assert.equal(doc.stars[1].label, 'Dentist');
});

test('editStar refuses an empty label and an unknown id', () => {
  assert.throws(() => editStar(twoStars(), 'a', { label: ' ' }), /label/i);
  assert.throws(() => editStar(twoStars(), 'zzz', { label: 'x' }), /not found/i);
});

test('deleteStar removes by id', () => {
  assert.deepEqual(deleteStar(twoStars(), 'a').stars.map(s => s.id), ['b']);
  assert.deepEqual(deleteStar(twoStars(), 'zzz').stars.map(s => s.id), ['a', 'b']);
});

test('setRules replaces rules and keeps redeemed', () => {
  const out = setRules({ rules: [], redeemed: ['d@10'] }, [{ id: 'd', kind: 'every', every: 10, reward: 'x' }]);
  assert.equal(out.rules.length, 1);
  assert.deepEqual(out.redeemed, ['d@10']);
});

test('markRedeemed is idempotent and unmarkRedeemed removes', () => {
  const once = markRedeemed({ rules: [] }, 'd@10');
  const twice = markRedeemed(once, 'd@10');
  assert.deepEqual(twice.redeemed, ['d@10']);
  assert.deepEqual(unmarkRedeemed(twice, 'd@10').redeemed, []);
});

test('client.update creates the file when it does not exist yet', async () => {
  const calls = [];
  let created = null;
  const fetch = async (url, opts = {}) => {
    calls.push(opts.method || 'GET');
    if ((opts.method || 'GET') === 'GET') {
      if (!created) return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
      return { ok: true, status: 200, json: async () => ({ sha: 'k1', content: encodeBase64Utf8(serializeStars(created)) }) };
    }
    const body = JSON.parse(opts.body);
    assert.equal(body.sha, undefined);
    created = JSON.parse(decodeBase64Utf8(body.content));
    return { ok: true, status: 201, json: async () => ({}) };
  };
  const client = createClient({ ...repo, path: 'data/key.json', fetch });
  const out = await client.update(doc => ({ ...(doc || {}), v: 1 }), 'Set password');
  assert.deepEqual(out, { v: 1 });
  assert.deepEqual(created, { v: 1 });
  assert.deepEqual(calls, ['GET', 'PUT']);
});

test('client.read still throws on a missing file', async () => {
  const fetch = async () => ({ ok: false, status: 404, json: async () => ({ message: 'Not Found' }) });
  const client = createClient({ ...repo, fetch });
  await assert.rejects(client.read(), err => err.status === 404);
});

import { makeStars, appendStars } from '../js/github.js';

test('makeStars turns each non-blank label into its own star with a unique id', () => {
  const now = new Date(2026, 9, 15, 9, 0);
  const stars = makeStars({ labels: [' Dishes ', '', 'Laundry', '   ', 'Gym'], now });
  assert.deepEqual(stars.map(s => s.label), ['Dishes', 'Laundry', 'Gym']);
  assert.ok(stars.every(s => s.date === '2026-10-15'));
  assert.equal(new Set(stars.map(s => s.id)).size, 3);
});

test('makeStars needs at least one label', () => {
  assert.throws(() => makeStars({ labels: ['', '  '] }), /label/i);
});

test('appendStars adds several stars in order without mutating', () => {
  const doc = { stars: [{ id: 'a', label: 'x', date: 'd' }] };
  const out = appendStars(doc, [{ id: 'b', label: 'y', date: 'd' }, { id: 'c', label: 'z', date: 'd' }]);
  assert.deepEqual(out.stars.map(s => s.id), ['a', 'b', 'c']);
  assert.equal(doc.stars.length, 1);
});
