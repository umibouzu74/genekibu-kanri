// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import Toolbar from './Toolbar';
import { ProjectContext } from '../contexts/projectContextValue';
import { UIContext } from '../contexts/uiContextValue';
import { makeKey } from '../utils/scheduleKey';

// jsdom は scrollIntoView 未実装なので prototype に spy を生やす。
// 各テストで上書きすると次のテストに mock が漏れるため、保存&復元する。
let originalScrollIntoView;
let scrollSpy;
beforeEach(() => {
  originalScrollIntoView = Element.prototype.scrollIntoView;
  scrollSpy = vi.fn();
  Element.prototype.scrollIntoView = scrollSpy;
});
afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  cleanup();
});

const defaultAnalysis = () => ({
  errorKeys: [],
  conflictMap: {},
  subjectOrders: {},
  dailySubjectMap: {},
  teacherDailyCounts: {},
  tabErrorCounts: {},
  violations: {
    teacherConflict: { count: 0, firstKey: null },
    teacherNgAssigned: { count: 0, firstKey: null },
    subjectDup: { count: 0, firstKey: null },
    subjectOver: { count: 0, firstKey: null },
    teacherOverDaily: { count: 0, items: [] },
  },
  infeasibilities: {
    noTeacherForSlot: { count: 0, items: [] },
    subjectCapacityShortage: { count: 0, items: [] },
  },
});

// 必要な context value を mock してから Toolbar を render する。
// projectOverrides.analysis は defaultAnalysis() に対する shallow merge
// (violations 等の必須フィールドを毎テストで書き直さなくて良いように)。
function renderToolbar({ projectOverrides = {}, uiOverrides = {}, props = {} } = {}) {
  const { analysis: analysisOverride, ...restProjectOverrides } = projectOverrides;
  const projectValue = {
    analysis: { ...defaultAnalysis(), ...analysisOverride },
    dashboard: { progress: 0, filled: 0, total: 100 },
    historyIndex: 0,
    history: [{}],
    undo: vi.fn(),
    redo: vi.fn(),
    handleClearUnlocked: vi.fn(),
    // SnapshotMenu (Toolbar 内に同梱) が参照する最小 context。
    project: { snapshots: [] },
    activeTab: { id: 1, name: 'メイン' },
    currentSchedule: {},
    currentConfig: { dates: [], periods: [], classes: [] },
    saveSnapshot: vi.fn(),
    applySnapshot: vi.fn(),
    renameSnapshot: vi.fn(),
    removeSnapshot: vi.fn(),
    ...restProjectOverrides,
  };
  const uiValue = {
    showConfirm: vi.fn().mockResolvedValue(true),
    showToast: vi.fn(),
    showInput: vi.fn().mockResolvedValue(null),
    ...uiOverrides,
  };
  const defaultProps = {
    isCompact: false,
    setIsCompact: vi.fn(),
    showSummary: false,
    setShowSummary: vi.fn(),
    setShowConfig: vi.fn(),
    isGenerating: false,
    generateProgress: null,
    onGenerate: vi.fn(),
    ...props,
  };

  const utils = render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={uiValue}>
        <Toolbar {...defaultProps} />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { ...utils, projectValue, uiValue, props: defaultProps };
}

describe('Toolbar', () => {
  it('errorKeys が空のときは ✨ OK を表示', () => {
    renderToolbar();
    expect(screen.getByText(/✨ OK/)).toBeInTheDocument();
  });

  it('errorKeys がある時は ⚠️N件 ボタンを表示する', () => {
    renderToolbar({
      projectOverrides: {
        analysis: {
          errorKeys: ['k1', 'k2', 'k3'],
          conflictMap: {}, subjectOrders: {}, dailySubjectMap: {}, teacherDailyCounts: {}, tabErrorCounts: {},
          violations: {
            teacherConflict: { count: 3, firstKey: 'k1' },
            subjectDup: { count: 0, firstKey: null },
            subjectOver: { count: 0, firstKey: null },
            teacherOverDaily: { count: 0, items: [] },
          },
        },
      },
    });
    expect(screen.getByText(/⚠️ 3件/)).toBeInTheDocument();
  });

  it('種別が teacherConflict のみのとき、⚠️N件 クリックで即スクロール (popover を開かない)', () => {
    const errorKey = makeKey(1, 2, 3);
    const target = document.createElement('div');
    target.id = `select-1-2-3-cell`;
    document.body.appendChild(target);

    renderToolbar({
      projectOverrides: {
        analysis: {
          errorKeys: [errorKey],
          conflictMap: {}, subjectOrders: {}, dailySubjectMap: {}, teacherDailyCounts: {}, tabErrorCounts: {},
          violations: {
            teacherConflict: { count: 1, firstKey: errorKey },
            subjectDup: { count: 0, firstKey: null },
            subjectOver: { count: 0, firstKey: null },
            teacherOverDaily: { count: 0, items: [] },
          },
        },
      },
    });
    fireEvent.click(screen.getByText(/⚠️ 1件/));
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    // popover は開かない
    expect(screen.queryByRole('dialog', { name: '違反の内訳' })).not.toBeInTheDocument();
    document.body.removeChild(target);
  });

  it('違反種別が複数あるとき、⚠️N件 クリックで popover が開き内訳を表示する', () => {
    const key1 = makeKey(1, 1, 1);
    const key2 = makeKey(1, 2, 1);
    renderToolbar({
      projectOverrides: {
        analysis: {
          errorKeys: [key1],
          conflictMap: {}, subjectOrders: {}, dailySubjectMap: {}, teacherDailyCounts: {}, tabErrorCounts: {},
          violations: {
            teacherConflict: { count: 1, firstKey: key1 },
            subjectDup: { count: 2, firstKey: key2 },
            subjectOver: { count: 0, firstKey: null },
            teacherOverDaily: { count: 1, items: [{ date: '12/25(木)', teacher: '堀上', total: 7, max: 6 }] },
          },
        },
      },
    });
    // ⚠️合計件数 (1 + 2 + 1) = 4
    fireEvent.click(screen.getByText(/⚠️ 4件/));
    const popover = screen.getByRole('dialog', { name: '違反の内訳' });
    expect(popover).toBeInTheDocument();
    expect(screen.getByText('講師重複')).toBeInTheDocument();
    expect(screen.getByText('同一クラス×同日に同一科目')).toBeInTheDocument();
    expect(screen.getByText(/講師日上限超/)).toBeInTheDocument();
    expect(screen.getByText(/7\/6/)).toBeInTheDocument();
  });

  it('popover 内の「→」クリックで該当セルへスクロールして popover が閉じる', () => {
    const key = makeKey(2, 3, 1);
    const target = document.createElement('div');
    target.id = `select-2-3-1-cell`;
    document.body.appendChild(target);

    renderToolbar({
      projectOverrides: {
        analysis: {
          errorKeys: [], conflictMap: {}, subjectOrders: {}, dailySubjectMap: {}, teacherDailyCounts: {}, tabErrorCounts: {},
          violations: {
            teacherConflict: { count: 0, firstKey: null },
            subjectDup: { count: 1, firstKey: key },
            subjectOver: { count: 1, firstKey: key },
            teacherOverDaily: { count: 0, items: [] },
          },
        },
      },
    });
    fireEvent.click(screen.getByText(/⚠️ 2件/));
    // 種別 2 つ + 「→」も 2 つ
    const jumpBtns = screen.getAllByTitle('最初の該当セルへ移動');
    expect(jumpBtns).toHaveLength(2);
    fireEvent.click(jumpBtns[0]);
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    // popover が閉じている
    expect(screen.queryByRole('dialog', { name: '違反の内訳' })).not.toBeInTheDocument();
    document.body.removeChild(target);
  });

  it('popover 外クリックで popover が閉じる', () => {
    const key = makeKey(1, 1, 1);
    renderToolbar({
      projectOverrides: {
        analysis: {
          errorKeys: [], conflictMap: {}, subjectOrders: {}, dailySubjectMap: {}, teacherDailyCounts: {}, tabErrorCounts: {},
          violations: {
            teacherConflict: { count: 1, firstKey: key },
            subjectDup: { count: 1, firstKey: key },
            subjectOver: { count: 0, firstKey: null },
            teacherOverDaily: { count: 0, items: [] },
          },
        },
      },
    });
    fireEvent.click(screen.getByText(/⚠️ 2件/));
    expect(screen.getByRole('dialog', { name: '違反の内訳' })).toBeInTheDocument();
    // 外側 (document.body) を mousedown
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog', { name: '違反の内訳' })).not.toBeInTheDocument();
  });

  it('progress を 0-100% で表示する', () => {
    renderToolbar({
      projectOverrides: {
        dashboard: { progress: 73, filled: 7, total: 10 },
        analysis: { errorKeys: [], conflictMap: {}, subjectOrders: {}, dailySubjectMap: {}, teacherDailyCounts: {} },
      },
    });
    expect(screen.getByText('73%')).toBeInTheDocument();
  });

  it('historyIndex が 0 のとき undo は disabled', () => {
    renderToolbar({ projectOverrides: { historyIndex: 0, history: [{}] } });
    const undoBtn = screen.getByTitle('元に戻す (Undo)');
    expect(undoBtn).toBeDisabled();
  });

  it('history の末尾なら redo は disabled', () => {
    renderToolbar({ projectOverrides: { historyIndex: 0, history: [{}] } });
    const redoBtn = screen.getByTitle('やり直す (Redo)');
    expect(redoBtn).toBeDisabled();
  });

  it('生成クリアボタン: confirm に OK で handleClearUnlocked を呼ぶ', async () => {
    const handleClearUnlocked = vi.fn();
    const showConfirm = vi.fn().mockResolvedValue(true);
    renderToolbar({
      projectOverrides: { handleClearUnlocked },
      uiOverrides: { showConfirm },
    });
    fireEvent.click(screen.getByTitle(/ロックされていないセルを全てクリア/));
    // showConfirm は Promise なので microtask を待つ
    await vi.waitFor(() => expect(showConfirm).toHaveBeenCalled());
    await vi.waitFor(() => expect(handleClearUnlocked).toHaveBeenCalled());
  });

  it('生成クリアボタン: confirm をキャンセルすると handleClearUnlocked を呼ばない', async () => {
    const handleClearUnlocked = vi.fn();
    const showConfirm = vi.fn().mockResolvedValue(false);
    renderToolbar({
      projectOverrides: { handleClearUnlocked },
      uiOverrides: { showConfirm },
    });
    fireEvent.click(screen.getByTitle(/ロックされていないセルを全てクリア/));
    await vi.waitFor(() => expect(showConfirm).toHaveBeenCalled());
    expect(handleClearUnlocked).not.toHaveBeenCalled();
  });

  it('isGenerating=true のとき生成ボタンは disabled + 進捗表示', () => {
    renderToolbar({ props: { isGenerating: true, generateProgress: { current: 1, total: 3 } } });
    const genBtn = screen.getByText(/生成中 \(1\/3\)/).closest('button');
    expect(genBtn).toBeDisabled();
  });

  it('生成中かつ onCancelGenerate ありで「✕ 中止」ボタンを表示し、クリックで呼ぶ', () => {
    const onCancelGenerate = vi.fn();
    renderToolbar({ props: { isGenerating: true, generateProgress: { current: 1, total: 3 }, onCancelGenerate } });
    const cancelBtn = screen.getByTitle('自動作成を中止する');
    expect(cancelBtn).toBeInTheDocument();
    fireEvent.click(cancelBtn);
    expect(onCancelGenerate).toHaveBeenCalledTimes(1);
  });

  it('生成中でなければ「✕ 中止」ボタンは描画しない', () => {
    renderToolbar({ props: { isGenerating: false, onCancelGenerate: vi.fn() } });
    expect(screen.queryByTitle('自動作成を中止する')).not.toBeInTheDocument();
  });

  it('onShowHelp が渡されると ❓ヘルプ ボタンを表示し、クリックで呼ぶ', () => {
    const onShowHelp = vi.fn();
    renderToolbar({ props: { onShowHelp } });
    const helpBtn = screen.getByTitle('操作ガイドを表示');
    expect(helpBtn).toBeInTheDocument();
    fireEvent.click(helpBtn);
    expect(onShowHelp).toHaveBeenCalledTimes(1);
  });

  it('onShowHelp が無ければ ❓ヘルプ ボタンは描画しない', () => {
    renderToolbar();
    expect(screen.queryByTitle('操作ガイドを表示')).not.toBeInTheDocument();
  });

  // ─── a11y (D5a) ────────────────────────────────────────────────

  it('進捗バーに role="progressbar" + aria-valuenow が付く', () => {
    renderToolbar({
      projectOverrides: { dashboard: { progress: 42, filled: 4, total: 10 } },
    });
    const bar = screen.getByRole('progressbar', { name: '完成度' });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  // ─── D1c-C: 静的 infeasibility ─────────────────────────────────

  it('infeasibilities が 1 件以上ある時、popover に「設定の問題」セクションを表示する', () => {
    renderToolbar({
      projectOverrides: {
        analysis: {
          infeasibilities: {
            noTeacherForSlot: { count: 1, items: [{ date: '12/25', period: '1限', subject: '英語' }] },
            subjectCapacityShortage: { count: 1, items: [{ subject: '数学', demand: 30, capacity: 12, teacherCount: 1 }] },
          },
        },
      },
    });
    fireEvent.click(screen.getByText(/⚠️ 2件/));
    expect(screen.getByRole('dialog', { name: '違反の内訳' })).toBeInTheDocument();
    expect(screen.getByText(/設定の問題 \(2件\)/)).toBeInTheDocument();
    expect(screen.getByText(/12\/25 1限 の英語/)).toBeInTheDocument();
    expect(screen.getByText(/数学.*必要 30 コマ.*12/)).toBeInTheDocument();
  });

  it('infeasibility に suggestions があれば 💡 修正提案を表示する (E1g)', () => {
    renderToolbar({
      projectOverrides: {
        analysis: {
          infeasibilities: {
            noTeacherForSlot: {
              count: 1,
              items: [{
                date: '12/25', period: '1限', subject: '英語',
                suggestions: ['12/25 1限 の NG を解除する: 堀上', '別の時限なら担当可能: 2限'],
              }],
            },
            subjectCapacityShortage: { count: 0, items: [] },
          },
        },
      },
    });
    fireEvent.click(screen.getByText(/⚠️ 1件/));
    expect(screen.getByText('12/25 1限 の NG を解除する: 堀上')).toBeInTheDocument();
    expect(screen.getByText('別の時限なら担当可能: 2限')).toBeInTheDocument();
  });

  it('infeasibilities 単独 (violations は全 0) でも popover が開く', () => {
    renderToolbar({
      projectOverrides: {
        analysis: {
          infeasibilities: {
            noTeacherForSlot: { count: 0, items: [] },
            subjectCapacityShortage: { count: 1, items: [{ subject: '英語', demand: 16, capacity: 6, teacherCount: 1 }] },
          },
        },
      },
    });
    // totalViolationCount は infeasItems.length のみ = 1
    fireEvent.click(screen.getByText(/⚠️ 1件/));
    expect(screen.getByRole('dialog', { name: '違反の内訳' })).toBeInTheDocument();
    expect(screen.getByText(/設定の問題/)).toBeInTheDocument();
  });

  it('teacherNgAssigned があれば popover に「NG設定違反」行を表示する', () => {
    renderToolbar({
      projectOverrides: {
        analysis: {
          violations: {
            teacherConflict: { count: 0, firstKey: null },
            teacherNgAssigned: { count: 2, firstKey: 'k_ng' },
            subjectDup: { count: 0, firstKey: null },
            subjectOver: { count: 0, firstKey: null },
            teacherOverDaily: { count: 0, items: [] },
          },
        },
      },
    });
    fireEvent.click(screen.getByText(/⚠️ 2件/));
    expect(screen.getByRole('dialog', { name: '違反の内訳' })).toBeInTheDocument();
    expect(screen.getByText(/NG設定違反/)).toBeInTheDocument();
  });
});
