// @vitest-environment jsdom
// 強調表示 (L2g 教科 / L2a 講師) と紙面の見出し・凡例 (2026-11-07)。
// 選んだ強調はタブを切り替えても保ち (教科を選んだままタブを巡回して刷る)、
// 印刷専用の見出しに強調の対象と凡例を出す。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BuilderApp from './BuilderApp';
import { seasonStorage } from './utils/seasons';

const T = (name, subjects) => ({ name, subjects, ngSlots: [], ngClasses: [], priorityClasses: [] });
const project = {
  version: 4,
  name: '2026 夏期講習',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  teachers: [T('堀上', ['英語']), T('小松', ['国語'])],
  activeTabId: 1,
  dates: [{ id: 1, label: '7/29(水)' }],
  periods: [{ id: 1, label: '1限 (13:00~14:10)' }],
  tabs: [
    {
      id: 1,
      name: '中3',
      config: { classes: [{ id: 1, label: '3S', regular: { grade: '中3', classes: ['S'] } }], subjectCounts: { 英語: 1, 国語: 1 } },
      schedule: { 'd1-p1-c1': { subject: '英語', teacher: '堀上' } },
    },
    {
      id: 2,
      name: '中1・2',
      config: { classes: [{ id: 1, label: '1S' }], subjectCounts: { 英語: 1, 国語: 1 } },
      schedule: { 'd1-p1-c1': { subject: '国語', teacher: '小松' } },
    },
  ],
  subjects: ['英語', '国語'],
  subjectColors: {},
  combinedGroups: [],
  externalCounts: {},
  externalSessions: [],
  externalSessionPresets: [],
  snapshots: [],
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('builder.onboarding_seen', '1');
  localStorage.setItem(seasonStorage('summer').storageKey, JSON.stringify(project));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const heading = () => document.querySelector('.builder-print-heading');

describe('BuilderApp の強調表示と紙面の見出し', () => {
  it('教科を選ぶと紙面の見出しに【強調: 教科】と凡例を出し、タブを切り替えても保つ', async () => {
    render(<BuilderApp season="summer" />);
    const select = await screen.findByLabelText('強調表示');
    // 強調なし: 見出しは従来どおり。普段のクラスに結び付けたタブなので ★ の説明だけ出す
    expect(heading().textContent).toContain('2026 夏期講習 — 中3');
    expect(heading().textContent).not.toContain('強調');
    expect(heading().querySelector('.builder-print-legend').textContent).toBe(
      '★ = 普段 (通常授業) このクラスのこの科目を担当している講師',
    );

    fireEvent.change(select, { target: { value: 's:英語' } });
    expect(heading().textContent).toContain('2026 夏期講習 — 中3【強調: 英語】');
    expect(heading().querySelector('.builder-print-legend').textContent).toContain('太枠 = 英語のコマ / 薄い表示 = それ以外');
    expect(document.getElementById('select-1-1-1-cell').getAttribute('data-highlight')).toBe('match');

    // タブを切り替えても強調は残る (このタブの国語のセルは薄表示)
    fireEvent.click(screen.getByRole('tab', { name: /中1・2/ }));
    expect(screen.getByLabelText('強調表示').value).toBe('s:英語');
    expect(heading().textContent).toContain('2026 夏期講習 — 中1・2【強調: 英語】');
    expect(document.getElementById('select-1-1-1-cell').getAttribute('data-highlight')).toBe('dim');
    // 普段のクラスに結び付けていないタブでは ★ の説明を出さない
    expect(heading().querySelector('.builder-print-legend').textContent).not.toContain('★');
  });

  it('講師を選ぶと【強調: 講師】、なしに戻すと従来の見出し', async () => {
    render(<BuilderApp season="summer" />);
    const select = await screen.findByLabelText('強調表示');
    fireEvent.change(select, { target: { value: 't:堀上' } });
    expect(heading().textContent).toContain('【強調: 堀上】');
    expect(document.getElementById('select-1-1-1-cell').hasAttribute('data-teacher-highlight')).toBe(true);
    fireEvent.change(select, { target: { value: '' } });
    expect(heading().textContent).not.toContain('強調');
    expect(document.getElementById('select-1-1-1-cell').hasAttribute('data-highlight')).toBe(false);
  });

  it('強調は localStorage に保存しない', async () => {
    render(<BuilderApp season="summer" />);
    fireEvent.change(await screen.findByLabelText('強調表示'), { target: { value: 's:国語' } });
    const stored = Object.keys(localStorage).map(k => localStorage.getItem(k)).join('\n');
    expect(stored).not.toContain('s:国語');
  });
});

describe('BuilderApp のまとめて印刷 (L2h)', () => {
  let printSpy;
  beforeEach(() => {
    printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
  });
  afterEach(() => printSpy.mockRestore());

  const sheets = () => [...document.querySelectorAll('.builder-batch-print .builder-batch-sheet')];
  const storedActiveTab = () => JSON.parse(localStorage.getItem(seasonStorage('summer').storageKey)).activeTabId;

  it('タブを切り替えずに 組ごとの紙面を描いて印刷し、afterprint で片付ける', async () => {
    render(<BuilderApp season="summer" />);
    fireEvent.change(await screen.findByLabelText('強調表示'), { target: { value: 't:堀上' } });
    fireEvent.click(screen.getByRole('button', { name: '🖨️ まとめて' }));
    const dialog = screen.getByRole('dialog', { name: 'まとめて印刷' });
    fireEvent.click(within(dialog).getByRole('button', { name: '🖨️ 4 枚を印刷' }));
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));

    // 教科ごと: 英語 (中3 → 中1・2) → 国語 (中3 → 中1・2)
    expect(sheets().map(el => el.querySelector('.builder-print-heading > div').textContent)).toEqual([
      '2026 夏期講習 — 中3【強調: 英語】',
      '2026 夏期講習 — 中1・2【強調: 英語】',
      '2026 夏期講習 — 中3【強調: 国語】',
      '2026 夏期講習 — 中1・2【強調: 国語】',
    ]);
    // 2 枚目 (中1・2 × 英語): そのタブのセル (国語・小松) が「-」でなく出て、薄表示
    const td = sheets()[1].querySelector('td[data-highlight]');
    expect(td.getAttribute('data-highlight')).toBe('dim');
    expect(td.querySelector('.builder-print-subject').textContent).toBe('国語');
    expect(td.querySelector('.builder-print-teacher').textContent).toBe('小松');
    // 紙面用はプルダウンを描かない
    expect(document.querySelectorAll('.builder-batch-print select')).toHaveLength(0);
    // 画面の時間割・見出しは紙面に出さない目印
    expect(document.querySelector('.builder-batch-printing')).not.toBeNull();
    expect(document.querySelector('.print-container.builder-main-sheet')).not.toBeNull();
    // ダイアログは印刷の前に閉じる
    expect(screen.queryByRole('dialog', { name: 'まとめて印刷' })).toBeNull();

    // タブ・強調は変えていない (保存された activeTabId も)
    expect(screen.getByRole('tab', { name: /中3/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('強調表示').value).toBe('t:堀上');
    expect(storedActiveTab()).toBe(1);

    act(() => { window.dispatchEvent(new Event('afterprint')); });
    expect(sheets()).toHaveLength(0);
    expect(document.querySelector('.builder-batch-printing')).toBeNull();
  });

  it('準備中に中断すると印刷しない', async () => {
    render(<BuilderApp season="summer" />);
    fireEvent.click(await screen.findByRole('button', { name: '🖨️ まとめて' }));
    fireEvent.click(screen.getByRole('button', { name: '🖨️ 4 枚を印刷' }));
    fireEvent.click(screen.getByRole('button', { name: '✕ 中断' }));
    await screen.findByText('まとめて印刷を中断しました');
    expect(printSpy).not.toHaveBeenCalled();
    expect(sheets()).toHaveLength(0);
    // ダイアログは開いたまま (選び直して刷れる)
    expect(screen.getByRole('button', { name: '🖨️ 4 枚を印刷' })).toBeTruthy();
  });
});
