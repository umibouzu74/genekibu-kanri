// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import AbsenceNgPanel from './AbsenceNgPanel';
import { ProjectContext } from '../../contexts/projectContextValue';
import { UIContext } from '../../contexts/uiContextValue';

// NgCsvImport も context を要求するが、ここでは AbsenceNgPanel 本体
// (プリセット複製 / 時刻 step) のみ検証したいので空に mock する。
vi.mock('./NgCsvImport', () => ({ default: () => null }));

afterEach(cleanup);

function renderPanel({ presets = [], overrides = {} } = {}) {
  const addExternalSessionPreset = vi.fn();
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
    analysis: { autoNgByTeacher: new Map() },
    ...overrides,
  };
  const uiValue = { showConfirm: vi.fn().mockResolvedValue(false), showToast: vi.fn() };
  const utils = render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={uiValue}>
        <AbsenceNgPanel />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { ...utils, addExternalSessionPreset };
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
    });
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
