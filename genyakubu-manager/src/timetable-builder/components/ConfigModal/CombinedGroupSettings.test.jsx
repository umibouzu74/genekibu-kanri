// @vitest-environment jsdom
// F5n: 合同グループの新規・編集が draft-commit 方式であることを固定する。
// 旧実装は編集時に即 dispatch していたため、単クラス・対象日 0 日の
// 「合同」グループが検証を素通りして恒久化できた。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import CombinedGroupSettings from './CombinedGroupSettings';
import { ProjectContext } from '../../contexts/projectContextValue';

afterEach(cleanup);

const GROUP = { id: 1, subject: '英語', classes: ['A', 'B'], dates: null };

function renderSettings({ combinedGroups = [GROUP] } = {}) {
  const addCombinedGroup = vi.fn();
  const updateCombinedGroup = vi.fn();
  const removeCombinedGroup = vi.fn();
  const projectValue = {
    project: { combinedGroups },
    currentConfig: {
      classes: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }, { id: 3, label: 'C' }],
      dates: [{ id: 1, label: '7/1' }, { id: 2, label: '7/2' }],
    },
    commonSubjects: ['英語', '数学'],
    addCombinedGroup,
    updateCombinedGroup,
    removeCombinedGroup,
  };
  const utils = render(
    <ProjectContext.Provider value={projectValue}>
      <CombinedGroupSettings />
    </ProjectContext.Provider>,
  );
  return { ...utils, addCombinedGroup, updateCombinedGroup, removeCombinedGroup };
}

describe('CombinedGroupSettings — draft-commit (F5n)', () => {
  it('編集中の操作は保存まで dispatch されない', () => {
    const { updateCombinedGroup } = renderSettings();
    fireEvent.click(screen.getByText('編集'));
    // クラス C を追加 (draft のみ)
    fireEvent.click(screen.getByText('C'));
    expect(updateCombinedGroup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('保存'));
    expect(updateCombinedGroup).toHaveBeenCalledTimes(1);
    expect(updateCombinedGroup).toHaveBeenCalledWith(1, {
      subject: '英語',
      classes: ['A', 'B', 'C'],
      dates: null,
    });
  });

  it('クラスを 1 つまで減らすと保存できずエラーメッセージが出る', () => {
    const { updateCombinedGroup } = renderSettings();
    fireEvent.click(screen.getByText('編集'));
    fireEvent.click(screen.getByText('B')); // A のみ残る
    expect(screen.getByText('2つ以上のクラスを選択してください')).toBeInTheDocument();
    const save = screen.getByText('保存');
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(updateCombinedGroup).not.toHaveBeenCalled();
  });

  it('「全日程」を外して対象日 0 日のままでは保存できない', () => {
    const { updateCombinedGroup } = renderSettings();
    fireEvent.click(screen.getByText('編集'));
    fireEvent.click(screen.getByLabelText('全日程'));
    expect(screen.getByText('対象日程を選択するか「全日程」にしてください')).toBeInTheDocument();
    expect(screen.getByText('保存')).toBeDisabled();
    // 日を 1 つ選べば保存できる
    fireEvent.click(screen.getByText('7/1'));
    fireEvent.click(screen.getByText('保存'));
    expect(updateCombinedGroup).toHaveBeenCalledWith(1, {
      subject: '英語',
      classes: ['A', 'B'],
      dates: ['7/1'],
    });
  });

  it('キャンセルすると draft は破棄され dispatch されない', () => {
    const { updateCombinedGroup } = renderSettings();
    fireEvent.click(screen.getByText('編集'));
    fireEvent.click(screen.getByText('C'));
    fireEvent.click(screen.getByText('キャンセル'));
    expect(updateCombinedGroup).not.toHaveBeenCalled();
    // 一覧表示に戻る (editor が閉じる)
    expect(screen.queryByText('保存')).toBeNull();
  });

  it('新規追加も 2 クラス未満では追加できない (従来ガードの維持)', () => {
    const { addCombinedGroup } = renderSettings({ combinedGroups: [] });
    fireEvent.click(screen.getByText('+ 合同グループを追加'));
    fireEvent.click(screen.getByText('A'));
    expect(screen.getByText('追加')).toBeDisabled();
    fireEvent.click(screen.getByText('B'));
    fireEvent.click(screen.getByText('追加'));
    expect(addCombinedGroup).toHaveBeenCalledWith({
      subject: '英語',
      classes: ['A', 'B'],
      dates: null,
    });
  });
});
