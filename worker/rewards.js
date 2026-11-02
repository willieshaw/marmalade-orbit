// The desk's Rewards tab for agents: edit the rules, and mark payouts redeemed.

import { markRedeemed, setRules, unmarkRedeemed } from '../js/github.js';
import { normalizeStars } from '../js/data.js';
import { groupByRule, normalizeRewardsDoc, occurrences, owed, validateRules } from '../js/rewards.js';
import { cleanText, StarError } from './clean.js';

const MAX_REWARD = 80;

const newRuleId = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

function buildRule({ id, kind, count, reward }) {
  if (kind !== 'once' && kind !== 'every') throw new StarError('A reward is either "once" or "every".');
  const text = cleanText(reward);
  if (text.length > MAX_REWARD) throw new StarError(`Keep each reward to ${MAX_REWARD} characters.`);
  return kind === 'once' ? { id, kind, at: count, reward: text } : { id, kind, every: count, reward: text };
}

const countOf = rule => (rule.kind === 'once' ? rule.at : rule.every);
const describe = rule => (rule.kind === 'once'
  ? `Once at ${rule.at} stars: ${rule.reward}`
  : `Every ${rule.every} stars: ${rule.reward}`);
const tally = list => groupByRule(list).map(g => `${g.reward} ×${g.count}`).join(', ');

export function createRewardDesk({ stars, rewards }) {
  const load = async () => normalizeRewardsDoc((await rewards.read()).doc);

  async function findRule(id) {
    const rule = (await load()).rules.find(r => r.id === id);
    if (!rule) throw new StarError('No reward with that id. list_rewards shows them.');
    return rule;
  }

  const saveRules = (change, message) => rewards.update(doc => {
    const current = normalizeRewardsDoc(doc);
    const rules = change(current.rules);
    const [problem] = validateRules(rules);
    if (problem) throw new StarError(problem.message);
    return setRules(current, rules);
  }, message);

  async function payouts(rules) {
    const count = normalizeStars((await stars.read()).doc).length;
    return occurrences(rules, count);
  }

  async function listRewards() {
    const { rules, redeemed } = await load();
    if (!rules.length) return 'No rewards yet.';
    const unlocked = await payouts(rules);
    const done = new Set(redeemed);
    const claimed = unlocked.filter(o => done.has(o.key));
    const unclaimed = owed(unlocked, redeemed);
    return [
      ...rules.map(r => `${describe(r)} (id: ${r.id})`),
      unclaimed.length ? `Owed: ${tally(unclaimed)}` : 'Nothing owed right now.',
      claimed.length ? `Redeemed: ${tally(claimed)}` : '',
    ].filter(Boolean).join('\n');
  }

  async function addReward({ kind, stars: count, reward }) {
    const rule = buildRule({ id: newRuleId(), kind, count, reward });
    await saveRules(rules => {
      if (rules.some(r => r.kind === rule.kind && countOf(r) === count && r.reward === rule.reward)) {
        throw new StarError('That reward is already on the list.');
      }
      return [...rules, rule];
    }, `Add reward: ${rule.reward}`);
    return `🏆 New reward! ${describe(rule)}.`;
  }

  async function editReward({ id, kind, stars: count, reward }) {
    if (kind === undefined && count === undefined && reward === undefined) {
      throw new StarError('Send what should change.');
    }
    const old = await findRule(id);
    const rule = buildRule({ id, kind: kind ?? old.kind, count: count ?? countOf(old), reward: reward ?? old.reward });
    await saveRules(rules => rules.map(r => (r.id === id ? rule : r)), `Edit reward: ${rule.reward}`);
    return `Fixed: ${describe(rule)}.`;
  }

  async function deleteReward({ id }) {
    const rule = await findRule(id);
    await saveRules(rules => rules.filter(r => r.id !== id), `Delete reward: ${rule.reward}`);
    return `Deleted “${rule.reward}”.`;
  }

  // Like the desk: redeem the oldest owed payout, undo the newest redeemed one.
  async function changeRedeemed(id, redeem) {
    const rule = await findRule(id);
    const { rules, redeemed } = await load();
    const done = new Set(redeemed);
    const mine = (await payouts(rules)).filter(o => o.ruleId === rule.id);
    const target = redeem ? mine.find(o => !done.has(o.key)) : [...mine].reverse().find(o => done.has(o.key));
    if (!target) throw new StarError(redeem ? `Nothing owed for “${rule.reward}”.` : `Nothing redeemed for “${rule.reward}”.`);
    await rewards.update(
      doc => (redeem ? markRedeemed : unmarkRedeemed)(normalizeRewardsDoc(doc), target.key),
      `${redeem ? 'Redeemed' : 'Un-redeemed'}: ${target.reward} (${target.at}★)`,
    );
    return redeem ? `Marked “${target.reward}” redeemed.` : `“${target.reward}” is owed again.`;
  }

  return {
    listRewards,
    addReward,
    editReward,
    deleteReward,
    redeemReward: ({ id }) => changeRedeemed(id, true),
    unredeemReward: ({ id }) => changeRedeemed(id, false),
  };
}
