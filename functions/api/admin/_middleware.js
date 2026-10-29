// Penjaga pintu untuk semua alamat /api/admin/*.
// Hanya pemilik situs (akun Clerk dengan ID = ADMIN_USER_ID) yang boleh lewat.
// Token login dicek dengan kunci publik Clerk (JWKS), jadi secret key tidak diperlukan.

const DEFAULT_ISSUER = 'https://relaxing-lizard-1363.clerk.accounts.dev';
const enc = new TextEncoder();
const dec = new TextDecoder();

let jwksCache = { keys: null, at: 0, issuer: '' };

export async function onRequest({ request, env, next }) {
  // Tanpa ADMIN_USER_ID, pintu tetap tertutup untuk semua orang.
  if (!env.ADMIN_USER_ID) {
    return json({ error: 'ADMIN_USER_ID belum diatur di Cloudflare' }, 500);
  }

  const m = (request.headers.get('Authorization') || '').match(/^Bearer (.+)$/i);
  if (!m) return json({ error: 'Belum login' }, 401);

  const issuer = (env.CLERK_ISSUER || DEFAULT_ISSUER).replace(/\/+$/, '');

  let payload;
  try {
    payload = await verifyClerkToken(m[1], issuer);
  } catch (err) {
    return json({ error: 'Sesi tidak valid' }, 401);
  }

  if (payload.sub !== env.ADMIN_USER_ID) {
    return json({ error: 'Akun ini bukan admin' }, 403);
  }
  return next();
}

async function verifyClerkToken(token, issuer) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('format token salah');

  const header = JSON.parse(dec.decode(b64urlToBytes(parts[0])));
  if (header.alg !== 'RS256') throw new Error('algoritma tidak didukung');

  // Alamat kunci diambil dari issuer yang kita tetapkan sendiri, bukan dari isi token.
  let jwk = (await getJwks(issuer, false)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await getJwks(issuer, true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('kunci tidak ditemukan');

  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), enc.encode(parts[0] + '.' + parts[1])
  );
  if (!valid) throw new Error('tanda tangan salah');

  const payload = JSON.parse(dec.decode(b64urlToBytes(parts[1])));
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== issuer) throw new Error('issuer salah');
  if (typeof payload.exp !== 'number' || payload.exp < now - 5) throw new Error('token kedaluwarsa');
  if (typeof payload.nbf === 'number' && payload.nbf > now + 5) throw new Error('token belum berlaku');
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('token tanpa pemilik');
  return payload;
}

async function getJwks(issuer, force) {
  const fresh = jwksCache.keys && jwksCache.issuer === issuer && Date.now() - jwksCache.at < 3600 * 1000;
  if (!force && fresh) return jwksCache.keys;
  const res = await fetch(issuer + '/.well-known/jwks.json');
  if (!res.ok) throw new Error('gagal mengambil kunci Clerk');
  const { keys } = await res.json();
  if (!Array.isArray(keys)) throw new Error('format kunci salah');
  jwksCache = { keys, at: Date.now(), issuer };
  return keys;
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
