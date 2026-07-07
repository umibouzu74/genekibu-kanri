// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import ScheduleTable from './ScheduleTable';
import { ProjectContext } from '../contexts/projectContextValue';
import { UIContext } from '../contexts/uiContextValue';
import { makeKey } from '../utils/scheduleKey';

afterEach(cleanup);

// 日付ステータスチェック (OK / 要確認 / 不備あり) に焦点を当てたテスト。
// ScheduleCell も一緒に mount されるので、その必要フィールドも context に持たせる
// (ScheduleCell.test.jsx の defaultContext と同じ形)。
function makeCtx({ incompleteDateIds = new Set(), dayStatuses = {}, setDayStatus = vi.fn(), currentSchedule = {}, dates = [{ id: 1, label: '12/25(木)' }], periods = [{ id: 1, label: '1限' }] } = {}) {
  return {
    project: {
      teachers: [{ name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] }],
      subjectColors: {},
      combinedGroups: [],
    },
    activeTab: { id: 1, name: 'メイン', dayStatuses },
    currentSchedule,
    currentConfig: {
      dates,
      periods,
      classes: [{ id: 1, label: '３S' }],
      subjectCounts: { 英語: 1 },
    },
    commonSubjects: ['英語'],
    analysis: {
      conflictMap: {},
      subjectOrders: {},
      dailySubjectMap: {},
      teacherDailyCounts: {},
      errorKeys: [],
      incompleteDateIds,
    },
    handleAssign: vi.fn(),
    toggleLock: vi.fn(),
    handleSwapCells: vi.fn(),
    setDayStatus,
  };
}

function renderTable(ctxOpts = {}) {
  const ctx = makeCtx(ctxOpts);
  const utils = render(
    <ProjectContext.Provider value={ctx}>
      <UIContext.Provider value={{ showToast: vi.fn(), showConfirm: vi.fn(), showInput: vi.fn() }}>
        <ScheduleTable isCompact={false} onContextMenu={vi.fn()} />
      </UIContext.Provider>
    </ProjectContext.Provider>,
  );
  return { ...utils, ctx };
}

describe('ScheduleTable — 印刷用の日付単位 tbody 構造', () => {
  // 印刷時に builderPrintStyle が tbody 単位で break-inside:avoid を掛け、
  // 1 日分がページ境界で途中分割されないようにする前提 (BUILDER_PRINT_STYLE)。
  // その改ページ制御が効くためには「日付ごとに tbody が 1 つ」である必要が
  // あるので、構造を固定する。
  it('日付ごとに builder-day-group な tbody を 1 つ描画する', () => {
    const { container } = renderTable({
      dates: [
        { id: 1, label: '12/25(木)' },
        { id: 2, label: '12/26(金)' },
        { id: 3, label: '12/27(土)' },
      ],
      periods: [
        { id: 1, label: '1限' },
        { id: 2, label: '2限' },
      ],
    });
    const bodies = container.querySelectorAll('tbody.builder-day-group');
    expect(bodies).toHaveLength(3);
    // 各 tbody は当該日の全時限行 (+ 最終日以外は区切り行) を内包する
    expect(bodies[0].querySelectorAll('tr').length).toBeGreaterThanOrEqual(2);
  });
});

describe('ScheduleTable — 日付ステータスチェック', () => {
  it('不備あり (自動判定) はチェック付き・操作不可で、OK も選べない', () => {
    renderTable({ incompleteDateIds: new Set([1]) });
    const fubi = screen.getByLabelText('12/25(木) の不備あり (自動判定)');
    expect(fubi).toBeChecked();
    expect(fubi).toBeDisabled();
    expect(screen.getByLabelText('12/25(木) を OK にする')).toBeDisabled();
    // 要確認は不備あり中でも付けられる
    expect(screen.getByLabelText('12/25(木) を要確認にする')).not.toBeDisabled();
  });

  it('全コマが埋まった日は不備ありが外れ、OK を付けられる', () => {
    const setDayStatus = vi.fn();
    renderTable({
      incompleteDateIds: new Set(),
      currentSchedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } },
      setDayStatus,
    });
    const fubi = screen.getByLabelText('12/25(木) の不備あり (自動判定)');
    expect(fubi).not.toBeChecked();
    const ok = screen.getByLabelText('12/25(木) を OK にする');
    expect(ok).not.toBeDisabled();
    fireEvent.click(ok);
    expect(setDayStatus).toHaveBeenCalledWith(1, 'ok');
  });

  it('保存済み OK はチェック表示され、再クリックで解除 (null) を dispatch する', () => {
    const setDayStatus = vi.fn();
    renderTable({ dayStatuses: { 1: 'ok' }, setDayStatus });
    const ok = screen.getByLabelText('12/25(木) を OK にする');
    expect(ok).toBeChecked();
    fireEvent.click(ok);
    expect(setDayStatus).toHaveBeenCalledWith(1, null);
  });

  it('要確認のクリックで setDayStatus(dateId, "check") を呼ぶ (OK 保存中は置換)', () => {
    const setDayStatus = vi.fn();
    renderTable({ dayStatuses: { 1: 'ok' }, setDayStatus });
    fireEvent.click(screen.getByLabelText('12/25(木) を要確認にする'));
    expect(setDayStatus).toHaveBeenCalledWith(1, 'check');
  });

  it('保存済み OK は不備あり中は表示から抑制される (unchecked + disabled、保存値は消さない)', () => {
    const setDayStatus = vi.fn();
    renderTable({ dayStatuses: { 1: 'ok' }, incompleteDateIds: new Set([1]), setDayStatus });
    const ok = screen.getByLabelText('12/25(木) を OK にする');
    expect(ok).not.toBeChecked();
    expect(ok).toBeDisabled();
    // 表示抑制のために setDayStatus は勝手に呼ばれない
    expect(setDayStatus).not.toHaveBeenCalled();
  });

  it('保存済み要確認はチェック表示され、再クリックで解除する', () => {
    const setDayStatus = vi.fn();
    renderTable({ dayStatuses: { 1: 'check' }, setDayStatus });
    const check = screen.getByLabelText('12/25(木) を要確認にする');
    expect(check).toBeChecked();
    fireEvent.click(check);
    expect(setDayStatus).toHaveBeenCalledWith(1, null);
  });
});
