import { useCallback, useState } from "react";
import { S } from "../../styles/common";
import { formatCount, slotWeight } from "../../utils/biweekly";
import { ClassSetManager } from "../ClassSetManager";

// ─── 時間割管理ビュー ─────────────────────────────────────────────────
// 時間割の一覧表示、作成、編集、削除、複製と表示期限設定を提供する。
export function TimetableManagerView({
  timetables,
  displayCutoff,
  slots,
  classSets,
  onSaveClassSets,
  ttCrud,
  onSaveDisplayCutoff,
  isAdmin,
}) {
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(null);
  const [dupForm, setDupForm] = useState(null);

  const startEdit = useCallback(
    (tt) => {
      setEditingId(tt.id);
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
  }, []);

  const saveEdit = useCallback(() => {
    if (!form || !form.name.trim()) return;
    const grades = form.grades
      .split(/[,、\s]+/)
      .map((g) => g.trim())
      .filter(Boolean);
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
  }, [form, editingId, ttCrud, cancelEdit]);

  const startDuplicate = useCallback(
    (tt) => {
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

  const executeDuplicate = useCallback(() => {
    if (!dupForm || !dupForm.name.trim()) return;
    ttCrud.duplicate(dupForm.sourceId, dupForm.name.trim(), {
      startDate: dupForm.startDate || null,
      endDate: dupForm.endDate || null,
    });
    setDupForm(null);
  }, [dupForm, ttCrud]);

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
                style={{ ...S.input, marginTop: 2 }}
              />
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
                  onChange={(e) =>
                    setDupForm({ ...dupForm, endDate: e.target.value })
                  }
                  style={{ ...S.input, marginTop: 2 }}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setDupForm(null)}
                style={S.btn(false)}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={executeDuplicate}
                style={{ ...S.btn(true), background: "#2a4a8e" }}
              >
                複製する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 表示期限設定 */}
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
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 14 }}>表示期間設定</span>
          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
            各学年グループの表示期間（開始日〜終了日）を設定します。
            この範囲外の予定はダッシュボード等に表示されません。
          </div>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {displayCutoff?.groups?.map((group, idx) => (
            <div
              key={group.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  minWidth: 80,
                }}
              >
                {group.label}
              </span>
              <input
                type="date"
                value={group.startDate || ""}
                onChange={(e) => {
                  if (!isAdmin) return;
                  const newGroups = [...displayCutoff.groups];
                  newGroups[idx] = {
                    ...newGroups[idx],
                    startDate: e.target.value || null,
                  };
                  onSaveDisplayCutoff({ ...displayCutoff, groups: newGroups });
                }}
                disabled={!isAdmin}
                style={{ ...S.input, width: "auto", minWidth: 140 }}
              />
              <span style={{ fontSize: 12, color: "#888" }}>〜</span>
              <input
                type="date"
                value={group.date || ""}
                onChange={(e) => {
                  if (!isAdmin) return;
                  const newGroups = [...displayCutoff.groups];
                  newGroups[idx] = {
                    ...newGroups[idx],
                    date: e.target.value || null,
                  };
                  onSaveDisplayCutoff({ ...displayCutoff, groups: newGroups });
                }}
                disabled={!isAdmin}
                style={{ ...S.input, width: "auto", minWidth: 140 }}
              />
              {(group.startDate || group.date) && isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    const newGroups = [...displayCutoff.groups];
                    newGroups[idx] = { ...newGroups[idx], startDate: null, date: null };
                    onSaveDisplayCutoff({ ...displayCutoff, groups: newGroups });
                  }}
                  style={{ ...S.btn(false), fontSize: 10, padding: "3px 6px" }}
                >
                  解除
                </button>
              )}
              <span style={{ fontSize: 10, color: "#aaa" }}>
                {(group.grades || []).join(", ")}
              </span>
            </div>
          ))}
        </div>
      </div>

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

function TimetableForm({ form, setForm, onSave, onCancel, isDefault }) {
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
            style={{ ...S.input, marginTop: 2 }}
          />
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
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              style={{ ...S.input, marginTop: 2 }}
            />
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
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onCancel} style={S.btn(false)}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!form.name.trim()}
            style={{
              ...S.btn(true),
              opacity: form.name.trim() ? 1 : 0.5,
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
