// 全員分のしおり数。数十秒キャッシュして、D1 の読み取りを減らす
export async function onRequestGet({ env }) {
  const headers = { 'content-type': 'application/json', 'cache-control': 'public, max-age=30' };
  if (!env.DB) return new Response(JSON.stringify({ counts: {}, error: 'no-db' }), { status: 503, headers: { ...headers, 'cache-control': 'no-store' } });
  try {
    const { results } = await env.DB.prepare('SELECT cid, n FROM counts WHERE n > 0').all();
    const counts = {};
    (results || []).forEach((r) => { counts[r.cid] = r.n; });
    return new Response(JSON.stringify({ counts }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ counts: {}, error: 'db' }), { status: 500, headers: { ...headers, 'cache-control': 'no-store' } });
  }
}
