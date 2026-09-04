import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { VIEWS } from "../constants/views";
import { dateToDay } from "../utils/dateHelpers";
import {
  buildBatchDocTitle,
  buildBatchPrintBodyHtml,
  buildMonthHeaderHtml,
  buildMonthLabel,
  buildPrintStyles,
  formatPrintDate,
  injectTimetableHeaders,
} from "../utils/printStyles";
import { openPrintWindow, writePrintDocument } from "../utils/printWindow";

// ─── popup 系の印刷 (App のトップバー 🖨 と月次の 📋 まとめて印刷) ──────
// App.jsx から移した (2026-09-04)。中身は移動前と同じ。CLAUDE.md の
// 「印刷システムの二系統」の popup 側で、#main-content の innerHTML を
// コピーしてビュー別のヘッダを注入する。一括印刷は selected / monthOff を
// 差し替えながら flushSync で描画 → outerHTML を集めて 1 ジョブにする。
export function usePrintJobs({
  view,
  selected,
  monthOff,
  vy,
  vm,
  eventVisibility,
  setSelected,
  setView,
  setMonthOff,
  toasts,
}) {
  // 講師一括印刷ダイアログ。busy 中は閉じられないようロックする。
  // progress は { current, total, name } を持ち、ダイアログで <progress>
  // 要素として描画する。abortRef は中断ボタンから for ループへの伝達役。
  const [batchPrintOpen, setBatchPrintOpen] = useState(false);
  const [batchPrintBusy, setBatchPrintBusy] = useState(false);
  const [batchPrintProgress, setBatchPrintProgress] = useState({
    current: 0,
    total: 0,
    name: "",
  });
  const batchPrintAbortRef = useRef(null);

  const handlePrint = () => {
    const el = document.getElementById("main-content");
    if (!el) return;
    const w = openPrintWindow();
    if (!w) {
      toasts.error(
        "ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。"
      );
      return;
    }
    const dateInput = el.querySelector('input[type="date"]');
    const printDate = dateInput?.value || "";
    const printDay = printDate ? dateToDay(printDate) : "";
    // 紙面ヘッダは和式 (YYYY年MM月DD日（曜）) に統一 (E1h)
    const dateText = printDate ? formatPrintDate(printDate, printDay) : "";
    const dateLabel = printDate
      ? `${printDate}${printDay ? `（${printDay}）` : ""} 授業予定`
      : "授業予定";
    const hasTimetableGrid = !!el.querySelector(".excel-print-col-ms");
    const hasMonthView =
      view === VIEWS.MONTH && !!el.querySelector(".month-print-root");
    const docTitle = hasMonthView
      ? buildMonthLabel({ teacher: selected, year: vy, month: vm })
      : selected
        ? `${selected} 授業予定`
        : dateLabel;

    const printStyles = buildPrintStyles({ hasTimetableGrid, hasMonthView });

    let bodyHtml = el.innerHTML;
    if (hasTimetableGrid) {
      // 中学/高校で別々のヘッダを注入する (印刷時は別ページ)。各ヘッダには
      // セクション名・日付・印刷日・講師名 (選択中のみ) を載せる。
      // 全曜日まとめ印刷 (ExcelGridView) も同じ関数で曜日ブロック単位に注入する。
      bodyHtml = injectTimetableHeaders(bodyHtml, { dateText, selected });
    }
    if (hasMonthView) {
      const header = buildMonthHeaderHtml({
        teacher: selected,
        year: vy,
        month: vm,
        visibility: eventVisibility,
      });
      bodyHtml = bodyHtml.replace(
        /(<div[^>]*class="[^"]*\bmonth-print-root\b[^"]*"[^>]*>)/,
        `${header}$1`
      );
    }

    // 印刷ダイアログが閉じたらポップアップも自動で閉じる (取り消した場合含む)。
    writePrintDocument(w, { title: docTitle, styles: printStyles, bodyHtml });
  };

  // ─── Batch Print ────────────────────────────────────────────────
  // 講師 (バイト + 常勤) を複数選択して各人の月次予定を 1 ジョブに
  // まとめて印刷する。months ({year, month}[] 昇順) を複数選ぶと
  // 講師ごとに各月 1 枚ずつ連続で出す (配布時に人単位で束ねやすい順)。
  // selected / monthOff (現在の MonthView 表示講師・表示月) を順次
  // 差し替えて React に再描画させ、各回の .month-print-root の outerHTML
  // をスナップショット。全員ぶん集まったら popup window に流し込んで
  // window.print() する。終了後は元の selected / view / monthOff に戻す。
  //
  // popup は user gesture (ボタンクリック) 直下で開かないと Safari/Firefox
  // でブロックされやすい。await を挟む前に先に window.open しておく。
  //
  // 途中中断は AbortController 経由で handleBatchPrintAbort から signal を
  // 立てて、ループ先頭で aborted を見て break する。
  const handleBatchPrintAbort = useCallback(() => {
    batchPrintAbortRef.current?.abort();
  }, []);

  const handleBatchPrint = useCallback(
    async (teachers, months) => {
      if (!Array.isArray(teachers) || teachers.length === 0) return;
      // months 未指定 (旧呼び出し互換) は現在表示中の月のみ。
      const monthList =
        Array.isArray(months) && months.length > 0
          ? months
          : [{ year: vy, month: vm }];
      const w = openPrintWindow();
      if (!w) {
        toasts.error(
          "ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。"
        );
        return;
      }
      const ac = new AbortController();
      batchPrintAbortRef.current = ac;
      const savedSelected = selected;
      const savedView = view;
      const savedMonthOff = monthOff;
      // monthOff は「今日の月」からのオフセット。対象年月 → monthOff の
      // 変換基準も同じく今日にする。
      const base = new Date();
      const offsetOf = (y, m) =>
        (y - base.getFullYear()) * 12 + (m - 1 - base.getMonth());
      // 講師ごとに各月を連続で出す (人単位で束ねて配布できる紙順)。
      const jobs = [];
      for (const t of teachers) {
        for (const mo of monthList) {
          jobs.push({ teacher: t, year: mo.year, month: mo.month });
        }
      }
      setBatchPrintBusy(true);
      setBatchPrintProgress({ current: 0, total: jobs.length, name: "" });
      try {
        // MonthView は遅延読み込み。flushSync で同期描画する前にチャンクを
        // 確実に読み込んでおく (通常は月間ビューから起動するので即座に解決)
        await import("../components/views/MonthView");
        const slides = [];
        for (let i = 0; i < jobs.length; i++) {
          if (ac.signal.aborted) break;
          const { teacher: t, year: jy, month: jm } = jobs[i];
          setBatchPrintProgress({
            current: i + 1,
            total: jobs.length,
            name: monthList.length > 1 ? `${t}・${jm}月` : t,
          });
          // flushSync で同期的にコミット → DOM が更新されてから outerHTML を取る。
          flushSync(() => {
            setSelected(t);
            setMonthOff(offsetOf(jy, jm));
            setView(VIEWS.MONTH);
          });
          // useMemo の再評価が DOM へ反映されるまで 2 フレーム待つ
          // (1 frame だと concurrent rendering で間に合わないケースの保険)。
          await new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r))
          );
          if (ac.signal.aborted) break;
          const root = document.querySelector(".month-print-root");
          if (!root) continue;
          slides.push({
            teacher: t,
            headerHtml: buildMonthHeaderHtml({
              teacher: t,
              year: jy,
              month: jm,
              visibility: eventVisibility,
            }),
            monthRootHtml: root.outerHTML,
          });
        }

        if (ac.signal.aborted) {
          toasts.info("一括印刷を中断しました");
          w.close();
          return;
        }

        if (slides.length === 0) {
          toasts.error("印刷データを生成できませんでした。");
          w.close();
          return;
        }

        const printStyles = buildPrintStyles({
          hasTimetableGrid: false,
          hasMonthView: true,
        });
        const bodyHtml = buildBatchPrintBodyHtml({ slides });
        const nameCount = new Set(slides.map((s) => s.teacher)).size;
        const docTitle = buildBatchDocTitle({ nameCount, months: monthList });
        writePrintDocument(w, {
          title: docTitle,
          styles: printStyles,
          bodyHtml,
        });
      } finally {
        // 元の選択状態 / view / 表示月に戻す。null だった場合も含めそのまま代入。
        batchPrintAbortRef.current = null;
        setSelected(savedSelected);
        setView(savedView);
        setMonthOff(savedMonthOff);
        setBatchPrintBusy(false);
        setBatchPrintProgress({ current: 0, total: 0, name: "" });
        setBatchPrintOpen(false);
      }
    },
    [selected, view, monthOff, vy, vm, eventVisibility, toasts, setSelected, setView, setMonthOff]
  );

  return {
    handlePrint,
    handleBatchPrint,
    handleBatchPrintAbort,
    batchPrintOpen,
    setBatchPrintOpen,
    batchPrintBusy,
    batchPrintProgress,
  };
}
