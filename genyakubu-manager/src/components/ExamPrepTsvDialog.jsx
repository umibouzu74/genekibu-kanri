import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { S } from "../styles/common";
import { useToasts } from "../hooks/useToasts";
import { findDay } from "../utils/examPrepHelpers";
import { examPrepToTsv, parseExamPrepTsv } from "../utils/examPrepTsv";

// ─── 特訓シフトを表 (TSV) で書き出す・貼り付ける (C2) ──────────────────
// 書き出しはクリップボードへ (欄にも出す)。貼り付けは「確認」で行ごとの OK /
// エラーと日ごとの変化を出してから、貼った日だけを 1 回の保存で置き換える。
// 6 秒の「元に戻す」は置き換えた日を元の設定に戻す (cascade の無い操作)。
const STATUS = {
  ok: { label: "OK", color: "#2a7a2a" },
  error: { label: "エラー", color: "#c03030" },
};

export function ExamPrepTsvDialog({ examPeriod, schedule, candidateNames, compareNames, crud, onClose }) {
  const toasts = useToasts();
  const exported = useMemo(() => examPrepToTsv(schedule, { compareNames }), [schedule, compareNames]);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exported);
      toasts.success("特訓シフトの表をコピーしました");
    } catch {
      toasts.error("コピーできませんでした (欄の中身を選んでコピーしてください)");
    }
  };

  const check = () =>
    setPreview(parseExamPrepTsv(text, { examPeriod, schedule, candidateNames }));

  const apply = () => {
    if (!preview || preview.errorCount > 0 || preview.days.length === 0) return;
    const snapshot = preview.days.map((d) => ({
      date: d.date,
      day: findDay(schedule, d.date) || null,
    }));
    crud.replaceDays(examPeriod.id, preview.days);
    toasts.success(`特訓シフトを ${preview.days.length} 日ぶん置き換えました`, {
      duration: 6000,
      action: { label: "元に戻す", onClick: () => crud.restoreDays(examPeriod.id, snapshot) },
    });
    onClose();
  };

  return (
    <Modal title={`特訓シフトを表で: ${examPeriod.name}`} onClose={onClose} width="min(820px, 95vw)">
      <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12 }}>
        <section>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>書き出す</div>
          <div style={{ color: "#666", marginBottom: 4 }}>
            校時の表と出勤の表を空行で区切って出します。紙の割当表との照合や、直して貼り戻すのに使えます。
          </div>
          <textarea
            readOnly
            aria-label="書き出した表 (TSV)"
            value={exported}
            rows={6}
            style={{ ...S.input, fontFamily: "monospace", fontSize: 11, width: "100%" }}
          />
          <button type="button" onClick={copy} style={{ ...S.btn(false), marginTop: 4 }}>
            📋 コピー
          </button>
        </section>

        <section>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>貼り付ける</div>
          <div style={{ color: "#666", marginBottom: 4, lineHeight: 1.7 }}>
            出勤の表: <code>日付 / 講師 / 校時 (1-4・1,2,5) / 来る / 帰る</code>、校時の表:{" "}
            <code>日付 / 校時 / 開始 / 終了</code>。どちらか片方だけでもよく、貼った日だけを置き換えます
            (出勤の表に出てきた日は出勤をまるごと、校時の表に出てきた日は校時を)。
          </div>
          <textarea
            aria-label="貼り付ける表 (TSV)"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
            }}
            rows={8}
            style={{ ...S.input, fontFamily: "monospace", fontSize: 11, width: "100%" }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button type="button" onClick={check} disabled={!text.trim()} style={S.btn(false)}>
              確認
            </button>
          </div>
        </section>

        {preview && (
          <section aria-label="貼り付けの確認">
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {preview.errorCount > 0
                ? `エラー ${preview.errorCount} 件 (直してからもう一度「確認」)`
                : `置き換える日: ${preview.days.length} 日`}
            </div>
            {preview.summary.length > 0 && (
              <ul style={{ margin: "0 0 6px", paddingLeft: 18 }}>
                {preview.summary.map((s) => (
                  <li key={s.date}>
                    {s.date}: {s.change}
                  </li>
                ))}
              </ul>
            )}
            {preview.warnings.map((w) => (
              <div key={w} style={{ color: "#9a6b00" }}>⚠ {w}</div>
            ))}
            <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #eee", borderRadius: 6 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={`${r.line}-${r.kind}`}>
                      <td style={{ padding: "2px 6px", color: "#888", whiteSpace: "nowrap" }}>{r.line} 行目</td>
                      <td style={{ padding: "2px 6px", color: STATUS[r.status].color, fontWeight: 700 }}>
                        {STATUS[r.status].label}
                      </td>
                      <td style={{ padding: "2px 6px" }}>{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={S.btn(false)}>
            閉じる
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!preview || preview.errorCount > 0 || preview.days.length === 0}
            style={{
              ...S.btn(true),
              background: "#2a4a8e",
              opacity: !preview || preview.errorCount > 0 || preview.days.length === 0 ? 0.5 : 1,
            }}
          >
            置き換える
          </button>
        </div>
      </div>
    </Modal>
  );
}
