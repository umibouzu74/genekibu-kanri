// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

// 教科グループ表示は project.teachers の index を並べ替えるので、
// 削除 / rename / 科目トグルが「表示位置」でなく「元の teachers index」で
// dispatch されることを固定する (E3e)。
// 配列順: [山田(数学), 堀上(英語)] / グループ順: 英語(堀上) → 数学(山田)
const GROUPED_TEACHERS = [
  { name: '山田', subjects: ['数学'] },
  { name: '堀上', subjects: ['英語'] },
];

const rowOf = (name) => screen.getByText(name).closest('tr');

describe('TeacherManager — 講師の追加 / 削除', () => {
  it('「+ 追加」は showInput の入力名で addTeacher を呼ぶ', async () => {
    const { fns, uiValue } = renderManager({
      ui: { showInput: vi.fn().mockResolvedValue('新井') },
    });
    fireEvent.click(screen.getByText('+ 追加'));
    await waitFor(() => expect(fns.addTeacher).toHaveBeenCalledWith('新井'));
    expect(uiValue.showInput).toHaveBeenCalledTimes(1);
  });

  it('showInput がキャンセル (null) なら addTeacher を呼ばない', async () => {
    const { fns, uiValue } = renderManager();
    fireEvent.click(screen.getByText('+ 追加'));
    await waitFor(() => expect(uiValue.showInput).toHaveBeenCalledTimes(1));
    expect(fns.addTeacher).not.toHaveBeenCalled();
  });

  it('× は confirm 後に「元の teachers index」で removeTeacher を呼ぶ (グループ表示で並びが変わっても正しい)', async () => {
    const { fns, uiValue } = renderManager({
      project: { teachers: GROUPED_TEACHERS },
    });
    // グループ表示では 堀上 (英語) が先頭に来るが、teachers 配列上は index 1
    fireEvent.click(within(rowOf('堀上')).getByText('×'));
    await waitFor(() => expect(fns.removeTeacher).toHaveBeenCalledWith(1));
    expect(uiValue.showConfirm).toHaveBeenCalledWith(
      expect.stringContaining('堀上'),
      expect.objectContaining({ danger: true }),
    );
  });

  it('confirm を拒否したら removeTeacher を呼ばない', async () => {
    const { fns, uiValue } = renderManager({
      project: { teachers: GROUPED_TEACHERS },
      ui: { showConfirm: vi.fn().mockResolvedValue(false) },
    });
    fireEvent.click(within(rowOf('山田')).getByText('×'));
    await waitFor(() => expect(uiValue.showConfirm).toHaveBeenCalledTimes(1));
    expect(fns.removeTeacher).not.toHaveBeenCalled();
  });
});

describe('TeacherManager — 名前の変更 (InlineNameEdit)', () => {
  it('名前クリック → 編集 → Enter で renameTeacher(元 index, 新名)', () => {
    const { fns } = renderManager({ project: { teachers: GROUPED_TEACHERS } });
    fireEvent.click(screen.getByText('堀上'));
    const input = screen.getByDisplayValue('堀上');
    fireEvent.change(input, { target: { value: '堀上 太郎' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(fns.renameTeacher).toHaveBeenCalledWith(1, '堀上 太郎');
  });

  it('blur でも commit される', () => {
    const { fns } = renderManager({ project: { teachers: GROUPED_TEACHERS } });
    fireEvent.click(screen.getByText('山田'));
    const input = screen.getByDisplayValue('山田');
    fireEvent.change(input, { target: { value: '山田2' } });
    fireEvent.blur(input);
    expect(fns.renameTeacher).toHaveBeenCalledWith(0, '山田2');
  });

  it('Escape は編集を破棄して rename しない', () => {
    const { fns } = renderManager({ project: { teachers: GROUPED_TEACHERS } });
    fireEvent.click(screen.getByText('堀上'));
    const input = screen.getByDisplayValue('堀上');
    fireEvent.change(input, { target: { value: '書き換え中' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(fns.renameTeacher).not.toHaveBeenCalled();
    // 表示は元の名前に戻る
    expect(screen.getByText('堀上')).toBeInTheDocument();
  });

  it('同名のまま / 空白のみでは rename しない', () => {
    const { fns } = renderManager({ project: { teachers: GROUPED_TEACHERS } });
    fireEvent.click(screen.getByText('堀上'));
    const input = screen.getByDisplayValue('堀上');
    fireEvent.keyDown(input, { key: 'Enter' }); // 変更なし
    fireEvent.click(screen.getByText('堀上'));
    const input2 = screen.getByDisplayValue('堀上');
    fireEvent.change(input2, { target: { value: '   ' } });
    fireEvent.keyDown(input2, { key: 'Enter' }); // 空白のみ
    expect(fns.renameTeacher).not.toHaveBeenCalled();
  });
});

describe('TeacherManager — 担当科目トグル', () => {
  it('科目チップのチェックで toggleTeacherSubject(元 index, 科目名) を呼ぶ', () => {
    const { fns } = renderManager({ project: { teachers: GROUPED_TEACHERS } });
    // 行内のチェックボックスは commonSubjects 順 (英語, 数学, 国語, 理科, 社会)
    const checkboxes = within(rowOf('堀上')).getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(5);
    fireEvent.click(checkboxes[1]); // 数学
    expect(fns.toggleTeacherSubject).toHaveBeenCalledWith(1, '数学');
  });
});

describe('TeacherManager — CSV インポート実行 (E3e)', () => {
  const typeCsv = (text) =>
    fireEvent.change(screen.getByLabelText('講師マスタ CSV テキスト'), { target: { value: text } });

  it('「追加 / 更新」は confirm なしで importTeachers(rows, append) を呼びパネルを閉じる', () => {
    const { fns, uiValue } = renderManager();
    openPanel();
    typeCsv('name,subjects\n山田,数学|理科');
    fireEvent.click(screen.getByText('追加 / 更新'));
    expect(uiValue.showConfirm).not.toHaveBeenCalled();
    expect(fns.importTeachers).toHaveBeenCalledWith(
      [{ name: '山田', subjects: ['数学', '理科'] }],
      'append',
    );
    expect(uiValue.showToast).toHaveBeenCalledWith(
      expect.stringContaining('追加 / 更新'), 'success', 4000,
    );
    // パネルは閉じ、textarea は破棄される
    expect(screen.queryByLabelText('講師マスタ CSV テキスト')).toBeNull();
  });

  it('「全置換」は confirm 承認後に importTeachers(rows, replace) を呼ぶ', async () => {
    const { fns, uiValue } = renderManager({
      project: { teachers: [{ name: '旧講師', subjects: ['英語'] }] },
    });
    openPanel();
    typeCsv('name,subjects\n佐藤,英語');
    fireEvent.click(screen.getByText('全置換'));
    await waitFor(() =>
      expect(fns.importTeachers).toHaveBeenCalledWith([{ name: '佐藤', subjects: ['英語'] }], 'replace'),
    );
    // 既存件数と CSV 件数を confirm 文言で提示する
    expect(uiValue.showConfirm).toHaveBeenCalledWith(
      expect.stringMatching(/1 件の講師を破棄して、CSV の 1 件で置き換え/),
      expect.objectContaining({ danger: true }),
    );
  });

  it('「全置換」の confirm を拒否したら import しない (パネルも開いたまま)', async () => {
    const { fns, uiValue } = renderManager({
      ui: { showConfirm: vi.fn().mockResolvedValue(false) },
    });
    openPanel();
    typeCsv('name,subjects\n佐藤,英語');
    fireEvent.click(screen.getByText('全置換'));
    await waitFor(() => expect(uiValue.showConfirm).toHaveBeenCalledTimes(1));
    expect(fns.importTeachers).not.toHaveBeenCalled();
    expect(screen.getByLabelText('講師マスタ CSV テキスト')).toBeInTheDocument();
  });

  it('parse 済み行が 0 件ならインポートボタンは disabled', () => {
    renderManager();
    openPanel();
    typeCsv('name,subjects\n,数学'); // name 空 → エラー行のみ
    expect(screen.getByText('追加 / 更新')).toBeDisabled();
    expect(screen.getByText('全置換')).toBeDisabled();
  });

  it('未登録科目は warning としてプレビューに表示する', () => {
    renderManager();
    openPanel();
    typeCsv('name,subjects\n佐藤,プログラミング');
    expect(screen.getByText(/未登録科目:/)).toBeInTheDocument();
    expect(screen.getByText('プログラミング')).toBeInTheDocument();
  });

  it('キャンセルはパネルを閉じ import を呼ばない', () => {
    const { fns } = renderManager();
    openPanel();
    typeCsv('name,subjects\n佐藤,英語');
    fireEvent.click(screen.getByText('キャンセル'));
    expect(fns.importTeachers).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('講師マスタ CSV テキスト')).toBeNull();
  });
});

describe('TeacherManager — 担当科目未設定の警告 (L1g)', () => {
  it('担当科目が空の講師が居れば人数と名前を警告表示する', () => {
    renderManager({
      project: {
        teachers: [
          { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
          { name: '新人A', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [] },
          { name: '新人B', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [] },
        ],
      },
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('担当科目が未設定の講師が 2 名います');
    expect(alert).toHaveTextContent('新人A・新人B');
  });

  it("placeholder の '未定' は担当が空でも警告対象にしない", () => {
    renderManager({
      project: {
        teachers: [
          { name: '未定', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [] },
          { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
        ],
      },
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('全員に担当科目があれば警告を出さない', () => {
    renderManager({
      project: {
        teachers: [
          { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
        ],
      },
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
