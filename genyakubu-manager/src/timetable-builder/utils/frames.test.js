// 季節の中の「枠」(2026-10-27)
import { describe, expect, it } from 'vitest';
import { migrateProject, effectiveConfigForTab } from './scheduleKey';
import { projectReducer } from '../hooks/projectReducer';
import {
  displayNameForTabs,
  frameIdForDate,
  frameRangeLabel,
  projectForFrame,
  publishStateForSessionDate,
  summarizePublishState,
} from './frames';
import { publishStateForTab } from './publishState';
import { buildFreshSeasonProject } from './seasonStart';
import { buildTemplatePayload } from './templates';
import { buildScheduleWorkbook, buildTeacherWorkbook } from './excelExport';
import { buildKoshuLessons } from '../../utils/builderLessons';

const cfg = (over = {}) => ({ classes: [{ id: 1, label: '3S' }], subjectCounts: { 数学: 9 }, ...over });
// 冬期講習 (中３: 12/25・26 昼) / 直前 (中３直前 火木: 1/12・14 夜) / 弱点 (土曜 1/9 朝)
const base = (over = {}) => ({
  version: 4,
  name: '2026 冬期講習　中123',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
  teachers: [{ name: '半田', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] }],
  activeTabId: 1,
  dates: [
    { id: 1, label: '12/25(金)' },
    { id: 2, label: '12/26(土)' },
    { id: 3, label: '1/9(土)' },
    { id: 4, label: '1/12(火)' },
    { id: 5, label: '1/14(木)' },
    { id: 6, label: '12/24(木)', externalOnly: true },
  ],
  periods: [
    { id: 1, label: '1限 (13:00~14:20)' },
    { id: 2, label: '2限 (14:30~15:50)' },
    { id: 3, label: '1限 (18:00~19:20)' },
    { id: 4, label: '1限 (9:00~10:20)' },
  ],
  tabs: [
    { id: 1, name: '中３', config: cfg({ activeDateIds: [1, 2], activePeriodIds: [1, 2] }), schedule: { 'd1-p1-c1': { subject: '数学', teacher: '半田' } } },
    { id: 2, name: '中３直前 火木', config: cfg({ activeDateIds: [4, 5], activePeriodIds: [3] }), schedule: { 'd4-p3-c1': { subject: '数学', teacher: '半田' } } },
    { id: 3, name: '中３弱点補強', config: cfg({ activeDateIds: [3], activePeriodIds: [4] }), schedule: { 'd3-p4-c1': { subject: '数学', teacher: '半田' } } },
  ],
  subjects: ['数学'],
  subjectColors: {},
  combinedGroups: [],
  externalCounts: {},
  externalSessions: [],
  externalSessionPresets: [],
  snapshots: [],
  ...over,
});
const reduce = (project, action) => projectReducer({ project, history: [project], historyIndex: 0, loadError: null }, action).project;
const withFrames = (project = base()) => {
  let p = reduce(project, { type: 'frame/add', payload: { name: '冬期講習', tabIds: [1] } });
  p = reduce(p, { type: 'frame/add', payload: { name: '直前ポイント演習', tabIds: [2] } });
  p = reduce(p, { type: 'frame/add', payload: { name: '弱点補強演習', tabIds: [3] } });
  return p;
};

describe('枠を作る・直す (reducer)', () => {
  it('作る: タブを入れ、枠の時限はそのタブの今の時限。状態は入れるタブの状態から', () => {
    const p = withFrames(base({ publishState: 'draft' }));
    expect(p.frames).toEqual([
      { id: 1, name: '冬期講習', periodIds: [1, 2], publishState: 'draft' },
      { id: 2, name: '直前ポイント演習', periodIds: [3], publishState: 'draft' },
      { id: 3, name: '弱点補強演習', periodIds: [4], publishState: 'draft' },
    ]);
    expect(p.tabs.map(t => [t.config.frameId, t.config.activePeriodIds])).toEqual([[1, [1, 2]], [2, [3]], [3, [4]]]);
    // 同じ名前は作らない
    expect(reduce(p, { type: 'frame/add', payload: { name: '冬期講習' } })).toBe(p);
  });

  it('タブを枠に入れる: 今の時限のうち枠にあるもの (無ければ枠の全時限)。外すと今の時限のまま', () => {
    let p = withFrames();
    p = reduce(p, { type: 'tab/add', payload: { name: '中３直前 水金' } }); // 開いているタブ (中３) を写す → 冬期講習
    const added = p.tabs.find(t => t.name === '中３直前 水金');
    expect(added.config.frameId).toBe(1);
    p = reduce(p, { type: 'frame/setTab', payload: { tabId: added.id, frameId: 2 } });
    expect(p.tabs.find(t => t.id === added.id).config).toMatchObject({ frameId: 2, activePeriodIds: [3] });
    p = reduce(p, { type: 'frame/setTab', payload: { tabId: added.id, frameId: null } });
    const out = p.tabs.find(t => t.id === added.id).config;
    expect('frameId' in out).toBe(false);
    expect(out.activePeriodIds).toEqual([3]);
  });

  it('枠の時限を直す: 同じ名前は同じ時限、無い名前は足してタブにも足す。外した時限はどこも使わなければ消す (NG も)', () => {
    let p = withFrames();
    p = { ...p, teachers: [{ ...p.teachers[0], ngSlots: ['1/9(土)-1限 (9:00~10:20)', '12/25(金)-1限 (13:00~14:20)'] }] };
    p = reduce(p, { type: 'frame/setPeriods', payload: { id: 3, value: '1限 (9:30~10:50), 2限 (11:00~12:20)' } });
    const weak = p.frames.find(f => f.id === 3);
    expect(p.periods.filter(x => weak.periodIds.includes(x.id)).map(x => x.label)).toEqual(['1限 (9:30~10:50)', '2限 (11:00~12:20)']);
    // 9:00 の 1限はどこも使わないので消え、その NG も消える
    expect(p.periods.some(x => x.label === '1限 (9:00~10:20)')).toBe(false);
    expect(p.teachers[0].ngSlots).toEqual(['12/25(金)-1限 (13:00~14:20)']);
    expect(p.tabs.find(t => t.id === 3).config.activePeriodIds).toEqual(weak.periodIds);
    // ほかの枠の時限の名前を書いたら同じ時限 (枠をまたいで共有)。外しても冬期講習が使うので消えない
    p = reduce(p, { type: 'frame/setPeriods', payload: { id: 3, value: '1限 (13:00~14:20)' } });
    expect(p.frames.find(f => f.id === 3).periodIds).toEqual([1]);
    p = reduce(p, { type: 'frame/setPeriods', payload: { id: 3, value: '3限 (16:00~17:20)' } });
    expect(p.periods.some(x => x.id === 1)).toBe(true);
  });

  it('枠に入ったタブの時限の操作は枠の中だけ (全選択 = 枠の全時限・枠に無い時限は選ばない)', () => {
    let p = withFrames();
    p = reduce(p, { type: 'tabPeriods/setAllActive', payload: { tabId: 1, active: true } });
    expect(p.tabs[0].config.activePeriodIds).toEqual([1, 2]);
    expect(reduce(p, { type: 'tabPeriods/toggle', payload: { tabId: 1, periodId: 3 } })).toBe(p);
  });

  it('使う日・時限の「他へ写す」は同じ枠のタブだけ', () => {
    let p = withFrames();
    p = reduce(p, { type: 'tab/add', payload: { name: '中１・２' } }); // 冬期講習
    p = { ...p, tabs: p.tabs.map(t => (t.name === '中１・２' ? { ...t, config: { ...t.config, activeDateIds: [2] } } : t)) };
    const next = reduce(p, { type: 'tabDates/copyActiveToOthers', payload: { sourceTabId: 1 } });
    expect(next.tabs.find(t => t.name === '中１・２').config.activeDateIds).toEqual([1, 2]);
    expect(next.tabs.find(t => t.id === 2).config.activeDateIds).toEqual([4, 5]);
  });

  it('枠を消す: タブは枠なしに戻り、時限・コマは残る。最後の枠を消すと frames を持たない', () => {
    let p = withFrames();
    p = reduce(p, { type: 'frame/remove', payload: { id: 2 } });
    expect('frameId' in p.tabs[1].config).toBe(false);
    expect(p.tabs[1].schedule['d4-p3-c1']).toBeTruthy();
    p = reduce(reduce(p, { type: 'frame/remove', payload: { id: 1 } }), { type: 'frame/remove', payload: { id: 3 } });
    expect('frames' in p).toBe(false);
  });

  it('時限プールの編集で消えた時限は枠の時限からも外れる', () => {
    let p = withFrames();
    p = reduce(p, { type: 'config/setList', payload: { key: 'periods', value: '1限 (13:00~14:20), 1限 (18:00~19:20), 1限 (9:00~10:20)' } });
    expect(p.frames.find(f => f.id === 1).periodIds).toEqual([1]);
  });

  it('枠ごとの状態。名前の変更は重ならない名前だけ', () => {
    let p = withFrames(base({ publishState: 'final' }));
    p = reduce(p, { type: 'frame/setPublishState', payload: { id: 2, state: 'draft' } });
    expect(publishStateForTab(p, p.tabs[1])).toBe('draft');
    expect(publishStateForTab(p, p.tabs[0])).toBe('final');
    expect(summarizePublishState(p)).toBe(null);
    expect(reduce(p, { type: 'frame/rename', payload: { id: 2, name: '冬期講習' } })).toBe(p);
    expect(reduce(p, { type: 'frame/rename', payload: { id: 2, name: '直前' } }).frames[1].name).toBe('直前');
  });
});

describe('枠の形の確認 (読込)', () => {
  it('形の崩れた枠・無い時限・無い枠を指すタブを直し、枠のタブの使う時限を枠の中に収める', () => {
    const migrated = migrateProject(base({
      frames: [
        { id: 1, name: ' 冬期講習 ', periodIds: [1, 2, 99, 1], publishState: 'weird' },
        { id: 1, name: '重複' },
        'x',
        { id: 2, name: '', periodIds: [3] },
      ],
      tabs: [
        { ...base().tabs[0], config: cfg({ frameId: 1, activePeriodIds: null }) },
        { ...base().tabs[1], config: cfg({ frameId: 2, activePeriodIds: [1, 3] }) },
        { ...base().tabs[2], config: cfg({ frameId: 9, activePeriodIds: [4] }) },
      ],
    }));
    expect(migrated.frames).toEqual([
      { id: 1, name: '冬期講習', periodIds: [1, 2] },
      { id: 2, name: '枠2', periodIds: [3] },
    ]);
    expect(migrated.tabs.map(t => [t.config.frameId, t.config.activePeriodIds])).toEqual([[1, [1, 2]], [2, [3]], [undefined, [4]]]);
  });

  it('枠の無い project は触らない', () => {
    const p = base();
    expect(migrateProject(p).frames).toBeUndefined();
  });
});

describe('枠の読み取り', () => {
  it('期間・日付の属する枠 (外部授業だけの日はいちばん近い枠)', () => {
    const p = withFrames();
    expect(frameRangeLabel(p, 1)).toBe('12/25(金)〜12/26(土)');
    expect(frameIdForDate(p, '1/12(火)')).toBe(2);
    expect(frameIdForDate(p, '12/24(木)')).toBe(1);
    expect(frameIdForDate(base(), '12/25(金)')).toBe(null);
  });

  it('他学年セッションを出すか: その日を使う枠のいちばん出している状態', () => {
    let p = withFrames(base({ publishState: 'final' }));
    p = reduce(p, { type: 'frame/setPublishState', payload: { id: 1, state: 'draft' } });
    expect(publishStateForSessionDate(p, '12/25(金)')).toBe('draft');
    expect(publishStateForSessionDate(p, '12/24(木)')).toBe('draft');
    expect(publishStateForSessionDate(p, '1/12(火)')).toBe('final');
  });

  it('見出しの名前: 全部が同じ枠なら枠の名前', () => {
    const p = withFrames();
    expect(displayNameForTabs(p, [p.tabs[1]])).toBe('直前ポイント演習');
    expect(displayNameForTabs(p, [p.tabs[0], p.tabs[1]])).toBe('2026 冬期講習　中123');
  });

  it('1 つの枠だけの project (講師別 Excel): その枠のタブと日', () => {
    const p = withFrames();
    const winter = projectForFrame(p, 1);
    expect(winter.name).toBe('冬期講習');
    expect(winter.tabs.map(t => t.name)).toEqual(['中３']);
    expect(winter.dates.some(d => d.label === '12/24(木)')).toBe(true);
    const direct = projectForFrame(p, 2);
    expect(direct.dates.some(d => d.label === '12/24(木)')).toBe(false);
    expect(effectiveConfigForTab(direct, direct.tabs[0]).dates.map(d => d.label)).toEqual(['1/12(火)', '1/14(木)']);
  });
});

describe('枠と書き出し・本体', () => {
  it('本体の月間: 作成中の枠のコマは出さず、出す枠のコマに枠の名前', () => {
    let p = withFrames(base({ publishState: 'final' }));
    p = reduce(p, { type: 'frame/setPublishState', payload: { id: 3, state: 'draft' } });
    p = reduce(p, { type: 'frame/setPublishState', payload: { id: 2, state: 'tentative' } });
    const lessons = buildKoshuLessons(p);
    expect(lessons.map(l => [l.tabName, l.frameName, l.tentative])).toEqual([
      ['中３', '冬期講習', false],
      ['中３直前 火木', '直前ポイント演習', true],
    ]);
  });

  it('講師別 Excel: 見出しは枠の名前、枠のタブだけ。全体 Excel のシート見出しも枠の名前', () => {
    const p = withFrames();
    const wb = buildTeacherWorkbook(projectForFrame(p, 2));
    const ws = wb.getWorksheet('半田');
    expect(String(ws.getCell(1, 1).value)).toContain('半田 — 直前ポイント演習');
    expect(ws.getCell(3, 1).value).toBe('1/12(火)');
    const all = buildScheduleWorkbook(p);
    expect(String(all.getWorksheet('中３直前 火木').getCell(1, 1).value)).toContain('直前ポイント演習 — 中３直前 火木');
  });

  it('作り直し・テンプレート: 枠の名前・時限・タブの所属は残し、状態は作成中 / 持たない', () => {
    const p = withFrames(base({ publishState: 'final' }));
    const fresh = buildFreshSeasonProject(p, { name: '2027 冬期講習' });
    expect(fresh.frames.map(f => [f.name, f.periodIds, f.publishState])).toEqual([
      ['冬期講習', [1, 2], 'draft'],
      ['直前ポイント演習', [3], 'draft'],
      ['弱点補強演習', [4], 'draft'],
    ]);
    expect(fresh.tabs.map(t => t.config.frameId)).toEqual([1, 2, 3]);
    expect(buildTemplatePayload(p).frames.every(f => !('publishState' in f))).toBe(true);
  });
});
