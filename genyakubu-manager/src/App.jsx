import { useCallback, useMemo, useState } from "react";
import {
  DAY_BG as DB,
  DAY_COLOR as DC,
  DAYS,
  fmtDate,
  INIT_HOLIDAYS,
  INIT_PART_TIME_STAFF,
  INIT_SLOTS,
} from "./data";

import { VIEWS } from "./constants/views";
import { useLocalStorage, useLocalStorageRaw } from "./hooks/useLocalStorage";
import { S } from "./styles/common";

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

// ─── localStorage keys ──────────────────────────────────────────────
const LS = {
  slots: "genyakubu-slots",
  holidays: "genyakubu-holidays",
  subs: "genyakubu-substitutions",
  partTime: "genyakubu-part-time-staff",
  biweeklyBase: "genyakubu-biweekly-base",
};

// Migrate holiday records to ensure `scope` defaults to ["全部"].
const migrateHolidays = (arr) =>
  Array.isArray(arr) ? arr.map((x) => ({ ...x, scope: x.scope || ["全部"] })) : arr;

export default function App() {
  const [slots, saveSlots] = useLocalStorage(LS.slots, INIT_SLOTS);
  const [holidays, saveHolidays] = useLocalStorage(LS.holidays, INIT_HOLIDAYS, {
    migrate: migrateHolidays,
  });
  const [subs, saveSubs] = useLocalStorage(LS.subs, []);
  const [partTimeStaff, savePartTimeStaff] = useLocalStorage(
    LS.partTime,
    INIT_PART_TIME_STAFF
  );
  const [biweeklyBase, saveBiweeklyBase] = useLocalStorageRaw(LS.biweeklyBase, "");

  const [selected, setSelected] = useState(null);
  const [view, setView] = useState(VIEWS.DASH);
  const [monthOff, setMonthOff] = useState(0);
  const [search, setSearch] = useState("");
  const [editSlot, setEditSlot] = useState(null); // null | slot | "new"
  const [editSub, setEditSub] = useState(null); // null | sub | "new"
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showDataMgr, setShowDataMgr] = useState(false);

  // ─── Export / Import / Reset ────────────────────────────────────
  const handleExport = useCallback(() => {
    const data = JSON.stringify(
      { slots, holidays, biweeklyBase, substitutions: subs, partTimeStaff },
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
  }, [slots, holidays, biweeklyBase, subs, partTimeStaff]);

  const handleImport = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (
        !confirm(
          `「${file.name}」を読み込みます。\n現在のデータは上書きされます。よろしいですか？`
        )
      ) {
        e.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const d = JSON.parse(ev.target.result);
          if (d.slots && Array.isArray(d.slots)) saveSlots(d.slots);
          if (d.holidays && Array.isArray(d.holidays))
            saveHolidays(migrateHolidays(d.holidays));
          if (d.biweeklyBase) saveBiweeklyBase(d.biweeklyBase);
          if (d.substitutions && Array.isArray(d.substitutions)) saveSubs(d.substitutions);
          if (d.partTimeStaff && Array.isArray(d.partTimeStaff))
            savePartTimeStaff(d.partTimeStaff);
          setShowDataMgr(false);
        } catch {
          alert("JSONファイルの読み込みに失敗しました。");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [saveSlots, saveHolidays, saveBiweeklyBase, saveSubs, savePartTimeStaff]
  );

  const handleReset = useCallback(() => {
    if (!confirm("データを初期状態に戻しますか？\n現在のデータは失われます。")) return;
    Object.values(LS).forEach((k) => localStorage.removeItem(k));
    saveSlots(INIT_SLOTS);
    saveHolidays(INIT_HOLIDAYS);
    saveBiweeklyBase("");
    saveSubs([]);
    savePartTimeStaff(INIT_PART_TIME_STAFF);
    setSelected(null);
    setView(VIEWS.DASH);
    setShowDataMgr(false);
  }, [saveSlots, saveHolidays, saveBiweeklyBase, saveSubs, savePartTimeStaff]);

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

  const teachers = useMemo(() => {
    const ts = [...new Set(slots.map((s) => s.teacher))].filter(Boolean).sort();
    return search ? ts.filter((t) => t.includes(search)) : ts;
  }, [slots, search]);

  // ─── Slot / Sub CRUD ────────────────────────────────────────────
  const nextId = () => Math.max(0, ...slots.map((s) => s.id)) + 1;
  const nextSubId = () => Math.max(0, ...subs.map((s) => s.id || 0)) + 1;

  const handleSaveSlot = (f) => {
    if (editSlot === "new") {
      saveSlots([...slots, { ...f, id: nextId() }]);
    } else {
      saveSlots(slots.map((s) => (s.id === editSlot.id ? { ...f, id: s.id } : s)));
    }
    setEditSlot(null);
  };

  const handleDelSlot = (id) => {
    if (confirm("このコマを削除しますか？")) saveSlots(slots.filter((s) => s.id !== id));
  };

  const handleSaveSub = (f) => {
    const ts = new Date().toISOString();
    const normalized = { ...f, status: f.substitute ? f.status : "requested" };
    if (editSub === "new") {
      saveSubs([...subs, { ...normalized, id: nextSubId(), createdAt: ts, updatedAt: ts }]);
    } else {
      saveSubs(
        subs.map((s) =>
          s.id === editSub.id
            ? { ...normalized, id: s.id, createdAt: s.createdAt, updatedAt: ts }
            : s
        )
      );
    }
    setEditSub(null);
  };

  const handleDelSub = (id) => {
    if (confirm("この代行記録を削除しますか？")) saveSubs(subs.filter((s) => s.id !== id));
  };

  // ─── Print ──────────────────────────────────────────────────────
  const handlePrint = () => {
    const el = document.getElementById("main-content");
    if (!el) return;
    const w = window.open("", "_blank");
    if (!w) {
      alert("ポップアップがブロックされました。\nブラウザの設定でポップアップを許可してください。");
      return;
    }
    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${selected || "現役部"} 授業予定</title><style>body{font-family:"Hiragino Kaku Gothic Pro","Yu Gothic",sans-serif;padding:16px;font-size:11px}@media print{body{padding:0}}</style></head><body>${el.innerHTML}</body></html>`
    );
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const selSlotCount = selected ? slots.filter((s) => s.teacher === selected).length : 0;

  return (
    <div
      style={{
        fontFamily: '"Hiragino Kaku Gothic Pro","Yu Gothic","Noto Sans JP",sans-serif',
        display: "flex",
        height: "100vh",
        background: "#f0f1f3",
        color: "#1a1a2e",
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
        teachers={teachers}
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
              className="hamburger"
              onClick={() => setSidebarOpen(true)}
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
              onClick={handlePrint}
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
              const cnt = slots.filter(
                (s) => s.teacher === selected && s.day === d
              ).length;
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
              onSavePartTimeStaff={savePartTimeStaff}
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
            partTimeStaff={partTimeStaff}
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
