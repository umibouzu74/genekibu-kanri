// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
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

function renderManager(overrides = {}) {
  const handleSubjectCountChange = vi.fn();
  const project = makeProject();
  const projectValue = {
    project,
    commonSubjects: ['英語', '数学'],
    addSubject: vi.fn(),
    removeSubject: vi.fn(),
    reorderSubjects: vi.fn(),
    handleSubjectCountChange,
    ...overrides,
  };
  const uiValue = { showInput: vi.fn(), showConfirm: vi.fn() };
  render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={uiValue}>
        <SubjectManager />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { handleSubjectCountChange };
}

describe('SubjectManager — タブ別コマ数', () => {
  it('科目ごとに各タブのコマ数入力を表示する', () => {
    renderManager();
    expect(screen.getByLabelText('中３ の 英語 コマ数')).toHaveValue(4);
    expect(screen.getByLabelText('中１・２ の 英語 コマ数')).toHaveValue(2);
    expect(screen.getByLabelText('中３ の 数学 コマ数')).toHaveValue(5);
    expect(screen.getByLabelText('中１・２ の 数学 コマ数')).toHaveValue(3);
  });

  it('入力変更は対象タブの id 付きで handleSubjectCountChange を呼ぶ', () => {
    const { handleSubjectCountChange } = renderManager();
    fireEvent.change(screen.getByLabelText('中１・２ の 英語 コマ数'), { target: { value: '6' } });
    expect(handleSubjectCountChange).toHaveBeenCalledWith('英語', '6', 2);
  });
});
