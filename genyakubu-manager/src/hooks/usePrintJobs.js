import { useCallback, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { VIEWS } from "../constants/views";
import { dateToDay } from "../utils/dateHelpers";
import {
  buildBatchDocTitle,
  buildBatchPrintBodyHtml,
  buildMonthHeaderHtml,
  buildMonthImageFileName,
  buildMonthImageStyles,
  buildMonthLabel,
  buildPrintStyles,
  formatPrintDate,
  injectTimetableHeaders,
  MONTH_IMAGE_WIDTH,
} from "../utils/printStyles";
import { renderHtmlToPng } from "../utils/htmlImage";
import { openPrintWindow, writePrintDocument } from "../utils/printWindow";
import { collectSnapshots, runSnapshotPrint } from "../utils/snapshotPrint";

// 講師 × 月の一覧を作る。講師ごとに各月を連続で並べる (人単位で束ねて
// 配布できる順)。タグフィルタは講師ごとに担当コマから導出する (サイドバーで
// その講師を選んだときと同じ紙面にする)。setSelected だけ差し替えると最初の
// 講師のタグで全員を刷ってしまう。「現在の設定のまま」(tagMode "current") を
// 選んだときだけ今の表示設定を全員に使う。導出は講師 1 人につき 1 回。
function buildBatchJobs({ teachers, monthList, tagMode, visibilityFor, eventVisibility }) {
  const jobs = [];
  for (const t of teachers) {
    const visibility =
      tagMode === "perTeacher" && visibilityFor ? visibilityFor(t) : eventVisibility;
    for (const mo of monthList) {
      jobs.push({ teacher: t, year: mo.year, month: mo.month, visibility });
    }
  }
  return jobs;
}

// ─── popup 系の印刷 (App のトップバー 🖨 と月次の 📋 まとめて印刷) ──────
// App.jsx から移した (2026-09-04)。CLAUDE.md の「印刷システムの二系統」の
// popup 側で、#main-content の innerHTML をコピーしてビュー別のヘッダを
// 注入する。一括印刷は selected / monthOff を差し替えながら flushSync で
// 描画 → outerHTML を集めて 1 ジョブにする (ループ本体は
// utils/snapshotPrint.runSnapshotPrint。全曜日印刷と共有)。
export function usePrintJobs({
  view,
  selected,
  monthOff,
  vy,
  vm,
  eventVisibility,
  // 講師名 → その講師用の表示設定 (タグフィルタを担当コマから導出したもの)。
  // サイドバーで講師を選んだときと同じ関数 (App.selectTeacher と共有)
  visibilityForBatchTeacher,
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
  // 一括印刷中だけ MonthView に渡す表示設定 (講師ごとにタグフィルタを導出
  // したもの)。null = 通常どおり eventVisibility を使う。localStorage の
  // eventVisibility 自体は触らない (最後の講師のタグが残らないように)。
  const [batchVisibility, setBatchVisibility] = useState(null);
  // 🖼 画像にするの結果。null = まだ作っていない (ダイアログは選択画面)。
  // 各要素は { key, teacher, year, month, file (File), url (サムネイル用の
  // object URL) }。ダイアログを閉じる / 選び直すときに URL を解放する
  const [batchImages, setBatchImages] = useState(null);
  const batchImagesRef = useRef(null);
  const replaceBatchImages = useCallback((next) => {
    for (const img of batchImagesRef.current || []) URL.revokeObjectURL(img.url);
    batchImagesRef.current = next;
    setBatchImages(next);
  }, []);
  const clearBatchImages = useCallback(() => replaceBatchImages(null), [replaceBatchImages]);
  // ダイアログを閉じる (作った画像も捨てる)
  const closeBatchPrint = useCallback(() => {
    clearBatchImages();
    setBatchPrintOpen(false);
  }, [clearBatchImages]);

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
    // 紙面のタイトルをビュー自身が持っているとき (data-print-title)。期間の
    // 日付入力を持つ集計画面 (授業時間の集計) で、開始日を「◯日の授業予定」
    // と取り違えないように、日付入力からの推測より優先する
    const ownTitle =
      el.querySelector("[data-print-title]")?.getAttribute("data-print-title") || "";
    const docTitle = hasMonthView
      ? buildMonthLabel({ teacher: selected, year: vy, month: vm })
      : ownTitle
        ? ownTitle
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

  // まとめて印刷と 🖼 画像にするで共通の「講師 × 月を描く / 月次の DOM を撮る」。
  // flushSync で同期的にコミット → DOM が更新されてから outerHTML を取る。
  // MonthView は props だけで描く純粋なコンポーネントなので、これで確定。
  // monthOff は「今日の月」からのオフセット。対象年月 → monthOff の変換基準も
  // 同じく今日にする。
  const monthSnapshotSteps = useMemo(
    () => ({
      render: ({ teacher: t, year: jy, month: jm, visibility }) => {
        const base = new Date();
        flushSync(() => {
          setSelected(t);
          setMonthOff((jy - base.getFullYear()) * 12 + (jm - 1 - base.getMonth()));
          setView(VIEWS.MONTH);
          setBatchVisibility(visibility);
        });
      },
      capture: ({ teacher: t, year: jy, month: jm, visibility }) => {
        const root = document.querySelector(".month-print-root");
        if (!root) return null;
        return {
          teacher: t,
          year: jy,
          month: jm,
          visibility,
          headerHtml: buildMonthHeaderHtml({
            teacher: t,
            year: jy,
            month: jm,
            visibility,
          }),
          monthRootHtml: root.outerHTML,
        };
      },
    }),
    [setSelected, setMonthOff, setView]
  );

  // options.tagMode:
  //   "perTeacher" (既定) = テスト期間・特別イベントのタグを講師ごとに担当
  //                         コマから導出する (サイドバーで講師を選んだときと同じ)
  //   "current"           = 今の表示設定 (手動トグル済みのタグ) をそのまま全員に使う
  const handleBatchPrint = useCallback(
    async (teachers, months, options = {}) => {
      if (!Array.isArray(teachers) || teachers.length === 0) return;
      const tagMode = options.tagMode === "current" ? "current" : "perTeacher";
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
      const jobs = buildBatchJobs({
        teachers,
        monthList,
        tagMode,
        visibilityFor: visibilityForBatchTeacher,
        eventVisibility,
      });
      setBatchPrintBusy(true);
      setBatchPrintProgress({ current: 0, total: jobs.length, name: "" });
      try {
        // MonthView は遅延読み込み。flushSync で同期描画する前にチャンクを
        // 確実に読み込んでおく (通常は月間ビューから起動するので即座に解決)。
        // デプロイ直後の古いタブでは取得に失敗しうるので、開いた popup を
        // 閉じて再読込を案内する (finally は元の表示に戻すだけ)
        try {
          await import("../components/views/MonthView");
        } catch (err) {
          console.warn("[batch-print] MonthView chunk failed:", err);
          w.close();
          toasts.error("アプリが更新されています。再読込してからもう一度お試しください。");
          return;
        }
        // 準備中画面・進捗・中断 (popup を閉じる / 中断ボタン)・最終書き込みは
        // 共通ドライバ。ここは「講師 × 月を描く」と「月次の DOM を撮る」だけ
        const { status } = await runSnapshotPrint(w, {
          title: buildBatchDocTitle({ nameCount: teachers.length, months: monthList }),
          styles: buildPrintStyles({ hasTimetableGrid: false, hasMonthView: true }),
          items: jobs,
          progressName: ({ teacher: t, month: jm }) =>
            monthList.length > 1 ? `${t}・${jm}月` : t,
          onProgress: setBatchPrintProgress,
          isAborted: () => ac.signal.aborted,
          ...monthSnapshotSteps,
          buildBody: (slides) => buildBatchPrintBodyHtml({ slides }),
          docTitle: (slides) =>
            buildBatchDocTitle({
              nameCount: new Set(slides.map((s) => s.teacher)).size,
              months: monthList,
            }),
        });
        if (status === "closed") {
          toasts.info("印刷ウィンドウが閉じられたので、一括印刷を中断しました");
        } else if (status === "aborted") {
          toasts.info("一括印刷を中断しました");
        } else if (status === "empty") {
          toasts.error("印刷データを生成できませんでした。");
        }
      } catch (err) {
        // スナップショット中に落ちても、準備中画面のまま popup を残さない
        // (全曜日印刷 ExcelGridView.handlePrintAllDays と同じ扱い)
        console.error("[batch-print] failed:", err);
        if (!w.closed) w.close();
        toasts.error("印刷データを生成できませんでした。");
      } finally {
        // 元の選択状態 / view / 表示月に戻す。null だった場合も含めそのまま代入。
        batchPrintAbortRef.current = null;
        setSelected(savedSelected);
        setView(savedView);
        setMonthOff(savedMonthOff);
        setBatchVisibility(null);
        setBatchPrintBusy(false);
        setBatchPrintProgress({ current: 0, total: 0, name: "" });
        closeBatchPrint();
      }
    },
    [
      selected,
      view,
      monthOff,
      vy,
      vm,
      eventVisibility,
      visibilityForBatchTeacher,
      toasts,
      setSelected,
      setView,
      setMonthOff,
      monthSnapshotSteps,
      closeBatchPrint,
    ]
  );

  // ─── 🖼 画像にする ─────────────────────────────────────────────
  // まとめて印刷と同じ講師 × 月の紙面を、1 枚ずつ PNG にする (LINE などで
  // バイトに送る用。印刷を PDF にして別アプリで画像に変える手間を省く、
  // 2026-10-15)。popup は開かない (元のタブのままなので rAF の心配もない)。
  //   1. まとめて印刷と同じループ (collectSnapshots) で全員分の DOM を撮る
  //   2. 画面を元の講師・月に戻す
  //   3. 1 枚ずつ utils/htmlImage.renderHtmlToPng で PNG にする
  // できた画像はダイアログに並べ、共有 / 保存はダイアログのボタンから行う
  // (navigator.share はクリック直下でないと呼べないので、生成とは分ける)。
  // 進捗は 1 と 3 を通しで数える (合計 = 枚数 × 2)。
  const handleBatchImages = useCallback(
    async (teachers, months, options = {}) => {
      if (!Array.isArray(teachers) || teachers.length === 0) return;
      const tagMode = options.tagMode === "current" ? "current" : "perTeacher";
      const monthList =
        Array.isArray(months) && months.length > 0
          ? months
          : [{ year: vy, month: vm }];
      const ac = new AbortController();
      batchPrintAbortRef.current = ac;
      const savedSelected = selected;
      const savedView = view;
      const savedMonthOff = monthOff;
      const restoreScreen = () => {
        setSelected(savedSelected);
        setView(savedView);
        setMonthOff(savedMonthOff);
        setBatchVisibility(null);
      };
      const jobs = buildBatchJobs({
        teachers,
        monthList,
        tagMode,
        visibilityFor: visibilityForBatchTeacher,
        eventVisibility,
      });
      const total = jobs.length * 2;
      const nameOf = ({ teacher: t, month: jm }) =>
        monthList.length > 1 ? `${t}・${jm}月` : t;
      clearBatchImages();
      setBatchPrintBusy(true);
      setBatchPrintProgress({ current: 0, total, name: "" });
      try {
        try {
          await import("../components/views/MonthView");
        } catch (err) {
          console.warn("[batch-image] MonthView chunk failed:", err);
          toasts.error("アプリが更新されています。再読込してからもう一度お試しください。");
          return;
        }
        let slides;
        try {
          slides = await collectSnapshots({
            items: jobs,
            progressName: nameOf,
            onProgress: (p) => setBatchPrintProgress({ ...p, total }),
            isAborted: () => ac.signal.aborted,
            ...monthSnapshotSteps,
          });
        } finally {
          restoreScreen();
        }
        if (ac.signal.aborted) {
          toasts.info("画像づくりを中断しました");
          return;
        }
        if (slides.length === 0) {
          toasts.error("画像にする紙面を作れませんでした。");
          return;
        }
        const styles = buildMonthImageStyles();
        const images = [];
        for (let i = 0; i < slides.length; i++) {
          if (ac.signal.aborted) break;
          const slide = slides[i];
          setBatchPrintProgress({ current: jobs.length + i + 1, total, name: nameOf(slide) });
          // ヘッダは画像用に作り直す (メタ行の「印刷」→「作成」)
          const headerHtml = buildMonthHeaderHtml({
            teacher: slide.teacher,
            year: slide.year,
            month: slide.month,
            visibility: slide.visibility,
            stampLabel: "作成",
          });
          const blob = await renderHtmlToPng({
            html: headerHtml + slide.monthRootHtml,
            styles,
            width: MONTH_IMAGE_WIDTH,
          });
          const name = buildMonthImageFileName(slide);
          const file = new File([blob], name, { type: "image/png" });
          images.push({
            key: `${slide.teacher}:${slide.year}-${slide.month}`,
            teacher: slide.teacher,
            year: slide.year,
            month: slide.month,
            file,
            url: URL.createObjectURL(file),
          });
        }
        if (ac.signal.aborted) {
          for (const img of images) URL.revokeObjectURL(img.url);
          toasts.info("画像づくりを中断しました");
          return;
        }
        replaceBatchImages(images);
      } catch (err) {
        // 古い Safari などで canvas が「汚染」扱いになると toBlob が
        // SecurityError を投げる。印刷 (PDF) の経路は残っているので案内する
        console.error("[batch-image] failed:", err);
        toasts.error("このブラウザでは画像にできませんでした。「印刷」から PDF にしてください。");
      } finally {
        batchPrintAbortRef.current = null;
        setBatchPrintBusy(false);
        setBatchPrintProgress({ current: 0, total: 0, name: "" });
      }
    },
    [
      selected,
      view,
      monthOff,
      vy,
      vm,
      eventVisibility,
      visibilityForBatchTeacher,
      toasts,
      setSelected,
      setView,
      setMonthOff,
      monthSnapshotSteps,
      clearBatchImages,
      replaceBatchImages,
    ]
  );

  return {
    handlePrint,
    handleBatchPrint,
    handleBatchImages,
    handleBatchPrintAbort,
    batchPrintOpen,
    setBatchPrintOpen,
    closeBatchPrint,
    batchImages,
    clearBatchImages,
    batchPrintBusy,
    batchPrintProgress,
    batchVisibility,
  };
}
