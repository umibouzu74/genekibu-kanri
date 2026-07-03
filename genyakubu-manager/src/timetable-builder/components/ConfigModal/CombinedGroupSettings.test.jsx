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

describe('CombinedGroupSettings — 重複グループの登録ガード (F5z)', () => {
  it('既存グループと科目・クラス・日程が重なる新規は追加できない', () => {
    const { addCombinedGroup } = renderSettings(); // 既存: 英語 A・B 全日程
    fireEvent.click(screen.getByText('+ 合同グループを追加'));
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    fireEvent.click(screen.getByRole('button', { name: 'C' }));
    // 英語 B・C は既存 (英語 A・B 全日程) とクラス B で重なる
    expect(screen.getByText(/既存の合同グループ.*と.*重なっています/)).toBeInTheDocument();
    const add = screen.getByText('追加');
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(addCombinedGroup).not.toHaveBeenCalled();
  });

  it('科目が違えば同じクラスの組でも追加できる', () => {
    const { addCombinedGroup } = renderSettings(); // 既存: 英語 A・B 全日程
    fireEvent.click(screen.getByText('+ 合同グループを追加'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '数学' } });
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    fireEvent.click(screen.getByText('追加'));
    expect(addCombinedGroup).toHaveBeenCalledWith({
      subject: '数学',
      classes: ['A', 'B'],
      dates: null,
    });
  });

  it('日程が重ならなければ同じ科目・クラスでも追加できる', () => {
    const dated = { id: 1, subject: '英語', classes: ['A', 'B'], dates: ['7/1'] };
    const { addCombinedGroup } = renderSettings({ combinedGroups: [dated] });
    fireEvent.click(screen.getByText('+ 合同グループを追加'));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    fireEvent.click(screen.getByLabelText('全日程')); // 全日程を外す
    fireEvent.click(screen.getByRole('button', { name: '7/2' }));
    fireEvent.click(screen.getByText('追加'));
    expect(addCombinedGroup).toHaveBeenCalledWith({
      subject: '英語',
      classes: ['A', 'B'],
      dates: ['7/2'],
    });
  });

  it('編集では自分自身とは競合しない (既存テストの保存経路の再確認)', () => {
    const { updateCombinedGroup } = renderSettings();
    fireEvent.click(screen.getByText('編集'));
    fireEvent.click(screen.getByText('保存'));
    expect(updateCombinedGroup).toHaveBeenCalledTimes(1);
  });
});

describe('CombinedGroupSettings — 削除経路 (E3e)', () => {
  // 合同グループの削除は cascade 無しの draft/list 操作なので confirm を
  // 挟まない (Undo 可能な単発 dispatch)。CLAUDE.md の削除 UX ルールの対象は
  // 親アプリの永続リソースで、こちらは reducer 経由の即時削除 + Undo。
  it('削除ボタンで removeCombinedGroup(id) を呼ぶ', () => {
    const { removeCombinedGroup } = renderSettings();
    fireEvent.click(screen.getByText('削除'));
    expect(removeCombinedGroup).toHaveBeenCalledWith(1);
  });

  it('編集中に別グループを削除しても編集中の draft は維持される', () => {
    const other = { id: 2, subject: '数学', classes: ['A', 'C'], dates: null };
    const { removeCombinedGroup } = renderSettings({ combinedGroups: [GROUP, other] });
    // group 1 を編集開始 (この行の削除ボタンは editor に置き換わる)
    fireEvent.click(screen.getAllByText('編集')[0]);
    expect(screen.getByText('保存')).toBeInTheDocument();
    // 残っている削除ボタンは group 2 のもの
    fireEvent.click(screen.getByText('削除'));
    expect(removeCombinedGroup).toHaveBeenCalledWith(2);
    // group 1 の編集 draft は開いたまま
    expect(screen.getByText('保存')).toBeInTheDocument();
  });
});

describe('CombinedGroupSettings — 他タブ由来グループは読み取り専用 (F5p)', () => {
  // combinedGroups は project 共有・ラベル参照。現タブに無いクラス / 日程を
  // 含むグループを編集すると、その要素が editor に表示されず解除も不能な
  // まま保存できてしまう (タブ混成グループ)。編集は全要素が揃うタブでのみ
  // 許可し、削除は孤立グループの掃除のため全タブで許可する。
  it('現タブに無いクラスを含むグループは編集 disabled + 案内表示', () => {
    // currentConfig.classes は A/B/C のみ — 「中1A」は他タブのクラス
    const crossTab = { id: 9, subject: '英語', classes: ['A', '中1A'], dates: null };
    const { updateCombinedGroup } = renderSettings({ combinedGroups: [crossTab] });
    const edit = screen.getByText('編集');
    expect(edit).toBeDisabled();
    fireEvent.click(edit);
    expect(updateCombinedGroup).not.toHaveBeenCalled();
    expect(screen.queryByText('保存')).toBeNull();
    expect(screen.getByText(/他タブのクラス・日程 \(中1A\) を含むため/)).toBeInTheDocument();
  });

  it('現タブに無い日程を含むグループも編集 disabled', () => {
    // currentConfig.dates は 7/1, 7/2 のみ — 8/1 は他タブの日程
    const crossDate = { id: 10, subject: '英語', classes: ['A', 'B'], dates: ['7/1', '8/1'] };
    renderSettings({ combinedGroups: [crossDate] });
    expect(screen.getByText('編集')).toBeDisabled();
    expect(screen.getByText(/\(8\/1\) を含むため/)).toBeInTheDocument();
  });

  it('全日程 (dates=null) は日程チェックの対象外 (クラスが揃えば編集可)', () => {
    renderSettings(); // GROUP: 英語 A・B 全日程
    expect(screen.getByText('編集')).toBeEnabled();
  });

  it('読み取り専用でも削除 (孤立グループの掃除) はできる', () => {
    const crossTab = { id: 9, subject: '英語', classes: ['A', '中1A'], dates: null };
    const { removeCombinedGroup } = renderSettings({ combinedGroups: [crossTab] });
    fireEvent.click(screen.getByText('削除'));
    expect(removeCombinedGroup).toHaveBeenCalledWith(9);
  });
});
