// POST /api/contact  ->  kirim email lewat Resend ke pemilik situs.
// Env yang dibutuhkan: RESEND_API_KEY, CONTACT_TO. Opsional: CONTACT_FROM.
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  if (!env.RESEND_API_KEY || !env.CONTACT_TO) return json({ error: 'Email belum dikonfigurasi di server.' }, 500);

  // Hanya terima dari situs sendiri.
  const origin = request.headers.get('Origin');
  if (origin) {
    try { if (new URL(origin).host !== new URL(request.url).host) return json({ error: 'Ditolak.' }, 403); }
    catch (e) { return json({ error: 'Ditolak.' }, 403); }
  }

  const raw = await request.text();
  if (raw.length > 8000) return json({ error: 'Pesan terlalu panjang.' }, 413);
  let b; try { b = JSON.parse(raw); } catch (e) { return json({ error: 'Data tidak valid.' }, 400); }
  if (!b || typeof b !== 'object') return json({ error: 'Data tidak valid.' }, 400);

  if (b.website) return json({ ok: true }); // kolom jebakan bot: pura-pura sukses

  const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '');
  const name = clean(b.name, 80).replace(/[\r\n]+/g, ' ');
  const email = clean(b.email, 120);
  const message = clean(b.message, 2000);
  if (!name || !message || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    return json({ error: 'Isi nama, email yang valid, dan pesan.' }, 400);
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.CONTACT_FROM || 'allfnmay <onboarding@resend.dev>',
      to: [env.CONTACT_TO],
      reply_to: email,
      subject: 'Pesan baru dari ' + name,
      text: 'Nama: ' + name + '\nEmail: ' + email + '\n\n' + message
    })
  });
  if (!res.ok) return json({ error: 'Email gagal dikirim. Coba lagi nanti.' }, 502);
  return json({ ok: true });
}

export function onRequest() { return json({ error: 'Metode tidak didukung.' }, 405); }
