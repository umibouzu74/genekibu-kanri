// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SessionCsvImport from './SessionCsvImport';
import { ProjectContext } from '../../contexts/projectContextValue';
import { UIContext } from '../../contexts/uiContextValue';

afterEach(cleanup);

function renderPanel({ externalSessions = [], addExternalSessions = vi.fn(), showToast = vi.fn() } = {}) {
  const value = {
    project: {
      teachers: [{ name: '半田' }, { name: '滝澤' }],
      dates: [{ id: 1, label: '12/25(金)' }, { id: 2, label: '12/26(土)' }],
      periods: [],
      tabs: [{ config: {} }],
      externalSessions,
    },
    addExternalSessions,
  };
  render(
    <ProjectContext.Provider value={value}>
      <UIContext.Provider value={{ showToast }}>
        <SessionCsvImport />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /他学年セッションを表で一括登録/ }));
  return { addExternalSessions, showToast };
}

const type = (text) =>
  fireEvent.change(screen.getByLabelText('他学年セッションの表 (CSV)'), { target: { value: text } });

describe('SessionCsvImport', () => {
  it('貼り付けた表を講師 × 日付に展開して登録する (ラベルは手入力の登録と同じ形)', () => {
    const { addExternalSessions } = renderPanel();
    type('講師,日付,開始,終了,メモ,講座名\n半田・滝澤,12/25・26,9:00,10:10,予備校１限,高3 英語');
    expect(screen.getByText('4 件')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /他学年セッションを追加/ }));
    expect(addExternalSessions).toHaveBeenCalledTimes(1);
    const items = addExternalSessions.mock.calls[0][0];
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({
      date: '12/25(金)', teacherName: '半田', label: '09:00-10:10', memo: '予備校１限',
      course: '高3 英語', startTime: '09:00', endTime: '10:10',
    });
  });

  it('登録済みの内容は数えて知らせ、全部登録済みなら追加しない', () => {
    const { addExternalSessions, showToast } = renderPanel({
      externalSessions: [{
        id: 1, date: '12/25(金)', teacherName: '半田', label: '09:00-10:10', memo: '予備校１限',
        startTime: '09:00', endTime: '10:10',
      }],
    });
    type('講師,日付,開始,終了,メモ\n半田,12/25,9:00,10:10,予備校１限');
    expect(screen.getByText(/うち登録済み 1 件/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /他学年セッションを追加/ }));
    expect(addExternalSessions).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('すべて登録済み'), 'warning', 3000);
  });

  it('講師マスタに無い名前・プールに無い日を知らせる', () => {
    renderPanel();
    type('講師,日付,開始,終了\n高松,12/27,9:00,10:10');
    expect(screen.getByText(/講師マスタに無い名前/)).toHaveTextContent('高松');
    expect(screen.getByText(/2 行目/)).toHaveTextContent('日付「12/27」が日付プールにありません');
  });
});
