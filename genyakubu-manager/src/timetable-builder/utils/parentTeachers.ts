// L5a: 親アプリ (原学部管理) の講師マスタを builder へ取り込むための読取。
//
// 親は partTimeStaff ({ name, subjectIds }) と subjects ({ id, name, ... }) を
// useSyncedStorage (localStorage + Firebase) で持つ。builder は別 React
// ツリーだが同一 origin の localStorage を共有しているので、ユーザ発火の
// 取り込みボタンからここを読む (キーは親の single source of truth である
// constants/storageKeys から import し、暗黙の文字列重複を作らない)。
//
// 返り値は builder の teacher/import (append) にそのまま渡せる
// { name, subjects: string[] }[]。壊れたデータは空配列 (取り込み無し)。
import { LS } from '../../constants/storageKeys';
import { migratePartTimeStaff } from '../../utils/migrate';

export interface ParentTeacher {
  name: string;
  subjects: string[];
}

export function readParentTeachers(): ParentTeacher[] {
  try {
    const staffRaw = localStorage.getItem(LS.partTime);
    if (!staffRaw) return [];
    const staff = migratePartTimeStaff(JSON.parse(staffRaw));
    if (!Array.isArray(staff)) return [];

    // subjectIds → 科目名の解決。subjects 側が壊れていても名前解決だけ
    // 諦めて講師名は取り込めるようにする。
    let nameById = new Map<unknown, string>();
    try {
      const subjectsRaw = localStorage.getItem(LS.subjects);
      const subjects = subjectsRaw ? JSON.parse(subjectsRaw) : [];
      if (Array.isArray(subjects)) {
        nameById = new Map(
          subjects
            .filter((s) => s && s.id != null && typeof s.name === 'string')
            .map((s) => [s.id, s.name]),
        );
      }
    } catch {
      // subjects だけ壊れているケース: 科目なしで取り込む
    }

    return staff
      .filter((p) => p && typeof p.name === 'string' && p.name.trim() !== '')
      .map((p) => ({
        name: p.name.trim(),
        subjects: (Array.isArray(p.subjectIds) ? p.subjectIds : [])
          .map((id) => nameById.get(id))
          .filter((n): n is string => Boolean(n)),
      }));
  } catch {
    return [];
  }
}
