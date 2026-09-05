import { useMemo } from "react";
import { biweeklyPartner, splitTeacherField } from "../../utils/biweekly";
import { sortTeacherNamesByKana, sortTeachersByKana } from "../teacherOrder";

// ─── 入力候補・フィルタ候補 (RegularBuilderApp から 2026-09-05 に切り出し)。
// 講師はマスタだけでなくセルに現れる名前と隔週パートナーも含め、教室は
// マスタ + クラス既定 + セル上書きを含める (取込直後やマスタ未整備でも
// 👁 強調・週間ミニビューの対象にできるように)。並びは講師がよみ順、
// 教室が文字列順。
export function useProjectOptions(project) {
  // 講師マスタのアイウエオ順 (よみ)。入力候補の datalist 用
  const sortedTeachers = useMemo(
    () => sortTeachersByKana(project.teachers),
    [project.teachers]
  );

  // 講師フィルタ候補 (マスタ + セルに現れる講師名 + 隔週パートナー)。
  // マスタ未整備の取込直後や、note にしか現れないパートナー講師も
  // 👁 強調表示・週間ミニビューの対象にできるようにする
  const teacherOptions = useMemo(() => {
    const names = new Set(project.teachers.map((t) => t.name));
    for (const t of project.tabs || []) {
      for (const cell of Object.values(t.schedule || {})) {
        for (const n of splitTeacherField(cell.teacher)) names.add(n);
        const partner = biweeklyPartner(cell.note);
        if (partner) names.add(partner);
      }
    }
    // 並びはセルのプルダウンと同じアイウエオ順 (よみのある講師が先)
    return sortTeacherNamesByKana([...names], project.teachers);
  }, [project.teachers, project.tabs]);

  // 教室フィルタ候補 (教室マスタ + クラス既定教室 + セル上書き教室)。
  // マスタを含めることで、まだ使っていない教室も入力候補・👁 の対象になる
  const roomOptions = useMemo(() => {
    const rooms = new Set(project.rooms || []);
    for (const t of project.tabs || []) {
      for (const c of t.classes || []) {
        if ((c.room || "").trim()) rooms.add(c.room.trim());
        for (const r of Object.values(c.roomByDay || {})) {
          if ((r || "").trim()) rooms.add(r.trim());
        }
      }
      for (const cell of Object.values(t.schedule || {})) {
        if ((cell.room || "").trim()) rooms.add(cell.room.trim());
      }
    }
    return [...rooms].sort();
  }, [project.rooms, project.tabs]);

  return { sortedTeachers, teacherOptions, roomOptions };
}
