import { useMemo } from "react";
import { buildSessionCountMap, formatSessionNumber } from "../../../utils/sessionCount";
import { makeHolidayHelpers } from "../dashboardHelpers";

// ─── 欠勤ワークフロー: その日のプレビュー ────────────────────────
// ドラフトの代行・合同・移動・回数補正を仮想的に適用した状態で、
// 対象日の時間割を表示する。4/24 の画像のような形式で検証できるよう、
// 時間帯単位で並べて見せる。

function timeToMin(time) {
  if (!time) return 0;
  const m = (time || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function AbsenceDayPreview({
  date,
  dayOfDate,
  slots,
  draft,
  adjustments,
  sessionOverrides,
  classSets,
  displayCutoff,
  holidays,
  examPeriods,
  biweeklyAnchors,
  subs,
}) {
  // ドラフトを既存レコードに連結
  const effectiveAdjustments = useMemo(() => {
    const list = [...(adjustments || [])];
    // 重複を避けるため: 同日で host/target が既にある場合は draft を優先
    const draftByKey = new Map();
    for (const [sidStr, row] of Object.entries(draft)) {
      const slotId = Number(sidStr);
      if (row.action === "combine" && row.combine?.absorbedSlotIds?.length) {
        draftByKey.set(`combine|${slotId}`, {
          id: -1000 - slotId,
          date,
          type: "combine",
          slotId,
          combineSlotIds: row.combine.absorbedSlotIds,
          memo: "(draft)",
        });
      }
      if (row.action === "move" && row.move?.targetTime) {
        draftByKey.set(`move|${slotId}`, {
          id: -2000 - slotId,
          date,
          type: "move",
          slotId,
          targetTime: row.move.targetTime,
          memo: "(draft)",
        });
      }
    }
    return [...list, ...draftByKey.values()];
  }, [adjustments, draft, date]);

  const effectiveOverrides = useMemo(() => {
    const list = [...(sessionOverrides || [])];
    let idBase = -3000;
    for (const [sidStr, row] of Object.entries(draft)) {
      const slotId = Number(sidStr);
      if (row.override) {
        if (row.override.mode === "set" && Number.isFinite(Number(row.override.value))) {
          list.push({
            id: idBase--,
            date,
            slotId,
            mode: "set",
            value: Number(row.override.value),
            memo: "(draft)",
          });
        } else if (row.override.mode === "skip") {
          const rawDisp = Number(row.override.displayAs);
          const entry = {
            id: idBase--,
            date,
            slotId,
            mode: "skip",
            memo: "(draft)",
          };
          if (Number.isFinite(rawDisp) && rawDisp > 0) entry.displayAs = rawDisp;
          list.push(entry);
        }
      }
    }
    return list;
  }, [sessionOverrides, draft, date]);

  const draftSubsByRange = useMemo(() => {
    const m = new Map();
    for (const [sidStr, row] of Object.entries(draft)) {
      const slotId = Number(sidStr);
      if (row.action === "sub" && row.sub?.substitute) {
        m.set(slotId, row.sub.substitute);
      }
    }
    return m;
  }, [draft]);

  const daySlots = useMemo(() => {
    if (!dayOfDate) return [];
    return slots.filter((s) => s.day === dayOfDate);
  }, [slots, dayOfDate]);

  const sessionCountMap = useMemo(() => {
    if (!date || !displayCutoff) return new Map();
    const { isOffForGrade } = makeHolidayHelpers(holidays || [], examPeriods || []);
    return buildSessionCountMap(daySlots, date, {
      classSets: classSets || [],
      allSlots: slots,
      displayCutoff,
      isOffForGrade,
      biweeklyAnchors: biweeklyAnchors || [],
      adjustments: effectiveAdjustments,
      sessionOverrides: effectiveOverrides,
      orientationOnFirstDay: true,
    });
  }, [daySlots, slots, date, classSets, displayCutoff, holidays, examPeriods, biweeklyAnchors, effectiveAdjustments, effectiveOverrides]);

  // moves / combines を slot に反映
  const effectiveSlots = useMemo(() => {
    const moved = new Map(); // slotId -> targetTime
    const absorbedInto = new Map(); // slotId -> host slotId
    for (const a of effectiveAdjustments) {
      if (a.date !== date) continue;
      if (a.type === "move" && a.targetTime) moved.set(a.slotId, a.targetTime);
      if (a.type === "combine" && a.combineSlotIds) {
        for (const cid of a.combineSlotIds) absorbedInto.set(cid, a.slotId);
      }
    }
    return daySlots.map((s) => ({
      ...s,
      _time: moved.has(s.id) ? moved.get(s.id) : s.time,
      _moved: moved.has(s.id),
      _absorbedInto: absorbedInto.get(s.id) ?? null,
      _isCombineHost: effectiveAdjustments.some(
        (a) => a.date === date && a.type === "combine" && a.slotId === s.id
      ),
    }));
  }, [daySlots, effectiveAdjustments, date]);

  const timeGroups = useMemo(() => {
    const groups = new Map();
    for (const s of effectiveSlots) {
      if (s._absorbedInto != null) continue;
      if (!groups.has(s._time)) groups.set(s._time, []);
      groups.get(s._time).push(s);
    }
    return [...groups.entries()].sort(
      (a, b) => timeToMin(a[0].split("-")[0]) - timeToMin(b[0].split("-")[0])
    );
  }, [effectiveSlots]);

  if (!date || !dayOfDate) {
    return (
      <div style={{ color: "#888", padding: 12, fontSize: 12 }}>
        日付を選択してください
      </div>
    );
  }

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
        {date} ({dayOfDate}) プレビュー
      </div>
      {timeGroups.length === 0 && (
        <div style={{ color: "#888" }}>この日のコマはありません</div>
      )}
      {timeGroups.map(([time, group]) => (
        <div
          key={time}
          style={{
            display: "flex",
            gap: 8,
            padding: "6px 0",
            borderBottom: "1px solid #eee",
            alignItems: "flex-start",
          }}
        >
          <div style={{ width: 90, flexShrink: 0, fontWeight: 700, color: "#555" }}>
            {time}
          </div>
          <div style={{ flex: 1, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {group.map((s) => {
              const count = sessionCountMap.get(s.id) || 0;
              const sub = draftSubsByRange.get(s.id);
              const existingSub = (subs || []).find(
                (x) => x.date === date && x.slotId === s.id
              );
              const teacherDisplay =
                sub || existingSub?.substitute
                  ? `${s.teacher}⇒${sub || existingSub.substitute}`
                  : s.teacher;

              const absorbed = effectiveSlots.filter((o) => o._absorbedInto === s.id);

              return (
                <div
                  key={s.id}
                  style={{
                    background: s._isCombineHost
                      ? "#fff8e0"
                      : s._moved
                        ? "#e8f4ff"
                        : "#fff",
                    border: "1px solid #ddd",
                    borderRadius: 4,
                    padding: "4px 8px",
                    minWidth: 160,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    {s.grade}
                    {s.cls && s.cls !== "-" ? s.cls : ""} {s.subj}
                    {count > 0 && (
                      <span style={{ marginLeft: 4, color: "#2a6a9e" }}>
                        {formatSessionNumber(count)}
                      </span>
                    )}
                  </div>
                  <div style={{ color: sub || existingSub?.substitute ? "#c44" : "#333" }}>
                    {teacherDisplay}
                  </div>
                  {s._isCombineHost && absorbed.length > 0 && (
                    <div style={{ fontSize: 10, color: "#8a6a20", marginTop: 2 }}>
                      + {absorbed.map((a) => `${a.grade}${a.cls} ${a.subj}`).join("/")}
                    </div>
                  )}
                  {s._moved && <div style={{ fontSize: 10, color: "#2a6a9e" }}>⇒ 移動</div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
