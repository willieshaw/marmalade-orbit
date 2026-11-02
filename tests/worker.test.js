import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeBase64Utf8, decodeBase64Utf8, serializeStars } from '../js/github.js';
import { handle, githubFetch } from '../worker/index.js';

const KEY = 'k'.repeat(40);
const env = { STAR_KEY: KEY, GITHUB_TOKEN: 'TEST', TIME_ZONE: 'America/New_York' };
const NOW = new Date('2026-11-02T04:30:00Z'); // 11:30pm on Nov 1 in New York
const MIN = 60_000;

function fakeGitHub({ stars = [], rules = [], redeemed = [], failPutsWith = [] } = {}) {
  const files = {
    'data/stars.json': { doc: { stars }, sha: 'sha1' },
    'data/rewards.json': { doc: { rules, redeemed }, sha: 'sha1' },
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
  return {
    fetch,
    puts,
    get stars() { return files['data/stars.json'].doc.stars; },
    get rewards() { return files['data/rewards.json'].doc; },
  };
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

test('undo removes the newest star, whoever added it', async () => {
  const gh = fakeGitHub({ stars: [{ id: 'a', label: 'From the desk', date: '2026-10-15' }] });
  await tool(gh, 'add_stars', { labels: ['Dishes'] });
  assert.equal((await tool(gh, 'undo_last_star')).isError, false);
  assert.match((await tool(gh, 'undo_last_star')).text, /From the desk/);
  assert.deepEqual(gh.stars, []);
  assert.deepEqual(gh.puts.slice(-2), ['Undo star: Dishes', 'Undo star: From the desk']);
  assert.equal((await tool(gh, 'undo_last_star')).isError, true);
});

const twoStars = () => [
  { id: 'a', label: 'Went to bed early', date: '2026-10-15' },
  { id: 'b', label: 'Did the dishes', date: '2026-10-20' },
];

test('list_stars shows ids, newest first, and can search without writing', async () => {
  const gh = fakeGitHub({ stars: twoStars() });
  const all = (await tool(gh, 'list_stars')).text;
  assert.ok(all.indexOf('Did the dishes') < all.indexOf('Went to bed early'));
  assert.match(all, /\ba\b/);
  const hit = (await tool(gh, 'list_stars', { query: 'DISHES' })).text;
  assert.match(hit, /Did the dishes/);
  assert.doesNotMatch(hit, /Went to bed/);
  assert.match((await tool(gh, 'list_stars', { query: 'nothing like this' })).text, /no stars/i);
  assert.equal(gh.puts.length, 0);
});

test('edit_star changes the label or date of any star', async () => {
  const gh = fakeGitHub({ stars: twoStars() });
  assert.equal((await tool(gh, 'edit_star', { id: 'a', label: ' Bed by 10pm ' })).isError, false);
  assert.equal((await tool(gh, 'edit_star', { id: 'a', date: '2026-10-16' })).isError, false);
  assert.deepEqual(gh.stars[0], { id: 'a', label: 'Bed by 10pm', date: '2026-10-16' });
  assert.equal(gh.stars[1].label, 'Did the dishes');
  assert.ok(gh.puts.includes('Edit star: Bed by 10pm'));
});

test('edit_star refuses bad changes and writes nothing', async () => {
  const gh = fakeGitHub({ stars: twoStars() });
  for (const args of [
    { id: 'nope', label: 'x' },
    { id: 'a' },
    { id: 'a', label: '   ' },
    { id: 'a', label: 'x'.repeat(81) },
    { id: 'a', date: '2026-11-02' },
    { id: 'a', date: 'yesterday' },
    { label: 'x' },
  ]) {
    assert.equal((await tool(gh, 'edit_star', args)).isError, true, JSON.stringify(args));
  }
  assert.equal(gh.puts.length, 0);
});

test('delete_star removes any star by id, and refuses an unknown id', async () => {
  const gh = fakeGitHub({ stars: twoStars() });
  assert.match((await tool(gh, 'delete_star', { id: 'a' })).text, /Went to bed early/);
  assert.deepEqual(gh.stars.map(s => s.id), ['b']);
  assert.deepEqual(gh.puts, ['Delete star: Went to bed early']);
  assert.equal((await tool(gh, 'delete_star', { id: 'a' })).isError, true);
  assert.equal(gh.puts.length, 1);
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

const dessert = { id: 'r1', kind: 'every', every: 2, reward: 'Dessert' };
const trip = { id: 'r2', kind: 'once', at: 100, reward: 'Weekend trip' };
const fourStars = () => ['a', 'b', 'c', 'd'].map(id => ({ id, label: id, date: '2026-10-01' }));

test('add_reward adds one-off and repeating rewards and keeps what is redeemed', async () => {
  const gh = fakeGitHub({ redeemed: ['old@10'] });
  assert.equal((await tool(gh, 'add_reward', { kind: 'every', stars: 10, reward: ' Dessert ' })).isError, false);
  assert.equal((await tool(gh, 'add_reward', { kind: 'once', stars: 100, reward: 'Weekend trip' })).isError, false);
  const [every, once] = gh.rewards.rules;
  assert.deepEqual([every.kind, every.every, every.reward], ['every', 10, 'Dessert']);
  assert.deepEqual([once.kind, once.at, once.reward], ['once', 100, 'Weekend trip']);
  assert.notEqual(every.id, once.id);
  assert.deepEqual(gh.rewards.redeemed, ['old@10']);
  assert.ok(gh.puts.includes('Add reward: Dessert'));
});

test('add_reward refuses bad rewards and repeats, and writes nothing', async () => {
  const gh = fakeGitHub({ rules: [dessert, trip] });
  for (const args of [
    { kind: 'sometimes', stars: 10, reward: 'x' },
    { kind: 'once', stars: 0, reward: 'x' },
    { kind: 'once', stars: 1.5, reward: 'x' },
    { kind: 'once', stars: 5, reward: '   ' },
    { kind: 'once', stars: 5, reward: 'x'.repeat(81) },
    { kind: 'once', stars: 100, reward: 'Another at the same spot' },
    { kind: 'every', stars: 2, reward: 'Dessert' },
  ]) {
    assert.equal((await tool(gh, 'add_reward', args)).isError, true, JSON.stringify(args));
  }
  assert.equal(gh.puts.length, 0);
});

test('edit_reward changes any part of a reward, delete_reward removes it', async () => {
  const gh = fakeGitHub({ rules: [dessert, trip] });
  await tool(gh, 'edit_reward', { id: 'r1', stars: 5, reward: 'Fancy dessert' });
  assert.deepEqual(gh.rewards.rules[0], { id: 'r1', kind: 'every', every: 5, reward: 'Fancy dessert' });
  await tool(gh, 'edit_reward', { id: 'r2', kind: 'every' });
  assert.deepEqual(gh.rewards.rules[1], { id: 'r2', kind: 'every', every: 100, reward: 'Weekend trip' });
  assert.match((await tool(gh, 'delete_reward', { id: 'r1' })).text, /Fancy dessert/);
  assert.deepEqual(gh.rewards.rules.map(r => r.id), ['r2']);
  assert.equal((await tool(gh, 'delete_reward', { id: 'r1' })).isError, true);
  assert.equal((await tool(gh, 'edit_reward', { id: 'nope', reward: 'x' })).isError, true);
  assert.equal((await tool(gh, 'edit_reward', { id: 'r2' })).isError, true);
});

test('list_rewards shows the rules, ids and what is owed or redeemed', async () => {
  const gh = fakeGitHub({ stars: fourStars(), rules: [dessert, trip], redeemed: ['r1@2'] });
  const { text } = await tool(gh, 'list_rewards');
  assert.match(text, /Every 2 stars: Dessert \(id: r1\)/);
  assert.match(text, /Once at 100 stars: Weekend trip \(id: r2\)/);
  assert.match(text, /Owed: Dessert ×1/);
  assert.match(text, /Redeemed: Dessert ×1/);
  assert.equal(gh.puts.length, 0);
  assert.match((await tool(fakeGitHub(), 'list_rewards')).text, /no rewards/i);
});

test('redeeming takes the oldest owed payout, and undoing the newest redeemed', async () => {
  const gh = fakeGitHub({ stars: fourStars(), rules: [dessert] });
  await tool(gh, 'redeem_reward', { id: 'r1' });
  await tool(gh, 'redeem_reward', { id: 'r1' });
  assert.deepEqual(gh.rewards.redeemed, ['r1@2', 'r1@4']);
  assert.equal((await tool(gh, 'redeem_reward', { id: 'r1' })).isError, true);
  await tool(gh, 'unredeem_reward', { id: 'r1' });
  assert.deepEqual(gh.rewards.redeemed, ['r1@2']);
  assert.ok(gh.puts.includes('Redeemed: Dessert (2★)'));
  assert.ok(gh.puts.includes('Un-redeemed: Dessert (4★)'));
});

test('unredeem and redeem refuse when there is nothing to change', async () => {
  const gh = fakeGitHub({ stars: fourStars(), rules: [dessert] });
  assert.equal((await tool(gh, 'unredeem_reward', { id: 'r1' })).isError, true);
  assert.equal((await tool(gh, 'redeem_reward', { id: 'nope' })).isError, true);
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
  assert.deepEqual(list.result.tools.map(t => t.name).sort(), [
    'add_reward', 'add_stars', 'delete_reward', 'delete_star', 'edit_reward', 'edit_star', 'list_rewards',
    'list_stars', 'redeem_reward', 'star_status', 'undo_last_star', 'unredeem_reward',
  ]);
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
  assert.match(await (await postForm(gh, '/undo', {})).text(), /Peeled off/);
  assert.equal(gh.stars.length, 0);
  assert.match(await (await postForm(gh, '/undo', {})).text(), /empty/i);
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
