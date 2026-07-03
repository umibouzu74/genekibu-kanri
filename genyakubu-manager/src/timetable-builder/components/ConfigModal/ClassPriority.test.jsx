// @vitest-environment jsdom
// F2a: クラス優先度セルのキーボード操作を固定する。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import ClassPriority from './ClassPriority';
import { ProjectContext } from '../../contexts/projectContextValue';

afterEach(cleanup);

function renderPriority() {
  const toggleTeacherClassPriority = vi.fn();
  const projectValue = {
    project: {
      teachers: [{ name: '堀上', subjects: ['英語'], ngClasses: [], priorityClasses: ['３S'] }],
      subjects: ['英語'],
    },
    currentConfig: {
      classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
    },
    toggleTeacherClassPriority,
  };
  const utils = render(
    <ProjectContext.Provider value={projectValue}>
      <ClassPriority />
    </ProjectContext.Provider>,
  );
  return { ...utils, toggleTeacherClassPriority };
}

describe('ClassPriority — キーボード操作 (F2a)', () => {
  it('セルは role="button" + tabIndex=0 で状態を aria-label に含む', () => {
    renderPriority();
    const cell = screen.getByLabelText('堀上 ３S: 優先 (切替)');
    expect(cell).toHaveAttribute('tabindex', '0');
    expect(screen.getByLabelText('堀上 ３A: 普通 (切替)')).toBeInTheDocument();
  });

  it('Enter / Space で切替が発火する (click と同経路)', () => {
    const { toggleTeacherClassPriority } = renderPriority();
    const cell = screen.getByLabelText('堀上 ３A: 普通 (切替)');
    fireEvent.keyDown(cell, { key: 'Enter' });
    expect(toggleTeacherClassPriority).toHaveBeenCalledWith(0, '３A');
    fireEvent.keyDown(cell, { key: ' ' });
    expect(toggleTeacherClassPriority).toHaveBeenCalledTimes(2);
  });

  it('無関係なキーでは発火しない', () => {
    const { toggleTeacherClassPriority } = renderPriority();
    fireEvent.keyDown(screen.getByLabelText('堀上 ３A: 普通 (切替)'), { key: 'Tab' });
    expect(toggleTeacherClassPriority).not.toHaveBeenCalled();
  });
});
