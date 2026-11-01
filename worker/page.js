// The private page: a little paper pad for awarding stars from any browser.

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

const STYLE = `
:root { --kraft:#b98d5a; --paper:#fdf8ea; --rule:#a9c7e8; --ink:#2b2a4c; --soft:#5b5a7a; --marker:#e5432d; --gold-deep:#b9780a; color-scheme:light; }
* { box-sizing:border-box; }
body { margin:0; min-height:100vh; padding:32px 16px; color:var(--ink); background:var(--kraft); font-family:'Bricolage Grotesque',system-ui,sans-serif; overflow-x:hidden; }
.pad { position:relative; width:min(460px,100%); margin:0 auto; padding:30px 22px 22px; background:var(--paper); border-radius:6px; box-shadow:0 12px 28px rgba(60,35,10,.4); transform:rotate(-.6deg); }
.pad::before { content:''; position:absolute; top:-12px; left:50%; width:110px; height:26px; margin-left:-55px; background:rgba(255,170,190,.78); transform:rotate(-2deg); }
h1 { margin:0 0 14px; font-family:'Shrikhand',Georgia,serif; font-weight:400; font-size:2rem; color:var(--marker); text-align:center; }
label { display:block; margin-top:12px; font-family:'Gochi Hand','Comic Sans MS',cursive; font-size:1.25rem; }
textarea,input { width:100%; margin-top:4px; padding:10px 12px; border:2px solid var(--rule); border-radius:8px; background:#fff; color:var(--ink); font:inherit; font-size:1rem; }
textarea { min-height:112px; resize:vertical; }
button { width:100%; min-height:54px; margin-top:16px; border:0; border-radius:999px; font:inherit; font-weight:800; font-size:1.15rem; color:#3b2603; background:linear-gradient(#ffe066,#f2b705); box-shadow:0 4px 0 var(--gold-deep); cursor:pointer; }
button:active { transform:translateY(2px) scale(.98); box-shadow:0 2px 0 var(--gold-deep); }
button.undo { min-height:40px; margin-top:10px; background:none; box-shadow:none; color:var(--soft); font-size:.95rem; font-weight:500; text-decoration:underline; }
.note { margin:0 0 6px; font-family:'Gochi Hand','Comic Sans MS',cursive; font-size:1.45rem; line-height:1.25; text-align:center; }
.note.oops { color:var(--marker); }
.burst { position:relative; height:112px; margin-bottom:6px; }
.burst span { position:absolute; left:50%; top:50%; line-height:1; color:#f2b705; text-shadow:0 2px 0 var(--gold-deep); }
.burst .big { font-size:88px; margin:-46px 0 0 -38px; animation:slap .55s cubic-bezier(.2,1.6,.4,1) both; }
.burst .bit { font-size:18px; animation:fly .8s .18s ease-out both; }
.bit:nth-child(2) { --x:-112px; --y:-34px; } .bit:nth-child(3) { --x:112px; --y:-38px; }
.bit:nth-child(4) { --x:-82px; --y:44px; } .bit:nth-child(5) { --x:86px; --y:42px; }
.bit:nth-child(6) { --x:-30px; --y:-56px; } .bit:nth-child(7) { --x:34px; --y:-58px; }
@keyframes slap { from { transform:scale(3) rotate(-24deg); opacity:0; } }
@keyframes fly { from { transform:scale(.4); opacity:1; } to { transform:translate(var(--x),var(--y)) rotate(160deg); opacity:0; } }
@media (prefers-reduced-motion:reduce) { .burst span { animation:none; } .burst .bit { display:none; } }
`;

const BURST = `<div class="burst" aria-hidden="true"><span class="big">★</span>${'<span class="bit">★</span>'.repeat(6)}</div>`;

// note: { text, isError, celebrate } after an action, or nothing on a fresh page.
export function renderPage({ base, note }) {
  const home = escapeHtml(base);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#b98d5a">
<meta name="robots" content="noindex">
<title>★</title>
<link href="https://fonts.googleapis.com/css2?family=Shrikhand&family=Gochi+Hand&family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,800&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body>
<main class="pad">
${note?.celebrate ? BURST : ''}
${note ? `<p class="note${note.isError ? ' oops' : ''}" role="status">${escapeHtml(note.text)}</p>` : '<h1>Gold star time</h1>'}
<form method="post" action="${home}/stars">
<label for="labels">What did she do? One star per line.</label>
<textarea id="labels" name="labels" required></textarea>
<label for="date">Date, if it wasn't today</label>
<input id="date" name="date" type="date">
<button type="submit">Award star ★</button>
</form>
<form method="post" action="${home}/undo"><button class="undo" type="submit">Undo last star</button></form>
</main>
</body>
</html>
`;
}
