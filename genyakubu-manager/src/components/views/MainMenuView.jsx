import { useMemo } from "react";
import { MainMenuPanel, MenuChordHint } from "../MainMenuPanel";
import { VIEWS } from "../../constants/views";
import { VIEW_CHORD_BY_VIEW } from "../../constants/chords";
import { colors } from "../../styles/tokens";
import { fmtDateWeekday } from "../../utils/dateHelpers";
import { summarizeOpenSubs } from "../../utils/substituteState";
import { useToday } from "../../hooks/useToday";

// ─── メインメニュー (起動時の画面、2026-10-15) ──────────────────────
// 機能をカテゴリごとに並べ、ボタンでその場所へ飛ぶ。中身は constants/mainMenu
// (サイドバーと同じ名前・権限)。いちばん上は今日のダッシュボードへの入口と、
// 今日以降の未処理の代行 (サイドバーの赤バッジと同じ数え方)。
//
// 並びは固定 (使用頻度で並べ替えない = A18)。講師ごとの予定 (月間・週間) は
// サイドバーの講師名から開くので、ここには並べない (案内だけ出す)。

export function MainMenuView({
  categories,
  onNavigate,
  onOpenDashboard,
  subs = [],
  onOpenPendingSubs,
  cmdKHint = "Ctrl+K",
}) {
  const today = useToday();
  const pending = useMemo(() => summarizeOpenSubs(subs, today).upcoming.length, [subs, today]);

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          padding: "12px 14px",
        }}
      >
        <button
          type="button"
          onClick={onOpenDashboard}
          className="main-menu-item"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 18px",
            borderRadius: 8,
            border: "none",
            background: colors.primary,
            color: "#fff",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 24 }}>
            📋
          </span>
          <span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>ダッシュボード</span>
              <MenuChordHint chord={VIEW_CHORD_BY_VIEW.get(VIEWS.DASH)} onDark />
            </span>
            <span style={{ display: "block", fontSize: 11, opacity: 0.85 }}>
              {fmtDateWeekday(today)} の授業・代行・休講
            </span>
          </span>
        </button>
        {pending > 0 && onOpenPendingSubs && (
          <button
            type="button"
            onClick={onOpenPendingSubs}
            className="main-menu-item"
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${colors.dangerBorder}`,
              background: colors.dangerSoft,
              color: colors.accentRed,
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            ❗ 未処理の代行 {pending} 件
          </button>
        )}
        <span style={{ fontSize: 11, color: colors.inkSubtle, flex: 1, minWidth: 200 }}>
          講師ごとの予定 (月間・週間) は左のサイドバーの講師名から。{cmdKHint} で講師・日付・機能を
          検索、? でショートカットの一覧
        </span>
      </div>
      <MainMenuPanel categories={categories} onNavigate={onNavigate} variant="full" />
    </div>
  );
}
