import { useEffect, useId, useMemo, useRef, useState } from "react";
import { splitTeacherField } from "../../../utils/biweekly";
import { dateToDay, DAY_COLOR as DC, fmtDate, WEEKDAYS } from "../../../data";
import {
  canonicalTimeRange,
  normalizeTimeRange,
  timeRangeMinutes,
} from "../../../utils/dateHelpers";
import { rangesOverlap, timeRange } from "../../../utils/dayReschedule";
import { collectRoomNames } from "../../../utils/testPrepLessons";
import { S } from "../../../styles/common";
import { colors } from "../../../styles/tokens";
import { sortTeacherNames } from "../../../utils/teacherKana";
import { isTimetableActiveForDate } from "../../../utils/timetable";

// ─── 振替ピッカーポップオーバー ───────────────────────────────
// 他日への振替を下書きするための UI。
// 振替先日付 (必須) / 振替先時間帯 (任意、既定は元コマの時間) /
// 振替先の教室 (任意、既定は元の教室) / 振替先担当 (任意、既定は元担当) /
// メモ を設定する。
// 時間帯の候補は振替先日付に有効な時間割のスロットから抽出する。候補に
// 無い時間 (テスト対策の 17:00-18:00 など) も打てるよう、入力欄 + 候補に
// している (以前は候補があると select しか出ず、自由入力ができなかった)。

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
  teacherKana = {},
  timetables,
  isOffForGrade, // (date, grade, subj) => boolean
  initial,
  hasAutoSkip = false, // 編集時: 既存で skip override が付いているか
  // 「元日付の回数カウントから外す」を出すか。振替先の日から振替を直すとき
  // (欠勤組み換えの振替で入るコマ) は振替元の日の回数補正に触らないので出さない
  showAutoSkip = true,
  onSave,
  onClear,
  onClose,
}) {
  const ref = useRef(null);
  const [targetDate, setTargetDate] = useState(initial?.targetDate || "");
  // 既定は空 = 元のコマの時間。元の時間を入れておくと、候補 (datalist) が
  // 入力中の文字で絞られて他の時間帯が出てこない
  const [targetTime, setTargetTime] = useState(initial?.targetTime || "");
  // 既定は空 = 「(元担当 ◯◯ のまま)」。**元担当を既定で入れないこと** —
  // 「担当が変わった振替」として一覧・カード・tooltip に相手の名前が出て
  // しまう (2026-08-21)。担当を変えるときだけ人が選ぶ。
  const [targetTeacher, setTargetTeacher] = useState(
    initial?.targetTeacher || ""
  );
  const [targetRoom, setTargetRoom] = useState(initial?.targetRoom || "");
  const [memo, setMemo] = useState(initial?.memo || "");
  const timeListId = useId();
  const roomListId = useId();
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

  // 振替先は振替元より前の日・今日より前の日でもよい (2026-10-10)。
  // 「10/16 の授業を休みの 10/9 へ前倒し」や、済んだ振替の後からの記録が
  // あるため。止めずに確認の注意書き (notes) として出す。
  const todayStr = useMemo(() => fmtDate(new Date()), []);

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

  // 教室の候補 (時間割に出てくる教室)
  const roomOptions = useMemo(() => collectRoomNames(allSlots), [allSlots]);

  const teacherOptions = useMemo(() => {
    const names = new Set(allTeachers || []);
    if (slot?.teacher) {
      for (const name of splitTeacherField(slot.teacher)) names.add(name);
    }
    return sortTeacherNames([...names], teacherKana);
  }, [allTeachers, slot, teacherKana]);

  const targetDow = targetDate ? dateToDay(targetDate) : null;

  // 振替先の実際の時間 (空なら元のコマの時間。"1700-1800" などは整えてから)。
  // 読めないときは null (保存の時に理由を出す)
  const effectiveTime = useMemo(() => {
    const r = normalizeTimeRange(targetTime, { durationMin: timeRangeMinutes(slot?.time) });
    if (!r.ok) return null;
    return r.time || slot?.time || "";
  }, [targetTime, slot]);

  // 警告: 振替先が日曜 (WEEKDAYS に含まれない) /
  // 同担当・同じ教室の同時間帯の重なり (時間帯が少しでも重なれば)。
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
    if (dow && effectiveTime) {
      const range = timeRange(effectiveTime);
      // 振替先の日に休講・テスト期間のコマは塞いでいない。同じ曜日の
      // 休みの日へ寄せる振替 (10/16 金 → 10/9 金) で自分自身と重なって
      // 見えていた。時刻は文字列の一致ではなく時間帯の重なりで見る
      // (自由入力の "17:00-18:00" と 16:25-17:25 のコマも重なる)
      const busy = activeSlots.filter(
        (s) =>
          s.day === dow &&
          s.time &&
          rangesOverlap(range, timeRange(s.time)) &&
          !(typeof isOffForGrade === "function" && isOffForGrade(targetDate, s.grade, s.subj, s.id))
      );
      const describe = (s) =>
        `${s.grade}${s.cls && s.cls !== "-" ? s.cls : ""} ${s.subj} (${s.time})`;
      // 複数担当 (「香川·福江」) は 1 人ずつ見る。講師欄の文字列のまま比べると
      // 誰の講師欄とも一致せず、重なりを見逃していた
      for (const teacher of splitTeacherField(targetTeacher || slot?.teacher || "")) {
        const conflict = busy.find((s) => splitTeacherField(s.teacher).includes(teacher));
        if (conflict) {
          list.push(
            `担当 ${teacher} は同じ時間 (${effectiveTime}) に既に ${describe(conflict)} を担当しています`
          );
        }
      }
      const room = targetRoom.trim() || (slot?.room || "").trim();
      if (room && room !== "-") {
        const conflict = busy.find((s) => (s.room || "").trim() === room);
        if (conflict) {
          list.push(`教室 ${room} は同じ時間 (${effectiveTime}) に ${describe(conflict)} が使っています`);
        }
      }
    }
    return list;
  }, [targetDate, effectiveTime, targetTeacher, targetRoom, slot, activeSlots, isOffForGrade]);

  // 確認だけの注意書き (保存は止めない)。振替先が休講日なのは「休みの日へ
  // 寄せる」典型なので警告にしない (日まるごと振替と同じ扱い。振替の
  // コマは休講日でも表示される)。
  const notes = useMemo(() => {
    const list = [];
    if (!targetDate) return list;
    if (typeof isOffForGrade === "function" && slot) {
      if (isOffForGrade(targetDate, slot.grade, slot.subj, slot.id)) {
        list.push("振替先は休講日 / テスト期間です (振替のコマは休講日でも表示されます)");
      }
    }
    if (sourceDate && targetDate < sourceDate) {
      list.push("振替先は振替元より前の日付です (前倒しの振替)");
    }
    if (targetDate < todayStr) {
      list.push("振替先は今日より前の日付です (済んだ振替の記録)");
    }
    return list;
  }, [targetDate, sourceDate, todayStr, slot, isOffForGrade]);

  // 警告内容が変わったら確認状態をリセット (誤承認防止)
  useEffect(() => {
    setConfirmedWarn(false);
  }, [warnings.length, targetDate, targetTime, targetTeacher, targetRoom]);

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
    // "1700-1800" / 全角 / 開始だけ (元のコマの長さで終わりを補う) を受ける
    const normalized = normalizeTimeRange(targetTime, {
      durationMin: timeRangeMinutes(slot?.time),
    });
    if (!normalized.ok) {
      setError(normalized.error);
      return;
    }
    if (warnings.length > 0 && !confirmedWarn) {
      setError("警告を確認してチェックを入れてください");
      return;
    }
    const room = targetRoom.trim();
    onSave({
      targetDate,
      // 元のコマと同じ時間なら持たない ("9:30-10:50" と "09:30-10:50" も同じ)
      targetTime:
        normalized.time && canonicalTimeRange(normalized.time) !== canonicalTimeRange(slot?.time)
          ? normalized.time
          : "",
      // 元の教室と同じなら持たない (振替元の表示に教室が増えないように)
      targetRoom: room && room !== (slot?.room || "").trim() ? room : "",
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
            振替先の日付 <span style={{ color: colors.danger }} aria-label="必須">*</span>
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="date"
              value={targetDate}
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
          <input
            type="text"
            value={targetTime}
            onChange={(e) => setTargetTime(e.target.value)}
            placeholder={`例: 17:00-18:00 (空欄なら ${slot?.time || "元の時間"})`}
            aria-label="振替先の時間帯"
            list={timeOptions.length > 0 ? timeListId : undefined}
            style={{ ...S.input, width: "100%" }}
          />
          {timeOptions.length > 0 && (
            <datalist id={timeListId}>
              {timeOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          )}
          <div style={{ color: "#888", fontSize: 10, marginTop: 2 }}>
            空欄なら元コマの時間帯 ({slot?.time || "?"})。開始だけ (17:00) なら、元の授業と同じ長さで終わりを補います
          </div>
        </div>

        <div>
          <label style={{ display: "block", color: "#555", marginBottom: 2 }}>
            振替先の教室 (任意)
          </label>
          <input
            type="text"
            value={targetRoom}
            onChange={(e) => setTargetRoom(e.target.value)}
            placeholder={`(元の教室 ${slot?.room || "未設定"} のまま)`}
            aria-label="振替先の教室"
            list={roomOptions.length > 0 ? roomListId : undefined}
            style={{ ...S.input, width: "100%" }}
          />
          {roomOptions.length > 0 && (
            <datalist id={roomListId}>
              {roomOptions.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          )}
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

        {showAutoSkip && (
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
        )}
      </div>

      {notes.length > 0 && (
        <div
          role="note"
          style={{
            background: "#eef4fb",
            border: "1px solid #c5d8ee",
            color: "#2a4a6a",
            padding: "6px 10px",
            margin: "0 10px 8px",
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

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
            color: colors.danger,
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
              color: colors.danger,
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
