import { describe, expect, it } from 'vitest';
import { projectReducer, MAX_HISTORY } from './projectReducer';
import { makeKey, makeExternalKey, makeNgKey } from '../utils/scheduleKey';

// テスト用ヘルパー: 単純な project + state を生成 (v4 schema)
// v4: dates / periods は project 共通。fixture は従来どおり tab.config にも
// dates / periods を残しているが (個別テストの可読性のため)、overrides 適用後に
// tabs[0].config から project レベルへ hoist する。明示的な dates/periods
// override も可能。
function makeProject(overrides = {}) {
  const base = {
    version: 4,
    name: 'test',
    teachers: [
      { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      { name: '田中', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
    ],
    activeTabId: 1,
    tabs: [{
      id: 1,
      name: 'メイン',
      config: {
        dates: [{ id: 1, label: '12/25(木)' }],
        periods: [{ id: 1, label: '1限' }],
        classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
        subjectCounts: { '英語': 1, '数学': 1 },
      },
      schedule: {},
    }],
    combinedGroups: [],
    externalCounts: {},
    subjects: ['英語', '数学'],
    subjectColors: {},
  };
  const merged = { ...base, ...overrides };
  const t0 = merged.tabs[0]?.config || {};
  return {
    ...merged,
    dates: overrides.dates || merged.dates || t0.dates || [],
    periods: overrides.periods || merged.periods || t0.periods || [],
  };
}

function makeState(projectOverrides = {}) {
  const project = makeProject(projectOverrides);
  return {
    project,
    history: [project],
    historyIndex: 0,
    loadError: null,
  };
}

// ─── 履歴の wrap 仕様 ────────────────────────────────────

describe('projectReducer — 履歴の wrap', () => {
  it('actionable な変更は history に push される', () => {
    const state = makeState();
    const next = projectReducer(state, { type: 'teacher/add', payload: { name: 'X' } });
    expect(next.history).toHaveLength(2);
    expect(next.historyIndex).toBe(1);
    expect(next.project.teachers.some(t => t.name === 'X')).toBe(true);
  });

  it('updatedAt が新しい project に付与される', () => {
    const state = makeState();
    const before = Date.now();
    const next = projectReducer(state, { type: 'teacher/add', payload: { name: 'X' } });
    const after = Date.now();
    const ts = new Date(next.project.updatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('no-op (applyAction が同じ project を返す) は history 不変', () => {
    const state = makeState();
    const next = projectReducer(state, { type: 'teacher/add', payload: { name: '' } });
    expect(next).toBe(state);
  });

  it('MAX_HISTORY 超過時は最古を切る', () => {
    let state = makeState();
    for (let i = 0; i < MAX_HISTORY + 2; i++) {
      state = projectReducer(state, { type: 'project/updateName', payload: { name: `n-${i}` } });
    }
    expect(state.history).toHaveLength(MAX_HISTORY);
    expect(state.historyIndex).toBe(MAX_HISTORY - 1);
    // 最古は切られていて、最新が末尾
    expect(state.history[MAX_HISTORY - 1].name).toBe(`n-${MAX_HISTORY + 1}`);
  });

  it('undo 中に新アクションが来ると redo 分岐は切り捨て', () => {
    let state = makeState();
    state = projectReducer(state, { type: 'project/updateName', payload: { name: 'a' } });
    state = projectReducer(state, { type: 'project/updateName', payload: { name: 'b' } });
    state = projectReducer(state, { type: 'history/undo' });
    expect(state.project.name).toBe('a');
    expect(state.history).toHaveLength(3);
    state = projectReducer(state, { type: 'project/updateName', payload: { name: 'c' } });
    // [initial, a, c] になる (b は切り捨て)
    expect(state.history).toHaveLength(3);
    expect(state.history[2].name).toBe('c');
  });
});

// ─── undo/redo ───────────────────────────────────────────

describe('projectReducer — history/undo / history/redo', () => {
  it('undo で 1 つ前に戻る', () => {
    let state = makeState();
    state = projectReducer(state, { type: 'teacher/add', payload: { name: 'X' } });
    const before = state;
    state = projectReducer(state, { type: 'history/undo' });
    expect(state.historyIndex).toBe(0);
    expect(state.project).toBe(before.history[0]);
  });

  it('index 0 での undo は no-op', () => {
    const state = makeState();
    const next = projectReducer(state, { type: 'history/undo' });
    expect(next).toBe(state);
  });

  it('redo で 1 つ進む', () => {
    let state = makeState();
    state = projectReducer(state, { type: 'teacher/add', payload: { name: 'X' } });
    state = projectReducer(state, { type: 'history/undo' });
    state = projectReducer(state, { type: 'history/redo' });
    expect(state.historyIndex).toBe(1);
    expect(state.project.teachers.some(t => t.name === 'X')).toBe(true);
  });

  it('末尾での redo は no-op', () => {
    const state = makeState();
    const next = projectReducer(state, { type: 'history/redo' });
    expect(next).toBe(state);
  });
});

// ─── 履歴に積まない系 ────────────────────────────────────

describe('projectReducer — 履歴に積まないアクション', () => {
  it('tab/switch は activeTabId のみ更新、history 不変', () => {
    const state = makeState({
      tabs: [
        { id: 1, name: 'a', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} },
        { id: 2, name: 'b', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} },
      ],
    });
    const next = projectReducer(state, { type: 'tab/switch', payload: { id: 2 } });
    expect(next.project.activeTabId).toBe(2);
    expect(next.history).toBe(state.history);
    expect(next.historyIndex).toBe(state.historyIndex);
  });

  it('project/setActive は project を差し替えるが history 不変', () => {
    const state = makeState();
    const newProj = makeProject({ name: 'replaced' });
    const next = projectReducer(state, { type: 'project/setActive', payload: newProj });
    expect(next.project).toBe(newProj);
    expect(next.history).toBe(state.history);
  });
});

// ─── 各 action type の挙動 ───────────────────────────────

describe('projectReducer — タブ管理', () => {
  it('tab/add: activeTab の config をコピー、新規 id で追加、activeTab 切り替え', () => {
    const state = makeState();
    const next = projectReducer(state, { type: 'tab/add', payload: { name: '新' } });
    expect(next.project.tabs).toHaveLength(2);
    expect(next.project.tabs[1].name).toBe('新');
    expect(next.project.tabs[1].config).not.toBe(next.project.tabs[0].config);
    expect(next.project.activeTabId).toBe(next.project.tabs[1].id);
  });

  it('tab/add: 空名は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'tab/add', payload: { name: '' } })).toBe(state);
  });

  it('tab/delete: 最後の 1 タブは消さない', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'tab/delete', payload: { id: 1 } })).toBe(state);
  });

  it('tab/rename: 空名は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'tab/rename', payload: { id: 1, name: '' } })).toBe(state);
  });

  it('tab/rename: 同名は no-op (F2d: 履歴を汚さない)', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'tab/rename', payload: { id: 1, name: 'メイン' } })).toBe(state);
  });

  it('tab/reorder: タブを並べ替える (N2d)', () => {
    const state = makeState({
      tabs: [
        { id: 1, name: '中1', config: { classes: [], subjectCounts: {} }, schedule: {} },
        { id: 2, name: '中3', config: { classes: [], subjectCounts: {} }, schedule: {} },
        { id: 3, name: '中2', config: { classes: [], subjectCounts: {} }, schedule: {} },
      ],
    });
    const next = projectReducer(state, { type: 'tab/reorder', payload: { fromIdx: 2, toIdx: 1 } });
    expect(next.project.tabs.map(t => t.name)).toEqual(['中1', '中2', '中3']);
    // 履歴 push は 1 回 (Undo 可)
    expect(next.history).toHaveLength(2);
  });

  it('tab/reorder: 範囲外 idx・同一 idx は no-op (N2d)', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'tab/reorder', payload: { fromIdx: 0, toIdx: 0 } })).toBe(state);
    expect(projectReducer(state, { type: 'tab/reorder', payload: { fromIdx: -1, toIdx: 0 } })).toBe(state);
    expect(projectReducer(state, { type: 'tab/reorder', payload: { fromIdx: 0, toIdx: 99 } })).toBe(state);
  });
});

// ─── F2d: 同値 commit の no-op ガード ────────────────────────
// blur 再 commit やカラーピッカーの連続イベントが実効 Undo 深度
// (MAX_HISTORY=50) を削らないことを固定する。

describe('projectReducer — 同値 no-op ガード (F2d)', () => {
  it('config/setSubjectCount: 同値は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, {
      type: 'config/setSubjectCount',
      payload: { subject: '英語', value: 1 },
    })).toBe(state);
    // 文字列で来ても parseInt 後に比較される
    expect(projectReducer(state, {
      type: 'config/setSubjectCount',
      payload: { subject: '英語', value: '1' },
    })).toBe(state);
  });

  it('subject/setColor: 同色は no-op', () => {
    const state = makeState({ subjectColors: { 英語: '#ff0000' } });
    expect(projectReducer(state, {
      type: 'subject/setColor',
      payload: { subject: '英語', color: '#ff0000' },
    })).toBe(state);
    // 別色は変更される
    const next = projectReducer(state, {
      type: 'subject/setColor',
      payload: { subject: '英語', color: '#00ff00' },
    });
    expect(next.project.subjectColors['英語']).toBe('#00ff00');
  });

  it('project/updateName: 同名は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, {
      type: 'project/updateName',
      payload: { name: 'test' },
    })).toBe(state);
  });

  it('teacher/setExternalCount: 同値は no-op', () => {
    const state = makeState({
      externalCounts: { [makeExternalKey('12/25(木)', '堀上')]: 3 },
    });
    expect(projectReducer(state, {
      type: 'teacher/setExternalCount',
      payload: { date: '12/25(木)', teacherName: '堀上', value: '3' },
    })).toBe(state);
    // 別値は反映される
    const next = projectReducer(state, {
      type: 'teacher/setExternalCount',
      payload: { date: '12/25(木)', teacherName: '堀上', value: '5' },
    });
    expect(next.project.externalCounts[makeExternalKey('12/25(木)', '堀上')]).toBe(5);
  });

  it('combinedGroup/update: 全フィールド同値は no-op (dates: null も比較可)', () => {
    const state = makeState({
      combinedGroups: [{ id: 1, subject: '英語', classes: ['３S', '３A'], dates: null }],
    });
    expect(projectReducer(state, {
      type: 'combinedGroup/update',
      payload: { id: 1, updates: { subject: '英語', classes: ['３S', '３A'], dates: null } },
    })).toBe(state);
    // 存在しない id も no-op
    expect(projectReducer(state, {
      type: 'combinedGroup/update',
      payload: { id: 99, updates: { subject: '数学' } },
    })).toBe(state);
    // 実変更は反映される
    const next = projectReducer(state, {
      type: 'combinedGroup/update',
      payload: { id: 1, updates: { subject: '英語', classes: ['３S', '３A'], dates: ['12/25(木)'] } },
    });
    expect(next.project.combinedGroups[0].dates).toEqual(['12/25(木)']);
  });
});

describe('projectReducer — 講師管理', () => {
  it('teacher/add: 空名は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'teacher/add', payload: { name: '' } })).toBe(state);
  });

  it('teacher/add: 既存と同名は no-op (silent data 混線を防ぐ)', () => {
    const state = makeState({
      teachers: [{ name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] }],
    });
    const next = projectReducer(state, { type: 'teacher/add', payload: { name: '堀上' } });
    expect(next).toBe(state);
  });

  it('teacher/rename: 別の講師と同名になるリネームは no-op', () => {
    const state = makeState({
      teachers: [
        { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
        { name: '田中', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
    });
    const next = projectReducer(state, { type: 'teacher/rename', payload: { idx: 0, newName: '田中' } });
    expect(next).toBe(state);
  });

  it('teacher/rename: idx 不正は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'teacher/rename', payload: { idx: -1, newName: 'X' } })).toBe(state);
    expect(projectReducer(state, { type: 'teacher/rename', payload: { idx: 999, newName: 'X' } })).toBe(state);
    expect(projectReducer(state, { type: 'teacher/rename', payload: { idx: undefined, newName: 'X' } })).toBe(state);
  });

  it('teacher/toggleNg: idx 不正は no-op (undefined / 範囲外)', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'teacher/toggleNg', payload: { idx: undefined, date: 'd', period: 'p' } })).toBe(state);
    expect(projectReducer(state, { type: 'teacher/toggleNg', payload: { idx: -1, date: 'd', period: 'p' } })).toBe(state);
    expect(projectReducer(state, { type: 'teacher/toggleNg', payload: { idx: 999, date: 'd', period: 'p' } })).toBe(state);
  });

  it('teacher/toggleSubject: idx 不正は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'teacher/toggleSubject', payload: { idx: undefined, subject: '英語' } })).toBe(state);
    expect(projectReducer(state, { type: 'teacher/toggleSubject', payload: { idx: 999, subject: '英語' } })).toBe(state);
  });

  it('teacher/toggleClassPriority: idx 不正は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'teacher/toggleClassPriority', payload: { idx: undefined, className: '３S' } })).toBe(state);
    expect(projectReducer(state, { type: 'teacher/toggleClassPriority', payload: { idx: 999, className: '３S' } })).toBe(state);
  });

  it('teacher/remove: idx 不正は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'teacher/remove', payload: { idx: undefined } })).toBe(state);
    expect(projectReducer(state, { type: 'teacher/remove', payload: { idx: 999 } })).toBe(state);
  });

  it('teacher/import (append): 既存に追加、同名は subjects のみ上書きしつつ ng/priority は維持', () => {
    const state = makeState({
      teachers: [
        { name: '堀上', subjects: ['英語'], ngSlots: ['ng1'], ngClasses: ['c1'], priorityClasses: ['p1'] },
      ],
    });
    const next = projectReducer(state, {
      type: 'teacher/import',
      payload: {
        teachers: [
          { name: '堀上', subjects: ['英語', '数学'] }, // 既存
          { name: '山田', subjects: ['理科'] },         // 新規
        ],
        mode: 'append',
      },
    });
    expect(next.project.teachers).toHaveLength(2);
    expect(next.project.teachers[0]).toEqual({
      name: '堀上',
      subjects: ['英語', '数学'],
      ngSlots: ['ng1'],
      ngClasses: ['c1'],
      priorityClasses: ['p1'],
    });
    expect(next.project.teachers[1]).toEqual({
      name: '山田',
      subjects: ['理科'],
      ngSlots: [], ngClasses: [], priorityClasses: [],
    });
  });

  it('teacher/import (append): 取込行の subjects が空なら既存の担当科目を維持する (N1c)', () => {
    const state = makeState({
      teachers: [
        { name: '堀上', subjects: ['英語', '数学'], ngSlots: ['ng1'], ngClasses: [], priorityClasses: [] },
      ],
    });
    // 雛形 CSV の科目列を空欄のまま取り込んだケース
    const next = projectReducer(state, {
      type: 'teacher/import',
      payload: {
        teachers: [
          { name: '堀上', subjects: [] },        // 既存 → 担当維持
          { name: '山田', subjects: [] },        // 新規 → 空のまま追加 (L1g 警告対象)
        ],
        mode: 'append',
      },
    });
    expect(next.project.teachers[0].subjects).toEqual(['英語', '数学']);
    expect(next.project.teachers[1].subjects).toEqual([]);
  });

  it('teacher/import (replace): 既存を破棄して payload に置き換え、ng/priority も全クリア', () => {
    const state = makeState({
      teachers: [
        { name: '堀上', subjects: ['英語'], ngSlots: ['ng1'], ngClasses: [], priorityClasses: ['p1'] },
        { name: '田中', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
    });
    const next = projectReducer(state, {
      type: 'teacher/import',
      payload: {
        teachers: [{ name: '新人', subjects: ['英語'] }],
        mode: 'replace',
      },
    });
    expect(next.project.teachers).toEqual([
      { name: '新人', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
    ]);
  });

  it('teacher/import: 空配列は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, {
      type: 'teacher/import',
      payload: { teachers: [], mode: 'append' },
    })).toBe(state);
  });

  it('teacher/rename: schedule と externalCounts を cascade', () => {
    const state = makeState({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中' },
        },
      }],
      externalCounts: { [makeExternalKey('12/25(木)', '堀上')]: 3 },
    });
    const next = projectReducer(state, {
      type: 'teacher/rename',
      payload: { idx: 0, newName: 'ホリウエ' },
    });
    expect(next.project.teachers[0].name).toBe('ホリウエ');
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 1)].teacher).toBe('ホリウエ');
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 2)].teacher).toBe('田中');
    expect(next.project.externalCounts[makeExternalKey('12/25(木)', 'ホリウエ')]).toBe(3);
    expect(next.project.externalCounts[makeExternalKey('12/25(木)', '堀上')]).toBeUndefined();
  });

  it('teacher/rename: 同名 / 空名は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'teacher/rename', payload: { idx: 0, newName: '堀上' } })).toBe(state);
    expect(projectReducer(state, { type: 'teacher/rename', payload: { idx: 0, newName: '' } })).toBe(state);
  });

  it('teacher/remove: schedule の teacher が空文字に', () => {
    const state = makeState({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中' },
        },
      }],
    });
    const next = projectReducer(state, { type: 'teacher/remove', payload: { idx: 0 } });
    expect(next.project.teachers.find(t => t.name === '堀上')).toBeUndefined();
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 1)].teacher).toBe('');
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 2)].teacher).toBe('田中');
  });

  it('teacher/toggleNg: ngSlots を toggle', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'teacher/toggleNg',
      payload: { idx: 0, date: '12/25(木)', period: '1限' },
    });
    expect(state.project.teachers[0].ngSlots).toEqual([makeNgKey('12/25(木)', '1限')]);
    state = projectReducer(state, {
      type: 'teacher/toggleNg',
      payload: { idx: 0, date: '12/25(木)', period: '1限' },
    });
    expect(state.project.teachers[0].ngSlots).toEqual([]);
  });

  it('teacher/setNgBatch (value=true): 複数日付×複数時限を一括でNGに設定', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'teacher/setNgBatch',
      payload: {
        idxs: [0],
        dateLabels: ['7/28(火)', '7/29(水)', '7/30(木)'],
        periodLabels: ['1限', '2限'],
        value: true,
      },
    });
    const ng = next.project.teachers[0].ngSlots.sort();
    expect(ng).toEqual([
      makeNgKey('7/28(火)', '1限'),
      makeNgKey('7/28(火)', '2限'),
      makeNgKey('7/29(水)', '1限'),
      makeNgKey('7/29(水)', '2限'),
      makeNgKey('7/30(木)', '1限'),
      makeNgKey('7/30(木)', '2限'),
    ].sort());
    expect(next.project.teachers[1].ngSlots).toEqual([]);
  });

  it('teacher/setNgBatch (value=false): 既存NGを範囲で一括解除', () => {
    const seeded = makeProject();
    seeded.teachers[0].ngSlots = [
      makeNgKey('7/28(火)', '1限'),
      makeNgKey('7/29(水)', '1限'),
      makeNgKey('8/1(土)', '1限'),
    ];
    const state = { project: seeded, history: [seeded], historyIndex: 0, loadError: null };
    const next = projectReducer(state, {
      type: 'teacher/setNgBatch',
      payload: {
        idxs: [0],
        dateLabels: ['7/28(火)', '7/29(水)'],
        periodLabels: ['1限'],
        value: false,
      },
    });
    expect(next.project.teachers[0].ngSlots).toEqual([makeNgKey('8/1(土)', '1限')]);
  });

  it('teacher/setNgBatch: 複数講師 (全講師) も一度に処理できる', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'teacher/setNgBatch',
      payload: {
        idxs: [0, 1],
        dateLabels: ['7/29(水)'],
        periodLabels: ['1限'],
        value: true,
      },
    });
    expect(next.project.teachers[0].ngSlots).toEqual([makeNgKey('7/29(水)', '1限')]);
    expect(next.project.teachers[1].ngSlots).toEqual([makeNgKey('7/29(水)', '1限')]);
  });

  it('teacher/setNgBatch: 変更が無ければ同参照を返す (履歴を汚さない)', () => {
    const state = makeState();
    // 既に NG なし、value=false → 何も変わらない
    const next = projectReducer(state, {
      type: 'teacher/setNgBatch',
      payload: {
        idxs: [0],
        dateLabels: ['7/29(水)'],
        periodLabels: ['1限'],
        value: false,
      },
    });
    expect(next.project).toBe(state.project);
  });

  it('teacher/setNgBatch: 空配列は no-op (project 参照を維持)', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'teacher/setNgBatch',
      payload: { idxs: [], dateLabels: ['7/29(水)'], periodLabels: ['1限'], value: true },
    });
    expect(next.project).toBe(state.project);
  });

  it('teacher/importNg: 名前一致の講師に NG を追加 (dedupe)', () => {
    const seeded = makeProject();
    seeded.teachers[0].ngSlots = [makeNgKey('12/25', '1限')];
    const state = { project: seeded, history: [seeded], historyIndex: 0, loadError: null };
    const next = projectReducer(state, {
      type: 'teacher/importNg',
      payload: {
        entries: [
          { name: '堀上', date: '12/25', period: '1限' }, // 既存 → dedupe
          { name: '堀上', date: '12/25', period: '2限' },
          { name: '田中', date: '12/26', period: '3限' },
        ],
      },
    });
    expect(next.project.teachers[0].ngSlots.sort()).toEqual(
      [makeNgKey('12/25', '1限'), makeNgKey('12/25', '2限')].sort(),
    );
    expect(next.project.teachers[1].ngSlots).toEqual([makeNgKey('12/26', '3限')]);
  });

  it('teacher/importNg: 未登録の name は skip', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'teacher/importNg',
      payload: { entries: [{ name: '居ない先生', date: '12/25', period: '1限' }] },
    });
    expect(next.project).toBe(state.project); // 変更なし → 同参照
  });

  it('teacher/importNg: 空配列 / 全て既存は no-op (同参照)', () => {
    const seeded = makeProject();
    seeded.teachers[0].ngSlots = [makeNgKey('12/25', '1限')];
    const state = { project: seeded, history: [seeded], historyIndex: 0, loadError: null };
    expect(projectReducer(state, { type: 'teacher/importNg', payload: { entries: [] } }).project).toBe(seeded);
    const noChange = projectReducer(state, {
      type: 'teacher/importNg',
      payload: { entries: [{ name: '堀上', date: '12/25', period: '1限' }] },
    });
    expect(noChange.project).toBe(seeded);
  });

  it('teacher/addExternalSession: 詳細セッションを追加し ID を採番', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'teacher/addExternalSession',
      payload: { date: '7/29(水)', teacherName: '堀上', label: '1限', memo: '予備校' },
    });
    expect(state.project.externalSessions).toEqual([
      { id: 1, date: '7/29(水)', teacherName: '堀上', label: '1限', memo: '予備校' },
    ]);
    state = projectReducer(state, {
      type: 'teacher/addExternalSession',
      payload: { date: '7/30(木)', teacherName: '堀上', label: '', memo: '' },
    });
    expect(state.project.externalSessions[1].id).toBe(2);
  });

  it('teacher/addExternalSession: startTime/endTime を保存', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'teacher/addExternalSession',
      payload: {
        date: '7/29(水)', teacherName: '堀上', label: '', memo: '予備校',
        startTime: '12:25', endTime: '13:35',
      },
    });
    expect(state.project.externalSessions[0]).toEqual({
      id: 1, date: '7/29(水)', teacherName: '堀上', label: '', memo: '予備校',
      startTime: '12:25', endTime: '13:35',
    });
  });

  it('teacher/addExternalSession: 空文字の startTime/endTime は省略 (フィールドを格納しない)', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'teacher/addExternalSession',
      payload: { date: '7/29(水)', teacherName: '堀上', label: '', memo: '', startTime: '', endTime: '' },
    });
    const sess = state.project.externalSessions[0];
    expect(sess).not.toHaveProperty('startTime');
    expect(sess).not.toHaveProperty('endTime');
  });

  it('teacher/addExternalSession: startTime が空なら endTime も格納しない (orphan 防止)', () => {
    // endTime だけ残ると getSessionTimeRange が start を復元できず silent no-op
    let state = makeState();
    state = projectReducer(state, {
      type: 'teacher/addExternalSession',
      payload: { date: '7/29(水)', teacherName: '堀上', label: '', memo: '', startTime: '', endTime: '13:35' },
    });
    const sess = state.project.externalSessions[0];
    expect(sess).not.toHaveProperty('startTime');
    expect(sess).not.toHaveProperty('endTime');
  });

  it('teacher/addExternalSessions: 複数日を 1 アクションで atomic に追加', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'teacher/addExternalSessions',
      payload: {
        items: [
          { date: '7/29(水)', teacherName: '堀上', label: '', memo: '予備校', startTime: '12:25', endTime: '13:35' },
          { date: '7/30(木)', teacherName: '堀上', label: '', memo: '予備校', startTime: '12:25', endTime: '13:35' },
        ],
      },
    });
    expect(state.project.externalSessions).toHaveLength(2);
    expect(state.project.externalSessions[0].id).toBe(1);
    expect(state.project.externalSessions[1].id).toBe(2);
    expect(state.project.externalSessions[0].date).toBe('7/29(水)');
    expect(state.project.externalSessions[1].date).toBe('7/30(木)');
    // 履歴 push は 1 回
    expect(state.history.length).toBe(2); // initial + 1 push
  });

  it('teacher/addExternalSessions: items 空・undefined は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'teacher/addExternalSessions', payload: { items: [] } })).toBe(state);
    expect(projectReducer(state, { type: 'teacher/addExternalSessions', payload: {} })).toBe(state);
  });

  it('teacher/addExternalSessions: date/teacherName 欠落の items は skip し残りで作成', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'teacher/addExternalSessions',
      payload: {
        items: [
          { date: '7/29(水)', teacherName: '堀上' },
          { date: '', teacherName: '堀上' }, // skip
          { date: '7/30(木)', teacherName: '' }, // skip
          { date: '7/31(金)', teacherName: '堀上' },
        ],
      },
    });
    expect(state.project.externalSessions).toHaveLength(2);
    expect(state.project.externalSessions.map(s => s.date)).toEqual(['7/29(水)', '7/31(金)']);
  });

  it('teacher/addExternalSessions: 内容が完全一致する既存セッションはスキップ (N1i)', () => {
    let state = makeState();
    const items = [
      { date: '7/29(水)', teacherName: '堀上', label: '', memo: '予備校', startTime: '12:25', endTime: '13:35' },
      { date: '7/30(木)', teacherName: '堀上', label: '', memo: '予備校', startTime: '12:25', endTime: '13:35' },
    ];
    state = projectReducer(state, { type: 'teacher/addExternalSessions', payload: { items } });
    expect(state.project.externalSessions).toHaveLength(2);
    // 同じ内容を再登録 → 全て skip で no-op (同参照 = 履歴も汚さない)
    const again = projectReducer(state, { type: 'teacher/addExternalSessions', payload: { items } });
    expect(again).toBe(state);
    // 一部だけ新規なら新規分のみ追加
    const mixed = projectReducer(state, {
      type: 'teacher/addExternalSessions',
      payload: {
        items: [
          ...items,
          { date: '7/31(金)', teacherName: '堀上', label: '', memo: '予備校', startTime: '12:25', endTime: '13:35' },
        ],
      },
    });
    expect(mixed.project.externalSessions).toHaveLength(3);
    // メモや時刻が違えば別内容として追加される
    const differentMemo = projectReducer(state, {
      type: 'teacher/addExternalSessions',
      payload: { items: [{ ...items[0], memo: '別件' }] },
    });
    expect(differentMemo.project.externalSessions).toHaveLength(3);
  });

  it('teacher/addExternalSessions: バッチ内の重複も 1 件に dedupe (N1i)', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'teacher/addExternalSessions',
      payload: {
        items: [
          { date: '7/29(水)', teacherName: '堀上', label: '', memo: '' },
          { date: '7/29(水)', teacherName: '堀上', label: '', memo: '' },
        ],
      },
    });
    expect(state.project.externalSessions).toHaveLength(1);
  });

  it('teacher/addExternalSession: date/teacherName が空なら no-op', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'teacher/addExternalSession',
      payload: { date: '', teacherName: '堀上', label: '', memo: '' },
    });
    expect(next.project).toBe(state.project);
  });

  it('teacher/removeExternalSession: ID 一致のセッションを削除', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'teacher/addExternalSession',
      payload: { date: '7/29(水)', teacherName: '堀上', label: '1限', memo: '' },
    });
    state = projectReducer(state, {
      type: 'teacher/removeExternalSession',
      payload: { id: 1 },
    });
    expect(state.project.externalSessions).toEqual([]);
  });

  it('teacher/removeExternalSession: 存在しない ID は no-op (同参照)', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'teacher/removeExternalSession',
      payload: { id: 999 },
    });
    expect(next.project).toBe(state.project);
  });

  it('teacher/setExternalCount: 数値以外は 0 に解釈', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'teacher/setExternalCount',
      payload: { date: '12/25(木)', teacherName: '堀上', value: 'abc' },
    });
    expect(next.project.externalCounts[makeExternalKey('12/25(木)', '堀上')]).toBe(0);
  });
});

describe('projectReducer — externalSessionPresets', () => {
  it('preset/add: name 必須、空ペイロードは no-op', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'preset/add', payload: { name: '' } })).toBe(state);
    expect(projectReducer(state, { type: 'preset/add', payload: {} })).toBe(state);
  });

  it('preset/add: 全フィールド指定で保存し、id 自動採番', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'preset/add',
      payload: {
        name: '予備校（早朝）',
        startTime: '12:25', endTime: '13:35',
        startDateLabel: '7/29(水)', endDateLabel: '7/31(金)',
        memo: '予備校',
      },
    });
    expect(state.project.externalSessionPresets).toEqual([{
      id: 1, name: '予備校（早朝）',
      startTime: '12:25', endTime: '13:35',
      startDateLabel: '7/29(水)', endDateLabel: '7/31(金)',
      memo: '予備校',
    }]);
    state = projectReducer(state, { type: 'preset/add', payload: { name: 'B' } });
    expect(state.project.externalSessionPresets[1].id).toBe(2);
  });

  it('preset/add: 空文字フィールドは保存しない (省略扱い)', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'preset/add',
      payload: { name: 'X', startTime: '', endTime: '', memo: '' },
    });
    const p = state.project.externalSessionPresets[0];
    expect(p).toEqual({ id: 1, name: 'X' });
  });

  it('preset/add: teachers は非空配列のみ保存 (N4c)', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'preset/add',
      payload: { name: '予備校', teachers: ['堀上', '田中'] },
    });
    expect(state.project.externalSessionPresets[0].teachers).toEqual(['堀上', '田中']);
    state = projectReducer(state, {
      type: 'preset/add',
      payload: { name: '講師なし', teachers: [] },
    });
    expect(state.project.externalSessionPresets[1]).not.toHaveProperty('teachers');
  });

  it('preset/update: teachers は空配列で削除・非空で上書き (N4c)', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'preset/add',
      payload: { name: '予備校', teachers: ['堀上'] },
    });
    const id = state.project.externalSessionPresets[0].id;
    state = projectReducer(state, {
      type: 'preset/update',
      payload: { id, updates: { teachers: ['田中', '佐藤'] } },
    });
    expect(state.project.externalSessionPresets[0].teachers).toEqual(['田中', '佐藤']);
    state = projectReducer(state, {
      type: 'preset/update',
      payload: { id, updates: { teachers: [] } },
    });
    expect(state.project.externalSessionPresets[0]).not.toHaveProperty('teachers');
  });

  it('preset/add: startTime が無ければ endTime も保存しない (orphan 防止)', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'preset/add',
      payload: { name: 'X', startTime: '', endTime: '13:35' },
    });
    const p = state.project.externalSessionPresets[0];
    expect(p).not.toHaveProperty('startTime');
    expect(p).not.toHaveProperty('endTime');
  });

  it('preset/update: 指定フィールドだけ更新、他は維持', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'preset/add',
      payload: { name: 'A', startTime: '12:25', endTime: '13:35', memo: '予備校' },
    });
    state = projectReducer(state, {
      type: 'preset/update',
      payload: { id: 1, updates: { memo: '予備校(更新)' } },
    });
    const p = state.project.externalSessionPresets[0];
    expect(p.memo).toBe('予備校(更新)');
    expect(p.startTime).toBe('12:25');
    expect(p.endTime).toBe('13:35');
    expect(p.name).toBe('A');
  });

  it('preset/update: 空文字を渡すとフィールドを削除 (startTime 削除で endTime も連動 drop)', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'preset/add',
      payload: { name: 'A', startTime: '12:25', endTime: '13:35' },
    });
    state = projectReducer(state, {
      type: 'preset/update',
      payload: { id: 1, updates: { startTime: '' } },
    });
    const p = state.project.externalSessionPresets[0];
    expect(p).not.toHaveProperty('startTime');
    expect(p).not.toHaveProperty('endTime');
  });

  it('preset/update: 存在しない id は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'preset/update', payload: { id: 999, updates: { name: 'X' } } })).toBe(state);
  });

  it('preset/update: name を空にする更新は no-op (name 必須)', () => {
    let state = makeState();
    state = projectReducer(state, { type: 'preset/add', payload: { name: 'A' } });
    const before = state;
    state = projectReducer(state, {
      type: 'preset/update',
      payload: { id: 1, updates: { name: '' } },
    });
    expect(state).toBe(before);
  });

  it('preset/remove: 指定 id を drop', () => {
    let state = makeState();
    state = projectReducer(state, { type: 'preset/add', payload: { name: 'A' } });
    state = projectReducer(state, { type: 'preset/add', payload: { name: 'B' } });
    state = projectReducer(state, { type: 'preset/remove', payload: { id: 1 } });
    expect(state.project.externalSessionPresets.map(p => p.name)).toEqual(['B']);
  });

  it('preset/remove: 存在しない id は no-op (同参照)', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'preset/remove', payload: { id: 999 } })).toBe(state);
  });

  it('schedule/renameHeader (date): externalSessions.date と externalSessionPresets の日付ラベルも追従', () => {
    const state = makeState({
      externalSessions: [
        { id: 1, date: '12/25(木)', teacherName: '堀上', label: '', memo: '' },
        { id: 2, date: '12/26(金)', teacherName: '堀上', label: '', memo: '' },
      ],
      externalSessionPresets: [
        { id: 1, name: 'A', startDateLabel: '12/25(木)', endDateLabel: '12/26(金)' },
        { id: 2, name: 'B', startDateLabel: '12/25(木)' },
      ],
    });
    const next = projectReducer(state, {
      type: 'schedule/renameHeader',
      payload: { type: 'date', oldVal: '12/25(木)', newVal: '12/25(祝)' },
    });
    expect(next.project.externalSessions[0].date).toBe('12/25(祝)');
    expect(next.project.externalSessions[1].date).toBe('12/26(金)');
    expect(next.project.externalSessionPresets[0].startDateLabel).toBe('12/25(祝)');
    expect(next.project.externalSessionPresets[0].endDateLabel).toBe('12/26(金)');
    expect(next.project.externalSessionPresets[1].startDateLabel).toBe('12/25(祝)');
  });
});

describe('projectReducer — 科目マスタ', () => {
  it('subject/add: 全タブの subjectCounts に 0 で追加', () => {
    const state = makeState();
    const next = projectReducer(state, { type: 'subject/add', payload: { name: '理科' } });
    expect(next.project.subjects).toContain('理科');
    expect(next.project.tabs[0].config.subjectCounts['理科']).toBe(0);
  });

  it('subject/add: 重複/空は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'subject/add', payload: { name: '英語' } })).toBe(state);
    expect(projectReducer(state, { type: 'subject/add', payload: { name: '' } })).toBe(state);
  });

  it('subject/remove: subjects / counts / schedule / teachers / colors の cascade', () => {
    const state = makeState({
      subjectColors: { '英語': '#000', '数学': '#fff' },
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
        },
      }],
      teachers: [
        { name: '堀上', subjects: ['英語', '数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
    });
    const next = projectReducer(state, { type: 'subject/remove', payload: { name: '英語' } });
    expect(next.project.subjects).not.toContain('英語');
    expect(next.project.tabs[0].config.subjectCounts['英語']).toBeUndefined();
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 1)]).toEqual({ subject: '', teacher: '' });
    expect(next.project.teachers[0].subjects).toEqual(['数学']);
    expect(next.project.subjectColors['英語']).toBeUndefined();
    expect(next.project.subjectColors['数学']).toBe('#fff');
  });

  it('subject/reorder: 順序を変更', () => {
    const state = makeState({ subjects: ['英語', '数学', '国語'] });
    const next = projectReducer(state, { type: 'subject/reorder', payload: { fromIdx: 0, toIdx: 2 } });
    expect(next.project.subjects).toEqual(['数学', '国語', '英語']);
  });

  it('config/setSubjectCount: tabId 省略時はアクティブタブを更新', () => {
    const state = makeState();
    const next = projectReducer(state, { type: 'config/setSubjectCount', payload: { subject: '英語', value: '5' } });
    expect(next.project.tabs[0].config.subjectCounts['英語']).toBe(5);
  });

  it('config/setSubjectCount: tabId 指定で非アクティブタブも更新できる (学年別の上限)', () => {
    const state = makeState({
      activeTabId: 1,
      tabs: [
        { id: 1, name: '中３', config: { dates: [], periods: [], classes: [], subjectCounts: { '英語': 4 } }, schedule: {} },
        { id: 2, name: '中１・２', config: { dates: [], periods: [], classes: [], subjectCounts: { '英語': 4 } }, schedule: {} },
      ],
    });
    const next = projectReducer(state, { type: 'config/setSubjectCount', payload: { subject: '英語', value: '6', tabId: 2 } });
    // 対象タブのみ更新され、アクティブタブは据え置き
    expect(next.project.tabs[1].config.subjectCounts['英語']).toBe(6);
    expect(next.project.tabs[0].config.subjectCounts['英語']).toBe(4);
  });

  it('config/setSubjectCount: 数値化できない値は 0 にフォールバック', () => {
    const state = makeState();
    const next = projectReducer(state, { type: 'config/setSubjectCount', payload: { subject: '英語', value: '' } });
    expect(next.project.tabs[0].config.subjectCounts['英語']).toBe(0);
  });
});

describe('projectReducer — セル操作', () => {
  it('cell/assign: subject 割当で teacher は空に', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'cell/assign',
      payload: { dateId: 1, periodId: 1, classId: 1, type: 'subject', val: '英語' },
    });
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 1)]).toEqual({ subject: '英語', teacher: '' });
  });

  it('cell/assign: 科目変更でも講師が新科目を担当可能なら保持 (L1a)', () => {
    let state = makeState({
      teachers: [
        { name: '兼任', subjects: ['英語', '数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
    });
    state = projectReducer(state, {
      type: 'cell/assign',
      payload: { dateId: 1, periodId: 1, classId: 1, type: 'subject', val: '英語' },
    });
    state = projectReducer(state, {
      type: 'cell/assign',
      payload: { dateId: 1, periodId: 1, classId: 1, type: 'teacher', val: '兼任' },
    });
    const next = projectReducer(state, {
      type: 'cell/assign',
      payload: { dateId: 1, periodId: 1, classId: 1, type: 'subject', val: '数学' },
    });
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 1)]).toEqual({ subject: '数学', teacher: '兼任' });
  });

  it('cell/assign: 科目変更で講師が担当不可なら空に (L1a)', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'cell/assign',
      payload: { dateId: 1, periodId: 1, classId: 1, type: 'subject', val: '英語' },
    });
    state = projectReducer(state, {
      type: 'cell/assign',
      payload: { dateId: 1, periodId: 1, classId: 1, type: 'teacher', val: '堀上' },
    });
    const next = projectReducer(state, {
      type: 'cell/assign',
      payload: { dateId: 1, periodId: 1, classId: 1, type: 'subject', val: '数学' },
    });
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 1)]).toEqual({ subject: '数学', teacher: '' });
  });

  it('cell/assign: 科目クリアで講師も空に (L1a)', () => {
    let state = makeState({
      teachers: [
        { name: '兼任', subjects: ['英語', '数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
    });
    state = projectReducer(state, {
      type: 'cell/assign',
      payload: { dateId: 1, periodId: 1, classId: 1, type: 'subject', val: '英語' },
    });
    state = projectReducer(state, {
      type: 'cell/assign',
      payload: { dateId: 1, periodId: 1, classId: 1, type: 'teacher', val: '兼任' },
    });
    const next = projectReducer(state, {
      type: 'cell/assign',
      payload: { dateId: 1, periodId: 1, classId: 1, type: 'subject', val: '' },
    });
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 1)]).toEqual({ subject: '', teacher: '' });
  });

  it('cell/assign: locked セルは no-op', () => {
    const state = makeState({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上', locked: true },
        },
      }],
    });
    expect(projectReducer(state, {
      type: 'cell/assign',
      payload: { dateId: 1, periodId: 1, classId: 1, type: 'subject', val: '数学' },
    })).toBe(state);
  });

  it('cell/assign: 合同グループに subject を伝播', () => {
    const state = makeState({
      combinedGroups: [{ id: 1, subject: '英語', classes: ['３S', '３A'], dates: null }],
    });
    const next = projectReducer(state, {
      type: 'cell/assign',
      payload: { dateId: 1, periodId: 1, classId: 1, type: 'subject', val: '英語' },
    });
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 1)]).toEqual({ subject: '英語', teacher: '' });
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 2)]).toEqual({ subject: '英語', teacher: '' });
  });

  it('cell/clear: 非ロックセルを削除', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'cell/assign',
      payload: { dateId: 1, periodId: 1, classId: 1, type: 'subject', val: '英語' },
    });
    state = projectReducer(state, {
      type: 'cell/clear',
      payload: { dateId: 1, periodId: 1, classId: 1 },
    });
    expect(state.project.tabs[0].schedule[makeKey(1, 1, 1)]).toBeUndefined();
  });

  it('cell/bulkClear: 選択キーを一括削除、ロック済み・空 entry はスキップ (N2a)', () => {
    const state = makeState({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }],
          periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
          classes: [{ id: 1, label: '３S' }],
          subjectCounts: { '英語': 2 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(1, 2, 1)]: { subject: '数学', teacher: '田中', locked: true },
        },
      }],
    });
    const next = projectReducer(state, {
      type: 'cell/bulkClear',
      payload: { keys: [makeKey(1, 1, 1), makeKey(1, 2, 1), 'garbage-key'] },
    });
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 1)]).toBeUndefined();
    // ロック済みは温存
    expect(next.project.tabs[0].schedule[makeKey(1, 2, 1)]).toEqual({ subject: '数学', teacher: '田中', locked: true });
    // 履歴 push は 1 回 (atomic)
    expect(next.history).toHaveLength(2);
  });

  it('cell/bulkClear: 全件スキップ (空 / ロック) なら no-op、合同 secondary も掃除 (N2a)', () => {
    const state = makeState({
      combinedGroups: [{ id: 1, subject: '英語', classes: ['３S', '３A'], dates: null }],
    });
    // 空キーのみ → no-op (同参照)
    expect(projectReducer(state, {
      type: 'cell/bulkClear', payload: { keys: [makeKey(1, 1, 1)] },
    })).toBe(state);
    // 合同 primary を割当ててから bulkClear → secondary も消える
    let assigned = projectReducer(state, {
      type: 'cell/assign',
      payload: { dateId: 1, periodId: 1, classId: 1, type: 'subject', val: '英語' },
    });
    assigned = projectReducer(assigned, {
      type: 'cell/bulkClear', payload: { keys: [makeKey(1, 1, 1)] },
    });
    expect(assigned.project.tabs[0].schedule[makeKey(1, 1, 1)]).toBeUndefined();
    expect(assigned.project.tabs[0].schedule[makeKey(1, 1, 2)]).toBeUndefined();
  });

  it('cell/bulkSetLock: 一括ロック/解除、空セルもロック可、同値のみなら no-op (N2a)', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'cell/assign',
      payload: { dateId: 1, periodId: 1, classId: 1, type: 'subject', val: '英語' },
    });
    // 割当済み + 空セルをまとめてロック (空ロック = 「空けておく」 F5w)
    state = projectReducer(state, {
      type: 'cell/bulkSetLock',
      payload: { keys: [makeKey(1, 1, 1), makeKey(1, 2, 1)], locked: true },
    });
    expect(state.project.tabs[0].schedule[makeKey(1, 1, 1)].locked).toBe(true);
    expect(state.project.tabs[0].schedule[makeKey(1, 2, 1)].locked).toBe(true);
    // 既に同値なら no-op (同参照)
    expect(projectReducer(state, {
      type: 'cell/bulkSetLock',
      payload: { keys: [makeKey(1, 1, 1)], locked: true },
    })).toBe(state);
    // 解除
    const unlocked = projectReducer(state, {
      type: 'cell/bulkSetLock',
      payload: { keys: [makeKey(1, 1, 1), makeKey(1, 2, 1)], locked: false },
    });
    expect(unlocked.project.tabs[0].schedule[makeKey(1, 1, 1)].locked).toBe(false);
  });

  it('cell/paste: clipboard 無し / locked は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, {
      type: 'cell/paste',
      payload: { dateId: 1, periodId: 1, classId: 1, clipboard: null },
    })).toBe(state);
  });

  it('cell/swap: target locked は no-op', () => {
    const state = makeState({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中', locked: true },
        },
      }],
    });
    expect(projectReducer(state, {
      type: 'cell/swap',
      payload: {
        sourceKey: makeKey(1, 1, 1),
        targetKey: makeKey(1, 1, 2),
      },
    })).toBe(state);
  });

  it('cell/applyToAllDates: 起点セルの割当を全日の同じ時限・クラスへ適用 (L2c)', () => {
    let state = makeState({
      dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }, { id: 3, label: '12/27' }],
    });
    state = projectReducer(state, {
      type: 'cell/assign', payload: { dateId: 1, periodId: 1, classId: 1, type: 'subject', val: '英語' },
    });
    state = projectReducer(state, {
      type: 'cell/assign', payload: { dateId: 1, periodId: 1, classId: 1, type: 'teacher', val: '堀上' },
    });
    const next = projectReducer(state, {
      type: 'cell/applyToAllDates', payload: { dateId: 1, periodId: 1, classId: 1 },
    });
    expect(next.project.tabs[0].schedule[makeKey(2, 1, 1)]).toEqual({ subject: '英語', teacher: '堀上' });
    expect(next.project.tabs[0].schedule[makeKey(3, 1, 1)]).toEqual({ subject: '英語', teacher: '堀上' });
    // 他クラスには影響しない
    expect(next.project.tabs[0].schedule[makeKey(2, 1, 2)]).toBeUndefined();
  });

  it('cell/applyToAllDates: ロック済みセルはスキップし、空科目の起点は no-op (L2c)', () => {
    let state = makeState({
      dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(2, 1, 1)]: { subject: '数学', teacher: '田中', locked: true },
        },
      }],
    });
    const next = projectReducer(state, {
      type: 'cell/applyToAllDates', payload: { dateId: 1, periodId: 1, classId: 1 },
    });
    // ロック済みは変更されない → 変更対象ゼロで no-op (同一参照)
    expect(next).toBe(state);
    // 空科目の起点も no-op
    const empty = makeState({
      dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
    });
    expect(projectReducer(empty, {
      type: 'cell/applyToAllDates', payload: { dateId: 1, periodId: 1, classId: 1 },
    })).toBe(empty);
  });

  it('schedule/copyDateColumn: 1 日分の列を別の日へ複製 (L2c)', () => {
    let state = makeState({
      dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
    });
    state = projectReducer(state, {
      type: 'cell/assign', payload: { dateId: 1, periodId: 1, classId: 1, type: 'subject', val: '英語' },
    });
    state = projectReducer(state, {
      type: 'cell/assign', payload: { dateId: 1, periodId: 1, classId: 2, type: 'subject', val: '数学' },
    });
    const next = projectReducer(state, {
      type: 'schedule/copyDateColumn', payload: { sourceDateId: 1, targetDateId: 2 },
    });
    expect(next.project.tabs[0].schedule[makeKey(2, 1, 1)]).toEqual({ subject: '英語', teacher: '' });
    expect(next.project.tabs[0].schedule[makeKey(2, 1, 2)]).toEqual({ subject: '数学', teacher: '' });
  });

  it('schedule/copyDateColumn: 複製元が空のセルは複製先も空にし、ロック済み複製先は温存 (L2c)', () => {
    const state = makeState({
      dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          // 複製元 12/25: ３S のみ空
          [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中' },
          // 複製先 12/26: ３S は既存割当 (上書きで消える)、３A はロック済み
          [makeKey(2, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(2, 1, 2)]: { subject: '英語', teacher: '堀上', locked: true },
        },
      }],
    });
    const next = projectReducer(state, {
      type: 'schedule/copyDateColumn', payload: { sourceDateId: 1, targetDateId: 2 },
    });
    // 複製元が空 → 複製先も空 (削除)
    expect(next.project.tabs[0].schedule[makeKey(2, 1, 1)]).toBeUndefined();
    // ロック済み複製先は温存
    expect(next.project.tabs[0].schedule[makeKey(2, 1, 2)]).toEqual({ subject: '英語', teacher: '堀上', locked: true });
  });

  it('schedule/copyDateColumn: 同一日・不明な日は no-op (L2c)', () => {
    const state = makeState();
    expect(projectReducer(state, {
      type: 'schedule/copyDateColumn', payload: { sourceDateId: 1, targetDateId: 1 },
    })).toBe(state);
    expect(projectReducer(state, {
      type: 'schedule/copyDateColumn', payload: { sourceDateId: 1, targetDateId: 99 },
    })).toBe(state);
  });

  it('cell/toggleLock: locked フラグを反転', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'cell/assign',
      payload: { dateId: 1, periodId: 1, classId: 1, type: 'subject', val: '英語' },
    });
    state = projectReducer(state, {
      type: 'cell/toggleLock',
      payload: { dateId: 1, periodId: 1, classId: 1 },
    });
    expect(state.project.tabs[0].schedule[makeKey(1, 1, 1)].locked).toBe(true);
  });

  // 旧 cell/setNg case は D4g で削除。handleSetNg は useProject.js の composer
  // 側で teacher/toggleNg のラッパとして提供しているため、テストは
  // useProject.test.jsx の "handleSetNg" describe ブロックに移動。
});

describe('projectReducer — schedule 一括操作', () => {
  it('schedule/bulkAction: 該当しないなら no-op', () => {
    const state = makeState();
    expect(projectReducer(state, {
      type: 'schedule/bulkAction',
      payload: { action: 'lock-all', type: 'date', val: '存在しない' },
    })).toBe(state);
  });

  it('schedule/clearUnlocked: locked のみ残る', () => {
    const state = makeState({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中', locked: true },
        },
      }],
    });
    const next = projectReducer(state, { type: 'schedule/clearUnlocked' });
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 1)]).toBeUndefined();
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 2)]).toEqual({
      subject: '数学', teacher: '田中', locked: true,
    });
  });

  it('schedule/renameHeader: 同名 / 空名は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, {
      type: 'schedule/renameHeader',
      payload: { type: 'date', oldVal: '12/25(木)', newVal: '12/25(木)' },
    })).toBe(state);
  });

  it('schedule/renameHeader (date): entity の label が書き換わり id は不変', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'schedule/renameHeader',
      payload: { type: 'date', oldVal: '12/25(木)', newVal: '12/25(祝)' },
    });
    // v4: date は project レベルで rename される
    const dateEnt = next.project.dates[0];
    expect(dateEnt).toEqual({ id: 1, label: '12/25(祝)' });
  });

  it('schedule/renameHeader (class): entity の label が書き換わる', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'schedule/renameHeader',
      payload: { type: 'class', oldVal: '３S', newVal: '３年S' },
    });
    expect(next.project.tabs[0].config.classes[0]).toEqual({ id: 1, label: '３年S' });
    expect(next.project.tabs[0].config.classes[1]).toEqual({ id: 2, label: '３A' });
  });

  it('schedule/renameHeader (date/period): NG slot キーも rename', () => {
    const state = makeState({
      teachers: [
        {
          name: '堀上',
          subjects: ['英語'],
          ngSlots: [makeNgKey('12/25(木)', '1限'), makeNgKey('12/26(金)', '2限')],
          ngClasses: [], priorityClasses: [],
        },
      ],
    });
    const next = projectReducer(state, {
      type: 'schedule/renameHeader',
      payload: { type: 'date', oldVal: '12/25(木)', newVal: '12/25(祝)' },
    });
    expect(next.project.teachers[0].ngSlots).toContain(makeNgKey('12/25(祝)', '1限'));
    expect(next.project.teachers[0].ngSlots).not.toContain(makeNgKey('12/25(木)', '1限'));
    expect(next.project.teachers[0].ngSlots).toContain(makeNgKey('12/26(金)', '2限'));
  });

  it('schedule/bulkAction (lock-all by class): 該当クラスの全コマが locked', () => {
    const state = makeState({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }, { id: 2, label: '12/26(金)' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(2, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中' },
        },
      }],
    });
    const next = projectReducer(state, {
      type: 'schedule/bulkAction',
      payload: { action: 'lock-all', type: 'class', val: '３S' },
    });
    // ３S (classId=1) の全セルが locked
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 1)].locked).toBe(true);
    expect(next.project.tabs[0].schedule[makeKey(2, 1, 1)].locked).toBe(true);
    // ３A は触らない
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 2)].locked).toBeFalsy();
  });

  it('schedule/bulkAction (clear-all by date): 該当日付のセルが消える (locked は残る)', () => {
    const state = makeState({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }, { id: 2, label: '12/26(金)' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(2, 1, 1)]: { subject: '英語', teacher: '堀上', locked: true },
        },
      }],
    });
    const next = projectReducer(state, {
      type: 'schedule/bulkAction',
      payload: { action: 'clear-all', type: 'date', val: '12/26(金)' },
    });
    // 12/26 の locked セルは残る
    expect(next.project.tabs[0].schedule[makeKey(2, 1, 1)]).toMatchObject({ locked: true });
    // 12/25 の non-locked は変わらず残る (12/26 削除対象外)
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 1)]).toMatchObject({ subject: '英語' });
  });
});

describe('projectReducer — 合同グループ', () => {
  it('combinedGroup/add: id を自動採番', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'combinedGroup/add',
      payload: { group: { subject: '英語', classes: ['３S', '３A'], dates: null } },
    });
    expect(state.project.combinedGroups[0].id).toBe(1);
    state = projectReducer(state, {
      type: 'combinedGroup/add',
      payload: { group: { subject: '数学', classes: ['３S', '３A'], dates: null } },
    });
    expect(state.project.combinedGroups[1].id).toBe(2);
  });

  it('combinedGroup/update: id 一致のみ更新', () => {
    const state = makeState({
      combinedGroups: [
        { id: 1, subject: '英語', classes: ['３S', '３A'], dates: null },
        { id: 2, subject: '数学', classes: ['３S', '３A'], dates: null },
      ],
    });
    const next = projectReducer(state, {
      type: 'combinedGroup/update',
      payload: { id: 1, updates: { classes: ['３S', '３A', '３B'] } },
    });
    expect(next.project.combinedGroups[0].classes).toEqual(['３S', '３A', '３B']);
    expect(next.project.combinedGroups[1].classes).toEqual(['３S', '３A']);
  });

  it('combinedGroup/remove: id 一致を削除', () => {
    const state = makeState({
      combinedGroups: [
        { id: 1, subject: '英語', classes: ['３S', '３A'], dates: null },
        { id: 2, subject: '数学', classes: ['３S', '３A'], dates: null },
      ],
    });
    const next = projectReducer(state, {
      type: 'combinedGroup/remove',
      payload: { id: 1 },
    });
    expect(next.project.combinedGroups).toHaveLength(1);
    expect(next.project.combinedGroups[0].id).toBe(2);
  });
});

describe('projectReducer — project 全体操作', () => {
  it('project/updateName: name を更新', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'project/updateName',
      payload: { name: '新プロジェクト' },
    });
    expect(next.project.name).toBe('新プロジェクト');
  });

  it('project/replace: project を丸ごと差し替え + history に積む', () => {
    const state = makeState();
    const newProj = makeProject({ name: 'replaced' });
    const next = projectReducer(state, {
      type: 'project/replace',
      payload: { project: newProj },
    });
    expect(next.project.name).toBe('replaced');
    expect(next.history).toHaveLength(2);
  });

  it('project/setGenerationParams: 渡したキーのみ更新する', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'project/setGenerationParams',
      payload: { numPatterns: 5 },
    });
    expect(next.project.numPatterns).toBe(5);
    // 未指定のキーは付与されない
    expect(next.project.maxDailyHours).toBeUndefined();
    expect(next.project.maxIterations).toBeUndefined();
    // history に積まれる
    expect(next.history).toHaveLength(2);
  });

  it('project/setGenerationParams: 複数キーを同時更新する', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'project/setGenerationParams',
      payload: { numPatterns: 2, maxDailyHours: 8, maxIterations: 100000, maxConsecutivePeriods: 3 },
    });
    expect(next.project.numPatterns).toBe(2);
    expect(next.project.maxDailyHours).toBe(8);
    expect(next.project.maxIterations).toBe(100000);
    expect(next.project.maxConsecutivePeriods).toBe(3);
  });

  it('project/setGenerationParams: maxConsecutivePeriods は 0 (制限なし) を許容', () => {
    const state = makeState({ maxConsecutivePeriods: 3 });
    const next = projectReducer(state, {
      type: 'project/setGenerationParams',
      payload: { maxConsecutivePeriods: 0 },
    });
    expect(next.project.maxConsecutivePeriods).toBe(0);
  });

  it('teacher/setLimit: maxDailyHours / maxTotalHours を設定できる (L3a/L3b)', () => {
    const state = makeState();
    let next = projectReducer(state, {
      type: 'teacher/setLimit', payload: { idx: 0, key: 'maxDailyHours', value: 2 },
    });
    expect(next.project.teachers[0].maxDailyHours).toBe(2);
    next = projectReducer(next, {
      type: 'teacher/setLimit', payload: { idx: 0, key: 'maxTotalHours', value: '8' },
    });
    expect(next.project.teachers[0].maxTotalHours).toBe(8);
    // N3a: 連続コマ上限も同じ action で設定できる
    next = projectReducer(next, {
      type: 'teacher/setLimit', payload: { idx: 0, key: 'maxConsecutivePeriods', value: 3 },
    });
    expect(next.project.teachers[0].maxConsecutivePeriods).toBe(3);
  });

  it('teacher/setLimit: 0 以下・非数はフィールドを落とす (未設定に戻す)', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'teacher/setLimit', payload: { idx: 0, key: 'maxDailyHours', value: 2 },
    });
    const next = projectReducer(state, {
      type: 'teacher/setLimit', payload: { idx: 0, key: 'maxDailyHours', value: '' },
    });
    expect('maxDailyHours' in next.project.teachers[0]).toBe(false);
  });

  it('teacher/setLimit: 同値は no-op (同一参照)', () => {
    let state = makeState();
    state = projectReducer(state, {
      type: 'teacher/setLimit', payload: { idx: 0, key: 'maxDailyHours', value: 2 },
    });
    expect(projectReducer(state, {
      type: 'teacher/setLimit', payload: { idx: 0, key: 'maxDailyHours', value: 2 },
    })).toBe(state);
    // 未設定 → 未設定も no-op
    expect(projectReducer(state, {
      type: 'teacher/setLimit', payload: { idx: 0, key: 'maxTotalHours', value: 0 },
    })).toBe(state);
  });

  it('teacher/setLimit: 不正な key / idx は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, {
      type: 'teacher/setLimit', payload: { idx: 0, key: 'name', value: 'X' },
    })).toBe(state);
    expect(projectReducer(state, {
      type: 'teacher/setLimit', payload: { idx: 99, key: 'maxDailyHours', value: 2 },
    })).toBe(state);
  });

  it('project/setGenerationParams: generationSeed を更新でき、0 (毎回ランダム) に戻せる (L1e)', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'project/setGenerationParams',
      payload: { generationSeed: 12345 },
    });
    expect(next.project.generationSeed).toBe(12345);
    const reset = projectReducer(next, {
      type: 'project/setGenerationParams',
      payload: { generationSeed: 0 },
    });
    expect(reset.project.generationSeed).toBe(0);
  });

  it('project/setGenerationParams: 範囲外の値は clamp される', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'project/setGenerationParams',
      payload: { numPatterns: 99, maxDailyHours: 0, maxIterations: 10 },
    });
    expect(next.project.numPatterns).toBe(6); // max 6
    expect(next.project.maxDailyHours).toBe(1); // min 1
    expect(next.project.maxIterations).toBe(50000); // min 50000
  });

  it('project/setGenerationParams: 値が変わらなければ no-op (同一参照)', () => {
    const state = makeState({ numPatterns: 3 });
    const next = projectReducer(state, {
      type: 'project/setGenerationParams',
      payload: { numPatterns: 3 },
    });
    expect(next).toBe(state);
  });

  it('project/setGenerationParams: 空 payload は no-op', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'project/setGenerationParams',
      payload: {},
    });
    expect(next).toBe(state);
  });

  it('project/reset: project を差し替え、history を初期化、loadError をクリア', () => {
    // 履歴を伸ばしてから reset すると history が 1 件に戻る
    let state = makeState();
    state = projectReducer(state, { type: 'project/updateName', payload: { name: 'a' } });
    state = projectReducer(state, { type: 'project/updateName', payload: { name: 'b' } });
    state = { ...state, loadError: '読込失敗' };
    expect(state.history).toHaveLength(3);

    const freshProj = makeProject({ name: 'reset 後' });
    const next = projectReducer(state, { type: 'project/reset', payload: freshProj });

    expect(next.project).toBe(freshProj);
    expect(next.history).toEqual([freshProj]);
    expect(next.historyIndex).toBe(0);
    expect(next.loadError).toBeNull();
  });

  it('project/reset 後は undo で reset 前の状態に戻れない', () => {
    let state = makeState();
    state = projectReducer(state, { type: 'project/updateName', payload: { name: 'before reset' } });
    const freshProj = makeProject({ name: '後' });
    state = projectReducer(state, { type: 'project/reset', payload: freshProj });
    const afterUndo = projectReducer(state, { type: 'history/undo' });
    expect(afterUndo).toBe(state); // historyIndex 0 で undo は no-op
    expect(afterUndo.project.name).toBe('後');
  });
});

describe('projectReducer — スナップショット (E1c)', () => {
  const withSchedule = () => makeState({
    tabs: [{
      id: 1,
      name: 'メイン',
      config: {
        dates: [{ id: 1, label: '12/25(木)' }],
        periods: [{ id: 1, label: '1限' }],
        classes: [{ id: 1, label: '３S' }],
        subjectCounts: { '英語': 1 },
      },
      schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } },
    }],
  });

  it('snapshot/save: 現在のタブ schedule を捕捉し id / tabId / createdAt を付与', () => {
    const state = withSchedule();
    const next = projectReducer(state, {
      type: 'snapshot/save',
      payload: { name: '案A', createdAt: '2026-06-29T00:00:00.000Z' },
    });
    expect(next.project.snapshots).toHaveLength(1);
    const snap = next.project.snapshots[0];
    expect(snap).toMatchObject({ id: 1, name: '案A', tabId: 1, createdAt: '2026-06-29T00:00:00.000Z' });
    expect(snap.schedule[makeKey(1, 1, 1)]).toEqual({ subject: '英語', teacher: '堀上' });
  });

  it('snapshot/save: schedule は deep copy される (元の変更に追随しない)', () => {
    const state = withSchedule();
    const next = projectReducer(state, { type: 'snapshot/save', payload: { name: 'A' } });
    // 元タブを書き換えても snapshot は不変
    const after = projectReducer(next, {
      type: 'cell/clear', payload: { dateId: 1, periodId: 1, classId: 1 },
    });
    expect(after.project.tabs[0].schedule[makeKey(1, 1, 1)]).toBeUndefined();
    expect(after.project.snapshots[0].schedule[makeKey(1, 1, 1)]).toEqual({ subject: '英語', teacher: '堀上' });
  });

  it('snapshot/save: 空名は no-op', () => {
    const state = withSchedule();
    const next = projectReducer(state, { type: 'snapshot/save', payload: { name: '' } });
    expect(next).toBe(state);
  });

  it('snapshot/save: id は max+1 で採番', () => {
    let state = withSchedule();
    state = projectReducer(state, { type: 'snapshot/save', payload: { name: 'A' } });
    state = projectReducer(state, { type: 'snapshot/save', payload: { name: 'B' } });
    expect(state.project.snapshots.map(s => s.id)).toEqual([1, 2]);
  });

  it('snapshot/apply: schedule を復元し activeTabId を記録元タブに', () => {
    let state = withSchedule();
    state = projectReducer(state, { type: 'snapshot/save', payload: { name: 'A' } });
    // 現タブを別内容に変更
    state = projectReducer(state, {
      type: 'cell/assign', payload: { dateId: 1, periodId: 1, classId: 1, type: 'subject', val: '数学' },
    });
    const applied = projectReducer(state, { type: 'snapshot/apply', payload: { id: 1 } });
    expect(applied.project.tabs[0].schedule[makeKey(1, 1, 1)]).toEqual({ subject: '英語', teacher: '堀上' });
    expect(applied.project.activeTabId).toBe(1);
  });

  it('snapshot/apply: 記録元タブが削除済みなら no-op (undo/redo race の防御)', () => {
    // tabId 99 (存在しないタブ) を参照する snapshot を手で仕込む
    let state = withSchedule();
    state = {
      ...state,
      project: {
        ...state.project,
        snapshots: [{ id: 1, name: 'orphan', tabId: 99, createdAt: null, schedule: { [makeKey(1, 1, 1)]: { subject: '数学', teacher: '田中' } } }],
      },
    };
    const applied = projectReducer(state, { type: 'snapshot/apply', payload: { id: 1 } });
    expect(applied).toBe(state); // 記録元タブが無いので何もしない
  });

  it('snapshot/apply: 存在しない id は no-op', () => {
    let state = withSchedule();
    state = projectReducer(state, { type: 'snapshot/save', payload: { name: 'A' } });
    const applied = projectReducer(state, { type: 'snapshot/apply', payload: { id: 999 } });
    expect(applied).toBe(state);
  });

  it('snapshot/rename: 名前を変更', () => {
    let state = withSchedule();
    state = projectReducer(state, { type: 'snapshot/save', payload: { name: 'A' } });
    const renamed = projectReducer(state, { type: 'snapshot/rename', payload: { id: 1, name: 'A改' } });
    expect(renamed.project.snapshots[0].name).toBe('A改');
  });

  it('snapshot/remove: 削除する。存在しない id は no-op', () => {
    let state = withSchedule();
    state = projectReducer(state, { type: 'snapshot/save', payload: { name: 'A' } });
    const removed = projectReducer(state, { type: 'snapshot/remove', payload: { id: 1 } });
    expect(removed.project.snapshots).toHaveLength(0);
    const noop = projectReducer(removed, { type: 'snapshot/remove', payload: { id: 1 } });
    expect(noop).toBe(removed);
  });

  it('tab/delete: 削除タブのスナップショットも掃除される', () => {
    let state = makeState({
      activeTabId: 1,
      tabs: [
        { id: 1, name: 'T1', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} },
        { id: 2, name: 'T2', config: { dates: [], periods: [], classes: [], subjectCounts: {} }, schedule: {} },
      ],
    });
    state = projectReducer(state, { type: 'snapshot/save', payload: { name: 'T1 のA' } }); // tabId 1
    state = projectReducer(state, { type: 'tab/switch', payload: { id: 2 } });
    state = projectReducer(state, { type: 'snapshot/save', payload: { name: 'T2 のA' } }); // tabId 2
    expect(state.project.snapshots).toHaveLength(2);
    const afterDelete = projectReducer(state, { type: 'tab/delete', payload: { id: 1 } });
    expect(afterDelete.project.snapshots).toHaveLength(1);
    expect(afterDelete.project.snapshots[0].tabId).toBe(2);
  });
});

describe('projectReducer — cascade cleanup', () => {
  // teacher/remove で externalCounts も掃除される (H-2)
  it('teacher/remove: 削除された講師の externalCounts キーが drop される', () => {
    const state = makeState({
      externalCounts: {
        [makeExternalKey('12/25(木)', '堀上')]: 3,
        [makeExternalKey('12/26(金)', '堀上')]: 2,
        [makeExternalKey('12/25(木)', '田中')]: 1,
      },
    });
    const next = projectReducer(state, { type: 'teacher/remove', payload: { idx: 0 } });
    // 堀上 のキーは drop、田中 のキーは残存
    expect(next.project.externalCounts[makeExternalKey('12/25(木)', '堀上')]).toBeUndefined();
    expect(next.project.externalCounts[makeExternalKey('12/26(金)', '堀上')]).toBeUndefined();
    expect(next.project.externalCounts[makeExternalKey('12/25(木)', '田中')]).toBe(1);
  });

  it('teacher/remove: 削除された講師の externalSessions も drop される (孤児化防止)', () => {
    const state = makeState({
      externalSessions: [
        { id: 1, date: '7/29(水)', teacherName: '堀上', label: '', memo: '', startTime: '12:25', endTime: '13:35' },
        { id: 2, date: '7/30(木)', teacherName: '堀上', label: '', memo: '' },
        { id: 3, date: '7/29(水)', teacherName: '田中', label: '', memo: '' },
      ],
    });
    const next = projectReducer(state, { type: 'teacher/remove', payload: { idx: 0 } });
    expect(next.project.externalSessions).toEqual([
      { id: 3, date: '7/29(水)', teacherName: '田中', label: '', memo: '' },
    ]);
  });

  it('teacher/rename: externalSessions の teacherName も追従する', () => {
    const state = makeState({
      externalSessions: [
        { id: 1, date: '7/29(水)', teacherName: '堀上', label: '', memo: '', startTime: '12:25', endTime: '13:35' },
        { id: 2, date: '7/29(水)', teacherName: '田中', label: '', memo: '' },
      ],
    });
    const next = projectReducer(state, {
      type: 'teacher/rename',
      payload: { idx: 0, newName: '堀上(新)' },
    });
    expect(next.project.externalSessions[0].teacherName).toBe('堀上(新)');
    expect(next.project.externalSessions[1].teacherName).toBe('田中');
  });

  it('teacher/import (replace): 新講師に含まれない externalSessions と externalCounts は drop', () => {
    const state = makeState({
      externalCounts: {
        [makeExternalKey('12/25(木)', '堀上')]: 3,
        [makeExternalKey('12/25(木)', '田中')]: 1,
      },
      externalSessions: [
        { id: 1, date: '7/29(水)', teacherName: '堀上', label: '', memo: '' },
        { id: 2, date: '7/29(水)', teacherName: '田中', label: '', memo: '' },
      ],
    });
    // replace で '堀上' だけ残し '田中' を消す
    const next = projectReducer(state, {
      type: 'teacher/import',
      payload: {
        teachers: [{ name: '堀上', subjects: ['英語'] }],
        mode: 'replace',
      },
    });
    expect(next.project.teachers.map(t => t.name)).toEqual(['堀上']);
    // 田中 のセッション・カウントは drop
    expect(next.project.externalSessions).toHaveLength(1);
    expect(next.project.externalSessions[0].teacherName).toBe('堀上');
    expect(next.project.externalCounts[makeExternalKey('12/25(木)', '堀上')]).toBe(3);
    expect(next.project.externalCounts[makeExternalKey('12/25(木)', '田中')]).toBeUndefined();
  });

  // schedule/renameHeader で externalCounts キーが書き換えられる (H-3)
  it('schedule/renameHeader (date): externalCounts キーも書き換えられる', () => {
    const state = makeState({
      externalCounts: {
        [makeExternalKey('12/25(木)', '堀上')]: 3,
        [makeExternalKey('12/26(金)', '田中')]: 2,
      },
    });
    const next = projectReducer(state, {
      type: 'schedule/renameHeader',
      payload: { type: 'date', oldVal: '12/25(木)', newVal: '12/25(祝)' },
    });
    expect(next.project.externalCounts[makeExternalKey('12/25(祝)', '堀上')]).toBe(3);
    expect(next.project.externalCounts[makeExternalKey('12/25(木)', '堀上')]).toBeUndefined();
    // 他の日付のキーは不変
    expect(next.project.externalCounts[makeExternalKey('12/26(金)', '田中')]).toBe(2);
  });

  // combinedGroups の cascade cleanup (H-1)
  it('config/setList (classes 削除): combinedGroups から消えたクラスが drop', () => {
    const state = makeState({
      combinedGroups: [
        { id: 1, subject: '英語', classes: ['３S', '３A', '３B'], dates: null },
        { id: 2, subject: '数学', classes: ['３S', '３A'], dates: null },
      ],
    });
    // ３A を削除
    const next = projectReducer(state, {
      type: 'config/setList',
      payload: { key: 'classes', value: '３S, ３B' },
    });
    const groups = next.project.combinedGroups;
    // group 1: ３S, ３B が残る (2 クラス → group 維持)
    expect(groups.find(g => g.id === 1).classes).toEqual(['３S', '３B']);
    // group 2: ３A が消えて ３S だけ → 1 クラスでは合同にならないので drop
    expect(groups.find(g => g.id === 2)).toBeUndefined();
  });

  it('schedule/clearUnlocked: 使わない日・時限に温存された非表示セルは消さない', () => {
    const state = makeState({
      dates: [{ id: 1, label: '12/25(木)' }, { id: 2, label: '12/26(金)' }],
      periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
      tabs: [{
        id: 1,
        name: 'メイン',
        config: {
          classes: [{ id: 1, label: '３S' }],
          subjectCounts: { '英語': 1 },
          activeDateIds: [1],   // 12/26 は使わない (セルは温存)
          activePeriodIds: [1], // 2限 も使わない
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },                 // 可視 → 消える
          [makeKey(1, 1, 1).replace('d1', 'd1')]: { subject: '英語', teacher: '堀上' },
          [makeKey(2, 1, 1)]: { subject: '英語', teacher: '田中' },                 // 非表示日 → 残る
          [makeKey(1, 2, 1)]: { subject: '数学', teacher: '田中' },                 // 非表示時限 → 残る
          [makeKey(2, 2, 1)]: { subject: '数学', teacher: '堀上', locked: true },   // locked → 残る
        },
      }],
    });
    const next = projectReducer(state, { type: 'schedule/clearUnlocked' });
    const sch = next.project.tabs[0].schedule;
    expect(sch[makeKey(1, 1, 1)]).toBeUndefined();
    expect(sch[makeKey(2, 1, 1)]).toEqual({ subject: '英語', teacher: '田中' });
    expect(sch[makeKey(1, 2, 1)]).toEqual({ subject: '数学', teacher: '田中' });
    expect(sch[makeKey(2, 2, 1)]).toEqual({ subject: '数学', teacher: '堀上', locked: true });
  });

  it('dates/removeFromPool: ngSlots / externalCounts / externalSessions も cascade で消える', () => {
    const state = makeState({
      dates: [{ id: 1, label: '12/25(木)' }, { id: 2, label: '12/26(金)' }],
      teachers: [
        { name: '堀上', subjects: ['英語'], ngSlots: [makeNgKey('12/25(木)', '1限'), makeNgKey('12/26(金)', '1限')], ngClasses: [], priorityClasses: [] },
      ],
      externalCounts: {
        [makeExternalKey('12/25(木)', '堀上')]: 2,
        [makeExternalKey('12/26(金)', '堀上')]: 1,
      },
      externalSessions: [
        { teacherName: '堀上', date: '12/25(木)', startTime: '13:00', endTime: '15:00' },
        { teacherName: '堀上', date: '12/26(金)', startTime: '13:00', endTime: '15:00' },
      ],
    });
    const next = projectReducer(state, { type: 'dates/removeFromPool', payload: { dateId: 1 } });
    const p = next.project;
    expect(p.teachers[0].ngSlots).toEqual([makeNgKey('12/26(金)', '1限')]);
    expect(p.externalCounts[makeExternalKey('12/25(木)', '堀上')]).toBeUndefined();
    expect(p.externalCounts[makeExternalKey('12/26(金)', '堀上')]).toBe(1);
    expect(p.externalSessions).toHaveLength(1);
    expect(p.externalSessions[0].date).toBe('12/26(金)');
  });

  it('config/setList(periods): プールから消えた時限の NG キーも cascade で消える (最長一致)', () => {
    const state = makeState({
      periods: [{ id: 1, label: '1限' }, { id: 2, label: '番外-1限' }],
      teachers: [{
        name: '堀上',
        subjects: ['英語'],
        ngSlots: [makeNgKey('12/25(木)', '1限'), makeNgKey('12/25(木)', '番外-1限')],
        ngClasses: [],
        priorityClasses: [],
      }],
    });
    // 「1限」だけ削除。「番外-1限」は suffix に "-1限" を含むが最長一致で保護される
    const next = projectReducer(state, {
      type: 'config/setList',
      payload: { key: 'periods', value: '番外-1限' },
    });
    expect(next.project.teachers[0].ngSlots).toEqual([makeNgKey('12/25(木)', '番外-1限')]);
  });

  it('dates/removeFromPool: prefix 関係にある別日付ラベルの NG は巻き添えにしない (最長一致)', () => {
    const state = makeState({
      dates: [{ id: 1, label: '8/1' }, { id: 2, label: '8/1-補講' }],
      teachers: [{
        name: '堀上',
        subjects: ['英語'],
        ngSlots: [makeNgKey('8/1', '1限'), makeNgKey('8/1-補講', '1限')],
        ngClasses: [],
        priorityClasses: [],
      }],
      externalCounts: {
        [makeExternalKey('8/1', '堀上')]: 1,
        [makeExternalKey('8/1-補講', '堀上')]: 2,
      },
    });
    const next = projectReducer(state, { type: 'dates/removeFromPool', payload: { dateId: 1 } });
    expect(next.project.teachers[0].ngSlots).toEqual([makeNgKey('8/1-補講', '1限')]);
    expect(next.project.externalCounts[makeExternalKey('8/1-補講', '堀上')]).toBe(2);
    expect(next.project.externalCounts[makeExternalKey('8/1', '堀上')]).toBeUndefined();
  });

  it('schedule/bulkAction: 日付軸の一括操作は使わない時限のセルに触れない', () => {
    const state = makeState({
      dates: [{ id: 1, label: '12/25(木)' }],
      periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
      tabs: [{
        id: 1,
        name: 'メイン',
        config: {
          classes: [{ id: 1, label: '３S' }],
          subjectCounts: { '英語': 1 },
          activePeriodIds: [1], // 2限 は使わない
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' }, // 可視
          [makeKey(1, 2, 1)]: { subject: '数学', teacher: '田中' }, // 非表示時限に温存
        },
      }],
    });
    const next = projectReducer(state, {
      type: 'schedule/bulkAction',
      payload: { action: 'clear-all', type: 'date', val: '12/25(木)' },
    });
    const sch = next.project.tabs[0].schedule;
    expect(sch[makeKey(1, 1, 1)]).toBeUndefined(); // 可視セルは消える
    expect(sch[makeKey(1, 2, 1)]).toEqual({ subject: '数学', teacher: '田中' }); // 温存
  });

  it('tab/switch: 存在しないタブ ID は no-op', () => {
    const state = makeState();
    const next = projectReducer(state, { type: 'tab/switch', payload: { id: 99 } });
    expect(next).toBe(state);
  });

  it('tab/delete: 非アクティブタブの削除では作業中のタブを維持する', () => {
    const state = makeState({
      activeTabId: 2,
      tabs: [
        { id: 1, name: 'A', config: { classes: [{ id: 1, label: 'X' }], subjectCounts: {} }, schedule: {} },
        { id: 2, name: 'B', config: { classes: [{ id: 1, label: 'Y' }], subjectCounts: {} }, schedule: {} },
        { id: 3, name: 'C', config: { classes: [{ id: 1, label: 'Z' }], subjectCounts: {} }, schedule: {} },
      ],
    });
    const next = projectReducer(state, { type: 'tab/delete', payload: { id: 3 } });
    expect(next.project.activeTabId).toBe(2);
  });

  it('subject/reorder: 範囲外 idx は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'subject/reorder', payload: { fromIdx: -1, toIdx: 0 } })).toBe(state);
    expect(projectReducer(state, { type: 'subject/reorder', payload: { fromIdx: 0, toIdx: 5 } })).toBe(state);
  });

  it('schedule/applyPattern: tabId 指定でそのタブへ適用し active も切り替える', () => {
    const state = makeState({
      activeTabId: 2,
      tabs: [
        {
          id: 1,
          name: '中３',
          config: {
            dates: [{ id: 1, label: '12/25(木)' }],
            periods: [{ id: 1, label: '1限' }],
            classes: [{ id: 1, label: '３S' }],
            subjectCounts: { '英語': 1 },
          },
          schedule: {},
        },
        {
          id: 2,
          name: '中１・２',
          config: {
            classes: [{ id: 1, label: '１S' }],
            subjectCounts: { '英語': 1 },
          },
          schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '田中' } },
        },
      ],
    });
    const pat = { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } };
    // アクティブは中１・２だが、生成元 (tabId=1) へ適用されること
    const next = projectReducer(state, {
      type: 'schedule/applyPattern',
      payload: { pat, tabId: 1 },
    });
    expect(next.project.tabs.find(t => t.id === 1).schedule[makeKey(1, 1, 1)].teacher).toBe('堀上');
    // 中１・２のスケジュールは無傷
    expect(next.project.tabs.find(t => t.id === 2).schedule[makeKey(1, 1, 1)].teacher).toBe('田中');
    // 適用先タブへ切り替わる (snapshot/apply と同じ挙動)
    expect(next.project.activeTabId).toBe(1);
  });

  it('schedule/applyPattern: tabId 省略時は従来どおりアクティブタブへ適用', () => {
    const state = makeState();
    const pat = { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } };
    const next = projectReducer(state, { type: 'schedule/applyPattern', payload: { pat } });
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 1)].teacher).toBe('堀上');
  });

  it('schedule/applyPattern: 生成後に削除されたタブ (存在しない tabId) は no-op', () => {
    const state = makeState();
    const pat = { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } };
    const next = projectReducer(state, { type: 'schedule/applyPattern', payload: { pat, tabId: 99 } });
    expect(next).toBe(state);
  });

  it('config/setList (classes): 他タブのクラスを参照する combinedGroups は巻き添えにしない', () => {
    const state = makeState({
      tabs: [
        {
          id: 1,
          name: '中３',
          config: {
            dates: [{ id: 1, label: '12/25(木)' }],
            periods: [{ id: 1, label: '1限' }],
            classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
            subjectCounts: { '英語': 1 },
          },
          schedule: {},
        },
        {
          id: 2,
          name: '中１・２',
          config: {
            classes: [{ id: 1, label: '１S' }, { id: 2, label: '１AB' }],
            subjectCounts: { '英語': 1 },
          },
          schedule: {},
        },
      ],
      combinedGroups: [
        // 他タブ (中１・２) のクラスのみを参照するグループ
        { id: 1, subject: '英語', classes: ['１S', '１AB'], dates: null },
        // アクティブタブのクラスを参照するグループ (従来の cleanup 対象)
        { id: 2, subject: '英語', classes: ['３S', '３A'], dates: null },
      ],
    });
    // アクティブタブ (中３) のクラス欄から ３A を削除
    const next = projectReducer(state, {
      type: 'config/setList',
      payload: { key: 'classes', value: '３S, ３B' },
    });
    const groups = next.project.combinedGroups;
    // 他タブのグループは無傷で残る
    expect(groups.find(g => g.id === 1)).toEqual(
      { id: 1, subject: '英語', classes: ['１S', '１AB'], dates: null },
    );
    // アクティブタブ側は従来どおり ３A が消えて 1 クラス → drop
    expect(groups.find(g => g.id === 2)).toBeUndefined();
  });

  it('config/setList (dates 削除): combinedGroups から消えた日付が drop', () => {
    const state = makeState({
      combinedGroups: [
        { id: 1, subject: '英語', classes: ['３S', '３A'], dates: ['12/25(木)', '12/26(金)'] },
        { id: 2, subject: '数学', classes: ['３S', '３A'], dates: ['12/25(木)'] },
        { id: 3, subject: '国語', classes: ['３S', '３A'], dates: null }, // 全日扱い
      ],
    });
    // 12/26(金) を削除 (元の dates は 12/25(木) のみ)
    const next = projectReducer(state, {
      type: 'config/setList',
      payload: { key: 'dates', value: '12/25(木)' },
    });
    const groups = next.project.combinedGroups;
    // group 1: 12/26 が消えて 12/25 だけ残る
    expect(groups.find(g => g.id === 1).dates).toEqual(['12/25(木)']);
    // group 2: 12/25 のみで該当
    expect(groups.find(g => g.id === 2).dates).toEqual(['12/25(木)']);
    // group 3: dates: null は全日扱いで影響なし
    expect(groups.find(g => g.id === 3).dates).toBeNull();
  });

  it('subject/remove: 削除された科目を持つ combinedGroups が drop', () => {
    const state = makeState({
      combinedGroups: [
        { id: 1, subject: '英語', classes: ['３S', '３A'], dates: null },
        { id: 2, subject: '数学', classes: ['３S', '３A'], dates: null },
      ],
    });
    const next = projectReducer(state, { type: 'subject/remove', payload: { name: '英語' } });
    expect(next.project.combinedGroups).toHaveLength(1);
    expect(next.project.combinedGroups[0].subject).toBe('数学');
  });

  it('schedule/renameHeader (class): combinedGroups[*].classes も rename', () => {
    const state = makeState({
      combinedGroups: [
        { id: 1, subject: '英語', classes: ['３S', '３A'], dates: null },
      ],
    });
    const next = projectReducer(state, {
      type: 'schedule/renameHeader',
      payload: { type: 'class', oldVal: '３S', newVal: '３年S' },
    });
    expect(next.project.combinedGroups[0].classes).toEqual(['３年S', '３A']);
  });

  it('schedule/renameHeader (date): combinedGroups[*].dates も rename', () => {
    const state = makeState({
      combinedGroups: [
        { id: 1, subject: '英語', classes: ['３S', '３A'], dates: ['12/25(木)', '12/26(金)'] },
        { id: 2, subject: '数学', classes: ['３S', '３A'], dates: null },
      ],
    });
    const next = projectReducer(state, {
      type: 'schedule/renameHeader',
      payload: { type: 'date', oldVal: '12/25(木)', newVal: '12/25(祝)' },
    });
    expect(next.project.combinedGroups[0].dates).toEqual(['12/25(祝)', '12/26(金)']);
    expect(next.project.combinedGroups[1].dates).toBeNull(); // 全日扱いは不変
  });
});

describe('projectReducer — reducer guards', () => {
  // M-1: cell/swap で source も locked チェック
  it('cell/swap: source が locked なら no-op', () => {
    const state = makeState({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上', locked: true },
          [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中' },
        },
      }],
    });
    const next = projectReducer(state, {
      type: 'cell/swap',
      payload: {
        sourceKey: makeKey(1, 1, 1),
        targetKey: makeKey(1, 1, 2),
      },
    });
    expect(next).toBe(state);
  });

  // F2e: payload はキーのみ。内容・locked は dispatch 時点の schedule から読む
  it('cell/swap: dispatch 時点の schedule を正とし、キーだけで swap する', () => {
    const state = makeState({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中' },
        },
      }],
    });
    const next = projectReducer(state, {
      type: 'cell/swap',
      payload: { sourceKey: makeKey(1, 1, 1), targetKey: makeKey(1, 1, 2) },
    });
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 1)]).toMatchObject({ subject: '数学', teacher: '田中' });
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 2)]).toMatchObject({ subject: '英語', teacher: '堀上' });
  });

  it('cell/swap: source が空になっていたら no-op (dragstart 後にクリアされた競合窓)', () => {
    const state = makeState({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中' },
        },
      }],
    });
    const next = projectReducer(state, {
      type: 'cell/swap',
      payload: { sourceKey: makeKey(1, 1, 1), targetKey: makeKey(1, 1, 2) },
    });
    expect(next).toBe(state);
  });

  it('cell/swap: source と target が同一キーなら no-op', () => {
    const state = makeState({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }],
          subjectCounts: { '英語': 1 },
        },
        schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } },
      }],
    });
    const next = projectReducer(state, {
      type: 'cell/swap',
      payload: { sourceKey: makeKey(1, 1, 1), targetKey: makeKey(1, 1, 1) },
    });
    expect(next).toBe(state);
  });

  // M-2: config/setList で重複ラベルは dedupe される
  it('config/setList: 重複ラベルは dedupe される', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'config/setList',
      payload: { key: 'classes', value: '３S, ３A, ３S, ３A' },
    });
    const classes = next.project.tabs[0].config.classes;
    expect(classes).toHaveLength(2);
    expect(classes.map(c => c.label)).toEqual(['３S', '３A']);
  });
});

describe('projectReducer — 未知 action', () => {
  it('未知の type は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'unknown/type' })).toBe(state);
  });
});

describe('projectReducer — タブ別「使う日」(activeDateIds) + 日付プール (v4 Y)', () => {
  it('tabDates/setByLabels: 既存ラベルは id 維持、新規はプールへ追加し active に設定', () => {
    // makeState default: project.dates = [{id:1,'12/25(木)'}]
    const state = makeState();
    const next = projectReducer(state, {
      type: 'tabDates/setByLabels',
      payload: { labels: ['12/25(木)', '12/26(金)'] },
    });
    expect(next.project.dates).toEqual([
      { id: 1, label: '12/25(木)' },
      { id: 2, label: '12/26(金)' },
    ]);
    expect(next.project.tabs[0].config.activeDateIds).toEqual([1, 2]);
  });

  it('tabDates/setByLabels: プールから日付は消さない (active だけ縮小)', () => {
    const state = makeState({
      dates: [{ id: 1, label: 'D1' }, { id: 2, label: 'D2' }],
      tabs: [{ id: 1, name: 'a', config: { classes: [], subjectCounts: {}, activeDateIds: [1, 2] }, schedule: {} }],
    });
    const next = projectReducer(state, { type: 'tabDates/setByLabels', payload: { labels: ['D1'] } });
    // プールは 2 件のまま、active は D1 だけ
    expect(next.project.dates).toEqual([{ id: 1, label: 'D1' }, { id: 2, label: 'D2' }]);
    expect(next.project.tabs[0].config.activeDateIds).toEqual([1]);
  });

  it('tabDates/toggle: undefined(全日) から materialize して off にする', () => {
    const state = makeState({
      dates: [{ id: 1, label: 'D1' }, { id: 2, label: 'D2' }],
      tabs: [{ id: 1, name: 'a', config: { classes: [], subjectCounts: {} }, schedule: {} }],
    });
    const next = projectReducer(state, { type: 'tabDates/toggle', payload: { dateId: 1 } });
    expect(next.project.tabs[0].config.activeDateIds).toEqual([2]);
  });

  it('tabDates/setAllActive: true → null (全日)、false → [] (全解除)', () => {
    const state = makeState({
      tabs: [{ id: 1, name: 'a', config: { classes: [], subjectCounts: {}, activeDateIds: [1] }, schedule: {} }],
    });
    const off = projectReducer(state, { type: 'tabDates/setAllActive', payload: { active: false } });
    expect(off.project.tabs[0].config.activeDateIds).toEqual([]);
    const on = projectReducer(off, { type: 'tabDates/setAllActive', payload: { active: true } });
    expect(on.project.tabs[0].config.activeDateIds).toBeNull();
  });

  it('dates/removeFromPool: プールから消し、全タブの activeDateIds と schedule を掃除', () => {
    const state = makeState({
      dates: [{ id: 1, label: 'D1' }, { id: 2, label: 'D2' }],
      periods: [{ id: 1, label: '1限' }],
      tabs: [{
        id: 1, name: 'a',
        config: { classes: [{ id: 1, label: 'S' }], subjectCounts: {}, activeDateIds: [1, 2] },
        schedule: { [makeKey(1, 1, 1)]: { subject: '英' }, [makeKey(2, 1, 1)]: { subject: '数' } },
      }],
    });
    const next = projectReducer(state, { type: 'dates/removeFromPool', payload: { dateId: 1 } });
    expect(next.project.dates).toEqual([{ id: 2, label: 'D2' }]);
    expect(next.project.tabs[0].config.activeDateIds).toEqual([2]);
    // 削除した日付 (d1) のコマは消え、残った日付 (d2) のコマは残る
    expect(next.project.tabs[0].schedule).toEqual({ [makeKey(2, 1, 1)]: { subject: '数' } });
  });
});

describe('projectReducer — タブ別「使う時限」(activePeriodIds、E-3)', () => {
  it('tabPeriods/toggle: undefined(全時限) から materialize して off にする', () => {
    const state = makeState({
      periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
      tabs: [{ id: 1, name: 'a', config: { classes: [], subjectCounts: {} }, schedule: {} }],
    });
    const next = projectReducer(state, { type: 'tabPeriods/toggle', payload: { periodId: 1 } });
    expect(next.project.tabs[0].config.activePeriodIds).toEqual([2]);
  });

  it('tabPeriods/toggle: tabId を明示すれば他タブを操作できる (アクティブタブは無変更)', () => {
    const state = makeState({
      periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
      activeTabId: 1,
      tabs: [
        { id: 1, name: 'a', config: { classes: [], subjectCounts: {} }, schedule: {} },
        { id: 2, name: 'b', config: { classes: [], subjectCounts: {} }, schedule: {} },
      ],
    });
    const next = projectReducer(state, { type: 'tabPeriods/toggle', payload: { periodId: 1, tabId: 2 } });
    expect(next.project.tabs[0].config.activePeriodIds).toBeUndefined();
    expect(next.project.tabs[1].config.activePeriodIds).toEqual([2]);
  });

  it('tabPeriods/setAllActive: true → null (全時限)、false → [] (全解除)', () => {
    const state = makeState({
      tabs: [{ id: 1, name: 'a', config: { classes: [], subjectCounts: {}, activePeriodIds: [1] }, schedule: {} }],
    });
    const off = projectReducer(state, { type: 'tabPeriods/setAllActive', payload: { active: false } });
    expect(off.project.tabs[0].config.activePeriodIds).toEqual([]);
    const on = projectReducer(off, { type: 'tabPeriods/setAllActive', payload: { active: true } });
    expect(on.project.tabs[0].config.activePeriodIds).toBeNull();
  });

  it('config/setList(periods): プールから消えた時限 id は全タブの activePeriodIds からも除去される', () => {
    const state = makeState({
      periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }, { id: 3, label: '3限' }],
      tabs: [
        { id: 1, name: 'a', config: { classes: [], subjectCounts: {}, activePeriodIds: [1, 2] }, schedule: {} },
        { id: 2, name: 'b', config: { classes: [], subjectCounts: {}, activePeriodIds: [2, 3] }, schedule: {} },
      ],
    });
    // テキストエリアから「2限」を消して保存 → 1限・3限だけのプールになる
    const next = projectReducer(state, { type: 'config/setList', payload: { key: 'periods', value: '1限, 3限' } });
    expect(next.project.periods.map(p => p.label)).toEqual(['1限', '3限']);
    expect(next.project.tabs[0].config.activePeriodIds).toEqual([1]);
    expect(next.project.tabs[1].config.activePeriodIds).toEqual([3]);
  });

  it('config/setList(periods): activePeriodIds が undefined(全時限) のタブは無変更', () => {
    const state = makeState({
      periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
      tabs: [{ id: 1, name: 'a', config: { classes: [], subjectCounts: {} }, schedule: {} }],
    });
    const next = projectReducer(state, { type: 'config/setList', payload: { key: 'periods', value: '1限' } });
    expect(next.project.tabs[0].config.activePeriodIds).toBeUndefined();
  });
});


// ─── F5o: 数値入力の負数 clamp ──────────────────────────────────

describe('F5o — 負数入力の clamp', () => {
  it('config/setSubjectCount は負数を 0 に clamp する', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'config/setSubjectCount',
      payload: { subject: '英語', value: '-3' },
    });
    const tab = next.project.tabs.find(t => t.id === next.project.activeTabId);
    expect(tab.config.subjectCounts['英語']).toBe(0);
  });

  it('teacher/setExternalCount は負数を 0 に clamp する', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'teacher/setExternalCount',
      payload: { date: '12/25', teacherName: '堀上', value: '-2' },
    });
    expect(next.project.externalCounts['12/25-堀上']).toBe(0);
  });
});

// ─── H3 / H5 / F2o: ラベル参照の整合 (F2k と同時対応) ─────────────

describe('schedule/renameHeader — 重複ラベルの reject (H3)', () => {
  it('既存の日付ラベルへのリネームは no-op (キー衝突による混線防止)', () => {
    const state = makeState();
    const labels = state.project.dates.map(d => d.label);
    const next = projectReducer(state, {
      type: 'schedule/renameHeader',
      payload: { type: 'date', oldVal: labels[0], newVal: labels[1] },
    });
    expect(next).toBe(state);
  });

  it('既存の時限ラベルへのリネームも no-op', () => {
    const state = makeState();
    const labels = state.project.periods.map(p => p.label);
    const next = projectReducer(state, {
      type: 'schedule/renameHeader',
      payload: { type: 'period', oldVal: labels[0], newVal: labels[1] },
    });
    expect(next).toBe(state);
  });

  it('既存のクラスラベルへのリネームも no-op', () => {
    const state = makeState();
    const tab = state.project.tabs.find(t => t.id === state.project.activeTabId);
    const labels = tab.config.classes.map(c => c.label);
    const next = projectReducer(state, {
      type: 'schedule/renameHeader',
      payload: { type: 'class', oldVal: labels[0], newVal: labels[1] },
    });
    expect(next).toBe(state);
  });
});

describe('クラスラベルと teacher.ngClasses / priorityClasses の追従 (H5)', () => {
  it('クラスの rename に priorityClasses / ngClasses が追従する', () => {
    const state = makeState();
    const tab = state.project.tabs.find(t => t.id === state.project.activeTabId);
    const oldLabel = tab.config.classes[0].label;
    state.project.teachers = [
      { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [oldLabel], priorityClasses: [] },
      { name: '田中', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [oldLabel] },
    ];
    const next = projectReducer(state, {
      type: 'schedule/renameHeader',
      payload: { type: 'class', oldVal: oldLabel, newVal: '新クラス' },
    });
    expect(next.project.teachers[0].ngClasses).toEqual(['新クラス']);
    expect(next.project.teachers[1].priorityClasses).toEqual(['新クラス']);
  });

  it('config/setList でクラスを削除すると参照も掃除される (他タブの同名は温存)', () => {
    const state = makeState();
    const tab = state.project.tabs.find(t => t.id === state.project.activeTabId);
    const labels = tab.config.classes.map(c => c.label);
    const removed = labels[0];
    const kept = labels.slice(1);
    state.project.teachers = [
      { name: '堀上', subjects: [], ngSlots: [], ngClasses: [removed], priorityClasses: [kept[0]] },
    ];
    const next = projectReducer(state, {
      type: 'config/setList',
      payload: { key: 'classes', value: kept.join(',') },
    });
    expect(next.project.teachers[0].ngClasses).toEqual([]);
    expect(next.project.teachers[0].priorityClasses).toEqual([kept[0]]);
  });
});

describe('teacher/rename と externalCounts キー (F2o)', () => {
  it('日付ラベルが「-旧名」を含んでいても講師部分だけを書き換える', () => {
    const state = makeState();
    state.project.teachers = [
      { name: '田中', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [] },
    ];
    // 日付ラベル「8/1-田中」× 講師「田中」→ キー '8/1-田中-田中'
    state.project.externalCounts = { '8/1-田中-田中': 2 };
    const next = projectReducer(state, {
      type: 'teacher/rename',
      payload: { idx: 0, newName: '佐藤' },
    });
    // 旧実装 (replace 最初の一致) は '8/1-佐藤-田中' (日付側が壊れる) だった
    expect(next.project.externalCounts).toEqual({ '8/1-田中-佐藤': 2 });
  });
});

// ─── タブ間複製 (K4a) ────────────────────────────────────

describe('projectReducer — schedule/copyFromTab', () => {
  // source (id:2) と target (id:1, active) の 2 タブ。dates/periods は共通、
  // classes はタブごとに別 entity (id 空間が異なる)。
  function makeTwoTabState({ targetClasses, sourceClasses, sourceSchedule, targetOverrides = {} }) {
    return makeState({
      activeTabId: 1,
      tabs: [
        {
          id: 1,
          name: 'target',
          config: {
            dates: [{ id: 1, label: '12/25(木)' }, { id: 2, label: '12/26(金)' }],
            periods: [{ id: 1, label: '1限' }],
            classes: targetClasses,
            subjectCounts: { '英語': 1 },
            ...targetOverrides,
          },
          schedule: { [makeKey(1, 1, targetClasses[0].id)]: { subject: '数学', teacher: '既存' } },
        },
        {
          id: 2,
          name: 'source',
          config: {
            classes: sourceClasses,
            subjectCounts: { '英語': 1 },
          },
          schedule: sourceSchedule,
        },
      ],
    });
  }

  it('label 一致でクラスを対応付けて複製し、既存の割当は置き換える', () => {
    const state = makeTwoTabState({
      targetClasses: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
      sourceClasses: [{ id: 7, label: '３A' }, { id: 8, label: '３S' }],
      sourceSchedule: {
        [makeKey(1, 1, 7)]: { subject: '英語', teacher: '堀上' }, // ３A
        [makeKey(1, 1, 8)]: { subject: '数学', teacher: '田中' }, // ３S
      },
    });
    const next = projectReducer(state, { type: 'schedule/copyFromTab', payload: { sourceTabId: 2 } });
    const tgt = next.project.tabs.find((t) => t.id === 1);
    expect(tgt.schedule[makeKey(1, 1, 2)]).toEqual({ subject: '英語', teacher: '堀上' }); // ３A → id 2
    expect(tgt.schedule[makeKey(1, 1, 1)]).toEqual({ subject: '数学', teacher: '田中' }); // ３S → id 1
    // 履歴に積まれる (Undo 可能)
    expect(next.history.length).toBe(state.history.length + 1);
  });

  it('label が一致しないクラスは並び位置 (index) で対応付ける', () => {
    const state = makeTwoTabState({
      targetClasses: [{ id: 1, label: '１S' }, { id: 2, label: '１A' }],
      sourceClasses: [{ id: 7, label: '３S' }, { id: 8, label: '３A' }],
      sourceSchedule: {
        [makeKey(1, 1, 7)]: { subject: '英語', teacher: '堀上' },
        [makeKey(1, 1, 8)]: { subject: '数学', teacher: '田中' },
      },
    });
    const next = projectReducer(state, { type: 'schedule/copyFromTab', payload: { sourceTabId: 2 } });
    const tgt = next.project.tabs.find((t) => t.id === 1);
    expect(tgt.schedule[makeKey(1, 1, 1)]).toEqual({ subject: '英語', teacher: '堀上' });
    expect(tgt.schedule[makeKey(1, 1, 2)]).toEqual({ subject: '数学', teacher: '田中' });
  });

  it('対象タブが使わない日付 (activeDateIds) のセルは複製しない', () => {
    const state = makeTwoTabState({
      targetClasses: [{ id: 1, label: '３S' }],
      sourceClasses: [{ id: 7, label: '３S' }],
      sourceSchedule: {
        [makeKey(1, 1, 7)]: { subject: '英語', teacher: '堀上' },
        [makeKey(2, 1, 7)]: { subject: '英語', teacher: '田中' }, // 12/26 は対象外
      },
      targetOverrides: { activeDateIds: [1] },
    });
    const next = projectReducer(state, { type: 'schedule/copyFromTab', payload: { sourceTabId: 2 } });
    const tgt = next.project.tabs.find((t) => t.id === 1);
    expect(tgt.schedule[makeKey(1, 1, 1)]).toEqual({ subject: '英語', teacher: '堀上' });
    expect(tgt.schedule[makeKey(2, 1, 1)]).toBeUndefined();
  });

  it('source がアクティブタブ自身 / 存在しないタブなら no-op', () => {
    const state = makeTwoTabState({
      targetClasses: [{ id: 1, label: '３S' }],
      sourceClasses: [{ id: 7, label: '３S' }],
      sourceSchedule: {},
    });
    expect(projectReducer(state, { type: 'schedule/copyFromTab', payload: { sourceTabId: 1 } }).project)
      .toBe(state.project);
    expect(projectReducer(state, { type: 'schedule/copyFromTab', payload: { sourceTabId: 99 } }).project)
      .toBe(state.project);
  });
});

// ─── K2b / K2c (2026-07-03 棚卸しの修正) ─────────────────

describe('projectReducer — K2b/K2c cascade', () => {
  it('subject/remove: 当該科目の locked セルはロックも落として通常の未充填に戻す (K2b)', () => {
    const state = makeState({
      tabs: [{
        id: 1,
        name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上', locked: true },
        },
      }],
    });
    const next = projectReducer(state, { type: 'subject/remove', payload: { name: '英語' } });
    const cell = next.project.tabs[0].schedule[makeKey(1, 1, 1)];
    // locked が残ると「空 + ロック = 空けておく」(F5w) に化けて生成対象から
    // 外れてしまうため、ロックごと解除される
    expect(cell).toEqual({ subject: '', teacher: '' });
  });

  it('dates/removeFromPool: externalSessionPresets の日付範囲参照も未指定に戻す (K2c)', () => {
    const state = makeState({
      dates: [{ id: 1, label: '12/25(木)' }, { id: 2, label: '12/26(金)' }],
      externalSessionPresets: [
        { id: 1, name: '予備校A', startDateLabel: '12/25(木)', endDateLabel: '12/26(金)' },
        { id: 2, name: '予備校B', startDateLabel: '12/26(金)', endDateLabel: '12/26(金)' },
      ],
    });
    const next = projectReducer(state, { type: 'dates/removeFromPool', payload: { dateId: 1 } });
    const [a, b] = next.project.externalSessionPresets;
    expect(a.startDateLabel).toBeUndefined(); // 12/25 参照は未指定に
    expect(a.endDateLabel).toBe('12/26(金)'); // 残存日付の参照は維持
    expect(b).toEqual(state.project.externalSessionPresets[1]);
  });
});

describe('projectReducer — コマ数の一括操作 (L4a)', () => {
  const twoTabs = () => makeState({
    tabs: [
      {
        id: 1, name: '中3',
        config: {
          dates: [{ id: 1, label: '12/25' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }],
          subjectCounts: { '英語': 3, '数学': 2 },
        },
        schedule: {},
      },
      {
        id: 2, name: '中2',
        config: { classes: [{ id: 1, label: '２S' }], subjectCounts: { '英語': 0, '数学': 0 } },
        schedule: {},
      },
    ],
  });

  it('config/fillSubjectCounts: タブの全科目を同じコマ数にする', () => {
    const state = twoTabs();
    const next = projectReducer(state, {
      type: 'config/fillSubjectCounts', payload: { tabId: 2, value: 4 },
    });
    expect(next.project.tabs[1].config.subjectCounts).toEqual({ '英語': 4, '数学': 4 });
    // 他タブは不変 (同一参照)
    expect(next.project.tabs[0]).toBe(state.project.tabs[0]);
  });

  it('config/fillSubjectCounts: 全科目が既に同値なら no-op、負数は 0 に clamp', () => {
    const state = twoTabs();
    expect(projectReducer(state, {
      type: 'config/fillSubjectCounts', payload: { tabId: 2, value: 0 },
    })).toBe(state);
    const next = projectReducer(state, {
      type: 'config/fillSubjectCounts', payload: { tabId: 1, value: -5 },
    });
    expect(next.project.tabs[0].config.subjectCounts).toEqual({ '英語': 0, '数学': 0 });
  });

  it('config/copySubjectCountsToOthers: コマ数を他の全タブへコピー', () => {
    const next = projectReducer(twoTabs(), {
      type: 'config/copySubjectCountsToOthers', payload: { sourceTabId: 1 },
    });
    expect(next.project.tabs[1].config.subjectCounts).toEqual({ '英語': 3, '数学': 2 });
    expect(next.project.tabs[0].config.subjectCounts).toEqual({ '英語': 3, '数学': 2 });
  });

  it('config/copySubjectCountsToOthers: 全タブ同値 / 単一タブは no-op', () => {
    let state = twoTabs();
    state = projectReducer(state, {
      type: 'config/copySubjectCountsToOthers', payload: { sourceTabId: 1 },
    });
    expect(projectReducer(state, {
      type: 'config/copySubjectCountsToOthers', payload: { sourceTabId: 1 },
    })).toBe(state);
    const single = makeState();
    expect(projectReducer(single, {
      type: 'config/copySubjectCountsToOthers', payload: { sourceTabId: 1 },
    })).toBe(single);
  });
});

describe('projectReducer — subject/addMany (L4d/L4c)', () => {
  it('複数科目を一括追加し、全タブの subjectCounts に 0 で登録する', () => {
    const next = projectReducer(makeState(), {
      type: 'subject/addMany', payload: { names: ['情報', '小論文'] },
    });
    expect(next.project.subjects).toEqual(['英語', '数学', '情報', '小論文']);
    expect(next.project.tabs[0].config.subjectCounts['情報']).toBe(0);
    expect(next.project.tabs[0].config.subjectCounts['小論文']).toBe(0);
  });

  it('既存と重複する名前・空文字・入力内重複は除外し、追加ゼロなら no-op', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'subject/addMany', payload: { names: ['英語', '情報', ' ', '情報'] },
    });
    expect(next.project.subjects).toEqual(['英語', '数学', '情報']);
    expect(projectReducer(state, {
      type: 'subject/addMany', payload: { names: ['英語', '数学'] },
    })).toBe(state);
  });
});

describe('projectReducer — dates/removeUnusedFromPool (L4b)', () => {
  const poolState = () => makeState({
    dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }, { id: 3, label: '12/27' }],
    tabs: [
      {
        id: 1, name: '中3',
        config: {
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }],
          subjectCounts: { '英語': 1 },
          activeDateIds: [1],
        },
        schedule: {},
      },
      {
        id: 2, name: '中2',
        config: { classes: [{ id: 1, label: '２S' }], subjectCounts: { '英語': 1 }, activeDateIds: [2] },
        schedule: {},
      },
    ],
  });

  it('どのタブも使っていない日だけをプールから削除する', () => {
    const next = projectReducer(poolState(), { type: 'dates/removeUnusedFromPool' });
    expect(next.project.dates.map(d => d.id)).toEqual([1, 2]);
  });

  it('未使用日の NG・外部コマ数も cascade で消える (removeFromPool と同じ)', () => {
    const state = poolState();
    state.project.teachers = [
      { name: '堀上', subjects: ['英語'], ngSlots: ['12/27-1限', '12/25-1限'], ngClasses: [], priorityClasses: [] },
    ];
    state.project.externalCounts = { '12/27-堀上': 2, '12/25-堀上': 1 };
    const next = projectReducer(state, { type: 'dates/removeUnusedFromPool' });
    expect(next.project.teachers[0].ngSlots).toEqual(['12/25-1限']);
    expect(next.project.externalCounts).toEqual({ '12/25-堀上': 1 });
  });

  it('activeDateIds 未指定 (全日使う) のタブがあれば no-op', () => {
    const state = poolState();
    delete state.project.tabs[1].config.activeDateIds;
    expect(projectReducer(state, { type: 'dates/removeUnusedFromPool' })).toBe(state);
  });

  it('未使用日が無ければ no-op', () => {
    const state = poolState();
    state.project.tabs[1].config.activeDateIds = [2, 3];
    expect(projectReducer(state, { type: 'dates/removeUnusedFromPool' })).toBe(state);
  });
});

describe('projectReducer — 使う日/時限選択の他タブコピー (L4g)', () => {
  const selState = () => makeState({
    dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
    periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
    tabs: [
      {
        id: 1, name: '中3',
        config: {
          classes: [{ id: 1, label: '３S' }],
          subjectCounts: { '英語': 1 },
          activeDateIds: [1],
          activePeriodIds: [2],
        },
        schedule: {},
      },
      {
        id: 2, name: '中2',
        config: { classes: [{ id: 1, label: '２S' }], subjectCounts: { '英語': 1 } },
        schedule: {},
      },
    ],
  });

  it('tabDates/copyActiveToOthers: 使う日の選択を他タブへコピー (配列は複製)', () => {
    const next = projectReducer(selState(), {
      type: 'tabDates/copyActiveToOthers', payload: { sourceTabId: 1 },
    });
    expect(next.project.tabs[1].config.activeDateIds).toEqual([1]);
    expect(next.project.tabs[1].config.activeDateIds).not.toBe(next.project.tabs[0].config.activeDateIds);
  });

  it('tabPeriods/copyActiveToOthers: 使う時限の選択を他タブへコピー', () => {
    const next = projectReducer(selState(), {
      type: 'tabPeriods/copyActiveToOthers', payload: { sourceTabId: 1 },
    });
    expect(next.project.tabs[1].config.activePeriodIds).toEqual([2]);
  });

  it('コピー元が「全部使う」(falsy) なら他タブも null (全部使う) になる', () => {
    const next = projectReducer(selState(), {
      type: 'tabDates/copyActiveToOthers', payload: { sourceTabId: 2 },
    });
    expect(next.project.tabs[0].config.activeDateIds).toBeNull();
  });

  it('全タブ同値なら no-op (同一参照)', () => {
    let state = selState();
    state = projectReducer(state, {
      type: 'tabDates/copyActiveToOthers', payload: { sourceTabId: 1 },
    });
    expect(projectReducer(state, {
      type: 'tabDates/copyActiveToOthers', payload: { sourceTabId: 1 },
    })).toBe(state);
  });
});

describe('projectReducer — L2c と合同グループの相互作用 (§M)', () => {
  // 合同 { 英語, [３S, ３A] } を持つ 2 日構成
  const combinedState = (schedule) => makeState({
    dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
    combinedGroups: [{ id: 1, subject: '英語', classes: ['３S', '３A'], dates: null }],
    teachers: [
      { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      { name: '田中', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
    ],
    tabs: [{
      id: 1, name: 'メイン',
      config: {
        dates: [{ id: 1, label: '12/25' }, { id: 2, label: '12/26' }],
        periods: [{ id: 1, label: '1限' }],
        classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
        subjectCounts: { '英語': 1, '数学': 1 },
      },
      schedule,
    }],
  });

  it('copyDateColumn: 混在列 (合同主セル + 切り離した secondary) を複製しても複製元と一致する', () => {
    // 複製元 12/25: ３S=英語/堀上 (合同主)、３A=数学/田中 (手動で切り離し)。
    // per-cell paste 意味論だと ３A の複製時の cleanup が直前に複製した
    // ３S=英語 を巻き添えで消す (§M レビューで発覚)。verbatim copy なら一致。
    const state = combinedState({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中' },
    });
    const next = projectReducer(state, {
      type: 'schedule/copyDateColumn', payload: { sourceDateId: 1, targetDateId: 2 },
    });
    expect(next.project.tabs[0].schedule[makeKey(2, 1, 1)]).toEqual({ subject: '英語', teacher: '堀上' });
    expect(next.project.tabs[0].schedule[makeKey(2, 1, 2)]).toEqual({ subject: '数学', teacher: '田中' });
    // 複製元は不変
    expect(next.project.tabs[0].schedule[makeKey(1, 1, 1)]).toEqual({ subject: '英語', teacher: '堀上' });
  });

  it('copyDateColumn: 複製先の合同ペア (両クラス英語) を上書きしても残骸が残らない', () => {
    // 複製先 12/26 は合同英語ペア。複製元 12/25 は ３S=数学 のみ。
    const state = combinedState({
      [makeKey(1, 1, 1)]: { subject: '数学', teacher: '田中' },
      [makeKey(2, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(2, 1, 2)]: { subject: '英語', teacher: '堀上' },
    });
    const next = projectReducer(state, {
      type: 'schedule/copyDateColumn', payload: { sourceDateId: 1, targetDateId: 2 },
    });
    // 複製元と一致: ３S=数学、３A=空
    expect(next.project.tabs[0].schedule[makeKey(2, 1, 1)]).toEqual({ subject: '数学', teacher: '田中' });
    expect(next.project.tabs[0].schedule[makeKey(2, 1, 2)]).toBeUndefined();
  });

  it('applyToAllDates: 合同主セルの適用は各日の secondary へも伝播する', () => {
    const state = combinedState({
      [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(1, 1, 2)]: { subject: '英語', teacher: '堀上' },
    });
    const next = projectReducer(state, {
      type: 'cell/applyToAllDates', payload: { dateId: 1, periodId: 1, classId: 1 },
    });
    expect(next.project.tabs[0].schedule[makeKey(2, 1, 1)]).toEqual({ subject: '英語', teacher: '堀上' });
    // 合同伝播で ３A にも入る
    expect(next.project.tabs[0].schedule[makeKey(2, 1, 2)]).toMatchObject({ subject: '英語', teacher: '堀上' });
  });

  it('applyToAllDates: 適用先の旧科目の合同 secondary は cleanup される', () => {
    // 12/26 に旧・合同英語ペアが居る状態で、12/25 の数学を全日に適用
    const state = combinedState({
      [makeKey(1, 1, 1)]: { subject: '数学', teacher: '田中' },
      [makeKey(2, 1, 1)]: { subject: '英語', teacher: '堀上' },
      [makeKey(2, 1, 2)]: { subject: '英語', teacher: '堀上' },
    });
    const next = projectReducer(state, {
      type: 'cell/applyToAllDates', payload: { dateId: 1, periodId: 1, classId: 1 },
    });
    expect(next.project.tabs[0].schedule[makeKey(2, 1, 1)]).toEqual({ subject: '数学', teacher: '田中' });
    // 旧英語合同の secondary (３A) は残骸にならない (cleanup で空へ)
    expect(next.project.tabs[0].schedule[makeKey(2, 1, 2)]?.subject).not.toBe('英語');
  });
});
