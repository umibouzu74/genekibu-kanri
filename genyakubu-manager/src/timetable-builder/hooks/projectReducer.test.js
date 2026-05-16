import { describe, expect, it } from 'vitest';
import { projectReducer, MAX_HISTORY } from './projectReducer';
import { makeKey, makeExternalKey, makeNgKey } from '../utils/scheduleKey';

// テスト用ヘルパー: 単純な project + state を生成 (v3 schema)
function makeProject(overrides = {}) {
  return {
    version: 3,
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
    ...overrides,
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
});

describe('projectReducer — 講師管理', () => {
  it('teacher/add: 空名は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'teacher/add', payload: { name: '' } })).toBe(state);
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

  it('teacher/setExternalCount: 数値以外は 0 に解釈', () => {
    const state = makeState();
    const next = projectReducer(state, {
      type: 'teacher/setExternalCount',
      payload: { date: '12/25(木)', teacherName: '堀上', value: 'abc' },
    });
    expect(next.project.externalCounts[makeExternalKey('12/25(木)', '堀上')]).toBe(0);
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
        sourceData: { subject: '英語', teacher: '堀上' },
        targetKey: makeKey(1, 1, 2),
        targetData: { subject: '数学', teacher: '田中', locked: true },
      },
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

  it('cell/setNg: セル講師の NG slot を toggle', () => {
    const state = makeState({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } },
      }],
    });
    const next = projectReducer(state, {
      type: 'cell/setNg',
      payload: { dateId: 1, periodId: 1, classId: 1 },
    });
    expect(next.project.teachers[0].ngSlots).toEqual([makeNgKey('12/25(木)', '1限')]);
  });

  it('cell/setNg: 未定 / 未割当は no-op', () => {
    const state = makeState({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }],
          periods: [{ id: 1, label: '1限' }],
          classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '未定' } },
      }],
    });
    expect(projectReducer(state, {
      type: 'cell/setNg',
      payload: { dateId: 1, periodId: 1, classId: 1 },
    })).toBe(state);
  });
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
});

describe('projectReducer — 未知 action', () => {
  it('未知の type は no-op', () => {
    const state = makeState();
    expect(projectReducer(state, { type: 'unknown/type' })).toBe(state);
  });
});
