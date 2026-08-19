import { useCallback, useEffect, useMemo, useState } from "react";
import { monthlyTally } from "../../data";
import { S } from "../../styles/common";
import { compareTeacherNames, sortTeacherNames } from "../../utils/teacherKana";
import { encodeShareData } from "../../utils/shareCodec";
import { useToasts } from "../../hooks/useToasts";
import { useSessionCtx } from "../../hooks/useSessionCtx";
import { DayRescheduleDialog } from "../DayRescheduleDialog";
import { ShareLinkButton } from "../ShareLinkButton";
import { ExcelGridView } from "./ExcelGridView";
import { SubListTab } from "./substitute/SubListTab";
import { SubTallyTab } from "./substitute/SubTallyTab";
import { AdjustmentListTab } from "./substitute/AdjustmentListTab";
import { OverrideListTab } from "./substitute/OverrideListTab";

export function SubstituteView({
  subs,
  slots,
  holidays,
  partTimeStaff,
  teacherKana = {},
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
  daySchedules = [],
  onAddAdjustment,
  onDelAdjustment,
  saveAdjustments,
  onDelAdjustments,
  onDelSessionOverride,
  onJumpToAbsenceFlow,
  adjustments = [],
  sessionOverrides = [],
  extraLessons = [],
}) {
  const now = new Date();
  const [tab, setTab] = useState("list");
  const [fMonth, setFMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [fStaff, setFStaff] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [expandedTally, setExpandedTally] = useState(new Set());
  // 日まるごと振替ダイアログ (時間割調整一覧タブから開く)
  const [dayRescheduleOpen, setDayRescheduleOpen] = useState(false);

  // 外部から初期フィルタが渡された場合の処理。
  //  - initFilter.status: Sidebar バッジクリック等。月フィルタは解除して
  //    全件の中から該当ステータスを表示。タブは強制的に「代行一覧」へ。
  //  - initFilter.tab:    CommandPalette からのサブタブジャンプ。月 / 講師 /
  //    ステータスなどの既存フィルタは故意に保持する (「いま見ている範囲で
  //    別タブの内容を確認する」操作を妨げないため)。
  useEffect(() => {
    if (initFilter) {
      if (initFilter.status) {
        setFStatus(initFilter.status);
        setFMonth("");
        setTab("list");
      }
      if (initFilter.tab) {
        setTab(initFilter.tab);
      }
      // Cmd+K の「日まるごと振替」からはダイアログまで開く
      if (initFilter.open === "dayReschedule") {
        setDayRescheduleOpen(true);
      }
      onConsumeInitFilter?.();
    }
  }, [initFilter, onConsumeInitFilter]);

  // 月次集計タブは対象月が必須 (fMonth 空だと無言で全行 0 になる)。
  // ステータスバッジ経由 (initFilter.status で fMonth を解除) の後に
  // 集計タブへ移った場合などは当月へフォールバックする (K3f)。
  useEffect(() => {
    if (tab === "tally" && !fMonth) {
      setFMonth(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- now は render 毎に新しいが月精度では安定
  }, [tab, fMonth]);

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

  // 日まるごと振替の対象抽出 (実施されるコマか) に使う ctx。
  // 休講・テスト期間・時間割の有効期間・表示期間・特別時程・隔週の解釈を
  // 回数計算と一本化するため、画面独自の判定は書かない。
  const { sessionCtx } = useSessionCtx({
    classSets,
    slots,
    displayCutoff,
    timetables,
    holidays,
    examPeriods,
    biweeklyAnchors,
    sessionOverrides,
    daySchedules,
  });

  const filtered = useMemo(() => {
    let r = [...subs];
    if (fMonth) r = r.filter((s) => s.date?.startsWith(fMonth));
    if (fStaff)
      r = r.filter((s) => s.originalTeacher === fStaff || s.substitute === fStaff);
    if (fStatus) r = r.filter((s) => s.status === fStatus);
    return r.sort((a, b) => a.date.localeCompare(b.date));
  }, [subs, fMonth, fStaff, fStatus]);

  const adjustmentCount = useMemo(
    () =>
      (adjustments || []).filter(
        (a) => a.type === "combine" || a.type === "move" || a.type === "reschedule"
      ).length,
    [adjustments]
  );

  const [ty, tm] = fMonth ? fMonth.split("-").map(Number) : [0, 0];
  const tally = useMemo(
    () => (ty && tm ? monthlyTally(subs, ty, tm) : { covered: {}, coveredFor: {} }),
    [subs, ty, tm]
  );

  const byKana = useMemo(() => compareTeacherNames(teacherKana), [teacherKana]);

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
        // 件数の多い順。同件数 (0 件が大半) はよみのあいうえお順で割る
        (a, b) =>
          b.covered + b.coveredFor - (a.covered + a.coveredFor) ||
          byKana(a.name, b.name)
      );
  }, [tally, staffNameSet, byKana]);

  const allTeachers = useMemo(() => {
    const set = new Set(staffNameSet);
    slots.forEach((s) => s.teacher && set.add(s.teacher));
    return sortTeacherNames([...set], teacherKana);
  }, [slots, staffNameSet, teacherKana]);

  const toasts = useToasts();
  const [sharing, setSharing] = useState(false);

  // 合同を削除すると、その日の同 slot に紐づく回数補正 (skip 等) が
  // 孤立しがち。削除直後に件数を info トーストで案内する。
  // 削除コールバックの引数規約は 3 タブ通して id に統一 (sub.id / ov.id / adj.id)。
  const handleDelAdjustment = useCallback(
    (id) => {
      const adj = (adjustments || []).find((a) => a.id === id);
      if (adj?.type === "combine") {
        const ids = new Set([
          adj.slotId,
          ...(adj.combineSlotIds || []).filter((x) => x != null),
        ]);
        const related = (sessionOverrides || []).filter(
          (o) => o.date === adj.date && ids.has(o.slotId)
        );
        if (related.length > 0) {
          toasts.info(
            `関連する回数補正が ${related.length} 件残っています。回数補正一覧で確認してください。`,
            { duration: 8000 }
          );
        }
      }
      onDelAdjustment?.(id);
    },
    [adjustments, onDelAdjustment, sessionOverrides, toasts]
  );

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
        <TabBtn k="adjustment" label="時間割調整一覧" count={adjustmentCount} />
        <TabBtn k="override" label="回数補正一覧" count={sessionOverrides.length} />
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
          slots={slots}
          partTimeStaff={partTimeStaff}
          teacherKana={teacherKana}
          subjects={subjects}
          onEdit={onEdit}
          onDel={onDel}
          onNew={onNew}
        />
      )}

      {tab === "adjustment" && (
        <AdjustmentListTab
          adjustments={adjustments}
          slots={slots}
          isAdmin={isAdmin}
          partTimeStaff={partTimeStaff}
          subjects={subjects}
          teacherKana={teacherKana}
          onDel={handleDelAdjustment}
          onJumpToDate={onJumpToAbsenceFlow}
          onOpenDayReschedule={
            saveAdjustments ? () => setDayRescheduleOpen(true) : null
          }
        />
      )}

      {tab === "override" && (
        <OverrideListTab
          sessionOverrides={sessionOverrides}
          slots={slots}
          isAdmin={isAdmin}
          partTimeStaff={partTimeStaff}
          subjects={subjects}
          teacherKana={teacherKana}
          onDel={onDelSessionOverride}
          onJumpToDate={onJumpToAbsenceFlow}
        />
      )}

      {tab === "tally" && (
        <SubTallyTab
          tallyRows={tallyRows}
          subs={subs}
          slots={slots}
          holidays={holidays}
          examPeriods={examPeriods || []}
          timetables={timetables || []}
          displayCutoff={displayCutoff}
          daySchedules={daySchedules}
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
          extraLessons={extraLessons}
          enableSubMode
        />
      )}

      {dayRescheduleOpen && (
        <DayRescheduleDialog
          slots={slots}
          adjustments={adjustments}
          sessionCtx={sessionCtx}
          isAdmin={isAdmin}
          saveAdjustments={saveAdjustments}
          onRemoveAdjustments={onDelAdjustments}
          onClose={() => setDayRescheduleOpen(false)}
          onSaved={({ added, replaced, sourceDate, targetDate }) =>
            toasts.success(
              `${sourceDate} → ${targetDate} に ${added} コマを振り替えました` +
                (replaced > 0 ? ` (${replaced} 件を上書き)` : "")
            )
          }
        />
      )}
    </div>
  );
}
