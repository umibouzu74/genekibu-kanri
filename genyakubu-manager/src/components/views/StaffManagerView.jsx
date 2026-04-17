import { useMemo, useState } from "react";
import { S } from "../../styles/common";
import { compareJa, sortJa } from "../../utils/sortJa";
import { StaffListTab } from "./staff/StaffListTab";
import { FulltimeTab } from "./staff/FulltimeTab";
import { SubjectsMasterTab } from "./staff/SubjectsMasterTab";

// バイト管理ビュー。3 タブ構成：
//   - バイト一覧: 登録・削除・担当教科の割り当て (カテゴリ別チェックボックス)
//   - 常勤講師: スロットに登場するがバイトに無い講師の担当教科を設定
//   - 教科マスター: カテゴリと教科の CRUD (インライン編集)
export function StaffManagerView({
  partTimeStaff,
  teacherSubjects = {},
  subjectCategories,
  subjects,
  slots,
  subs,
  holidays,
  examPeriods,
  onAddStaff,
  onDelStaff,
  onToggleStaffSubject,
  onSaveCategory,
  onDelCategory,
  onSaveSubject,
  onDelSubject,
  isAdmin,
}) {
  const [tab, setTab] = useState("staff");
  const [newStaff, setNewStaff] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#888");
  const [newSubjByCat, setNewSubjByCat] = useState({});

  const [nowYear, nowMonth] = useMemo(() => {
    const d = new Date();
    return [d.getFullYear(), d.getMonth() + 1];
  }, []);

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
    () => [...partTimeStaff].sort((a, b) => compareJa(a.name, b.name)),
    [partTimeStaff]
  );

  const allTeachers = useMemo(() => {
    const set = new Set(partTimeStaff.map((s) => s.name));
    slots.forEach((s) => {
      if (!s.teacher) return;
      const names = s.teacher.includes("·") ? s.teacher.split("·") : [s.teacher];
      names.forEach((n) => set.add(n));
    });
    return sortJa([...set]);
  }, [slots, partTimeStaff]);

  // 常勤講師 = スロットに出現するがバイト一覧にない講師
  const staffNameSet = useMemo(
    () => new Set(partTimeStaff.map((s) => s.name)),
    [partTimeStaff]
  );
  const fulltimeTeachers = useMemo(() => {
    const set = new Set();
    slots.forEach((s) => {
      if (!s.teacher) return;
      const names = s.teacher.includes("·") ? s.teacher.split("·") : [s.teacher];
      names.forEach((n) => {
        if (!staffNameSet.has(n)) set.add(n);
      });
    });
    return sortJa([...set]);
  }, [slots, staffNameSet]);

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

  const TabBtn = ({ k, label, count }) => (
    <button onClick={() => setTab(k)} style={S.btn(tab === k)}>
      {label}
      {count != null && <span style={{ marginLeft: 5, opacity: 0.7 }}>{count}</span>}
    </button>
  );

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <TabBtn k="staff" label="バイト一覧" count={partTimeStaff.length} />
        <TabBtn k="fulltime" label="常勤講師" count={fulltimeTeachers.length} />
        <TabBtn k="subjects" label="教科マスター" count={subjects.length} />
      </div>

      {tab === "staff" && (
        <StaffListTab
          partTimeStaff={partTimeStaff}
          sortedPartTimeStaff={sortedPartTimeStaff}
          allTeachers={allTeachers}
          subjectCategories={subjectCategories}
          subjectsByCat={subjectsByCat}
          slots={slots}
          subs={subs}
          holidays={holidays}
          examPeriods={examPeriods}
          nowYear={nowYear}
          nowMonth={nowMonth}
          newStaff={newStaff}
          setNewStaff={setNewStaff}
          handleAddStaff={handleAddStaff}
          onDelStaff={onDelStaff}
          onToggleStaffSubject={onToggleStaffSubject}
          isAdmin={isAdmin}
        />
      )}

      {tab === "fulltime" && (
        <FulltimeTab
          fulltimeTeachers={fulltimeTeachers}
          slots={slots}
          teacherSubjects={teacherSubjects}
          subjectCategories={subjectCategories}
          subjectsByCat={subjectsByCat}
          onToggleStaffSubject={onToggleStaffSubject}
          isAdmin={isAdmin}
        />
      )}

      {tab === "subjects" && (
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
