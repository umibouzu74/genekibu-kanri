import { useRef, useState } from "react";
import { ALL_GRADES, isValidDateStr, fmtDateWeekday } from "../data";
import { EXTRA_LESSON_COLOR } from "../constants/colors";
import { nextNumericId } from "../utils/schema";
import { describeExtraLesson } from "../utils/extraLessons";
import { splitTeacherField } from "../utils/biweekly";
import { useToasts } from "../hooks/useToasts";
import { useRemoveWithUndo } from "../hooks/useCrudResource";
import { useEditTarget, useNewEntryTarget } from "../hooks/useEditTarget";
import { S } from "../styles/common";
import { colors } from "../styles/tokens";

// よく使う種別ラベルの候補 (自由入力も可)。
const LABEL_PRESETS = ["夏期講習", "冬期講習", "春期講習", "テスト対策", "補講"];

// ─── 追加授業管理 ───────────────────────────────────────────────
// 週次の時間割 (Slot) とは別に「特定日付にのみ実施する単発コマ」を登録する。
// 例: プレップの夏期講習 4 回分、テスト対策の特別授業。
// 実施日を複数選んで一括登録できる (日付以外のフィールドは共通)。
// 削除は cascade が無い単純削除なので removeWithUndo (Undo トースト) を使う
// (リポジトリ CLAUDE.md の削除 UX ルール)。
export function ExtraLessonManager({
  extraLessons,
  onSave,
  isAdmin,
  // イベントカレンダー等の外部からの編集 / 新規登録ジャンプ (H1b)。
  editTargetId = null,
  onConsumeEditTarget,
  newEntryToken = null,
  onConsumeNewEntry,
  /** 担当講師の候補 (useSlotsCrud.suggestions.teachers) */
  teacherSuggestions = [],
}) {
  const toasts = useToasts();
  const formRef = useRef(null);
  const [dates, setDates] = useState([]); // 実施日 (複数可)
  const [dateInput, setDateInput] = useState("");
  const [time, setTime] = useState("");
  const [grade, setGrade] = useState("");
  const [cls, setCls] = useState("");
  const [room, setRoom] = useState("");
  const [subj, setSubj] = useState("");
  const [teacher, setTeacher] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [editId, setEditId] = useState(null); // 編集中は単一レコード (日付 1 つ)
  const [error, setError] = useState("");

  const removeLessonWithUndo = useRemoveWithUndo({
    list: extraLessons,
    save: onSave,
  });

  const addDate = () => {
    if (!dateInput || !isValidDateStr(dateInput)) return;
    if (dates.includes(dateInput)) return;
    setDates([...dates, dateInput].sort());
    setDateInput("");
    if (error) setError("");
  };

  const removeDate = (d) => setDates(dates.filter((x) => x !== d));

  const resetForm = () => {
    setDates([]);
    setDateInput("");
    setTime("");
    setGrade("");
    setCls("");
    setRoom("");
    setSubj("");
    setTeacher("");
    setLabel("");
    setNote("");
    setEditId(null);
    setError("");
  };

  const handleSubmit = () => {
    setError("");
    // 日付入力欄に入れたまま「追加」を押し忘れた場合の救済
    const effectiveDates =
      dates.length === 0 && dateInput && isValidDateStr(dateInput)
        ? [dateInput]
        : dates;
    if (effectiveDates.length === 0) {
      setError("実施日を 1 日以上追加してください");
      return;
    }
    if (!time.trim()) {
      setError("時間を入力してください (例: 18:30-19:30)");
      return;
    }
    if (!grade.trim()) {
      setError("対象学年を入力してください");
      return;
    }
    if (!subj.trim()) {
      setError("科目・講座名を入力してください");
      return;
    }
    const base = {
      time: time.trim(),
      grade: grade.trim(),
      cls: cls.trim(),
      room: room.trim(),
      subj: subj.trim(),
      // 複数講師の区切りを正史の "·" に正規化して保存する。IME の素の入力は
      // "・" (全角中点) になりがちで、そのまま保存すると "·" しか見ない
      // 消費側 (代行ピッカー等) で複数講師と認識されない。マッチング側
      // (isSlotForTeacher) も両方受けるが、保存データは 1 種類に揃える。
      teacher: splitTeacherField(teacher).join("·"),
      label: label.trim(),
      note: note.trim(),
    };
    if (editId != null) {
      onSave(
        extraLessons.map((l) =>
          l.id === editId ? { ...l, ...base, date: effectiveDates[0] } : l
        )
      );
      toasts.success("追加授業を更新しました");
    } else {
      // 複数日を 1 回の save で一括登録 (id は連番)
      let nextId = nextNumericId(extraLessons);
      const records = effectiveDates.map((date) => ({
        id: nextId++,
        date,
        ...base,
      }));
      onSave([...extraLessons, ...records]);
      toasts.success(`追加授業を ${records.length} 件登録しました`);
    }
    resetForm();
  };

  const handleEdit = (l) => {
    setDates([l.date]);
    setDateInput("");
    setTime(l.time);
    setGrade(l.grade);
    setCls(l.cls || "");
    setRoom(l.room || "");
    setSubj(l.subj);
    setTeacher(l.teacher || "");
    setLabel(l.label || "");
    setNote(l.note || "");
    setEditId(l.id);
    setError("");
  };

  // 一覧の内容をフォームへ複製して「新規登録」状態にする (次の講習期を作る
  // ときの入力の手間を減らす)。実施日は新しい回のものを選ぶはずなので
  // 引き継がない (前回の日付のまま誤登録する事故を防ぐ)。
  const handleCopy = (l) => {
    setDates([]);
    setDateInput("");
    setTime(l.time);
    setGrade(l.grade);
    setCls(l.cls || "");
    setRoom(l.room || "");
    setSubj(l.subj);
    setTeacher(l.teacher || "");
    setLabel(l.label || "");
    setNote(l.note || "");
    setEditId(null);
    setError("");
    toasts.success("内容をフォームにコピーしました。実施日を追加して登録してください");
  };

  const handleDel = (l) => {
    if (editId === l.id) resetForm();
    removeLessonWithUndo(l.id, {
      successMsg: `追加授業を削除しました（${l.date} ${describeExtraLesson(l)}）`,
    });
  };

  const sorted = [...extraLessons].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id
  );

  useEditTarget({
    editTargetId,
    items: extraLessons,
    onEdit: handleEdit,
    onConsume: onConsumeEditTarget,
    formRef,
    isAdmin,
  });

  useNewEntryTarget({
    token: newEntryToken,
    onReset: resetForm,
    onConsume: onConsumeNewEntry,
    formRef,
    isAdmin,
  });

  const fieldRow = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 };
  const fieldLabel = { fontSize: 12, fontWeight: 700 };

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          fontSize: 15,
          fontWeight: 800,
          marginBottom: 10,
          color: "#1a1a2e",
          borderBottom: `2px solid ${EXTRA_LESSON_COLOR.color}`,
          paddingBottom: 6,
        }}
      >
        追加授業管理
      </div>

      {isAdmin && (
        <div
          ref={formRef}
          style={{
            background: "#fff",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            border: "1px solid #e0e0e0",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            {editId != null ? "追加授業を編集" : "追加授業を登録"}
          </div>

          {/* 実施日 (複数) */}
          <div style={fieldRow}>
            <span style={fieldLabel}>実施日:</span>
            {dates.map((d) => (
              <span
                key={d}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 4px 2px 8px",
                  borderRadius: 12,
                  background: EXTRA_LESSON_COLOR.bg,
                  color: EXTRA_LESSON_COLOR.color,
                  border: `1px solid ${EXTRA_LESSON_COLOR.color}`,
                }}
              >
                {fmtDateWeekday(d)}
                {editId == null && (
                  <button
                    type="button"
                    onClick={() => removeDate(d)}
                    aria-label={`実施日 ${d} を外す`}
                    style={{
                      border: "none",
                      background: EXTRA_LESSON_COLOR.color,
                      color: "#fff",
                      borderRadius: "50%",
                      width: 16,
                      height: 16,
                      lineHeight: "14px",
                      fontSize: 11,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {(editId == null || dates.length === 0) && (
              <>
                <input
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  aria-label="実施日を選択"
                  style={{ ...S.input, width: "auto" }}
                />
                <button
                  type="button"
                  onClick={addDate}
                  style={{ ...S.btn(false), fontSize: 11, padding: "4px 10px" }}
                >
                  ＋ 日付を追加
                </button>
                {editId == null && (
                  <span style={{ fontSize: 10, color: "#888" }}>
                    （複数日を選ぶと同じ内容で一括登録。例: 夏期講習4回分）
                  </span>
                )}
              </>
            )}
          </div>

          {/* 時間・学年・クラス・教室 */}
          <div style={fieldRow}>
            <span style={fieldLabel}>時間:</span>
            <input
              value={time}
              onChange={(e) => { setTime(e.target.value); if (error) setError(""); }}
              placeholder="18:30-19:30"
              aria-label="時間"
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? "extra-lesson-err" : undefined}
              style={{ ...S.input, width: 120 }}
            />
            <span style={fieldLabel}>学年:</span>
            <input
              value={grade}
              onChange={(e) => { setGrade(e.target.value); if (error) setError(""); }}
              placeholder="中3 / 高1高2 など"
              aria-label="対象学年"
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? "extra-lesson-err" : undefined}
              list="extra-lesson-grades"
              style={{ ...S.input, width: 110 }}
            />
            <datalist id="extra-lesson-grades">
              {ALL_GRADES.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <span style={fieldLabel}>クラス:</span>
            <input
              value={cls}
              onChange={(e) => setCls(e.target.value)}
              placeholder="任意"
              aria-label="クラス"
              style={{ ...S.input, width: 80 }}
            />
            <span style={fieldLabel}>教室:</span>
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="任意"
              aria-label="教室"
              style={{ ...S.input, width: 80 }}
            />
          </div>

          {/* 科目・講師 */}
          <div style={fieldRow}>
            <span style={fieldLabel}>科目・講座名:</span>
            <input
              value={subj}
              onChange={(e) => { setSubj(e.target.value); if (error) setError(""); }}
              placeholder="プレップ個別指導 / 英語 など"
              aria-label="科目・講座名"
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? "extra-lesson-err" : undefined}
              style={{ ...S.input, width: 200 }}
            />
            <span style={fieldLabel}>担当:</span>
            {/* 講師名は自由入力なので、既存の講師名を候補に出して表記ゆれ
                (末尾空白・別の名前) を防ぐ。保存時に splitTeacherField で
                区切りを正規化するのは従来どおり */}
            {teacherSuggestions.length > 0 && (
              <datalist id="extra-lesson-teachers">
                {teacherSuggestions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            )}
            <input
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              placeholder="堀上 / 香川・福江 など（複数可）"
              aria-label="担当講師"
              list={teacherSuggestions.length > 0 ? "extra-lesson-teachers" : undefined}
              style={{ ...S.input, width: 160 }}
            />
          </div>

          {/* 種別ラベル・メモ */}
          <div style={fieldRow}>
            <span style={fieldLabel}>種別:</span>
            {LABEL_PRESETS.map((p) => {
              const sel = label === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setLabel(sel ? "" : p)}
                  style={{ ...S.btn(sel), fontSize: 11, padding: "4px 10px" }}
                >
                  {p}
                </button>
              );
            })}
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="自由入力も可"
              aria-label="種別ラベル"
              style={{ ...S.input, width: 120 }}
            />
          </div>
          <div style={fieldRow}>
            <span style={fieldLabel}>メモ:</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="任意"
              aria-label="メモ"
              style={{ ...S.input, width: "100%", maxWidth: 360 }}
            />
          </div>

          {error && (
            <div
              id="extra-lesson-err"
              role="alert"
              style={{ fontSize: 11, color: colors.danger, marginBottom: 8 }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSubmit} style={S.btn(true)}>
              {editId != null ? "更新" : "登録"}
            </button>
            {editId != null && (
              <button onClick={resetForm} style={S.btn(false)}>
                キャンセル
              </button>
            )}
          </div>
        </div>
      )}

      {/* 一覧 */}
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          overflow: "hidden",
        }}
      >
        {sorted.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "#888",
              padding: "32px 20px",
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            <div aria-hidden="true" style={{ fontSize: 28, marginBottom: 6 }}>
              ➕
            </div>
            <div style={{ fontWeight: 700, color: "#555", marginBottom: 4 }}>
              登録された追加授業はありません
            </div>
            {isAdmin && (
              <div style={{ fontSize: 12, color: "#888" }}>
                夏期講習の追加回やテスト対策の特別授業など、通常の時間割に無い単発の授業をここで登録します
              </div>
            )}
          </div>
        ) : (
          sorted.map((l, i) => (
            <div
              key={l.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 14px",
                borderBottom: i < sorted.length - 1 ? "1px solid #eee" : "none",
                background:
                  editId === l.id ? "#fffbe6" : i % 2 ? "#f8f9fa" : "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: EXTRA_LESSON_COLOR.bg,
                    color: EXTRA_LESSON_COLOR.color,
                    border: `1px solid ${EXTRA_LESSON_COLOR.color}`,
                  }}
                >
                  追{l.label ? ` ${l.label}` : ""}
                </span>
                <strong style={{ fontSize: 13 }}>{fmtDateWeekday(l.date)}</strong>
                <span style={{ fontSize: 12, color: "#333" }}>{l.time}</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  {describeExtraLesson(l)}
                </span>
                {l.teacher && (
                  <span style={{ fontSize: 11, color: "#666" }}>{l.teacher}</span>
                )}
                {l.room && (
                  <span style={{ fontSize: 11, color: "#888" }}>@{l.room}</span>
                )}
                {l.note && (
                  <span style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}>
                    {l.note}
                  </span>
                )}
              </div>
              {isAdmin && (
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => handleCopy(l)}
                    aria-label={`${l.date} ${describeExtraLesson(l)} をコピー`}
                    title="内容をフォームに複製 (実施日は選び直し)"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 12,
                      padding: 2,
                    }}
                  >
                    📋
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(l)}
                    aria-label={`${l.date} ${describeExtraLesson(l)} を編集`}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 12,
                      padding: 2,
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDel(l)}
                    aria-label={`${l.date} ${describeExtraLesson(l)} を削除`}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: "#888" }}>
        ※追加授業はダッシュボード (日別・時間割の両モード) と
        イベントカレンダー (表示トグル ON 時) に表示され、Cmd+K 検索からも
        引けます。担当講師を入力すると、その講師の月間カレンダー・週間予定の
        直近リストにも表示されます (担当未入力のコマは全体ビューのみ)。
        授業回数のカウント (第N回) には含まれません。
      </div>
    </div>
  );
}
