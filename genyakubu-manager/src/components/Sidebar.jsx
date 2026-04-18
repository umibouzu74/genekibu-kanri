import { useMemo, useState } from "react";
import { VIEWS } from "../constants/views";
import { slotWeight, formatCount, getSlotTeachers, isBiweekly } from "../utils/biweekly";
import { SyncStatus } from "./SyncStatus";
import { LoginForm } from "./LoginForm";

const MENU_CONFIG = [
  { key: VIEWS.DASH, icon: "📋", label: "ダッシュボード" },
  {
    key: VIEWS.ALL, icon: "📊", label: "全講師一覧",
    children: [
      { key: VIEWS.COMPARE, icon: "⚖", label: "講師比較" },
    ],
  },
  {
    key: VIEWS.TIMETABLE, icon: "🗓", label: "時間割管理",
    children: [
      { key: VIEWS.HOLIDAYS, icon: "📅", label: "休講日・テスト期間" },
    ],
  },
  {
    key: VIEWS.STAFF, icon: "👥", label: "バイト管理",
    children: [
      { key: VIEWS.SUBS, icon: "🔄", label: "代行管理", badge: true },
      { key: VIEWS.CONFIRMED_SUBS, icon: "✅", label: "代行確定一覧" },
    ],
  },
  { key: VIEWS.MASTER, icon: "⚙", label: "コースマスター管理" },
  { key: "data-mgr", icon: "💾", label: "データ管理", action: "modal" },
];

// child view key → parent view key のマッピングを事前構築
const CHILD_TO_PARENT = new Map();
for (const item of MENU_CONFIG) {
  if (item.children) {
    for (const child of item.children) {
      CHILD_TO_PARENT.set(child.key, item.key);
    }
  }
}

export function Sidebar({
  open,
  onClose,
  view,
  selected,
  onSelectView,
  onSelectTeacher,
  onOpenDataMgr,
  onJumpToRequestedSubs,
  search,
  onSearchChange,
  teacherGroups,
  subjectCategories,
  slots,
  subs,
  isAdmin,
  onSignIn,
  onSignOut,
}) {
  // 展開/折りたたみ状態管理 (初期状態で子メニューを持つグループを全展開)
  const [expandedGroups, setExpandedGroups] = useState(
    () => new Set(MENU_CONFIG.filter((m) => m.children).map((m) => m.key))
  );

  // 手動トグル + アクティブ子ビューの自動展開を統合
  const effectiveExpanded = useMemo(() => {
    const set = new Set(expandedGroups);
    const parentOfActive = CHILD_TO_PARENT.get(view);
    if (parentOfActive) set.add(parentOfActive);
    return set;
  }, [expandedGroups, view]);

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Pre-compute pending count and per-teacher slot counts once per
  // render rather than running slots.filter() per teacher button.
  const pending = useMemo(
    () => subs.filter((s) => s.status === "requested").length,
    [subs]
  );
  const slotCountByTeacher = useMemo(() => {
    const m = new Map();
    const w = (s) => slotWeight(s.note);
    for (const s of slots) {
      // Attribute to each individual teacher (handles "·" separator)
      for (const t of getSlotTeachers(s)) {
        m.set(t, (m.get(t) || 0) + w(s));
      }
      // Also attribute to biweekly partner mentioned in note
      if (isBiweekly(s.note)) {
        const pm = s.note.match(/隔週\(([^)]+)\)/);
        if (pm) m.set(pm[1], (m.get(pm[1]) || 0) + w(s));
      }
    }
    return m;
  }, [slots]);

  // 教科名 → カテゴリ色 のマップ (グループヘッダの色付けに使用)
  const subjectColorByName = useMemo(() => {
    const m = new Map();
    if (!Array.isArray(subjectCategories)) return m;
    // この Sidebar は教科オブジェクトを直接持たないので、ヘッダ色はカテゴリから
    // 決めるのではなく、グループラベルに対応する固定カラーを用いる。
    // 代わりにシンプルに、バイト=金 / 英=青 / 数=赤 / 国=紫 / 理=緑 / 社=橙 を返す。
    const defaults = {
      バイト: "#d4a84a",
      英語: "#2e6a9e",
      数学: "#c05030",
      国語: "#6a3d8e",
      理科: "#3d7a4a",
      社会: "#9e6a2e",
      その他: "#888",
    };
    for (const [k, v] of Object.entries(defaults)) m.set(k, v);
    return m;
  }, [subjectCategories]);

  const totalTeachers = useMemo(
    () =>
      Array.isArray(teacherGroups)
        ? teacherGroups.reduce((n, g) => n + g.teachers.length, 0)
        : 0,
    [teacherGroups]
  );

  return (
    <>
      {open && (
        <div
          className="sidebar-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.4)",
            zIndex: 998,
          }}
          onClick={onClose}
        />
      )}
      <nav
        className="sidebar"
        aria-label="メインナビゲーション"
        style={{
          width: 210,
          background: "#1a1a2e",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          position: "fixed",
          top: 0,
          left: open ? 0 : -220,
          bottom: 0,
          zIndex: 999,
          transition: "left .25s ease",
        }}
      >
        <div
          style={{
            padding: "16px 14px 10px",
            borderBottom: "1px solid #2a2a4e",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>現役部</div>
            <div style={{ fontSize: 10, color: "#8888aa", marginTop: 1 }}>
              授業管理システム
            </div>
          </div>
          <button
            type="button"
            className="sidebar-close"
            onClick={onClose}
            aria-label="サイドバーを閉じる"
            style={{
              background: "none",
              border: "none",
              color: "#888",
              cursor: "pointer",
              fontSize: 18,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: "8px 10px" }}>
          <input
            type="text"
            placeholder="講師名で検索…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #3a3a5e",
              background: "#2a2a4e",
              color: "#fff",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ borderBottom: "1px solid #2a2a4e" }}>
          {MENU_CONFIG.map((item) => {
            const hasChildren = !!item.children;
            const isExpanded = hasChildren && effectiveExpanded.has(item.key);
            const childActive = hasChildren && item.children.some((c) => !selected && view === c.key);
            const selfActive = !selected && view === item.key;
            const isModal = item.action === "modal";

            const pendingBadge = pending > 0 && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onJumpToRequestedSubs?.();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    e.preventDefault();
                    onJumpToRequestedSubs?.();
                  }
                }}
                title="依頼中のみ表示"
                style={{
                  marginLeft: 6,
                  background: "#c44",
                  color: "#fff",
                  borderRadius: 10,
                  padding: "1px 6px",
                  fontSize: 9,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {pending}
              </span>
            );

            return (
              <div key={item.key}>
                <button
                  onClick={() => {
                    if (isModal) {
                      onOpenDataMgr();
                    } else {
                      onSelectView(item.key);
                      // モバイルでは選択後にサイドバーを閉じる (デスクトップでは @media で常時表示)
                      if (typeof window !== "undefined" && window.innerWidth <= 768) onClose?.();
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    padding: "10px 14px",
                    border: "none",
                    background: selfActive
                      ? "#3a3a6e"
                      : childActive
                        ? "#2a2a4e"
                        : "transparent",
                    color: selfActive ? "#fff" : childActive ? "#ddd" : "#ccc",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: selfActive ? 700 : childActive ? 600 : 400,
                  }}
                >
                  <span style={{ flex: 1 }}>
                    {item.icon} {item.label}
                    {/* 折りたたみ時は親にバッジ表示 */}
                    {hasChildren && !isExpanded && item.children.some((c) => c.badge) && pendingBadge}
                  </span>
                  {hasChildren && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroup(item.key);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          e.preventDefault();
                          toggleGroup(item.key);
                        }
                      }}
                      style={{
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 10,
                        color: "#888",
                        cursor: "pointer",
                        transition: "background .15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#3a3a5e"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  )}
                </button>
                {hasChildren && (
                  <div
                    style={{
                      maxHeight: isExpanded ? `${item.children.length * 44}px` : "0px",
                      overflow: "hidden",
                      transition: "max-height 0.2s ease",
                      background: "#16162e",
                    }}
                  >
                    {item.children.map((child) => {
                      const childIsActive = !selected && view === child.key;
                      return (
                        <button
                          key={child.key}
                          onClick={() => {
                            onSelectView(child.key);
                            if (typeof window !== "undefined" && window.innerWidth <= 768) onClose?.();
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: "9px 14px 9px 28px",
                            border: "none",
                            background: childIsActive ? "#3a3a6e" : "transparent",
                            color: childIsActive ? "#fff" : "#aaa",
                            textAlign: "left",
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: childIsActive ? 700 : 400,
                          }}
                        >
                          {child.icon} {child.label}
                          {child.badge && pendingBadge}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "2px 0" }}>
          {totalTeachers === 0 && (
            <div
              style={{
                textAlign: "center",
                color: "#8888aa",
                padding: "16px 12px",
                fontSize: 11,
                lineHeight: 1.6,
              }}
            >
              {search ? (
                <>
                  「{search}」に一致する
                  <br />
                  講師はいません
                </>
              ) : (
                "講師が登録されていません"
              )}
            </div>
          )}
          {teacherGroups.map((group) => {
            const color = subjectColorByName.get(group.label) || "#888";
            return (
              <div key={group.key}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 14px 6px",
                    marginTop: 6,
                    borderLeft: `3px solid ${color}`,
                    background: "#13132a",
                    color: "#ccd",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 1,
                    textTransform: "none",
                  }}
                >
                  <span>{group.label}</span>
                  <span style={{ fontSize: 11, color: "#6a6a8e", fontWeight: 700 }}>
                    {group.teachers.length}
                  </span>
                </div>
                {group.teachers.map((t) => {
                  const cnt = slotCountByTeacher.get(t) || 0;
                  return (
                    <button
                      key={t}
                      onClick={() => {
                        onSelectTeacher(t);
                        if (typeof window !== "undefined" && window.innerWidth <= 768) onClose?.();
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "8px 14px",
                        border: "none",
                        background: selected === t ? "#3a3a6e" : "transparent",
                        color: selected === t ? "#fff" : "#ccc",
                        textAlign: "left",
                        cursor: "pointer",
                        fontSize: 13,
                        transition: "background .15s",
                      }}
                      onMouseEnter={(e) => {
                        if (selected !== t) e.currentTarget.style.background = "#2a2a4e";
                      }}
                      onMouseLeave={(e) => {
                        if (selected !== t) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <span>{t}</span>
                      <span
                        style={{
                          fontSize: 11,
                          background: cnt > 10 ? "#c44" : "#4a4a7e",
                          borderRadius: 10,
                          padding: "2px 7px",
                          fontWeight: 700,
                        }}
                      >
                        {formatCount(cnt)}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <SyncStatus isAdmin={isAdmin} />
        <LoginForm isAdmin={isAdmin} onSignIn={onSignIn} onSignOut={onSignOut} />
      </nav>
    </>
  );
}
