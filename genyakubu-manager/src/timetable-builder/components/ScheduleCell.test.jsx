// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import ScheduleCell from './ScheduleCell';
import { ProjectContext } from '../contexts/projectContextValue';
import { makeKey, makeNgKey } from '../utils/scheduleKey';

afterEach(cleanup);

// 必要最小限の context value。currentConfig は 2×2×2 (date×period×class) を
// 既定にする (矢印キーナビゲーションのテストで隣接セルが要るため)。
function defaultContext(overrides = {}) {
  return {
    project: {
      teachers: [
        { name: '堀上', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
        { name: '田中', subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
        { name: '未定', subjects: ['英語', '数学'], ngSlots: [], ngClasses: [], priorityClasses: [] },
      ],
      subjectColors: { 英語: '#DBEAFE', 数学: '#FEE2E2' },
      combinedGroups: [],
      ...overrides.project,
    },
    currentSchedule: overrides.currentSchedule || {},
    currentConfig: {
      dates: [{ id: 1, label: '12/25(木)' }, { id: 2, label: '12/26(金)' }],
      periods: [{ id: 1, label: '1限' }, { id: 2, label: '2限' }],
      classes: [{ id: 1, label: '３S' }, { id: 2, label: '３A' }],
      subjectCounts: { 英語: 2, 数学: 2 },
      ...overrides.currentConfig,
    },
    commonSubjects: overrides.commonSubjects || ['英語', '数学'],
    analysis: {
      conflictMap: {},
      subjectOrders: {},
      dailySubjectMap: {},
      teacherDailyCounts: {},
      errorKeys: [],
      ...overrides.analysis,
    },
    handleAssign: vi.fn(),
    toggleLock: vi.fn(),
    ...overrides.contextOverrides,
  };
}

// ScheduleCell は <td> なので、テストでは <table><tbody><tr> でラップして
// render する必要がある (jsdom でも valid な DOM 構造を保つため)。
function renderCell({ dateId = 1, periodId = 1, classId = 1, isCompact = false, highlightTeacher = null, contextOverrides = {} } = {}) {
  const ctx = defaultContext(contextOverrides);
  const utils = render(
    <ProjectContext.Provider value={ctx}>
      <table><tbody><tr>
        <ScheduleCell
          dateId={dateId}
          periodId={periodId}
          classId={classId}
          isCompact={isCompact}
          onContextMenu={vi.fn()}
          onDragStart={vi.fn()}
          onDragOver={vi.fn()}
          onDragLeave={vi.fn()}
          onDrop={vi.fn()}
          onDragEnd={vi.fn()}
          isDragOver={false}
          isDragSource={false}
          highlightTeacher={highlightTeacher}
        />
      </tr></tbody></table>
    </ProjectContext.Provider>,
  );
  return { ...utils, ctx };
}

describe('ScheduleCell', () => {
  it('subject select の onChange で handleAssign("subject", ...) を呼ぶ', () => {
    const { ctx } = renderCell();
    const subjectSelect = document.getElementById('select-1-1-1-subject');
    fireEvent.change(subjectSelect, { target: { value: '英語' } });
    expect(ctx.handleAssign).toHaveBeenCalledWith(1, 1, 1, 'subject', '英語');
  });

  it('teacher select の onChange で handleAssign("teacher", ...) を呼ぶ', () => {
    const { ctx } = renderCell({
      contextOverrides: {
        currentSchedule: { [makeKey(1, 1, 1)]: { subject: '英語' } },
      },
    });
    const teacherSelect = document.getElementById('select-1-1-1-teacher');
    fireEvent.change(teacherSelect, { target: { value: '堀上' } });
    expect(ctx.handleAssign).toHaveBeenCalledWith(1, 1, 1, 'teacher', '堀上');
  });

  it('ロックボタンクリックで toggleLock が呼ばれる', () => {
    const { ctx } = renderCell();
    const lockBtn = screen.getByTitle(/ロック/);
    fireEvent.click(lockBtn);
    expect(ctx.toggleLock).toHaveBeenCalledWith(1, 1, 1);
  });

  it('locked=true なら 🔒 を表示', () => {
    renderCell({
      contextOverrides: {
        currentSchedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上', locked: true } },
      },
    });
    expect(screen.getByText('🔒')).toBeInTheDocument();
  });

  it('conflict セルは ⚠️ 重複 ラベルを表示', () => {
    renderCell({
      contextOverrides: {
        currentSchedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } },
        analysis: { conflictMap: { '12/25(木)-1限-堀上': true }, subjectOrders: {}, dailySubjectMap: {}, teacherDailyCounts: {}, errorKeys: [] },
      },
    });
    expect(screen.getAllByText(/⚠️\s*重複/).length).toBeGreaterThan(0);
  });

  it('NG slot の講師は option が disabled で "(NG)" 付き', () => {
    renderCell({
      contextOverrides: {
        project: {
          teachers: [
            { name: '堀上', subjects: ['英語'], ngSlots: [makeNgKey('12/25(木)', '1限')], ngClasses: [], priorityClasses: [] },
            { name: '未定', subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] },
          ],
          subjectColors: {},
          combinedGroups: [],
        },
        currentSchedule: { [makeKey(1, 1, 1)]: { subject: '英語' } },
      },
    });
    const teacherSelect = document.getElementById('select-1-1-1-teacher');
    const ngOption = Array.from(teacherSelect.options).find(o => o.value === '堀上');
    expect(ngOption.disabled).toBe(true);
    expect(ngOption.textContent).toContain('(NG)');
  });

  it('既に使われた科目 option は disabled', () => {
    renderCell({
      contextOverrides: {
        analysis: {
          conflictMap: {},
          subjectOrders: {},
          // ３S × 12/25 で 英語 が既に 1 つ使われている
          dailySubjectMap: { 'c1-d1-英語': 1 },
          teacherDailyCounts: {},
          errorKeys: [],
        },
      },
    });
    const subjectSelect = document.getElementById('select-1-1-1-subject');
    const usedOption = Array.from(subjectSelect.options).find(o => o.value === '英語');
    expect(usedOption.disabled).toBe(true);
  });

  it('ArrowDown で次の period の同 type にフォーカス遷移する', () => {
    // (1,1,1) を起点。ArrowDown で (1,2,1) に行く想定。subject select 同士。
    const { container } = renderCell();
    // 隣接 cell の subject select も DOM 上に必要 (focus 先)。
    const nextSelect = document.createElement('select');
    nextSelect.id = 'select-1-2-1-subject';
    container.appendChild(nextSelect);

    const subjectSelect = document.getElementById('select-1-1-1-subject');
    subjectSelect.focus();
    fireEvent.keyDown(subjectSelect, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(nextSelect);
  });

  it('ArrowRight で subject → teacher にフォーカス遷移する (同セル内)', () => {
    renderCell({
      contextOverrides: { currentSchedule: { [makeKey(1, 1, 1)]: { subject: '英語' } } },
    });
    const subjectSelect = document.getElementById('select-1-1-1-subject');
    const teacherSelect = document.getElementById('select-1-1-1-teacher');
    subjectSelect.focus();
    fireEvent.keyDown(subjectSelect, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(teacherSelect);
  });

  it('ArrowLeft: 行頭 (先頭クラスの subject) では行末 (末尾クラスの teacher) へ wrap する (E1b)', () => {
    const { container } = renderCell(); // (1,1,1) = 先頭クラス
    const wrapTarget = document.createElement('select');
    wrapTarget.id = 'select-1-1-2-teacher'; // 末尾クラス (id=2) の teacher
    container.appendChild(wrapTarget);
    const subjectSelect = document.getElementById('select-1-1-1-subject');
    subjectSelect.focus();
    fireEvent.keyDown(subjectSelect, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(wrapTarget);
  });

  it('ArrowRight: 行末 (末尾クラスの teacher) では行頭 (先頭クラスの subject) へ wrap する (E1b)', () => {
    // teacher select は subject がある時のみ描画されるので (1,1,2) に subject を与える
    const { container } = renderCell({
      classId: 2, // (1,1,2) = 末尾クラス
      contextOverrides: { currentSchedule: { [makeKey(1, 1, 2)]: { subject: '英語' } } },
    });
    const wrapTarget = document.createElement('select');
    wrapTarget.id = 'select-1-1-1-subject'; // 先頭クラス (id=1) の subject
    container.appendChild(wrapTarget);
    const teacherSelect = document.getElementById('select-1-1-2-teacher');
    teacherSelect.focus();
    fireEvent.keyDown(teacherSelect, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(wrapTarget);
  });

  it('config に entity 一致が無いと null を返す (config 削除直後の race 対策)', () => {
    const { container } = renderCell({ dateId: 999 });
    // 何も render されていないこと (table > tbody > tr の中身)
    expect(container.querySelector('td')).toBeNull();
  });

  // ─── a11y (D5a) ────────────────────────────────────────────────

  it('subject / teacher select に日付・時限・クラスを含む aria-label が付く', () => {
    renderCell();
    expect(document.getElementById('select-1-1-1-subject')).toHaveAttribute('aria-label', '12/25(木) 1限 ３S の科目');
    expect(document.getElementById('select-1-1-1-teacher')).toHaveAttribute('aria-label', '12/25(木) 1限 ３S の講師');
  });

  it('ロックボタンに aria-label と aria-pressed が付く (locked 状態を反映)', () => {
    renderCell({
      contextOverrides: {
        currentSchedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上', locked: true } },
      },
    });
    const lockBtn = screen.getByRole('button', { name: 'ロック解除' });
    expect(lockBtn).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('ScheduleCell — 矢印ナビと select ネイティブ操作 (F2b)', () => {
  it('素の矢印キーはセル間ナビとして preventDefault される', () => {
    renderCell();
    const select = document.getElementById('select-1-1-1-subject');
    const notPrevented = fireEvent.keyDown(select, { key: 'ArrowDown' });
    expect(notPrevented).toBe(false); // preventDefault 済み = ナビが乗っ取る
  });

  it('Alt+矢印 (ドロップダウンを開くネイティブ操作) は乗っ取らない', () => {
    renderCell();
    const select = document.getElementById('select-1-1-1-subject');
    expect(fireEvent.keyDown(select, { key: 'ArrowDown', altKey: true })).toBe(true);
    expect(fireEvent.keyDown(select, { key: 'ArrowUp', altKey: true })).toBe(true);
  });

  it('Ctrl / Meta 付きの矢印も素通しする', () => {
    renderCell();
    const select = document.getElementById('select-1-1-1-subject');
    expect(fireEvent.keyDown(select, { key: 'ArrowDown', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(select, { key: 'ArrowLeft', metaKey: true })).toBe(true);
  });
});

describe('ScheduleCell — 講師ハイライト (L2a)', () => {
  const schedule = { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } };

  it('一致する講師のセルに data-teacher-highlight が付く', () => {
    const { container } = renderCell({
      highlightTeacher: '堀上',
      contextOverrides: { currentSchedule: schedule },
    });
    expect(container.querySelector('td[data-teacher-highlight]')).not.toBeNull();
  });

  it('一致しないセルは薄く表示され、ハイライトは付かない', () => {
    const { container } = renderCell({
      highlightTeacher: '田中',
      contextOverrides: { currentSchedule: schedule },
    });
    const td = container.querySelector('td');
    expect(td.hasAttribute('data-teacher-highlight')).toBe(false);
    expect(td.className).toContain('opacity-40');
  });

  it('highlightTeacher が null なら通常表示', () => {
    const { container } = renderCell({ contextOverrides: { currentSchedule: schedule } });
    const td = container.querySelector('td');
    expect(td.hasAttribute('data-teacher-highlight')).toBe(false);
    expect(td.className).not.toContain('opacity-40');
  });
});

describe('ScheduleCell — ハイライトとドラッグの競合 (§M)', () => {
  it('isDragOver 中はハイライト ring より drag ring を優先する', () => {
    const { container } = render(
      <ProjectContext.Provider value={defaultContext({ currentSchedule: { [makeKey(1, 1, 1)]: { subject: '英語', teacher: '堀上' } } })}>
        <table><tbody><tr>
          <ScheduleCell
            dateId={1} periodId={1} classId={1}
            isCompact={false}
            onContextMenu={vi.fn()} onDragStart={vi.fn()} onDragOver={vi.fn()}
            onDragLeave={vi.fn()} onDrop={vi.fn()} onDragEnd={vi.fn()}
            isDragOver={true}
            isDragSource={false}
            highlightTeacher="堀上"
          />
        </tr></tbody></table>
      </ProjectContext.Provider>,
    );
    const td = container.querySelector('td');
    // drag ring (bg-builder-info-soft 付き) が出て、ハイライト専用 ring 分岐は抑止される
    expect(td.className).toContain('bg-builder-info-soft');
    // data 属性 (一致マーカー) は維持
    expect(td.hasAttribute('data-teacher-highlight')).toBe(true);
  });
});
