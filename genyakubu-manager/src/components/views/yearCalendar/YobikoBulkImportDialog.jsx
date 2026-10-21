import { useId, useMemo, useState } from "react";
import { Modal } from "../../Modal";
import { useToasts } from "../../../hooks/useToasts";
import { nextNumericId } from "../../../utils/schema";
import { fmtDate, formatDateRange } from "../../../utils/dateHelpers";
import { fiscalYearOf } from "../../../utils/teacherAffiliations";
import { buildImportedEvents } from "../../../utils/specialEventImport";
import {
  YOBIKO_KIND_HINT,
  YOBIKO_TSV_HEADER,
  parseYobikoEventImport,
  yobikoEventLabel,
} from "../../../utils/yobikoEvents";
import { yobikoKindMeta } from "../../../constants/yobikoEvents";
import { S } from "../../../styles/common";
import { colors } from "../../../styles/tokens";

const STATUS_META = {
  ok: { label: "OK", color: colors.success },
  duplicate: { label: "重複", color: "#8a6a10" },
  error: { label: "エラー", color: colors.danger },
};

// 📋 予備校部の予定をまとめて登録: 1 行目が見出しの表 (TSV) を貼り、「確認」で
// 行ごとの OK / エラー理由 / 重複を見てから一度に登録する。特別イベントの
// まとめて登録 (SpecialEventBulkImportDialog) と同じ流れ。登録は 1 回の save
// (updater) で、toast の「元に戻す」は足した id だけ消す。
// 予定表の写真・PDF は Claude に表 (この列の TSV) にしてもらって貼る運用。
export function YobikoBulkImportDialog({ yobikoEvents, onSave, onClose }) {
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
      parseYobikoEventImport(text, {
        existing: yobikoEvents,
        fiscalYear: Number(fiscalYear),
        source,
      })
    );
  };

  const register = () => {
    if (!preview) return;
    const added = buildImportedEvents(preview.rows, {
      startId: nextNumericId(yobikoEvents),
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
    toasts.push(`予備校部の予定を ${added.length} 件登録しました`, {
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
    <Modal title="📋 予備校部の予定をまとめて登録" onClose={onClose} width="min(880px, 100%)">
      <div style={{ fontSize: 12, color: "#555", lineHeight: 1.7, marginBottom: 10 }}>
        予定表の Excel・スプレッドシートから、<b>1 行目が見出し</b>の表をそのまま貼り付けます。
        予定表が写真・PDF のときは、Claude に「年間カレンダーのまとめて登録の形 (TSV) にして」と頼むと表にできます。
        <br />
        列: <code>{YOBIKO_TSV_HEADER.join(" | ")}</code> (終了日が空なら単日。任意で「出典」の列)
        <br />
        種別: {YOBIKO_KIND_HINT} (空 = 行事)。休校日などは名称が空でも登録できます (日付の数字を塗る)
        <br />
        日付: <code>2026-11-01</code> / <code>2026/11/1</code> / <code>11/1</code> (年は下の年度から補う。1〜3 月は翌年)
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
          placeholder="例: 2026予備校部 年間行事予定表 (任意)"
          style={{ ...S.input, width: 260, padding: "4px 8px", fontSize: 12 }}
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
            setText((t) => (t.trim() ? t : `${YOBIKO_TSV_HEADER.join("\t")}\n`));
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
        placeholder={`${YOBIKO_TSV_HEADER.join("\t")}\n10/4\t\t休校日\t\t\n10/9\t\t行事\t月曜授業+自習\t3校時迄`}
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
                  {["行", "状態", "期間", "種別", "名称", "メモ", "出典"].map((h) => (
                    <th key={h} style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const st = STATUS_META[r.status];
                  const ev = r.event;
                  return (
                    <tr key={r.line} style={{ borderTop: "1px solid #eee", verticalAlign: "top" }}>
                      <td style={{ padding: "4px 6px", color: "#888" }}>{r.line}</td>
                      <td style={{ padding: "4px 6px", color: st.color, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {st.label}
                        {r.status === "duplicate" && (
                          <span style={{ fontWeight: 400 }}> (同じ名称・種別・期間が登録済み)</span>
                        )}
                      </td>
                      {r.status === "error" ? (
                        <td colSpan={5} style={{ padding: "4px 6px", color: colors.danger }}>
                          {r.error}
                          <span style={{ color: "#999", marginLeft: 8 }}>
                            {[r.cells?.startDate, r.cells?.kind, r.cells?.name].filter(Boolean).join(" ")}
                          </span>
                        </td>
                      ) : (
                        <>
                          <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>
                            {formatDateRange(ev.startDate, ev.endDate, { weekday: true })}
                          </td>
                          <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>
                            {yobikoKindMeta(ev.kind).label}
                          </td>
                          <td style={{ padding: "4px 6px" }}>{yobikoEventLabel(ev)}</td>
                          <td style={{ padding: "4px 6px", color: "#666" }}>{ev.memo || ""}</td>
                          <td style={{ padding: "4px 6px", color: "#666" }}>{ev.source || ""}</td>
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
