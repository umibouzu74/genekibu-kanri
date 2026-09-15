import { useCallback, useMemo, useState } from "react";
import { S } from "../../styles/common";
import { colors } from "../../styles/tokens";
import { formatCount, slotWeight } from "../../utils/biweekly";
import {
  describeOverlap,
  findDuplicateNameTimetable,
  findOverlappingTimetables,
  parseGradesInput,
  validateTimetableName,
  validateTimetablePeriod,
} from "../../utils/timetableOverlap";
import { FieldError } from "../FieldError";
import { ClassSetManager } from "../ClassSetManager";
import { CohortCutoffEditor } from "../CohortCutoffEditor";
import { TimeBulkEditPanel } from "../TimeBulkEditPanel";
import { CutoffTimeline } from "../CutoffTimeline";
import { DisplayCutoffEditor } from "../DisplayCutoffEditor";
import { useSessionCtx } from "../../hooks/useSessionCtx";

// ─── 時間割管理ビュー ─────────────────────────────────────────────────
// 時間割の一覧表示、作成、編集、削除、複製と表示期限設定を提供する。
//
// 作成 / 編集 / 複製のフォームは保存前に次を点検する (utils/timetableOverlap):
//   - 名前が空 / 開始日 > 終了日 → エラー (保存しない)
//   - 同じ名前の時間割がある → 警告 (保存はできる)
//   - 有効期間 × 対象学年が他の時間割と重なる → 警告 + 「重なりを承知で保存」
//     のチェックを要求する。前の期に終了日を入れ忘れると切替日以降どちらも
//     有効になりコマが二重に出る (CLAUDE.md「期切替の運用」) ので、その事故を
//     保存の手前で気付かせる。禁止にはしない (講習中だけ重ねる運用があり得る)

// フォーム 1 つぶんの点検結果。overlapKey は「承知で保存」のチェックを
// 紐付けるための署名 (重なる相手や区間が変わったらチェックを取り直す)
function checkTimetableForm(form, timetables, excludeId) {
  if (!form) return null;
  const overlaps = findOverlappingTimetables(form, timetables, { excludeId });
  return {
    nameError: validateTimetableName(form),
    periodError: validateTimetablePeriod(form),
    duplicate: findDuplicateNameTimetable(form.name, timetables, { excludeId }),
    overlaps,
    overlapKey: overlaps
      .map((o) => `${o.timetable.id}:${o.overlapStart || ""}:${o.overlapEnd || ""}:${o.sharedGrades.join("|")}`)
      .join(";"),
  };
}

export function TimetableManagerView({
  timetables,
  displayCutoff,
  slots,
  classSets,
  onSaveClassSets,
  ttCrud,
  onSaveDisplayCutoff,
  holidays = [],
  examPeriods = [],
  specialEvents = [],
  biweeklyAnchors = [],
  sessionOverrides = [],
  daySchedules = [],
  adjustments = [],
  isAdmin,
}) {
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(null);
  const [dupForm, setDupForm] = useState(null);
  // 保存を押した後だけ「名前を入力してください」を出す (開いた直後に赤くしない)
  const [formAttempted, setFormAttempted] = useState(false);
  const [dupAttempted, setDupAttempted] = useState(false);
  // 「重なりを承知で保存」: チェックした時点の overlapKey を持つ
  const [formAckKey, setFormAckKey] = useState(null);
  const [dupAckKey, setDupAckKey] = useState(null);

  const formChecks = useMemo(
    () => checkTimetableForm(form, timetables, editingId === "new" ? null : editingId),
    [form, timetables, editingId]
  );
  // 複製は新しい時間割なので何も除かない (複製元とも重なれば警告)。
  // 対象学年は複製元を引き継ぐ (useTimetablesCrud.duplicate は ...source)
  const dupSource = useMemo(
    () => (dupForm ? timetables.find((t) => t.id === dupForm.sourceId) : null),
    [dupForm, timetables]
  );
  const dupChecks = useMemo(
    () =>
      dupForm
        ? checkTimetableForm(
            { ...dupForm, grades: dupSource?.grades || [] },
            timetables,
            null
          )
        : null,
    [dupForm, dupSource, timetables]
  );

  // 「終了日を入れると実際の最終授業日はいつになるか」を逆算するための ctx。
  // 表示系と同じルール (休講・テスト期間・特別時程・隔週・時間割の有効期間) で
  // 判定したいので、ダッシュボード等と同じ useSessionCtx を使う。
  const { sessionCtx } = useSessionCtx({
    classSets,
    slots,
    displayCutoff,
    timetables,
    holidays,
    examPeriods,
    specialEvents,
    biweeklyAnchors,
    sessionOverrides,
    daySchedules,
    adjustments,
  });

  const startEdit = useCallback(
    (tt) => {
      setEditingId(tt.id);
      setFormAttempted(false);
      setFormAckKey(null);
      setForm({
        name: tt.name,
        type: tt.type,
        startDate: tt.startDate || "",
        endDate: tt.endDate || "",
        grades: (tt.grades || []).join(", "),
      });
    },
    []
  );

  const startNew = useCallback(() => {
    setEditingId("new");
    setFormAttempted(false);
    setFormAckKey(null);
    setForm({
      name: "",
      type: "regular",
      startDate: "",
      endDate: "",
      grades: "",
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setForm(null);
    setFormAttempted(false);
    setFormAckKey(null);
  }, []);

  const saveEdit = useCallback(() => {
    if (!form || !formChecks) return;
    setFormAttempted(true);
    if (formChecks.nameError || formChecks.periodError) return;
    if (formChecks.overlaps.length > 0 && formAckKey !== formChecks.overlapKey) return;
    const grades = parseGradesInput(form.grades);
    const data = {
      name: form.name.trim(),
      type: form.type,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      grades,
    };
    if (editingId === "new") {
      ttCrud.add(data);
    } else {
      ttCrud.update(editingId, data);
    }
    cancelEdit();
  }, [form, formChecks, formAckKey, editingId, ttCrud, cancelEdit]);

  const startDuplicate = useCallback(
    (tt) => {
      setDupAttempted(false);
      setDupAckKey(null);
      setDupForm({
        sourceId: tt.id,
        sourceName: tt.name,
        name: `${tt.name}（コピー）`,
        startDate: "",
        endDate: "",
      });
    },
    []
  );

  const cancelDuplicate = useCallback(() => {
    setDupForm(null);
    setDupAttempted(false);
    setDupAckKey(null);
  }, []);

  const executeDuplicate = useCallback(() => {
    if (!dupForm || !dupChecks) return;
    setDupAttempted(true);
    if (dupChecks.nameError || dupChecks.periodError) return;
    if (dupChecks.overlaps.length > 0 && dupAckKey !== dupChecks.overlapKey) return;
    ttCrud.duplicate(dupForm.sourceId, dupForm.name.trim(), {
      startDate: dupForm.startDate || null,
      endDate: dupForm.endDate || null,
    });
    cancelDuplicate();
  }, [dupForm, dupChecks, dupAckKey, ttCrud, cancelDuplicate]);

  const slotCountByTT = {};
  for (const s of slots) {
    const ttId = s.timetableId ?? 1;
    slotCountByTT[ttId] = (slotCountByTT[ttId] || 0) + slotWeight(s.note);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* 時間割一覧 */}
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
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid #e0e0e0",
            background: "#fafafa",
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 14 }}>時間割一覧</span>
          {isAdmin && (
            <button
              type="button"
              onClick={startNew}
              style={{ ...S.btn(false), background: "#e8f5e8", color: "#2a7a2a" }}
            >
              + 新規作成
            </button>
          )}
        </div>

        {/* 新規作成フォーム */}
        {editingId === "new" && (
          <TimetableForm
            form={form}
            setForm={setForm}
            onSave={saveEdit}
            onCancel={cancelEdit}
            checks={formChecks}
            attempted={formAttempted}
            ackKey={formAckKey}
            setAckKey={setFormAckKey}
            slotCountByTT={slotCountByTT}
          />
        )}

        {timetables.map((tt) => (
          <div key={tt.id}>
            {editingId === tt.id ? (
              <TimetableForm
                form={form}
                setForm={setForm}
                onSave={saveEdit}
                onCancel={cancelEdit}
                isDefault={tt.id === 1}
                checks={formChecks}
                attempted={formAttempted}
                ackKey={formAckKey}
                setAckKey={setFormAckKey}
                slotCountByTT={slotCountByTT}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 16px",
                  borderBottom: "1px solid #f0f0f0",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {tt.name}
                    {tt.id === 1 && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 9,
                          background: "#e0e0e0",
                          padding: "1px 5px",
                          borderRadius: 3,
                          fontWeight: 600,
                        }}
                      >
                        デフォルト
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                    {tt.startDate && tt.endDate
                      ? `${tt.startDate} 〜 ${tt.endDate}`
                      : tt.startDate
                        ? `${tt.startDate} 〜`
                        : tt.endDate
                          ? `〜 ${tt.endDate}`
                          : "期間: 無制限"}
                    {tt.grades?.length > 0 && (
                      <span style={{ marginLeft: 8 }}>
                        対象: {tt.grades.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
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
                  {formatCount(slotCountByTT[tt.id] || 0)} コマ
                </span>
                {isAdmin && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => startEdit(tt)}
                      style={{ ...S.btn(false), fontSize: 11, padding: "4px 8px" }}
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() => startDuplicate(tt)}
                      style={{ ...S.btn(false), fontSize: 11, padding: "4px 8px", background: "#e8eef8", color: "#2a4a8e" }}
                    >
                      複製
                    </button>
                    {tt.id !== 1 && (
                      <button
                        type="button"
                        onClick={() => ttCrud.remove(tt.id)}
                        style={{ ...S.btn(false), fontSize: 11, padding: "4px 8px", background: "#fde8e8", color: "#c03030" }}
                      >
                        削除
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 複製ダイアログ */}
      {dupForm && (
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            border: "2px solid #2a4a8e",
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>
            「{dupForm.sourceName}」を複製
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              新しい名前
              <input
                type="text"
                value={dupForm.name}
                onChange={(e) =>
                  setDupForm({ ...dupForm, name: e.target.value })
                }
                aria-invalid={dupAttempted && dupChecks?.nameError ? "true" : undefined}
                aria-describedby="tt-dup-name-err"
                style={{ ...S.input, marginTop: 2 }}
              />
              <FieldError id="tt-dup-name-err">
                {dupAttempted ? dupChecks?.nameError : null}
              </FieldError>
              <DuplicateNameNote duplicate={dupChecks?.duplicate} />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>
                開始日
                <input
                  type="date"
                  value={dupForm.startDate}
                  onChange={(e) =>
                    setDupForm({ ...dupForm, startDate: e.target.value })
                  }
                  style={{ ...S.input, marginTop: 2 }}
                />
              </label>
              <label style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>
                終了日
                <input
                  type="date"
                  value={dupForm.endDate}
                  min={dupForm.startDate || undefined}
                  onChange={(e) =>
                    setDupForm({ ...dupForm, endDate: e.target.value })
                  }
                  aria-invalid={dupChecks?.periodError ? "true" : undefined}
                  aria-describedby="tt-dup-period-err"
                  style={{ ...S.input, marginTop: 2 }}
                />
                <FieldError id="tt-dup-period-err">{dupChecks?.periodError}</FieldError>
              </label>
            </div>
            <OverlapWarning
              checks={dupChecks}
              ackKey={dupAckKey}
              setAckKey={setDupAckKey}
              slotCountByTT={slotCountByTT}
              idPrefix="tt-dup"
            />
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={cancelDuplicate}
                style={S.btn(false)}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={executeDuplicate}
                disabled={!canSave(dupChecks, dupAckKey)}
                style={{
                  ...S.btn(true),
                  background: "#2a4a8e",
                  opacity: canSave(dupChecks, dupAckKey) ? 1 : 0.5,
                }}
              >
                複製する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 時刻一括変換 (期切替支援) */}
      <TimeBulkEditPanel
        timetables={timetables}
        slots={slots}
        ttCrud={ttCrud}
        isAdmin={isAdmin}
      />

      {/* 期間の全体像 (時間割 / 学年グループ / コースを同じ物差しで並べる) */}
      <CutoffTimeline
        timetables={timetables}
        slots={slots}
        displayCutoff={displayCutoff}
      />

      {/* 表示期限設定 (学年グループの開始日 / 終了日 / オリエン) */}
      <DisplayCutoffEditor
        slots={slots}
        displayCutoff={displayCutoff}
        onSave={onSaveDisplayCutoff}
        isAdmin={isAdmin}
        sessionCtx={sessionCtx}
      />

      {/* コース別 終講日設定 (学校別・曜日別) */}
      <CohortCutoffEditor
        slots={slots}
        displayCutoff={displayCutoff}
        onSave={onSaveDisplayCutoff}
        isAdmin={isAdmin}
        sessionCtx={sessionCtx}
      />

      {/* 授業セット管理 */}
      <ClassSetManager
        classSets={classSets || []}
        slots={slots}
        onSave={onSaveClassSets}
        isAdmin={isAdmin}
      />
    </div>
  );
}

// 保存ボタンを押せる条件。名前の空は「押した後に赤く出す」ので押せるまま
// (押した時点で saveEdit が止める)。開始日 > 終了日 と、未承知の重なりは
// 押せない (理由は画面に出ている)
function canSave(checks, ackKey) {
  if (!checks) return false;
  if (checks.periodError) return false;
  if (checks.overlaps.length > 0 && ackKey !== checks.overlapKey) return false;
  return true;
}

// 同じ名前の時間割があるときの注意 (保存は妨げない。ヘッダの時間割セレクタで
// 見分けが付かなくなるだけ)
function DuplicateNameNote({ duplicate }) {
  if (!duplicate) return null;
  return (
    <div role="status" style={{ fontSize: 11, color: "#8a4a00", marginTop: 2 }}>
      ⚠ 同じ名前の時間割「{duplicate.name}」があります (時間割の切替で見分けにくくなります)
    </div>
  );
}

// 有効期間 × 対象学年の重なり警告 + 「重なりを承知で保存」
function OverlapWarning({ checks, ackKey, setAckKey, slotCountByTT, idPrefix }) {
  const overlaps = checks?.overlaps || [];
  if (overlaps.length === 0) return null;
  const acked = ackKey === checks.overlapKey;
  const boxId = `${idPrefix}-overlap-ack`;
  return (
    <div
      role="alert"
      style={{
        fontSize: 11,
        color: "#8a4a00",
        background: "#fff6e5",
        border: "1px solid #f0c070",
        borderRadius: 6,
        padding: "8px 10px",
        lineHeight: 1.7,
      }}
    >
      <div style={{ fontWeight: 800 }}>
        ⚠ 有効期間が他の時間割と重なります ({overlaps.length} 件)
      </div>
      <ul style={{ margin: "2px 0 4px", paddingLeft: 18 }}>
        {overlaps.map((o) => (
          <li key={o.timetable.id}>
            {describeOverlap(o)}
            <span style={{ color: "#a07040", marginLeft: 4 }}>
              — {formatCount(slotCountByTT?.[o.timetable.id] || 0)} コマ
            </span>
          </li>
        ))}
      </ul>
      <div style={{ color: "#a07040" }}>
        重なる期間はどちらの時間割のコマも表示されます。
        前の期の終了日を入れると二重に出ません。
      </div>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginTop: 4,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        <input
          id={boxId}
          type="checkbox"
          checked={acked}
          onChange={(e) => setAckKey(e.target.checked ? checks.overlapKey : null)}
        />
        重なりを承知で保存
      </label>
    </div>
  );
}

function TimetableForm({
  form,
  setForm,
  onSave,
  onCancel,
  isDefault,
  checks,
  attempted,
  ackKey,
  setAckKey,
  slotCountByTT,
}) {
  const saveEnabled = canSave(checks, ackKey);
  return (
    <div
      style={{
        padding: 16,
        background: "#f8fafe",
        borderBottom: "1px solid #e0e0e0",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 600 }}>
          名前
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="例: 2026年度 1学期"
            aria-invalid={attempted && checks?.nameError ? "true" : undefined}
            aria-describedby="tt-form-name-err"
            style={{
              ...S.input,
              marginTop: 2,
              borderColor: attempted && checks?.nameError ? colors.danger : undefined,
            }}
          />
          <FieldError id="tt-form-name-err">
            {attempted ? checks?.nameError : null}
          </FieldError>
          <DuplicateNameNote duplicate={checks?.duplicate} />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>
            開始日
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              style={{ ...S.input, marginTop: 2 }}
            />
          </label>
          <label style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>
            終了日
            <input
              type="date"
              value={form.endDate}
              min={form.startDate || undefined}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              aria-invalid={checks?.periodError ? "true" : undefined}
              aria-describedby="tt-form-period-err"
              style={{
                ...S.input,
                marginTop: 2,
                borderColor: checks?.periodError ? colors.danger : undefined,
              }}
            />
            <FieldError id="tt-form-period-err">{checks?.periodError}</FieldError>
          </label>
        </div>
        <label style={{ fontSize: 12, fontWeight: 600 }}>
          対象学年（カンマ区切り、空欄で全学年）
          <input
            type="text"
            value={form.grades}
            onChange={(e) => setForm({ ...form, grades: e.target.value })}
            placeholder="例: 中1, 中2, 中3, 附中1, 附中2, 附中3"
            disabled={isDefault}
            style={{ ...S.input, marginTop: 2, ...(isDefault ? { opacity: 0.5 } : {}) }}
          />
          {isDefault && (
            <span style={{ fontSize: 10, color: "#888" }}>
              デフォルト時間割は全学年対象です
            </span>
          )}
        </label>
        <OverlapWarning
          checks={checks}
          ackKey={ackKey}
          setAckKey={setAckKey}
          slotCountByTT={slotCountByTT}
          idPrefix="tt-form"
        />
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onCancel} style={S.btn(false)}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!saveEnabled}
            style={{
              ...S.btn(true),
              opacity: saveEnabled ? 1 : 0.5,
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
