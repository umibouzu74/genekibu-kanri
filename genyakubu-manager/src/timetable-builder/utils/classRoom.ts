// クラスの教室 (2026-10-27)。教室はクラス名とは別に持つ (ClassEntity.room)。
// 年ごとに教室が変わっても、クラス名 (合同・担当不可/優先クラスが名前で指す) を
// 変えずに済むように。表示の形はここにそろえる。

import type { ClassEntity } from '../types';

/** クラスの教室 (前後の空白を除く。無ければ '') */
export function classRoomOf(cls: Partial<ClassEntity> | null | undefined): string {
  return typeof cls?.room === 'string' ? cls.room.trim() : '';
}

/** 「3S (401)」。教室が無ければクラス名だけ */
export function classLabelWithRoom(cls: Partial<ClassEntity> | null | undefined): string {
  const label = cls?.label ?? '';
  const room = classRoomOf(cls);
  return room ? `${label} (${room})` : label;
}
