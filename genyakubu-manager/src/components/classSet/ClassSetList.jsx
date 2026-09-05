import { DEPT_COLOR, gradeToDept } from "../../data";
import { S } from "../../styles/common";
import { colors } from "../../styles/tokens";
import { expandClassSetSlotIds, isLegacySet, unitKey } from "../../utils/classSets";
import { unitLabel } from "../../utils/classSetSuggestions";

// 授業セットの登録済み一覧 (ClassSetManager から 2026-09-05 に切り出し)。
// 表示だけを持ち、編集 / 削除 / 旧形式の変換は親のハンドラを呼ぶ。
//   legacyConversion … 旧形式 (slotIds) → units 変換の見積り (件数の増減)
export function ClassSetList({
  classSets,
  slots,
  editId,
  isAdmin,
  legacyConversion,
  onEdit,
  onDelete,
  onConvertLegacy,
}) {
  return (
    <>
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#555" }}>
        登録済み ({classSets.length}件)
      </div>
      {classSets.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: "#bbb",
            padding: 20,
            fontSize: 12,
            background: "#f8f9fa",
            borderRadius: 6,
          }}
        >
          まだ授業セットが登録されていません
        </div>
      ) : (
        classSets.map((cs) => {
          const legacy = isLegacySet(cs);
          const idSet = new Set(expandClassSetSlotIds(cs, slots));
          const setSlots = slots.filter((s) => idSet.has(s.id));
          // 表示するユニット: units 形式は定義そのもの (対象コマが 0 でも
          // 「どの学年 × 曜日を指しているか」を出す)、旧形式は現存コマから逆算。
          const conv = legacy ? legacyConversion(cs) : null;
          const setUnits = legacy ? conv.units : cs.units || [];
          const dept = setUnits[0] ? gradeToDept(setUnits[0].grade) : null;
          const col = dept
            ? DEPT_COLOR[dept]
            : { b: "#eee", f: "#444", accent: "#aaa" };
          return (
            <div
              key={cs.id}
              style={{
                padding: "8px 12px",
                background: editId === cs.id ? "#fffbe6" : "#f8f9fa",
                border: `1px solid ${editId === cs.id ? "#e0c060" : "#e8e8e8"}`,
                borderRadius: 6,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: col.accent,
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{cs.label}</span>
                  <span style={{ fontSize: 10, color: "#888" }}>
                    {setUnits.length} ユニット / {setSlots.length} コマ
                  </span>
                  {legacy && (
                    <span
                      style={{
                        fontSize: 9,
                        padding: "1px 5px",
                        borderRadius: 8,
                        background: "#fff3d6",
                        color: "#8a6d1f",
                        border: "1px solid #e8d08a",
                      }}
                      title="コマ id を直接指しています。期切替で紐付けが切れます"
                    >
                      旧形式 (コマ id 固定)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "#666", lineHeight: 1.6 }}>
                  {setUnits.map((u) => (
                    <span
                      key={unitKey(u.grade, u.day)}
                      style={{
                        display: "inline-block",
                        marginRight: 8,
                        padding: "1px 6px",
                        background: "#fff",
                        border: "1px solid #e0e0e0",
                        borderRadius: 10,
                      }}
                    >
                      {unitLabel(u)}
                    </span>
                  ))}
                  {legacy && setSlots.length < cs.slotIds.length && (
                    <span style={{ color: colors.danger }}> ※ 一部スロット削除済み</span>
                  )}
                  {!legacy && setSlots.length === 0 && (
                    <span style={{ color: colors.danger }}> ※ 対象のコマがありません</span>
                  )}
                  {legacy && conv.after > conv.before && (
                    <div style={{ color: "#8a6d1f", marginTop: 2 }}>
                      ⚠ 変換すると対象が {conv.before} → {conv.after} コマに増えます
                      （同じ学年・曜日の他のクラスも入ります）
                    </div>
                  )}
                </div>
              </div>
              {isAdmin && (
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {legacy && (
                    <button
                      type="button"
                      onClick={() => onConvertLegacy(cs)}
                      aria-label={`${cs.label} を曜日ベースに変換`}
                      style={{
                        ...S.btn(false),
                        fontSize: 10,
                        padding: "3px 8px",
                        color: "#8a6d1f",
                      }}
                    >
                      曜日ベースに変換
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onEdit(cs)}
                    aria-label={`${cs.label} を編集`}
                    style={{ ...S.btn(false), fontSize: 10, padding: "3px 8px" }}
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(cs)}
                    aria-label={`${cs.label} を削除`}
                    style={{
                      ...S.btn(false),
                      fontSize: 10,
                      padding: "3px 8px",
                      color: colors.danger,
                    }}
                  >
                    削除
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
    </>
  );
}
