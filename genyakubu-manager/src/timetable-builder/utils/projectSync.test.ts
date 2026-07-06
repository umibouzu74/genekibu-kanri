// decideRemoteProject (E6a: Firebase 受信ペイロードの適用判定) のテスト。
import { describe, expect, it } from 'vitest';
import { decideRemoteProject, stableStringify } from './projectSync';
import { createNewProject } from '../hooks/projectFactory';
import { CURRENT_PROJECT_VERSION, DEFAULT_TAB_CONFIG_BASE } from './constants';
import type { Project } from '../types';

const makeLocal = (): Project =>
  createNewProject([
    { id: 1, name: '中３', config: structuredClone(DEFAULT_TAB_CONFIG_BASE), schedule: {} },
  ]);

describe('stableStringify', () => {
  it('キー順が違っても同じ文字列になる', () => {
    expect(stableStringify({ a: 1, b: { d: 2, c: 3 } })).toBe(
      stableStringify({ b: { c: 3, d: 2 }, a: 1 }),
    );
  });

  it('配列の順序は保持する', () => {
    expect(stableStringify([2, 1])).not.toBe(stableStringify([1, 2]));
  });
});

describe('decideRemoteProject — reject 系 (壊れた blob はローカル正で上書きしてよい)', () => {
  const local = makeLocal();

  it('文字列以外は reject', () => {
    expect(decideRemoteProject(123, local).action).toBe('reject');
    expect(decideRemoteProject({ tabs: [] }, local).action).toBe('reject');
    expect(decideRemoteProject('', local).action).toBe('reject');
  });

  it('JSON として壊れていたら reject', () => {
    expect(decideRemoteProject('{not json', local).action).toBe('reject');
  });

  it('オブジェクトでない JSON (配列 / プリミティブ) は reject', () => {
    expect(decideRemoteProject('[1,2]', local).action).toBe('reject');
    expect(decideRemoteProject('"str"', local).action).toBe('reject');
    expect(decideRemoteProject('null', local).action).toBe('reject');
  });

  it('構造不正 (validateProjectShape 落ち) は reject', () => {
    const decision = decideRemoteProject(JSON.stringify({ version: 4, tabs: [] }), local);
    expect(decision.action).toBe('reject');
    if (decision.action === 'reject') expect(decision.reason).toContain('構造が不正');
  });
});

describe('decideRemoteProject — stale-client (相手の方が新しいスキーマ)', () => {
  it('version がこのクライアントの対応上限より大きい場合は stale-client', () => {
    const local = makeLocal();
    const newer = { ...local, version: CURRENT_PROJECT_VERSION + 1 };
    const decision = decideRemoteProject(JSON.stringify(newer), local);
    expect(decision).toEqual({ action: 'stale-client', version: CURRENT_PROJECT_VERSION + 1 });
  });
});

describe('decideRemoteProject — identical / apply', () => {
  it('ローカルと同内容なら identical (キー順が違っても)', () => {
    const local = makeLocal();
    // JSON 経由でキー順を変えたコピー (逆順に再構築)
    const parsed = JSON.parse(JSON.stringify(local));
    const reversed = Object.fromEntries(Object.entries(parsed).reverse());
    expect(decideRemoteProject(JSON.stringify(reversed), local).action).toBe('identical');
  });

  it('内容が違えば apply され、migrate + cleanSchedule 済みの project を返す', () => {
    const local = makeLocal();
    const remote = JSON.parse(JSON.stringify(local));
    remote.name = 'タブレットで編集';
    // 存在しない entity を指す schedule ゴミ → cleanSchedule で落ちるはず
    remote.tabs[0].schedule = {
      'd1-p1-c1': { subject: '英語', teacher: '堀上' },
      'd999-p1-c1': { subject: '数学', teacher: '未定' },
    };
    const decision = decideRemoteProject(JSON.stringify(remote), local);
    expect(decision.action).toBe('apply');
    if (decision.action === 'apply') {
      expect(decision.project.name).toBe('タブレットで編集');
      expect(decision.project.tabs[0].schedule['d1-p1-c1']).toBeTruthy();
      expect(decision.project.tabs[0].schedule['d999-p1-c1']).toBeUndefined();
    }
  });

  it('旧 version (v2) の payload は migrate されて apply される', () => {
    const local = makeLocal();
    const v2 = {
      version: 2,
      name: '旧形式',
      activeTabId: 1,
      teachers: [],
      tabs: [
        {
          id: 1,
          name: '中３',
          config: structuredClone(DEFAULT_TAB_CONFIG_BASE),
          schedule: {},
        },
      ],
    };
    const decision = decideRemoteProject(JSON.stringify(v2), local);
    expect(decision.action).toBe('apply');
    if (decision.action === 'apply') {
      expect(decision.project.version).toBe(CURRENT_PROJECT_VERSION);
      expect(decision.project.name).toBe('旧形式');
      // v4 で dates / periods は project レベルへ昇格している
      expect(Array.isArray(decision.project.dates)).toBe(true);
      expect(Array.isArray(decision.project.periods)).toBe(true);
    }
  });
});
