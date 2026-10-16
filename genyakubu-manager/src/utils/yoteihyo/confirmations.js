// ─── 確認済み (対応不要) の食い違い ────────────────────────────────
// 予定表チェックの食い違いのうち、人が見て「これはこのままでよい」と決めたもの
// (振替済み・追加授業で登録済み など、突き合わせが読み取れない形で正しく
// 登録してある日)。次に予定表を読み込んだとき (1 月に読み直したときなど) に
// 同じ食い違いを出し続けないように覚えておく。
//
// 保存形 (同期データ、appData の genyakubu-yoteihyo-confirmed):
//   [{ date, course, fp, at }]
//   - date:   食い違いの日 ("YYYY-MM-DD")
//   - course: 講座の識別 (courseIdentity)。行番号・列番号ではなく、学年の組と
//             講座の名前 (記号の講座は記号も) で作るので、改訂版の予定表を
//             読み直しても同じ講座に当たる
//   - fp:     確認したときの食い違いの中身 (findingFingerprint)。中身が変われば
//             (別の種類の食い違いになった・システムのコマが変わった) 確認済みを
//             無かったことにして、また出す
//   - at:     確認した日 ("YYYY-MM-DD"。表示用)
// 講座の名前は RTDB のキーに使えない文字 (/ など) を含みうるので配列で持つ。
// 純粋関数のみ。書き込みは画面が updater で (6 秒の「元に戻す」つき)。

import { normalizeName, subjectKey } from "./courseMapping";

/** 講座の識別 (同じ講座なら予定表を読み直しても同じ文字列) */
export function courseIdentity(course) {
  if (!course) return "";
  const grades = (course.grades || []).join("・");
  // 空白を先に除いてから言い換える (「高松西 高校」も「高松西高校」と同じ講座)
  const name = normalizeName(String(course.name || "").replace(/\s+/g, ""));
  if (course.mode === "mark") {
    const wd = String(course.key || "").split("mark:")[1] || "";
    return `${grades}|mark:${wd}`;
  }
  if (course.mode === "symbol") return `${grades}|sym:${course.symbol || ""}:${name}`;
  // 見出しの無い列 (「列5」) は名前が無いので講座キーのまま
  return name ? `${grades}|${name}` : String(course.key || "");
}

// 32 ビットの FNV-1a を 36 進で (中身の目印。暗号ではない)
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function slotPart(x) {
  const st = x.status || {};
  const extra = st.kind === "rescheduled" && st.adj?.targetDate ? `:${st.adj.targetDate}` : "";
  return `${subjectKey(x.slot?.grade, x.slot?.subj)}=${st.kind || ""}${extra}`;
}

/**
 * 食い違いの中身の目印。種類・予定表の状態・システムのコマとその状態
 * (振替は振替先まで) で決まる。理由の文言 (休講日の名前など) は入れない。
 */
export function findingFingerprint(f) {
  const parts = [f.kind, f.yt?.status || ""];
  parts.push(...(f.sys?.held || []).map((x) => `+${slotPart(x)}`).sort());
  parts.push(...(f.sys?.off || []).map((x) => `-${slotPart(x)}`).sort());
  if (f.kind === "missingExtra") {
    parts.push(`src:${f.sourceDate || ""}`);
    parts.push(...(f.pending || []).map((s) => `p${subjectKey(s.grade, s.subj)}`).sort());
    parts.push(...(f.sourceOff || []).map((x) => `o${slotPart(x)}`).sort());
  }
  return hash(parts.join("\n"));
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const keyOf = (date, course) => `${date}\u0000${course}`;

/**
 * 保存形を揃える (同期の読み込み・バックアップの読み込み)。形の崩れた項目は
 * 捨て、同じ (日, 講座) は後の方を使う。
 * @returns {Array<{date: string, course: string, fp: string, at?: string}>}
 */
export function migrateYoteihyoConfirmed(raw) {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
  const byKey = new Map();
  for (const e of list) {
    if (!e || typeof e !== "object") continue;
    if (!ISO_RE.test(e.date || "") || typeof e.course !== "string" || !e.course || typeof e.fp !== "string") continue;
    const entry = { date: e.date, course: e.course, fp: e.fp };
    if (ISO_RE.test(e.at || "")) entry.at = e.at;
    byKey.set(keyOf(e.date, e.course), entry);
  }
  return [...byKey.values()];
}

/** 食い違い → 保存する 1 件 */
export function confirmationFor(finding, courses, today) {
  const course = courses?.get?.(finding.courseKey);
  return {
    date: finding.date,
    course: courseIdentity(course) || finding.courseKey,
    fp: findingFingerprint(finding),
    at: today,
  };
}

/**
 * 食い違いを「まだ見るもの」と「確認済み」に分ける。
 * 確認済みにした後で中身が変わったものは open に入れ、stale に前の確認を返す。
 * @returns {{ open: Array, confirmed: Array<{finding, entry}>, stale: Map<object, object> }}
 */
export function splitByConfirmation(findings, courses, list) {
  const index = new Map(migrateYoteihyoConfirmed(list).map((e) => [keyOf(e.date, e.course), e]));
  const open = [];
  const confirmed = [];
  const stale = new Map();
  for (const f of findings || []) {
    const course = courses?.get?.(f.courseKey);
    const entry = index.get(keyOf(f.date, courseIdentity(course) || f.courseKey));
    if (!entry) open.push(f);
    else if (entry.fp === findingFingerprint(f)) confirmed.push({ finding: f, entry });
    else {
      open.push(f);
      stale.set(f, entry);
    }
  }
  return { open, confirmed, stale };
}

/** 確認済みを足す (同じ日・同じ講座は置き換え) */
export function withConfirmed(list, entries) {
  const add = migrateYoteihyoConfirmed(entries);
  const keys = new Set(add.map((e) => keyOf(e.date, e.course)));
  return [...migrateYoteihyoConfirmed(list).filter((e) => !keys.has(keyOf(e.date, e.course))), ...add];
}

/**
 * entries の (日, 講座) の確認済みを外し、previous (外す前・足す前の状態) が
 * あれば戻す。確認済みの取り消しと、確認・取り消しの「元に戻す」の両方に使う。
 */
export function restoreConfirmed(list, entries, previous = []) {
  const keys = new Set(migrateYoteihyoConfirmed(entries).map((e) => keyOf(e.date, e.course)));
  const back = migrateYoteihyoConfirmed(previous).filter((e) => keys.has(keyOf(e.date, e.course)));
  return [...migrateYoteihyoConfirmed(list).filter((e) => !keys.has(keyOf(e.date, e.course))), ...back];
}

/** 今の保存形のうち、entries と同じ (日, 講座) のもの (「元に戻す」で戻す元) */
export function confirmedEntriesFor(list, entries) {
  const keys = new Set(migrateYoteihyoConfirmed(entries).map((e) => keyOf(e.date, e.course)));
  return migrateYoteihyoConfirmed(list).filter((e) => keys.has(keyOf(e.date, e.course)));
}
