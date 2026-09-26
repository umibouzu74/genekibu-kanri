import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { monthlyTally } from "../../data";
import { S } from "../../styles/common";
import { compareTeacherNames, sortTeacherNames } from "../../utils/teacherKana";
import { encodeShareData } from "../../utils/shareCodec";
import { exportSubsCsv } from "../../utils/csv";
import { useToasts } from "../../hooks/useToasts";
import { useToday } from "../../hooks/useToday";
import { useListPeriod } from "../../hooks/useListPeriod";
import { isDateInListPeriod } from "../../utils/listPeriod";
import { matchesSubStateFilter } from "../../utils/substituteState";
import { collectAllTeacherNames } from "../../utils/chainSubstitution";
import { ShareLinkButton } from "../ShareLinkButton";
import { ExcelGridView } from "./ExcelGridView";
import { SubListTab } from "./substitute/SubListTab";
import { SubTallyTab } from "./substitute/SubTallyTab";
import { AdjustmentListTab } from "./substitute/AdjustmentListTab";
import { OverrideListTab } from "./substitute/OverrideListTab";
import { ChainSubstitutionPanel } from "./ChainSubstitutionPanel";

export function SubstituteView({
  subs,
  slots,
  holidays,
  partTimeStaff,
  teacherKana = {},
  onNew,
  // この画面 (＋ 新規代行 / 空表示の ＋ 代行を登録) から保存した直後の
  // レコード (App が useSubsCrud.save の戻り値を渡す)。月フィルタの追従に使う
  createdSubs = null,
  onEdit,
  onDel,
  onQuickUpdate,
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
  onOpenDayReschedule,
  onDelSessionOverride,
  onJumpToAbsenceFlow,
  adjustments = [],
  sessionOverrides = [],
  extraLessons = [],
}) {
  const now = new Date();
  const todayStr = useToday();
  const [tab, setTab] = useState("list");
  // 時間割調整一覧・回数補正一覧は一度開いたら (隠して) 残す。タブを切り替える
  // たびにアンマウントされて、月・講師・種別の絞り込みと並び順が消えていた
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(["list"]));
  useEffect(() => {
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set([...prev, tab])));
  }, [tab]);
  // 月次集計の対象月 (集計は月の指定が必須)
  const [fMonth, setFMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  // 代行一覧の期間。既定は「今月以降」(休講などの一覧と同じ)。以前は当月
  // 固定で、月末に来月の代行が見えず、「すべて」は月の入力を空にするという
  // 見えない操作だった
  const listPeriod = useListPeriod();
  const listPeriodRef = useRef(listPeriod);
  listPeriodRef.current = listPeriod;
  const [fStaff, setFStaff] = useState("");
  const [fStatus, setFStatus] = useState("");
  // 代行一覧の並び: "date" / "date-desc" (対象日) と "createdAt" /
  // "createdAt-desc" (登録日時) の 4 値。並び順を SubListTab ではなく
  // ここで持つのは、📥 表示中を CSV も同じ順で出すため
  const [sortBy, setSortBy] = useState("date");
  const [expandedTally, setExpandedTally] = useState(new Set());
  // 玉突き代行タブの初期日付 (欠勤組み換えの「🔗 玉突き代行で探す」から)
  const [chainInitDate, setChainInitDate] = useState(null);

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
        listPeriodRef.current.setMode("all");
        setTab("list");
      }
      if (initFilter.tab) {
        setTab(initFilter.tab);
        if (initFilter.tab === "chain" && initFilter.date) setChainInitDate(initFilter.date);
      }
      onConsumeInitFilter?.();
    }
  }, [initFilter, onConsumeInitFilter]);

  // 月次集計タブは対象月が必須 (fMonth 空だと無言で全行 0 になる)。
  // 月の入力を空にされた場合などは当月へフォールバックする (K3f)。
  // 代行一覧の期間 (listPeriod) とは別に持つ
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


  const filtered = useMemo(() => {
    let r = listPeriod.apply([...subs], (s) => [s.date, s.date]);
    if (fStaff)
      r = r.filter((s) => s.originalTeacher === fStaff || s.substitute === fStaff);
    // 4 状態 + 「未処理」で絞る (utils/substituteState.SUB_STATE_FILTERS)
    if (fStatus) r = r.filter((s) => matchesSubStateFilter(s, fStatus));
    return r.sort((a, b) => {
      // 4 値: "date" 対象日昇順 / "date-desc" 対象日降順 /
      // "createdAt-desc" 登録が新しい順 / "createdAt" 登録が古い順。
      // 同値時は id (昇順は小さい方を上、降順は新しいレコードを上)
      const desc = sortBy.endsWith("-desc");
      const key = sortBy.startsWith("createdAt") ? "createdAt" : "date";
      const c = (a[key] || "").localeCompare(b[key] || "");
      if (c !== 0) return desc ? -c : c;
      return desc ? (b.id || 0) - (a.id || 0) : (a.id || 0) - (b.id || 0);
    });
  }, [subs, listPeriod, fStaff, fStatus, sortBy]);

  const adjustmentCount = useMemo(
    () =>
      (adjustments || []).filter(
        (a) =>
          a.type === "combine" ||
          a.type === "move" ||
          a.type === "reschedule" ||
          a.type === "cancel"
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

  // 講師・代行者フィルタの候補。講師欄 "香川·福江·川井" をそのまま 1 つの
  // 名前にすると、選んでも originalTeacher (1 人ずつ) と一致せず 0 件になり、
  // 多担任のコマにしか居ない講師は選べなかった。1 人ずつに分け、隔週の
  // パートナー (B 週の担当) と、時間割に居ない代行者 (直接入力) も拾う
  const allTeachers = useMemo(() => {
    const set = collectAllTeacherNames(slots, []);
    for (const n of staffNameSet) set.add(n);
    for (const s of subs) {
      if (s.originalTeacher) set.add(s.originalTeacher);
      if (s.substitute) set.add(s.substitute);
    }
    return sortTeacherNames([...set], teacherKana);
  }, [slots, subs, staffNameSet, teacherKana]);

  const toasts = useToasts();
  const [sharing, setSharing] = useState(false);

  // ＋ 新規代行 で期間の外の日付 (先月の欠勤の登録など) を登録すると、保存は
  // されるのに一覧から消えて「登録できなかった」ように見える (2026-09-15)。
  // 保存経路 (useSubsCrud.save) が返した「いま作ったレコード」を App が
  // createdSubs で渡してくるので、どれも期間の外ならその月の指定へ動かす。
  // 「すべて」はそのまま。subs の増減を見張る方式は、他端末の同期で増えた
  // 分と区別できないのでやめた。期間は ref で読む (期間を変えるたびに
  // この効果が走ると、ユーザーが選んだ期間を作ったレコードの月へ戻してしまう)
  useEffect(() => {
    if (!createdSubs || createdSubs.length === 0) return;
    const period = listPeriodRef.current;
    const dates = createdSubs.map((s) => s.date || "").filter(Boolean).sort();
    if (dates.length === 0) return;
    if (dates.some((d) => isDateInListPeriod(d, period))) return;
    period.setMode("month");
    period.setMonth(dates[0].slice(0, 7));
  }, [createdSubs]);

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
        <TabBtn k="chain" label="🔗 玉突き代行" />
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {tab === "list" && (
            <button
              type="button"
              onClick={() => {
                if (filtered.length === 0) {
                  toasts.error("CSV にする代行記録がありません");
                  return;
                }
                exportSubsCsv(filtered, slotMap);
              }}
              title="いま絞り込んで表示している代行記録を CSV で保存 (全件はデータ管理から)"
              style={{
                ...S.btn(false),
                fontSize: 11,
                background: "#fff",
                border: "1px solid #ccc",
              }}
            >
              📥 表示中を CSV ({filtered.length})
            </button>
          )}
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

      {tab === "chain" && (
        // 代行未定のコマに空き講師を当てる提案 (自動では確定しない)。実装は
        // 以前からあったが、どの画面にも配線されていなかった (2026-09-12)
        <ChainSubstitutionPanel
          key={chainInitDate || "chain"}
          initDate={chainInitDate}
          slots={slots}
          subs={subs}
          holidays={holidays}
          examPeriods={examPeriods}
          partTimeStaff={partTimeStaff}
          subjects={subjects}
          subjectCategories={subjectCategories}
          timetables={timetables}
          biweeklyAnchors={biweeklyAnchors}
          teacherSubjects={teacherSubjects}
          teacherKana={teacherKana}
          saveSubs={saveSubs}
          isAdmin={isAdmin}
        />
      )}
      {tab === "list" && (
        <SubListTab
          filtered={filtered}
          subs={subs}
          slotMap={slotMap}
          allTeachers={allTeachers}
          period={listPeriod}
          fStaff={fStaff}
          setFStaff={setFStaff}
          fStatus={fStatus}
          setFStatus={setFStatus}
          sortBy={sortBy}
          setSortBy={setSortBy}
          isAdmin={isAdmin}
          slots={slots}
          partTimeStaff={partTimeStaff}
          teacherKana={teacherKana}
          subjects={subjects}
          timetables={timetables || []}
          displayCutoff={displayCutoff}
          adjustments={adjustments}
          daySchedules={daySchedules}
          onEdit={onEdit}
          onDel={onDel}
          onQuickUpdate={onQuickUpdate}
          onNew={onNew}
          onJumpToDate={onJumpToAbsenceFlow}
          todayStr={todayStr}
        />
      )}

      {visitedTabs.has("adjustment") && (
        <div hidden={tab !== "adjustment"}>
          <AdjustmentListTab
            adjustments={adjustments}
            slots={slots}
            isAdmin={isAdmin}
            partTimeStaff={partTimeStaff}
            subjects={subjects}
            teacherKana={teacherKana}
            onDel={handleDelAdjustment}
            onJumpToDate={onJumpToAbsenceFlow}
            onOpenDayReschedule={onOpenDayReschedule}
          />
        </div>
      )}

      {visitedTabs.has("override") && (
        <div hidden={tab !== "override"}>
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
        </div>
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
          adjustments={adjustments}
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
          teacherKana={teacherKana}
          subjects={subjects || []}
          subs={subs}
          saveSubs={saveSubs}
          holidays={holidays}
          examPeriods={examPeriods || []}
          subjectCategories={subjectCategories || []}
          teacherSubjects={teacherSubjects || {}}
          classSets={classSets || []}
          displayCutoff={displayCutoff}
          daySchedules={daySchedules}
          onAddAdjustment={onAddAdjustment}
          adjustments={adjustments}
          sessionOverrides={sessionOverrides}
          extraLessons={extraLessons}
          enableSubMode
        />
      )}
    </div>
  );
}
