// 該当セルへのスクロール (Toolbar の違反 popover 起源、N2g で共有化)。
//
// ScheduleCell は科目 select に `select-<dateId>-<periodId>-<classId>-cell`
// の id を振っている。schedule key からその要素を探して画面中央へスクロール
// する。違反 popover の「→」とスナップショット差分の「→」が同じ挙動を共有する。
import { parseKey } from './scheduleKey';

export function scrollToCellByKey(key: string | null | undefined): boolean {
  if (!key) return false;
  const parsed = parseKey(key);
  if (!parsed) return false;
  const el = document.getElementById(`select-${parsed.dateId}-${parsed.periodId}-${parsed.classId}-cell`);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return true;
}

// タブを切り替えた直後など、セルがまだ描かれていないときのスクロール。
// 描かれるまで少し待って試す (数回で諦める)。
export function scrollToCellWhenReady(key: string | null | undefined, tries = 10, delayMs = 50): void {
  if (!key) return;
  if (scrollToCellByKey(key) || tries <= 0) return;
  setTimeout(() => scrollToCellWhenReady(key, tries - 1, delayMs), delayMs);
}
