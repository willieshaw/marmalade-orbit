# marmalade-orbit

Grace's gold-star sticker chart. Static site on GitHub Pages: https://willieshaw.github.io/marmalade-orbit/

Every finished task earns a big foil star. When she opens the site and there are stars she hasn't seen, they slap onto the chart one by one. Reward thresholds bring up a stamped certificate.

The chart is a pad of paper with 50 spaces per sheet. A full sheet gets a COMPLETE stamp and the pad turns to a fresh one; swipe or use ‹ › to look back through old sheets. The 📖 Logbook lists every star by month; tapping a line jumps to that star.

## Awarding a star (Willie only)

1. On your phone, open the site and **tap the title 5 times fast** (or add `#admin` to the URL). The Teacher's desk slides up.
2. First time only: paste a GitHub token and tap **Unlock**. It is checked against the repo and stored only in that phone's browser.
3. **Award** tab: type what she did, tap **Award star ★**. It is committed to `data/stars.json`. Grace sees it about a minute later, once Pages rebuilds. **Undo last star** removes the newest one; **Lock** forgets the token on that phone.
4. **Stars** tab: search every star, fix a label or date, or delete one.
5. **Rewards** tab: add rewards that pay out **once** ("Once at 100 stars: weekend trip") or **repeat** ("Every 10 stars: dessert of her choice"), then **Save rewards**. Below that, the **Owed** list lets you mark a reward redeemed once she's had it (and undo).

Rewards live in `data/rewards.json` as `rules` plus a `redeemed` list of payouts (`"<ruleId>@<stars>"`). Each payout shows Grace a certificate once per device; three or more at once are bundled onto one certificate.

### Making the token

github.com → Settings → Developer settings → Fine-grained personal access tokens → Generate new token:

- Repository access: **Only select repositories → marmalade-orbit**
- Permissions: **Contents → Read and write**
- Pick an expiry you're happy with. When it expires the desk asks for a new one.

## Config

`js/config.js` holds her name, the signature on certificates, and the repo coordinates.

## Development

No build step and no dependencies.

```bash
npm test
```

```bash
npm run serve
```

Then open http://localhost:8137.
