import { useRef, useState } from "react";
import {
  ALL_GRADES,
  DEPT_COLOR,
  HIGH_GRADES,
  MIDDLE_GRADES,
  gradeToDept,
  isValidDateStr,
} from "../data";
import { nextNumericId } from "../utils/schema";
import { useConfirm } from "../hooks/useConfirm";
import { useToasts } from "../hooks/useToasts";
import { useEditTarget, useNewEntryTarget } from "../hooks/useEditTarget";
import { S, VISUALLY_HIDDEN } from "../styles/common";
import { colors } from "../styles/tokens";
import { ExamPrepScheduleEditor } from "./ExamPrepScheduleEditor";
import { ExamClassExceptionsEditor } from "./examPeriod/ExamClassExceptionsEditor";
import { ExamPeriodList } from "./examPeriod/ExamPeriodList";
import { findScheduleByExamPeriodId } from "../utils/examPrepHelpers";
import { TAG_META } from "../constants/eventKinds";

export function ExamPeriodManager({
  examPeriods,
  onSave,
  isAdmin,
  partTimeStaff = [],
  examPrepSchedules = [],
  examPrepCrud = null,
  slots = [],
  subjects = [],
  teacherSubjects = {},
  teacherKana = {},
  knownTags = [],
  editTargetId = null,
  onConsumeEditTarget,
  newEntryToken = null,
  onConsumeNewEntry,
}) {
  const formRef = useRef(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [targetGrades, setTargetGrades] = useState([]);
  const [allGrades, setAllGrades] = useState(true);
  const [stopsClasses, setStopsClasses] = useState(true);
  // 例外的に授業を行う日 ({ date, grades, memo } の配列)。
  const [classExceptions, setClassExceptions] = useState([]);
  // 例外日の下書きは ExamClassExceptionsEditor が持つ。フォームのリセット /
  // 編集開始で key を進めて下書きを消す
  const [formEpoch, setFormEpoch] = useState(0);
  const [tagsArr, setTagsArr] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState("");
  const [scheduleEditingEp, setScheduleEditingEp] = useState(null);
  const toasts = useToasts();
  const confirm = useConfirm();

  // 既存タグ集合 (親 App から共通空間として受け取る、五十音順済み)。
  // 自身の examPeriods は親が availableTags 集約時に既に取り込み済み。
  const existingTagSet = knownTags;

  const addTag = (raw) => {
    const t = raw.trim();
    if (!t) return;
    if (tagsArr.includes(t)) return;
    setTagsArr([...tagsArr, t]);
    setTagInput("");
  };

  const removeTag = (t) => {
    setTagsArr(tagsArr.filter((x) => x !== t));
  };


  const toggleGrade = (g) => {
    if (allGrades) {
      // Switch from "all" to specific selection with this grade toggled off
      setAllGrades(false);
      setTargetGrades(ALL_GRADES.filter((gr) => gr !== g));
      return;
    }
    const next = targetGrades.includes(g)
      ? targetGrades.filter((x) => x !== g)
      : [...targetGrades, g];
    // If all grades deselected, revert to "all" mode
    if (next.length === 0) {
      setAllGrades(true);
      setTargetGrades([]);
    } else {
      setTargetGrades(next);
    }
  };

  const selectAll = () => {
    setAllGrades(true);
    setTargetGrades([]);
  };

  const selectMiddle = () => {
    setAllGrades(false);
    setTargetGrades(MIDDLE_GRADES);
    // 中学テストは授業停止が既定挙動
    setStopsClasses(true);
  };

  const selectHigh = () => {
    setAllGrades(false);
    setTargetGrades(HIGH_GRADES);
    // 高校テストは授業継続が既定挙動 (各校別管理 + 通塾は止めない)
    setStopsClasses(false);
  };

  const isGradeSelected = (g) => allGrades || targetGrades.includes(g);

  const handleAdd = () => {
    setError("");
    if (!name.trim()) {
      setError("名称を入力してください");
      return;
    }
    if (!startDate || !isValidDateStr(startDate)) {
      setError("開始日を正しく入力してください");
      return;
    }
    if (!endDate || !isValidDateStr(endDate)) {
      setError("終了日を正しく入力してください");
      return;
    }
    if (endDate < startDate) {
      setError("終了日は開始日以降にしてください");
      return;
    }
    if (!allGrades && targetGrades.length === 0) {
      setError("対象学年を選択してください");
      return;
    }
    // 期間を編集した結果、例外日が範囲外に出ることがある。
    const outside = classExceptions
      .filter((ex) => ex.date < startDate || ex.date > endDate)
      .map((ex) => ex.date);
    if (outside.length > 0) {
      setError(
        `例外的に授業を行う日が期間外です: ${outside.join(", ")} (削除するか期間を直してください)`
      );
      return;
    }

    const grades = allGrades ? [] : [...targetGrades];
    // 入力中のタグも保存対象に含める (Enter を押し忘れた場合の救済)
    const pending = tagInput.trim();
    const tags = pending && !tagsArr.includes(pending)
      ? [...tagsArr, pending]
      : [...tagsArr];
    const payload = {
      name: name.trim(),
      startDate,
      endDate,
      targetGrades: grades,
      stopsClasses,
      tags,
      // 対象学年から外れた例外学年は保存しない (対象外の学年は元々授業がある)
      classExceptions: classExceptions.map((ex) => ({
        date: ex.date,
        grades: grades.length === 0
          ? [...(ex.grades || [])]
          : (ex.grades || []).filter((g) => grades.includes(g)),
        memo: ex.memo || "",
      })),
    };
    if (editId != null) {
      const updated = examPeriods.map((ep) =>
        ep.id === editId ? { ...ep, ...payload } : ep
      );
      onSave(updated);
      toasts.success("テスト期間を更新しました");
    } else {
      onSave([
        ...examPeriods,
        { id: nextNumericId(examPeriods), ...payload },
      ]);
      toasts.success("テスト期間を追加しました");
    }
    resetForm();
  };

  const handleEdit = (ep) => {
    setName(ep.name);
    setStartDate(ep.startDate);
    setEndDate(ep.endDate);
    if (ep.targetGrades.length === 0) {
      setAllGrades(true);
      setTargetGrades([]);
    } else {
      setAllGrades(false);
      setTargetGrades([...ep.targetGrades]);
    }
    // 既存データは stopsClasses 未設定 = true 扱い (中学テスト相当)
    setStopsClasses(ep.stopsClasses !== false);
    setClassExceptions(
      [...(ep.classExceptions || [])]
        .map((ex) => ({
          date: ex.date,
          grades: [...(ex.grades || [])],
          memo: ex.memo || "",
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
    );
    setFormEpoch((e) => e + 1);
    setTagsArr([...(ep.tags || [])]);
    setTagInput("");
    setEditId(ep.id);
    setError("");
  };

  const resetForm = () => {
    setName("");
    setStartDate("");
    setEndDate("");
    setTargetGrades([]);
    setAllGrades(true);
    setStopsClasses(true);
    setClassExceptions([]);
    setFormEpoch((e) => e + 1);
    setTagsArr([]);
    setTagInput("");
    setEditId(null);
    setError("");
  };

  const handleDel = async (ep) => {
    const sch = findScheduleByExamPeriodId(examPrepSchedules, ep.id);
    const hasSchedule = sch && (sch.days || []).length > 0;
    const ok = await confirm({
      title: "テスト期間の削除",
      message:
        `「${ep.name}」（${ep.startDate} 〜 ${ep.endDate}）を削除しますか？` +
        (hasSchedule
          ? `\n\n※特訓シフト設定（${sch.days.length} 日分）も同時に削除されます。`
          : ""),
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    if (hasSchedule && examPrepCrud) {
      examPrepCrud.cascadeDeletePeriod(ep.id);
    }
    onSave(examPeriods.filter((e) => e.id !== ep.id));
    toasts.success("テスト期間を削除しました");
  };

  const sorted = [...examPeriods].sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );

  useEditTarget({
    editTargetId,
    items: examPeriods,
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

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          fontSize: 15,
          fontWeight: 800,
          marginBottom: 10,
          color: "#1a1a2e",
          borderBottom: "2px solid #e0a030",
          paddingBottom: 6,
        }}
      >
        テスト期間管理
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
            {editId != null ? "テスト期間を編集" : "テスト期間を追加"}
          </div>

          {/* 名称 */}
          <div style={{ marginBottom: 10 }}>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              placeholder="名称（例: 1学期中間テスト期間）"
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? "exam-period-err" : undefined}
              style={{ ...S.input, width: "100%", maxWidth: 340, borderColor: error ? colors.danger : "#ccc" }}
            />
          </div>

          {/* 期間 */}
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700 }}>期間:</span>
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (error) setError("");
              }}
              style={{ ...S.input, width: "auto" }}
            />
            <span style={{ fontSize: 12, color: "#888" }}>〜</span>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => {
                setEndDate(e.target.value);
                if (error) setError("");
              }}
              style={{ ...S.input, width: "auto" }}
            />
          </div>

          {/* 対象学年 */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700 }}>対象学年:</span>
              <button
                type="button"
                onClick={selectAll}
                style={{
                  ...S.btn(allGrades),
                  fontSize: 11,
                  padding: "4px 10px",
                }}
              >
                全学年
              </button>
              <button
                type="button"
                onClick={selectMiddle}
                style={{
                  ...S.btn(
                    !allGrades &&
                      MIDDLE_GRADES.every((g) => targetGrades.includes(g)) &&
                      !HIGH_GRADES.some((g) => targetGrades.includes(g))
                  ),
                  fontSize: 11,
                  padding: "4px 10px",
                  background:
                    !allGrades &&
                    MIDDLE_GRADES.every((g) => targetGrades.includes(g)) &&
                    !HIGH_GRADES.some((g) => targetGrades.includes(g))
                      ? DEPT_COLOR["中学部"].accent
                      : undefined,
                }}
              >
                中学部一括
              </button>
              <button
                type="button"
                onClick={selectHigh}
                style={{
                  ...S.btn(
                    !allGrades &&
                      HIGH_GRADES.every((g) => targetGrades.includes(g)) &&
                      !MIDDLE_GRADES.some((g) => targetGrades.includes(g))
                  ),
                  fontSize: 11,
                  padding: "4px 10px",
                  background:
                    !allGrades &&
                    HIGH_GRADES.every((g) => targetGrades.includes(g)) &&
                    !MIDDLE_GRADES.some((g) => targetGrades.includes(g))
                      ? DEPT_COLOR["高校部"].accent
                      : undefined,
                }}
              >
                高校部一括
              </button>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {ALL_GRADES.map((g) => {
                const dept = gradeToDept(g);
                const col = DEPT_COLOR[dept] || { b: "#eee", f: "#444" };
                const sel = isGradeSelected(g);
                return (
                  <label
                    key={g}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: sel ? col.b : "#f5f5f5",
                      color: sel ? col.f : "#aaa",
                      border: `1px solid ${sel ? col.accent || "#ccc" : "#ddd"}`,
                      fontWeight: sel ? 700 : 400,
                      transition: "all .15s",
                      userSelect: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => toggleGrade(g)}
                      style={VISUALLY_HIDDEN}
                    />
                    {g}
                  </label>
                );
              })}
            </div>
          </div>

          {/* 授業休止フラグ */}
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={stopsClasses}
                onChange={(e) => setStopsClasses(e.target.checked)}
              />
              <span style={{ fontWeight: 700 }}>
                授業を休止する (対象学年の通常コマを停止)
              </span>
            </label>
            <div style={{ fontSize: 10, color: "#888", marginTop: 4, paddingLeft: 22 }}>
              {stopsClasses
                ? "中学テスト等。期間中は対象学年のコマが「休止扱い」になります。"
                : "高校テスト等。表示のみで通常授業は継続します。"}
            </div>
          </div>

          {/* 例外的に授業を行う日 (下書きは子が持つ。key でリセット) */}
          <ExamClassExceptionsEditor
            key={formEpoch}
            stopsClasses={stopsClasses}
            classExceptions={classExceptions}
            onChange={setClassExceptions}
            startDate={startDate}
            endDate={endDate}
            gradeChoices={allGrades ? ALL_GRADES : targetGrades}
          />

          {/* タグ */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              タグ (学校名等、任意)
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              {tagsArr.map((t) => (
                <span
                  key={t}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    padding: "2px 4px 2px 8px",
                    borderRadius: 12,
                    background: TAG_META.bg,
                    color: TAG_META.fg,
                    border: `1px solid ${TAG_META.accent}`,
                    fontWeight: 700,
                  }}
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    aria-label={`タグ ${t} を外す`}
                    style={{
                      border: "none",
                      background: TAG_META.accent,
                      color: TAG_META.fg,
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
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                placeholder="例: 桜井 (Enter で追加)"
                style={{ ...S.input, width: 160, padding: "3px 8px", fontSize: 11 }}
              />
            </div>
            {existingTagSet.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "#888" }}>既存タグ:</span>
                {existingTagSet
                  .filter((t) => !tagsArr.includes(t))
                  .map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => addTag(t)}
                      style={{
                        fontSize: 10,
                        padding: "1px 8px",
                        borderRadius: 10,
                        border: `1px dashed ${TAG_META.accent}`,
                        background: "#fff",
                        color: TAG_META.fg,
                        cursor: "pointer",
                      }}
                    >
                      + {t}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {error && (
            <div
              id="exam-period-err"
              role="alert"
              style={{ fontSize: 11, color: colors.danger, marginBottom: 8 }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleAdd} style={S.btn(true)}>
              {editId != null ? "更新" : "追加"}
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
      <ExamPeriodList
        sorted={sorted}
        editId={editId}
        isAdmin={isAdmin}
        examPrepCrud={examPrepCrud}
        examPrepSchedules={examPrepSchedules}
        onEdit={handleEdit}
        onDel={handleDel}
        onOpenSchedule={setScheduleEditingEp}
      />
      <div style={{ marginTop: 12, fontSize: 11, color: "#888" }}>
        ※「授業を休止する」が ON のテスト期間は対象学年の通常コマが休止扱いになります (中学テスト等)。
        OFF にすると表示のみで授業は継続します (高校テスト等)。
        「例外的に授業を行う日」を登録すると、その日だけ休止せず通常どおり授業を行います
        (特訓は始まっているが授業は休みにしない日)。タグは学校名等の任意ラベルで、表示の整理に使えます。
        {examPrepCrud && "「特訓シフト」から出勤日・校時を設定できます (アルバイト・常勤共通)。"}
      </div>

      {scheduleEditingEp && examPrepCrud && (
        <ExamPrepScheduleEditor
          examPeriod={scheduleEditingEp}
          schedule={findScheduleByExamPeriodId(
            examPrepSchedules,
            scheduleEditingEp.id
          )}
          partTimeStaff={partTimeStaff}
          slots={slots}
          subjects={subjects}
          teacherSubjects={teacherSubjects}
          teacherKana={teacherKana}
          crud={examPrepCrud}
          onClose={() => setScheduleEditingEp(null)}
        />
      )}
    </div>
  );
}
