// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import TeacherManager from './TeacherManager';
import { ProjectContext } from '../../contexts/projectContextValue';
import { UIContext } from '../../contexts/uiContextValue';

afterEach(cleanup);

function renderManager({ project: projectOverride = {}, ui = {} } = {}) {
  const fns = {
    addTeacher: vi.fn(),
    importTeachers: vi.fn(),
    removeTeacher: vi.fn(),
    renameTeacher: vi.fn(),
    toggleTeacherSubject: vi.fn(),
  };
  const projectValue = {
    project: { teachers: [], subjects: ['英語', '数学', '国語', '理科', '社会'], ...projectOverride },
    commonSubjects: ['英語', '数学', '国語', '理科', '社会'],
    ...fns,
  };
  const uiValue = {
    showConfirm: vi.fn().mockResolvedValue(true),
    showInput: vi.fn().mockResolvedValue(null),
    showToast: vi.fn(),
    ...ui,
  };
  render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={uiValue}>
        <TeacherManager />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { fns, uiValue };
}

const csvFile = (text, name = 'teachers.csv', type = 'text/csv') =>
  new File([text], name, { type });

const openPanel = () => fireEvent.click(screen.getByText('📥 CSV インポート'));

describe('TeacherManager — CSV ファイル取り込み (E2a)', () => {
  it('「📂 ファイルを選択」で読み込むと textarea に反映され parse preview が出る', async () => {
    const { uiValue } = renderManager();
    openPanel();
    const input = screen.getByLabelText('CSV ファイルを選択');
    fireEvent.change(input, { target: { files: [csvFile('name,subjects\n山田,数学|理科')] } });

    const textarea = screen.getByLabelText('講師マスタ CSV テキスト');
    await waitFor(() => expect(textarea).toHaveValue('name,subjects\n山田,数学|理科'));
    // parse 成功のプレビュー (1 件)
    expect(screen.getByText('1 件')).toBeInTheDocument();
    expect(uiValue.showToast).toHaveBeenCalledWith(expect.stringContaining('teachers.csv'), 'success', 2000);
  });

  it('ドラッグ&ドロップでも読み込める', async () => {
    renderManager();
    openPanel();
    const textarea = screen.getByLabelText('講師マスタ CSV テキスト');
    fireEvent.drop(textarea, { dataTransfer: { files: [csvFile('name,subjects\n佐藤,英語')] } });
    await waitFor(() => expect(textarea).toHaveValue('name,subjects\n佐藤,英語'));
  });

  it('CSV でない拡張子はエラー toast を出し textarea を変更しない', async () => {
    const { uiValue } = renderManager();
    openPanel();
    const input = screen.getByLabelText('CSV ファイルを選択');
    fireEvent.change(input, { target: { files: [csvFile('dummy', 'photo.png', 'image/png')] } });

    await waitFor(() =>
      expect(uiValue.showToast).toHaveBeenCalledWith(expect.stringContaining('CSV'), 'error', 3000),
    );
    expect(screen.getByLabelText('講師マスタ CSV テキスト')).toHaveValue('');
  });
});
