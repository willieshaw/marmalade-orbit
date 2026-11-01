import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeBase64Utf8, decodeBase64Utf8, serializeStars } from '../js/github.js';
import { handle, githubFetch } from '../worker/index.js';

const KEY = 'k'.repeat(40);
const env = { STAR_KEY: KEY, GITHUB_TOKEN: 'TEST', TIME_ZONE: 'America/New_York' };
const NOW = new Date('2026-11-02T04:30:00Z'); // 11:30pm on Nov 1 in New York
const MIN = 60_000;

function fakeGitHub({ stars = [], rules = [], failPutsWith = [] } = {}) {
  const files = {
    'data/stars.json': { doc: { stars }, sha: 'sha1' },
    'data/rewards.json': { doc: { rules, redeemed: [] }, sha: 'sha1' },
  };
  const puts = [];
  const fetch = async (url, opts = {}) => {
    const file = files[url.split('/contents/')[1]];
    if ((opts.method || 'GET') === 'GET') {
      return { ok: true, status: 200, json: async () => ({ sha: file.sha, content: encodeBase64Utf8(serializeStars(file.doc)) }) };
    }
    const failure = failPutsWith.shift();
    if (failure) return { ok: false, status: failure, json: async () => ({ message: 'nope' }) };
    const body = JSON.parse(opts.body);
    file.doc = JSON.parse(decodeBase64Utf8(body.content));
    file.sha += 'x';
    puts.push(body.message);
    return { ok: true, status: 200, json: async () => ({}) };
  };
  return { fetch, puts, get stars() { return files['data/stars.json'].doc.stars; } };
}

const call = (gh, path, init, now = NOW) =>
  handle(new Request(`https://stars.test${path}`, init), env, { fetch: gh.fetch, now });

let rpcId = 0;
async function rpc(gh, method, params, now) {
  const res = await call(gh, `/k/${KEY}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  }, now);
  return res.json();
}

async function tool(gh, name, args = {}, now) {
  const { result } = await rpc(gh, 'tools/call', { name, arguments: args }, now);
  return { text: result.content[0].text, isError: Boolean(result.isError) };
}

const postForm = (gh, path, fields, now) =>
  call(gh, `/k/${KEY}${path}`, { method: 'POST', body: new URLSearchParams(fields) }, now);

test('a wrong or missing key gets a 404 on every route and writes nothing', async () => {
  const gh = fakeGitHub();
  for (const path of ['/', '/k', '/k/wrong', '/k/wrong/mcp', '/k/wrong/stars', `/k/${KEY}x`, `/k/${KEY}/nope`]) {
    assert.equal((await call(gh, path, { method: 'POST' })).status, 404, path);
  }
  assert.equal(gh.puts.length, 0);
});

test('with no key configured, or a short one, nothing is reachable', async () => {
  const gh = fakeGitHub();
  for (const STAR_KEY of [undefined, '', 'short']) {
    const res = await handle(new Request(`https://stars.test/k/${STAR_KEY}`), { ...env, STAR_KEY }, { fetch: gh.fetch, now: NOW });
    assert.equal(res.status, 404);
  }
});

test('opening the page shows the form and never awards a star', async () => {
  const gh = fakeGitHub();
  const res = await call(gh, `/k/${KEY}`, { method: 'GET' });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /text\/html/);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer');
  assert.match(await res.text(), /<form/);
  assert.equal(gh.puts.length, 0);
});

test('add_stars awards a star dated in New York and tagged as an agent star', async () => {
  const gh = fakeGitHub();
  const { text, isError } = await tool(gh, 'add_stars', { labels: [' Did the dishes '] });
  assert.equal(isError, false);
  assert.equal(gh.stars.length, 1);
  assert.equal(gh.stars[0].label, 'Did the dishes');
  assert.equal(gh.stars[0].date, '2026-11-01');
  assert.equal(gh.stars[0].source, 'agent');
  assert.deepEqual(gh.puts, ['Star: Did the dishes']);
  assert.match(text, /Star #1/);
});

test('add_stars awards several at once under one commit', async () => {
  const gh = fakeGitHub();
  await tool(gh, 'add_stars', { labels: ['Dishes', 'Laundry'] });
  assert.deepEqual(gh.stars.map(s => s.label), ['Dishes', 'Laundry']);
  assert.deepEqual(gh.puts, ['Stars (2): Dishes, Laundry']);
});

test('add_stars takes a past date but refuses the future and non-dates', async () => {
  const gh = fakeGitHub();
  await tool(gh, 'add_stars', { labels: ['Yesterday'], date: '2026-10-31' });
  assert.equal(gh.stars[0].date, '2026-10-31');
  for (const date of ['2026-11-02', 'yesterday', '2026-13-40', '2026-02-30']) {
    assert.equal((await tool(gh, 'add_stars', { labels: ['Nope'], date })).isError, true, date);
  }
  assert.equal(gh.stars.length, 1);
});

test('add_stars enforces the limits and strips control characters', async () => {
  const gh = fakeGitHub();
  assert.equal((await tool(gh, 'add_stars', { labels: [] })).isError, true);
  assert.equal((await tool(gh, 'add_stars', { labels: ['   '] })).isError, true);
  assert.equal((await tool(gh, 'add_stars', { labels: 'Dishes' })).isError, true);
  assert.equal((await tool(gh, 'add_stars', { labels: ['x'.repeat(81)] })).isError, true);
  assert.equal((await tool(gh, 'add_stars', { labels: Array(11).fill('x') })).isError, true);
  assert.equal(gh.stars.length, 0);
  await tool(gh, 'add_stars', { labels: ['Di\u0000sh\nes'] });
  assert.equal(gh.stars[0].label, 'Dishes');
});

test('an immediate retry does not double-award, but a later repeat does', async () => {
  const gh = fakeGitHub();
  await tool(gh, 'add_stars', { labels: ['Dishes', 'Laundry'] });
  const retry = await tool(gh, 'add_stars', { labels: ['Dishes', 'Laundry'] }, new Date(NOW.getTime() + MIN));
  assert.equal(retry.isError, false);
  assert.match(retry.text, /already/i);
  assert.equal(gh.stars.length, 2);
  await tool(gh, 'add_stars', { labels: ['Dishes', 'Laundry'] }, new Date(NOW.getTime() + 3 * MIN));
  assert.equal(gh.stars.length, 4);
});

test('the same label from the desk moments ago is not treated as a retry', async () => {
  const gh = fakeGitHub({ stars: [{ id: 'a', label: 'Dishes', date: '2026-11-01' }] });
  await tool(gh, 'add_stars', { labels: ['Dishes'] });
  assert.equal(gh.stars.length, 2);
});

test('undo removes agent stars and stops at the first desk star', async () => {
  const gh = fakeGitHub({ stars: [{ id: 'a', label: 'From the desk', date: '2026-10-15' }] });
  await tool(gh, 'add_stars', { labels: ['Dishes', 'Laundry'] });
  assert.equal((await tool(gh, 'undo_last_star')).isError, false);
  assert.equal((await tool(gh, 'undo_last_star')).isError, false);
  assert.deepEqual(gh.stars.map(s => s.label), ['From the desk']);
  assert.equal((await tool(gh, 'undo_last_star')).isError, true);
  assert.deepEqual(gh.stars.map(s => s.label), ['From the desk']);
  assert.ok(gh.puts.includes('Undo star: Laundry'));
});

test('replies count towards the next reward and announce one just earned', async () => {
  const rules = [{ id: 'r1', kind: 'every', every: 3, reward: 'dessert of her choice' }];
  const gh = fakeGitHub({ rules });
  assert.match((await tool(gh, 'add_stars', { labels: ['A'] })).text, /2 more until dessert of her choice/);
  assert.match((await tool(gh, 'add_stars', { labels: ['B'] })).text, /1 more until dessert of her choice/);
  assert.match((await tool(gh, 'add_stars', { labels: ['C'] })).text, /earned.*dessert of her choice/i);
});

test('star_status reports the total and recent stars without writing', async () => {
  const gh = fakeGitHub({ stars: [{ id: 'a', label: 'From the desk', date: '2026-10-15' }] });
  const { text } = await tool(gh, 'star_status');
  assert.match(text, /1 star/);
  assert.match(text, /From the desk/);
  assert.equal(gh.puts.length, 0);
});

test('a stale write retries, and a GitHub failure comes back as a tool error', async () => {
  const retried = fakeGitHub({ failPutsWith: [409] });
  await tool(retried, 'add_stars', { labels: ['Dishes'] });
  assert.equal(retried.stars.length, 1);
  const broken = fakeGitHub({ failPutsWith: [401] });
  const { isError, text } = await tool(broken, 'add_stars', { labels: ['Dishes'] });
  assert.equal(isError, true);
  assert.doesNotMatch(text, /TEST/);
});

test('MCP initialize, tools/list, notifications and errors follow the protocol', async () => {
  const gh = fakeGitHub();
  const init = await rpc(gh, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.ok(init.result.capabilities.tools);
  const old = await rpc(gh, 'initialize', { protocolVersion: '1999-01-01' });
  assert.match(old.result.protocolVersion, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(old.result.protocolVersion, '1999-01-01');
  const list = await rpc(gh, 'tools/list');
  assert.deepEqual(list.result.tools.map(t => t.name).sort(), ['add_stars', 'star_status', 'undo_last_star']);
  assert.ok(list.result.tools.every(t => t.description && t.inputSchema));
  assert.deepEqual((await rpc(gh, 'ping')).result, {});
  assert.equal((await rpc(gh, 'nope')).error.code, -32601);
  assert.equal((await rpc(gh, 'tools/call', { name: 'nope' })).error.code, -32602);
  const note = await call(gh, `/k/${KEY}/mcp`, { method: 'POST', body: '{"jsonrpc":"2.0","method":"notifications/initialized"}' });
  assert.equal(note.status, 202);
  const bad = await call(gh, `/k/${KEY}/mcp`, { method: 'POST', body: 'not json' });
  assert.equal((await bad.json()).error.code, -32700);
  assert.equal((await call(gh, `/k/${KEY}/mcp`, { method: 'GET' })).status, 405);
});

test('the page form awards one star per line and shows the result', async () => {
  const gh = fakeGitHub();
  const res = await postForm(gh, '/stars', { labels: 'Dishes\n\nLaundry\n' });
  assert.equal(res.status, 200);
  assert.deepEqual(gh.stars.map(s => s.label), ['Dishes', 'Laundry']);
  assert.match(await res.text(), /2 new stars/i);
});

test('the page form can undo, and shows a refusal as a message', async () => {
  const gh = fakeGitHub({ stars: [{ id: 'a', label: 'From the desk', date: '2026-10-15' }] });
  const res = await postForm(gh, '/undo', {});
  assert.equal(res.status, 200);
  assert.match(await res.text(), /desk/i);
  assert.equal(gh.stars.length, 1);
});

test('the page escapes whatever it shows', async () => {
  const gh = fakeGitHub();
  const html = await (await postForm(gh, '/stars', { labels: '<script>alert(1)</script>' })).text();
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&#60;script&#62;/);
});

test('calls to GitHub carry the User-Agent it requires', async () => {
  let seen;
  const send = githubFetch(async (url, opts) => { seen = opts; return { ok: true }; });
  await send('https://api.github.com/x', { headers: { Accept: 'a' }, cache: 'no-store' });
  assert.equal(seen.headers.Accept, 'a');
  assert.ok(seen.headers['User-Agent']);
});
