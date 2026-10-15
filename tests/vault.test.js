import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptToken, decryptToken, passwordProblem, DEFAULT_ITERATIONS } from '../js/vault.js';

// Low iteration count keeps the tests fast; the site uses DEFAULT_ITERATIONS.
const fast = { iterations: 1000 };
const TOKEN = 'github_pat_FAKE_test_value_123';

test('the site default uses a slow key derivation', () => {
  assert.ok(DEFAULT_ITERATIONS >= 600000);
});

test('encrypt then decrypt with the right password gives the token back', async () => {
  const record = await encryptToken(TOKEN, 'pickle harbor violet mango', fast);
  assert.equal(await decryptToken(record, 'pickle harbor violet mango'), TOKEN);
});

test('the stored record never contains the token or the password', async () => {
  const record = await encryptToken(TOKEN, 'pickle harbor violet mango', fast);
  const json = JSON.stringify(record);
  assert.ok(!json.includes('github_pat'));
  assert.ok(!json.includes('pickle'));
  assert.deepEqual(Object.keys(record).sort(), ['ct', 'iterations', 'iv', 'kdf', 'salt', 'v']);
  assert.equal(record.iterations, 1000);
});

test('a wrong password is rejected', async () => {
  const record = await encryptToken(TOKEN, 'pickle harbor violet mango', fast);
  await assert.rejects(decryptToken(record, 'pickle harbor violet mangos'), /wrong password/i);
});

test('each encryption uses a fresh salt and iv', async () => {
  const a = await encryptToken(TOKEN, 'pickle harbor violet mango', fast);
  const b = await encryptToken(TOKEN, 'pickle harbor violet mango', fast);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
});

test('a malformed record is rejected cleanly', async () => {
  await assert.rejects(decryptToken({ v: 1 }, 'whatever password'), /wrong password|unreadable/i);
  await assert.rejects(decryptToken(null, 'whatever password'), /unreadable/i);
});

test('passwordProblem wants at least 12 characters', () => {
  assert.match(passwordProblem('short'), /12/);
  assert.match(passwordProblem('   eleven   '), /12/);
  assert.equal(passwordProblem('pickle-harbor-violet'), null);
});
