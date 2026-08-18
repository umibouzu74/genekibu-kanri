import { useMemo } from "react";
import { S } from "../styles/common";
import { DAYS } from "../constants/schools";
import { deriveCohortsFromSlots, firstSubjToken } from "../utils/cohorts";
import { findGroupForGrade } from "../utils/timetable";
import { fmtDateWeekday } from "../utils/dateHelpers";
import { findLastSessionOnOrBefore } from "../utils/lastSessionDate";

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

  // 終講日を入れているコースだけ「実際の最終授業日 (と第N回)」を逆算する。
  // 全コース分やると重い上に、終講日が無いコースは終わりが無いので出さない。
  const lastSessions = useMemo(() => {
    const out = new Map();
    if (!sessionCtx) return out;
    for (const c of cohorts) {
      const date = savedById.get(c.id)?.date;
      if (!date) continue;
      const cohortSlots = (c.slotIds || [])
        .map((id) => slotById.get(id))
        .filter(Boolean);
      if (cohortSlots.length === 0) continue;
      out.set(c.id, findLastSessionOnOrBefore(cohortSlots, date, sessionCtx));
    }
    return out;
  }, [cohorts, savedById, slotById, sessionCtx]);

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

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {byGrade.length === 0 && (
          <div style={{ fontSize: 12, color: "#888" }}>
            授業が登録されると、ここに学校・曜日コホートが並びます。
          </div>
        )}

        {byGrade.map(({ grade, items }) => (
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
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((cohort) => {
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
                  />
                );
              })}
            </div>
          </div>
        ))}

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
        <div style={{ fontSize: 11, color: "#2a6a3a", fontWeight: 600, marginTop: 3 }}>
          最終授業日 {fmtDateWeekday(lastSession.date)}
          {lastSession.sessionNo > 0 ? `（第${lastSession.sessionNo}回）` : ""}
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
