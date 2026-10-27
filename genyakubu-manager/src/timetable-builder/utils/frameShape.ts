// 季節の中の「枠」(Project.frames、2026-10-27) の形の確認。無依存 (publishState の
// 判定だけ) なので scheduleKey.migrateProject から使える。決まりの本体は utils/frames。
//
// 守る形:
// - frames は { id (正の整数・重複なし), name (空なら「枠N」), periodIds (プールにある時限・
//   重複なし), publishState? } の配列。空になったらキーごと持たない
// - タブの frameId は在る枠だけ (無い枠を指していたら外す)
// - 枠に入ったタブの activePeriodIds は配列で、枠の時限の部分集合 (全時限 = null は
//   「プールの全部」の意味になって、ほかの枠の時限まで出てしまうため)

import { isPublishState } from './publishState';

const isPositiveInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

/** 保存値・外部 JSON の frames とタブの frameId をそろえる。変わらなければ同じ参照を返す */
export function normalizeProjectFrames(project: any): any {
  if (!project || typeof project !== 'object') return project;
  const hasFramesKey = 'frames' in project;
  const tabs: any[] = Array.isArray(project.tabs) ? project.tabs : [];
  const anyTabFrame = tabs.some(t => t?.config && 'frameId' in t.config);
  if (!hasFramesKey && !anyTabFrame) return project;

  const periodIds = new Set<number>((Array.isArray(project.periods) ? project.periods : []).map((p: any) => p?.id));
  let changed = false;
  const seenIds = new Set<number>();
  const seenNames = new Set<string>();
  const frames: any[] = [];
  for (const raw of Array.isArray(project.frames) ? project.frames : []) {
    if (!raw || typeof raw !== 'object' || !isPositiveInt(raw.id) || seenIds.has(raw.id)) {
      changed = true;
      continue;
    }
    seenIds.add(raw.id);
    let name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name || seenNames.has(name)) {
      let n = raw.id;
      let candidate = name ? `${name} (${n})` : `枠${n}`;
      while (seenNames.has(candidate)) candidate = `${name || '枠'}${++n}`;
      name = candidate;
    }
    seenNames.add(name);
    const ids: number[] = [];
    for (const id of Array.isArray(raw.periodIds) ? raw.periodIds : []) {
      if (periodIds.has(id) && !ids.includes(id)) ids.push(id);
    }
    const next: any = { id: raw.id, name, periodIds: ids };
    if (isPublishState(raw.publishState)) next.publishState = raw.publishState;
    const same = name === raw.name
      && ids.length === (raw.periodIds || []).length && ids.every((id, i) => raw.periodIds[i] === id)
      && (next.publishState ?? null) === (raw.publishState ?? null)
      && Object.keys(raw).every(k => k in next);
    if (!same) changed = true;
    frames.push(same ? raw : next);
  }
  if (hasFramesKey && (!Array.isArray(project.frames) || frames.length === 0)) changed = true;

  const frameById = new Map(frames.map(f => [f.id, f]));
  let tabsChanged = false;
  const nextTabs = tabs.map(tab => {
    const cfg = tab?.config;
    if (!cfg || !('frameId' in cfg)) return tab;
    const frame = frameById.get(cfg.frameId);
    if (!frame) {
      tabsChanged = true;
      const { frameId: _drop, ...rest } = cfg;
      return { ...tab, config: rest };
    }
    const allowed = new Set<number>(frame.periodIds);
    const current: number[] | null | undefined = cfg.activePeriodIds;
    let active: number[];
    if (!Array.isArray(current)) {
      active = [...frame.periodIds];
    } else {
      active = current.filter(id => allowed.has(id));
      // 枠の時限が 1 つも残らないのは形の崩れ (旧版での編集など)。枠の全時限に戻す
      if (active.length === 0 && current.length > 0) active = [...frame.periodIds];
    }
    if (Array.isArray(current) && active.length === current.length && active.every((id, i) => current[i] === id)) return tab;
    tabsChanged = true;
    return { ...tab, config: { ...cfg, activePeriodIds: active } };
  });

  if (!changed && !tabsChanged) return project;
  const out = { ...project, tabs: tabsChanged ? nextTabs : project.tabs };
  if (frames.length > 0) out.frames = frames;
  else delete out.frames;
  return out;
}
