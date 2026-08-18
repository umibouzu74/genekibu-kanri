import { useMemo, useState } from "react";
import { S } from "../styles/common";
import { DAYS } from "../constants/schools";
import { deriveCohortsFromSlots, firstSubjToken } from "../utils/cohorts";
import { findGroupForGrade } from "../utils/timetable";
import { fmtDateWeekday } from "../utils/dateHelpers";
import { findLastSessionOnOrBefore } from "../utils/lastSessionDate";
import { useConfirm } from "../hooks/useConfirm";

// 1 学年あたりこの件数を超えたら折りたたむ (高3 は科目トークンごとに
// コホートができるので 20 行を超えることがある)。
const COLLAPSE_LIMIT = 8;

// 一括設定はこの件数以上なら確認を挟む。絞り込まずに押すと全コースの
// 終講日を黙って上書きしてしまい、元の値は復元できないため。
const BULK_CONFIRM_LIMIT = 10;

// ─── コース別 終講日エディタ ───────────────────────────────────────
// 学年グループ (中1・2 / 中3 / 高1・2 / 高3) では表現できない、
// 学校別 (高校) / 曜日ペア別 (中学 火木・水金) の終講日を、いま入っている
// 授業から自動で「コホート」に束ねて一覧表示し、クリックで終講日を選ぶ。
//
// 保存先は displayCutoff.cohorts (CohortCutoff[])。終講日 (date) のみ持ち、
// 開始日は学年グループ (表示期間設定) を流用する。回数計算には影響しない。
export function CohortCutoffEditor({
  slots,
  displayCutoff,
  onSave,
  isAdmin,
  sessionCtx,
}) {
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [unsetOnly, setUnsetOnly] = useState(false);
  const [expandedGrades, setExpandedGrades] = useState(() => new Set());
  const [bulkDate, setBulkDate] = useState("");

  const cohorts = useMemo(() => deriveCohortsFromSlots(slots), [slots]);

  const slotById = useMemo(() => {
    const m = new Map();
    for (const s of slots || []) m.set(s.id, s);
    return m;
  }, [slots]);

  // コホートの内訳 (曜日・科目) を member slots から作る。検証・確認用の表示。
  const cohortDetail = (cohort) => {
    const ss = (cohort.slotIds || []).map((id) => slotById.get(id)).filter(Boolean);
    const days = [...new Set(ss.map((s) => s.day))]
      .sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b))
      .join("");
    const subjSet = new Set();
    for (const s of ss) {
      if (cohort.dept === "高校部") {
        // 高校は学校トークンを除いた科目名を表示 (例: "高松西 英語" → "英語")。
        const body = s.subj.trim().slice(firstSubjToken(s.subj).length).trim();
        subjSet.add(body || s.subj);
      } else {
        subjSet.add(s.subj);
      }
    }
    return { days, subjects: [...subjSet] };
  };

  // どのコホートにも属さない授業 (= グループ終了日に従う)。高1・2 の英数以外
  // (理科・古文漢文等) などが該当。(学年, 科目) でまとめて件数を出す。
  const excludedSummary = useMemo(() => {
    const owned = new Set(cohorts.flatMap((c) => c.slotIds || []));
    const m = new Map();
    for (const s of slots || []) {
      if (!s || !s.grade || owned.has(s.id)) continue;
      const key = `${s.grade}${s.subj}`;
      const e = m.get(key) || { grade: s.grade, subj: s.subj, count: 0 };
      e.count += 1;
      m.set(key, e);
    }
    return [...m.values()].sort((a, b) =>
      a.grade !== b.grade
        ? a.grade < b.grade
          ? -1
          : 1
        : a.subj < b.subj
          ? -1
          : a.subj > b.subj
            ? 1
            : 0
    );
  }, [cohorts, slots]);

  // cohortId → 保存済み終講日エントリ
  const savedById = useMemo(() => {
    const m = new Map();
    for (const c of displayCutoff?.cohorts || []) m.set(c.id, c);
    return m;
  }, [displayCutoff]);

  // 学年ごとにまとめる (cohorts は中学→高校・学年順にソート済み)。
  const byGrade = useMemo(() => {
    const out = [];
    for (const c of cohorts) {
      let g = out[out.length - 1];
      if (!g || g.grade !== c.grade) {
        g = { grade: c.grade, items: [] };
        out.push(g);
      }
      g.items.push(c);
    }
    return out;
  }, [cohorts]);

  // 検索 (ラベル・曜日・科目) と「未設定のみ」で絞った表示用リスト。
  // 高3 のように 20 行を超える学年があるので、探せることを優先する。
  const filteredByGrade = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = [];
    for (const { grade, items } of byGrade) {
      const kept = items.filter((c) => {
        if (unsetOnly && savedById.get(c.id)?.date) return false;
        if (!q) return true;
        const hay = [c.label, (c.days || []).join(""), c.school || ""]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
      if (kept.length > 0) out.push({ grade, items: kept });
    }
    return out;
  }, [byGrade, query, unsetOnly, savedById]);

  const filteredCount = useMemo(
    () => filteredByGrade.reduce((n, g) => n + g.items.length, 0),
    [filteredByGrade]
  );

  // 折りたたみを考慮した「いま画面に出る行」。最終授業日の逆算は開始日から
  // 対象日までの走査なので、見えていない行まで数えると設定を触るたびに
  // 数百 ms 待たされる (実データで 45 コース = 約 120ms)。
  const shownByGrade = useMemo(
    () =>
      filteredByGrade.map(({ grade, items }) => ({
        grade,
        items,
        shown:
          expandedGrades.has(grade) || items.length <= COLLAPSE_LIMIT
            ? items
            : items.slice(0, COLLAPSE_LIMIT),
      })),
    [filteredByGrade, expandedGrades]
  );

  // 絞り込みに該当するコースへの一括操作 (折りたたみで省略している行も
  // 対象)。絞り込みと組み合わせて「高3 の未設定だけまとめて 1/17」の
  // ような入れ方ができる。
  const applyBulkDate = async (date) => {
    if (!isAdmin) return;
    const targets = filteredByGrade.flatMap((g) => g.items);
    if (targets.length === 0) return;
    if (targets.length >= BULK_CONFIRM_LIMIT) {
      const ok = await confirm({
        title: date ? "終講日をまとめて設定" : "終講日をまとめて解除",
        message: date
          ? `${targets.length} コースの終講日を ${date} に設定します。\n` +
            `・既に入っている終講日も上書きされます（元の値には戻せません）\n` +
            `\n検索や「未設定のみ」で絞ってから実行することもできます。よろしいですか？`
          : `${targets.length} コースの終講日を解除します。\n` +
            `・解除したコースは上の「表示期間設定」の終了日に従います\n` +
            `\nよろしいですか？`,
        okLabel: date ? "まとめて設定" : "まとめて解除",
        tone: date ? undefined : "danger",
      });
      if (!ok) return;
    }
    const targetIds = new Set(targets.map((c) => c.id));
    const rest = (displayCutoff?.cohorts || []).filter((c) => !targetIds.has(c.id));
    const next = date
      ? [
          ...rest,
          ...targets.map((c) => ({
            id: c.id,
            label: c.label,
            grade: c.grade,
            date,
          })),
        ]
      : rest;
    onSave({ ...displayCutoff, cohorts: next });
  };

  // いま授業が無い (= slots から導出できない) のに残っている終講日エントリ。
  // クラス削除・改名で取り残された設定。掃除できるよう別枠で出す。
  const orphans = useMemo(() => {
    const currentIds = new Set(cohorts.map((c) => c.id));
    return (displayCutoff?.cohorts || []).filter((c) => !currentIds.has(c.id));
  }, [cohorts, displayCutoff]);

  const setCohortDate = (cohort, date) => {
    if (!isAdmin) return;
    const list = Array.isArray(displayCutoff?.cohorts)
      ? displayCutoff.cohorts
      : [];
    const without = list.filter((c) => c.id !== cohort.id);
    const next = date
      ? [
          ...without,
          { id: cohort.id, label: cohort.label, grade: cohort.grade, date },
        ]
      : without;
    onSave({ ...displayCutoff, cohorts: next });
  };

  // 表示中コホートのうち終講日が設定されている件数。Map サイズ引き算では
  // なく直接数える (date:null の取り込みデータや重複 id に対して頑健)。
  const setCount = useMemo(
    () => cohorts.filter((c) => savedById.get(c.id)?.date).length,
    [cohorts, savedById]
  );

  // 終講日を入れていて、いま画面に出ているコースだけ「実際の最終授業日
  // (と第N回)」を逆算する。終講日が無いコースは終わりが無いので出さない。
  const lastSessions = useMemo(() => {
    const out = new Map();
    if (!sessionCtx) return out;
    for (const { shown } of shownByGrade) {
      for (const c of shown) {
        const date = savedById.get(c.id)?.date;
        if (!date) continue;
        const cohortSlots = (c.slotIds || [])
          .map((id) => slotById.get(id))
          .filter(Boolean);
        if (cohortSlots.length === 0) continue;
        out.set(c.id, findLastSessionOnOrBefore(cohortSlots, date, sessionCtx));
      }
    }
    return out;
  }, [shownByGrade, savedById, slotById, sessionCtx]);

  // 未使用エントリ (対象の授業が無い) の一括削除。1 件ずつ日付を消す導線しか
  // 無かったので、掃除が一手で済むようにする。設定を消すだけで cascade は
  // 無いが、まとめて消す操作なので確認は取る。
  const removeAllOrphans = async () => {
    if (!isAdmin || orphans.length === 0) return;
    const ok = await confirm({
      title: "未使用の終講日設定を削除",
      message:
        `対象の授業が見つからない終講日設定 ${orphans.length} 件を削除します。\n` +
        `（${orphans.map((c) => c.label).slice(0, 5).join("・")}${orphans.length > 5 ? " ほか" : ""}）\n` +
        `\n授業には影響しません。よろしいですか？`,
      okLabel: "削除する",
      tone: "danger",
    });
    if (!ok) return;
    const orphanIds = new Set(orphans.map((c) => c.id));
    onSave({
      ...displayCutoff,
      cohorts: (displayCutoff?.cohorts || []).filter((c) => !orphanIds.has(c.id)),
    });
  };

  // コホート grade からその学年グループの開始日を引く (終講日 < 開始日 の検出)。
  const groupStartForGrade = (grade) =>
    findGroupForGrade(grade, displayCutoff?.groups)?.startDate || null;

  // コホート grade からその学年グループの終了日を引く。コホート終講日が
  // グループ終了日より後の場合は表示されない (isEntireDayBeyondCutoff が
  // グループ終了日で打ち切るため) ので、行に警告を出す。
  const groupEndForGrade = (grade) =>
    findGroupForGrade(grade, displayCutoff?.groups)?.date || null;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        border: "1px solid #e0e0e0",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e0e0e0",
          background: "#fafafa",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <span style={{ fontWeight: 800, fontSize: 14 }}>
            コース別 終講日設定
          </span>
          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
            学校別（高校）・曜日別（中学 火木 / 水金）に終講日を設定します。
            未設定のコースは上の「表示期間設定」の終了日に従います。
          </div>
        </div>
        {cohorts.length > 0 && (
          <span
            style={{
              fontSize: 11,
              color: "#666",
              background: "#f0f0f0",
              padding: "2px 8px",
              borderRadius: 10,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            設定済み {setCount} / {cohorts.length} コース
          </span>
        )}
      </div>

      {cohorts.length > 0 && (
        <div
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid #eee",
            background: "#fbfcfe",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            fontSize: 11,
          }}
        >
          <input
            type="search"
            aria-label="コースを検索"
            placeholder="コースを検索（学校・曜日）"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ ...S.input, width: 200, fontSize: 11, padding: "3px 6px" }}
          />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#555" }}>
            <input
              type="checkbox"
              checked={unsetOnly}
              onChange={(e) => setUnsetOnly(e.target.checked)}
              style={{ margin: 0 }}
            />
            未設定のみ
          </label>
          <span style={{ color: "#888" }}>該当 {filteredCount} コース</span>
          {isAdmin && (
            <>
              <span style={{ marginLeft: 8, color: "#555", fontWeight: 700 }}>一括</span>
              <input
                type="date"
                aria-label="該当するコースに一括設定する終講日"
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
                style={{ ...S.input, width: "auto", fontSize: 11, padding: "3px 6px" }}
              />
              <button
                type="button"
                onClick={() => applyBulkDate(bulkDate)}
                disabled={!bulkDate || filteredCount === 0}
                style={{
                  ...S.btn(false),
                  fontSize: 11,
                  padding: "3px 8px",
                  opacity: !bulkDate || filteredCount === 0 ? 0.5 : 1,
                }}
              >
                該当 {filteredCount} コースに設定
              </button>
              <button
                type="button"
                onClick={() => applyBulkDate("")}
                disabled={filteredCount === 0}
                style={{ ...S.btn(false), fontSize: 11, padding: "3px 8px" }}
              >
                該当を解除
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {byGrade.length === 0 && (
          <div style={{ fontSize: 12, color: "#888" }}>
            授業が登録されると、ここに学校・曜日コホートが並びます。
          </div>
        )}

        {cohorts.length > 0 && filteredByGrade.length === 0 && (
          <div style={{ fontSize: 12, color: "#888" }}>
            条件に合うコースがありません（検索語を消すか「未設定のみ」を外してください）。
          </div>
        )}

        {shownByGrade.map(({ grade, items, shown }) => {
          const expanded = shown.length === items.length;
          return (
          <div key={grade}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: "#444",
                marginBottom: 6,
                borderLeft: "3px solid #2a4a8e",
                paddingLeft: 6,
              }}
            >
              {grade}
              <span style={{ fontSize: 10, color: "#aaa", fontWeight: 600, marginLeft: 6 }}>
                {items.length} コース
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {shown.map((cohort) => {
                const saved = savedById.get(cohort.id);
                const date = saved?.date || "";
                const groupEnd = groupEndForGrade(cohort.grade);
                const groupStart = groupStartForGrade(cohort.grade);
                const exceedsGroup = date && groupEnd && date > groupEnd;
                const beforeStart = date && groupStart && date < groupStart;
                const last = lastSessions.get(cohort.id);
                const warn = exceedsGroup
                  ? `グループ終了日 (${groupEnd}) より後です。表示するには上の「表示期間設定」でこの学年の終了日も延ばしてください。`
                  : beforeStart
                    ? `グループ開始日 (${groupStart}) より前です。このコースのコマはどの日にも表示されません。`
                    : date && !last
                      ? "終了日の直前 4 週間にこのコースの授業がありません。日付が早すぎないか確認してください。"
                      : "";
                return (
                  <CohortRow
                    key={cohort.id}
                    label={cohort.label}
                    count={cohort.slotCount}
                    detail={cohortDetail(cohort)}
                    date={date}
                    lastSession={last}
                    isAdmin={isAdmin}
                    warn={warn}
                    onChange={(v) => setCohortDate(cohort, v)}
                    onAlignToLastSession={
                      last && date && last.date !== date
                        ? () => setCohortDate(cohort, last.date)
                        : null
                    }
                  />
                );
              })}
            </div>
            {!expanded && (
              <button
                type="button"
                onClick={() =>
                  setExpandedGrades((prev) => new Set(prev).add(grade))
                }
                style={{
                  ...S.btn(false),
                  fontSize: 11,
                  padding: "3px 8px",
                  marginTop: 6,
                }}
              >
                他 {items.length - shown.length} コースを表示
              </button>
            )}
          </div>
          );
        })}

        {orphans.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: "#a05a00",
                marginBottom: 6,
                borderLeft: "3px solid #d08a30",
                paddingLeft: 6,
              }}
            >
              未使用（対象の授業が見つかりません）
              {isAdmin && (
                <button
                  type="button"
                  onClick={removeAllOrphans}
                  style={{
                    ...S.btn(false),
                    fontSize: 10,
                    padding: "2px 6px",
                    marginLeft: 8,
                    color: "#a33",
                    fontWeight: 700,
                  }}
                >
                  まとめて削除（{orphans.length} 件）
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {orphans.map((c) => (
                <CohortRow
                  key={c.id}
                  label={c.label}
                  count={0}
                  date={c.date || ""}
                  isAdmin={isAdmin}
                  stale
                  onChange={(v) => setCohortDate(c, v)}
                />
              ))}
            </div>
          </div>
        )}

        {excludedSummary.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: "#888",
                marginBottom: 6,
                borderLeft: "3px solid #ccc",
                paddingLeft: 6,
              }}
            >
              コホート対象外（上の「表示期間設定」の終了日に従う）
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {excludedSummary.slice(0, 40).map((e) => (
                <span
                  key={`${e.grade}-${e.subj}`}
                  style={{
                    fontSize: 11,
                    color: "#777",
                    background: "#f5f5f5",
                    border: "1px solid #eee",
                    borderRadius: 8,
                    padding: "2px 8px",
                  }}
                >
                  {e.grade} {e.subj}
                  {e.count > 1 ? ` ×${e.count}` : ""}
                </span>
              ))}
              {excludedSummary.length > 40 && (
                <span style={{ fontSize: 10, color: "#aaa", alignSelf: "center" }}>
                  他 {excludedSummary.length - 40} 件
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>
              ※ 終講日コホートを持たない授業です（高1・2 の英数以外など）。個別の終講日は設定できません。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CohortRow({
  label,
  count,
  detail,
  date,
  lastSession,
  isAdmin,
  stale,
  warn,
  onChange,
  onAlignToLastSession,
}) {
  return (
    <div
      style={{
        padding: "6px 8px",
        borderRadius: 8,
        border: warn ? "1px solid #e0c080" : "1px solid #eee",
        background: warn ? "#fffaf0" : date ? "#f3f8f3" : stale ? "#fdf6ec" : "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1, minWidth: 120 }}>
          {label}
          {count > 0 && (
            <span style={{ marginLeft: 6, fontSize: 10, color: "#999", fontWeight: 600 }}>
              {count} コマ
            </span>
          )}
        </span>
        <span style={{ fontSize: 11, color: "#888" }}>終講日</span>
        <input
          type="date"
          value={date}
          onChange={(e) => onChange(e.target.value || "")}
          disabled={!isAdmin}
          aria-label={`${label} の終講日`}
          style={{ ...S.input, width: "auto", minWidth: 150 }}
        />
        {date && isAdmin && (
          <button
            type="button"
            onClick={() => onChange("")}
            style={{ ...S.btn(false), fontSize: 10, padding: "3px 6px" }}
          >
            解除
          </button>
        )}
      </div>
      {lastSession && (
        <div
          style={{
            fontSize: 11,
            color: "#2a6a3a",
            fontWeight: 600,
            marginTop: 3,
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <span>
            最終授業日 {fmtDateWeekday(lastSession.date)}
            {lastSession.sessionNo > 0 ? `（第${lastSession.sessionNo}回）` : ""}
          </span>
          {/* 終講日にその曜日の授業が無い (例: 火金コースに木曜を入れた) と
              最終授業日とズレる。実害は無いが紛らわしいので揃えられるように */}
          {onAlignToLastSession && isAdmin && (
            <button
              type="button"
              aria-label={`${label} の終講日を最終授業日にそろえる`}
              onClick={onAlignToLastSession}
              style={{ ...S.btn(false), fontSize: 10, padding: "2px 6px" }}
            >
              終講日をこの日にそろえる
            </button>
          )}
        </div>
      )}
      {detail && (detail.days || (detail.subjects && detail.subjects.length > 0)) && (
        <div style={{ fontSize: 10, color: "#999", marginTop: 3 }}>
          {detail.days && <span style={{ fontWeight: 600 }}>{detail.days}</span>}
          {detail.subjects && detail.subjects.length > 0 && (
            <span style={{ marginLeft: detail.days ? 6 : 0 }}>
              {detail.subjects.join(" / ")}
            </span>
          )}
        </div>
      )}
      {warn && (
        <div style={{ fontSize: 10, color: "#a05a00", marginTop: 4 }}>⚠ {warn}</div>
      )}
    </div>
  );
}
