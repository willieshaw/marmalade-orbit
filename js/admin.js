// The teacher's desk: Willie's secret admin mode.
// Award tab: hand out stars. Stars tab: fix or delete any star. Rewards tab: edit rules, mark redeemed.
// The GitHub token lives only in this browser's localStorage.

import { config } from './config.js';
import {
  createClient, makeStar, appendStar, removeLastStar, editStar, deleteStar,
  setRules, markRedeemed, unmarkRedeemed,
} from './github.js';
import { normalizeRewardsDoc, occurrences, owed, groupByRule, validateRules } from './rewards.js';
import { encryptToken, decryptToken, passwordProblem } from './vault.js';

const TOKEN_KEY = 'mo.token';
const MAX_STAR_ROWS = 100;
const $ = id => document.getElementById(id);

export function storedToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

function clientsFor(token) {
  const base = { owner: config.owner, repo: config.repo, token };
  return {
    stars: createClient({ ...base, path: config.starsPath }),
    rewards: createClient({ ...base, path: config.rewardsPath }),
    key: createClient({ ...base, path: config.keyPath }),
  };
}

function friendly(err) {
  if (err.status === 401) return 'That token was rejected. Unlock again with a fresh one.';
  if (err.status === 403 || err.status === 404) return 'The token can’t write to this repo. Check its repository access and Contents permission.';
  if (err instanceof TypeError) return 'No connection. Try again in a sec.';
  return `Hmm, that didn’t save (${err.message}).`;
}

const el = (tag, { dataset, ...props } = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(node.dataset, dataset);
  node.append(...children);
  return node;
};

// The encrypted token, if Willie has set a password. Public, so no token is needed to read it.
async function fetchKeyRecord() {
  try {
    const res = await fetch(`${config.keyPath}?t=${Date.now()}`, { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const newRuleId = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/**
 * hooks:
 *   currentStars()        -> stars on screen
 *   currentRewards()      -> { rules, redeemed }
 *   award(star)           -> plays the slap; returns a promise
 *   commit(stars)         -> replace the stars on screen with the saved list
 *   commitRewards(doc)    -> replace the rewards on screen with the saved doc
 *   note(kicker, label)   -> show a sticky note
 */
export function initAdmin(hooks) {
  const desk = $('desk');
  const tokenForm = $('token-form');
  const tabs = $('desk-tabs');
  const msg = $('desk-msg');
  let clients = storedToken() ? clientsFor(storedToken()) : null;
  let tab = 'award';
  let draft = [];
  let keyRecord = null;
  let preferToken = false;
  const passwordForm = $('password-form');
  const setPasswordForm = $('set-password-form');

  const say = (text, isError = false) => {
    msg.textContent = text;
    msg.classList.toggle('error', isError);
  };

  function showTab(name) {
    tab = name;
    tabs.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    desk.querySelectorAll('.desk-panel').forEach(p => { p.hidden = !clients || p.dataset.panel !== name; });
    say('');
    if (name === 'stars') renderStarList();
    if (name === 'rewards') { draft = hooks.currentRewards().rules.map(r => ({ ...r })); renderRewards(); }
  }

  function showForms() {
    const usePassword = !clients && keyRecord && !preferToken;
    passwordForm.hidden = !usePassword;
    tokenForm.hidden = !!clients || usePassword;
    $('use-password').hidden = !keyRecord;
    tabs.hidden = !clients;
    setPasswordForm.hidden = true;
    $('set-password-toggle').textContent = keyRecord ? 'Change password' : 'Set password';
    showTab(tab);
  }

  async function open() {
    showForms();
    desk.hidden = false;
    if (!clients) {
      keyRecord = await fetchKeyRecord();
      showForms();
      (keyRecord && !preferToken ? $('password-input') : $('token-input')).focus();
    } else if (tab === 'award') {
      $('label-input').focus();
    }
  }

  function close() {
    desk.hidden = true;
    if (location.hash === '#admin') history.replaceState(null, '', location.pathname + location.search);
  }

  function lock() {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
    clients = null;
    showForms();
    say('Locked. The token is gone from this phone.');
  }

  // Runs one save; reports errors in the desk and locks on a rejected token.
  async function save(work, okText) {
    say('Saving…');
    try {
      await work();
      if (okText) say(okText);
      return true;
    } catch (err) {
      if (err.status === 401) lock();
      say(friendly(err), true);
      return false;
    }
  }

  $('desk-close').addEventListener('click', close);
  $('lock').addEventListener('click', lock);
  tabs.addEventListener('click', e => {
    const b = e.target.closest('[role=tab]');
    if (b) showTab(b.dataset.tab);
  });

  // ---------- unlock ----------

  // Turn a token into an unlocked desk, after checking GitHub accepts it.
  async function unlockWith(token, rejectedText) {
    const candidate = clientsFor(token);
    try {
      await candidate.stars.read();
    } catch (err) {
      say(err.status === 401 && rejectedText ? rejectedText : friendly(err), true);
      return false;
    }
    try { localStorage.setItem(TOKEN_KEY, token); } catch {}
    clients = candidate;
    tab = 'award';
    showForms();
    say('Unlocked. Go hand out some stars.');
    $('label-input').focus();
    return true;
  }

  $('use-token').addEventListener('click', () => { preferToken = true; showForms(); say(''); $('token-input').focus(); });
  $('use-password').addEventListener('click', () => { preferToken = false; showForms(); say(''); $('password-input').focus(); });

  passwordForm.addEventListener('submit', async e => {
    e.preventDefault();
    const button = passwordForm.querySelector('button[type=submit]');
    button.disabled = true;
    say('Checking…');
    try {
      const token = await decryptToken(keyRecord, $('password-input').value);
      if (await unlockWith(token, 'Password is right, but GitHub rejected the saved token. It may have expired: unlock with a new token, then set your password again.')) {
        $('password-input').value = '';
      }
    } catch (err) {
      say(err.message, true);
    } finally {
      button.disabled = false;
    }
  });

  $('set-password-toggle').addEventListener('click', () => {
    setPasswordForm.hidden = !setPasswordForm.hidden;
    if (!setPasswordForm.hidden) $('new-password').focus();
  });

  setPasswordForm.addEventListener('submit', async e => {
    e.preventDefault();
    const pw = $('new-password').value;
    if (pw !== $('new-password-2').value) { say('Those two passwords don’t match.', true); return; }
    const problem = passwordProblem(pw);
    if (problem) { say(problem, true); return; }
    const button = setPasswordForm.querySelector('button[type=submit]');
    button.disabled = true;
    say('Locking the token with your password…');
    try {
      const record = await encryptToken(storedToken(), pw);
      const ok = await save(async () => {
        await clients.key.update(() => record, 'Set desk password');
      }, 'Password saved. Use it to unlock on any device (new devices pick it up in about a minute).');
      if (ok) {
        keyRecord = record;
        $('new-password').value = '';
        $('new-password-2').value = '';
        setPasswordForm.hidden = true;
        $('set-password-toggle').textContent = 'Change password';
      }
    } finally {
      button.disabled = false;
    }
  });

  tokenForm.addEventListener('submit', async e => {
    e.preventDefault();
    const token = $('token-input').value.trim();
    if (!token) return;
    say('Checking…');
    if (await unlockWith(token)) $('token-input').value = '';
  });

  // ---------- award ----------

  const awardForm = $('award-form');
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

    const saving = clients.stars.update(doc => appendStar(doc, star), `Star: ${star.label}`);
    saving.catch(() => {}); // handled below, after the animation
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
    await save(async () => {
      const saved = await clients.stars.update(removeLastStar, `Undo star: ${last.label}`);
      hooks.commit(saved.stars);
    }, `Removed “${last.label}”.`);
  });

  // ---------- stars ----------

  function renderStarList() {
    const q = $('star-search').value.trim().toLowerCase();
    const all = hooks.currentStars().map((star, index) => ({ star, index })).reverse();
    const hits = q ? all.filter(({ star }) => star.label.toLowerCase().includes(q) || star.date.includes(q)) : all;
    const rows = hits.slice(0, MAX_STAR_ROWS);
    $('star-count').textContent = hits.length > rows.length
      ? `Showing the newest ${rows.length} of ${hits.length}. Search to narrow it down.`
      : `${hits.length} star${hits.length === 1 ? '' : 's'}`;
    $('star-list').replaceChildren(...rows.map(({ star, index }) => el('li', { className: 'desk-item', dataset: { id: star.id } },
      el('span', { className: 'desk-num', textContent: `#${index + 1}` }),
      el('input', { className: 'star-label', type: 'text', value: star.label, maxLength: 80, ariaLabel: `Star ${index + 1} label` }),
      el('div', { className: 'desk-item-row' },
        el('input', { className: 'star-date', type: 'date', value: star.date, ariaLabel: `Star ${index + 1} date` }),
        el('button', { className: 'btn btn-small', type: 'button', dataset: { act: 'save' }, textContent: 'Save' }),
        el('button', { className: 'btn btn-small btn-danger', type: 'button', dataset: { act: 'delete' }, textContent: 'Delete' }),
      ),
    )));
  }

  $('star-search').addEventListener('input', renderStarList);

  $('star-list').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const item = btn.closest('.desk-item');
    const id = item.dataset.id;
    const star = hooks.currentStars().find(s => s.id === id);
    if (!star) return;

    if (btn.dataset.act === 'save') {
      const label = item.querySelector('.star-label').value.trim();
      const date = item.querySelector('.star-date').value;
      if (!label) { say('A star needs a label.', true); return; }
      const ok = await save(async () => {
        const saved = await clients.stars.update(d => editStar(d, id, { label, date }), `Edit star: ${label}`);
        hooks.commit(saved.stars);
      }, 'Saved.');
      if (ok) renderStarList();
    } else if (btn.dataset.act === 'delete') {
      if (!confirm(`Delete “${star.label}”? This can’t be undone.`)) return;
      const ok = await save(async () => {
        const saved = await clients.stars.update(d => deleteStar(d, id), `Delete star: ${star.label}`);
        hooks.commit(saved.stars);
      }, `Deleted “${star.label}”.`);
      if (ok) renderStarList();
    }
  });

  // ---------- rewards ----------

  function readDraft() {
    $('rule-list').querySelectorAll('.desk-item').forEach((item, i) => {
      const kind = item.querySelector('.rule-kind').value;
      const n = Number(item.querySelector('.rule-n').value);
      const reward = item.querySelector('.rule-text').value;
      draft[i] = kind === 'once'
        ? { id: draft[i].id, kind, at: n, reward }
        : { id: draft[i].id, kind, every: n, reward };
    });
  }

  function renderRewards(errors = []) {
    const errorAt = new Map(errors.map(e => [e.index, e.message]));
    $('rule-list').replaceChildren(...draft.map((r, i) => {
      const kind = el('select', { className: 'rule-kind', ariaLabel: 'Reward type' },
        el('option', { value: 'once', textContent: 'Once at' }),
        el('option', { value: 'every', textContent: 'Every' }));
      kind.value = r.kind;
      return el('li', { className: `desk-item${errorAt.has(i) ? ' has-error' : ''}` },
        el('div', { className: 'desk-item-row' },
          kind,
          el('input', { className: 'rule-n', type: 'number', min: 1, step: 1, inputMode: 'numeric', value: r.kind === 'once' ? r.at : r.every, ariaLabel: 'Stars' }),
          el('span', { className: 'rule-unit', textContent: 'stars' }),
          el('button', { className: 'btn btn-small btn-danger', type: 'button', dataset: { act: 'remove', i }, textContent: '✕', ariaLabel: 'Remove reward' }),
        ),
        el('input', { className: 'rule-text', type: 'text', maxLength: 80, placeholder: 'Dinner of her choice', value: r.reward, ariaLabel: 'Reward' }),
        el('p', { className: 'desk-error', textContent: errorAt.get(i) || '' }),
      );
    }));
    if (!draft.length) $('rule-list').append(el('li', { className: 'desk-hint', textContent: 'No rewards yet. Add one!' }));
    renderOwed();
  }

  function renderOwed() {
    const { rules, redeemed } = hooks.currentRewards();
    const unlocked = occurrences(rules, hooks.currentStars().length);
    const done = new Set(redeemed);
    const owedGroups = groupByRule(owed(unlocked, redeemed));
    const redeemedGroups = groupByRule(unlocked.filter(o => done.has(o.key)));
    const line = (g, verb, act) => el('li', { className: 'desk-owed' },
      el('span', { textContent: g.count > 1 ? `${g.reward} ×${g.count}` : g.reward }),
      el('button', { className: 'btn btn-small', type: 'button', dataset: { act, rule: g.ruleId }, textContent: verb }));
    $('owed-list').replaceChildren(...(owedGroups.length
      ? owedGroups.map(g => line(g, g.count > 1 ? 'Redeem one' : 'Redeemed', 'redeem'))
      : [el('li', { className: 'desk-hint', textContent: 'Nothing owed right now.' })]));
    $('redeemed-summary').textContent = `Redeemed (${redeemedGroups.reduce((n, g) => n + g.count, 0)})`;
    $('redeemed-list').replaceChildren(...redeemedGroups.map(g => line(g, 'Undo one', 'unredeem')));
  }

  $('rule-add').addEventListener('click', () => {
    readDraft();
    const lastOnce = Math.max(0, ...draft.filter(r => r.kind === 'once').map(r => r.at || 0));
    draft.push({ id: newRuleId(), kind: 'once', at: lastOnce + 10, reward: '' });
    renderRewards();
    const texts = $('rule-list').querySelectorAll('.rule-text');
    texts[texts.length - 1].focus();
  });

  $('rule-list').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act=remove]');
    if (!btn) return;
    readDraft();
    draft.splice(Number(btn.dataset.i), 1);
    renderRewards();
  });

  $('rules-save').addEventListener('click', async () => {
    readDraft();
    const rules = draft.map(r => ({ ...r, reward: r.reward.trim() }));
    const errors = validateRules(rules);
    if (errors.length) {
      renderRewards(errors);
      say('Fix the highlighted rewards first.', true);
      return;
    }
    await save(async () => {
      const saved = await clients.rewards.update(d => setRules(normalizeRewardsDoc(d), rules), 'Update rewards');
      hooks.commitRewards(saved);
      draft = hooks.currentRewards().rules.map(r => ({ ...r }));
      renderRewards();
    }, 'Rewards saved.');
  });

  async function changeRedeemed(ruleId, redeem) {
    const { rules, redeemed } = hooks.currentRewards();
    const unlocked = occurrences(rules, hooks.currentStars().length).filter(o => o.ruleId === ruleId);
    const done = new Set(redeemed);
    // Redeem the oldest owed one; undo the newest redeemed one.
    const target = redeem ? unlocked.find(o => !done.has(o.key)) : [...unlocked].reverse().find(o => done.has(o.key));
    if (!target) return;
    await save(async () => {
      const saved = await clients.rewards.update(
        d => (redeem ? markRedeemed : unmarkRedeemed)(normalizeRewardsDoc(d), target.key),
        `${redeem ? 'Redeemed' : 'Un-redeemed'}: ${target.reward} (${target.at}★)`,
      );
      hooks.commitRewards(saved);
      renderOwed();
    }, redeem ? `Marked “${target.reward}” redeemed.` : 'Undone.');
  }

  $('owed-list').addEventListener('click', e => {
    const b = e.target.closest('button[data-act=redeem]');
    if (b) changeRedeemed(b.dataset.rule, true);
  });
  $('redeemed-list').addEventListener('click', e => {
    const b = e.target.closest('button[data-act=unredeem]');
    if (b) changeRedeemed(b.dataset.rule, false);
  });

  return {
    open,
    get unlocked() { return !!clients; },
    read: () => clients.stars.read(),
    readRewards: () => clients.rewards.read(),
  };
}
