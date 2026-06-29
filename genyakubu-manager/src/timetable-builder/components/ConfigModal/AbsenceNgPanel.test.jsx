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
