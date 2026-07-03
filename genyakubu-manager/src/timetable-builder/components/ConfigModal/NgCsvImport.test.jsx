// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import NgCsvImport from './NgCsvImport';
import { ProjectContext } from '../../contexts/projectContextValue';
import { UIContext } from '../../contexts/uiContextValue';

afterEach(cleanup);

function renderPanel({ projectOverrides = {}, importNgSlots = vi.fn(), showToast = vi.fn() } = {}) {
  const projectValue = {
    project: {
      teachers: [{ name: '田中', ngSlots: [] }],
      // v4: dates / periods は project レベル (tab.config には無い)
      dates: [{ id: 1, label: '12/25' }],
      periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
      tabs: [{ config: {} }],
      ...projectOverrides,
    },
    importNgSlots,
  };
  const utils = render(
    <ProjectContext.Provider value={projectValue}>
      <UIContext.Provider value={{ showToast }}>
        <NgCsvImport />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { ...utils, importNgSlots, showToast };
}

function openAndType(text) {
  fireEvent.click(screen.getByRole('button', { name: /NG 日時を CSV/ }));
  fireEvent.change(screen.getByLabelText('NG 日時 CSV テキスト'), { target: { value: text } });
}

describe('NgCsvImport (E2a)', () => {
  it('折りたたみトグルで開閉する', () => {
    renderPanel();
    expect(screen.queryByLabelText('NG 日時 CSV テキスト')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /NG 日時を CSV/ }));
    expect(screen.getByLabelText('NG 日時 CSV テキスト')).toBeInTheDocument();
  });

  it('プレビューに parse 件数を表示する', () => {
    renderPanel();
    openAndType('name,date,period\n田中,12/25,1限');
    expect(screen.getByText('1 件')).toBeInTheDocument();
  });

  it('「NG を追加」で importNgSlots に該当行を渡す', () => {
    const importNgSlots = vi.fn();
    renderPanel({ importNgSlots });
    openAndType('name,date,period\n田中,12/25,1限\n田中,12/25,2限');
    fireEvent.click(screen.getByRole('button', { name: 'NG を追加' }));
    expect(importNgSlots).toHaveBeenCalledWith([
      { name: '田中', date: '12/25', period: '1限' },
      { name: '田中', date: '12/25', period: '2限' },
    ]);
  });

  it('登録講師と一致しない行のみのときは warning toast で importNgSlots を呼ばない', () => {
    const importNgSlots = vi.fn();
    const showToast = vi.fn();
    renderPanel({ importNgSlots, showToast });
    openAndType('name,date,period\n佐藤,12/25,1限');
    fireEvent.click(screen.getByRole('button', { name: 'NG を追加' }));
    expect(importNgSlots).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('一致'), 'warning', expect.any(Number));
  });

  it('未登録の日付ラベルを warning 表示する', () => {
    renderPanel();
    openAndType('name,date,period\n田中,9/99,1限');
    expect(screen.getByText(/未登録の日付ラベル/)).toBeInTheDocument();
  });

  it('未登録の時限ラベルを warning 表示する (v4: project.periods を参照)', () => {
    renderPanel();
    openAndType('name,date,period\n田中,12/25,9限');
    expect(screen.getByText(/未登録の時限ラベル/)).toBeInTheDocument();
  });
});

describe('NgCsvImport — 雛形 CSV ダウンロード (L4f)', () => {
  it('雛形CSV ボタンがパネル内に表示される', () => {
    renderPanel();
    fireEvent.click(screen.getByText(/NG 日時を CSV で一括登録/));
    expect(screen.getByText('⬇ 雛形CSV')).toBeInTheDocument();
  });
});

describe('NgCsvImport — 雛形 CSV の配線 (§M)', () => {
  it('雛形は実在の講師・日付・時限ラベルで生成される (引数順の固定)', async () => {
    let captured = null;
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((b) => { captured = b; return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      renderPanel();
      fireEvent.click(screen.getByText(/NG 日時を CSV で一括登録/));
      fireEvent.click(screen.getByText('⬇ 雛形CSV'));
      expect(captured).not.toBeNull();
      // BOM は text() (UTF-8 デコード) だと剥がされるのでバイト列で確認
      const bytes = new Uint8Array(await captured.arrayBuffer());
      expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
      const text = await captured.text();
      const lines = text.split('\n');
      expect(lines[0]).toBe('name,date,period');
      const [name, date, period] = lines[1].split(',');
      expect(name).toBe('田中'); // fixture の先頭講師
      expect(date).toBe('12/25'); // fixture の先頭日付ラベル
      expect(period).toBe('1限');
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      clickSpy.mockRestore();
    }
  });
});
