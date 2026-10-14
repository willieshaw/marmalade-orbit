# marmalade-orbit

Grace's gold-star sticker chart. Static site on GitHub Pages: https://willieshaw.github.io/marmalade-orbit/

Every finished task earns a big foil star. When she opens the site and there are stars she hasn't seen, they slap onto the chart one by one. Reward thresholds bring up a stamped certificate.

## Awarding a star (Willie only)

1. On your phone, open the site and **tap the title 5 times fast** (or add `#admin` to the URL). The Teacher's desk slides up.
2. First time only: paste a GitHub token and tap **Unlock**. It is checked against the repo and stored only in that phone's browser.
3. Type what she did, tap **Award star ★**. It is committed to `data/stars.json`. Grace sees it about a minute later, once Pages rebuilds.
4. **Undo last star** removes the newest star. **Lock** forgets the token on that phone.

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
