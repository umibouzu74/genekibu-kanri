import { useCallback, useMemo, useState } from "react";
import {
  DAY_BG as DB,
  DAY_COLOR as DC,
  DAYS,
  fmtDate,
  INIT_HOLIDAYS,
  INIT_PART_TIME_STAFF,
  INIT_SLOTS,
  INIT_SUBJECTS,
  INIT_SUBJECT_CATEGORIES,
} from "./data";

import { VIEWS } from "./constants/views";
import { useLocalStorage, useLocalStorageRaw } from "./hooks/useLocalStorage";
import { useToasts } from "./hooks/useToasts";
import { useConfirm } from "./hooks/useConfirm";
import { colors, font, S } from "./styles/common";
import {
  CURRENT_SCHEMA_VERSION,
  migrateExportBundle,
  nextNumericId,
  validateExportBundle,
} from "./utils/schema";

import { Modal } from "./components/Modal";
import { SlotForm } from "./components/SlotForm";
import { SubstituteForm } from "./components/SubstituteForm";
import { HolidayManager } from "./components/HolidayManager";
import { Sidebar } from "./components/Sidebar";
import { DataManager } from "./components/DataManager";

import { Dashboard } from "./components/views/Dashboard";
import { WeekView } from "./components/views/WeekView";
import { MonthView } from "./components/views/MonthView";
import { AllView } from "./components/views/AllView";
import { MasterView } from "./components/views/MasterView";
import { SubstituteView } from "./components/views/SubstituteView";
import { ConfirmedSubsView } from "./components/views/ConfirmedSubsView";
import { StaffManagerView } from "./components/views/StaffManagerView";

// ─── localStorage keys ──────────────────────────────────────────────
const LS = {
  slots: "genyakubu-slots",
  holidays: "genyakubu-holidays",
  subs: "genyakubu-substitutions",
  partTime: "genyakubu-part-time-staff",
  subjectCategories: "genyakubu-subject-categories",
  subjects: "genyakubu-subjects",
  biweeklyBase: "genyakubu-biweekly-base",
};

// Migrate holiday records to ensure `scope` defaults to ["全部"].
const migrateHolidays = (arr) =>
  Array.isArray(arr) ? arr.map((x) => ({ ...x, scope: x.scope || ["全部"] })) : arr;

// partTimeStaff を string[] (旧形式) から {name, subjectIds}[] (新形式) に
// 変換する。既存ユーザーの localStorage を破壊せずアップグレードする。
const migratePartTimeStaff = (arr) =>
  Array.isArray(arr)
    ? arr.map((x) =>
        typeof x === "string"
          ? { name: x, subjectIds: [] }
          : { name: x?.name ?? "", subjectIds: Array.isArray(x?.subjectIds) ? x.subjectIds : [] }
      )
    : arr;

// 旧「完了」ステータスを廃止したため、既存の completed レコードは confirmed
// に正規化する。
const migrateSubs = (arr) =>
  Array.isArray(arr)
    ? arr.map((s) => (s?.status === "completed" ? { ...s, status: "confirmed" } : s))
    : arr;

export default function App() {
  const toasts = useToasts();
  const confirm = useConfirm();

  const onStorageError = useCallback(
    (err, phase) => {
      if (phase === "quota") {
        toasts.error(
          "保存領域の上限に達しました。データ管理からエクスポートして古いデータを整理してください。"
        );
      } else if (phase === "load") {
        toasts.error(
          `保存データの読み込みに失敗しました: ${err?.message || err}`
        );
      }
    },
    [toasts]
  );

  const [slots, saveSlots] = useLocalStorage(LS.slots, INIT_SLOTS, {
    onError: onStorageError,
  });
  const [holidays, saveHolidays] = useLocalStorage(LS.holidays, INIT_HOLIDAYS, {
    migrate: migrateHolidays,
    onError: onStorageError,
  });
  const [subs, saveSubs] = useLocalStorage(LS.subs, [], {
    migrate: migrateSubs,
    onError: onStorageError,
  });
  const [partTimeStaff, savePartTimeStaff] = useLocalStorage(
    LS.partTime,
    INIT_PART_TIME_STAFF,
    { migrate: migratePartTimeStaff, onError: onStorageError }
  );
  const [subjectCategories, saveSubjectCategories] = useLocalStorage(
    LS.subjectCategories,
    INIT_SUBJECT_CATEGORIES,
    { onError: onStorageError }
  );
  const [subjects, saveSubjects] = useLocalStorage(LS.subjects, INIT_SUBJECTS, {
    onError: onStorageError,
  });
  const [biweeklyBase, saveBiweeklyBase] = useLocalStorageRaw(LS.biweeklyBase, "");

  const [selected, setSelected] = useState(null);
  const [view, setView] = useState(VIEWS.DASH);
  const [monthOff, setMonthOff] = useState(0);
  const [search, setSearch] = useState("");
  const [editSlot, setEditSlot] = useState(null); // null | slot | "new"
  const [editSub, setEditSub] = useState(null); // null | sub | "new"
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showDataMgr, setShowDataMgr] = useState(false);
  const [importing, setImporting] = useState(false);

  // ─── Export / Import / Reset ────────────────────────────────────
  const handleExport = useCallback(() => {
    try {
      const data = JSON.stringify(
        {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          exportedAt: new Date().toISOString(),
          slots,
          holidays,
          biweeklyBase,
          substitutions: subs,
          partTimeStaff,
          subjectCategories,
          subjects,
        },
        null,
        2
      );
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `genyakubu-backup-${fmtDate(new Date())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toasts.success("バックアップをダウンロードしました");
    } catch (err) {
      console.error(err);
      toasts.error("エクスポートに失敗しました");
    }
  }, [slots, holidays, biweeklyBase, subs, partTimeStaff, subjectCategories, subjects, toasts]);

  const handleImport = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ok = await confirm({
        title: "データのインポート",
        message: `「${file.name}」を読み込みます。\n現在のデータは上書きされます。よろしいですか？`,
        okLabel: "読み込む",
        tone: "danger",
      });
      if (!ok) {
        e.target.value = "";
        return;
      }
      setImporting(true);
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const raw = JSON.parse(ev.target.result);
          const migrated = migrateExportBundle(raw);
          const result = validateExportBundle(migrated);
          if (!result.ok) {
            console.error("[import] validation failed:", result);
            toasts.error(`インポートに失敗: ${result.error}`);
            return;
          }
          const d = result.data;
          if (Array.isArray(d.slots)) saveSlots(d.slots);
          if (Array.isArray(d.holidays)) saveHolidays(migrateHolidays(d.holidays));
          if (d.biweeklyBase) saveBiweeklyBase(d.biweeklyBase);
          if (Array.isArray(d.substitutions)) saveSubs(migrateSubs(d.substitutions));
          if (Array.isArray(d.partTimeStaff))
            savePartTimeStaff(migratePartTimeStaff(d.partTimeStaff));
          if (Array.isArray(d.subjectCategories)) saveSubjectCategories(d.subjectCategories);
          if (Array.isArray(d.subjects)) saveSubjects(d.subjects);
          setShowDataMgr(false);
          toasts.success("データをインポートしました");
        } catch (err) {
          console.error(err);
          toasts.error("JSONファイルの読み込みに失敗しました");
        } finally {
          setImporting(false);
        }
      };
      reader.onerror = () => {
        setImporting(false);
        toasts.error("ファイル読み込み中にエラーが発生しました");
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [
      confirm,
      toasts,
      saveSlots,
      saveHolidays,
      saveBiweeklyBase,
      saveSubs,
      savePartTimeStaff,
      saveSubjectCategories,
      saveSubjects,
    ]
  );

  const handleReset = useCallback(async () => {
    const ok = await confirm({
      title: "データの初期化",
      message: "データを初期状態に戻しますか？\n現在のデータは失われます。",
      okLabel: "初期化",
      tone: "danger",
    });
    if (!ok) return;
    Object.values(LS).forEach((k) => localStorage.removeItem(k));
    saveSlots(INIT_SLOTS);
    saveHolidays(INIT_HOLIDAYS);
    saveBiweeklyBase("");
    saveSubs([]);
    savePartTimeStaff(INIT_PART_TIME_STAFF);
    saveSubjectCategories(INIT_SUBJECT_CATEGORIES);
    saveSubjects(INIT_SUBJECTS);
    setSelected(null);
    setView(VIEWS.DASH);
    setShowDataMgr(false);
    toasts.success("データを初期化しました");
  }, [
    confirm,
    toasts,
    saveSlots,
    saveHolidays,
    saveBiweeklyBase,
    saveSubs,
    savePartTimeStaff,
    saveSubjectCategories,
    saveSubjects,
  ]);

  // ─── Navigation / teacher selection ─────────────────────────────
  const selectTeacher = useCallback((t) => {
    setSelected(t);
    setView(VIEWS.WEEK);
    setSidebarOpen(false);
  }, []);

  const selectView = useCallback((v) => {
    setSelected(null);
    setView(v);
    setSidebarOpen(false);
  }, []);

  // ─── Derived data ───────────────────────────────────────────────
  const now = new Date();
  const vd = new Date(now.getFullYear(), now.getMonth() + monthOff, 1);
  const vy = vd.getFullYear();
  const vm = vd.getMonth() + 1;

  // 教員をカテゴリ (バイト → 英数国理社 → その他) にグループ化する。
  // バイトは partTimeStaff にいる名前をそのまま「バイト」グループに入れる。
  // それ以外の教員は slots.subj を教科マスター (名前 / 別名) と照合し、
  // 最も多く担当している教科を primary として振り分ける。
  const teacherGroups = useMemo(() => {
    const staffNameSet = new Set(partTimeStaff.map((s) => s.name));

    // slot.subj 文字列から Subject を推定
    const matchSubject = (subjStr) => {
      if (!subjStr) return null;
      const exact = subjects.find((s) => s.name === subjStr);
      if (exact) return exact;
      const byName = subjects.find((s) => subjStr.includes(s.name));
      if (byName) return byName;
      const byAlias = subjects.find(
        (s) =>
          Array.isArray(s.aliases) &&
          s.aliases.some((a) => a && subjStr.includes(a))
      );
      return byAlias || null;
    };

    // 教員ごとの「教科名 → コマ数」集計
    const teacherSubjectCounts = new Map();
    for (const slot of slots) {
      if (!slot.teacher) continue;
      const matched = matchSubject(slot.subj);
      if (!matched) continue;
      if (!teacherSubjectCounts.has(slot.teacher)) {
        teacherSubjectCounts.set(slot.teacher, new Map());
      }
      const m = teacherSubjectCounts.get(slot.teacher);
      m.set(matched.name, (m.get(matched.name) || 0) + 1);
    }

    // 全教員を列挙 (slots + partTimeStaff)
    const allTeachers = new Set();
    for (const s of slots) if (s.teacher) allTeachers.add(s.teacher);
    for (const s of partTimeStaff) allTeachers.add(s.name);

    // バイト / 教科別 / その他 に仕分け
    const staffGroup = [];
    const bySubject = new Map();
    const other = [];
    for (const t of allTeachers) {
      if (staffNameSet.has(t)) {
        staffGroup.push(t);
        continue;
      }
      const counts = teacherSubjectCounts.get(t);
      let primary = null;
      let best = 0;
      if (counts) {
        for (const [name, cnt] of counts) {
          if (cnt > best) {
            best = cnt;
            primary = name;
          }
        }
      }
      if (primary) {
        if (!bySubject.has(primary)) bySubject.set(primary, []);
        bySubject.get(primary).push(t);
      } else {
        other.push(t);
      }
    }

    staffGroup.sort();
    for (const arr of bySubject.values()) arr.sort();
    other.sort();

    // 表示順: バイト → 英数国理社 → それ以外の教科 → その他
    const SUBJECT_ORDER = ["英語", "数学", "国語", "理科", "社会"];
    const groups = [];
    if (staffGroup.length) {
      groups.push({ key: "__staff__", label: "バイト", teachers: staffGroup });
    }
    for (const name of SUBJECT_ORDER) {
      const arr = bySubject.get(name);
      if (arr && arr.length) {
        groups.push({ key: name, label: name, teachers: arr });
      }
    }
    for (const [name, arr] of bySubject) {
      if (!SUBJECT_ORDER.includes(name) && arr.length) {
        groups.push({ key: name, label: name, teachers: arr });
      }
    }
    if (other.length) {
      groups.push({ key: "__other__", label: "その他", teachers: other });
    }

    // 検索フィルタ
    if (search) {
      return groups
        .map((g) => ({
          ...g,
          teachers: g.teachers.filter((t) => t.includes(search)),
        }))
        .filter((g) => g.teachers.length > 0);
    }
    return groups;
  }, [slots, partTimeStaff, subjects, search]);

  // ─── Slot / Sub CRUD ────────────────────────────────────────────
  // Robust monotonic IDs: derived from the global maximum across the
  // current list so imports / merges never collide.
  const nextId = () => nextNumericId(slots);
  const nextSubId = () => nextNumericId(subs);

  const handleSaveSlot = (f) => {
    if (editSlot === "new") {
      saveSlots([...slots, { ...f, id: nextId() }]);
      toasts.success("コマを追加しました");
    } else {
      saveSlots(slots.map((s) => (s.id === editSlot.id ? { ...f, id: s.id } : s)));
      toasts.success("コマを更新しました");
    }
    setEditSlot(null);
  };

  const handleDelSlot = async (id) => {
    const linkedSubs = subs.filter((s) => s.slotId === id);
    const extra = linkedSubs.length
      ? `\n※この操作で ${linkedSubs.length} 件の代行記録も削除されます。`
      : "";
    const ok = await confirm({
      title: "コマの削除",
      message: `このコマを削除しますか？${extra}`,
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    saveSlots(slots.filter((s) => s.id !== id));
    if (linkedSubs.length) {
      saveSubs(subs.filter((s) => s.slotId !== id));
    }
    toasts.success(
      linkedSubs.length
        ? `コマと ${linkedSubs.length} 件の代行記録を削除しました`
        : "コマを削除しました"
    );
  };

  const handleSaveSub = (f) => {
    const ts = new Date().toISOString();

    // 1日分モードからの一括保存 (配列)。新規追加時のみ到達する想定
    if (Array.isArray(f)) {
      let next = subs.reduce((m, s) => Math.max(m, s.id || 0), 0) + 1;
      const newRecords = f.map((r) => ({
        ...r,
        status: r.substitute ? r.status : "requested",
        id: next++,
        createdAt: ts,
        updatedAt: ts,
      }));
      saveSubs([...subs, ...newRecords]);
      toasts.success(`代行を ${newRecords.length} 件追加しました`);
      setEditSub(null);
      return;
    }

    const normalized = { ...f, status: f.substitute ? f.status : "requested" };
    if (editSub === "new") {
      saveSubs([...subs, { ...normalized, id: nextSubId(), createdAt: ts, updatedAt: ts }]);
      toasts.success("代行を追加しました");
    } else {
      saveSubs(
        subs.map((s) =>
          s.id === editSub.id
            ? { ...normalized, id: s.id, createdAt: s.createdAt, updatedAt: ts }
            : s
        )
      );
      toasts.success("代行を更新しました");
    }
    setEditSub(null);
  };

  const handleDelSub = async (id) => {
    const ok = await confirm({
      title: "代行の削除",
      message: "この代行記録を削除しますか？",
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    saveSubs(subs.filter((s) => s.id !== id));
    toasts.success("代行記録を削除しました");
  };

  // ─── Staff (バイト) / Subject / Category CRUD ────────────────────
  const handleAddStaff = (name) => {
    const n = name.trim();
    if (!n) return false;
    if (partTimeStaff.some((s) => s.name === n)) {
      toasts.error(`「${n}」は既に登録されています`);
      return false;
    }
    savePartTimeStaff([...partTimeStaff, { name: n, subjectIds: [] }]);
    toasts.success(`「${n}」を追加しました`);
    return true;
  };

  const handleDelStaff = async (name) => {
    const used = subs.some(
      (s) => s.originalTeacher === name || s.substitute === name
    );
    const extra = used ? "\n※過去の代行記録は削除されません" : "";
    const ok = await confirm({
      title: "バイトの削除",
      message: `「${name}」をバイト一覧から削除しますか？${extra}`,
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    savePartTimeStaff(partTimeStaff.filter((s) => s.name !== name));
    toasts.success(`「${name}」を削除しました`);
  };

  const handleToggleStaffSubject = (name, subjectId) => {
    savePartTimeStaff(
      partTimeStaff.map((s) => {
        if (s.name !== name) return s;
        const has = s.subjectIds.includes(subjectId);
        return {
          ...s,
          subjectIds: has
            ? s.subjectIds.filter((id) => id !== subjectId)
            : [...s.subjectIds, subjectId],
        };
      })
    );
  };

  const handleSaveCategory = (cat) => {
    if (cat.id) {
      // インライン編集はキーストロークごとに呼ばれるため toast は出さない
      saveSubjectCategories(
        subjectCategories.map((c) => (c.id === cat.id ? { ...c, ...cat } : c))
      );
    } else {
      const id = nextNumericId(subjectCategories);
      saveSubjectCategories([...subjectCategories, { ...cat, id }]);
      toasts.success("カテゴリを追加しました");
    }
  };

  const handleDelCategory = async (id) => {
    const childSubjects = subjects.filter((s) => s.categoryId === id);
    const extra = childSubjects.length
      ? `\n※このカテゴリ配下の ${childSubjects.length} 件の教科も削除されます。`
      : "";
    const ok = await confirm({
      title: "カテゴリの削除",
      message: `このカテゴリを削除しますか？${extra}`,
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    const removedSubjectIds = new Set(childSubjects.map((s) => s.id));
    saveSubjects(subjects.filter((s) => s.categoryId !== id));
    saveSubjectCategories(subjectCategories.filter((c) => c.id !== id));
    // バイトの担当教科からも除外
    if (removedSubjectIds.size) {
      savePartTimeStaff(
        partTimeStaff.map((s) => ({
          ...s,
          subjectIds: s.subjectIds.filter((sid) => !removedSubjectIds.has(sid)),
        }))
      );
    }
    toasts.success("カテゴリを削除しました");
  };

  const handleSaveSubject = (subj) => {
    if (subj.id) {
      // インライン編集はキーストロークごとに呼ばれるため toast は出さない
      saveSubjects(
        subjects.map((s) => (s.id === subj.id ? { ...s, ...subj } : s))
      );
    } else {
      const id = nextNumericId(subjects);
      saveSubjects([...subjects, { ...subj, id }]);
      toasts.success("教科を追加しました");
    }
  };

  const handleDelSubject = async (id) => {
    const ok = await confirm({
      title: "教科の削除",
      message: "この教科を削除しますか？\n※バイトの担当教科設定からも除外されます。",
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    saveSubjects(subjects.filter((s) => s.id !== id));
    savePartTimeStaff(
      partTimeStaff.map((s) => ({
        ...s,
        subjectIds: s.subjectIds.filter((sid) => sid !== id),
      }))
    );
    toasts.success("教科を削除しました");
  };

  // ─── Print ──────────────────────────────────────────────────────
  const handlePrint = () => {
    const el = document.getElementById("main-content");
    if (!el) return;
    const w = window.open("", "_blank");
    if (!w) {
      toasts.error(
        "ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。"
      );
      return;
    }
    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${selected || "現役部"} 授業予定</title><style>body{font-family:"Hiragino Kaku Gothic Pro","Yu Gothic",sans-serif;padding:16px;font-size:11px}@media print{body{padding:0}}</style></head><body>${el.innerHTML}</body></html>`
    );
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // Precompute per-day / total slot counts for the currently selected
  // teacher so the header badge row doesn't do O(slots * DAYS) work.
  const selDayCounts = useMemo(() => {
    if (!selected) return { total: 0, byDay: {} };
    const byDay = {};
    let total = 0;
    for (const s of slots) {
      if (s.teacher !== selected) continue;
      byDay[s.day] = (byDay[s.day] || 0) + 1;
      total++;
    }
    return { total, byDay };
  }, [slots, selected]);
  const selSlotCount = selDayCounts.total;

  return (
    <div
      style={{
        fontFamily: font.stack,
        display: "flex",
        height: "100vh",
        background: colors.bg,
        color: colors.ink,
      }}
    >
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        view={view}
        selected={selected}
        onSelectView={selectView}
        onSelectTeacher={selectTeacher}
        onOpenDataMgr={() => {
          setShowDataMgr(true);
          setSidebarOpen(false);
        }}
        search={search}
        onSearchChange={setSearch}
        teacherGroups={teacherGroups}
        subjectCategories={subjectCategories}
        slots={slots}
        subs={subs}
      />

      {/* Desktop sidebar spacer */}
      <div className="sidebar-spacer" style={{ width: 210, flexShrink: 0 }} />

      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px", minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="hamburger"
              onClick={() => setSidebarOpen(true)}
              aria-label="サイドバーを開く"
              style={{
                background: "#1a1a2e",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontSize: 18,
                padding: "4px 8px",
                borderRadius: 6,
                lineHeight: 1,
              }}
            >
              ☰
            </button>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
              {view === VIEWS.DASH
                ? "ダッシュボード"
                : view === VIEWS.ALL
                  ? "全講師コマ数一覧"
                  : view === VIEWS.MASTER
                    ? "コースマスター管理"
                    : view === VIEWS.HOLIDAYS
                      ? "祝日・休講日管理"
                      : view === VIEWS.SUBS
                        ? "アルバイト代行管理"
                        : view === VIEWS.STAFF
                          ? "バイト・教科管理"
                          : selected || ""}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            {selected && (
              <>
                <button onClick={() => setView(VIEWS.WEEK)} style={S.btn(view === VIEWS.WEEK)}>
                  週間
                </button>
                <button
                  onClick={() => setView(VIEWS.MONTH)}
                  style={S.btn(view === VIEWS.MONTH)}
                >
                  月間
                </button>
              </>
            )}
            {selected && (
              <button
                onClick={() => setEditSlot("new")}
                style={{ ...S.btn(false), background: "#e8f5e8", color: "#2a7a2a" }}
              >
                ＋ コマ追加
              </button>
            )}
            <button
              type="button"
              onClick={handlePrint}
              aria-label="現在のビューを印刷"
              style={{ ...S.btn(false), border: "1px solid #ccc" }}
            >
              🖨 印刷
            </button>
          </div>
        </div>

        {selected && view === VIEWS.MONTH && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <button
              onClick={() => setMonthOff((o) => o - 1)}
              style={{ ...S.btn(false), padding: "4px 10px", fontSize: 14 }}
            >
              ◀
            </button>
            <span style={{ fontSize: 15, fontWeight: 700 }}>
              {vy}年{vm}月
            </span>
            <button
              onClick={() => setMonthOff((o) => o + 1)}
              style={{ ...S.btn(false), padding: "4px 10px", fontSize: 14 }}
            >
              ▶
            </button>
            <button
              onClick={() => setMonthOff(0)}
              style={{ ...S.btn(false), fontSize: 11 }}
            >
              今月
            </button>
          </div>
        )}

        {selected && (
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            {DAYS.map((d) => {
              const cnt = selDayCounts.byDay[d] || 0;
              return (
                <div
                  key={d}
                  style={{
                    background: cnt ? DB[d] : "#f5f5f5",
                    border: `2px solid ${cnt ? DC[d] : "#ddd"}`,
                    borderRadius: 8,
                    padding: "4px 12px",
                    textAlign: "center",
                    minWidth: 42,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, color: DC[d] }}>{d}</div>
                  <div
                    style={{ fontSize: 18, fontWeight: 800, color: cnt ? "#1a1a2e" : "#ccc" }}
                  >
                    {cnt}
                  </div>
                </div>
              );
            })}
            <div
              style={{
                background: "#1a1a2e",
                borderRadius: 8,
                padding: "4px 12px",
                textAlign: "center",
                minWidth: 42,
                color: "#fff",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800 }}>週計</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{selSlotCount}</div>
            </div>
          </div>
        )}

        <div id="main-content">
          {view === VIEWS.DASH && !selected && (
            <Dashboard slots={slots} holidays={holidays} subs={subs} />
          )}
          {view === VIEWS.ALL && !selected && (
            <AllView slots={slots} onSelectTeacher={selectTeacher} />
          )}
          {view === VIEWS.MASTER && !selected && (
            <MasterView
              slots={slots}
              onEdit={setEditSlot}
              onDel={handleDelSlot}
              onNew={() => setEditSlot("new")}
              biweeklyBase={biweeklyBase}
              onSetBiweeklyBase={saveBiweeklyBase}
            />
          )}
          {view === VIEWS.HOLIDAYS && !selected && (
            <HolidayManager holidays={holidays} onSave={saveHolidays} />
          )}
          {view === VIEWS.SUBS && !selected && (
            <SubstituteView
              subs={subs}
              slots={slots}
              partTimeStaff={partTimeStaff}
              onNew={() => setEditSub("new")}
              onEdit={setEditSub}
              onDel={handleDelSub}
              onGoToStaffView={() => setView(VIEWS.STAFF)}
            />
          )}
          {view === VIEWS.CONFIRMED_SUBS && !selected && (
            <ConfirmedSubsView slots={slots} holidays={holidays} subs={subs} />
          )}
          {view === VIEWS.STAFF && !selected && (
            <StaffManagerView
              partTimeStaff={partTimeStaff}
              subjectCategories={subjectCategories}
              subjects={subjects}
              slots={slots}
              onAddStaff={handleAddStaff}
              onDelStaff={handleDelStaff}
              onToggleStaffSubject={handleToggleStaffSubject}
              onSaveCategory={handleSaveCategory}
              onDelCategory={handleDelCategory}
              onSaveSubject={handleSaveSubject}
              onDelSubject={handleDelSubject}
            />
          )}
          {selected && view === VIEWS.WEEK && (
            <WeekView
              teacher={selected}
              slots={slots}
              subs={subs}
              onEdit={setEditSlot}
              onDel={handleDelSlot}
            />
          )}
          {selected && view === VIEWS.MONTH && (
            <MonthView
              teacher={selected}
              slots={slots}
              holidays={holidays}
              subs={subs}
              year={vy}
              month={vm}
              onEdit={setEditSlot}
              onDel={handleDelSlot}
            />
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editSlot && (
        <Modal
          title={editSlot === "new" ? "コマを追加" : "コマを編集"}
          onClose={() => setEditSlot(null)}
        >
          <SlotForm
            slot={editSlot === "new" ? null : editSlot}
            onSave={handleSaveSlot}
            onCancel={() => setEditSlot(null)}
          />
        </Modal>
      )}

      {/* Substitute Edit Modal */}
      {editSub && (
        <Modal
          title={editSub === "new" ? "代行を追加" : "代行を編集"}
          onClose={() => setEditSub(null)}
        >
          <SubstituteForm
            sub={editSub === "new" ? null : editSub}
            slots={slots}
            subs={subs}
            partTimeStaff={partTimeStaff}
            subjects={subjects}
            onSave={handleSaveSub}
            onCancel={() => setEditSub(null)}
          />
        </Modal>
      )}

      {/* Data Manager Modal */}
      {showDataMgr && (
        <Modal title="データ管理" onClose={() => setShowDataMgr(false)}>
          <DataManager
            slots={slots}
            holidays={holidays}
            onExport={handleExport}
            onImport={handleImport}
            onReset={handleReset}
            importing={importing}
          />
        </Modal>
      )}

      {/* Responsive CSS */}
      <style>{`
        @media (min-width: 769px) {
          .sidebar { left: 0 !important; position: fixed !important; }
          .sidebar-close { display: none !important; }
          .hamburger { display: none !important; }
        }
        @media (max-width: 768px) {
          .sidebar-spacer { display: none !important; }
          .dash-sections { grid-template-columns: 1fr !important; }
          .master-slot-actions { opacity: 1 !important; }
        }
        @media print {
          .dash-sections { grid-template-columns: repeat(3, 1fr) !important; gap: 6px !important; }
          .master-slot-actions { display: none !important; }
        }
      `}</style>
    </div>
  );
}
