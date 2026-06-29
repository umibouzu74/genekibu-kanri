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

export { WEEKDAY_LABELS };
