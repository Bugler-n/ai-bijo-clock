// しおり(アルバムに入れた/外した)を記録する。D1 の binding 名は DB。個人は特定せず、ブラウザごとの匿名の番号(did)だけを使う
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const DAILY_LIMIT = 300;   // 1つの匿名番号が1日にできる操作の上限(連打・荒らし対策)

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'no-db' }, 503);
  let b;
  try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'bad-json' }, 400); }
  const id = String(b.id || ''), did = String(b.did || ''), on = b.on === true;
  if (!/^[0-9a-f]{8}$/.test(id) || !/^[0-9a-f-]{16,40}$/.test(did)) return json({ ok: false, error: 'bad-params' }, 400);
  try {
    const day = Math.floor(Date.now() / 864e5);
    const lim = await env.DB.prepare('INSERT INTO ops(did,day,n) VALUES(?,?,1) ON CONFLICT(did,day) DO UPDATE SET n=n+1 RETURNING n').bind(did, day).first();
    if (lim && lim.n > DAILY_LIMIT) return json({ ok: false, error: 'limit' }, 429);
    if (on) {
      const r = await env.DB.prepare('INSERT OR IGNORE INTO saves(cid,did,ts) VALUES(?,?,?)').bind(id, did, Date.now()).run();
      if (r.meta && r.meta.changes) await env.DB.prepare('INSERT INTO counts(cid,n) VALUES(?,1) ON CONFLICT(cid) DO UPDATE SET n=n+1').bind(id).run();
    } else {
      const r = await env.DB.prepare('DELETE FROM saves WHERE cid=? AND did=?').bind(id, did).run();
      if (r.meta && r.meta.changes) await env.DB.prepare('UPDATE counts SET n=MAX(n-1,0) WHERE cid=?').bind(id).run();
    }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: 'db' }, 500);
  }
}
