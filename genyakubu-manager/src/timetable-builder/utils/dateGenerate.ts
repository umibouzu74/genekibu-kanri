// 日付ラベルの自動生成 (純粋関数)。
// 開始日〜終了日 + 対象曜日 + 除外日 から「M/D(曜)」形式のラベル配列を作る。
// BasicSettings の『日付を自動生成』UI から使う。テスト容易性のため
// 入出力を純粋に保ち、副作用 (現在日時取得) は持たない。

import type { Entity } from '../types';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

// 'YYYY-MM-DD' → Date (ローカル正午基準で DST/タイムゾーン揺れを避ける)。
// 不正な文字列は null。
function parseYmd(s: unknown): Date | null {
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

function toYmd(dt: Date): string {
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mo}-${d}`;
}

// Date → 'M/D(曜)' (例: 2026-07-24(金) → '7/24(金)')。既存ラベル表記に合わせる。
export function dateToLabel(dt: Date): string {
  return `${dt.getMonth() + 1}/${dt.getDate()}(${WEEKDAY_LABELS[dt.getDay()]})`;
}

// 'YYYY-MM-DD' → 'M/D(曜)'。不正なら null。
export function ymdToLabel(ymd: string): string | null {
  const dt = parseYmd(ymd);
  return dt ? dateToLabel(dt) : null;
}

// 開始日〜終了日 (両端含む) のうち、weekdays (0=日..6=土 の配列) に該当し
// excludeYmd ('YYYY-MM-DD' 配列) に含まれない日付の 'M/D(曜)' ラベルを昇順で返す。
// weekdays が空/未指定なら全曜日対象。start > end や不正入力は [] を返す。
export function generateDateLabels(
  { startYmd, endYmd, weekdays, excludeYmd = [] }: {
    startYmd?: string;
    endYmd?: string;
    weekdays?: number[];
    excludeYmd?: string[];
  } = {},
): string[] {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end || start > end) return [];
  const wdSet = (Array.isArray(weekdays) && weekdays.length > 0) ? new Set(weekdays) : null;
  const exclSet = new Set((excludeYmd || []).map(s => (typeof s === 'string' ? s.trim() : s)).filter(Boolean));
  const out: string[] = [];
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

// 除外日の入力 (自由記述) を 'YYYY-MM-DD' の配列に展開する。冬期講習の年末年始
// のように何日も続く休みを 1 日ずつ打たせないため、期間指定も受ける:
//   - 区切り: カンマ (, 、 ，)・空白・改行・セミコロン
//   - 1 日: '2026-12-31' / '2026/12/31' / '12/31' (年なし)。後ろの曜日 '(木)' は
//     読み飛ばす (日付ラベルをそのまま貼っても読める)
//   - 期間: '2026-12-29〜2027-01-03' / '12/29〜1/3' (〜 ~ ～ のどれでも。前後の
//     空白も可)
//   - 全角の数字・記号も受ける (NFKC で半角にそろえてから読む)
// 年なしの指定は生成する期間 (startYmd〜endYmd) の中で当てはめる (12/29〜1/3 は
// 年をまたいで 12/29・12/30・12/31・1/1・1/2・1/3)。読めない語 (2/30 のような
// 実在しない日付も) は invalid、年なしで期間の中に当たる日が無い語は outside に
// 返して画面で知らせる (黙って無視すると、打ち間違いに気付かず授業日が残る)。
export function expandExcludeInput(
  text: string,
  { startYmd, endYmd }: { startYmd?: string; endYmd?: string } = {},
): { excludeYmd: string[]; invalid: string[]; outside: string[] } {
  const out = new Set<string>();
  const invalid: string[] = [];
  const outside: string[] = [];
  const windowStart = parseYmd(startYmd);
  const windowEnd = parseYmd(endYmd);
  // 年なしの指定: 生成する期間の中で条件に合う日を除外日にする。期間の中に
  // 当たる日が無ければ false (期間が未入力の間は判定しないので true)
  const addInWindow = (match: (dt: Date) => boolean): boolean => {
    if (!windowStart || !windowEnd || windowStart > windowEnd) return true;
    let hit = false;
    const cur = new Date(windowStart);
    for (let guard = 0; cur <= windowEnd && guard < 1000; guard++) {
      if (match(cur)) {
        out.add(toYmd(cur));
        hit = true;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return hit;
  };
  const fullDate = (s: string): Date | null => {
    const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\([日月火水木金土]\))?$/);
    return m ? parseYmd(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`) : null;
  };
  const monthDay = (s: string): { month: number; day: number } | null => {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\([日月火水木金土]\))?$/);
    if (!m) return null;
    const month = Number(m[1]);
    const day = Number(m[2]);
    // うるう年 (2024) で実在する月日か。2/30・11/31 は読めない日付として返す
    const dt = new Date(2024, month - 1, day, 12);
    return month >= 1 && month <= 12 && dt.getMonth() === month - 1 && dt.getDate() === day
      ? { month, day }
      : null;
  };
  const mdKey = (month: number, day: number) => month * 100 + day;

  String(text ?? '')
    .normalize('NFKC')
    // 「12/29 〜 1/3」の空白で期間が 2 つの語に割れないように
    .replace(/\s*[〜~～]\s*/g, '〜')
    .split(/[,、;\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(token => {
      const parts = token.split('〜');
      if (parts.length === 1) {
        const dt = fullDate(token);
        if (dt) { out.add(toYmd(dt)); return; }
        const md = monthDay(token);
        if (md) {
          const hit = addInWindow(cur => cur.getMonth() + 1 === md.month && cur.getDate() === md.day);
          if (!hit) outside.push(token);
          return;
        }
        invalid.push(token);
        return;
      }
      if (parts.length !== 2) { invalid.push(token); return; }
      const [a, b] = parts;
      const fa = fullDate(a);
      const fb = fullDate(b);
      if (fa && fb) {
        if (fa > fb) { invalid.push(token); return; }
        const cur = new Date(fa);
        for (let guard = 0; cur <= fb && guard < 400; guard++) {
          out.add(toYmd(cur));
          cur.setDate(cur.getDate() + 1);
        }
        return;
      }
      const ma = monthDay(a);
      const mb = monthDay(b);
      if (ma && mb) {
        // 年なしの期間は月日の円環で判定 (12/29〜1/3 は年をまたぐ)
        const from = mdKey(ma.month, ma.day);
        const to = mdKey(mb.month, mb.day);
        const hit = addInWindow(cur => {
          const k = mdKey(cur.getMonth() + 1, cur.getDate());
          return from <= to ? (k >= from && k <= to) : (k >= from || k <= to);
        });
        if (!hit) outside.push(token);
        return;
      }
      invalid.push(token);
    });
  return { excludeYmd: [...out].sort(), invalid, outside };
}

// 'M/D' 部分だけ取り出す (曜日サフィックスの有無は問わない)。取れなければ null。
function parseMonthDay(label: unknown): { month: number; day: number } | null {
  const m = String(label ?? '').match(/^(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return { month: Number(m[1]), day: Number(m[2]) };
}

// 「季節の始まりの月」を求める。ラベルは年を持たないので、プールに出てくる月を
// 円環 (12 月の次は 1 月) に並べ、使われていない月が最も長く続く区間の直後を
// 始まりとみなす。
//   - 冬期 (12・1 月) → 12 月始まり (1 月は翌年)
//   - 春期 (3・4 月) に前の冬の日付 (12・1 月) が残っている → 12 月始まり
//     (12 → 1 → 3 → 4。旧実装の「10〜12 月と 1〜3 月が混在したら 1〜3 月を
//     翌年」だと 4 月が 12 月より前に並び、3/25〜4/7 の範囲指定が崩れた)
//   - 夏期 (7・8 月) の残りに冬期 → 7 月始まり (7 → 8 → 12 → 1)
// 使われていない月が無い (12 か月すべて) ときは 1 月始まり。月が無ければ null。
// 前提: 数ヶ月規模の集中講習。1 年通しの通期コースには非対応。
export function seasonStartMonth(months: Iterable<number | null | undefined>): number | null {
  const present = [...new Set([...months].filter((m): m is number => typeof m === 'number' && m >= 1 && m <= 12))]
    .sort((a, b) => a - b);
  if (present.length === 0) return null;
  let start = present[0];
  let bestGap = 0;
  present.forEach((m, i) => {
    const next = present[(i + 1) % present.length];
    // m と next の間の使われていない月の数 (円環)。1 か月だけのときは 11
    const gap = present.length === 1 ? 11 : ((next - m + 12) % 12) - 1;
    if (gap > bestGap) {
      bestGap = gap;
      start = next;
    }
  });
  return start;
}

// 月 → 季節の中での並び順 (0〜11)。start は seasonStartMonth の結果。
export function seasonMonthOrder(month: number, start: number | null): number {
  return start == null ? month : (month - start + 12) % 12;
}

// 日付プール ({id, label, ...} の配列) を実日付順に並べ替える (表示専用の
// 純粋関数。呼び出し側の配列は変更しない)。ラベルは年を持たないため、月は
// 季節の始まり (seasonStartMonth) からの順で比べる (冬期講習の 12 → 1 月、
// 前の季節の日付が残ったプールでも季節ごとにまとまる)。
// M/D として解釈できないラベルは末尾へ (元の並び順を保ったまま)。
export function sortPoolDatesByCalendar(poolDates: Entity[] | null | undefined): Entity[] {
  const entries = (poolDates || []).map((d, idx) => ({ d, idx, md: parseMonthDay(d.label) }));
  const start = seasonStartMonth(entries.map(e => e.md?.month));
  const sortableMonth = (m: number) => seasonMonthOrder(m, start);
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
