import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { S } from "../styles/common";
import { colors } from "../styles/tokens";
import { useConfirm } from "../hooks/useConfirm";
import { useToasts } from "../hooks/useToasts";
import { defaultKeepSlotId, slotIdsToRemove } from "../utils/duplicateSlots";
import { describeOrphanDetection } from "../utils/orphanCleanup";

// ─── 同じ内容のコマの整理 (2026-11-19、P1-2) ─────────────────────────
// 時間割の中で、曜日・時刻・学年・クラス・科目・講師・教室・備考・担当の
// 切り替えまで同じコマの組 (utils/duplicateSlots.findDuplicateSlotGroups) を
// 並べ、組ごとに残すコマを選んで、ほかを消す。**自動では消さない** — 既定は
// 参照 (代行・調整・回数補正・休講日の例外) の多いコマを残す案で、消すのは
// 人が押したとき。コマを消すのは cascade あり (付いている代行・調整も消える)
// なので確認ダイアログを通す (CLAUDE.md の削除 UX)。

const RULES = [
  { value: "refs", label: "代行・調整などが付いている方を残す" },
  { value: "lowest", label: "番号の小さい方を残す" },
  { value: "highest", label: "番号の大きい方を残す" },
];

function slotLine(s) {
  return [
    `${s.day} ${s.time}`,
    s.grade,
    s.cls,
    s.subj,
    s.teacher ? `（${s.teacher}）` : "",
    s.room,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * @param {{
 *   timetable: {id: number, name: string},
 *   groups: {key: string, slots: object[]}[],
 *   refCounts: Map<string, number>,
 *   allSlots: object[],
 *   detectSlotRemoval?: (nextSlots: object[]) => {total: number} | null,
 *   onRemoveSlots: (ids: number[]) => {total: number} | null,
 *   isAdmin: boolean,
 *   onClose: () => void,
 * }} props
 */
export function DuplicateSlotsDialog({
  timetable,
  groups,
  refCounts,
  allSlots,
  detectSlotRemoval,
  onRemoveSlots,
  isAdmin,
  onClose,
}) {
  const confirm = useConfirm();
  const toasts = useToasts();
  const [rule, setRule] = useState("refs");
  // 人が組ごとに選び直した「残すコマ」。無い組は rule の既定
  const [picked, setPicked] = useState(() => new Map());
  const keepByKey = useMemo(() => {
    const out = new Map();
    for (const g of groups) {
      out.set(g.key, picked.get(g.key) ?? defaultKeepSlotId(g, refCounts, rule));
    }
    return out;
  }, [groups, picked, refCounts, rule]);
  const removeIds = useMemo(() => slotIdsToRemove(groups, keepByKey), [groups, keepByKey]);
  const refsOf = (s) => refCounts?.get(String(s.id)) || 0;

  const applyRule = (value) => {
    setRule(value);
    setPicked(new Map());
  };

  const pick = (key, id) => {
    setPicked((prev) => new Map(prev).set(key, id));
  };

  const run = async () => {
    if (!isAdmin || removeIds.length === 0) return;
    const drop = new Set(removeIds.map(String));
    const detection = detectSlotRemoval
      ? detectSlotRemoval((allSlots || []).filter((s) => !drop.has(String(s.id))))
      : null;
    const ok = await confirm({
      title: "同じ内容のコマを削除",
      message:
        `「${timetable.name}」の同じ内容のコマ ${removeIds.length} コマを削除します` +
        `（${groups.length} 組から 1 つずつ残します）。\n` +
        (detection && detection.total > 0
          ? `・消すコマに付いている ${describeOrphanDetection(detection)} も消えます / 外れます\n`
          : "・消すコマに付いている代行・調整などはありません\n") +
        "\nよろしいですか？",
      okLabel: "削除する",
      tone: "danger",
    });
    if (!ok) return;
    const done = onRemoveSlots(removeIds);
    toasts.success(
      `同じ内容のコマ ${removeIds.length} コマを削除しました` +
        (done && done.total > 0 ? `（${describeOrphanDetection(done)}）` : "")
    );
    onClose();
  };

  return (
    <Modal title={`「${timetable.name}」の同じ内容のコマ（${groups.length} 組）`} onClose={onClose} width={720}>
      <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6, marginBottom: 10 }}>
        曜日・時刻・学年・クラス・科目・講師・教室・備考・担当の切り替えまで同じコマが、
        この時間割に 2 つ以上入っています（時間割の削除でコマがデフォルト時間割へ移った、など）。
        組ごとに残すコマを 1 つ選び、ほかを削除します。<b>自動では消しません。</b>
        曜日や時刻が違うコマは別のコマとして扱うので、ここには並びません。
      </div>
      {isAdmin && (
        <div
          role="radiogroup"
          aria-label="残すコマの決め方"
          style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, marginBottom: 10 }}
        >
          {RULES.map((r) => (
            <label key={r.value} style={{ display: "inline-flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
              <input
                type="radio"
                name="duplicate-keep-rule"
                checked={rule === r.value && picked.size === 0}
                onChange={() => applyRule(r.value)}
              />
              {r.label}
            </label>
          ))}
        </div>
      )}
      <div
        style={{
          maxHeight: "55vh",
          overflowY: "auto",
          border: "1px solid #e4e7ee",
          borderRadius: 8,
          padding: "4px 10px",
        }}
      >
        {groups.map((g) => (
          <fieldset
            key={g.key}
            style={{ border: "none", borderBottom: "1px solid #f0f0f0", padding: "8px 0", margin: 0 }}
          >
            <legend style={{ fontSize: 12, fontWeight: 700, padding: 0 }}>{slotLine(g.slots[0])}</legend>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
              {g.slots.map((s) => {
                const keep = keepByKey.get(g.key) === s.id;
                const refs = refsOf(s);
                return (
                  <label
                    key={s.id}
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      fontSize: 12,
                      cursor: isAdmin ? "pointer" : "default",
                      color: keep ? "#1f5130" : "#888",
                    }}
                  >
                    {isAdmin && (
                      <input
                        type="radio"
                        name={`keep-${g.key}`}
                        checked={keep}
                        onChange={() => pick(g.key, s.id)}
                        aria-label={`コマ #${s.id} を残す`}
                      />
                    )}
                    <span style={{ fontWeight: keep ? 700 : 400 }}>
                      コマ #{s.id}
                      {isAdmin ? (keep ? " を残す" : " を削除") : ""}
                    </span>
                    <span style={{ fontSize: 11, color: refs > 0 ? "#2a4a7a" : "#aaa" }}>
                      {refs > 0 ? `代行・調整など ${refs} 件` : "代行・調整などなし"}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button type="button" onClick={onClose} style={S.btn(false)}>
          閉じる
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={run}
            disabled={removeIds.length === 0}
            style={{ ...S.btn(true), background: colors.danger }}
          >
            選んだとおりに {removeIds.length} コマを削除
          </button>
        )}
      </div>
    </Modal>
  );
}
