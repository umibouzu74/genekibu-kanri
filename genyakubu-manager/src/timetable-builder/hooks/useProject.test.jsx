// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useProject } from './useProject';
import { STORAGE_KEY_PROJECT } from '../utils/constants';
import { makeKey, makeExternalKey, makeNgKey } from '../utils/scheduleKey';

// 各テストの初期 project を localStorage に流し込んでから renderHook する。
// useHistoryStack が loadInitialProject 経由で localStorage を読むため、これで
// 任意の初期状態を作れる。
// v3 schema で保存する。dates/periods/classes は { id, label } の entity 配列。
function setupHook(override = {}) {
  const baseProject = {
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
    ...override,
  };
  localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(baseProject));
  return renderHook(() => useProject());
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

// ─── 講師管理 ──────────────────────────────────────────────────────

describe('useProject — addTeacher', () => {
  it('講師を追加する (デフォルト値で)', () => {
    const { result } = setupHook();
    act(() => result.current.addTeacher('新講師'));
    const added = result.current.project.teachers.find(t => t.name === '新講師');
    expect(added).toBeTruthy();
    expect(added).toMatchObject({
      name: '新講師',
      subjects: [],
      ngSlots: [],
      ngClasses: [],
      priorityClasses: [],
    });
  });

  it('空文字なら no-op', () => {
    const { result } = setupHook();
    const before = result.current.project.teachers.length;
    act(() => result.current.addTeacher(''));
    expect(result.current.project.teachers.length).toBe(before);
  });
});

describe('useProject — renameTeacher (cascade)', () => {
  it('講師名変更が teachers / schedule / externalCounts に伝播する', () => {
    const { result } = setupHook({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }], periods: [{ id: 1, label: '1限' }], classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中' },
        },
      }],
      externalCounts: { [makeExternalKey('12/25(木)', '堀上')]: 3 },
    });
    act(() => result.current.renameTeacher(0, 'ホリウエ'));
    const proj = result.current.project;
    // teachers
    expect(proj.teachers[0].name).toBe('ホリウエ');
    // schedule の teacher 名
    expect(proj.tabs[0].schedule[makeKey(1, 1, 1)].teacher).toBe('ホリウエ');
    // 田中 は影響なし
    expect(proj.tabs[0].schedule[makeKey(1, 1, 2)].teacher).toBe('田中');
    // externalCounts のキー
    expect(proj.externalCounts[makeExternalKey('12/25(木)', 'ホリウエ')]).toBe(3);
    expect(proj.externalCounts[makeExternalKey('12/25(木)', '堀上')]).toBeUndefined();
  });

  it('同じ名前なら no-op', () => {
    const { result } = setupHook();
    const before = JSON.stringify(result.current.project);
    act(() => result.current.renameTeacher(0, '堀上'));
    expect(JSON.stringify(result.current.project)).toBe(before);
  });

  it('空文字なら no-op', () => {
    const { result } = setupHook();
    const before = JSON.stringify(result.current.project);
    act(() => result.current.renameTeacher(0, ''));
    expect(JSON.stringify(result.current.project)).toBe(before);
  });
});

describe('useProject — removeTeacher (cascade)', () => {
  it('講師削除時、対応するスケジュールセルの teacher が空文字に', () => {
    const { result } = setupHook({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }], periods: [{ id: 1, label: '1限' }], classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中' },
        },
      }],
    });
    act(() => result.current.removeTeacher(0));
    const proj = result.current.project;
    expect(proj.teachers.find(t => t.name === '堀上')).toBeUndefined();
    expect(proj.tabs[0].schedule[makeKey(1, 1, 1)].teacher).toBe('');
    // subject はそのまま
    expect(proj.tabs[0].schedule[makeKey(1, 1, 1)].subject).toBe('英語');
    // 田中 は無事
    expect(proj.tabs[0].schedule[makeKey(1, 1, 2)].teacher).toBe('田中');
  });
});

describe('useProject — toggleTeacherSubject / toggleTeacherNg', () => {
  it('toggleTeacherSubject は subjects を toggle する', () => {
    const { result } = setupHook();
    act(() => result.current.toggleTeacherSubject(0, '数学'));
    expect(result.current.project.teachers[0].subjects).toEqual(['英語', '数学']);
    act(() => result.current.toggleTeacherSubject(0, '英語'));
    expect(result.current.project.teachers[0].subjects).toEqual(['数学']);
  });

  it('toggleTeacherNg は ngSlots を toggle する', () => {
    const { result } = setupHook();
    act(() => result.current.toggleTeacherNg(0, '12/25(木)', '1限'));
    expect(result.current.project.teachers[0].ngSlots).toEqual([makeNgKey('12/25(木)', '1限')]);
    act(() => result.current.toggleTeacherNg(0, '12/25(木)', '1限'));
    expect(result.current.project.teachers[0].ngSlots).toEqual([]);
  });
});

// ─── 科目マスタ ─────────────────────────────────────────────────

describe('useProject — addSubject / removeSubject (cascade)', () => {
  it('addSubject は subjects と全タブの subjectCounts に追加する', () => {
    const { result } = setupHook();
    act(() => result.current.addSubject('理科'));
    expect(result.current.project.subjects).toContain('理科');
    expect(result.current.project.tabs[0].config.subjectCounts['理科']).toBe(0);
  });

  it('removeSubject は subjects / subjectCounts / schedule / teachers / colors から削除する', () => {
    const { result } = setupHook({
      subjectColors: { '英語': '#000', '数学': '#fff' },
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }], periods: [{ id: 1, label: '1限' }], classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中' },
        },
      }],
      teachers: [
        { name: '堀上', subjects: ['英語', '数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
        { name: '田中', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
    });
    act(() => result.current.removeSubject('英語'));
    const proj = result.current.project;
    // subjects
    expect(proj.subjects).not.toContain('英語');
    // subjectCounts
    expect(proj.tabs[0].config.subjectCounts['英語']).toBeUndefined();
    // schedule cell: subject/teacher が空に
    expect(proj.tabs[0].schedule[makeKey(1, 1, 1)]).toEqual({ subject: '', teacher: '' });
    // 数学のセルは無事
    expect(proj.tabs[0].schedule[makeKey(1, 1, 2)]).toMatchObject({ subject: '数学', teacher: '田中' });
    // teachers から科目を除去
    expect(proj.teachers[0].subjects).toEqual(['数学']);
    expect(proj.teachers[1].subjects).toEqual(['数学']);
    // colors
    expect(proj.subjectColors['英語']).toBeUndefined();
    expect(proj.subjectColors['数学']).toBe('#fff');
  });

  it('reorderSubjects は順序を変える', () => {
    const { result } = setupHook({ subjects: ['英語', '数学', '国語'] });
    act(() => result.current.reorderSubjects(0, 2));
    expect(result.current.project.subjects).toEqual(['数学', '国語', '英語']);
  });
});

// ─── タブ管理 ───────────────────────────────────────────────────

describe('useProject — タブ管理', () => {
  it('handleAddTab は activeTab の config をコピーした新タブを追加 + 切り替え', () => {
    const { result } = setupHook();
    act(() => result.current.handleAddTab('新タブ'));
    const proj = result.current.project;
    expect(proj.tabs).toHaveLength(2);
    expect(proj.activeTabId).toBe(proj.tabs[1].id);
    expect(proj.tabs[1].name).toBe('新タブ');
    // config はコピー (同一参照ではない)
    expect(proj.tabs[1].config).not.toBe(proj.tabs[0].config);
    expect(proj.tabs[1].config.classes).toEqual(proj.tabs[0].config.classes);
  });

  it('handleDeleteTab は最後の 1 タブは消さない (no-op)', () => {
    const { result } = setupHook();
    act(() => result.current.handleDeleteTab(1));
    expect(result.current.project.tabs).toHaveLength(1);
  });

  it('switchTab は activeTabId を変えるが履歴には積まない', () => {
    const { result } = setupHook();
    act(() => result.current.handleAddTab('新タブ'));
    const histLen = result.current.history.length;
    const newId = result.current.project.tabs[1].id;
    act(() => result.current.switchTab(1));
    expect(result.current.project.activeTabId).toBe(1);
    // 履歴には積まれない
    expect(result.current.history.length).toBe(histLen);
    // 別タブにも切り替えられる
    act(() => result.current.switchTab(newId));
    expect(result.current.project.activeTabId).toBe(newId);
  });
});

// ─── handleAssign (合同グループ伝播含む) ──────────────────────────

describe('useProject — handleAssign 基本', () => {
  it('subject を割り当てると teacher は空文字にリセットされる', () => {
    const { result } = setupHook();
    act(() => result.current.handleAssign(1, 1, 1, 'subject', '英語'));
    const cell = result.current.currentSchedule[makeKey(1, 1, 1)];
    expect(cell).toEqual({ subject: '英語', teacher: '' });
  });

  it('teacher を割り当てると subject は保持される', () => {
    const { result } = setupHook();
    act(() => result.current.handleAssign(1, 1, 1, 'subject', '英語'));
    act(() => result.current.handleAssign(1, 1, 1, 'teacher', '堀上'));
    const cell = result.current.currentSchedule[makeKey(1, 1, 1)];
    expect(cell).toEqual({ subject: '英語', teacher: '堀上' });
  });

  it('locked セルは handleAssign で変更されない', () => {
    const { result } = setupHook({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }], periods: [{ id: 1, label: '1限' }], classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上', locked: true },
        },
      }],
    });
    act(() => result.current.handleAssign(1, 1, 1, 'subject', '数学'));
    const cell = result.current.currentSchedule[makeKey(1, 1, 1)];
    expect(cell).toMatchObject({ subject: '英語', teacher: '堀上', locked: true });
  });
});

describe('useProject — handleAssign 合同グループ伝播', () => {
  // 合同グループ: 英語 で ３S と ３A が同じ授業
  const withCombined = {
    combinedGroups: [{ id: 1, subject: '英語', classes: ['３S', '３A'], dates: null }],
  };

  it('subject の伝播: ３S に英語を入れると ３A にも英語が入る (teacher は空)', () => {
    const { result } = setupHook(withCombined);
    act(() => result.current.handleAssign(1, 1, 1, 'subject', '英語'));
    const sch = result.current.currentSchedule;
    expect(sch[makeKey(1, 1, 1)]).toEqual({ subject: '英語', teacher: '' });
    expect(sch[makeKey(1, 1, 2)]).toEqual({ subject: '英語', teacher: '' });
  });

  it('teacher の伝播: 合同セルの講師変更が他クラスにも反映', () => {
    const { result } = setupHook(withCombined);
    act(() => result.current.handleAssign(1, 1, 1, 'subject', '英語'));
    act(() => result.current.handleAssign(1, 1, 1, 'teacher', '堀上'));
    const sch = result.current.currentSchedule;
    expect(sch[makeKey(1, 1, 1)]).toEqual({ subject: '英語', teacher: '堀上' });
    expect(sch[makeKey(1, 1, 2)]).toEqual({ subject: '英語', teacher: '堀上' });
  });

  it('subject 変更時、旧合同のセカンダリ (非ロック) は削除される', () => {
    const { result } = setupHook(withCombined);
    // ３S・３A を英語にしてから、３S を数学に変更
    act(() => result.current.handleAssign(1, 1, 1, 'subject', '英語'));
    expect(result.current.currentSchedule[makeKey(1, 1, 2)]).toBeTruthy();
    act(() => result.current.handleAssign(1, 1, 1, 'subject', '数学'));
    const sch = result.current.currentSchedule;
    expect(sch[makeKey(1, 1, 1)]).toEqual({ subject: '数学', teacher: '' });
    // ３A の合同セルは消える (lock されていないため)
    expect(sch[makeKey(1, 1, 2)]).toBeUndefined();
  });

  it('locked のセカンダリは合同伝播でも上書きされない', () => {
    const { result } = setupHook({
      ...withCombined,
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }], periods: [{ id: 1, label: '1限' }], classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中', locked: true },
        },
      }],
    });
    act(() => result.current.handleAssign(1, 1, 1, 'subject', '英語'));
    const sch = result.current.currentSchedule;
    expect(sch[makeKey(1, 1, 1)]).toEqual({ subject: '英語', teacher: '' });
    // locked セルは変わらない
    expect(sch[makeKey(1, 1, 2)]).toMatchObject({ subject: '数学', teacher: '田中', locked: true });
  });
});

// ─── toggleLock / handleCellClear / handleCellPaste ────────────

describe('useProject — toggleLock / handleCellClear', () => {
  it('toggleLock は locked フラグを反転する', () => {
    const { result } = setupHook();
    act(() => result.current.handleAssign(1, 1, 1, 'subject', '英語'));
    act(() => result.current.toggleLock(1, 1, 1));
    expect(result.current.currentSchedule[makeKey(1, 1, 1)].locked).toBe(true);
    act(() => result.current.toggleLock(1, 1, 1));
    expect(result.current.currentSchedule[makeKey(1, 1, 1)].locked).toBe(false);
  });

  it('handleCellClear: 非ロックセルは消える', () => {
    const { result } = setupHook();
    act(() => result.current.handleAssign(1, 1, 1, 'subject', '英語'));
    act(() => result.current.handleCellClear(1, 1, 1));
    expect(result.current.currentSchedule[makeKey(1, 1, 1)]).toBeUndefined();
  });

  it('handleCellClear: ロック済セルは消えない', () => {
    const { result } = setupHook();
    act(() => result.current.handleAssign(1, 1, 1, 'subject', '英語'));
    act(() => result.current.toggleLock(1, 1, 1));
    act(() => result.current.handleCellClear(1, 1, 1));
    expect(result.current.currentSchedule[makeKey(1, 1, 1)]).toMatchObject({
      subject: '英語', locked: true,
    });
  });

  it('handleCellClear: 合同セカンダリも連動して消える (非ロックのみ)', () => {
    const { result } = setupHook({
      combinedGroups: [{ id: 1, subject: '英語', classes: ['３S', '３A'], dates: null }],
    });
    act(() => result.current.handleAssign(1, 1, 1, 'subject', '英語'));
    act(() => result.current.handleCellClear(1, 1, 1));
    expect(result.current.currentSchedule[makeKey(1, 1, 1)]).toBeUndefined();
    expect(result.current.currentSchedule[makeKey(1, 1, 2)]).toBeUndefined();
  });
});

describe('useProject — handleCellPaste', () => {
  it('handleCellPaste: clipboard の subject/teacher をペースト', () => {
    const { result } = setupHook();
    act(() => result.current.handleCellPaste(1, 1, 1, { subject: '英語', teacher: '堀上' }));
    expect(result.current.currentSchedule[makeKey(1, 1, 1)]).toMatchObject({
      subject: '英語', teacher: '堀上',
    });
  });

  it('handleCellPaste: locked セルにはペーストしない', () => {
    const { result } = setupHook({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }], periods: [{ id: 1, label: '1限' }], classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '数学', teacher: '田中', locked: true },
        },
      }],
    });
    act(() => result.current.handleCellPaste(1, 1, 1, { subject: '英語', teacher: '堀上' }));
    expect(result.current.currentSchedule[makeKey(1, 1, 1)]).toMatchObject({
      subject: '数学', teacher: '田中', locked: true,
    });
  });
});

// ─── handleSwapCells (70+ 行の集中ターゲット) ──────────────────

describe('useProject — handleSwapCells', () => {
  it('単純なスワップ: A と B のセル内容が入れ替わる', () => {
    const { result } = setupHook();
    act(() => result.current.handleAssign(1, 1, 1, 'subject', '英語'));
    act(() => result.current.handleAssign(1, 1, 1, 'teacher', '堀上'));
    act(() => result.current.handleAssign(1, 1, 2, 'subject', '数学'));
    act(() => result.current.handleAssign(1, 1, 2, 'teacher', '田中'));

    const key1 = makeKey(1, 1, 1);
    const key2 = makeKey(1, 1, 2);
    const source = { ...result.current.currentSchedule[key1] };
    const target = { ...result.current.currentSchedule[key2] };
    act(() => result.current.handleSwapCells(key1, source, key2, target));

    expect(result.current.currentSchedule[key1]).toMatchObject({ subject: '数学', teacher: '田中' });
    expect(result.current.currentSchedule[key2]).toMatchObject({ subject: '英語', teacher: '堀上' });
  });

  it('target が locked なら no-op', () => {
    const { result } = setupHook({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }], periods: [{ id: 1, label: '1限' }], classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' },
          [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中', locked: true },
        },
      }],
    });
    const key1 = makeKey(1, 1, 1);
    const key2 = makeKey(1, 1, 2);
    const source = { ...result.current.currentSchedule[key1] };
    const target = { ...result.current.currentSchedule[key2] };
    act(() => result.current.handleSwapCells(key1, source, key2, target));
    // 変化なし
    expect(result.current.currentSchedule[key1]).toMatchObject({ subject: '英語', teacher: '堀上' });
    expect(result.current.currentSchedule[key2]).toMatchObject({ subject: '数学', teacher: '田中', locked: true });
  });

  it('source が locked なら no-op (UI も dragStart で止めるが reducer 側でも防衛)', () => {
    const { result } = setupHook({
      tabs: [{
        id: 1, name: 'メイン',
        config: {
          dates: [{ id: 1, label: '12/25(木)' }], periods: [{ id: 1, label: '1限' }], classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
          subjectCounts: { '英語': 1, '数学': 1 },
        },
        schedule: {
          [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上', locked: true },
          [makeKey(1, 1, 2)]: { subject: '数学', teacher: '田中' },
        },
      }],
    });
    const key1 = makeKey(1, 1, 1);
    const key2 = makeKey(1, 1, 2);
    const source = { ...result.current.currentSchedule[key1] };
    const target = { ...result.current.currentSchedule[key2] };
    act(() => result.current.handleSwapCells(key1, source, key2, target));
    // 変化なし: locked source からの swap は防御される
    expect(result.current.currentSchedule[key1]).toMatchObject({ subject: '英語', teacher: '堀上', locked: true });
    expect(result.current.currentSchedule[key2]).toMatchObject({ subject: '数学', teacher: '田中' });
  });
});

// ─── undo / redo (useHistoryStack 経由) ───────────────────────

describe('useProject — undo/redo', () => {
  it('handleAssign → undo で前の状態に戻る', () => {
    const { result } = setupHook();
    act(() => result.current.handleAssign(1, 1, 1, 'subject', '英語'));
    expect(result.current.currentSchedule[makeKey(1, 1, 1)]).toBeTruthy();
    act(() => result.current.undo());
    expect(result.current.currentSchedule[makeKey(1, 1, 1)]).toBeUndefined();
  });
});

// ─── externalCounts ────────────────────────────────────────────

describe('useProject — handleExternalCountChange', () => {
  it('handleExternalCountChange は externalCounts を更新する', () => {
    const { result } = setupHook();
    act(() => result.current.handleExternalCountChange('12/25(木)', '堀上', '4'));
    expect(result.current.project.externalCounts[makeExternalKey('12/25(木)', '堀上')]).toBe(4);
  });

  it('数値以外の値は 0 に解釈する', () => {
    const { result } = setupHook();
    act(() => result.current.handleExternalCountChange('12/25(木)', '堀上', 'abc'));
    expect(result.current.project.externalCounts[makeExternalKey('12/25(木)', '堀上')]).toBe(0);
  });
});

// ─── 合同グループ管理 ─────────────────────────────────────────

describe('useProject — combinedGroups CRUD', () => {
  it('addCombinedGroup は id を自動採番する', () => {
    const { result } = setupHook();
    act(() => result.current.addCombinedGroup({ subject: '英語', classes: ['３S', '３A'], dates: null }));
    expect(result.current.project.combinedGroups[0].id).toBe(1);
    act(() => result.current.addCombinedGroup({ subject: '数学', classes: ['３S', '３A'], dates: null }));
    expect(result.current.project.combinedGroups[1].id).toBe(2);
  });

  it('updateCombinedGroup は id で対象を絞って更新する', () => {
    const { result } = setupHook({
      combinedGroups: [
        { id: 1, subject: '英語', classes: ['３S', '３A'], dates: null },
        { id: 2, subject: '数学', classes: ['３S', '３A'], dates: null },
      ],
    });
    act(() => result.current.updateCombinedGroup(1, { classes: ['３S', '３A', '３B'] }));
    expect(result.current.project.combinedGroups[0].classes).toEqual(['３S', '３A', '３B']);
    expect(result.current.project.combinedGroups[1].classes).toEqual(['３S', '３A']);
  });

  it('removeCombinedGroup は id 一致を削除する', () => {
    const { result } = setupHook({
      combinedGroups: [
        { id: 1, subject: '英語', classes: ['３S', '３A'], dates: null },
        { id: 2, subject: '数学', classes: ['３S', '３A'], dates: null },
      ],
    });
    act(() => result.current.removeCombinedGroup(1));
    expect(result.current.project.combinedGroups).toHaveLength(1);
    expect(result.current.project.combinedGroups[0].id).toBe(2);
  });
});
