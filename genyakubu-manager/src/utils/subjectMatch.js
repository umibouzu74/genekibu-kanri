// コマの科目文字列から対応する Subject.id を推定する。
// 完全一致 → 名前を含む → 別名を含む の順で判定し、最初のマッチを返す。
export function pickSubjectId(subjStr, subjects) {
  if (!subjStr) return null;
  const exact = subjects.find((s) => s.name === subjStr);
  if (exact) return exact.id;
  const byName = subjects.find((s) => subjStr.includes(s.name));
  if (byName) return byName.id;
  const byAlias = subjects.find(
    (s) =>
      Array.isArray(s.aliases) &&
      s.aliases.some((a) => a && subjStr.includes(a))
  );
  return byAlias ? byAlias.id : null;
}

// 常勤講師の担当教科を、既存スロットの subj から推定する。
// 返り値: Subject.id の配列 (重複なし)
export function getTeacherSubjectIds(teacherName, slots, subjects) {
  const ids = new Set();
  for (const slot of slots) {
    if (!slot.teacher) continue;
    const teachers = slot.teacher.includes("·")
      ? slot.teacher.split("·")
      : [slot.teacher];
    if (!teachers.includes(teacherName)) continue;
    const sid = pickSubjectId(slot.subj, subjects);
    if (sid != null) ids.add(sid);
  }
  return [...ids];
}
