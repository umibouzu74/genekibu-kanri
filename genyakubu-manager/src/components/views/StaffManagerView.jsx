import { useMemo, useState } from "react";
import { STAFF_TAB, STAFF_TABS, normalizeStaffTab } from "../../constants/staffTabs";
import { useToday } from "../../hooks/useToday";
import {
  fiscalYearOf,
  indexAffiliationChanges,
} from "../../utils/teacherAffiliations";
import { AffiliationView } from "./AffiliationView";
import { splitTeacherField } from "../../utils/biweekly";
import { S } from "../../styles/common";
import {
  missingKanaNames,
  sortByTeacherKana,
  sortTeacherNames,
} from "../../utils/teacherKana";
import { KanaStatusBanner } from "./staff/KanaStatusBanner";
import { StaffListTab } from "./staff/StaffListTab";
import { FulltimeTab } from "./staff/FulltimeTab";
import { SubjectsMasterTab } from "./staff/SubjectsMasterTab";

// 講師管理ビュー (旧「バイト管理」)。タブは constants/staffTabs の STAFF_TABS:
//   - バイト一覧: 登録・削除・担当教科の割り当て (カテゴリ別チェックボックス)
//   - 講師の所属: 現役部 常勤 / 現役部 非常勤 / 予備校部 (年度ごと。AffiliationView)
//   - 担当教科・よみ: スロットに登場するがバイトに無い講師の担当教科・よみ
//   - 教科マスター: カテゴリと教科の CRUD (インライン編集)
// タブは App が持つ (サイドバー・メインメニュー・Cmd+K から直接開けるように)。
// tab を渡さなければ画面の中で持つ (単体テスト用)。
export function StaffManagerView({
  partTimeStaff,
  teacherSubjects = {},
  teacherKana = {},
  subjectCategories,
  subjects,
  slots,
  timetables,
  activeTimetableId,
  subs,
  holidays,
  examPeriods,
  displayCutoff,
  daySchedules,
  adjustments = [],
  onAddStaff,
  onDelStaff,
  onToggleStaffSubject,
  onSetStaffKana,
  onImportKana,
  onSaveCategory,
  onDelCategory,
  onSaveSubject,
  onDelSubject,
  isAdmin,
  // 講師の所属 (utils/teacherAffiliations)
  affiliations = [],
  onSaveAffiliations,
  // 有給・半休の画面を開く (管理者だけが読める画面なので、読める人にだけ渡す)
  onOpenLeave,
  tab: tabProp,
  onTabChange,
}) {
  const [tabState, setTabState] = useState(STAFF_TAB.STAFF);
  const tab = normalizeStaffTab(tabProp ?? tabState);
  const setTab = (k) => {
    setTabState(k);
    onTabChange?.(k);
  };
  const today = useToday();
  const thisYear = fiscalYearOf(today);
  const affIndex = useMemo(() => indexAffiliationChanges(affiliations), [affiliations]);
  const [newStaff, setNewStaff] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#888");
  const [newSubjByCat, setNewSubjByCat] = useState({});

  // 出勤状況の対象月。既定は今月だが、月初に前月ぶんを確かめる用途があるので
  // 月セレクタで変えられる (月次集計タブと同じ type="month")
  const [staffMonth, setStaffMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [nowYear, nowMonth] = useMemo(() => {
    const [y, m] = staffMonth.split("-").map(Number);
    return [y, m];
  }, [staffMonth]);

  const subjectsByCat = useMemo(() => {
    const m = new Map();
    for (const c of subjectCategories) m.set(c.id, []);
    for (const s of subjects) {
      if (!m.has(s.categoryId)) m.set(s.categoryId, []);
      m.get(s.categoryId).push(s);
    }
    return m;
  }, [subjects, subjectCategories]);

  const sortedPartTimeStaff = useMemo(
    () => sortByTeacherKana(partTimeStaff, teacherKana),
    [partTimeStaff, teacherKana]
  );

  const allTeachers = useMemo(() => {
    const set = new Set(partTimeStaff.map((s) => s.name));
    slots.forEach((s) => {
      splitTeacherField(s.teacher).forEach((n) => set.add(n));
    });
    return sortTeacherNames([...set], teacherKana);
  }, [slots, partTimeStaff, teacherKana]);

  // 常勤講師 = スロットに出現するがバイト一覧にない講師
  const staffNameSet = useMemo(
    () => new Set(partTimeStaff.map((s) => s.name)),
    [partTimeStaff]
  );
  const fulltimeTeachers = useMemo(() => {
    const set = new Set();
    slots.forEach((s) => {
      splitTeacherField(s.teacher).forEach((n) => {
        if (!staffNameSet.has(n)) set.add(n);
      });
    });
    return sortTeacherNames([...set], teacherKana);
  }, [slots, staffNameSet, teacherKana]);

  // よみ未設定の講師。よみは名前を五十音順に並べる唯一の手掛かりなので、
  // 「誰が未設定なのか」を画面で見せて埋めてもらう (勝手に別の順序を
  // 捏造せず、未設定は末尾のまま置く方針の裏返し)。
  const missingStaffKana = useMemo(
    () => missingKanaNames(partTimeStaff.map((s) => s.name), teacherKana),
    [partTimeStaff, teacherKana]
  );
  const missingFulltimeKana = useMemo(
    () => missingKanaNames(fulltimeTeachers, teacherKana),
    [fulltimeTeachers, teacherKana]
  );

  const handleAddStaff = () => {
    if (onAddStaff(newStaff)) setNewStaff("");
  };

  const handleAddCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    onSaveCategory({ name, color: newCatColor });
    setNewCatName("");
    setNewCatColor("#888");
  };

  const handleAddSubject = (categoryId) => {
    const name = (newSubjByCat[categoryId] || "").trim();
    if (!name) return;
    onSaveSubject({ name, categoryId });
    setNewSubjByCat((p) => ({ ...p, [categoryId]: "" }));
  };

  const tabCount = {
    [STAFF_TAB.STAFF]: partTimeStaff.length,
    [STAFF_TAB.TEACHERS]: fulltimeTeachers.length,
    [STAFF_TAB.SUBJECTS]: subjects.length,
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div
        role="tablist"
        aria-label="講師管理のタブ"
        className="no-print"
        style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}
      >
        {STAFF_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            style={S.btn(tab === t.key)}
          >
            {t.icon} {t.label}
            {tabCount[t.key] != null && (
              <span style={{ marginLeft: 5, opacity: 0.7 }}>{tabCount[t.key]}</span>
            )}
          </button>
        ))}
      </div>

      {(tab === STAFF_TAB.STAFF || tab === STAFF_TAB.TEACHERS) && (
        <KanaStatusBanner
          missing={tab === STAFF_TAB.STAFF ? missingStaffKana : missingFulltimeKana}
          total={tab === STAFF_TAB.STAFF ? partTimeStaff.length : fulltimeTeachers.length}
          onImportKana={onImportKana}
          isAdmin={isAdmin}
        />
      )}

      {tab === STAFF_TAB.AFFILIATION && (
        <AffiliationView
          affiliations={affiliations}
          onSave={onSaveAffiliations}
          slots={slots}
          timetables={timetables}
          partTimeStaff={partTimeStaff}
          teacherKana={teacherKana}
          isAdmin={isAdmin}
          onOpenLeave={onOpenLeave}
        />
      )}

      {tab === STAFF_TAB.STAFF && (
        <StaffListTab
          partTimeStaff={partTimeStaff}
          sortedPartTimeStaff={sortedPartTimeStaff}
          allTeachers={allTeachers}
          subjectCategories={subjectCategories}
          subjectsByCat={subjectsByCat}
          slots={slots}
          timetables={timetables}
          activeTimetableId={activeTimetableId}
          subs={subs}
          holidays={holidays}
          examPeriods={examPeriods}
          displayCutoff={displayCutoff}
          daySchedules={daySchedules}
          adjustments={adjustments}
          nowYear={nowYear}
          nowMonth={nowMonth}
          staffMonth={staffMonth}
          setStaffMonth={setStaffMonth}
          newStaff={newStaff}
          setNewStaff={setNewStaff}
          handleAddStaff={handleAddStaff}
          onDelStaff={onDelStaff}
          onToggleStaffSubject={onToggleStaffSubject}
          teacherKana={teacherKana}
          onSetStaffKana={onSetStaffKana}
          isAdmin={isAdmin}
        />
      )}

      {tab === STAFF_TAB.TEACHERS && (
        <FulltimeTab
          fulltimeTeachers={fulltimeTeachers}
          affiliationIndex={affIndex}
          affiliationYear={thisYear}
          partTimeNames={staffNameSet}
          onShowAffiliation={() => setTab(STAFF_TAB.AFFILIATION)}
          slots={slots}
          teacherSubjects={teacherSubjects}
          subjectCategories={subjectCategories}
          subjectsByCat={subjectsByCat}
          onToggleStaffSubject={onToggleStaffSubject}
          teacherKana={teacherKana}
          onSetStaffKana={onSetStaffKana}
          isAdmin={isAdmin}
        />
      )}

      {tab === STAFF_TAB.SUBJECTS && (
        <SubjectsMasterTab
          subjectCategories={subjectCategories}
          subjectsByCat={subjectsByCat}
          newCatName={newCatName}
          setNewCatName={setNewCatName}
          newCatColor={newCatColor}
          setNewCatColor={setNewCatColor}
          handleAddCategory={handleAddCategory}
          newSubjByCat={newSubjByCat}
          setNewSubjByCat={setNewSubjByCat}
          handleAddSubject={handleAddSubject}
          onSaveCategory={onSaveCategory}
          onDelCategory={onDelCategory}
          onSaveSubject={onSaveSubject}
          onDelSubject={onDelSubject}
        />
      )}
    </div>
  );
}
