import { useId, useMemo, useState } from "react";
import { Modal } from "./Modal";
import { useToasts } from "../hooks/useToasts";
import { nextNumericId } from "../utils/schema";
import { fmtDate, fmtMD, formatDateRange } from "../utils/dateHelpers";
import { fiscalYearOf } from "../utils/teacherAffiliations";
import {
  EXAM_PERIOD_TSV_HEADER,
  buildImportedExamPeriods,
  parseExamPeriodImport,
} from "../utils/examPeriodImport";
import { schoolGradeLabel } from "../utils/schoolSchedule";
import { S } from "../styles/common";
import { colors } from "../styles/tokens";

const STATUS_META = {
  ok: { label: "OK", color: colors.success },
  duplicate: { label: "重複", color: "#8a6a10" },
  error: { label: "エラー", color: colors.danger },
};

// 📋 テスト期間のまとめて登録: 学校の行事予定表から読み取った考査日程の表
// (1 行目が見出しの TSV) を貼り、「確認」で行ごとの OK / エラー理由 / 重複を
// 見てから一度に登録する。特別イベントのまとめて登録と同じ流れ。
// 登録は 1 回の save (updater)。toast の「元に戻す」は足した id だけ消す
// (登録直後なので特訓シフトはまだ無い)。読み取りは utils/examPeriodImport。
export function ExamPeriodBulkImportDialog({ examPeriods, onSave, onClose }) {
  const toasts = useToasts();
  const ids = useId();
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [fiscalYear, setFiscalYear] = useState(() => fiscalYearOf(fmtDate(new Date())));
  const [preview, setPreview] = useState(null);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);

  const counts = useMemo(() => {
    const c = { ok: 0, duplicate: 0, error: 0 };
    for (const r of preview?.rows || []) c[r.status]++;
    return c;
  }, [preview]);
  const toAdd = counts.ok + (includeDuplicates ? counts.duplicate : 0);

  const invalidate = () => setPreview(null);

  const check = () => {
    setPreview(
      parseExamPeriodImport(text, {
        existing: examPeriods,
        fiscalYear: Number(fiscalYear),
        source,
      })
    );
  };

  const register = () => {
    if (!preview) return;
    const added = buildImportedExamPeriods(preview.rows, {
      startId: nextNumericId(examPeriods),
      includeDuplicates,
    });
    if (added.length === 0) return;
    onSave((prev) => {
      // 開いている間に他の端末が足した分と id がぶつかったら振り直す
      // (undo は added の id を見るので、ここで書き換えた id で消える)
      const taken = new Set(prev.map((e) => e.id));
      if (added.some((e) => taken.has(e.id))) {
        let id = nextNumericId(prev);
        for (const e of added) e.id = id++;
      }
      return [...prev, ...added];
    });
    toasts.push(`テスト期間を ${added.length} 件登録しました`, {
      tone: "success",
      duration: 6000,
      action: {
        label: "元に戻す",
        onClick: () => {
          const addedIds = new Set(added.map((e) => e.id));
          onSave((prev) => prev.filter((e) => !addedIds.has(e.id)));
        },
      },
    });
    onClose();
  };

  return (
    <Modal title="📋 テスト期間をまとめて登録" onClose={onClose} width="min(980px, 100%)">
      <div style={{ fontSize: 12, color: "#555", lineHeight: 1.7, marginBottom: 10 }}>
        学校の行事予定表から読み取った考査日程を、<b>1 行目が見出し</b>の表で貼り付けます。
        <br />
        列: <code>{EXAM_PERIOD_TSV_HEADER.join(" | ")}</code> (任意で「出典」の列)
        <br />
        開始日 = 発表日 (空なら最初の考査日)、終了日が空なら最後の考査日。考査日は
        <code>2026-11-26,2026-11-27</code> のように「,」「、」「・」で区切る (表示用。授業の休止・
        特訓・第N回には関係しません)。学校はタグになります (年間カレンダーの学校バッジ)。
        <br />
        授業を止める: 空 / <code>しない</code> = 表示のみ (高校の学校別テスト)、<code>する</code> =
        対象学年の授業を休止。対象学年: <code>高校部</code> / <code>高1・高3</code> / 空 (=全学年)
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <label htmlFor={`${ids}-source`} style={{ fontSize: 12, fontWeight: 700 }}>
          出典
        </label>
        <input
          id={`${ids}-source`}
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            invalidate();
          }}
          placeholder="例: 2026桜井年間行事計画 (任意)"
          style={{ ...S.input, width: 240, padding: "4px 8px", fontSize: 12 }}
        />
        <label htmlFor={`${ids}-fy`} style={{ fontSize: 12, fontWeight: 700 }}>
          年度
        </label>
        <input
          id={`${ids}-fy`}
          type="number"
          value={fiscalYear}
          onChange={(e) => {
            setFiscalYear(e.target.value);
            invalidate();
          }}
          style={{ ...S.input, width: 90, padding: "4px 8px", fontSize: 12 }}
        />
        <button
          type="button"
          onClick={() => {
            setText((t) => (t.trim() ? t : `${EXAM_PERIOD_TSV_HEADER.join("\t")}\n`));
            invalidate();
          }}
          style={{ ...S.btn(false), fontSize: 11, padding: "4px 10px" }}
        >
          見出しの行を入れる
        </button>
      </div>

      <textarea
        aria-label="貼り付ける表 (TSV)"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          invalidate();
        }}
        rows={10}
        placeholder={`${EXAM_PERIOD_TSV_HEADER.join("\t")}\n桜井\t桜井2学期期末\t11/19\t11/26,11/27,11/30,12/1,12/2\t\t高校部\t`}
        style={{
          ...S.input,
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          fontSize: 12,
          whiteSpace: "pre",
          overflowX: "auto",
          tabSize: 12,
        }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={check} disabled={!text.trim()} style={S.btn(true)}>
          確認
        </button>
        {preview && (
          <span style={{ fontSize: 12, color: "#555" }} role="status">
            {preview.rows.length === 0
              ? "読める行がありません"
              : `OK ${counts.ok} 件 / 重複 ${counts.duplicate} 件 / エラー ${counts.error} 件`}
            {preview.rows.length > 0 && !preview.header && " (見出しの行が無いので既定の列順で読みました)"}
          </span>
        )}
      </div>

      {preview && preview.rows.length > 0 && (
        <>
          <div style={{ overflowX: "auto", marginTop: 10, border: "1px solid #e0e0e0", borderRadius: 6 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f5f5f5", textAlign: "left" }}>
                  {["行", "状態", "学校", "名称", "期間", "考査日", "対象学年", "授業", "出典"].map((h) => (
                    <th key={h} style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const st = STATUS_META[r.status];
                  const ep = r.event;
                  return (
                    <tr key={r.line} style={{ borderTop: "1px solid #eee", verticalAlign: "top" }}>
                      <td style={{ padding: "4px 6px", color: "#888" }}>{r.line}</td>
                      <td style={{ padding: "4px 6px", color: st.color, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {st.label}
                        {r.status === "duplicate" && (
                          <span style={{ fontWeight: 400 }}> (同じ学校・名称・発表日が登録済み)</span>
                        )}
                      </td>
                      {r.status === "error" ? (
                        <td colSpan={7} style={{ padding: "4px 6px", color: colors.danger }}>
                          {r.error}
                          <span style={{ color: "#999", marginLeft: 8 }}>
                            {[r.cells?.school, r.cells?.name].filter(Boolean).join(" ")}
                          </span>
                        </td>
                      ) : (
                        <>
                          <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>{ep.tags[0] || ""}</td>
                          <td style={{ padding: "4px 6px" }}>{ep.name}</td>
                          <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>
                            {formatDateRange(ep.startDate, ep.endDate, { weekday: true })}
                          </td>
                          <td style={{ padding: "4px 6px" }}>
                            {(ep.examDates || []).map(fmtMD).join("・")}
                          </td>
                          <td style={{ padding: "4px 6px" }}>{schoolGradeLabel(ep.targetGrades)}</td>
                          <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>
                            {ep.stopsClasses ? "休止" : "表示のみ"}
                          </td>
                          <td style={{ padding: "4px 6px", color: "#666" }}>{ep.source || ""}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {counts.duplicate > 0 && (
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={includeDuplicates}
                onChange={(e) => setIncludeDuplicates(e.target.checked)}
              />
              重複の行も登録する (既定は飛ばす)
            </label>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={S.btn(false)}>
          閉じる
        </button>
        <button type="button" onClick={register} disabled={!preview || toAdd === 0} style={S.btn(true)}>
          {preview ? `${toAdd} 件を登録` : "登録"}
        </button>
      </div>
    </Modal>
  );
}
