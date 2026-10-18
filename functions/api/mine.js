// 自分の匿名番号(did)が、どの子を保存していることになっているか(端末のアルバムとの食い違いを直すために使う)
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ids: [], error: 'no-db' }, 503);
  const did = new URL(request.url).searchParams.get('did') || '';
  if (!/^[0-9a-f-]{16,40}$/.test(did)) return json({ ids: [], error: 'bad-params' }, 400);
  try {
    const { results } = await env.DB.prepare('SELECT cid FROM saves WHERE did = ?').bind(did).all();
    return json({ ids: (results || []).map((r) => r.cid) });
  } catch (e) {
    return json({ ids: [], error: 'db' }, 500);
  }
}
