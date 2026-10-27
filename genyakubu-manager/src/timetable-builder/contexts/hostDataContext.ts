import { createContext, useContext } from 'react';

// 本体アプリ (App.jsx) から講習時間割作成へ渡す読み取り専用のデータ。
// 講習側は本体のデータに書き込まない (正は本体)。いまは「他校舎の授業」の
// 取り込み (講師不在・NG の画面)、出勤可能調査の「バイトのみ」の絞り込み、
// 退職した講師の扱いに使う。本体の外で単体で描くとき (テストなど) は空のまま。
export interface HostData {
  /** 本体の他校舎の授業 (utils/offsiteLessons の OffsiteLesson[]) */
  offsiteLessons: unknown[];
  /** 本体の休講日 (全体休講日は他校舎も休み) */
  holidays: unknown[];
  /** 本体のバイト管理の名前 (出勤可能調査の「バイトのみ」) */
  partTimeStaffNames: string[];
  /**
   * 本体の講師の所属で「退職・非表示」の講師 (今年度)。出勤可能調査に出さない・
   * 講師マスタで外すよう知らせる・季節や時間割を写すときに入れない
   */
  retiredTeacherNames: string[];
}

const EMPTY: HostData = { offsiteLessons: [], holidays: [], partTimeStaffNames: [], retiredTeacherNames: [] };

export const HostDataContext = createContext<HostData>(EMPTY);

export function useHostData(): HostData {
  return useContext(HostDataContext);
}
