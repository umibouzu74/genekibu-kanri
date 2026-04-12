import { useMemo } from "react";
import { VIEWS } from "../constants/views";
import { slotWeight, formatCount } from "../utils/biweekly";
import { SyncStatus } from "./SyncStatus";
import { LoginForm } from "./LoginForm";

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
  // Pre-compute pending count and per-teacher slot counts once per
  // render rather than running slots.filter() per teacher button.
  const pending = useMemo(
    () => subs.filter((s) => s.status === "requested").length,
    [subs]
  );
  const slotCountByTeacher = useMemo(() => {
    const m = new Map();
    for (const s of slots) m.set(s.teacher, (m.get(s.teacher) || 0) + slotWeight(s.note));
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

  const navItem = (key, icon, label, extra = null) => {
    const active = !selected && view === key;
    return (
      <button
        key={key}
        onClick={() => onSelectView(key)}
        style={{
          display: "block",
          width: "100%",
          padding: "7px 14px",
          border: "none",
          background: active ? "#3a3a6e" : "transparent",
          color: active ? "#fff" : "#ccc",
          textAlign: "left",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: active ? 700 : 400,
        }}
      >
        {icon} {label}
        {extra}
      </button>
    );
  };

  return (
    <>
      {open && (
        <div
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
        <div style={{ padding: "6px 8px" }}>
          <input
            type="text"
            placeholder="講師名で検索…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: "100%",
              padding: "5px 8px",
              borderRadius: 6,
              border: "1px solid #3a3a5e",
              background: "#2a2a4e",
              color: "#fff",
              fontSize: 11,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ borderBottom: "1px solid #2a2a4e" }}>
          {navItem(VIEWS.DASH, "📋", "ダッシュボード")}
          {navItem(VIEWS.ALL, "📊", "全講師一覧")}
          {navItem(VIEWS.HEATMAP, "🔥", "繁忙度ヒートマップ")}
          {navItem(VIEWS.COMPARE, "⚖", "講師比較")}
          {navItem(VIEWS.HOLIDAYS, "📅", "休講日・テスト期間")}
          {navItem(VIEWS.TIMETABLE, "🗓", "時間割管理")}
          {navItem(VIEWS.MASTER, "⚙", "コースマスター管理")}
          {navItem(VIEWS.STAFF, "👥", "バイト・教科管理")}
          {navItem(
            VIEWS.SUBS,
            "🔄",
            "代行管理",
            pending > 0 && (
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
            )
          )}
          {navItem(VIEWS.CONFIRMED_SUBS, "✅", "代行確定一覧")}
          <button
            onClick={onOpenDataMgr}
            style={{
              display: "block",
              width: "100%",
              padding: "7px 14px",
              border: "none",
              background: "transparent",
              color: "#ccc",
              textAlign: "left",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            💾 データ管理
          </button>
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
                    padding: "6px 14px 4px",
                    marginTop: 6,
                    borderLeft: `3px solid ${color}`,
                    background: "#13132a",
                    color: "#ccd",
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1,
                    textTransform: "none",
                  }}
                >
                  <span>{group.label}</span>
                  <span style={{ fontSize: 9, color: "#6a6a8e", fontWeight: 700 }}>
                    {group.teachers.length}
                  </span>
                </div>
                {group.teachers.map((t) => {
                  const cnt = slotCountByTeacher.get(t) || 0;
                  return (
                    <button
                      key={t}
                      onClick={() => onSelectTeacher(t)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "6px 14px",
                        border: "none",
                        background: selected === t ? "#3a3a6e" : "transparent",
                        color: selected === t ? "#fff" : "#ccc",
                        textAlign: "left",
                        cursor: "pointer",
                        fontSize: 12,
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
                          fontSize: 9,
                          background: cnt > 10 ? "#c44" : "#4a4a7e",
                          borderRadius: 10,
                          padding: "1px 6px",
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
