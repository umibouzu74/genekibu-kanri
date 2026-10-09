import { Fragment, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
import { groupTeachersBySubject } from '../../utils/groupTeachersBySubject';
import {
  AVAILABILITY_SYMBOL,
  AVAILABILITY_WORD,
  buildSurveyLayout,
  collectSlotAvailability,
  computeSurveyDays,
  computeTabMilestones,
  countTeacherAvailability,
  getAvailabilityMark,
  hasAvailability,
  isSurveyTeacher,
  periodShortLabel,
  periodTimeText,
  surveyBaseYmd,
  surveyCells,
} from '../../utils/availability';
import type { AvailabilityCell, SurveyDay, SurveyLayoutWeek } from '../../utils/availability';
import type { AvailabilityMark, Entity, Teacher } from '../../types';

// 「🙋 出勤可能調査」タブ。講習期間に配る調査票 (どの日のどの時間に出られるか)
// の出力・回答の入力・「誰が入れるか」の一覧をまとめる。
//
//   - 📄 調査票: このプロジェクトの日付・時限・タブから紙面を組んで Excel に出す
//   - ✏️ 回答の入力: 講師を選び、調査票と同じ並び (週 × 曜日 × 時間帯) で
//     ○ / △ / × を付ける。戻ってきた紙を横に置いて同じ位置を押せばよい
//   - 👀 誰が入れるか: 講師 × (日付・時限) の一覧。列の下に ○ の人数、押すと
//     その時間の顔ぶれ (担当科目つき) を出す
//
// × は手動NG とは別に「導出される NG」として自動作成・違反チェック・Excel の
// ⚠NG に効く (utils/availability.ts の冒頭コメント)。○ と △ は表示だけ。

type Pen = AvailabilityMark | 'clear';

const loadSurveyExport = () => import('../../utils/availabilitySurveyExport');

const MARK_CLASS: Record<AvailabilityMark | 'blank', string> = {
  ok: 'bg-builder-success-soft text-builder-green border-builder-success-border',
  maybe: 'bg-builder-warning-soft text-builder-orange border-builder-warning-border',
  ng: 'bg-builder-danger-soft text-builder-red border-builder-danger-border',
  blank: 'bg-builder-surface text-builder-ink-ghost border-builder-border',
};

const PEN_OPTIONS: Array<{ pen: Pen; label: string; key: string }> = [
  { pen: 'ok', label: '○ 出られる', key: '1' },
  { pen: 'maybe', label: '△ 相談', key: '2' },
  { pen: 'ng', label: '× 出られない', key: '3' },
  { pen: 'clear', label: '消す', key: '0' },
];

const WEEKDAY_SHORT = ['日', '月', '火', '水', '木', '金', '土'];

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function markWord(mark: AvailabilityMark | null): string {
  return mark ? `${AVAILABILITY_SYMBOL[mark]} ${AVAILABILITY_WORD[mark]}` : '未記入';
}

// ペンでマスを押したときの次の記号。同じ記号のマスを押すと未記入へ戻す
// (付け間違いをその場で消せるように)。
function nextMarkFor(pen: Pen, current: AvailabilityMark | null): AvailabilityMark | null {
  if (pen === 'clear') return null;
  return current === pen ? null : pen;
}

export default function AvailabilityPanel() {
  const {
    project,
    setTeacherAvailability,
    clearTeacherAvailability,
    setTeacherAvailabilityMemo,
  } = useProjectContext();
  const { showConfirm, showToast } = useUI();

  const [view, setView] = useState<'input' | 'overview'>('input');
  const [pen, setPen] = useState<Pen>('ok');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const surveyDays = useMemo(() => computeSurveyDays(project), [project]);
  const usedDays = useMemo(() => surveyDays.filter(sd => sd.periods.length > 0), [surveyDays]);
  const allCells = useMemo(() => surveyCells(surveyDays), [surveyDays]);
  const layout = useMemo(() => buildSurveyLayout(surveyDays, {
    baseYmd: surveyBaseYmd(project, todayYmd()),
    milestones: computeTabMilestones(project),
  }), [surveyDays, project]);

  const surveyTeachers = useMemo(() => project.teachers.filter(isSurveyTeacher), [project.teachers]);
  const teacherGroups = useMemo(
    () => groupTeachersBySubject(surveyTeachers, project.subjects),
    [surveyTeachers, project.subjects],
  );
  // 表示順 (教科グループ順) の講師名。前へ / 次へ の移動に使う
  const orderedNames = useMemo(
    () => teacherGroups.flatMap(g => g.teachers.map(t => t.name)),
    [teacherGroups],
  );

  // 選択中の講師が消えた (改名・削除) / 未選択なら先頭へ
  useEffect(() => {
    if (selectedName && orderedNames.includes(selectedName)) return;
    setSelectedName(orderedNames[0] ?? null);
  }, [orderedNames, selectedName]);

  const selected = surveyTeachers.find(t => t.name === selectedName) || null;

  // パネル内のキー操作: 1/2/3/0 でペン切替。パネルの中にフォーカスがあるとき
  // だけ (window に付けると本体アプリのショートカットと干渉する)。入力欄は除く
  const handlePanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const opt = PEN_OPTIONS.find(o => o.key === e.key);
    if (opt) setPen(opt.pen);
  };

  const applyToCell = (teacher: Teacher, cell: AvailabilityCell) => {
    const current = getAvailabilityMark(teacher, cell.date, cell.period);
    setTeacherAvailability(teacher.name, [cell], nextMarkFor(pen, current));
  };

  // 1 日分 (または任意のマス群) にペンを当てる。全部すでにペンの記号なら
  // 未記入へ戻す (1 マスのときと同じ切り替え)。
  const applyToCells = (teacher: Teacher, cells: AvailabilityCell[]) => {
    if (cells.length === 0) return;
    if (pen === 'clear') {
      setTeacherAvailability(teacher.name, cells, null);
      return;
    }
    const allSame = cells.every(c => getAvailabilityMark(teacher, c.date, c.period) === pen);
    setTeacherAvailability(teacher.name, cells, allSame ? null : pen);
  };

  const handleExport = async () => {
    setExporting(true);
    let mod;
    try {
      mod = await loadSurveyExport();
    } catch (err) {
      console.error('Excel module load failed', err);
      showToast('Excel出力ライブラリの読み込みに失敗しました', 'error');
      setExporting(false);
      return;
    }
    try {
      await mod.downloadAvailabilitySurveyExcel(project);
      showToast('出勤可能調査の調査票をダウンロードしました');
    } catch (err) {
      console.error('Excel generate failed', err);
      showToast('Excelファイルの生成に失敗しました', 'error');
    } finally {
      setExporting(false);
    }
  };

  const answeredCount = surveyTeachers.filter(hasAvailability).length;

  return (
    // キー操作はペン切替の補助 (ボタンでも切り替えられる)
    <div onKeyDown={handlePanelKeyDown}>
      <div className="bg-builder-info-soft p-3 mb-4 rounded text-sm text-builder-ink border border-builder-info-border">
        <strong>出勤可能調査:</strong> 講習期間に「どの日のどの時間に出られるか」を書いてもらう調査票です。<br />
        ① <strong>📄 調査票を出力</strong>して配る (紙・データ) → ② 戻ってきた回答を<strong>✏️ 回答の入力</strong>で付ける →
        ③ <strong>👀 誰が入れるか</strong>で時間ごとの顔ぶれを確認。<br />
        <span className="text-xs">
          × は NG として自動作成・違反チェック・Excel の ⚠NG に効きます (手動NG とは別。NG の一括解除では消えません)。
          ○ と △ は時間割のセルの講師プルダウンに表示されます。
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || usedDays.length === 0}
          className="px-3 py-1.5 bg-builder-primary text-white rounded text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
          title="このプロジェクトの日付・時限・タブから調査票 (週ごと・月〜土) を組んで Excel で出力します"
        >
          {exporting ? '生成中…' : '📄 調査票を出力 (Excel)'}
        </button>
        <span className="text-xs text-builder-ink-muted">
          授業のある日 {usedDays.length} 日 / 調査するマス {allCells.length} / 回答済み {answeredCount} 名
        </span>
      </div>

      {usedDays.length === 0 ? (
        <div className="text-sm text-builder-ink-muted p-4 border border-dashed border-builder-border rounded">
          授業のある日・時限がまだありません。<strong>基本設定</strong>で日付と時限を登録し、各学年タブの「使う日・使う時限」を選んでください。
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div role="tablist" aria-label="出勤可能調査の表示" className="flex gap-1">
              {([['input', '✏️ 回答の入力'], ['overview', '👀 誰が入れるか']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={`px-3 py-1 rounded text-sm font-bold border ${view === id ? 'bg-builder-blue text-white border-builder-blue' : 'bg-builder-surface text-builder-ink border-builder-border hover:bg-builder-bg'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <PenPicker pen={pen} onChange={setPen} />
          </div>

          {view === 'input' ? (
            <>
              <TeacherPicker
                groups={teacherGroups}
                surveyDays={surveyDays}
                selectedName={selectedName}
                onSelect={setSelectedName}
              />
              {selected && (
                <TeacherSheet
                  key={selected.name}
                  teacher={selected}
                  weeks={layout.weeks}
                  unplaced={layout.unplaced}
                  surveyDays={surveyDays}
                  allCells={allCells}
                  pen={pen}
                  orderedNames={orderedNames}
                  onSelect={setSelectedName}
                  onCell={(cell) => applyToCell(selected, cell)}
                  onCells={(cells) => applyToCells(selected, cells)}
                  onFillBlanks={(mark, cells) => {
                    setTeacherAvailability(selected.name, cells, mark);
                    showToast(`${selected.name}: 未記入 ${cells.length} マスを ${AVAILABILITY_SYMBOL[mark]} にしました`, 'success', 2500);
                  }}
                  onClear={async () => {
                    const ok = await showConfirm(
                      `${selected.name} の回答とメモをすべて消して「未回答」に戻しますか？\n(Undo で戻せます)`,
                      { title: '回答を消す', danger: true, confirmLabel: '消す' },
                    );
                    if (!ok) return;
                    clearTeacherAvailability(selected.name);
                    showToast(`${selected.name} の回答を消しました`, 'success', 2500);
                  }}
                  onMemo={(memo) => setTeacherAvailabilityMemo(selected.name, memo)}
                />
              )}
            </>
          ) : (
            <AvailabilityOverview
              project={project}
              groups={teacherGroups}
              usedDays={usedDays}
              onCell={applyToCell}
              onOpenTeacher={(name) => { setSelectedName(name); setView('input'); }}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── ペン (付ける記号) ─────────────────────────────
function PenPicker({ pen, onChange }: { pen: Pen; onChange: (pen: Pen) => void }) {
  return (
    <div role="radiogroup" aria-label="付ける記号" className="flex flex-wrap items-center gap-1 text-xs">
      <span className="text-builder-ink-muted mr-1">付ける記号:</span>
      {PEN_OPTIONS.map(opt => {
        const active = pen === opt.pen;
        const tone = opt.pen === 'clear' ? MARK_CLASS.blank : MARK_CLASS[opt.pen];
        return (
          <button
            key={opt.pen}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.pen)}
            title={`キー ${opt.key} でも切り替えられます (この画面の中で)`}
            className={`px-2 py-1 rounded border font-bold ${tone} ${active ? 'ring-2 ring-builder-blue' : 'opacity-70 hover:opacity-100'}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── 講師の選択 (教科グループ + 回答状況) ───────────
function TeacherPicker({ groups, surveyDays, selectedName, onSelect }: {
  groups: Array<{ key: string; label: string; teachers: Teacher[] }>;
  surveyDays: SurveyDay[];
  selectedName: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="border border-builder-border rounded p-2 mb-3 bg-builder-surface-alt">
      <div className="text-xs text-builder-ink-muted mb-1">講師を選んで回答を付けます (未記入 = 回答はあるが書かれていないマス)</div>
      <div className="flex flex-col gap-1.5">
        {groups.map(group => (
          <div key={group.key} className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] font-bold text-builder-ink-muted w-16 shrink-0">{group.label}</span>
            {group.teachers.map(t => {
              const answered = hasAvailability(t);
              const c = countTeacherAvailability(t, surveyDays);
              const active = t.name === selectedName;
              return (
                <button
                  key={t.name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect(t.name)}
                  className={`px-2 py-0.5 rounded border text-xs ${active ? 'bg-builder-info-soft border-builder-blue font-bold text-builder-ink' : 'bg-builder-surface border-builder-border text-builder-ink hover:bg-builder-bg'}`}
                  title={answered ? `○${c.ok} △${c.maybe} ×${c.ng} 未記入${c.blank}` : '未回答'}
                >
                  {t.name}
                  <span className="ml-1 text-[10px] font-normal">
                    {answered ? (
                      <>
                        <span className="text-builder-green">○{c.ok}</span>
                        {c.maybe > 0 && <span className="text-builder-orange"> △{c.maybe}</span>}
                        {c.ng > 0 && <span className="text-builder-red"> ×{c.ng}</span>}
                        {c.blank > 0 && <span className="text-builder-ink-muted"> ?{c.blank}</span>}
                      </>
                    ) : (
                      <span className="text-builder-ink-ghost">未回答</span>
                    )}
                  </span>
                  {t.availabilityMemo && <span className="ml-0.5" aria-label="メモあり">📝</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 1 人分の回答 (調査票と同じ並び) ───────────────
function TeacherSheet({
  teacher, weeks, unplaced, surveyDays, allCells, pen, orderedNames, onSelect,
  onCell, onCells, onFillBlanks, onClear, onMemo,
}: {
  teacher: Teacher;
  weeks: SurveyLayoutWeek[];
  unplaced: SurveyDay[];
  surveyDays: SurveyDay[];
  allCells: AvailabilityCell[];
  pen: Pen;
  orderedNames: string[];
  onSelect: (name: string) => void;
  onCell: (cell: AvailabilityCell) => void;
  onCells: (cells: AvailabilityCell[]) => void;
  onFillBlanks: (mark: AvailabilityMark, cells: AvailabilityCell[]) => void;
  onClear: () => void;
  onMemo: (memo: string) => void;
}) {
  const counts = countTeacherAvailability(teacher, surveyDays);
  const blankCells = allCells.filter(c => !getAvailabilityMark(teacher, c.date, c.period));
  const idx = orderedNames.indexOf(teacher.name);
  const prevName = idx > 0 ? orderedNames[idx - 1] : null;
  const nextName = idx >= 0 && idx < orderedNames.length - 1 ? orderedNames[idx + 1] : null;
  const answered = hasAvailability(teacher);

  return (
    <div className="border border-builder-border rounded p-3 bg-builder-surface">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button type="button" disabled={!prevName} onClick={() => prevName && onSelect(prevName)}
          className="px-2 py-0.5 text-xs border border-builder-border rounded disabled:opacity-40 hover:bg-builder-bg" aria-label="前の講師">◀</button>
        <h4 className="font-bold text-builder-ink">{teacher.name} の回答</h4>
        <button type="button" disabled={!nextName} onClick={() => nextName && onSelect(nextName)}
          className="px-2 py-0.5 text-xs border border-builder-border rounded disabled:opacity-40 hover:bg-builder-bg" aria-label="次の講師">▶</button>
        <span className="text-xs text-builder-ink-muted">
          {answered ? `○${counts.ok} △${counts.maybe} ×${counts.ng} / 未記入 ${counts.blank} (全 ${counts.total} マス)` : '未回答'}
        </span>
        <span className="flex-1" />
        <button type="button" disabled={blankCells.length === 0 || !answered}
          onClick={() => onFillBlanks('ng', blankCells)}
          title="○ だけ書いてある調査票のとき: 書かれていないマスを × (出られない) にします"
          className="px-2 py-0.5 text-xs border border-builder-danger-border text-builder-red rounded disabled:opacity-40 hover:bg-builder-danger-soft">
          未記入を × に ({answered ? blankCells.length : 0})
        </button>
        <button type="button" disabled={blankCells.length === 0}
          onClick={() => onFillBlanks('ok', blankCells)}
          title="× だけ書いてある調査票のとき: 書かれていないマスを ○ (出られる) にします"
          className="px-2 py-0.5 text-xs border border-builder-success-border text-builder-green rounded disabled:opacity-40 hover:bg-builder-success-soft">
          未記入を ○ に ({blankCells.length})
        </button>
        <button type="button" disabled={!answered && !teacher.availabilityMemo} onClick={onClear}
          className="px-2 py-0.5 text-xs border border-builder-border text-builder-ink-muted rounded disabled:opacity-40 hover:bg-builder-bg">
          回答を消す
        </button>
      </div>
      <div className="text-[11px] text-builder-ink-muted mb-2">
        マスを押すと「付ける記号」が入ります (同じ記号のマスを押すと未記入へ)。日付の見出しを押すとその日を全部まとめて付けます。
      </div>

      <div className="overflow-x-auto">
        {weeks.map(week => (
          <WeekTable key={week.mondayYmd} week={week} teacher={teacher} pen={pen} onCell={onCell} onCells={onCells} />
        ))}
        {unplaced.length > 0 && (
          <div className="mt-2">
            <div className="text-xs font-bold text-builder-ink-muted mb-1">その他の日 (日付として読めないラベル)</div>
            <div className="flex flex-wrap gap-3">
              {unplaced.map(sd => (
                <div key={sd.date.id} className="border border-builder-border rounded p-1">
                  <div className="text-xs font-bold mb-1">{sd.date.label}</div>
                  {sd.periods.map(p => (
                    <SlotRow key={p.id} teacher={teacher} dateLabel={sd.date.label} period={p} onCell={onCell} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <MemoField key={teacher.name} value={teacher.availabilityMemo || ''} onCommit={onMemo} />
    </div>
  );
}

function WeekTable({ week, teacher, pen, onCell, onCells }: {
  week: SurveyLayoutWeek;
  teacher: Teacher;
  pen: Pen;
  onCell: (cell: AvailabilityCell) => void;
  onCells: (cells: AvailabilityCell[]) => void;
}) {
  const visibleBands = week.bandRows.map((rows, b) => ({ rows, b })).filter(x => x.rows > 0);
  const hasNotes = week.days.some(d => d.notes.length > 0);
  return (
    <table className="border-collapse text-xs mb-3 table-fixed" style={{ minWidth: week.days.length * 132 }}>
      <colgroup>
        {week.days.map(day => (
          <Fragment key={day.ymd}>
            <col style={{ width: 92 }} />
            <col style={{ width: 40 }} />
          </Fragment>
        ))}
      </colgroup>
      <thead>
        <tr>
          {week.days.map(day => {
            const label = `${day.month}/${day.day}(${WEEKDAY_SHORT[day.weekday]})`;
            const cells: AvailabilityCell[] = (day.survey?.periods || []).map(p => ({ date: day.survey!.date.label, period: p.label }));
            const isWeekend = day.weekday === 0 || day.weekday === 6;
            if (cells.length === 0) {
              return (
                <th key={day.ymd} colSpan={2} scope="col"
                  className={`border border-builder-border px-1 py-1 font-normal bg-builder-bg ${isWeekend ? 'text-builder-blue' : 'text-builder-ink-subtle'}`}>
                  {label}
                </th>
              );
            }
            return (
              <th key={day.ymd} colSpan={2} scope="col" className="border border-builder-border p-0 bg-builder-surface-alt">
                <button
                  type="button"
                  onClick={() => onCells(cells)}
                  className={`w-full px-1 py-1 font-bold hover:bg-builder-info-soft ${isWeekend ? 'text-builder-blue' : 'text-builder-ink'}`}
                  title={pen === 'clear' ? 'この日の回答を全部消す' : `この日を全部 ${AVAILABILITY_SYMBOL[pen]} にする (全部 ${AVAILABILITY_SYMBOL[pen]} なら未記入へ)`}
                  aria-label={`${label} を全部${pen === 'clear' ? '消す' : `${AVAILABILITY_SYMBOL[pen]}にする`}`}
                >
                  {label}
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {visibleBands.map(({ rows, b }, bandIdx) => (
          <Fragment key={b}>
            {bandIdx > 0 && (
              <tr aria-hidden="true"><td colSpan={week.days.length * 2} className="h-1.5 p-0" /></tr>
            )}
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                {week.days.map(day => {
                  const p = day.bandPeriods[b]?.[r];
                  if (!p || !day.survey) return <td key={day.ymd} colSpan={2} className="p-0" />;
                  const dateLabel = day.survey.date.label;
                  const mark = getAvailabilityMark(teacher, dateLabel, p.label);
                  return (
                    <Fragment key={day.ymd}>
                      <td className="border border-builder-border px-1 py-0.5 text-builder-ink whitespace-nowrap" title={p.label}>
                        {periodTimeText(p)}
                      </td>
                      <td className="border border-builder-border p-0">
                        <MarkButton
                          mark={mark}
                          onClick={() => onCell({ date: dateLabel, period: p.label })}
                          label={`${dateLabel} ${periodTimeText(p)}`}
                        />
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </Fragment>
        ))}
        {hasNotes && (
          <tr>
            {week.days.map(day => (
              <td key={day.ymd} colSpan={2} className="px-1 pt-0.5 text-[10px] text-builder-ink-muted align-top">
                {day.notes.map(n => <div key={n}>＊{n}</div>)}
              </td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}

function SlotRow({ teacher, dateLabel, period, onCell }: {
  teacher: Teacher; dateLabel: string; period: Entity; onCell: (cell: AvailabilityCell) => void;
}) {
  const mark = getAvailabilityMark(teacher, dateLabel, period.label);
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="w-24 whitespace-nowrap" title={period.label}>{periodTimeText(period)}</span>
      <span className="w-10">
        <MarkButton mark={mark} onClick={() => onCell({ date: dateLabel, period: period.label })} label={`${dateLabel} ${periodTimeText(period)}`} />
      </span>
    </div>
  );
}

function MarkButton({ mark, onClick, label, compact = false }: {
  mark: AvailabilityMark | null; onClick: () => void; label: string; compact?: boolean;
}) {
  const tone = MARK_CLASS[mark || 'blank'];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${markWord(mark)}`}
      title={`${label}: ${markWord(mark)}`}
      className={`w-full ${compact ? 'h-5 text-[11px]' : 'h-6 text-sm'} font-bold border-0 ${tone} hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-builder-blue focus-visible:ring-inset`}
    >
      {mark ? AVAILABILITY_SYMBOL[mark] : ''}
    </button>
  );
}

// メモ (draft 方式。blur / Enter で 1 回だけ保存)
function MemoField({ value, onCommit }: { value: string; onCommit: (memo: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft != null && draft.trim() !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <label className="flex flex-col gap-1 text-xs mt-2 max-w-xl">
      <span className="text-builder-ink-muted">メモ (調査票の備考・聞き取ったこと)</span>
      <input
        type="text"
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setDraft(d => d ?? value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            if (e.nativeEvent?.isComposing) return;
            e.stopPropagation();
            setDraft(null);
          }
        }}
        placeholder="例: 8/5 は 19:00 以降なら可 / 電話で確認 (7/10)"
        className="border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
      />
    </label>
  );
}

// ── 誰が入れるか (講師 × 日付・時限) ───────────────
function AvailabilityOverview({ project, groups, usedDays, onCell, onOpenTeacher }: {
  project: { teachers: Teacher[]; tabs: Array<{ name: string; config: { classes: Entity[]; activeDateIds?: number[] | null; activePeriodIds?: number[] | null } }> };
  groups: Array<{ key: string; label: string; teachers: Teacher[] }>;
  usedDays: SurveyDay[];
  onCell: (teacher: Teacher, cell: AvailabilityCell) => void;
  onOpenTeacher: (name: string) => void;
}) {
  const [showUnanswered, setShowUnanswered] = useState(false);
  const [focus, setFocus] = useState<AvailabilityCell | null>(null);

  const visibleGroups = groups
    .map(g => ({ ...g, teachers: showUnanswered ? g.teachers : g.teachers.filter(hasAvailability) }))
    .filter(g => g.teachers.length > 0);
  const visibleTeachers = visibleGroups.flatMap(g => g.teachers);
  const allSurveyTeachers = groups.flatMap(g => g.teachers);
  const hiddenCount = allSurveyTeachers.length - visibleTeachers.length;

  // その (日付, 時限) に授業のあるタブ (タブの使う日・使う時限から)
  const tabsAt = (dateId: number, periodId: number) => project.tabs.filter(t => {
    const ds = t.config.activeDateIds;
    const ps = t.config.activePeriodIds;
    if (Array.isArray(ds) && !ds.includes(dateId)) return false;
    if (Array.isArray(ps) && !ps.includes(periodId)) return false;
    return true;
  });
  const classCount = (dateId: number, periodId: number): number =>
    tabsAt(dateId, periodId).reduce((sum, t) => sum + (t.config.classes?.length || 0), 0);

  const focusInfo = focus ? collectSlotAvailability(allSurveyTeachers, focus.date, focus.period) : null;
  const focusDay = focus ? usedDays.find(sd => sd.date.label === focus.date) : null;
  const focusPeriod = focusDay?.periods.find(p => p.label === focus?.period) || null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-2 text-xs">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={showUnanswered} onChange={(e) => setShowUnanswered(e.target.checked)} />
          回答のない講師も表示{hiddenCount > 0 && !showUnanswered ? ` (${hiddenCount} 名を非表示中)` : ''}
        </label>
        <span className="text-builder-ink-muted">マスを押すと「付ける記号」が入ります。下の人数を押すと、その時間の顔ぶれを出します。</span>
      </div>

      {visibleTeachers.length === 0 ? (
        <div className="text-sm text-builder-ink-muted p-4 border border-dashed border-builder-border rounded">
          まだ回答がありません。✏️ 回答の入力で講師ごとに付けてください。
        </div>
      ) : (
        <div className="overflow-x-auto border border-builder-border rounded">
          <table className="border-collapse text-xs whitespace-nowrap">
            <thead>
              <tr>
                <th rowSpan={2} scope="col" className="sticky left-0 z-10 bg-builder-surface-alt border border-builder-border px-2 py-1 text-left">講師</th>
                {usedDays.map(sd => (
                  <th key={sd.date.id} colSpan={sd.periods.length} scope="colgroup"
                    className="border border-builder-border border-l-2 border-l-builder-ink-ghost bg-builder-surface-alt px-1 py-0.5"
                    title={sd.tabNames.join('・')}>
                    {sd.date.label}
                  </th>
                ))}
              </tr>
              <tr>
                {usedDays.map(sd => sd.periods.map((p, i) => (
                  <th key={`${sd.date.id}-${p.id}`} scope="col"
                    className={`border border-builder-border bg-builder-surface-alt px-0.5 font-normal text-[10px] min-w-[26px] ${i === 0 ? 'border-l-2 border-l-builder-ink-ghost' : ''}`}
                    title={`${p.label} (授業 ${classCount(sd.date.id, p.id)} クラス)`}>
                    {periodShortLabel(p)}
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map(group => (
                <Fragment key={group.key}>
                  <tr>
                    <td colSpan={1 + usedDays.reduce((n, sd) => n + sd.periods.length, 0)}
                      className="sticky left-0 bg-builder-bg border border-builder-border px-2 py-0.5 text-[11px] font-bold text-builder-ink-muted">
                      ━ {group.label}
                    </td>
                  </tr>
                  {group.teachers.map(t => (
                    <tr key={t.name}>
                      <th scope="row" className="sticky left-0 z-10 bg-builder-surface border border-builder-border px-2 py-0 text-left font-bold">
                        <button type="button" onClick={() => onOpenTeacher(t.name)}
                          className="hover:underline text-builder-ink"
                          title={t.availabilityMemo ? `メモ: ${t.availabilityMemo}` : 'この講師の回答を入力'}>
                          {t.name}{t.availabilityMemo ? ' 📝' : ''}
                        </button>
                      </th>
                      {usedDays.map(sd => sd.periods.map((p, i) => (
                        <td key={`${sd.date.id}-${p.id}`}
                          className={`border border-builder-border p-0 ${i === 0 ? 'border-l-2 border-l-builder-ink-ghost' : ''}`}>
                          <MarkButton
                            compact
                            mark={getAvailabilityMark(t, sd.date.label, p.label)}
                            onClick={() => onCell(t, { date: sd.date.label, period: p.label })}
                            label={`${t.name} ${sd.date.label} ${periodTimeText(p)}`}
                          />
                        </td>
                      )))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="sticky left-0 z-10 bg-builder-surface-alt border border-builder-border px-2 py-0.5 text-left">○ の人数</th>
                {usedDays.map(sd => sd.periods.map((p, i) => {
                  const s = collectSlotAvailability(allSurveyTeachers, sd.date.label, p.label);
                  const isFocus = focus?.date === sd.date.label && focus?.period === p.label;
                  return (
                    <td key={`${sd.date.id}-${p.id}`}
                      className={`border border-builder-border p-0 text-center ${i === 0 ? 'border-l-2 border-l-builder-ink-ghost' : ''}`}>
                      <button type="button"
                        onClick={() => setFocus(isFocus ? null : { date: sd.date.label, period: p.label })}
                        aria-pressed={isFocus}
                        aria-label={`${sd.date.label} ${periodTimeText(p)} に出られる人: ${s.ok.length} 名${s.maybe.length > 0 ? `、相談 ${s.maybe.length} 名` : ''}`}
                        className={`w-full px-0.5 leading-tight ${isFocus ? 'bg-builder-info-soft ring-2 ring-builder-blue ring-inset' : 'hover:bg-builder-bg'}`}>
                        <span className="font-bold text-builder-green">{s.ok.length}</span>
                        {s.maybe.length > 0 && <span className="block text-[9px] text-builder-orange">△{s.maybe.length}</span>}
                      </button>
                    </td>
                  );
                }))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {focus && focusInfo && (
        <div className="mt-3 border border-builder-info-border bg-builder-info-soft rounded p-3 text-xs" aria-live="polite">
          <div className="flex items-center gap-2 mb-1">
            <strong className="text-sm">{focus.date} {focusPeriod ? periodTimeText(focusPeriod) : focus.period}</strong>
            {focusDay && focusPeriod && (
              <span className="text-builder-ink-muted">
                授業 {classCount(focusDay.date.id, focusPeriod.id)} クラス ({tabsAt(focusDay.date.id, focusPeriod.id).map(t => t.name).join('・')})
              </span>
            )}
            <span className="flex-1" />
            <button type="button" onClick={() => setFocus(null)} className="text-builder-ink-muted hover:text-builder-ink" aria-label="閉じる">✕</button>
          </div>
          <SlotNames label="○ 出られる" tone="text-builder-green" teachers={focusInfo.ok} />
          <SlotNames label="△ 相談" tone="text-builder-orange" teachers={focusInfo.maybe} />
          <SlotNames label="× 出られない" tone="text-builder-red" teachers={focusInfo.ng} />
          <SlotNames label="? 未記入" tone="text-builder-ink-muted" teachers={focusInfo.blank} />
          <SlotNames label="未回答" tone="text-builder-ink-subtle" teachers={focusInfo.unanswered} />
        </div>
      )}
    </div>
  );
}

function SlotNames({ label, tone, teachers }: { label: string; tone: string; teachers: Teacher[] }) {
  if (teachers.length === 0) return null;
  return (
    <div className="flex gap-2 py-0.5">
      <span className={`w-28 shrink-0 font-bold whitespace-nowrap ${tone}`}>{label} {teachers.length}</span>
      <span className="text-builder-ink">
        {teachers.map(t => `${t.name}${t.subjects?.length ? `(${t.subjects.join('/')})` : ''}`).join('、')}
      </span>
    </div>
  );
}
