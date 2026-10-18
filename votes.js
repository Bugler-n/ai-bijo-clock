// しおり(アルバムに入れた)の全体集計。cards.js の後に読み込む。
// 集計は Cloudflare の /api/counts・/api/save・/api/mine(functions/api/、保存先は D1)。個人は特定せず、ブラウザごとの匿名の番号(did)だけを使う。
const Votes = (() => {
  // テスト用: true のあいだ、絵は 6 秒ごとに切り替わる。本番は false(15 秒)にする
  const TEST_MODE = true;
  const SWITCH_MS = TEST_MODE ? 6000 : 15000;   // 時計の絵を切り替える間隔

  const CK = 'bc_counts_v1', DK = 'bc_did';
  let remote = {};   // 全員分のしおり数 { カードid: 件数 }。取れないときは前回の値(なければ空)で動く
  try { const o = JSON.parse(localStorage.getItem(CK) || '{}'); if (o && o.c) remote = o.c; } catch (e) {}

  const did = (() => {   // ブラウザごとの匿名の番号
    try {
      let d = localStorage.getItem(DK); if (d && /^[0-9a-f-]{16,40}$/.test(d)) return d;
      d = crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DK, d); return d;
    } catch (e) { return 'a'.repeat(16) + Math.random().toString(16).slice(2, 10); }
  })();

  let fetching = false;
  function refreshCounts() {
    if (fetching || typeof fetch !== 'function') return; fetching = true;
    fetch('/api/counts', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then((j) => {
      if (j && j.counts) { remote = j.counts; try { localStorage.setItem(CK, JSON.stringify({ t: Date.now(), c: remote })); } catch (e) {} }
    }).catch(() => {}).then(() => { fetching = false; });
  }
  refreshCounts(); setInterval(() => { if (!document.hidden) refreshCounts(); }, 60000);

  // しおりを入れた/外したことを送る(失敗しても画面は止めない)。自分の端末の数字にもすぐ反映する
  function report(id, on) {
    remote[id] = Math.max(0, (remote[id] || 0) + (on ? 1 : -1));
    try { fetch('/api/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, did, on: !!on }), keepalive: true }).catch(() => {}); } catch (e) {}
  }

  // 端末のアルバムと、サーバーの記録を照合して、食い違いを直す(サーバー側に無い子は送り、サーバーにだけある子は取り消す)。
  // 原因が何であっても(以前の保存、通信の失敗、別タブでの操作など)、開くたびに揃うので、ランキングの数字が正しくなる
  let syncing = false;
  function syncAlbum() {
    if (syncing || typeof fetch !== 'function') return;
    let album = [];
    try { album = JSON.parse(localStorage.getItem('bc_album') || '[]'); } catch (e) { return; }
    if (!Array.isArray(album)) return;
    syncing = true;
    fetch('/api/mine?did=' + encodeURIComponent(did), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then((j) => {
      if (!j || !Array.isArray(j.ids)) { syncing = false; return; }
      const local = new Set(album.filter(id => /^[0-9a-f]{8}$/.test(id))), server = new Set(j.ids);
      const jobs = [];
      local.forEach(id => { if (!server.has(id)) jobs.push([id, true]); });     // 端末にあって、サーバーに無い → 送る
      server.forEach(id => { if (!local.has(id)) jobs.push([id, false]); });   // サーバーにあって、端末に無い → 取り消す
      jobs.length = Math.min(jobs.length, 60);   // 一度に最大60件
      const run = () => {
        const t = jobs.shift(); if (!t) { syncing = false; return; }
        fetch('/api/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: t[0], did, on: t[1] }) })
          .then(() => setTimeout(run, 150)).catch(() => { syncing = false; });
      };
      if (jobs.length) { run(); setTimeout(refreshCounts, 4000); } else syncing = false;
    }).catch(() => { syncing = false; });
  }
  setTimeout(syncAlbum, 1500); setInterval(() => { if (!document.hidden) syncAlbum(); }, 5 * 60 * 1000);

  // 時計に出る重み: 人気があるほど少し多く出る。全員 0 なら、みんな同じ(穏やかに効かせる)
  const weight = (id) => 1 + Math.sqrt(remote[id] || 0);
  const count = (id) => remote[id] || 0;   // 全員分のしおり数

  return { TEST_MODE, SWITCH_MS, did, count, weight, report };
})();
