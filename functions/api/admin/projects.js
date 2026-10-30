import { neon } from '@neondatabase/serverless';

// Semua fungsi di sini sudah dijaga _middleware.js: hanya admin yang bisa sampai ke sini.

const COLS = 'id, title, category, year, description, image_url, video_url, link_url, published, sort_order';
const IMAGE_HOSTS = ['res.cloudinary.com'];
const VIDEO_HOSTS = [
  'res.cloudinary.com',
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be',
  'vimeo.com', 'www.vimeo.com', 'player.vimeo.com',
];

// GET /api/admin/projects → semua proyek (termasuk draf)
export async function onRequestGet({ env }) {
  const sql = db(env);
  if (!sql) return json({ error: 'DATABASE_URL belum diatur di Cloudflare' }, 500);
  try {
    const rows = await sql`
      select id, title, category, year, description, image_url, video_url, link_url, published, sort_order
      from projects
      order by sort_order, id
    `;
    return json(rows);
  } catch (err) {
    console.error('GET admin gagal:', err && err.message);
    return json({ error: 'Gagal membaca database. Sudah menjalankan SQL kolom baru di Neon?' }, 500);
  }
}

// POST /api/admin/projects → tambah proyek baru
export async function onRequestPost({ request, env }) {
  const sql = db(env);
  if (!sql) return json({ error: 'DATABASE_URL belum diatur di Cloudflare' }, 500);

  const parsed = await parseBody(request);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const d = parsed.data;

  try {
    const rows = await sql`
      insert into projects (title, category, year, description, image_url, video_url, link_url, published, sort_order)
      values (
        ${d.title}, ${d.category}, ${d.year}, ${d.description},
        ${d.image_url}, ${d.video_url}, ${d.link_url}, ${d.published},
        (select coalesce(max(sort_order), 0) + 1 from projects)
      )
      returning id, title, category, year, description, image_url, video_url, link_url, published, sort_order
    `;
    return json(rows[0], 201);
  } catch (err) {
    console.error('POST admin gagal:', err && err.message);
    return json({ error: 'Gagal menyimpan proyek. Sudah menjalankan SQL kolom baru di Neon?' }, 500);
  }
}

// PATCH /api/admin/projects?id=3 → perbarui proyek (kirim semua kolom)
export async function onRequestPatch({ request, env }) {
  const sql = db(env);
  if (!sql) return json({ error: 'DATABASE_URL belum diatur di Cloudflare' }, 500);

  const id = readId(request);
  if (!id) return json({ error: 'ID tidak valid' }, 400);

  const parsed = await parseBody(request);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const d = parsed.data;

  try {
    const rows = await sql`
      update projects set
        title = ${d.title}, category = ${d.category}, year = ${d.year}, description = ${d.description},
        image_url = ${d.image_url}, video_url = ${d.video_url}, link_url = ${d.link_url}, published = ${d.published}
      where id = ${id}
      returning id, title, category, year, description, image_url, video_url, link_url, published, sort_order
    `;
    if (!rows.length) return json({ error: 'Proyek tidak ditemukan' }, 404);
    return json(rows[0]);
  } catch (err) {
    console.error('PATCH admin gagal:', err && err.message);
    return json({ error: 'Gagal memperbarui proyek' }, 500);
  }
}

// DELETE /api/admin/projects?id=3 → hapus proyek (file di Cloudinary tidak ikut terhapus)
export async function onRequestDelete({ request, env }) {
  const sql = db(env);
  if (!sql) return json({ error: 'DATABASE_URL belum diatur di Cloudflare' }, 500);

  const id = readId(request);
  if (!id) return json({ error: 'ID tidak valid' }, 400);

  try {
    const rows = await sql`delete from projects where id = ${id} returning id`;
    if (!rows.length) return json({ error: 'Proyek tidak ditemukan' }, 404);
    return json({ ok: true, id });
  } catch (err) {
    console.error('DELETE admin gagal:', err && err.message);
    return json({ error: 'Gagal menghapus proyek' }, 500);
  }
}

/* ---------- helper ---------- */

async function parseBody(request) {
  let body;
  try { body = await request.json(); } catch { return { error: 'Data tidak valid' }; }
  if (!body || typeof body !== 'object') return { error: 'Data tidak valid' };

  const title = clean(body.title, 100);
  if (!title) return { error: 'Judul wajib diisi' };

  let year = null;
  if (body.year !== undefined && body.year !== null && body.year !== '') {
    year = Number(body.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return { error: 'Tahun harus angka antara 1900 dan 2100' };
    }
  }

  const image = cleanUrl(body.image_url, IMAGE_HOSTS);
  if (image.error) return { error: 'Alamat gambar tidak valid (harus dari unggahan Cloudinary)' };
  const video = cleanUrl(body.video_url, VIDEO_HOSTS);
  if (video.error) return { error: 'Alamat video harus link YouTube, Vimeo, atau unggahan Cloudinary (https)' };
  const link = cleanUrl(body.link_url, null);
  if (link.error) return { error: 'Link proyek harus diawali https://' };

  return {
    data: {
      title,
      category: clean(body.category, 50),
      year,
      description: clean(body.description, 1000),
      image_url: image.value,
      video_url: video.value,
      link_url: link.value,
      published: body.published !== false,
    },
  };
}

function readId(request) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  return Number.isInteger(id) && id >= 1 ? id : null;
}

function db(env) {
  return env.DATABASE_URL ? neon(env.DATABASE_URL) : null;
}

// Teks dipangkas spasi dan dibatasi panjangnya; kosong menjadi null.
function clean(value, max) {
  if (typeof value !== 'string') return null;
  const v = value.trim().slice(0, max);
  return v || null;
}

// Alamat harus https dan (kalau hosts diberikan) berasal dari daftar host yang diizinkan.
function cleanUrl(value, hosts) {
  if (value === undefined || value === null || value === '') return { value: null };
  if (typeof value !== 'string' || value.length > 500) return { error: true };
  let u;
  try { u = new URL(value.trim()); } catch { return { error: true }; }
  if (u.protocol !== 'https:') return { error: true };
  if (hosts && !hosts.includes(u.hostname)) return { error: true };
  return { value: u.toString() };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
