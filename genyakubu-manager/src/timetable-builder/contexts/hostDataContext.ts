import { createContext, useContext } from 'react';

// 本体アプリ (App.jsx) から講習時間割作成へ渡す読み取り専用のデータ。
// 講習側は本体のデータに書き込まない (正は本体)。いまは「他校舎の授業」の
// 取り込み (講師不在・NG の画面) にだけ使う。本体の外で単体で描くとき
// (テストなど) は空のまま。
export interface HostData {
  /** 本体の他校舎の授業 (utils/offsiteLessons の OffsiteLesson[]) */
  offsiteLessons: unknown[];
  /** 本体の休講日 (全体休講日は他校舎も休み) */
  holidays: unknown[];
}

const EMPTY: HostData = { offsiteLessons: [], holidays: [] };

export const HostDataContext = createContext<HostData>(EMPTY);

export function useHostData(): HostData {
  return useContext(HostDataContext);
}
