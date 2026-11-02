// A tiny Cloudflare Worker so hosted agents can award stars. It holds the GitHub
// token; everything it serves sits behind a secret key in the URL path.

import { handleMcp } from './mcp.js';
import { renderPage } from './page.js';
import { StarError } from './clean.js';
import { createDesk } from './stars.js';

const ROUTE = /^\/k\/([^/]+)(?:\/(mcp|stars|undo))?\/?$/;
const MIN_KEY_LENGTH = 32;
const UNSURE = "The chart didn't answer, so I can't be sure that saved. Trying again is safe.";

const CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
const notAllowed = allow => new Response(null, { status: 405, headers: { Allow: allow } });

const html = body => new Response(body, {
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex',
    'Content-Security-Policy': CSP,
  },
});

async function sameKey(given, expected) {
  if (typeof expected !== 'string' || expected.length < MIN_KEY_LENGTH) return false;
  const digest = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  return a.reduce((diff, byte, i) => diff | (byte ^ b[i]), 0) === 0;
}

// Browsers add a User-Agent on their own. GitHub rejects requests without one.
export const githubFetch = send => (url, opts = {}) =>
  send(url, { ...opts, headers: { ...opts.headers, 'User-Agent': 'marmalade-orbit-stars' } });

async function attempt(action) {
  try {
    return { text: await action(), isError: false };
  } catch (err) {
    return { text: err instanceof StarError ? err.message : UNSURE, isError: true };
  }
}

export async function handle(request, env, { fetch, now = new Date() }) {
  const route = new URL(request.url).pathname.match(ROUTE);
  if (!route || !(await sameKey(route[1], env.STAR_KEY))) return notFound();

  const [, key, section] = route;
  const base = `/k/${key}`;
  const desk = createDesk({ fetch, token: env.GITHUB_TOKEN, timeZone: env.TIME_ZONE, now });

  if (section === 'mcp') {
    const tools = {
      add_stars: desk.add,
      undo_last_star: desk.undo,
      list_stars: desk.list,
      edit_star: desk.edit,
      delete_star: desk.remove,
      list_rewards: desk.listRewards,
      add_reward: desk.addReward,
      edit_reward: desk.editReward,
      delete_reward: desk.deleteReward,
      redeem_reward: desk.redeemReward,
      unredeem_reward: desk.unredeemReward,
      star_status: desk.status,
    };
    return handleMcp(request, (name, args) => attempt(() => tools[name](args)));
  }
  if (!section) return request.method === 'GET' ? html(renderPage({ base })) : notAllowed('GET');
  if (request.method !== 'POST') return notAllowed('POST');

  if (section === 'undo') return html(renderPage({ base, note: await attempt(desk.undo) }));
  const form = await request.formData();
  const labels = String(form.get('labels') ?? '').split(/\r?\n/);
  const note = await attempt(() => desk.add({ labels, date: form.get('date') }));
  return html(renderPage({ base, note: { ...note, celebrate: !note.isError } }));
}

export default {
  fetch: (request, env) => handle(request, env, { fetch: githubFetch(fetch) }),
};
