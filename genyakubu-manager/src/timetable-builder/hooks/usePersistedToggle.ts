import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

// 表示トグル (コンパクト表示・集計パネル等) の 1 bit 永続化 (N2h)。
// リロードのたびに 📏 を押し直す手間をなくす。**明示トグルの保存**であり、
// 利用統計から UI を自動変形する類 (A18 で却下) とは別物。
// localStorage が使えない環境 (private mode 等) では素の useState として振る舞う。
export function usePersistedToggle(
  storageKey: string,
  initial: boolean,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === '1') return true;
      if (raw === '0') return false;
    } catch {
      // 読めなければ初期値のまま
    }
    return initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, value ? '1' : '0');
    } catch {
      // 保存できなくても表示トグル自体は機能する
    }
  }, [storageKey, value]);

  return [value, setValue];
}
