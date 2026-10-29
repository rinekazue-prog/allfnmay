import { neon } from '@neondatabase/serverless';

// Semua fungsi di sini sudah dijaga _middleware.js: hanya admin yang bisa sampai ke sini.

// GET /api/admin/projects → semua proyek (termasuk yang belum dipublikasikan)
export async function onRequestGet({ env }) {
  const sql = db(env);
  if (!sql) return json({ error: 'DATABASE_URL belum diatur di Cloudflare' }, 500);
  try {
    const rows = await sql`
      select id, title, category, year, description, image_key, published, sort_order
      from projects
      order by sort_order, id
    `;
    return json(rows);
  } catch (err) {
    console.error('GET admin gagal:', err && err.message);
    return json({ error: 'Gagal membaca database' }, 500);
  }
}

// POST /api/admin/projects → tambah proyek baru
export async function onRequestPost({ request, env }) {
  const sql = db(env);
  if (!sql) return json({ error: 'DATABASE_URL belum diatur di Cloudflare' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Data tidak valid' }, 400); }

  const title = clean(body.title, 100);
  const category = clean(body.category, 50);
  const description = clean(body.description, 1000);
  if (!title) return json({ error: 'Judul wajib diisi' }, 400);

  let year = null;
  if (body.year !== undefined && body.year !== null && body.year !== '') {
    year = Number(body.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return json({ error: 'Tahun harus angka antara 1900 dan 2100' }, 400);
    }
  }

  try {
    const rows = await sql`
      insert into projects (title, category, year, description, sort_order)
      values (
        ${title}, ${category}, ${year}, ${description},
        (select coalesce(max(sort_order), 0) + 1 from projects)
      )
      returning id, title, category, year, description, image_key, published, sort_order
    `;
    return json(rows[0], 201);
  } catch (err) {
    console.error('POST admin gagal:', err && err.message);
    return json({ error: 'Gagal menyimpan proyek' }, 500);
  }
}

// DELETE /api/admin/projects?id=3 → hapus proyek
export async function onRequestDelete({ request, env }) {
  const sql = db(env);
  if (!sql) return json({ error: 'DATABASE_URL belum diatur di Cloudflare' }, 500);

  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) return json({ error: 'ID tidak valid' }, 400);

  try {
    const rows = await sql`delete from projects where id = ${id} returning id`;
    if (!rows.length) return json({ error: 'Proyek tidak ditemukan' }, 404);
    return json({ ok: true, id });
  } catch (err) {
    console.error('DELETE admin gagal:', err && err.message);
    return json({ error: 'Gagal menghapus proyek' }, 500);
  }
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
