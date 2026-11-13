// @vitest-environment jsdom
// 通常授業との講師の重なり (2026-11-13)。本体 (App.jsx) から渡した時間割・代行などが
// 講習の画面まで届き、通常授業と重なる時限が NG として見えるか。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import BuilderApp from './BuilderApp';
import { seasonStorage } from './utils/seasons';

const T = (name) => ({ name, subjects: ['数学'], ngSlots: [], ngClasses: [], priorityClasses: [] });
// 1/13 は 2027 年の水曜 (3学期の通常授業と並走する枠)
const project = {
  version: 4,
  name: '2026 冬期講習',
  createdAt: '2026-11-13T00:00:00.000Z',
  updatedAt: '2026-11-13T00:00:00.000Z',
  teachers: [T('片岡'), T('福江')],
  activeTabId: 1,
  dates: [{ id: 1, label: '1/13(水)' }],
  periods: [{ id: 1, label: '1限 (18:00~19:00)' }, { id: 2, label: '2限 (19:10~20:10)' }],
  tabs: [{
    id: 1,
    name: '中3',
    config: { classes: [{ id: 1, label: '3S' }], subjectCounts: { 数学: 2 } },
    schedule: {
      'd1-p1-c1': { subject: '数学', teacher: '片岡' },
      'd1-p2-c1': { subject: '数学', teacher: '片岡' },
    },
  }],
  subjects: ['数学'],
  subjectColors: {},
  combinedGroups: [],
  externalCounts: {},
  externalSessions: [],
  externalSessionPresets: [],
  snapshots: [],
};

const TIMETABLES = [{ id: 4, name: '3学期', type: 'regular', startDate: '2027-01-08', endDate: null, grades: [] }];
const SLOTS = [
  { id: 1, timetableId: 4, day: '水', time: '19:55-20:55', grade: '附中1', cls: '-', room: '601', subj: '数学', teacher: '片岡', note: '' },
];

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

describe('BuilderApp: 通常授業との講師の重なり', () => {
  it('本体の通常授業と重なる時限は、入っているセルが NG設定違反・プルダウンが (NG:通常) になる', async () => {
    render(<BuilderApp season="winter" regularSlots={SLOTS} regularTimetables={TIMETABLES} />);
    await screen.findByLabelText('強調表示');
    // 2限 (19:10〜20:10) ↔ 附中1 数学 19:55-20:55。1限は重ならない
    const ngCell = document.getElementById('select-1-2-1-cell');
    expect(ngCell.textContent).toContain('NG設定違反');
    expect(document.getElementById('select-1-1-1-cell').textContent).not.toContain('NG設定違反');
    expect(optionText('select-1-2-1-teacher', '片岡')).toBe('片岡 (NG:通常)');
    expect(optionText('select-1-2-1-teacher', '福江')).not.toContain('NG');
    expect(optionText('select-1-1-1-teacher', '片岡')).not.toContain('NG');
  });

  it('その日の代行が付いていれば代行者が NG になり、休む人は外れる', async () => {
    const substitutes = [
      { id: 1, date: '2027-01-13', slotId: 1, originalTeacher: '片岡', substitute: '福江', status: 'confirmed', memo: '' },
    ];
    render(<BuilderApp season="winter" regularSlots={SLOTS} regularTimetables={TIMETABLES} substitutes={substitutes} />);
    await screen.findByLabelText('強調表示');
    expect(document.getElementById('select-1-2-1-cell').textContent).not.toContain('NG設定違反');
    expect(optionText('select-1-2-1-teacher', '福江')).toBe('福江 (NG:通常)');
  });

  it('本体のデータが無ければ (単体で描く) 従来どおり NG なし', async () => {
    render(<BuilderApp season="winter" />);
    await screen.findByLabelText('強調表示');
    expect(document.body.textContent).not.toContain('NG設定違反');
    expect(optionText('select-1-2-1-teacher', '片岡')).not.toContain('NG');
  });
});
