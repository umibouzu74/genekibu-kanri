import { useCallback, useEffect, useMemo, useState } from "react";
import { monthlyTally } from "../../data";
import { S } from "../../styles/common";
import { sortJa } from "../../utils/sortJa";
import { encodeShareData } from "../../utils/shareCodec";
import { useToasts } from "../../hooks/useToasts";
import { ShareLinkButton } from "../ShareLinkButton";
import { ExcelGridView } from "./ExcelGridView";
import { SubListTab } from "./substitute/SubListTab";
import { SubTallyTab } from "./substitute/SubTallyTab";

export function SubstituteView({
  subs,
  slots,
  holidays,
  partTimeStaff,
  onNew,
  onEdit,
  onDel,
  onGoToStaffView,
  initFilter,
  onConsumeInitFilter,
  isAdmin,
  // 時間割表タブ用 props
  saveSubs,
  examPeriods,
  subjects,
  subjectCategories,
  timetables,
  activeTimetableId,
  biweeklyAnchors,
  teacherSubjects,
  classSets,
  displayCutoff,
  onAddAdjustment,
  adjustments = [],
  sessionOverrides = [],
}) {
  const now = new Date();
  const [tab, setTab] = useState("list");
  const [fMonth, setFMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [fStaff, setFStaff] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [expandedTally, setExpandedTally] = useState(new Set());

  // 外部から初期フィルタが渡された場合 (例: Sidebar バッジクリック)
  useEffect(() => {
    if (initFilter) {
      if (initFilter.status) {
        setFStatus(initFilter.status);
        setFMonth(""); // 月フィルタを解除して全件から依頼中を表示
        setTab("list");
      }
      onConsumeInitFilter?.();
    }
  }, [initFilter, onConsumeInitFilter]);

  // partTimeStaff は新形式 {name, subjectIds}[] のみを想定
  const staffNameSet = useMemo(
    () => new Set(partTimeStaff.map((s) => s.name)),
    [partTimeStaff]
  );

  const slotMap = useMemo(() => {
    const m = {};
    slots.forEach((s) => {
      m[s.id] = s;
    });
    return m;
  }, [slots]);

  const filtered = useMemo(() => {
    let r = [...subs];
    if (fMonth) r = r.filter((s) => s.date?.startsWith(fMonth));
    if (fStaff)
      r = r.filter((s) => s.originalTeacher === fStaff || s.substitute === fStaff);
    if (fStatus) r = r.filter((s) => s.status === fStatus);
    return r.sort((a, b) => a.date.localeCompare(b.date));
  }, [subs, fMonth, fStaff, fStatus]);

  const [ty, tm] = fMonth ? fMonth.split("-").map(Number) : [0, 0];
  const tally = useMemo(
    () => (ty && tm ? monthlyTally(subs, ty, tm) : { covered: {}, coveredFor: {} }),
    [subs, ty, tm]
  );

  const tallyRows = useMemo(() => {
    const names = new Set(staffNameSet);
    Object.keys(tally.covered).forEach((n) => names.add(n));
    Object.keys(tally.coveredFor).forEach((n) => names.add(n));
    return [...names]
      .map((name) => ({
        name,
        covered: tally.covered[name] || 0,
        coveredFor: tally.coveredFor[name] || 0,
        isPT: staffNameSet.has(name),
      }))
      .sort(
        (a, b) =>
          b.covered + b.coveredFor - (a.covered + a.coveredFor) ||
          a.name.localeCompare(b.name)
      );
  }, [tally, staffNameSet]);

  const allTeachers = useMemo(() => {
    const set = new Set(staffNameSet);
    slots.forEach((s) => s.teacher && set.add(s.teacher));
    return sortJa([...set]);
  }, [slots, staffNameSet]);

  const toasts = useToasts();
  const [sharing, setSharing] = useState(false);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    const target = filtered.length > 0 ? filtered : subs;
    if (target.length === 0) {
      toasts.error("共有する代行データがありません");
      return;
    }
    setSharing(true);
    try {
      const referencedSlotIds = new Set(target.map((s) => s.slotId));
      const referencedSlots = slots.filter((s) => referencedSlotIds.has(s.id));
      const encoded = await encodeShareData({
        slots: referencedSlots,
        substitutions: target,
        generatedAt: new Date().toISOString(),
      });
      const url = `${window.location.origin}${window.location.pathname}#/share/${encoded}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: "代行情報", url });
          toasts.success("共有しました");
          return;
        } catch {
          // User cancelled or Web Share unavailable – fall through to clipboard
        }
      }
      await navigator.clipboard.writeText(url);
      toasts.success("共有リンクをコピーしました");
    } catch {
      toasts.error("共有リンクの生成に失敗しました");
    } finally {
      setSharing(false);
    }
  }, [filtered, subs, slots, sharing, toasts]);

  const TabBtn = ({ k, label, count }) => (
    <button onClick={() => setTab(k)} style={S.btn(tab === k)}>
      {label}
      {count != null && <span style={{ marginLeft: 5, opacity: 0.7 }}>{count}</span>}
    </button>
  );

  return (
    <div style={{ marginTop: 12 }}>
      {isAdmin && (
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={onNew}
            style={{
              padding: "12px 24px",
              borderRadius: 8,
              border: "2px solid #2a7a2a",
              background: "#e8f5e8",
              color: "#2a7a2a",
              fontSize: 15,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(42,122,42,0.1)",
            }}
          >
            ＋ 新規代行
          </button>
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <TabBtn k="list" label="代行一覧" count={subs.length} />
        <TabBtn k="tally" label="月次集計" />
        <TabBtn k="timetable" label="時間割表" />
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <ShareLinkButton onClick={handleShare} busy={sharing} />
          <button
            type="button"
            onClick={onGoToStaffView}
            style={{
              ...S.btn(false),
              fontSize: 11,
              background: "#fff",
              border: "1px solid #ccc",
            }}
          >
            バイト管理へ
          </button>
        </div>
      </div>

      {tab === "list" && (
        <SubListTab
          filtered={filtered}
          subs={subs}
          slotMap={slotMap}
          allTeachers={allTeachers}
          fMonth={fMonth}
          setFMonth={setFMonth}
          fStaff={fStaff}
          setFStaff={setFStaff}
          fStatus={fStatus}
          setFStatus={setFStatus}
          isAdmin={isAdmin}
          onEdit={onEdit}
          onDel={onDel}
        />
      )}

      {tab === "tally" && (
        <SubTallyTab
          tallyRows={tallyRows}
          subs={subs}
          slots={slots}
          holidays={holidays}
          ty={ty}
          tm={tm}
          fMonth={fMonth}
          setFMonth={setFMonth}
          expandedTally={expandedTally}
          setExpandedTally={setExpandedTally}
        />
      )}

      {tab === "timetable" && (
        <ExcelGridView
          slots={slots}
          saveSlots={() => {}}
          biweeklyAnchors={biweeklyAnchors || []}
          isAdmin={isAdmin}
          timetables={timetables || []}
          activeTimetableId={activeTimetableId}
          partTimeStaff={partTimeStaff}
          subjects={subjects || []}
          subs={subs}
          saveSubs={saveSubs}
          holidays={holidays}
          examPeriods={examPeriods || []}
          subjectCategories={subjectCategories || []}
          teacherSubjects={teacherSubjects || {}}
          classSets={classSets || []}
          displayCutoff={displayCutoff}
          onAddAdjustment={onAddAdjustment}
          adjustments={adjustments}
          sessionOverrides={sessionOverrides}
          enableSubMode
        />
      )}
    </div>
  );
}
