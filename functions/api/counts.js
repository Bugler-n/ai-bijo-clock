// 全員分のしおり数と、各子の最新の保存時刻。数十秒キャッシュして、D1 の読み取りを減らす
export async function onRequestGet({ env }) {
  const headers = { 'content-type': 'application/json', 'cache-control': 'public, max-age=30' };
  if (!env.DB) return new Response(JSON.stringify({ counts: {}, error: 'no-db' }), { status: 503, headers: { ...headers, 'cache-control': 'no-store' } });
  try {
    const { results } = await env.DB.prepare('SELECT c.cid AS cid, c.n AS n, (SELECT MAX(ts) FROM saves s WHERE s.cid = c.cid) AS t FROM counts c WHERE c.n > 0').all();
    const counts = {}, last = {};
    (results || []).forEach((r) => { counts[r.cid] = r.n; if (r.t) last[r.cid] = r.t; });
    return new Response(JSON.stringify({ counts, last }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ counts: {}, error: 'db' }), { status: 500, headers: { ...headers, 'cache-control': 'no-store' } });
  }
}
