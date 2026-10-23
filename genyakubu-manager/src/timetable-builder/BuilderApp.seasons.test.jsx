// @vitest-environment jsdom
// 講習の季節 (春期 / 夏期 / 冬期) ごとの時間割 (2026-10-23)。
// 切替バーの表示、未作成の季節の始め方、季節に分ける前の project の移行を通しで見る。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BuilderApp from './BuilderApp';
import { seasonStorage } from './utils/seasons';

const T = (name) => ({ name, subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] });
const project = (name, dates, extra = {}) => ({
  version: 4,
  name,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  teachers: [T('堀上'), T('石原')],
  activeTabId: 1,
  dates: dates.map((label, i) => ({ id: i + 1, label })),
  periods: [{ id: 1, label: '1限 (13:00~14:10)' }],
  tabs: [{ id: 1, name: '中3', config: { classes: [{ id: 1, label: '3S' }], subjectCounts: { 英語: 1 } }, schedule: { 'd1-p1-c1': { subject: '英語', teacher: '堀上' } } }],
  subjects: ['英語'],
  subjectColors: {},
  combinedGroups: [],
  externalCounts: {},
  externalSessions: [],
  externalSessionPresets: [],
  snapshots: [],
  ...extra,
});
const summer = project('2026 夏期講習', ['7/29(水)', '7/30(木)']);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('builder.onboarding_seen', '1');
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('BuilderApp の季節', () => {
  it('切替バーに 3 季節の状態 (名前・期間・未作成) を出し、押すと onSeasonChange', () => {
    const onSeasonChange = vi.fn();
    render(
      <BuilderApp
        season="winter"
        onSeasonChange={onSeasonChange}
        seasonProjects={{
          spring: { status: 'loading' },
          summer: { status: 'ready', source: 'cloud', project: summer },
          winter: { status: 'missing' },
        }}
      />,
    );
    const group = screen.getByRole('group', { name: '講習の季節' });
    expect(group.textContent).toContain('2026 夏期講習');
    expect(group.textContent).toContain('2026/7/29〜7/30');
    expect(screen.getByRole('button', { name: /^冬期講習: まだありません/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^春期講習: 読み込み中/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^夏期講習:/ }));
    expect(onSeasonChange).toHaveBeenCalledWith('summer');
  });

  it('未作成の季節は始め方を出し、ほかの季節から写すと日付・時間割の空の project で開いて保存する', async () => {
    render(
      <BuilderApp
        season="winter"
        seasonProjects={{
          spring: { status: 'missing' },
          summer: { status: 'ready', source: 'cloud', project: summer },
          winter: { status: 'missing' },
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: /冬期講習の時間割はまだありません/ })).toBeTruthy();
    // 写せるのは作ってある季節だけ
    expect(screen.queryByRole('button', { name: /春期講習「/ })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: '名前' }), { target: { value: '2026 冬期講習' } });
    fireEvent.click(screen.getByRole('button', { name: /夏期講習「2026 夏期講習」の設定を写して始める/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: /自動作成/ })).toBeTruthy());
    const saved = JSON.parse(localStorage.getItem(seasonStorage('winter').storageKey));
    expect(saved.name).toBe('2026 冬期講習');
    expect(saved.dates).toEqual([]);
    expect(saved.teachers.map(t => t.name)).toEqual(['堀上', '石原']);
    expect(saved.tabs[0].schedule).toEqual({});
    // 日付が無いことと、作る場所を知らせる
    expect(screen.getByText(/まだ講習の日付がありません/)).toBeTruthy();
    // 写した元 (夏期) は変わらない
    expect(localStorage.getItem(seasonStorage('summer').storageKey)).toBeNull();
  });

  it('季節に分ける前の project (legacy) は、その季節へ移してこの端末の旧キーを消す', async () => {
    localStorage.setItem('builder.schedule_project', JSON.stringify(summer));
    render(
      <BuilderApp
        season="summer"
        seasonProjects={{
          spring: { status: 'missing' },
          summer: { status: 'legacy', source: 'legacy', project: summer },
          winter: { status: 'missing' },
        }}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /自動作成/ })).toBeTruthy());
    expect(JSON.parse(localStorage.getItem(seasonStorage('summer').storageKey)).name).toBe('2026 夏期講習');
    await waitFor(() => expect(localStorage.getItem('builder.schedule_project')).toBeNull());
    expect(await screen.findByText(/これまでの講習時間割を夏期講習として開きました/)).toBeTruthy();
  });

  it('クラウドにだけある季節は、その値で開く (既定の project を挟まない)', async () => {
    render(
      <BuilderApp
        season="summer"
        seasonProjects={{ summer: { status: 'ready', source: 'cloud', project: summer } }}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /自動作成/ })).toBeTruthy());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('2026 夏期講習');
  });

  it('読み込み中の季節は待つ (未作成と決めない)', () => {
    render(<BuilderApp season="spring" seasonProjects={{ spring: { status: 'loading' } }} />);
    expect(screen.getByRole('status').textContent).toContain('春期講習の時間割を読み込んでいます');
    expect(screen.queryByRole('heading', { name: /まだありません/ })).toBeNull();
  });
});
