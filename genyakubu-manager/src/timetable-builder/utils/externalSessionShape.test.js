import { describe, expect, it } from 'vitest';
import {
  computeCourseSplit,
  externalSessionContentKey,
  sessionDisplayLabel,
  sessionKindLabel,
} from './externalSessionShape';
import { migrateProject } from './scheduleKey';
import { projectReducer } from '../hooks/projectReducer';
import { computePresetRenameSyncIds } from './presetRenameSync';

const tab = { id: 1, name: '中3', config: { classes: [{ id: 1, label: '3S' }], subjectCounts: {} }, schedule: {} };
const session = (over = {}) => ({ id: 1, date: '12/26(土)', teacherName: '滝澤', label: '', memo: '', startTime: '12:25', endTime: '13:35', ...over });

describe('他学年セッションの講座名 (2026-10-27)', () => {
  it('表示は「メモ + 講座名」。メモが無ければプリセットの名前 → 「外部」', () => {
    expect(sessionDisplayLabel({ memo: 'Ⅰ期 予備校３限', course: '高3 共通テスト理科基礎(物理基礎)' })).toBe('Ⅰ期 予備校３限 高3 共通テスト理科基礎(物理基礎)');
    expect(sessionDisplayLabel({ memo: '', course: '英語' }, '予備校１限')).toBe('予備校１限 英語');
    expect(sessionDisplayLabel({})).toBe('外部');
    expect(sessionKindLabel({ memo: '' }, null)).toBe('外部');
  });

  it('同じ内容の判定に講座名を含める (同じ時刻・メモでも講座が違えば別の授業)', () => {
    const a = session({ memo: 'Ⅰ期 予備校３限', course: '物理基礎' });
    expect(externalSessionContentKey(a)).not.toBe(externalSessionContentKey({ ...a, course: '化学基礎' }));
    expect(externalSessionContentKey(session())).toBe(externalSessionContentKey({ ...session(), course: '' }));
  });

  it('メモに入れていた「プリセットの名前 + 講座名」を分ける (時刻も合うときだけ・いちばん長い名前)', () => {
    const presets = [
      { id: 1, name: 'Ⅰ期 予備校３限', startTime: '12:25', endTime: '13:35' },
      { id: 2, name: 'Ⅰ期', startTime: '12:25', endTime: '13:35' },
      { id: 3, name: 'Ⅰ期 予備校１限', startTime: '09:00', endTime: '10:10' },
    ];
    const sessions = [
      session({ id: 1, memo: 'Ⅰ期 予備校３限 高3 共通テスト理科基礎(物理基礎)' }),
      session({ id: 2, memo: 'Ⅰ期 予備校３限　高3 化学基礎' }), // 全角空白
      session({ id: 3, memo: 'Ⅰ期 予備校３限' }), // 講座名なし
      session({ id: 4, memo: 'Ⅰ期 予備校１限 英語' }), // 時刻が違う (12:25 のセッション)
      session({ id: 5, memo: 'Ⅰ期 予備校３限 数学', course: '数学' }), // もう分けてある
    ];
    expect(computeCourseSplit(sessions, presets)).toEqual([
      { sessionId: 1, memo: 'Ⅰ期 予備校３限', course: '高3 共通テスト理科基礎(物理基礎)' },
      { sessionId: 2, memo: 'Ⅰ期 予備校３限', course: '高3 化学基礎' },
    ]);
  });

  it('分けた後はプリセットの改名がメモに追従する', () => {
    const preset = { id: 1, name: 'Ⅰ期 予備校３限', startTime: '12:25', endTime: '13:35' };
    const before = [session({ memo: 'Ⅰ期 予備校３限 物理基礎' })];
    expect(computePresetRenameSyncIds(before, preset)).toEqual([]);
    const project = {
      version: 4, name: '', tabs: [tab], dates: [], periods: [], teachers: [],
      externalSessions: before, externalSessionPresets: [preset],
    };
    const state = { project, history: [project], historyIndex: 0, loadError: null };
    const next = projectReducer(state, { type: 'teacher/splitSessionCourses' });
    expect(next.project.externalSessions[0]).toMatchObject({ memo: 'Ⅰ期 予備校３限', course: '物理基礎' });
    expect(computePresetRenameSyncIds(next.project.externalSessions, preset)).toEqual([1]);
  });

  it('reducer: 登録で講座名を持ち、内容が同じなら飛ばす。一覧から講座名を直せる', () => {
    const project = { version: 4, name: '', tabs: [tab], dates: [], periods: [], teachers: [], externalSessions: [], externalSessionPresets: [] };
    let state = { project, history: [project], historyIndex: 0, loadError: null };
    const item = { date: '12/26(土)', teacherName: '滝澤', memo: 'Ⅰ期 予備校３限', course: ' 物理基礎 ', startTime: '12:25', endTime: '13:35' };
    state = projectReducer(state, { type: 'teacher/addExternalSessions', payload: { items: [item, { ...item, course: '化学基礎' }] } });
    expect(state.project.externalSessions.map(s => s.course)).toEqual(['物理基礎', '化学基礎']);
    const same = projectReducer(state, { type: 'teacher/addExternalSessions', payload: { items: [{ ...item, course: '物理基礎' }] } });
    expect(same).toBe(state);
    state = projectReducer(state, { type: 'teacher/updateExternalSession', payload: { id: 1, updates: { course: '' } } });
    expect('course' in state.project.externalSessions[0]).toBe(false);
    expect(projectReducer(state, { type: 'teacher/updateExternalSession', payload: { id: 1, updates: { course: '' } } })).toBe(state);
  });

  it('読込で文字列でない・空白だけの講座名は落とし、前後の空白を落とす', () => {
    const migrated = migrateProject({
      version: 4, name: '', tabs: [tab], dates: [], periods: [], teachers: [],
      externalSessions: [session({ id: 1, course: 3 }), session({ id: 2, course: '  ' }), session({ id: 3, course: ' 英語 ' }), session({ id: 4 })],
    });
    expect(migrated.externalSessions.map(s => s.course)).toEqual([undefined, undefined, '英語', undefined]);
    expect(migrated.externalSessions.every(s => s.id !== 1 || !('course' in s))).toBe(true);
  });
});

describe('取り込んだセッション (校正, 2026-10-28)', () => {
  it('本体の高校・予備校の講習から取り込んだものはメモと講座名に分けない', () => {
    const presets = [{ id: 1, name: 'Ⅰ期' }];
    const sessions = [
      { id: 1, date: '12/25(金)', teacherName: '滝澤', memo: 'Ⅰ期 3限' },
      { id: 2, date: '12/25(金)', teacherName: '滝澤', memo: 'Ⅰ期 3限', source: 'seniorKoshu', sourceKey: '1:2026-12-25' },
    ];
    expect(computeCourseSplit(sessions, presets).map(a => a.sessionId)).toEqual([1]);
  });
});
