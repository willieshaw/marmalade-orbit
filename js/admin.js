// The teacher's desk: Willie's secret admin mode for awarding stars.
// The GitHub token lives only in this browser's localStorage.

import { config } from './config.js';
import { createClient, makeStar, appendStar, removeLastStar } from './github.js';

const TOKEN_KEY = 'mo.token';
const $ = id => document.getElementById(id);

export function storedToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function clientFor(token) {
  return createClient({ owner: config.owner, repo: config.repo, path: config.starsPath, token });
}

function friendly(err) {
  if (err.status === 401) return 'That token was rejected. Unlock again with a fresh one.';
  if (err.status === 403 || err.status === 404) return 'The token can’t write to this repo. Check its repository access and Contents permission.';
  if (err instanceof TypeError) return 'No connection. Try again in a sec.';
  return `Hmm, that didn’t save (${err.message}).`;
}

/**
 * hooks:
 *   currentStars()            -> array of stars on screen
 *   award(star)               -> plays the slap; returns a promise
 *   commit(stars)             -> replace the stars on screen with the saved list
 *   note(kicker, label)       -> show a sticky note
 */
export function initAdmin(hooks) {
  const desk = $('desk');
  const tokenForm = $('token-form');
  const awardForm = $('award-form');
  const msg = $('desk-msg');
  let client = storedToken() ? clientFor(storedToken()) : null;

  const say = (text, isError = false) => {
    msg.textContent = text;
    msg.classList.toggle('error', isError);
  };

  function showForms() {
    tokenForm.hidden = !!client;
    awardForm.hidden = !client;
  }

  function open() {
    showForms();
    say('');
    desk.hidden = false;
    (client ? $('label-input') : $('token-input')).focus();
  }

  function close() {
    desk.hidden = true;
    if (location.hash === '#admin') history.replaceState(null, '', location.pathname + location.search);
  }

  function lock() {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
    client = null;
    showForms();
    say('Locked. The token is gone from this phone.');
  }

  $('desk-close').addEventListener('click', close);
  $('lock').addEventListener('click', lock);

  tokenForm.addEventListener('submit', async e => {
    e.preventDefault();
    const token = $('token-input').value.trim();
    if (!token) return;
    const candidate = clientFor(token);
    say('Checking…');
    try {
      await candidate.read();
    } catch (err) {
      say(friendly(err), true);
      return;
    }
    try { localStorage.setItem(TOKEN_KEY, token); } catch {}
    $('token-input').value = '';
    client = candidate;
    showForms();
    say('Unlocked. Go hand out some stars.');
    $('label-input').focus();
  });

  awardForm.addEventListener('submit', async e => {
    e.preventDefault();
    let star;
    try {
      star = makeStar({ label: $('label-input').value });
    } catch {
      say('Write what she did first.', true);
      return;
    }
    const before = hooks.currentStars();
    const button = awardForm.querySelector('button[type=submit]');
    button.disabled = true;
    $('label-input').value = '';
    close();

    const saving = client.update(doc => appendStar(doc, star), `Star: ${star.label}`);
    await hooks.award(star);
    try {
      const saved = await saving;
      hooks.commit(saved.stars);
      hooks.note('Saved!', `${config.herName} will see it in about a minute.`);
    } catch (err) {
      hooks.commit(before);
      if (err.status === 401) lock();
      open();
      $('label-input').value = star.label;
      say(friendly(err), true);
    } finally {
      button.disabled = false;
    }
  });

  $('undo').addEventListener('click', async () => {
    const stars = hooks.currentStars();
    const last = stars[stars.length - 1];
    if (!last) { say('No stars to undo.'); return; }
    if (!confirm(`Peel off the last star, “${last.label}”?`)) return;
    say('Peeling…');
    try {
      const saved = await client.update(removeLastStar, `Undo star: ${last.label}`);
      hooks.commit(saved.stars);
      say(`Removed “${last.label}”.`);
    } catch (err) {
      if (err.status === 401) lock();
      say(friendly(err), true);
    }
  });

  return {
    open,
    get unlocked() { return !!client; },
    read: () => client.read(),
  };
}
