// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import SubjectManager from './SubjectManager';
import { ProjectContext } from '../../contexts/projectContextValue';
import { UIContext } from '../../contexts/uiContextValue';

afterEach(cleanup);

// 中３ / 中１・２ の 2 タブを持つ project。各タブで英語のコマ数が異なる。
function makeProject() {
  return {
    tabs: [
      { id: 1, name: '中３', config: { subjectCounts: { 英語: 4, 数学: 5 } }, schedule: {} },
      { id: 2, name: '中１・２', config: { subjectCounts: { 英語: 2, 数学: 3 } }, schedule: {} },
    ],
  };
}

function renderManager(overrides = {}, ui = {}) {
  const handleSubjectCountChange = vi.fn();
  const project = makeProject();
  const projectValue = {
    project,
    commonSubjects: ['英語', '数学'],
    addSubject: vi.fn(),
    addSubjects: vi.fn(),
    removeSubject: vi.fn(),
    reorderSubjects: vi.fn(),
    handleSubjectCountChange,
    fillSubjectCounts: vi.fn(),
    copySubjectCountsToOthers: vi.fn(),
    ...overrides,
  };
  const uiValue = {
    showInput: vi.fn().mockResolvedValue(null),
    showConfirm: vi.fn().mockResolvedValue(true),
    showToast: vi.fn(),
    ...ui,
  };
  render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={uiValue}>
        <SubjectManager />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { handleSubjectCountChange, projectValue, uiValue };
}

describe('SubjectManager — タブ別コマ数', () => {
  it('科目ごとに各タブのコマ数入力を表示する', () => {
    renderManager();
    expect(screen.getByLabelText('中３ の 英語 コマ数')).toHaveValue(4);
    expect(screen.getByLabelText('中１・２ の 英語 コマ数')).toHaveValue(2);
    expect(screen.getByLabelText('中３ の 数学 コマ数')).toHaveValue(5);
    expect(screen.getByLabelText('中１・２ の 数学 コマ数')).toHaveValue(3);
  });

  it('入力変更は blur 時に対象タブの id 付きで handleSubjectCountChange を呼ぶ (F2l: draft-commit)', () => {
    const { handleSubjectCountChange } = renderManager();
    const input = screen.getByLabelText('中１・２ の 英語 コマ数');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '6' } });
    // 入力途中 (フォーカス中) は commit されない
    expect(handleSubjectCountChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(handleSubjectCountChange).toHaveBeenCalledTimes(1);
    expect(handleSubjectCountChange).toHaveBeenCalledWith('英語', '6', 2);
  });

  it('変更せず blur した場合は commit しない (F2l)', () => {
    const { handleSubjectCountChange } = renderManager();
    const input = screen.getByLabelText('中１・２ の 英語 コマ数');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(handleSubjectCountChange).not.toHaveBeenCalled();
  });
});

describe('SubjectManager — 科目の追加 / 削除 (E3e)', () => {
  it('「+ 追加」は showInput の入力名で addSubject を呼ぶ', async () => {
    const { projectValue } = renderManager({}, { showInput: vi.fn().mockResolvedValue('情報') });
    fireEvent.click(screen.getByText('+ 追加'));
    await waitFor(() => expect(projectValue.addSubject).toHaveBeenCalledWith('情報'));
  });

  it('showInput がキャンセル (null) なら addSubject を呼ばない', async () => {
    const { projectValue, uiValue } = renderManager();
    fireEvent.click(screen.getByText('+ 追加'));
    await waitFor(() => expect(uiValue.showInput).toHaveBeenCalledTimes(1));
    expect(projectValue.addSubject).not.toHaveBeenCalled();
  });

  it('× は cascade 警告つき confirm 承認後に removeSubject(科目名) を呼ぶ', async () => {
    const { projectValue, uiValue } = renderManager();
    // 各行末尾の × ボタン (英語行 → 数学行 の順)
    fireEvent.click(screen.getAllByText('×')[0]);
    await waitFor(() => expect(projectValue.removeSubject).toHaveBeenCalledWith('英語'));
    expect(uiValue.showConfirm).toHaveBeenCalledWith(
      expect.stringContaining('講師の担当科目設定も削除されます'),
      expect.objectContaining({ danger: true }),
    );
  });

  it('confirm を拒否したら removeSubject を呼ばない', async () => {
    const { projectValue, uiValue } = renderManager({}, { showConfirm: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getAllByText('×')[1]);
    await waitFor(() => expect(uiValue.showConfirm).toHaveBeenCalledTimes(1));
    expect(projectValue.removeSubject).not.toHaveBeenCalled();
  });
});

describe('SubjectManager — 並び替え (E3e)', () => {
  it('▼ で reorderSubjects(idx, idx+1)、▲ で reorderSubjects(idx, idx-1)', () => {
    const { projectValue } = renderManager();
    fireEvent.click(screen.getAllByText('▼')[0]); // 英語を下へ
    expect(projectValue.reorderSubjects).toHaveBeenCalledWith(0, 1);
    fireEvent.click(screen.getAllByText('▲')[1]); // 数学を上へ
    expect(projectValue.reorderSubjects).toHaveBeenCalledWith(1, 0);
  });

  it('先頭の ▲ と末尾の ▼ は disabled で何も dispatch しない', () => {
    const { projectValue } = renderManager();
    const firstUp = screen.getAllByText('▲')[0];
    const lastDown = screen.getAllByText('▼')[1];
    expect(firstUp).toBeDisabled();
    expect(lastDown).toBeDisabled();
    fireEvent.click(firstUp);
    fireEvent.click(lastDown);
    expect(projectValue.reorderSubjects).not.toHaveBeenCalled();
  });
});

describe('SubjectManager — コマ数の一括操作 (L4a)', () => {
  it('⚡ で列の全科目を一括入力する (showInput の数値で fillSubjectCounts)', async () => {
    const fillSubjectCounts = vi.fn();
    const { uiValue } = renderManager(
      { fillSubjectCounts },
      { showInput: vi.fn().mockResolvedValue('4') },
    );
    fireEvent.click(screen.getByLabelText('中３ の全科目のコマ数を一括入力'));
    await waitFor(() => expect(fillSubjectCounts).toHaveBeenCalledWith(1, 4));
    expect(uiValue.showToast).toHaveBeenCalled();
  });

  it('⚡ の入力が非数ならエラー toast で何もしない', async () => {
    const fillSubjectCounts = vi.fn();
    const { uiValue } = renderManager(
      { fillSubjectCounts },
      { showInput: vi.fn().mockResolvedValue('abc') },
    );
    fireEvent.click(screen.getByLabelText('中３ の全科目のコマ数を一括入力'));
    await waitFor(() => expect(uiValue.showToast).toHaveBeenCalled());
    expect(uiValue.showToast.mock.calls[0][1]).toBe('error');
    expect(fillSubjectCounts).not.toHaveBeenCalled();
  });

  it('⧉ で confirm 承認後に copySubjectCountsToOthers を呼ぶ', async () => {
    const copySubjectCountsToOthers = vi.fn();
    const { uiValue } = renderManager({ copySubjectCountsToOthers });
    fireEvent.click(screen.getByLabelText('中３ のコマ数を他の全タブへコピー'));
    await waitFor(() => expect(copySubjectCountsToOthers).toHaveBeenCalledWith(1));
    expect(uiValue.showConfirm).toHaveBeenCalled();
  });
});

describe('SubjectManager — 科目の一括追加 (L4d)', () => {
  it('カンマ区切り入力は addSubjects (一括) を呼ぶ', async () => {
    const addSubjects = vi.fn();
    const addSubject = vi.fn();
    renderManager(
      { addSubjects, addSubject },
      { showInput: vi.fn().mockResolvedValue('情報, 小論文、理科') },
    );
    fireEvent.click(screen.getByText('+ 追加'));
    await waitFor(() => expect(addSubjects).toHaveBeenCalledWith(['情報', '小論文', '理科']));
    expect(addSubject).not.toHaveBeenCalled();
  });

  it('単一名は従来どおり addSubject を呼ぶ', async () => {
    const addSubjects = vi.fn();
    const addSubject = vi.fn();
    renderManager(
      { addSubjects, addSubject },
      { showInput: vi.fn().mockResolvedValue('情報') },
    );
    fireEvent.click(screen.getByText('+ 追加'));
    await waitFor(() => expect(addSubject).toHaveBeenCalledWith('情報'));
    expect(addSubjects).not.toHaveBeenCalled();
  });
});

describe('SubjectManager — 列合計と収容枠 (N4e)', () => {
  const projectWithCapacity = {
    dates: [{ id: 1, label: '1/1' }, { id: 2, label: '1/2' }],
    periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
    tabs: [
      // 収容枠 = 2 日 × 2 時限 × 1 クラス = 4
      { id: 1, name: '中３', config: { classes: [{ id: 1, label: 'A' }], subjectCounts: { 英語: 4, 数学: 5 } }, schedule: {} },
      { id: 2, name: '中１・２', config: { classes: [{ id: 1, label: 'A' }], subjectCounts: { 英語: 2, 数学: 1 } }, schedule: {} },
    ],
  };

  it('タブごとの合計と収容枠を表示し、超過は警告表示になる', () => {
    renderManager({ project: projectWithCapacity });
    // 中３: 合計 9 > 枠 4 → 超過
    expect(screen.getByLabelText('中３ のコマ数合計 9、収容枠 4 (超過)')).toHaveTextContent('⚠9/4');
    // 中１・２: 合計 3 ≤ 枠 4 → 通常表示
    expect(screen.getByLabelText('中１・２ のコマ数合計 3、収容枠 4')).toHaveTextContent('3/4');
  });

  it('科目が無ければ合計行を出さない', () => {
    renderManager({ project: projectWithCapacity, commonSubjects: [] });
    expect(screen.queryByText('合計 / 収容枠')).toBeNull();
  });
});
