// @vitest-environment jsdom
// 本校 ⇄ 亀井町の移動 (2026-11-25)。本体の「高校・予備校の講習」から取り込んだ亀井町の
// 授業 (place) と本体の講師の所属 (予備校部) が講習の画面まで届き、移動が間に合わない
// コマは NG、間の短いコマと予備校部の「亀井町から戻り」は注意として見えるか。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import BuilderApp from './BuilderApp';
import { seasonStorage } from './utils/seasons';

const T = (name) => ({ name, subjects: ['英語'], ngSlots: [], ngClasses: [], priorityClasses: [] });
const kamei = (id, teacherName, date, memo, startTime, endTime) => ({
  id, date, teacherName, label: '', memo, startTime, endTime, place: '亀井町', source: 'seniorKoshu', sourceKey: `${id}:x`,
});
const project = {
  version: 4,
  name: '2026 冬期講習',
  createdAt: '2026-11-25T00:00:00.000Z',
  updatedAt: '2026-11-25T00:00:00.000Z',
  teachers: [T('石原'), T('半田'), T('河野')],
  activeTabId: 1,
  dates: [{ id: 1, label: '1/4(月)' }, { id: 2, label: '1/6(水)' }],
  periods: [{ id: 1, label: '夜1限 (18:30~19:20)' }, { id: 2, label: '夜3限 (20:20~21:10)' }],
  tabs: [{
    id: 1,
    name: '中1・2',
    config: { classes: [{ id: 1, label: '1A' }], subjectCounts: { 英語: 2 } },
    schedule: {
      'd1-p1-c1': { subject: '英語', teacher: '石原' },
      'd2-p2-c1': { subject: '英語', teacher: '半田' },
    },
  }],
  subjects: ['英語'],
  subjectColors: {},
  combinedGroups: [],
  externalCounts: {},
  externalSessions: [
    kamei(1, '石原', '1/4(月)', '高1・高2 Ⅱ期 高校①', '16:40', '18:10'),
    kamei(2, '半田', '1/6(水)', '高1・高2 Ⅱ期 高校②', '18:20', '19:50'),
  ],
  externalSessionPresets: [],
  snapshots: [],
};
// 講習の初日 (2027-01-04) の年度 = 2026 年度
const CATEGORIES = { 2026: { 石原: 'genyakuFull', 半田: 'yobiko', 河野: 'genyakuFull' } };

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('builder.onboarding_seen', '1');
  localStorage.setItem(seasonStorage('winter').storageKey, JSON.stringify(project));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const optionText = (selectId, name) =>
  Array.from(document.getElementById(selectId).options).find(o => o.value === name).textContent;

describe('BuilderApp: 本校 ⇄ 亀井町の移動', () => {
  it('移動が間に合わないコマは NG:移動、30 分の間 + 予備校部は「移動30分・亀井町から戻り」の注意', async () => {
    render(<BuilderApp season="winter" teacherCategoriesByYear={CATEGORIES} />);
    await screen.findByLabelText('強調表示');
    // 石原 1/4 夜1限: 高校① (〜18:10) のあと 20 分
    expect(document.getElementById('select-1-1-1-cell').textContent).toContain('NG設定違反');
    expect(optionText('select-1-1-1-teacher', '石原')).toBe('石原 (NG:移動)');
    // 半田 1/6 夜3限: 高校② (〜19:50) のあと 30 分 = 注意 (違反ではない)
    const caution = document.getElementById('select-2-2-1-cell');
    expect(caution.textContent).not.toContain('NG設定違反');
    expect(caution.textContent).toContain('🚗 移動30分・亀井町から戻り');
    // ⚠ の内訳: NG は「NG に当たっている割当」、注意は別の「注意」の項目
    fireEvent.click(screen.getByRole('button', { name: /⚠️ 1件 ・注意1/ }));
    const dialog = screen.getByRole('dialog', { name: '違反の内訳' });
    expect(within(dialog).getByText(/NG に当たっている割当/)).toBeInTheDocument();
    expect(dialog.textContent).toContain('NG: 移動が間に合わない: 高1・高2 Ⅱ期 高校① 16:40〜18:10 (亀井町) のあと 20分 (移動に30分)');
    expect(dialog.textContent).toContain('注意 (1件、違反には数えません)');
    expect(dialog.textContent).toContain('亀井町から本校に戻る (予備校部)');
  });

  it('所属が分からない (本体のデータ無し) なら「戻り」は出さず、間の分数の注意だけ', async () => {
    render(<BuilderApp season="winter" />);
    await screen.findByLabelText('強調表示');
    expect(document.getElementById('select-2-2-1-cell').textContent).toContain('🚗 移動30分');
    expect(document.getElementById('select-2-2-1-cell').textContent).not.toContain('戻り');
  });
});
