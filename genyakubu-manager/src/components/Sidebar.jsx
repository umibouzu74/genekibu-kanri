import { memo, useEffect, useMemo, useRef, useState } from "react";
import { VIEWS } from "../constants/views";
import { EVENT_KIND_LABELS } from "../constants/eventKinds";
import {
  SIDEBAR_CATEGORIES,
  SIDEBAR_CATEGORY_BY_VIEW,
  SIDEBAR_PINNED,
} from "../constants/sidebarMenu";
import { DEFAULT_OPEN_CATEGORIES } from "../constants/menuCategories";
import { LS } from "../constants/storageKeys";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { VIEW_CHORD_BY_VIEW } from "../constants/chords";
import { colors } from "../styles/tokens";
import {
  biweeklyPartner,
  slotWeight,
  formatCount,
  getSlotTeachers,
  isBiweekly,
} from "../utils/biweekly";
import { SyncStatus } from "./SyncStatus";
import { LoginForm } from "./LoginForm";
import { filterTeacherGroups } from "../hooks/useTeacherGroups";
import { useToday } from "../hooks/useToday";
import { summarizeOpenSubs } from "../utils/substituteState";

// chord ヒント表示用の小さなバッジ。`g d` 等のキー組を薄く出して学習を助ける。
function ChordHint({ viewKey, dim }) {
  const second = VIEW_CHORD_BY_VIEW.get(viewKey);
  if (!second) return null;
  return (
    <span
      aria-hidden="true"
      title={`キーボード: g → ${second}`}
      style={{
        marginLeft: 8,
        fontSize: 9,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        color: dim ? "#6a6a8e" : "#8a8aaa",
        letterSpacing: 0.5,
        opacity: 0.85,
        flexShrink: 0,
      }}
    >
      g {second}
    </span>
  );
}

// Teacher ボタン: memo 化して selected 変化時に隣接ボタンの再描画を避ける。
const SidebarTeacherButton = memo(function SidebarTeacherButton({
  name,
  count,
  isSelected,
  onSelect,
}) {
  const handleClick = () => onSelect(name);
  return (
    <button
      onClick={handleClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "8px 14px",
        border: "none",
        background: isSelected ? "#3a3a6e" : "transparent",
        color: isSelected ? "#fff" : "#ccc",
        textAlign: "left",
        cursor: "pointer",
        fontSize: 13,
        transition: "background .15s",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = "#2a2a4e";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = "transparent";
      }}
    >
      <span>{name}</span>
      <span
        style={{
          fontSize: 11,
          background: count > 10 ? colors.danger : "#4a4a7e",
          borderRadius: 10,
          padding: "2px 7px",
          fontWeight: 700,
        }}
      >
        {formatCount(count)}
      </span>
    </button>
  );
});

// 画面の中のセクション / タブをサイドバーに並べる小さなリスト。
// 「画面名から辿れない機能」に名前を与えるのが目的なので、その画面を
// 開いている間だけ出す (常時展開するとビュー一覧が読めなくなる)。
// sections の要素は { key, icon, label } (EVENT_SECTIONS だけは kind +
// EVENT_KIND_LABELS 由来のラベル)。
function SectionLinks({ sections, activeKey, onSelect, onClose }) {
  return sections.map((sec) => {
    const key = sec.key ?? sec.kind;
    const label = sec.label ?? EVENT_KIND_LABELS[sec.kind];
    const isActive = activeKey != null && activeKey === key;
    return (
      <button
        key={key}
        onClick={() => {
          onSelect?.(key);
          if (typeof window !== "undefined" && window.innerWidth <= 768) {
            onClose?.();
          }
        }}
        style={{
          display: "block",
          width: "100%",
          padding: "6px 14px 6px 42px",
          border: "none",
          background: isActive ? "#2a2a4e" : "transparent",
          color: isActive ? "#fff" : "#9a9ac0",
          textAlign: "left",
          cursor: "pointer",
          fontSize: 11,
          fontWeight: isActive ? 700 : 400,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#fff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = isActive ? "#fff" : "#9a9ac0";
        }}
      >
        {sec.icon} {label}
      </button>
    );
  });
}

// 開いているカテゴリ (人が開け閉めしたもの) の保存値を整える
const sanitizeOpenCategories = (raw) =>
  Array.isArray(raw)
    ? raw.filter((k) => SIDEBAR_CATEGORIES.some((c) => c.key === k))
    : [...DEFAULT_OPEN_CATEGORIES];

export function Sidebar({
  open,
  onClose,
  view,
  selected,
  onSelectView,
  onSelectTeacher,
  onOpenDataMgr,
  onOpenDayReschedule,
  onOpenMultiDayAbsence,
  onOpenTestPrep,
  onOpenMonthBatch,
  onSelectEventSection,
  onSelectMasterTab,
  masterTab,
  onSelectStaffTab,
  staffTab,
  onJumpToRequestedSubs,
  /** 全講師のグループ (検索前)。検索はこの中で行う */
  teacherGroups: allTeacherGroups,
  // 講師検索をよみでも当てるため (名前 → よみ)
  teacherKana,
  subjectCategories,
  slots,
  subs,
  isAdmin,
  /** 管理者だけが読めるデータ (引継ぎメモ) を扱えるか (useAppData.canUseAdminData) */
  canUseAdminData = isAdmin,
  onSignIn,
  onSignOut,
}) {
  // 講師検索の文字列はサイドバーのローカル state。App に置くと 1 打鍵ごとに
  // App 全体 (ダッシュボード・月間カレンダー…) が再描画される (2026-09-04)
  const [search, onSearchChange] = useState("");
  const teacherGroups = useMemo(
    () => filterTeacherGroups(allTeacherGroups, search, teacherKana),
    [allTeacherGroups, search, teacherKana]
  );
  // メニュー部分は高さの 6 割で中がスクロールするので、メインメニューや Cmd+K
  // から下の方の画面 (引継ぎメモなど) を開いたとき、今いる項目を見える所へ出す
  const menuRef = useRef(null);
  useEffect(() => {
    const el = menuRef.current?.querySelector('[aria-current="page"]');
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  }, [view, selected]);

  // ─── カテゴリの開け閉め ───────────────────────────────────────
  // 項目が 25 前後あり全部並べると画面に収まらないので、カテゴリごとに開け
  // 閉めする (constants/menuCategories)。人が開け閉めした状態はこの端末に
  // 覚える (明示的な操作の保存。使用頻度で開くものを変えたりはしない — A18)。
  // 今いる画面のカテゴリは自動で開く (覚えはしない。開いたままにしたければ
  // 人が開く)。ただし、その画面にいる間に人が閉じたら閉じたまま
  const [savedOpen, setSavedOpen] = useLocalStorage(
    LS.sidebarOpenCategories,
    DEFAULT_OPEN_CATEGORIES,
    { migrate: sanitizeOpenCategories }
  );
  const activeCategory = selected ? null : SIDEBAR_CATEGORY_BY_VIEW.get(view) || null;
  const [closedActive, setClosedActive] = useState(null);
  useEffect(() => {
    setClosedActive(null);
  }, [view, selected]);
  const openCategories = useMemo(() => {
    const set = new Set(savedOpen);
    if (activeCategory && closedActive !== activeCategory) set.add(activeCategory);
    return set;
  }, [savedOpen, activeCategory, closedActive]);
  const toggleCategory = (key, isOpen) => {
    if (isOpen) {
      setSavedOpen((prev) => prev.filter((k) => k !== key));
      if (key === activeCategory) setClosedActive(key);
    } else {
      setSavedOpen((prev) => (prev.includes(key) ? prev : [...prev, key]));
      if (key === closedActive) setClosedActive(null);
    }
  };

  // セクション (画面の中のタブ / 並んだマネージャ) のクリック先と、
  // 現在地の強調に使うキー。画面ごとに 1 か所へまとめる。
  const sectionSelect = {
    [VIEWS.HOLIDAYS]: onSelectEventSection,
    [VIEWS.MASTER]: onSelectMasterTab,
    [VIEWS.STAFF]: onSelectStaffTab,
  };
  const sectionActiveKey = { [VIEWS.MASTER]: masterTab, [VIEWS.STAFF]: staffTab };

  // Pre-compute pending count and per-teacher slot counts once per
  // render rather than running slots.filter() per teacher button.
  // 赤バッジは「今日以降の未処理 (代行未定 + 依頼中)」だけを数える。
  // 全期間で数えると前期の確定し忘れが永久に乗って数字が意味を失う。
  // 過去の未処理は代行一覧の「未処理」フィルタ側で件数を出す
  const today = useToday();
  const pending = useMemo(
    () => summarizeOpenSubs(subs, today).upcoming.length,
    [subs, today]
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
        const partner = biweeklyPartner(s.note);
        if (partner) m.set(partner, (m.get(partner) || 0) + w(s));
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
      "現役部 常勤": "#3aa060",
      "現役部 非常勤": "#5a8ac0",
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

  const visible = (item) =>
    (!item.adminOnly || isAdmin) && (!item.adminData || canUseAdminData);

  // 依頼中バッジは項目ボタンの「兄弟」として置く。<button> の中に
  // role="button" を入れ子にすると HTML として不正で、スクリーンリーダーが
  // 内側を読まない / 二重に読む (2026-09-04)
  const pendingBadge = pending > 0 && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onJumpToRequestedSubs?.();
      }}
      title="今日以降の未処理 (代行未定 + 依頼中) を表示"
      aria-label={`未処理の代行 ${pending} 件を表示`}
      style={{
        marginLeft: 6,
        border: "none",
        background: colors.danger,
        color: "#fff",
        borderRadius: 10,
        padding: "1px 6px",
        fontSize: 9,
        fontWeight: 800,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {pending}
    </button>
  );

  // 項目 1 行 (+ 開いている画面ならその中のセクション / タブ)。indent はカテゴリの中
  const renderItem = (item, indent) => {
    const selfActive = !selected && view === item.key;
    const isModal = item.action === "modal";
    return (
      <div key={item.key}>
        {/* 項目本体と依頼中バッジは兄弟の <button> に分ける (入れ子の button は
            不正な DOM)。行の背景色は外側の div が持つ */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            background: selfActive ? "#3a3a6e" : "transparent",
            color: selfActive ? "#fff" : "#ccc",
          }}
        >
          <button
            aria-current={selfActive ? "page" : undefined}
            onClick={() => {
              if (isModal) {
                if (item.modal === "dayReschedule") onOpenDayReschedule?.();
                else if (item.modal === "multiDayAbsence") onOpenMultiDayAbsence?.();
                else if (item.modal === "testPrep") onOpenTestPrep?.();
                else if (item.modal === "monthBatch") onOpenMonthBatch?.();
                else onOpenDataMgr();
                onClose?.();
              } else {
                onSelectView(item.key);
                // モバイルでは選択後にサイドバーを閉じる (デスクトップでは @media で常時表示)
                if (typeof window !== "undefined" && window.innerWidth <= 768) onClose?.();
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              padding: indent ? "8px 14px 8px 26px" : "10px 14px",
              border: "none",
              background: "transparent",
              color: "inherit",
              textAlign: "left",
              cursor: "pointer",
              fontSize: indent ? 12.5 : 13,
              fontWeight: selfActive ? 700 : 400,
            }}
          >
            <span style={{ flex: 1, display: "flex", alignItems: "center" }}>
              <span>
                {item.icon} {item.label}
              </span>
              {!isModal && <ChordHint viewKey={item.key} dim={!selfActive} />}
            </span>
          </button>
          {/* 未処理バッジ: 項目そのもの (授業管理)。カテゴリが閉じているときは
              カテゴリの見出しに出す */}
          {item.badge && pendingBadge}
        </div>
        {/* 画面の中のセクション / タブは、その画面を開いている間だけ名前を出す */}
        {selfActive && item.sections && (
          <SectionLinks
            sections={item.sections}
            activeKey={sectionActiveKey[item.key]}
            onSelect={sectionSelect[item.key]}
            onClose={onClose}
          />
        )}
      </div>
    );
  };

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
          /* no-print 必須: 紙面のメディアクエリは「画面幅」ではなく「紙面幅」
             で評価される (A4 縦 - @page margin 8mm ≒ 733px < 769px) ため、
             デスクトップ幅で backdrop を消している
             @media (min-width: 769px) は印刷時には効かない。これが無いと
             open のまま印刷したとき rgba(0,0,0,.4) が紙面全体に乗る */
          className="sidebar-backdrop no-print"
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
        className={`sidebar${open ? "" : " is-closed"}`}
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
          // デスクトップは @media で left: 0 に固定。モバイルは開=0、閉=-220 だが、
          // サイドバー幅が 280px に広がる 768px 以下では App.jsx の .sidebar.is-closed
          // ルールが left を calc(-1 * min(85vw, 280px) - 8px) に上書きする。
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
        <div style={{ padding: "8px 10px", position: "relative" }}>
          <input
            type="text"
            placeholder="講師名・よみで検索…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && search) {
                e.stopPropagation();
                onSearchChange("");
              }
            }}
            aria-label="講師名で検索"
            style={{
              width: "100%",
              padding: search ? "8px 28px 8px 10px" : "8px 10px",
              borderRadius: 6,
              border: "1px solid #3a3a5e",
              background: "#2a2a4e",
              color: "#fff",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="検索をクリア"
              title="検索をクリア"
              style={{
                position: "absolute",
                right: 16,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "#8888aa",
                cursor: "pointer",
                fontSize: 14,
                padding: 2,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          )}
        </div>
        {/* メニュー + 講師一覧。デスクトップはメニュー固定・講師一覧のみ
            スクロール。モバイル (App.jsx の @media で上書き) はラッパー全体を
            1 つのスクロール領域にする — 画面が低いと講師一覧の flex 高さが
            0 になり、スクロールもできず講師に辿り着けなくなるため。 */}
        <div
          className="sidebar-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
        {/* 項目が多い (管理者は 20 行を超える) ので、背の低くない画面でも
            メニューだけで縦がいっぱいになると下のログイン欄に重なっていた。
            メニューは高さの 6 割までにして中でスクロールし、講師一覧の場所を
            残す (統合スクロールの画面では appShell.css が外す) */}
        <div
          ref={menuRef}
          className="sidebar-menu"
          style={{
            borderBottom: "1px solid #2a2a4e",
            flex: "0 1 auto",
            minHeight: 0,
            maxHeight: "60%",
            overflowY: "auto",
          }}
        >
          {SIDEBAR_PINNED.filter(visible).map((item) => renderItem(item, false))}
          {SIDEBAR_CATEGORIES.map((cat) => {
            const items = cat.items.filter(visible);
            if (items.length === 0) return null;
            const isOpen = openCategories.has(cat.key);
            const isCurrent = activeCategory === cat.key;
            const hasBadge = items.some((i) => i.badge);
            return (
              <div key={cat.key} role="group" aria-label={cat.label}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    borderTop: "1px solid #24244a",
                    background: isCurrent && !isOpen ? "#2a2a4e" : "transparent",
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggleCategory(cat.key, isOpen)}
                    title={isOpen ? `${cat.label} を閉じる` : `${cat.label} を開く`}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px 6px",
                      border: "none",
                      background: "transparent",
                      color: isCurrent ? "#fff" : "#9a9ac0",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 0.5,
                    }}
                  >
                    <span aria-hidden="true" style={{ width: 10, fontSize: 9 }}>
                      {isOpen ? "▾" : "▸"}
                    </span>
                    <span style={{ flex: 1 }}>
                      {cat.icon} {cat.label}
                    </span>
                    {!isOpen && (
                      <span style={{ fontSize: 10, color: "#6a6a8e", fontWeight: 700 }}>
                        {items.length}
                      </span>
                    )}
                  </button>
                  {/* 閉じているときも未処理の代行は見えるように (授業管理がこの中) */}
                  {!isOpen && hasBadge && pendingBadge && (
                    <span style={{ paddingRight: 10, display: "flex" }}>{pendingBadge}</span>
                  )}
                </div>
                {isOpen && items.map((item) => renderItem(item, true))}
              </div>
            );
          })}
        </div>
        <div
          className="sidebar-teachers"
          style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 0" }}
        >
          {totalTeachers === 0 && (
            <div
              style={{
                textAlign: "center",
                color: "#8888aa",
                padding: "18px 12px",
                fontSize: 11,
                lineHeight: 1.7,
              }}
            >
              <div aria-hidden="true" style={{ fontSize: 22, marginBottom: 4, opacity: 0.6 }}>
                {search ? "🔍" : "👥"}
              </div>
              {search ? (
                <>
                  <div>
                    「{search}」に一致する
                    <br />
                    講師はいません
                  </div>
                  <button
                    type="button"
                    onClick={() => onSearchChange("")}
                    style={{
                      marginTop: 8,
                      background: "#3a3a6e",
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      padding: "4px 10px",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    検索をクリア
                  </button>
                </>
              ) : (
                <>
                  <div>講師が登録されていません</div>
                  <button
                    type="button"
                    onClick={() => onSelectView(VIEWS.MASTER)}
                    style={{
                      marginTop: 8,
                      background: "#3a3a6e",
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      padding: "4px 10px",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    コースマスターへ
                  </button>
                </>
              )}
            </div>
          )}
          {teacherGroups.map((group, gi) => {
            const color = subjectColorByName.get(group.label) || "#888";
            // 講師の所属で分けているときは「現役部」「予備校部」の見出しを挟む
            // (section は所属を誰も分けていなければ付かない = 従来の見た目)
            const sectionHead =
              group.section && group.section !== teacherGroups[gi - 1]?.section
                ? group.section === "genyaku"
                  ? "現役部"
                  : "予備校部"
                : null;
            return (
              <div key={group.key}>
                {sectionHead && (
                  <div
                    style={{
                      padding: "10px 14px 2px",
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 2,
                      color: "#8a8ab0",
                    }}
                  >
                    {sectionHead}
                  </div>
                )}
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
                {group.teachers.map((t) => (
                  <SidebarTeacherButton
                    key={t}
                    name={t}
                    count={slotCountByTeacher.get(t) || 0}
                    isSelected={selected === t}
                    onSelect={onSelectTeacher}
                  />
                ))}
              </div>
            );
          })}
        </div>
        </div>
        <SyncStatus isAdmin={isAdmin} />
        <LoginForm isAdmin={isAdmin} onSignIn={onSignIn} onSignOut={onSignOut} />
      </nav>
    </>
  );
}
