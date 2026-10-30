// POST /api/admin/sign-upload  { "type": "image" | "video" }
// Membuat "tanda tangan" sekali pakai supaya browser admin boleh mengunggah langsung ke Cloudinary.
// API secret hanya ada di sini (server), tidak pernah dikirim ke browser.
// Sudah dijaga _middleware.js: hanya admin yang bisa sampai ke sini.

export async function onRequestPost({ request, env }) {
  const cloud = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const secret = env.CLOUDINARY_API_SECRET;
  if (!cloud || !apiKey || !secret) {
    return json({ error: 'Pengaturan Cloudinary belum lengkap di Cloudflare' }, 500);
  }
  if (!/^[a-z0-9_-]+$/i.test(cloud)) {
    return json({ error: 'CLOUDINARY_CLOUD_NAME tidak valid' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Data tidak valid' }, 400); }
  const type = body && (body.type === 'image' || body.type === 'video') ? body.type : null;
  if (!type) return json({ error: 'Jenis file harus image atau video' }, 400);

  const params = { folder: 'allfnmay', timestamp: Math.floor(Date.now() / 1000) };
  const signature = await sign(params, secret);

  return json({
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloud}/${type}/upload`,
    apiKey,
    timestamp: params.timestamp,
    folder: params.folder,
    signature,
  });
}

// Aturan Cloudinary: urutkan parameter menurut abjad, gabung "k=v&k=v", tambahkan secret, lalu SHA-1.
async function sign(params, secret) {
  const text = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return sha1hex(text + secret);
}

async function sha1hex(text) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
