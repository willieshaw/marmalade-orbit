// Reading and writing data/stars.json through the GitHub contents API.

export function encodeBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function decodeBase64Utf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const pad = n => String(n).padStart(2, '0');
const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function makeStar({ label, now = new Date() }) {
  const clean = (label || '').trim();
  if (!clean) throw new Error('A star needs a label');
  const id = now.getTime().toString(36) + Math.random().toString(36).slice(2, 6);
  return { id, label: clean, date: localDate(now) };
}

const starsOf = doc => (doc && Array.isArray(doc.stars) ? doc.stars : []);

export function appendStar(doc, star) {
  return { ...doc, stars: [...starsOf(doc), star] };
}

export function removeLastStar(doc) {
  return { ...doc, stars: starsOf(doc).slice(0, -1) };
}

export function serializeStars(doc) {
  return JSON.stringify(doc, null, 2) + '\n';
}

export function createClient({ owner, repo, path, token, fetch = globalThis.fetch }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  async function fail(res) {
    let message = `GitHub said ${res.status}`;
    try { message = (await res.json()).message || message; } catch {}
    const err = new Error(message);
    err.status = res.status;
    return err;
  }

  async function read() {
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) throw await fail(res);
    const body = await res.json();
    return { doc: JSON.parse(decodeBase64Utf8(body.content)), sha: body.sha };
  }

  async function write(doc, sha, message) {
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ message, content: encodeBase64Utf8(serializeStars(doc)), sha }),
    });
    if (!res.ok) throw await fail(res);
  }

  // Read-modify-write; a stale sha (someone else wrote first) gets one retry.
  async function update(mutate, message) {
    for (let attempt = 0; ; attempt++) {
      const { doc, sha } = await read();
      const next = mutate(doc);
      try {
        await write(next, sha, message);
        return next;
      } catch (err) {
        if (attempt === 0 && (err.status === 409 || err.status === 422)) continue;
        throw err;
      }
    }
  }

  return { read, update };
}
