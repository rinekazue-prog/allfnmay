import { neon } from '@neondatabase/serverless';

// GET /api/projects → daftar proyek yang dipublikasikan, dibaca dari Neon.
export async function onRequestGet({ env }) {
  if (!env.DATABASE_URL) {
    return json({ error: 'DATABASE_URL belum diatur di Cloudflare' }, 500);
  }

  try {
    const sql = neon(env.DATABASE_URL);
    const rows = await sql`
      select id, title, category, year, description, image_key
      from projects
      where published = true
      order by sort_order, id
    `;
    return json(rows, 200, { 'Cache-Control': 'public, max-age=60' });
  } catch (err) {
    console.error('Gagal membaca database:', err && err.message);
    return json({ error: 'Gagal membaca database' }, 500);
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}
