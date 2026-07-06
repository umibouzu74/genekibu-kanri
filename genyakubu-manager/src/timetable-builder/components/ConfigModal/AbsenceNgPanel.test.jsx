// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import AbsenceNgPanel from './AbsenceNgPanel';
import { ProjectContext } from '../../contexts/projectContextValue';
import { UIContext } from '../../contexts/uiContextValue';

// NgCsvImport も context を要求するが、ここでは AbsenceNgPanel 本体
// (プリセット複製 / 時刻 step) のみ検証したいので空に mock する。
vi.mock('./NgCsvImport', () => ({ default: () => null }));

afterEach(cleanup);

function renderPanel({ presets = [], overrides = {}, ui = {} } = {}) {
  const addExternalSessionPreset = vi.fn();
  const clearAllManualNg = vi.fn();
  const clearAllNg = vi.fn();
  const applyPresetMemosToSessions = vi.fn();
  const projectValue = {
    project: {
      teachers: [{ name: '堀上', subjects: ['英語'] }],
      subjects: ['英語'],
      externalSessions: [],
      externalSessionPresets: presets,
      externalCounts: {},
    },
    currentConfig: {
      dates: [{ id: 1, label: '7/24(金)' }, { id: 2, label: '7/31(金)' }],
      periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
    },
    handleExternalCountChange: vi.fn(),
    addExternalSessions: vi.fn(),
    removeExternalSession: vi.fn(),
    addExternalSessionPreset,
    updateExternalSessionPreset: vi.fn(),
    removeExternalSessionPreset: vi.fn(),
    toggleTeacherNg: vi.fn(),
    setNgBatch: vi.fn(),
    clearAllManualNg,
    clearAllNg,
    applyPresetMemosToSessions,
    analysis: { autoNgByTeacher: new Map() },
    ...overrides,
  };
  const uiValue = { showConfirm: vi.fn().mockResolvedValue(false), showToast: vi.fn(), ...ui };
  const utils = render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={uiValue}>
        <AbsenceNgPanel />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { ...utils, addExternalSessionPreset, clearAllManualNg, clearAllNg, applyPresetMemosToSessions, uiValue };
}

const SAMPLE_PRESET = {
  id: 1,
  name: '予備校1期3限目',
  startTime: '12:25',
  endTime: '13:35',
  startDateLabel: '7/24(金)',
  endDateLabel: '7/31(金)',
  memo: '予備校 / 高2 英語',
};

describe('AbsenceNgPanel — プリセット複製', () => {
  it('複製ボタンで名前に「(コピー)」を付け、時刻/期間/メモを引き継いで addPreset を呼ぶ', () => {
    const { addExternalSessionPreset } = renderPanel({ presets: [SAMPLE_PRESET] });
    // プリセット管理セクションを展開
    fireEvent.click(screen.getByText(/プリセット管理/));
    fireEvent.click(screen.getByLabelText('予備校1期3限目 を複製'));
    expect(addExternalSessionPreset).toHaveBeenCalledTimes(1);
    expect(addExternalSessionPreset).toHaveBeenCalledWith({
      name: '予備校1期3限目 (コピー)',
      startTime: '12:25',
      endTime: '13:35',
      startDateLabel: '7/24(金)',
      endDateLabel: '7/31(金)',
      memo: '予備校 / 高2 英語',
      teachers: [],
    });
  });

  it('時刻なしプリセットも空文字フィールドで複製できる', () => {
    const { addExternalSessionPreset } = renderPanel({
      presets: [{ id: 5, name: '朝練' }],
    });
    fireEvent.click(screen.getByText(/プリセット管理/));
    fireEvent.click(screen.getByLabelText('朝練 を複製'));
    expect(addExternalSessionPreset).toHaveBeenCalledWith({
      name: '朝練 (コピー)',
      startTime: '',
      endTime: '',
      startDateLabel: '',
      endDateLabel: '',
      memo: '',
      teachers: [],
    });
  });

  it('対象講師付きプリセットは teachers も引き継いで複製する (N4c)', () => {
    const { addExternalSessionPreset } = renderPanel({
      presets: [{ id: 7, name: '予備校', teachers: ['堀上'] }],
    });
    fireEvent.click(screen.getByText(/プリセット管理/));
    fireEvent.click(screen.getByLabelText('予備校 を複製'));
    expect(addExternalSessionPreset).toHaveBeenCalledWith(
      expect.objectContaining({ name: '予備校 (コピー)', teachers: ['堀上'] }),
    );
  });
});

describe('AbsenceNgPanel — プリセットの講師展開 (N4c)', () => {
  it('teachers 付きプリセットの適用で講師選択が展開され、不明講師は警告される', () => {
    const { uiValue } = renderPanel({
      presets: [{ id: 1, name: '予備校', teachers: ['堀上', '消えた先生'] }],
    });
    fireEvent.change(
      screen.getByLabelText('プリセットを選んで時刻・期間・メモをフォームに展開'),
      { target: { value: '1' } },
    );
    // 実在する堀上のみ選択される
    expect(screen.getByText(/選択 1 名/)).toBeInTheDocument();
    expect(uiValue.showToast).toHaveBeenCalledWith(
      expect.stringContaining('消えた先生'), 'warning', 4000,
    );
  });

  it('teachers なしプリセットは講師選択を変えない', () => {
    const { uiValue } = renderPanel({ presets: [{ id: 1, name: '朝練' }] });
    fireEvent.change(
      screen.getByLabelText('プリセットを選んで時刻・期間・メモをフォームに展開'),
      { target: { value: '1' } },
    );
    expect(screen.getByText(/選択 0 名/)).toBeInTheDocument();
    expect(uiValue.showToast).not.toHaveBeenCalled();
  });
});

describe('AbsenceNgPanel — 時刻入力の刻み', () => {
  it('まとめて登録の時刻入力が 5 分 (step=300) 刻みになっている', () => {
    renderPanel();
    expect(screen.getByLabelText('開始時刻')).toHaveAttribute('step', '300');
    expect(screen.getByLabelText('終了時刻')).toHaveAttribute('step', '300');
  });

  it('プリセット編集フォームの時刻入力も 5 分刻みになっている', () => {
    renderPanel({ presets: [SAMPLE_PRESET] });
    fireEvent.click(screen.getByText(/プリセット管理/));
    expect(screen.getByLabelText('プリセット開始時刻')).toHaveAttribute('step', '300');
    expect(screen.getByLabelText('プリセット終了時刻')).toHaveAttribute('step', '300');
  });
});

describe('AbsenceNgPanel — 期間指定のカレンダー順解決 (F5j)', () => {
  // プールは挿入順 (tabDates/setByLabels の末尾 push) なので、後からタブに
  // 前倒しの日付を足すとカレンダー順と乖離する。期間は配列位置の slice で
  // 解決されるため、生順のままだと選択範囲が別の日群に化けて NG が誤登録
  // される。パネルはカレンダーソート済みのプールを使うことを固定する。
  const outOfOrderProject = {
    teachers: [{ name: '堀上', subjects: ['英語'] }],
    subjects: ['英語'],
    externalSessions: [],
    externalSessionPresets: [],
    externalCounts: {},
    // 挿入順: 7/20, 7/25 が先で、7/15 が後から追加された状態
    dates: [
      { id: 1, label: '7/20(月)' },
      { id: 2, label: '7/25(土)' },
      { id: 3, label: '7/15(水)' },
    ],
    periods: [{ id: 1, label: '1限' }],
  };

  it('開始日/終了日 select がカレンダー順で並ぶ', () => {
    renderPanel({ overrides: { project: outOfOrderProject } });
    const startSelect = screen.getByLabelText('開始日');
    const labels = Array.from(startSelect.options).map(o => o.textContent);
    expect(labels).toEqual(['7/15(水)', '7/20(月)', '7/25(土)']);
  });

  it('まとめてNGはカレンダー上の範囲 (7/15〜7/25) に適用される', () => {
    const setNgBatch = vi.fn();
    const { container } = renderPanel({
      overrides: { project: outOfOrderProject, setNgBatch },
    });
    // NG モードへ切替
    fireEvent.click(container.querySelector('input[name="absence-ng-mode"][value="ng"]'));
    // 講師を全選択 (先頭の 全選択 ボタンが講師用)
    fireEvent.click(screen.getAllByText('全選択')[0]);
    // 開始 7/15 (id=3)、終了 7/25 (id=2)
    fireEvent.change(screen.getByLabelText('開始日'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('終了日'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('まとめてNGにする'));
    expect(setNgBatch).toHaveBeenCalledTimes(1);
    const [idxs, dateLabels, periodLabels, value] = setNgBatch.mock.calls[0];
    expect(idxs).toEqual([0]);
    // 挿入順 slice だと ['7/25(土)', '7/15(水)'] (+7/20 漏れ) になっていた
    expect(dateLabels).toEqual(['7/15(水)', '7/20(月)', '7/25(土)']);
    expect(periodLabels).toEqual(['1限']);
    expect(value).toBe(true);
  });
});

describe('AbsenceNgPanel — プリセット適用は全置換 (F5l)', () => {
  it('後から適用したプリセットにないフィールド (終了時刻・メモ) は空にリセットされる', () => {
    renderPanel({
      presets: [
        SAMPLE_PRESET, // 12:25-13:35 + メモあり
        { id: 2, name: '朝練', startTime: '08:00' }, // 開始のみ・メモなし
      ],
    });
    const applySelect = screen.getByLabelText('プリセットを選んで時刻・期間・メモをフォームに展開');
    // A (フル) を適用してから B (開始のみ) を適用
    fireEvent.change(applySelect, { target: { value: '1' } });
    expect(screen.getByLabelText('開始時刻')).toHaveValue('12:25');
    expect(screen.getByLabelText('終了時刻')).toHaveValue('13:35');
    fireEvent.change(applySelect, { target: { value: '2' } });
    expect(screen.getByLabelText('開始時刻')).toHaveValue('08:00');
    // 旧実装は A の終了時刻 13:35 とメモが残留し、08:00-13:35 の広域
    // 自動NG + 誤ったメモの混成セッションが登録できてしまった
    expect(screen.getByLabelText('終了時刻')).toHaveValue('');
  });
});

describe('AbsenceNgPanel — プリセット適用のメモ既定値 (プリセット名)', () => {
  const applySelect = () =>
    screen.getByLabelText('プリセットを選んで時刻・期間・メモをフォームに展開');
  const memoInput = () => screen.getByPlaceholderText('予備校 / 高2 英語 等');

  it('メモ未設定のプリセットはプリセット名がメモに入る (予備校/高校を判別可能に)', () => {
    renderPanel({ presets: [{ id: 2, name: '予備校（早朝）', startTime: '08:00' }] });
    fireEvent.change(applySelect(), { target: { value: '2' } });
    expect(memoInput()).toHaveValue('予備校（早朝）');
  });

  it('メモ付きプリセットはメモの値が優先される', () => {
    renderPanel({ presets: [SAMPLE_PRESET] });
    fireEvent.change(applySelect(), { target: { value: '1' } });
    expect(memoInput()).toHaveValue('予備校 / 高2 英語');
  });
});

describe('AbsenceNgPanel — プリセット名のメモ一括後付け', () => {
  const presets = [
    { id: 1, name: '予備校（昼）', startTime: '12:25', endTime: '13:35' },
  ];
  const sessionNoMemo = {
    id: 1, date: '7/24(金)', teacherName: '堀上',
    label: '12:25-13:35', memo: '', startTime: '12:25', endTime: '13:35',
  };

  it('時刻一致のメモ未設定セッションがあると案内が出て、ボタンで一括適用 + toast', () => {
    const { applyPresetMemosToSessions, uiValue } = renderPanel({
      presets,
      overrides: {
        project: makeFullProject({
          externalSessionPresets: presets,
          externalSessions: [sessionNoMemo],
        }),
      },
    });
    const btn = screen.getByRole('button', { name: /プリセット名をメモに一括適用 \(1件\)/ });
    fireEvent.click(btn);
    expect(applyPresetMemosToSessions).toHaveBeenCalledTimes(1);
    expect(uiValue.showToast).toHaveBeenCalledWith(
      expect.stringContaining('1 件のセッションにプリセット名をメモとして適用'),
      'success', 4000,
    );
  });

  it('判別不能 (同時刻プリセット複数) のみの場合はボタン disabled + 警告表示', () => {
    const dupPresets = [
      { id: 1, name: '予備校', startTime: '12:25', endTime: '13:35' },
      { id: 2, name: '高校', startTime: '12:25', endTime: '13:35' },
    ];
    const { applyPresetMemosToSessions } = renderPanel({
      presets: dupPresets,
      overrides: {
        project: makeFullProject({
          externalSessionPresets: dupPresets,
          externalSessions: [sessionNoMemo],
        }),
      },
    });
    const btn = screen.getByRole('button', { name: /プリセット名をメモに一括適用 \(0件\)/ });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/1 件は同時刻のプリセットが複数あり判別できない/)).toBeInTheDocument();
    fireEvent.click(btn);
    expect(applyPresetMemosToSessions).not.toHaveBeenCalled();
  });

  it('対象が無ければ案内ブロック自体を表示しない', () => {
    renderPanel({
      presets,
      overrides: {
        project: makeFullProject({
          externalSessionPresets: presets,
          externalSessions: [{ ...sessionNoMemo, memo: '予備校（昼）' }], // メモ済み
        }),
      },
    });
    expect(screen.queryByRole('button', { name: /プリセット名をメモに一括適用/ })).toBeNull();
  });
});

describe('AbsenceNgPanel — プリセットの「期間なし」(F5m)', () => {
  it('期間なしプリセットを編集して保存しても期間が付与されない', () => {
    const updateExternalSessionPreset = vi.fn();
    renderPanel({
      presets: [{ id: 5, name: '朝練' }], // 期間なし
      overrides: { updateExternalSessionPreset },
    });
    fireEvent.click(screen.getByText(/プリセット管理/));
    fireEvent.click(screen.getByLabelText('朝練 を編集'));
    // 旧実装は編集を開いた時点でプール先頭日に snap し、名前だけ直して
    // 保存すると先頭日の期間が勝手に付与された
    expect(screen.getByLabelText('プリセット開始日')).toHaveValue('');
    fireEvent.click(screen.getByText('変更を保存'));
    expect(updateExternalSessionPreset).toHaveBeenCalledTimes(1);
    const [, payload] = updateExternalSessionPreset.mock.calls[0];
    expect(payload.startDateLabel).toBe('');
    expect(payload.endDateLabel).toBe('');
  });

  it('開始日を「期間なし」に戻すと終了日も連動してクリアされる', () => {
    const outOfOrder = {
      teachers: [],
      subjects: [],
      externalSessions: [],
      externalSessionPresets: [SAMPLE_PRESET],
      externalCounts: {},
      dates: [{ id: 1, label: '7/24(金)' }, { id: 2, label: '7/31(金)' }],
      periods: [{ id: 1, label: '1限' }],
    };
    const updateExternalSessionPreset = vi.fn();
    renderPanel({
      presets: [SAMPLE_PRESET],
      overrides: { project: outOfOrder, updateExternalSessionPreset },
    });
    fireEvent.click(screen.getByText(/プリセット管理/));
    fireEvent.click(screen.getByLabelText('予備校1期3限目 を編集'));
    // 期間付きプリセットはそのまま解決される
    expect(screen.getByLabelText('プリセット開始日')).toHaveValue('1');
    // 開始日を「期間なし」へ → 終了日も null + disabled
    fireEvent.change(screen.getByLabelText('プリセット開始日'), { target: { value: '' } });
    expect(screen.getByLabelText('プリセット終了日')).toHaveValue('');
    expect(screen.getByLabelText('プリセット終了日')).toBeDisabled();
    fireEvent.click(screen.getByText('変更を保存'));
    const [, payload] = updateExternalSessionPreset.mock.calls[0];
    expect(payload.startDateLabel).toBe('');
    expect(payload.endDateLabel).toBe('');
  });
});

// ── E3e 拡充: 一括登録 / 解除確認 / 時刻検証 / セッション削除 / クイックグリッド ──
// 2 講師 × 2 日 × 2 時限のフル project (教科グループ: 英語=堀上 / 数学=山田)
function makeFullProject(overrides = {}) {
  return {
    teachers: [
      { name: '堀上', subjects: ['英語'] },
      { name: '山田', subjects: ['数学'] },
    ],
    subjects: ['英語', '数学'],
    externalSessions: [],
    externalSessionPresets: [],
    externalCounts: {},
    dates: [{ id: 1, label: '7/24(金)' }, { id: 2, label: '7/25(土)' }],
    periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
    ...overrides,
  };
}

const checkTeacher = (name) =>
  fireEvent.click(screen.getByLabelText(`${name} を対象に含める`));

describe('AbsenceNgPanel — 他学年セッションの一括登録 (E3e)', () => {
  it('選択講師 × 期間の直積で addExternalSessions を呼び、時刻・メモをクリアする', () => {
    const addExternalSessions = vi.fn();
    renderPanel({ overrides: { project: makeFullProject(), addExternalSessions } });
    checkTeacher('堀上');
    checkTeacher('山田');
    // 期間を 7/24〜7/25 に (開始 default は dates[0])
    fireEvent.change(screen.getByLabelText('終了日'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('開始時刻'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('終了時刻'), { target: { value: '11:00' } });
    const memoInput = screen.getByPlaceholderText('予備校 / 高2 英語 等');
    fireEvent.change(memoInput, { target: { value: '予備校' } });

    fireEvent.click(screen.getByText('他学年セッションとして追加'));
    expect(addExternalSessions).toHaveBeenCalledTimes(1);
    const items = addExternalSessions.mock.calls[0][0];
    expect(items).toHaveLength(4); // 2 講師 × 2 日
    expect(items).toContainEqual({
      date: '7/24(金)', teacherName: '堀上', label: '10:00-11:00',
      memo: '予備校', startTime: '10:00', endTime: '11:00',
    });
    expect(items).toContainEqual(
      expect.objectContaining({ date: '7/25(土)', teacherName: '山田' }),
    );
    // 連打による重複登録を防ぐため時刻・メモはクリア (講師・期間は残す)
    expect(screen.getByLabelText('開始時刻')).toHaveValue('');
    expect(screen.getByLabelText('終了時刻')).toHaveValue('');
    expect(memoInput).toHaveValue('');
    expect(screen.getByLabelText('堀上 を対象に含める')).toBeChecked();
  });

  it('講師未選択では追加ボタンが disabled', () => {
    const addExternalSessions = vi.fn();
    renderPanel({ overrides: { project: makeFullProject(), addExternalSessions } });
    const btn = screen.getByText('他学年セッションとして追加');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(addExternalSessions).not.toHaveBeenCalled();
  });

  it('時刻なしでも登録できる (label は空、start/end は undefined)', () => {
    const addExternalSessions = vi.fn();
    renderPanel({ overrides: { project: makeFullProject(), addExternalSessions } });
    checkTeacher('堀上');
    fireEvent.click(screen.getByText('他学年セッションとして追加'));
    expect(addExternalSessions).toHaveBeenCalledWith([
      { date: '7/24(金)', teacherName: '堀上', label: '', memo: '', startTime: undefined, endTime: undefined },
    ]);
  });
});

describe('AbsenceNgPanel — 時刻バリデーション (E3e)', () => {
  it('終了時刻のみ入力はエラーで追加不可', () => {
    renderPanel({ overrides: { project: makeFullProject() } });
    checkTeacher('堀上');
    fireEvent.change(screen.getByLabelText('終了時刻'), { target: { value: '11:00' } });
    expect(screen.getByText(/終了時刻だけでなく開始時刻も入力してください/)).toBeInTheDocument();
    expect(screen.getByText('他学年セッションとして追加')).toBeDisabled();
  });

  it('開始時刻 >= 終了時刻はエラーで追加不可', () => {
    renderPanel({ overrides: { project: makeFullProject() } });
    checkTeacher('堀上');
    fireEvent.change(screen.getByLabelText('開始時刻'), { target: { value: '12:00' } });
    fireEvent.change(screen.getByLabelText('終了時刻'), { target: { value: '12:00' } });
    expect(screen.getByText(/開始時刻は終了時刻より前にしてください/)).toBeInTheDocument();
    expect(screen.getByText('他学年セッションとして追加')).toBeDisabled();
  });
});

describe('AbsenceNgPanel — まとめてNG / OK解除 (E3e)', () => {
  const switchToNgMode = (container) =>
    fireEvent.click(container.querySelector('input[name="absence-ng-mode"][value="ng"]'));

  it('「まとめてOKに解除」は confirm 承認後に setNgBatch(..., false) を呼ぶ', async () => {
    const setNgBatch = vi.fn();
    const { container } = renderPanel({
      overrides: { project: makeFullProject(), setNgBatch },
      ui: { showConfirm: vi.fn().mockResolvedValue(true) },
    });
    switchToNgMode(container);
    checkTeacher('堀上');
    fireEvent.click(screen.getByText('まとめてOKに解除'));
    await waitFor(() => expect(setNgBatch).toHaveBeenCalledTimes(1));
    // 全時限 (動的 allMode) が default なので periods は 2 つとも入る
    expect(setNgBatch).toHaveBeenCalledWith([0], ['7/24(金)'], ['1限', '2限'], false);
  });

  it('解除は destructive なので confirm を挟み、拒否なら解除しない', async () => {
    const setNgBatch = vi.fn();
    // renderPanel の showConfirm default は false 解決
    const { container, uiValue } = renderPanel({
      overrides: { project: makeFullProject(), setNgBatch },
    });
    switchToNgMode(container);
    checkTeacher('堀上');
    fireEvent.click(screen.getByText('まとめてOKに解除'));
    await waitFor(() => expect(uiValue.showConfirm).toHaveBeenCalledTimes(1));
    expect(uiValue.showConfirm).toHaveBeenCalledWith(
      expect.stringContaining('NG を解除します'),
      expect.objectContaining({ danger: true }),
    );
    expect(setNgBatch).not.toHaveBeenCalled();
    expect(uiValue.showToast).not.toHaveBeenCalled();
  });

  it('時限を全解除すると NG ボタンが disabled', () => {
    const { container } = renderPanel({ overrides: { project: makeFullProject() } });
    switchToNgMode(container);
    checkTeacher('堀上');
    // 「全解除」ボタンは講師用とNG時限用の 2 つ — 後者をクリック
    fireEvent.click(screen.getAllByText('全解除')[1]);
    expect(screen.getByText('まとめてNGにする')).toBeDisabled();
  });

  it('NG モードに切り替えると external 用の時刻・メモがクリアされる (stale submit 防止)', () => {
    const { container } = renderPanel({ overrides: { project: makeFullProject() } });
    fireEvent.change(screen.getByLabelText('開始時刻'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByPlaceholderText('予備校 / 高2 英語 等'), { target: { value: 'メモ' } });
    switchToNgMode(container);
    // external に戻ると時刻・メモは空
    fireEvent.click(container.querySelector('input[name="absence-ng-mode"][value="external"]'));
    expect(screen.getByLabelText('開始時刻')).toHaveValue('');
    expect(screen.getByPlaceholderText('予備校 / 高2 英語 等')).toHaveValue('');
  });
});

describe('AbsenceNgPanel — 日付セクションのセッション一覧 (E3e)', () => {
  it('登録済みセッションを表示し × で removeExternalSession(id) を呼ぶ', () => {
    const removeExternalSession = vi.fn();
    renderPanel({
      overrides: {
        project: makeFullProject({
          externalSessions: [
            { id: 7, date: '7/24(金)', teacherName: '堀上', startTime: '10:00', endTime: '11:00', memo: '予備校' },
          ],
        }),
        removeExternalSession,
      },
    });
    // 日付ヘッダのバッジと一覧の内容
    expect(screen.getByText('他学年 1件')).toBeInTheDocument();
    expect(screen.getByText('10:00〜11:00')).toBeInTheDocument();
    expect(screen.getByText('予備校')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('7/24(金) 堀上 のセッションを削除'));
    expect(removeExternalSession).toHaveBeenCalledWith(7);
  });

  it('自動NG セルは「自」表示 + aria-label に自動NGあり + セッション由来ツールチップ', () => {
    const autoKey = '7/24(金)-1限';
    const autoNgByTeacher = new Map([
      ['堀上', new Map([[autoKey, {
        sessions: [{ startTime: '10:00', endTime: '11:00', memo: '予備校' }],
      }]])],
    ]);
    renderPanel({
      overrides: { project: makeFullProject(), analysis: { autoNgByTeacher } },
    });
    const cell = screen.getByLabelText('堀上 7/24(金) 1限 の手動NG (自動NGあり)');
    expect(cell).toHaveTextContent('自');
    expect(cell).toHaveAttribute('title', expect.stringContaining('予備校 (10:00〜11:00)'));
    // 手動 NG ではないので aria-pressed=false のまま
    expect(cell).toHaveAttribute('aria-pressed', 'false');
    // 日付ヘッダの NG 件数バッジにも自動NG が数えられる
    expect(screen.getByText('NG 1件')).toBeInTheDocument();
  });

  it('「すべて折りたたむ」でマトリクスが隠れ、日付ヘッダから再展開できる', () => {
    renderPanel({ overrides: { project: makeFullProject() } });
    expect(screen.queryByLabelText('堀上 7/24(金) 1限 の手動NG')).toBeInTheDocument();
    fireEvent.click(screen.getByText('すべて折りたたむ'));
    expect(screen.queryByLabelText('堀上 7/24(金) 1限 の手動NG')).toBeNull();
    // 7/24(金) のヘッダ (ボタン) をクリックで個別展開
    fireEvent.click(screen.getByRole('button', { name: /7\/24\(金\)/ }));
    expect(screen.getByLabelText('堀上 7/24(金) 1限 の手動NG')).toBeInTheDocument();
  });
});

describe('AbsenceNgPanel — クイック数値入力グリッド (E3e)', () => {
  const openQuickGrid = () => fireEvent.click(screen.getByText(/クイック数値入力/));

  it('blur 時に handleExternalCountChange(日付, 講師, 値) を呼ぶ (draft-commit)', () => {
    const handleExternalCountChange = vi.fn();
    renderPanel({ overrides: { project: makeFullProject(), handleExternalCountChange } });
    openQuickGrid();
    const input = screen.getByLabelText('7/24(金) の 堀上 の外部コマ数');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '3' } });
    expect(handleExternalCountChange).not.toHaveBeenCalled(); // フォーカス中は commit しない
    fireEvent.blur(input);
    expect(handleExternalCountChange).toHaveBeenCalledWith('7/24(金)', '堀上', '3');
  });

  it('詳細セッションがあるセルは件数表示になり入力できない', () => {
    renderPanel({
      overrides: {
        project: makeFullProject({
          externalSessions: [
            { id: 1, date: '7/24(金)', teacherName: '堀上', startTime: '10:00' },
            { id: 2, date: '7/24(金)', teacherName: '堀上', startTime: '13:00' },
          ],
        }),
      },
    });
    openQuickGrid();
    expect(screen.queryByLabelText('7/24(金) の 堀上 の外部コマ数')).toBeNull();
    // 件数セル (2) が表示される
    expect(screen.getByTitle('詳細セッション登録あり (上の日付別セクションで編集)')).toHaveTextContent('2');
    // セッションの無い隣のセルは通常の入力のまま
    expect(screen.getByLabelText('7/25(土) の 堀上 の外部コマ数')).toBeInTheDocument();
  });

  it('明示的に 0 を保存したセルは 0、未入力セルは空で表示する', () => {
    renderPanel({
      overrides: {
        project: makeFullProject({ externalCounts: { '7/24(金)-堀上': 0 } }),
      },
    });
    openQuickGrid();
    expect(screen.getByLabelText('7/24(金) の 堀上 の外部コマ数')).toHaveValue(0);
    expect(screen.getByLabelText('7/25(土) の 堀上 の外部コマ数')).not.toHaveValue();
  });
});

describe('AbsenceNgPanel — NG マトリクスのキーボード操作 (F2a)', () => {
  const matrixProject = {
    teachers: [{ name: '堀上', subjects: ['英語'] }],
    subjects: ['英語'],
    externalSessions: [],
    externalSessionPresets: [],
    externalCounts: {},
    dates: [{ id: 1, label: '7/20(月)' }],
    periods: [{ id: 1, label: '1限' }],
  };

  it('セルは role="button" + tabIndex=0 で Enter/Space で toggle できる', () => {
    const toggleTeacherNg = vi.fn();
    renderPanel({ overrides: { project: matrixProject, toggleTeacherNg } });
    const cell = screen.getByLabelText('堀上 7/20(月) 1限 の手動NG');
    expect(cell).toHaveAttribute('tabindex', '0');
    expect(cell).toHaveAttribute('aria-pressed', 'false');
    fireEvent.keyDown(cell, { key: 'Enter' });
    expect(toggleTeacherNg).toHaveBeenCalledWith(0, '7/20(月)', '1限');
    fireEvent.keyDown(cell, { key: ' ' });
    expect(toggleTeacherNg).toHaveBeenCalledTimes(2);
  });

  it('手動 NG 済みセルは aria-pressed=true', () => {
    const withNg = {
      ...matrixProject,
      teachers: [{ name: '堀上', subjects: ['英語'], ngSlots: ['7/20(月)-1限'] }],
    };
    renderPanel({ overrides: { project: withNg } });
    expect(screen.getByLabelText('堀上 7/20(月) 1限 の手動NG')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('AbsenceNgPanel — 一括解除', () => {
  // 手動NG 2件 + 他学年セッション 1件 を持つプロジェクト
  const seededProject = {
    teachers: [
      { name: '堀上', subjects: ['英語'], ngSlots: ['7/20(月)-1限', '7/21(火)-1限'] },
      { name: '田中', subjects: ['英語'], ngSlots: [] },
    ],
    subjects: ['英語'],
    externalSessions: [
      { id: 1, date: '7/20(月)', teacherName: '堀上', label: '', memo: '', startTime: '10:00', endTime: '11:00' },
    ],
    externalSessionPresets: [],
    externalCounts: {},
    dates: [{ id: 1, label: '7/20(月)' }, { id: 2, label: '7/21(火)' }],
    periods: [{ id: 1, label: '1限' }],
  };

  it('「すべての手動NGを解除」: 確認 OK で clearAllManualNg を呼び、件数を toast する', async () => {
    const showConfirm = vi.fn().mockResolvedValue(true);
    const { clearAllManualNg, uiValue } = renderPanel({
      overrides: { project: seededProject },
      ui: { showConfirm },
    });
    fireEvent.click(screen.getByRole('button', { name: /すべての手動NGを解除/ }));
    await waitFor(() => expect(clearAllManualNg).toHaveBeenCalledTimes(1));
    expect(showConfirm).toHaveBeenCalledWith(
      expect.stringContaining('手動NG 2 件'),
      expect.objectContaining({ danger: true }),
    );
    expect(uiValue.showToast).toHaveBeenCalledWith(
      expect.stringContaining('2 件'), 'success', 3000,
    );
  });

  it('「すべての手動NGを解除」: 確認キャンセルで何もしない', async () => {
    const showConfirm = vi.fn().mockResolvedValue(false);
    const { clearAllManualNg, uiValue } = renderPanel({
      overrides: { project: seededProject },
      ui: { showConfirm },
    });
    fireEvent.click(screen.getByRole('button', { name: /すべての手動NGを解除/ }));
    await waitFor(() => expect(showConfirm).toHaveBeenCalled());
    expect(clearAllManualNg).not.toHaveBeenCalled();
    expect(uiValue.showToast).not.toHaveBeenCalled();
  });

  it('「すべてのNG設定を解除」: 確認 OK で clearAllNg を呼び、確認文に手動NG/セッション件数を含む', async () => {
    const showConfirm = vi.fn().mockResolvedValue(true);
    const { clearAllNg } = renderPanel({
      overrides: { project: seededProject },
      ui: { showConfirm },
    });
    fireEvent.click(screen.getByRole('button', { name: /すべてのNG設定を解除/ }));
    await waitFor(() => expect(clearAllNg).toHaveBeenCalledTimes(1));
    const message = showConfirm.mock.calls[0][0];
    expect(message).toContain('手動NG 2 件');
    expect(message).toContain('他学年セッション 1 件');
    expect(showConfirm.mock.calls[0][1]).toMatchObject({ danger: true });
  });

  it('「すべてのNG設定を解除」: 確認キャンセルで何もしない', async () => {
    const showConfirm = vi.fn().mockResolvedValue(false);
    const { clearAllNg } = renderPanel({
      overrides: { project: seededProject },
      ui: { showConfirm },
    });
    fireEvent.click(screen.getByRole('button', { name: /すべてのNG設定を解除/ }));
    await waitFor(() => expect(showConfirm).toHaveBeenCalled());
    expect(clearAllNg).not.toHaveBeenCalled();
  });

  it('手動NGもセッションも無いときは両ボタンとも disabled', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /すべての手動NGを解除/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /すべてのNG設定を解除/ })).toBeDisabled();
  });

  it('セッションのみ存在する場合、手動NG解除は disabled / NG設定全解除は enabled', () => {
    const sessionOnly = {
      ...seededProject,
      teachers: [{ name: '堀上', subjects: ['英語'], ngSlots: [] }],
    };
    renderPanel({ overrides: { project: sessionOnly } });
    expect(screen.getByRole('button', { name: /すべての手動NGを解除/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /すべてのNG設定を解除/ })).not.toBeDisabled();
  });
});
