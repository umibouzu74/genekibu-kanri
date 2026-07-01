// 日付ラベルの自動生成 (純粋関数)。
// 開始日〜終了日 + 対象曜日 + 除外日 から「M/D(曜)」形式のラベル配列を作る。
// BasicSettings の『日付を自動生成』UI から使う。テスト容易性のため
// 入出力を純粋に保ち、副作用 (現在日時取得) は持たない。

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

// 'YYYY-MM-DD' → Date (ローカル正午基準で DST/タイムゾーン揺れを避ける)。
// 不正な文字列は null。
function parseYmd(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
  // 桁あふれ (例: 2/30) を弾く
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function toYmd(dt) {
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mo}-${d}`;
}

// Date → 'M/D(曜)' (例: 2026-07-24(金) → '7/24(金)')。既存ラベル表記に合わせる。
export function dateToLabel(dt) {
  return `${dt.getMonth() + 1}/${dt.getDate()}(${WEEKDAY_LABELS[dt.getDay()]})`;
}

// 'YYYY-MM-DD' → 'M/D(曜)'。不正なら null。
export function ymdToLabel(ymd) {
  const dt = parseYmd(ymd);
  return dt ? dateToLabel(dt) : null;
}

// 開始日〜終了日 (両端含む) のうち、weekdays (0=日..6=土 の配列) に該当し
// excludeYmd ('YYYY-MM-DD' 配列) に含まれない日付の 'M/D(曜)' ラベルを昇順で返す。
// weekdays が空/未指定なら全曜日対象。start > end や不正入力は [] を返す。
export function generateDateLabels({ startYmd, endYmd, weekdays, excludeYmd = [] } = {}) {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end || start > end) return [];
  const wdSet = (Array.isArray(weekdays) && weekdays.length > 0) ? new Set(weekdays) : null;
  const exclSet = new Set((excludeYmd || []).map(s => (typeof s === 'string' ? s.trim() : s)).filter(Boolean));
  const out = [];
  const cur = new Date(start);
  let guard = 0;
  // 安全弁: 連続生成は最大 1000 日まで (約 2.7 年)。
  while (cur <= end && guard < 1000) {
    guard++;
    const matchesWd = !wdSet || wdSet.has(cur.getDay());
    if (matchesWd && !exclSet.has(toYmd(cur))) {
      out.push(dateToLabel(cur));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// 'M/D' 部分だけ取り出す (曜日サフィックスの有無は問わない)。取れなければ null。
function parseMonthDay(label) {
  const m = String(label ?? '').match(/^(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return { month: Number(m[1]), day: Number(m[2]) };
}

// 日付プール ({id, label, ...} の配列) を実日付順に並べ替える (表示専用の
// 純粋関数。呼び出し側の配列は変更しない)。ラベルは年を持たないため月日だけで
// 比較する。10〜12月と1〜3月が混在するプールは「年をまたぐ短期講習 (冬期講習
// など)」とみなし、1〜3月を翌年 (13〜15月) 扱いにして繰り上げる。
// 前提: 数ヶ月規模の集中講習であり、1年通しの通期コースには非対応。
// M/D として解釈できないラベルは末尾へ (元の並び順を保ったまま)。
export function sortPoolDatesByCalendar(poolDates) {
  const entries = (poolDates || []).map((d, idx) => ({ d, idx, md: parseMonthDay(d.label) }));
  const months = entries.map(e => e.md?.month).filter(Boolean);
  const wrapsYear = months.some(m => m >= 10) && months.some(m => m <= 3);
  const sortableMonth = (m) => (wrapsYear && m <= 3 ? m + 12 : m);
  return entries
    .slice()
    .sort((a, b) => {
      if (!a.md && !b.md) return a.idx - b.idx;
      if (!a.md) return 1;
      if (!b.md) return -1;
      return sortableMonth(a.md.month) - sortableMonth(b.md.month) || a.md.day - b.md.day || a.idx - b.idx;
    })
    .map(e => e.d);
}

export { WEEKDAY_LABELS };
