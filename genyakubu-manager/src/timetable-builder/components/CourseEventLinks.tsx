import { useMemo } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { useHostData } from '../contexts/hostDataContext';
import { checkCourseEvents, type CourseEventLike } from '../utils/courseEventCheck';

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 本体の行事予定 (講習) とタブの結び付け (2026-10-27)。講習で使う日の前後 2 週間に
// かかる行事予定ごとに、比べるタブ・「この講習の対象外」を選ぶ。結び付けたタブは
// その行事予定とだけ比べる。決まりは utils/courseEventCheck
export default function CourseEventLinks() {
  const { project, setCourseEventLink, linkCourseEvents, setCourseEventIgnored } = useProjectContext();
  const { specialEvents, holidays } = useHostData();
  const { showToast } = useUI();
  const { rows, staleLinks } = useMemo(
    () => checkCourseEvents({ project, specialEvents: (specialEvents || []) as CourseEventLike[], holidays, todayYmd: todayYmd() }),
    [project, specialEvents, holidays],
  );
  // 見つからない行事予定への結び付け (名前の打ち間違い・ほかの季節から写したもの)。
  // 比べるときは無かったことにしているので、ここで外せるようにする
  const staleNotice = staleLinks.length > 0 && (
    <div className="p-2 rounded border border-builder-warning-border bg-builder-warning-soft text-builder-ink" role="group" aria-label="見つからない行事予定への結び付け">
      <div className="font-bold mb-1">講習の日付の前後に見つからない行事予定への結び付け ({staleLinks.length} 件)</div>
      <div className="text-builder-ink-muted mb-1">名前が変わった・ほかの季節から写した結び付けです。このタブは結び付けの無いタブとして比べています。</div>
      <ul className="space-y-0.5">
        {staleLinks.map(l => (
          <li key={`${l.tabId}:${l.name}`} className="flex flex-wrap items-center gap-2">
            <span>{l.tabName} → 「{l.name}」</span>
            <button
              type="button"
              onClick={() => setCourseEventLink(l.tabId, l.name, false)}
              className="px-1.5 py-0.5 rounded border border-builder-border bg-builder-surface hover:bg-builder-surface-alt"
              aria-label={`${l.tabName} の「${l.name}」への結び付けを外す`}
            >外す</button>
          </li>
        ))}
      </ul>
    </div>
  );
  if (rows.length === 0) {
    return (
      <div className="space-y-2 text-xs">
        <p className="text-builder-ink-muted">講習の日付の前後に、本体の行事予定 (種別「📚 講習」) はありません。</p>
        {staleNotice}
      </div>
    );
  }
  const tabs = project.tabs || [];
  const suggestions = rows.flatMap(r => r.suggestedTabIds.map(tabId => ({ tabId, name: r.name })));
  const applySuggestions = () => {
    linkCourseEvents(suggestions);
    showToast(`${suggestions.length} 個のタブを行事予定に結び付けました (Undo で戻せます)`, 'success', 3500);
  };

  return (
    <div className="space-y-2 text-xs">
      <p className="text-builder-ink-muted">
        タブに行事予定を結び付けると、そのタブはその行事予定とだけ比べます (行事予定「中3 直前ポイント演習 火木」とタブ「中３直前 火木」など)。
        結び付けの無いタブは、どのタブにも結び付けていない行事予定のうち、学年の合うものと比べます。この講習と関係の無い行事予定は「対象外」にします。
      </p>
      {staleNotice}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={applySuggestions}
            className="px-2 py-1 rounded bg-builder-blue text-white font-bold hover:bg-builder-blue-hover"
          >名前から結び付ける ({suggestions.length} タブ)</button>
          <span className="text-builder-ink-muted">点線のタブが提案です (学年を除いたタブ名と行事予定の名前が近いもの)</span>
        </div>
      )}
      <div className="overflow-x-auto border border-builder-border rounded">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-builder-surface-alt text-builder-ink">
              <th className="text-left px-2 py-1 border-b border-builder-border">行事予定</th>
              <th className="text-left px-2 py-1 border-b border-builder-border whitespace-nowrap">期間</th>
              <th className="text-left px-2 py-1 border-b border-builder-border">比べるタブ</th>
              <th className="px-2 py-1 border-b border-builder-border whitespace-nowrap">対象外</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key} className={row.ignored ? 'text-builder-ink-muted' : 'text-builder-ink'}>
                <td className="px-2 py-1 border-b border-builder-border">
                  {row.name}
                  {row.grades.length > 0 && <span className="ml-1 text-[11px] text-builder-ink-muted">({row.grades.join('・')})</span>}
                </td>
                <td className="px-2 py-1 border-b border-builder-border whitespace-nowrap">{row.range}</td>
                <td className="px-2 py-1 border-b border-builder-border">
                  <div className="flex flex-wrap gap-1" role="group" aria-label={`「${row.name}」と比べるタブ`}>
                    {tabs.map(t => {
                      const on = row.linkedTabIds.includes(t.id);
                      const suggested = row.suggestedTabIds.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={row.ignored}
                          aria-pressed={on}
                          aria-label={`${t.name}${suggested ? ' (提案)' : ''}`}
                          onClick={() => setCourseEventLink(t.id, row.name, !on)}
                          className={`px-1.5 py-0.5 rounded border disabled:opacity-40 ${on
                            ? 'bg-builder-info-soft border-builder-blue font-bold'
                            : suggested ? 'border-dashed border-builder-blue bg-builder-surface' : 'border-builder-border bg-builder-surface hover:bg-builder-surface-alt'}`}
                        >{t.name}</button>
                      );
                    })}
                  </div>
                  {row.linkedTabIds.length === 0 && !row.ignored && (
                    <div className="text-[11px] text-builder-ink-muted mt-0.5">結び付け無し (学年の合う、結び付けの無いタブと比べます)</div>
                  )}
                </td>
                <td className="px-2 py-1 border-b border-builder-border text-center">
                  <input
                    type="checkbox"
                    checked={row.ignored}
                    onChange={() => setCourseEventIgnored(row.name, !row.ignored)}
                    aria-label={`「${row.name}」をこの講習の対象外にする`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
