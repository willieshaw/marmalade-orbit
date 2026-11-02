# marmalade-orbit

Grace's gold-star sticker chart. Static site on GitHub Pages: https://willieshaw.github.io/marmalade-orbit/

Every finished task earns a big foil star. When she opens the site and there are stars she hasn't seen, they slap onto the chart one by one. Reward thresholds bring up a stamped certificate.

The chart is a pad of paper with 50 spaces per sheet. A full sheet gets a COMPLETE stamp and the pad turns to a fresh one; swipe or use ‹ › to look back through old sheets. The 📖 Logbook lists every star by month; tapping a line jumps to that star.

## Awarding a star (Willie only)

1. On your phone, open the site and **tap the title 5 times fast** (or add `#admin` to the URL). The Teacher's desk slides up.
2. Type your password and tap **Unlock**. (Before a password is set, or via "Use a GitHub token instead", paste the token.) The unlocked token is kept only in that browser.
3. **Award** tab: type what she did, tap **Award star ★**. For several at once, tap **+ Add another** (or press Enter) to add rows; each row is its own star and they're saved together. Once unlocked, a gold **+★** button in the corner reopens the desk any time. It is committed to `data/stars.json`. Grace sees it about a minute later, once Pages rebuilds. **Undo last star** removes the newest one; **Lock** forgets the token on that phone.
4. **Stars** tab: search every star, fix a label or date, or delete one.
5. **Rewards** tab: add rewards that pay out **once** ("Once at 100 stars: weekend trip") or **repeat** ("Every 10 stars: dessert of her choice"), then **Save rewards**. Below that, the **Owed** list lets you mark a reward redeemed once she's had it (and undo).

Rewards live in `data/rewards.json` as `rules` plus a `redeemed` list of payouts (`"<ruleId>@<stars>"`). Each payout shows Grace a certificate once per device; three or more at once are bundled onto one certificate.

### Password

Once unlocked, **Award → Set password** encrypts the token with a password you choose (at least 12 characters; a few random words works well) and saves it to `data/key.json`. Any device can then unlock with just the password. The file is public but holds only the encrypted token (PBKDF2-SHA256, 600k iterations, AES-GCM), so a long password is what keeps it safe. When the token expires, unlock with a new token and set the password again.

### Making the token

github.com → Settings → Developer settings → Fine-grained personal access tokens → Generate new token:

- Repository access: **Only select repositories → marmalade-orbit**
- Permissions: **Contents → Read and write**
- Pick an expiry you're happy with. When it expires the desk asks for a new one.

## Texting a star (Duet or Instinct)

Text your agent something like "give Grace a star for doing the dishes". The star lands on the chart straight away, and the agent replies with the new total and how far off the next reward is. "Undo that star" peels it off again, and "change yesterday's star to say she made pancakes" fixes one.

A small Cloudflare Worker in `worker/` makes this possible. It holds a GitHub token as a secret, so the agents never see one. They get a private link instead, which can do everything the desk can do. For stars that's add, undo the newest, edit any label or date, delete any star, and search. For rewards it's add, edit, delete, and marking them redeemed or undoing that. It can't touch the site or anything else in the repo. So treat the link like the desk password: anyone holding it could delete stars and rewards, though git history can always bring them back. Agent-added stars look the same as any other on the chart, with `source: "agent"` in `data/stars.json`.

- `<worker url>/k/<key>/mcp` is the custom connector address for an agent that supports MCP connectors, such as Duet.
- `<worker url>/k/<key>` is a private page for anything with a browser. Opening it never awards a star, so a link preview in iMessage is harmless.

A date can be given for an earlier day ("star for yesterday"). Otherwise stars use today in `TIME_ZONE`, set in `worker/wrangler.toml`.

### Setting up the Worker

Make a second fine-grained token as in "Making the token" below, separate from the desk's so either can be revoked alone. Then, signed in to Cloudflare as yourself and choosing your own account if Wrangler asks:

```bash
cd worker
npx wrangler deploy
npx wrangler secret put GITHUB_TOKEN
```

Then make the private key. This prints the connector address, so keep it to yourself:

```bash
KEY=$(openssl rand -hex 24) && printf %s "$KEY" | npx wrangler secret put STAR_KEY && echo "<worker url>/k/$KEY/mcp"
```

**Changing the key:** run that last command again. Both agents stop working until they get the new link, so do this if a link ever leaks. When the token expires, run `npx wrangler secret put GITHUB_TOKEN` with a new one. Replies will say the chart didn't answer until you do.

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
