// クラスの教室 (2026-10-27)。教室はクラス名とは別に持つ (ClassEntity.room)。
// 年ごとに教室が変わっても、クラス名 (合同・担当不可/優先クラスが名前で指す) を
// 変えずに済むように。表示の形はここにそろえる。

import type { ClassEntity } from '../types';

const ownRoom = (cls: Partial<ClassEntity> | null | undefined): string =>
  typeof cls?.room === 'string' ? cls.room.trim() : '';

/**
 * クラスの教室 (前後の空白を除く。無ければ '')。丸ごと合同 (mergedWith、B4) の
 * クラスは従うクラスの教室も「403/404」と並べる
 */
export function classRoomOf(cls: Partial<ClassEntity> | null | undefined): string {
  const own = ownRoom(cls);
  if (!cls?.mergedWith?.length) return own;
  const rooms = [own, ...cls.mergedWith.map(ownRoom)];
  return rooms.some(Boolean) ? rooms.map(r => r || '?').join('/') : '';
}

/** 「3S」。丸ごと合同のクラスは「3A403・3A404」 */
export function classDisplayLabel(cls: Partial<ClassEntity> | null | undefined): string {
  const label = cls?.label ?? '';
  return cls?.mergedWith?.length ? [label, ...cls.mergedWith.map(c => c.label)].join('・') : label;
}

/** 「3S (401)」。教室が無ければクラス名だけ。丸ごと合同は「3A403・3A404 (403/404)」 */
export function classLabelWithRoom(cls: Partial<ClassEntity> | null | undefined): string {
  const label = classDisplayLabel(cls);
  const room = classRoomOf(cls);
  return room ? `${label} (${room})` : label;
}
