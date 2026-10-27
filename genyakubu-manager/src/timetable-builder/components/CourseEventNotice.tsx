import { useMemo, useState } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useHostData } from '../contexts/hostDataContext';
import { checkCourseEvents, type CourseEventLike } from '../utils/courseEventCheck';

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 本体の行事予定 (種別「📚 講習」) とタブの使う日の食い違いを知らせる (2026-10-27)。
// 食い違いがあるときだけ出す。行事予定は本体のデータなので、ここでは書き換えない
// (本体の「休講・テスト期間・イベント」の特別イベントで直す)。決まりは
// utils/courseEventCheck。
export default function CourseEventNotice() {
  const { project } = useProjectContext();
  const { specialEvents, holidays } = useHostData();
  const [open, setOpen] = useState(false);
  const { findings } = useMemo(
    () => checkCourseEvents({
      project,
      specialEvents: (specialEvents || []) as CourseEventLike[],
      holidays,
      todayYmd: todayYmd(),
    }),
    [project, specialEvents, holidays],
  );
  if (findings.length === 0) return null;
  return (
    <section
      aria-label="行事予定と講習の日程の食い違い"
      className="mb-2 px-3 py-2 bg-builder-warning-soft border border-builder-warning-border rounded no-print text-sm text-builder-ink"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span>📚 本体の行事予定 (講習) と、タブの使う日が食い違っています ({findings.length} 件)</span>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          className="px-2 py-0.5 text-xs border border-builder-warning-border rounded bg-builder-surface hover:bg-builder-surface-alt"
        >{open ? '▲ 閉じる' : '▼ 内容を見る'}</button>
      </div>
      {open && (
        <div className="mt-1 text-xs space-y-1">
          <ul className="list-disc pl-5 space-y-0.5">
            {findings.map((f, i) => (
              <li key={i}>
                {f.kind === 'outside' ? (
                  <>
                    <strong>{f.tabNames.join('・')}</strong> の {f.dates.join('、')} は、行事予定の講習の期間に入っていません
                    (近い行事予定:「{f.eventName}」{f.eventRange})
                  </>
                ) : (
                  <>
                    行事予定「{f.eventName}」{f.eventRange} のうち {f.dates.join('、')} は、どのタブも使っていません
                    ({f.tabNames.join('・')})
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="text-builder-ink-muted">
            行事予定が違っていれば、本体の「休講・テスト期間・イベント」の特別イベント (種別: 講習) で直してください。
            タブの日付が違っていれば ⚙️ 設定 &gt; 基本設定 の「使う日」で直します。日曜・塾の全体休講日は比べていません。
          </p>
        </div>
      )}
    </section>
  );
}
