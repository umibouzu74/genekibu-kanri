import { useState } from "react";
import { DEPT_COLOR, gradeToDept, isValidDateStr } from "../../data";
import { S, VISUALLY_HIDDEN } from "../../styles/common";
import { colors } from "../../styles/tokens";

// テスト期間フォームの「例外的に授業を行う日」(classExceptions) の編集欄
// (ExamPeriodManager から 2026-09-05 に切り出し)。
// 登録済みの一覧は親が持ち (保存時の検証で使う)、ここは追加 / 削除の下書き
// (日付・学年・メモ・エラー) だけを持つ。親はフォームをリセットするとき
// key を変えて下書きも消す。
//   gradeChoices … 例外日で選べる学年 (テスト期間が全学年対象なら全学年)
export function ExamClassExceptionsEditor({
  stopsClasses,
  classExceptions,
  onChange,
  startDate,
  endDate,
  gradeChoices,
}) {
  const [exDate, setExDate] = useState("");
  const [exGrades, setExGrades] = useState([]);
  const [exMemo, setExMemo] = useState("");
  const [exError, setExError] = useState("");

  const toggleExGrade = (g) => {
    setExError("");
    setExGrades((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
  };

  const addException = () => {
    setExError("");
    if (!exDate || !isValidDateStr(exDate)) {
      setExError("日付を正しく入力してください");
      return;
    }
    if (startDate && endDate && (exDate < startDate || exDate > endDate)) {
      setExError(`テスト期間 (${startDate} 〜 ${endDate}) の中の日付にしてください`);
      return;
    }
    if (classExceptions.some((ex) => ex.date === exDate)) {
      setExError("その日は既に登録されています (先に削除してください)");
      return;
    }
    // 対象学年を全部選んだ / 何も選ばなかった = 対象学年すべて (空配列で保存)
    const all = gradeChoices.length > 0
      && gradeChoices.every((g) => exGrades.includes(g));
    const grades = all ? [] : exGrades.filter((g) => gradeChoices.includes(g));
    const next = [
      ...classExceptions,
      { date: exDate, grades, memo: exMemo.trim() },
    ].sort((a, b) => a.date.localeCompare(b.date));
    onChange(next);
    setExDate("");
    setExGrades([]);
    setExMemo("");
  };

  const removeException = (date) => {
    onChange(classExceptions.filter((ex) => ex.date !== date));
    setExError("");
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
        例外的に授業を行う日 (任意)
      </div>
      {!stopsClasses ? (
        <div style={{ fontSize: 10, color: "#888" }}>
          「授業を休止する」が OFF のテスト期間では設定不要です (元々授業は継続します)。
        </div>
      ) : (
        <>
          <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>
            特訓は始まっているが通常授業は休みにしない日を指定します
            (例: 9/19 土の中3)。指定した日は休止扱いにならず、通常どおり
            コマ・第N回・出勤日に出ます。
          </div>
          {classExceptions.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                marginBottom: 8,
              }}
            >
              {classExceptions.map((ex) => (
                <div
                  key={ex.date}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                    fontSize: 11,
                    background: "#f2f7f2",
                    border: "1px solid #cfe0cf",
                    borderRadius: 6,
                    padding: "3px 8px",
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{ex.date}</span>
                  <span style={{ color: "#3a6b3a" }}>
                    {(ex.grades || []).length === 0
                      ? "対象学年すべて"
                      : ex.grades.join("・")}
                    {" は授業あり"}
                  </span>
                  {ex.memo && (
                    <span style={{ color: "#888" }}>／ {ex.memo}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeException(ex.date)}
                    aria-label={`${ex.date} の例外を削除`}
                    style={{
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      fontSize: 12,
                      marginLeft: "auto",
                      padding: 0,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              type="date"
              value={exDate}
              min={startDate || undefined}
              max={endDate || undefined}
              onChange={(e) => {
                setExDate(e.target.value);
                setExError("");
              }}
              aria-label="例外的に授業を行う日"
              style={{ ...S.input, width: "auto" }}
            />
            <input
              value={exMemo}
              onChange={(e) => setExMemo(e.target.value)}
              placeholder="メモ (任意)"
              aria-label="例外日のメモ"
              style={{ ...S.input, width: 160, fontSize: 11 }}
            />
            <button type="button" onClick={addException} style={S.btn(false)}>
              ＋ 追加
            </button>
          </div>
          {gradeChoices.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 4,
                flexWrap: "wrap",
                alignItems: "center",
                marginTop: 6,
              }}
            >
              <span style={{ fontSize: 10, color: "#888" }}>
                授業を行う学年 (未選択 = 対象学年すべて):
              </span>
              {gradeChoices.map((g) => {
                const sel = exGrades.includes(g);
                const dept = gradeToDept(g);
                const col = DEPT_COLOR[dept] || { b: "#eee", f: "#444" };
                return (
                  <label
                    key={g}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: sel ? col.b : "#f5f5f5",
                      color: sel ? col.f : "#aaa",
                      border: `1px solid ${sel ? col.accent || "#ccc" : "#ddd"}`,
                      fontWeight: sel ? 700 : 400,
                      userSelect: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => toggleExGrade(g)}
                      aria-label={`${g} は授業を行う`}
                      style={VISUALLY_HIDDEN}
                    />
                    {g}
                  </label>
                );
              })}
            </div>
          )}
          {exError && (
            <div
              role="alert"
              style={{ fontSize: 11, color: colors.danger, marginTop: 6 }}
            >
              {exError}
            </div>
          )}
        </>
      )}
    </div>
  );
}
