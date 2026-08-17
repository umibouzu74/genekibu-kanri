import { useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import { S } from "../styles/common";
import { useToasts } from "../hooks/useToasts";
import { useConfirm } from "../hooks/useConfirm";
import { addSnapshot } from "./model";
import {
  applyReflection,
  buildReflectionPlan,
  buildSwitchPlan,
  describeDiffChange,
  describeDiffRecord,
  diffReflection,
  projectGrades,
} from "./reflect";
import {
  countUntouchedSlots,
  describeScope,
  isScopeLimited,
  normalizeScope,
} from "./reflectScope";
import { ReflectScopePicker } from "./ReflectScopePicker";

// 差分リストの最大表示行数 (超過分は「…他 n 件」)
const DIFF_LINE_LIMIT = 12;

function DiffLines({ mark, color, records, describe }) {
  const shown = records.slice(0, DIFF_LINE_LIMIT);
  return (
    <>
      {shown.map((r, i) => (
        <div key={i} style={{ color, fontSize: 11 }}>
          {mark} {describe(r)}
        </div>
      ))}
      {records.length > shown.length && (
        <div style={{ color: "#888", fontSize: 10 }}>
          …他 {records.length - shown.length} 件
        </div>
      )}
    </>
  );
}

// ─── 反映ダイアログ ─────────────────────────────────────────────────
// 下書きを本体の時間割 + コマに書き出す。新規作成 (時間割を作る) と
// 置き換え (既存時間割のコマを差し替え) の 2 モード。置き換えは位置の
// 一致したコマの slot.id を引き継ぐので代行・調整・回数補正・授業セットの
// 紐付けは保たれるが、下書きに無いコマは削除される (= cascade) ため確認
// ダイアログを挟む (CLAUDE.md 削除 UX ルールの confirmedRemove 相当)。
//
// 新規作成には「期切替」(1学期 → 2学期) の支援がある。本体の表示は 2 経路
// あり、どちらも面倒を見ないと切り替わったように見えない:
//   - 日付ベース (ダッシュボード / タイムテーブル / 代行など)
//     → 時間割の startDate/endDate。旧時間割を切替日の前日で終了させないと
//       新旧のコマが重なって出る
//   - 集計ベース (週表示・月間・一覧など「現在の時間割」)
//     → ヘッダの時間割セレクタ (activeTimetableId)
// 期切替をオンにすると前者を自動で、後者も反映後の自動切替で面倒を見る。

export function ReflectDialog({
  project,
  timetables,
  slots,
  saveTimetables,
  saveSlots,
  saveProject,
  /** 期切替の点検に使う本体データ (表示期間設定・授業セット) */
  displayCutoff,
  classSets,
  /** ヘッダの時間割セレクタの現在値 (期切替の既定の「前の時間割」) */
  activeTimetableId,
  /** 反映後に表示中の時間割を切り替える (App.jsx の changeActiveTimetable) */
  onActivateTimetable,
  onClose,
}) {
  const toasts = useToasts();
  const confirm = useConfirm();
  const [mode, setMode] = useState("new");
  const [name, setName] = useState(project.name || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [targetId, setTargetId] = useState(timetables[timetables.length - 1]?.id ?? 1);
  // 期切替 (新規作成のみ)。開始日 = 切替日として、前の時間割をその前日で
  // 終了させる
  const [switchTerm, setSwitchTerm] = useState(false);
  const [closeId, setCloseId] = useState(() =>
    timetables.some((t) => t.id === activeTimetableId)
      ? activeTimetableId
      : timetables[timetables.length - 1]?.id ?? 1
  );
  // 反映後にヘッダの時間割セレクタを新しい時間割へ向ける
  const [activateAfter, setActivateAfter] = useState(false);
  // 新規作成時に「この時間割は下書きの学年だけ」と絞るか。既定は従来どおり
  // 全学年 (timetable.grades 空 = 全学年マッチ)。1 つの時間割で全学年を
  // まかなう運用が普通なので、絞るのは明示的な選択にする
  const [limitGrades, setLimitGrades] = useState(false);
  // 反映する範囲 (学年 × 曜日)。既定は絞らない = プロジェクト全体
  const [limitScope, setLimitScope] = useState(false);
  const [rawScope, setRawScope] = useState({ days: [], grades: [] });
  // タブを消した後に古い選択が残ると「何も反映されない理由が分からない」
  // 状態になるので、プロジェクトの語彙に正規化してから使う
  const scope = useMemo(
    () => (limitScope ? normalizeScope(rawScope, project) : { days: [], grades: [] }),
    [limitScope, rawScope, project]
  );
  const scoped = isScopeLimited(scope);
  // 「対象学年を限定する」で入れる学年。**範囲を学年で絞ったらそれに従う** —
  // 中2 だけ反映したのに timetable.grades に中3 が入ると、コマの無い学年を
  // 担当する時間割になってしまう (日付ベースの表示・期切替の点検が狂う)
  const grades = useMemo(
    () => (scope.grades.length > 0 ? scope.grades : projectGrades(project)),
    [scope.grades, project]
  );

  const useSwitch = mode === "new" && switchTerm;

  const opts = useMemo(() => {
    const base = { mode, name, targetTimetableId: Number(targetId) };
    if (mode === "replace") {
      // 置き換えでは空欄 = 据え置き (undefined を渡すと applyReflection が現値を維持)
      if (startDate) base.startDate = startDate;
      if (endDate) base.endDate = endDate;
    } else {
      base.startDate = startDate || null;
      base.endDate = endDate || null;
      if (limitGrades && grades.length > 0) base.grades = grades;
      if (switchTerm) base.closeTimetableId = Number(closeId);
    }
    if (scoped) base.scope = scope;
    return base;
  }, [mode, name, startDate, endDate, targetId, limitGrades, grades, switchTerm, closeId, scoped, scope]);
  const plan = useMemo(() => buildReflectionPlan(project, opts), [project, opts]);
  // 期切替の計画 (旧時間割に入れる終了日と、その検証)
  const switchPlan = useMemo(
    () =>
      useSwitch
        ? buildSwitchPlan({
            timetables,
            slots,
            startDate,
            closeTimetableId: Number(closeId),
            grades: opts.grades,
            displayCutoff,
            classSets,
          })
        : null,
    [useSwitch, timetables, slots, startDate, closeId, opts.grades, displayCutoff, classSets]
  );
  const canExecute = plan.ok && (!switchPlan || switchPlan.ok);
  const total = plan.drafts.length;
  const replaceTargetCount = useMemo(
    () =>
      mode === "replace"
        ? slots.filter((s) => (s.timetableId ?? 1) === Number(targetId)).length
        : 0,
    [mode, slots, targetId]
  );
  // 範囲を絞った置き換えで「触らない」既存コマ数。削除件数だけ見せると
  // 範囲外まで消えるように読めるので、守られる件数を明示する
  const untouchedCount = useMemo(
    () =>
      mode === "replace" ? countUntouchedSlots(slots, Number(targetId), scope) : 0,
    [mode, slots, targetId, scope]
  );
  // 置き換え時の差分プレビュー (変わらず / 変更 / 追加 / 削除)
  const diff = useMemo(
    () =>
      mode === "replace" && plan.drafts.length > 0
        ? diffReflection(plan.drafts, slots, Number(targetId), scope)
        : null,
    [mode, plan.drafts, slots, targetId, scope]
  );

  const execute = async () => {
    if (!canExecute) return;
    if (useSwitch) {
      // 旧時間割の終了日を書き換える = このダイアログで編集していない
      // 既存データに触る操作なので、実行前に何が起きるかを見せて確認する
      const ok = await confirm({
        title: "期切替として反映",
        message:
          `・新しい時間割「${(opts.name || "").trim()}」を ${startDate} から開始します（${total} コマ` +
          (scoped ? ` / ${describeScope(scope)} のみ` : "") +
          `）\n` +
          (switchPlan.changesEndDate
            ? `・「${switchPlan.target?.name ?? "?"}」の終了日を ${switchPlan.endDate} に設定します` +
              `（コマは消しません。切替日より前の日付では従来どおり表示され、代行・調整の紐付けも残ります）\n`
            : `・「${switchPlan.target?.name ?? "?"}」は既に ${switchPlan.target?.endDate} で終了しているため変更しません\n`) +
          (activateAfter
            ? `・表示中の時間割を新しい方に切り替えます（週表示・月間などの「現在の時間割」）\n`
            : "") +
          `\nよろしいですか？`,
        okLabel: "期切替を実行",
      });
      if (!ok) return;
    }
    if (mode === "replace") {
      const target = timetables.find((t) => t.id === Number(targetId));
      // 位置の一致したコマは同じコマとして引き継がれる (applyReflection が
      // slot.id を保つ)。紐付けが切れるのは実際に消える差分だけなので、
      // 確認文もその実態に合わせる
      const kept = diff ? diff.unchanged + diff.changed.length : 0;
      const lost = diff ? diff.removed.length : replaceTargetCount;
      const ok = await confirm({
        title: scoped ? `時間割の置き換え（${describeScope(scope)} のみ）` : "時間割の置き換え",
        message:
          (scoped
            ? `「${target?.name ?? "?"}」の${describeScope(scope)}を、下書きの ${total} コマに差し替えます。\n` +
              `・範囲外の ${untouchedCount} コマは触りません（削除もされません）\n`
            : `「${target?.name ?? "?"}」の ${replaceTargetCount} コマを、下書きの ${total} コマに差し替えます。\n`) +
          `・同じ位置 (曜日・時刻・学年・クラス) の ${kept} コマは同じコマとして引き継ぎます` +
          `（代行・調整・回数補正・授業セットの紐付けは保たれます）\n` +
          (lost > 0
            ? `・${scoped ? "範囲内で" : ""}下書きに無い ${lost} コマは削除されます。そのコマに紐づく代行・調整・回数補正・授業セットは無効になります\n`
            : "・削除されるコマはありません\n") +
          `\nよろしいですか？`,
        okLabel: "置き換える",
        tone: "danger",
      });
      if (!ok) return;
    }
    const result = applyReflection(plan, opts, { timetables, slots });
    if (result.error) {
      toasts.error(result.error);
      return;
    }
    saveTimetables(result.timetables);
    saveSlots(result.slots);
    // 「現在の時間割」を見る集計ビュー (週表示・月間・一覧) は
    // activeTimetableId で絞るため、反映しただけでは切り替わらない
    if (activateAfter) onActivateTimetable?.(result.timetableId);
    // 反映した時点の状態を自動スナップショットで残す (「本体に出したのは
    // どの状態か」に後から必ず戻れる安全網)。他のスナップショット操作と
    // 同じく Ctrl+Z で取り消せる
    const reflectedName =
      (opts.name || "").trim() ||
      timetables.find((t) => t.id === result.timetableId)?.name ||
      "";
    saveProject?.(
      (p) =>
        addSnapshot(
          p,
          `⤴ 反映: ${reflectedName || "本体"}${scoped ? ` (${describeScope(scope)})` : ""}`,
          Date.now()
        ),
      { atomic: true }
    );
    toasts.success(
      (scoped ? `【${describeScope(scope)} のみ】` : "") +
        (mode === "replace"
          ? `置き換えました（引き継ぎ ${result.keptCount}（うち内容変更 ${result.changedCount}）` +
            ` / 追加 ${result.addedCount} / 削除 ${result.removedCount} コマ` +
            (result.untouchedCount > 0 ? ` / 範囲外 ${result.untouchedCount} コマは据え置き` : "") +
            `）`
          : `時間割「${opts.name}」として ${result.addedCount} コマを反映しました`) +
        (result.closed
          ? `／「${result.closed.name}」は ${result.closed.endDate} で終了`
          : "") +
        (activateAfter ? "／表示中の時間割を切り替えました" : "") +
        "／📌 反映時点の案を保存しました"
    );
    onClose();
  };

  const radio = (value, label) => (
    <label style={{ fontSize: 12, fontWeight: 600, display: "inline-flex", gap: 4, alignItems: "center" }}>
      <input
        type="radio"
        name="reflect-mode"
        checked={mode === value}
        onChange={() => setMode(value)}
      />
      {label}
    </label>
  );

  return (
    <Modal title="本体へ反映" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12 }}>
        <div style={{ display: "flex", gap: 16 }}>
          {radio("new", "新しい時間割として作成")}
          {radio("replace", "既存の時間割を置き換え")}
        </div>

        {mode === "replace" && (
          <label style={{ fontWeight: 600 }}>
            置き換え先
            <select
              value={targetId}
              onChange={(e) => setTargetId(Number(e.target.value))}
              style={{ ...S.input, marginTop: 2, display: "block", minWidth: 200 }}
            >
              {timetables.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 10, color: "#888", fontWeight: 400 }}>
              現在 {replaceTargetCount} コマ。同じ位置 (曜日・時刻・学年・クラス)
              のコマは同じコマとして引き継ぎ、下書きに無いコマだけ削除します。
            </span>
          </label>
        )}

        <label style={{ fontWeight: 600 }}>
          時間割の名前{mode === "replace" ? "（空欄で据え置き）" : ""}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 2026 後期"
            style={{ ...S.input, marginTop: 2 }}
          />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ flex: 1, fontWeight: 600 }}>
            {useSwitch ? "切替日（開始日）" : "開始日"}
            {mode === "replace" ? "（空欄で据え置き）" : ""}
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ ...S.input, marginTop: 2 }}
            />
          </label>
          <label style={{ flex: 1, fontWeight: 600 }}>
            終了日{mode === "replace" ? "（空欄で据え置き）" : ""}
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ ...S.input, marginTop: 2 }}
            />
          </label>
        </div>

        {/* 期切替 (1学期 → 2学期) */}
        {mode === "new" && (
          <div
            style={{
              background: "#f4f8f4",
              border: "1px solid #d8e6d8",
              borderRadius: 8,
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={switchTerm}
                onChange={(e) => {
                  setSwitchTerm(e.target.checked);
                  // 期の切替なら表示中の時間割も新しい方に向けるのが既定
                  if (e.target.checked) setActivateAfter(true);
                }}
                style={{ marginTop: 2 }}
              />
              <span>
                期切替として反映する（1学期 → 2学期）
                <div style={{ fontSize: 10, color: "#888", fontWeight: 400, lineHeight: 1.7 }}>
                  前の時間割を切替日の前日で終了させ、2 つの期を隙間なく
                  つなぎます。オフのままだと切替日以降どちらの時間割も有効な
                  ままで、ダッシュボード等に新旧のコマが重なって出ます。
                </div>
              </span>
            </label>

            {switchTerm && (
              <label style={{ fontWeight: 600 }}>
                前の時間割（終了させる）
                <select
                  value={closeId}
                  onChange={(e) => setCloseId(Number(e.target.value))}
                  style={{ ...S.input, marginTop: 2, display: "block", minWidth: 200 }}
                >
                  {timetables.map((tt) => (
                    <option key={tt.id} value={tt.id}>
                      {tt.name}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 10, color: "#888", fontWeight: 400 }}>
                  {!switchPlan?.endDate
                    ? "切替日 (上の開始日) を入れると終了日 = その前日が決まります"
                    : switchPlan.changesEndDate
                      ? `終了日を ${switchPlan.endDate} に設定します。` +
                        `${switchPlan.slotCount} コマは消さずに残るので、` +
                        `代行・調整・回数補正・授業セットの紐付けも切れません`
                      : "既に切替日より前で終わっているため、終了日は変更しません"}
                </span>
              </label>
            )}

            {switchPlan?.warnings.map((w) => (
              <div key={w} style={{ color: "#9a6b00", fontSize: 11 }}>⚠ {w}</div>
            ))}
            {switchPlan?.errors.map((e) => (
              <div key={e} style={{ color: "#c03030", fontSize: 11 }}>✕ {e}</div>
            ))}
          </div>
        )}

        {mode === "new" && grades.length > 0 && (
          <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={limitGrades}
              onChange={(e) => setLimitGrades(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              対象学年を下書きの学年に限定する（{grades.join("・")}）
              <div style={{ fontSize: 10, color: "#888", fontWeight: 400, lineHeight: 1.7 }}>
                入れないと全学年が対象の時間割になります（既定）。
                学年ごとに別の時間割を並行して使う場合だけ入れてください。
              </div>
            </span>
          </label>
        )}

        {/* 反映する範囲 (学年 × 曜日)。2 モードどちらでも使える */}
        <ReflectScopePicker
          project={project}
          scope={rawScope}
          onChange={setRawScope}
          effectiveScope={scope}
          limited={limitScope}
          onLimitedChange={setLimitScope}
          inScopeCount={total}
          untouchedCount={mode === "replace" ? untouchedCount : null}
        />

        {/* 表示の追従 (集計ベースのビュー)。反映の 2 モードどちらでも使う */}
        <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={activateAfter}
            onChange={(e) => setActivateAfter(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            反映後、表示中の時間割を
            {mode === "replace" ? "反映先の時間割" : "新しい時間割"}に切り替える
            <div style={{ fontSize: 10, color: "#888", fontWeight: 400, lineHeight: 1.7 }}>
              週表示・月間・一覧など「現在の時間割」を見るビュー
              (ヘッダの時間割セレクタ) の対象になります。日付で表示するビュー
              (ダッシュボード等) は時間割の開始日・終了日で自動的に切り替わる
              ので、この設定とは関係ありません。
            </div>
          </span>
        </label>

        {/* プレビュー */}
        <div style={{ background: "#f6f8fc", borderRadius: 8, padding: 10 }}>
          <div style={{ fontWeight: 700 }}>反映されるコマ: {total} 件</div>
          {plan.perTab.map(({ tabName, count }) => (
            <div key={tabName} style={{ color: "#555" }}>
              {tabName}: {count} 件
            </div>
          ))}
        </div>

        {/* 置き換え時の差分プレビュー */}
        {diff && (
          <div style={{ background: "#fbfbf6", border: "1px solid #e8e4d0", borderRadius: 8, padding: 10, maxHeight: 220, overflowY: "auto" }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              置き換えによる差分:
              <span style={{ marginLeft: 8, color: "#888" }}>変わらず {diff.unchanged}</span>
              <span style={{ marginLeft: 8, color: "#9a6b00" }}>変更 {diff.changed.length}</span>
              <span style={{ marginLeft: 8, color: "#2a7a2a" }}>追加 {diff.added.length}</span>
              <span style={{ marginLeft: 8, color: "#c03030" }}>削除 {diff.removed.length}</span>
            </div>
            <DiffLines
              mark="✎"
              color="#9a6b00"
              records={diff.changed}
              describe={(c) =>
                `${describeDiffRecord(c.after)}: ${describeDiffChange(c.before, c.after) || "内容変更"}`
              }
            />
            <DiffLines
              mark="＋"
              color="#2a7a2a"
              records={diff.added}
              describe={(r) => `${describeDiffRecord(r)} ${r.subj}`}
            />
            <DiffLines
              mark="－"
              color="#c03030"
              records={diff.removed}
              describe={(r) => `${describeDiffRecord(r)} ${r.subj}`}
            />
            {diff.changed.length === 0 && diff.added.length === 0 && diff.removed.length === 0 && (
              <div style={{ color: "#888", fontSize: 11 }}>内容の変化はありません。</div>
            )}
          </div>
        )}
        {plan.warnings.map((w) => (
          <div key={w} style={{ color: "#9a6b00", fontSize: 11 }}>⚠ {w}</div>
        ))}
        {plan.errors.map((e) => (
          <div key={e} style={{ color: "#c03030", fontSize: 11 }}>✕ {e}</div>
        ))}

        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={S.btn(false)}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={execute}
            disabled={!canExecute}
            style={{ ...S.btn(true), background: "#2a4a8e", opacity: canExecute ? 1 : 0.5 }}
          >
            {useSwitch ? "切り替える" : "反映する"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
