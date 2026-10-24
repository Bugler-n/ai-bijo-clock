// 各ページ共通の小さな道具。cards.js の後(votes.js の前)に読み込む。
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t || '').replace(/[<>&"]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m]));
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };   // FNV-1a。同じ文字列からは同じ数

// 推しアルバム(しおり): この端末のブラウザにだけ保存する、カード id の配列
const Album = (() => {
  const KEY = 'bc_album';
  const load = () => { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const save = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} };
  return { KEY, load, save };
})();
