// いいね(投票)の集計とランキング。cards.js の後に読み込む。
// いまは試作版で、票はこのブラウザの localStorage だけに保存する(全員で共有されない)。
// 共有するときは load()/save() を外部の保存先(API)に差し替える。ランキングの計算はそのまま使える。
const Votes = (() => {
  const KEY = 'bc_votes_v1';
  // テスト用: true のあいだ、いいねは何度でも押せる。初回(保存データなし)は全員にランダムな票数を割り当てる。本番では false にする
  const TEST_MODE = true;
  // テストモードの条件: 絵は6秒ごとに切り替え / ランクインした子は1.5分表示 / いいねは無制限 / 上位は250人。
  // 本番(false)は 15秒 / 3分 / 1日1回 / 300人。
  const SWITCH_MS = TEST_MODE ? 6000 : 15000;                  // 時計の絵を切り替える間隔
  const ENTER_MS = (TEST_MODE ? 1.5 : 3) * 60 * 1000;            // 上位に入った子を、お礼つきで出す時間
  const BASE_TOP = TEST_MODE ? 250 : 300;   // 時計に出る人数のはじめの値(テスト中は 250 にして、応援待ちを増やす)
  const MIN_OUT = 20;                       // 圏外(応援待ち)に最低これだけ残す
  const MAX_WAIT = 3;                // 表示を待てる人数(いま出している子は含まない)
  // 古い cards.js(id なし)がブラウザに残っていても全員が同じ票にならないよう、id がなければ画像のパスを id にする
  CARDS.forEach((c) => { if (!c.id) c.id = c.src; });
  const pool = CARDS.filter(c => !c.exclude);

  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const empty = () => ({ n: {}, at: {}, mine: {}, entered: {}, ins: 0, seeded: false });   // n=票数 at=最後に票が増えた時刻 mine=自分が最後に入れた日 entered=上位入りした時刻
  let data = empty();
  try { data = Object.assign(empty(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  if (data.n['undefined'] !== undefined) data = empty();   // id が無かった時期に溜まった壊れた票は捨てて、割り当てからやり直す
  const save = () => {
    const old = Date.now() - 60 * 60 * 1000;   // 1時間より前の上位入りは、もう順番に影響しないので捨てる
    Object.keys(data.entered).forEach(id => { if (data.entered[id] < old) delete data.entered[id]; });
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} };

  // 全員にランダムな票数(0〜120。小さい値が多めの偏り)と、票が入った時刻をばらして割り当てる
  function randomize() {
    data = empty();
    const now = Date.now();
    pool.forEach((c) => {
      const n = Math.floor(Math.pow(Math.random(), 2) * 120);
      if (n > 0) { data.n[c.id] = n; data.at[c.id] = now - Math.floor(Math.random() * 7 * 864e5); }
    });
    data.seeded = true;
    save();
  }
  // (以前はテスト用に全員へランダムな票を割り当てていたが、全体の集計を使うので、行わない)

  // ---- 全員分のしおり数(Cloudflare の /api/counts)。取れないときは、前回の値(なければ 0)で動く ----
  const CK = 'bc_counts_v1', DK = 'bc_did';
  let remote = {};
  try { const o = JSON.parse(localStorage.getItem(CK) || '{}'); if (o && o.c) remote = o.c; } catch (e) {}
  const did = (() => {   // ブラウザごとの匿名の番号(個人は特定しない)
    try { let d = localStorage.getItem(DK); if (d && /^[0-9a-f-]{16,40}$/.test(d)) return d;
      d = (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join(''));
      localStorage.setItem(DK, d); return d; } catch (e) { return 'a'.repeat(16) + Math.random().toString(16).slice(2, 10); }
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
  // 時計に出る重み: 人気があるほど少し多く出る。全員 0 なら、みんな同じ(穏やかに効かせる)
  const weight = (id) => 1 + Math.sqrt(remote[id] || 0);

  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const count = (id) => remote[id] || 0;   // 全員分のしおり数

  // 票が多い順。同数は先にその票数に届いた子、それも同じなら固定の順(id のハッシュ)
  function ranking() {
    return pool.slice().sort((a, b) =>
      (count(b.id) - count(a.id)) ||
      ((data.at[a.id] || 1e15) - (data.at[b.id] || 1e15)) ||
      (hash('r' + a.id) - hash('r' + b.id)));
  }
  const rankOf = (id) => ranking().findIndex(c => c.id === id) + 1;
  // 上位の人数: 2人ランクインするごとに1人だけ圏外になる = 上位は2人入るごとに1人ずつ増える。
  // ただし圏外が MIN_OUT 人を下回らないよう、増えるのは (全員 − MIN_OUT) まで。
  const topN = () => Math.min(BASE_TOP + Math.floor(data.ins / 2), Math.max(0, pool.length - MIN_OUT));
  const isTop = (id) => true;   // 全員を時計に出す(人気は出る頻度の重みで反映する)

  function vote(id) {
    if (!canVote(id)) return { ok: false };
    const before = isTop(id);
    data.n[id] = count(id) + 1;
    data.at[id] = Date.now();
    data.mine[id] = today();
    const entered = !before && isTop(id);
    if (entered) { data.entered[id] = Date.now(); data.ins++; }
    save();
    return { ok: true, entered, count: count(id), rank: rankOf(id) };
  }
  const canVote = (id) => TEST_MODE || data.mine[id] !== today();   // 同じ子には 1 日 1 票

  // 「応援ありがとう」の表示は順番待ち: 上位入りした順に 1 人ずつ ENTER_MS ずつ出す。
  // 待ちが MAX_WAIT 人いるときに入った子は、表示の順番をもらえない(投票画面の「ランクイン」の印は出る)。
  // 保存済みの上位入り時刻だけから毎回計算するので、どの画面でも同じ結果になる。
  function schedule() {
    const slots = [];
    let lastEnd = 0;
    Object.keys(data.entered).sort((a, b) => data.entered[a] - data.entered[b]).forEach((id) => {
      const t = data.entered[id];
      if (slots.filter(sl => sl.start > t).length >= MAX_WAIT) return;   // その時点で待っている人数
      const start = Math.max(t, lastEnd);
      slots.push({ id, start, end: start + ENTER_MS });
      lastEnd = start + ENTER_MS;
    });
    return slots;
  }
  // いま出す番の子(いま上位にいる子に限る)。なければ null
  function thanks() {
    return null;   // ランクインのお礼表示は使わない(ボードの一言は常時表示)
  }
  function _thanksOld() {
    const now = Date.now();
    const cur = schedule().find(sl => sl.start <= now && now < sl.end && isTop(sl.id));
    return cur ? cur.id : null;
  }

  // 上位入りして ENTER_MS 以内の子(新しい順)。投票画面で「ランクイン」の印を付けるのに使う
  const justEntered = () => {
    const now = Date.now();
    return Object.keys(data.entered).filter(id => now - data.entered[id] < ENTER_MS && isTop(id))
      .sort((a, b) => data.entered[b] - data.entered[a]).map(id => pool.find(c => c.id === id));
  };
  const enteredAt = (id) => data.entered[id] || 0;
  const waiting = () => ranking().slice(topN());
  const threshold = () => { const r = ranking(), n = topN(); return r.length > n ? count(r[n - 1].id) : 0; };   // 最下位(上位に残れる最低ライン)の票数
  const reset = () => { data = empty(); data.seeded = true; save(); };   // 全員 0 票に戻す(テストデータの再割り当ては randomize())

  return { weight, report, did, TEST_MODE, SWITCH_MS, ENTER_MS, get TOP_N() { return topN(); }, count, canVote, vote, isTop, rankOf, ranking, waiting, threshold, thanks, schedule, randomize, justEntered, enteredAt, reset,
           indexOf: (id) => CARDS.findIndex(c => c.id === id) };
})();
