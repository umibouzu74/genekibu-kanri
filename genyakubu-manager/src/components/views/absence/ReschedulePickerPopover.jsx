import { useEffect, useMemo, useRef, useState } from "react";
import { dateToDay, DAY_COLOR as DC, fmtDate, WEEKDAYS } from "../../../data";
import { S } from "../../../styles/common";
import { sortJa } from "../../../utils/sortJa";
import { isTimetableActiveForDate } from "../../../utils/timetable";

// ─── 振替ピッカーポップオーバー ───────────────────────────────
// 他日への振替を下書きするための UI。
// 振替先日付 (必須) / 振替先時間帯 (任意、既定は元コマの時間) /
// 振替先担当 (任意、既定は元担当) / メモ を設定する。
// 時間帯の候補は振替先日付に有効な時間割のスロットから抽出し、
// 自由入力も許容する。

function computePosition(anchorRect) {
  const popoverWidth = Math.min(340, window.innerWidth - 16);
  const popoverMaxHeight = Math.min(520, window.innerHeight - 24);
  const top = anchorRect.bottom + 4;
  const left = Math.max(
    8,
    Math.min(anchorRect.left, window.innerWidth - popoverWidth - 8)
  );
  const maxTop = window.innerHeight - popoverMaxHeight - 8;
  return {
    top: top > maxTop ? Math.max(8, anchorRect.top - popoverMaxHeight - 4) : top,
    left,
  };
}

// "YYYY-MM-DD" の振替先日付に有効な時間割のスロットだけを返す。
// timetables 未指定または有効テーブルが見つからない場合は元配列を返す
// (他のフォールバック動作と整合)。
function activeSlotsForDate(allSlots, dateStr, timetables) {
  if (!Array.isArray(allSlots) || allSlots.length === 0) return [];
  if (!Array.isArray(timetables) || timetables.length === 0) return allSlots;
  return allSlots.filter((s) => {
    const ttId = s.timetableId ?? 1;
    const tt = timetables.find((t) => t.id === ttId);
    return isTimetableActiveForDate(tt, dateStr, s.grade);
  });
}

export function ReschedulePickerPopover({
  anchorRect,
  slot,
  sourceDate,
  allSlots,
  allTeachers,
  timetables,
  isOffForGrade, // (date, grade, subj) => boolean
  initial,
  hasAutoSkip = false, // 編集時: 既存で skip override が付いているか
  onSave,
  onClear,
  onClose,
}) {
  const ref = useRef(null);
  const [targetDate, setTargetDate] = useState(initial?.targetDate || "");
  const [targetTime, setTargetTime] = useState(
    initial?.targetTime || slot?.time || ""
  );
  const [targetTeacher, setTargetTeacher] = useState(
    initial?.targetTeacher || slot?.teacher || ""
  );
  const [memo, setMemo] = useState(initial?.memo || "");
  // 源泉日のコマを「未実施 (skip)」として回数カウントから除外するか。
  // 既定 true (振替するなら通常そのコマは実施されない)。編集時に既に
  // override がある場合はそれを引き継ぐ。
  const [autoSkip, setAutoSkip] = useState(initial ? hasAutoSkip : true);
  const [confirmedWarn, setConfirmedWarn] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const keyHandler = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  const todayStr = useMemo(() => fmtDate(new Date()), []);
  const minDate = sourceDate < todayStr ? todayStr : sourceDate;

  // 振替先日付に有効な時間割スロットを抽出。
  const activeSlots = useMemo(
    () => activeSlotsForDate(allSlots, targetDate, timetables),
    [allSlots, targetDate, timetables]
  );

  // 振替先日付の曜日に存在するユニークな time 帯を抽出 (昇順)。
  // 利用者はここからプリセット選択でき、自由入力にも切り替え可。
  const timeOptions = useMemo(() => {
    if (!targetDate) return [];
    const dow = dateToDay(targetDate);
    if (!dow) return [];
    const set = new Set();
    for (const s of activeSlots) {
      if (s.day === dow && s.time) set.add(s.time);
    }
    return [...set].sort();
  }, [activeSlots, targetDate]);

  const teacherOptions = useMemo(() => {
    const names = new Set(allTeachers || []);
    if (slot?.teacher) {
      for (const t of String(slot.teacher).split("·")) {
        const name = t.trim();
        if (name) names.add(name);
      }
    }
    return sortJa([...names]);
  }, [allTeachers, slot]);

  const targetDow = targetDate ? dateToDay(targetDate) : null;

  // 警告: 振替先が日曜 (WEEKDAYS に含まれない) / 休講日 / テスト期間 /
  // 同担当の同時間帯重複。
  const warnings = useMemo(() => {
    const list = [];
    if (!targetDate) return list;
    const dow = dateToDay(targetDate);
    if (!dow) {
      // dateToDay が null を返すのは「日曜」のみ (WEEKDAYS は月〜土)。
      const dt = new Date(targetDate);
      const dayKey = WEEKDAYS[dt.getDay()];
      if (dayKey === "日") {
        list.push("振替先が日曜のため、通常コマは実施されません");
      } else {
        list.push("振替先の曜日が解釈できません");
      }
    }
    if (typeof isOffForGrade === "function" && slot) {
      if (isOffForGrade(targetDate, slot.grade, slot.subj)) {
        list.push("振替先が休講日 / テスト期間に該当します");
      }
    }
    if (dow && targetTime) {
      const teacher = targetTeacher || slot?.teacher || "";
      const conflict = activeSlots.find(
        (s) =>
          s.day === dow &&
          s.time === targetTime &&
          (teacher
            ? String(s.teacher || "")
                .split("·")
                .map((x) => x.trim())
                .includes(teacher)
            : false)
      );
      if (conflict) {
        list.push(
          `担当 ${teacher} は同時刻 (${targetTime}) に既に ${conflict.grade}${
            conflict.cls && conflict.cls !== "-" ? conflict.cls : ""
          } ${conflict.subj} を担当しています`
        );
      }
    }
    return list;
  }, [targetDate, targetTime, targetTeacher, slot, activeSlots, isOffForGrade]);

  // 警告内容が変わったら確認状態をリセット (誤承認防止)
  useEffect(() => {
    setConfirmedWarn(false);
  }, [warnings.length, targetDate, targetTime, targetTeacher]);

  const pos = anchorRect
    ? computePosition(anchorRect)
    : { top: 100, left: 100 };

  const handleSave = () => {
    setError(null);
    if (!targetDate) {
      setError("振替先の日付を指定してください");
      return;
    }
    if (targetDate === sourceDate) {
      setError("振替先は元の日付と異なる日を指定してください");
      return;
    }
    if (targetDate < minDate) {
      setError(`振替先は ${minDate} 以降の日付を指定してください`);
      return;
    }
    if (warnings.length > 0 && !confirmedWarn) {
      setError("警告を確認してチェックを入れてください");
      return;
    }
    onSave({
      targetDate,
      targetTime: targetTime || "",
      targetTeacher: targetTeacher || "",
      memo,
      autoSkip,
    });
    onClose();
  };

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: Math.min(340, window.innerWidth - 16),
        maxHeight: Math.min(520, window.innerHeight - 24),
        overflowY: "auto",
        background: "#fff",
        border: "1px solid #ccc",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,.2)",
        zIndex: 2100,
        fontSize: 12,
      }}
    >
      <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid #eee" }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>振替 (他日へ移動)</div>
        <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>
          {slot?.grade}
          {slot?.cls && slot.cls !== "-" ? slot.cls : ""} {slot?.subj} (
          {slot?.teacher})
          <span style={{ color: "#888", marginLeft: 6 }}>
            元: {sourceDate} {slot?.time}
          </span>
        </div>
      </div>

      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <label style={{ display: "block", color: "#555", marginBottom: 2 }}>
            振替先の日付 <span style={{ color: "#c44" }}>*</span>
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="date"
              value={targetDate}
              min={minDate}
              onChange={(e) => setTargetDate(e.target.value)}
              style={{ ...S.input, width: "auto" }}
            />
            {targetDow && (
              <span
                style={{
                  background: DC[targetDow] || "#666",
                  color: "#fff",
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontWeight: 800,
                  fontSize: 11,
                }}
              >
                {targetDow}
              </span>
            )}
          </div>
        </div>

        <div>
          <label style={{ display: "block", color: "#555", marginBottom: 2 }}>
            振替先の時間帯 (任意)
          </label>
          {timeOptions.length > 0 ? (
            <select
              value={timeOptions.includes(targetTime) ? targetTime : ""}
              onChange={(e) => setTargetTime(e.target.value)}
              style={{ ...S.input, width: "100%" }}
            >
              <option value="">(元と同じ時間帯を使用)</option>
              {timeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={targetTime}
              onChange={(e) => setTargetTime(e.target.value)}
              placeholder="例: 19:00-20:20 (任意)"
              style={{ ...S.input, width: "100%" }}
            />
          )}
          <div style={{ color: "#888", fontSize: 10, marginTop: 2 }}>
            未指定の場合は元コマの時間帯 ({slot?.time || "?"}) を使います
          </div>
        </div>

        <div>
          <label style={{ display: "block", color: "#555", marginBottom: 2 }}>
            振替先の担当 (任意)
          </label>
          <select
            value={targetTeacher}
            onChange={(e) => setTargetTeacher(e.target.value)}
            style={{ ...S.input, width: "100%" }}
          >
            <option value="">(元担当 {slot?.teacher || "?"} のまま)</option>
            {teacherOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: "block", color: "#555", marginBottom: 2 }}>
            メモ
          </label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="任意"
            style={{ ...S.input, width: "100%" }}
          />
        </div>

        <label
          style={{
            display: "flex",
            gap: 6,
            alignItems: "flex-start",
            color: "#555",
            background: "#f7f7fa",
            border: "1px solid #e0e0e8",
            borderRadius: 6,
            padding: "6px 8px",
          }}
        >
          <input
            type="checkbox"
            checked={autoSkip}
            onChange={(e) => setAutoSkip(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            元日付の回数カウントから外す (skip 補正を自動付与)
            <div style={{ color: "#888", fontSize: 10, marginTop: 1 }}>
              振替元の日にこのコマは実施されない扱いとし、第N回カウントを進めません
            </div>
          </span>
        </label>
      </div>

      {warnings.length > 0 && (
        <div
          style={{
            background: "#fff7e0",
            border: "1px solid #f0c060",
            color: "#7a4a10",
            padding: "6px 10px",
            margin: "0 10px 8px",
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            ⚠ 注意 ({warnings.length} 件)
          </div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <label
            style={{
              display: "inline-flex",
              gap: 4,
              alignItems: "center",
              marginTop: 4,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={confirmedWarn}
              onChange={(e) => setConfirmedWarn(e.target.checked)}
            />
            上記を確認した
          </label>
        </div>
      )}

      {error && (
        <div
          style={{
            background: "#fde8e8",
            border: "1px solid #f5c2c2",
            color: "#c44",
            padding: "4px 8px",
            margin: "0 10px 8px",
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 6,
          padding: "6px 10px 10px",
          borderTop: "1px solid #eee",
        }}
      >
        {onClear && initial && (
          <button
            type="button"
            onClick={() => {
              onClear();
              onClose();
            }}
            style={{
              ...S.btn(false),
              fontSize: 11,
              padding: "4px 10px",
              color: "#c44",
            }}
          >
            振替を解除
          </button>
        )}
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <button
            type="button"
            onClick={onClose}
            style={{ ...S.btn(false), fontSize: 11, padding: "4px 10px" }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              ...S.btn(true),
              fontSize: 11,
              padding: "4px 12px",
              background: "#1a8a8a",
              color: "#fff",
            }}
          >
            適用
          </button>
        </div>
      </div>
    </div>
  );
}
