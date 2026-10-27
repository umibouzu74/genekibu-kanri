import { describe, expect, it } from 'vitest';
import {
  PUBLISH_STATES,
  isPublishState,
  isPublished,
  projectPublishState,
  publishStateDef,
} from './publishState';
import { migrateProject } from './scheduleKey';
import { createNewProject } from '../hooks/projectFactory';
import { buildFreshSeasonProject } from './seasonStart';
import { buildTemplatePayload } from './templates';
import { projectReducer } from '../hooks/projectReducer';

const tab = { id: 1, name: '中3', config: { classes: [{ id: 1, label: '3S' }], subjectCounts: {} }, schedule: {} };

describe('publishState (作成中 / 仮確定 / 確定)', () => {
  it('未設定・知らない値は確定 (この項目ができる前の時間割は従来どおり月間に出す)', () => {
    expect(projectPublishState({})).toBe('final');
    expect(projectPublishState(null)).toBe('final');
    expect(projectPublishState({ publishState: 'foo' })).toBe('final');
    expect(projectPublishState({ publishState: 'draft' })).toBe('draft');
  });

  it('本体に出すのは仮確定と確定だけ', () => {
    expect(PUBLISH_STATES.map(s => [s.key, isPublished(s.key)])).toEqual([
      ['draft', false],
      ['tentative', true],
      ['final', true],
    ]);
    expect(isPublishState('tentative')).toBe(true);
    expect(isPublishState('')).toBe(false);
    expect(publishStateDef('tentative').label).toBe('仮確定');
  });

  it('読込で知らない値は落とす (= 確定)。正しい値は残す', () => {
    const base = { version: 4, name: '', tabs: [tab], dates: [], periods: [], teachers: [] };
    expect('publishState' in migrateProject({ ...base, publishState: 'xyz' })).toBe(false);
    expect(migrateProject({ ...base, publishState: 'tentative' }).publishState).toBe('tentative');
  });

  it('新しく作る時間割 (初期値・リセット) と作り直し・写した時間割は作成中から', () => {
    expect(createNewProject([tab]).publishState).toBe('draft');
    const source = { ...createNewProject([tab]), publishState: 'final' };
    expect(buildFreshSeasonProject(source, { name: '2027 冬期講習' }).publishState).toBe('draft');
  });

  it('テンプレートには載せない (当てる先の時間割が決めること)', () => {
    expect('publishState' in buildTemplatePayload({ ...createNewProject([tab]), publishState: 'final' })).toBe(false);
  });

  it('project/setPublishState: 履歴に積む。同じ値・知らない値は何もしない', () => {
    const project = createNewProject([tab]);
    const state = { project, history: [project], historyIndex: 0, loadError: null };
    const next = projectReducer(state, { type: 'project/setPublishState', payload: { state: 'final' } });
    expect(next.project.publishState).toBe('final');
    expect(next.history).toHaveLength(2);
    expect(projectReducer(next, { type: 'project/setPublishState', payload: { state: 'final' } })).toBe(next);
    expect(projectReducer(next, { type: 'project/setPublishState', payload: { state: 'nope' } })).toBe(next);
    const undone = projectReducer(next, { type: 'history/undo' });
    expect(undone.project.publishState).toBe('draft');
  });
});
