import { useCallback, useEffect, useRef } from "react";
import { useConfirm } from "../../hooks/useConfirm";
import { useToasts } from "../../hooks/useToasts";
import { nextNumericId } from "../../utils/schema";
import { createDefaultWorkspace } from "../model";
import { applyChu3SecondTermShift, buildProjectFromSlots } from "../importTimetable";
import { parseProjectJson, projectFileName, serializeProject } from "../projectJson";

// ─── プロジェクトの出し入れ (通常時間割作成) ────────────────────────
// 複数プロジェクト (「2026 1学期」「2026 2学期」…) の切替・追加・複製・
// 削除と、外部との出し入れ (本体からの取込・JSON・Excel) をまとめる。
// どれも「ワークスペース単位の操作」で、セル編集まわりのロジックとは
// 独立しているため RegularBuilderApp から切り出している。

/**
 * @param {{
 *   project: object, slots: object[],
 *   commitWorkspace: Function, usedDays: string[], splitCampus: boolean,
 *   onProjectChanged: () => void,   // 学年タブの選択をリセットする
 *   onImported: () => void,         // 取込ダイアログを閉じる
 * }} deps
 */
export function useRegularProjects({
  project,
  slots,
  commitWorkspace,
  usedDays,
  splitCampus,
  /** 画面と同じ科目カラー (教科マスタで正規化済み)。Excel にも同じ色を載せる */
  subjectColor,
  onProjectChanged,
  onImported,
}) {
  const toasts = useToasts();
  const confirm = useConfirm();
  // 呼び出し側のコールバックは毎レンダー新しい関数になるため ref 越しに
  // 呼ぶ (依存に入れると下の useCallback が毎回作り直される)
  const cbRef = useRef({ onProjectChanged, onImported });
  useEffect(() => {
    cbRef.current = { onProjectChanged, onImported };
  });

  // 切替も履歴に積む (atomic)。積まないと「切替 → Ctrl+Z」で切替前の
  // ワークスペース (= 前のプロジェクト + そこでの直前の編集) へ黙って
  // 引き戻され、見ていない側のプロジェクトの編集が取り消されてしまう
  const switchProject = useCallback(
    (id) => {
      commitWorkspace((w) => ({ ...w, activeProjectId: id }), { atomic: true });
      cbRef.current.onProjectChanged();
    },
    [commitWorkspace]
  );

  const addProject = useCallback(
    (projectFields, { successMsg } = {}) => {
      commitWorkspace((w) => {
        const id = nextNumericId(w.projects);
        return {
          ...w,
          activeProjectId: id,
          projects: [...w.projects, { id, ...projectFields }],
        };
      });
      cbRef.current.onProjectChanged();
      if (successMsg) toasts.success(successMsg);
    },
    [commitWorkspace, toasts]
  );

  const removeProject = useCallback(async () => {
    const cellCount = project.tabs.reduce(
      (n, t) => n + Object.keys(t.schedule).length,
      0
    );
    // プロジェクト削除は中身 (タブ・セル) を巻き込むため確認ダイアログ
    // (CLAUDE.md 削除 UX ルールの cascade あり相当)
    const ok = await confirm({
      title: "プロジェクトの削除",
      message: `プロジェクト「${project.name}」を削除しますか？\nタブ ${project.tabs.length} 件・入力済みセル ${cellCount} 件も削除されます。`,
      okLabel: "削除する",
      tone: "danger",
    });
    if (!ok) return;
    commitWorkspace((w) => {
      const rest = w.projects.filter((p) => p.id !== project.id);
      if (rest.length === 0) return createDefaultWorkspace();
      return { ...w, activeProjectId: rest[0].id, projects: rest };
    });
    cbRef.current.onProjectChanged();
  }, [project, confirm, commitWorkspace]);

  const duplicateProject = useCallback(() => {
    const copy = JSON.parse(JSON.stringify(project));
    delete copy.id;
    addProject(
      { ...copy, name: `${project.name}（コピー）` },
      { successMsg: `「${project.name}」を複製しました` }
    );
  }, [project, addProject]);

  const importProject = useCallback(
    ({ sourceId, name, applyShift, splitWeekend, splitBuilding }) => {
      const { project: imported, stats } = buildProjectFromSlots(
        name,
        slots,
        sourceId,
        { splitWeekend, splitBuilding }
      );
      let final = imported;
      let shiftMsg = "";
      if (applyShift) {
        const { project: shifted, moved } = applyChu3SecondTermShift(imported);
        final = shifted;
        shiftMsg = `、中3 2学期変更を適用（${moved} コマ移動）`;
      }
      addProject(final, {
        successMsg: `「${name}」を取り込みました（${stats.slotCount} コマ・タブ ${stats.tabCount} 件${shiftMsg}）`,
      });
      cbRef.current.onImported();
    },
    [slots, addProject]
  );

  // ── JSON 書き出し / 読み込み (RB20: バックアップ・別環境への移行) ──
  // 書き出しはアクティブなプロジェクト単位 (スナップショット込み)、
  // 読み込みは新しいプロジェクトとして追加する (既存を上書きしない)
  const exportProjectJson = useCallback(() => {
    const text = serializeProject(project, new Date().toISOString());
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = projectFileName(project.name, new Date());
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toasts.success(`「${project.name || "無題"}」を JSON に書き出しました`);
  }, [project, toasts]);

  const importFileRef = useRef(null);
  const importProjectJson = useCallback(
    async (file) => {
      if (!file) return;
      const result = parseProjectJson(await file.text());
      if (result.error) {
        toasts.error(result.error);
        return;
      }
      addProject(result.project, {
        successMsg: `「${result.project.name}」を JSON から読み込みました`,
      });
    },
    [toasts, addProject]
  );

  // ── Excel 出力 (RB22)。exceljs をメインバンドルから外すため、
  // モジュールごとボタン押下時に dynamic import する (講習・調査票と同じ)
  const exportExcel = useCallback(async () => {
    try {
      const { downloadRegularExcel } = await import("../excelExport");
      const { daySheets, hasAllDaysSheet } = await downloadRegularExcel({
        project,
        days: usedDays,
        splitCampus,
        subjectColor,
      });
      // まとめシートは 2 曜日以上のときだけ作られるので、文面も実態に合わせる
      // (曜日別は B4 横 / 全曜日まとめだけ A3 横 — 紙が違うので明記する)
      toasts.success(
        `Excel を書き出しました（${daySheets} 曜日ぶんのシート・B4 横` +
          `${hasAllDaysSheet ? " + 全曜日まとめ・A3 横" : ""}）`
      );
    } catch (e) {
      toasts.error(`Excel を書き出せませんでした: ${e?.message || e}`);
    }
  }, [project, usedDays, splitCampus, subjectColor, toasts]);

  // ── 講師別 Excel (集計 + 講師ごとの週間シート)
  const exportTeacherExcel = useCallback(async () => {
    try {
      const { downloadRegularTeacherExcel } = await import("../excelExport");
      await downloadRegularTeacherExcel({ project, subjectColor });
      toasts.success(
        "集計 Excel を書き出しました（講師×曜日 + クラス別科目 + 講師ごとにシート）"
      );
    } catch (e) {
      toasts.error(`講師別 Excel を書き出せませんでした: ${e?.message || e}`);
    }
  }, [project, subjectColor, toasts]);

  return {
    switchProject,
    addProject,
    removeProject,
    duplicateProject,
    importProject,
    exportProjectJson,
    importFileRef,
    importProjectJson,
    exportExcel,
    exportTeacherExcel,
  };
}
