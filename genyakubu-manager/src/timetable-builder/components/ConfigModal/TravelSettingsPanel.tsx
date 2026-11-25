import { useProjectContext } from '../../contexts/projectContextValue';
import DraftNumberInput from './DraftNumberInput';
import {
  BUILDER_TAB_PLACE,
  DEFAULT_TRAVEL_CAUTION_MINUTES,
  DEFAULT_TRAVEL_MINUTES,
  KAMEI_CAMPUS,
  MAIN_CAMPUS,
  isDefaultTravelSettings,
  resolveTravelSettings,
  sessionPlace,
  travelMinutesBetween,
  withMainKameiMinutes,
} from '../../utils/places';

// 場所の間の移動時間 (2026-11-25、utils/places・utils/travel)。講習時間割作成のタブは本校で、
// 本体の「高校・予備校の講習」の高校①〜③ は亀井町。同じ講師・同じ日に場所の違う授業が
// あるとき、間が移動時間未満なら NG、注意の分数未満なら注意 (違反には数えない)。
// 予備校部の先生が亀井町のあとに本校のコマへ戻るときは間の分数に関係なく注意。
export default function TravelSettingsPanel() {
  const { project, setTravel } = useProjectContext();
  const travel = resolveTravelSettings(project);
  const minutes = travelMinutesBetween(travel, MAIN_CAMPUS, KAMEI_CAMPUS) ?? DEFAULT_TRAVEL_MINUTES;
  const sessions = project.externalSessions || [];
  const away = sessions.filter(s => {
    const p = sessionPlace(s);
    return p && p !== BUILDER_TAB_PLACE;
  }).length;
  const legacy = sessions.filter(s => s.source === 'seniorKoshu' && !s.place).length;

  const parse = (raw: string): number | null => {
    const n = Number(raw);
    return raw.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };
  const commitMinutes = (raw: string) => {
    const n = parse(raw);
    if (n == null) return;
    setTravel(withMainKameiMinutes(travel, n));
  };
  const commitCaution = (raw: string) => {
    const n = parse(raw);
    if (n == null) return;
    setTravel({ ...travel, cautionMinutes: n });
  };

  return (
    <section aria-label="校舎間の移動" className="mb-4 p-3 rounded border border-builder-border text-sm">
      <div className="font-bold mb-1">🚗 校舎間の移動 ({MAIN_CAMPUS} ⇄ {KAMEI_CAMPUS})</div>
      <div className="text-xs text-builder-ink-muted mb-2">
        この講習の時間割 (タブ) は <b>{BUILDER_TAB_PLACE}</b> です。場所の違う他学年セッション (本体の「高校・予備校の講習」の
        高校①〜③ = {KAMEI_CAMPUS}) がある日は、前の授業の終わりから次の授業の始まりまでの間を見ます。
        間が移動時間に足りないコマは <b>NG (移動)</b>、注意の分数に足りないコマは <b>注意 (「移動30分」など。違反には数えません)</b>。
        予備校部の先生が {KAMEI_CAMPUS} の授業のあとに {BUILDER_TAB_PLACE} のコマに入るときは、間の分数に関係なく
        <b>「{KAMEI_CAMPUS}から戻り」</b> の注意を出し、自動作成ではできるだけ避けます。同じ場所どうし ({BUILDER_TAB_PLACE} の予備校1〜4限) は時間の重なりだけを見ます。
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="inline-flex items-center gap-1">
          移動時間
          <DraftNumberInput
            min={0}
            value={minutes}
            onCommit={commitMinutes}
            aria-label={`${MAIN_CAMPUS}と${KAMEI_CAMPUS}の移動時間 (分)`}
            className="w-16 px-1 py-0.5 border border-builder-border rounded bg-builder-surface text-builder-ink"
          />
          分未満は NG
        </label>
        <label className="inline-flex items-center gap-1">
          注意
          <DraftNumberInput
            min={0}
            value={travel.cautionMinutes}
            onCommit={commitCaution}
            aria-label="場所の違う授業の間がこの分数未満なら注意 (分)"
            className="w-16 px-1 py-0.5 border border-builder-border rounded bg-builder-surface text-builder-ink"
          />
          分未満 (間に 1 コマ分の時間の目安)
        </label>
        {!isDefaultTravelSettings(project.travel) && (
          <button
            type="button"
            onClick={() => setTravel(null)}
            className="px-2 py-0.5 rounded border border-builder-border bg-builder-surface text-builder-ink hover:bg-builder-bg"
          >
            既定に戻す ({DEFAULT_TRAVEL_MINUTES}分・{DEFAULT_TRAVEL_CAUTION_MINUTES}分)
          </button>
        )}
      </div>
      <div className="mt-2 text-[11px] text-builder-ink-muted">
        {away > 0
          ? `${BUILDER_TAB_PLACE}以外の場所の他学年セッション: ${away} 件`
          : `${BUILDER_TAB_PLACE}以外の場所の他学年セッションはまだありません (本体の「高校・予備校の講習」を取り込むと、時限の場所が入ります)`}
        {legacy > 0 && (
          <span className="block text-builder-orange">
            場所の欄ができる前に取り込んだもの {legacy} 件は、メモの時限の名前 (高校①〜③ = {KAMEI_CAMPUS}) で場所を当てています。
            上の「取り込む」で入れ直すと、本体の時限の場所が入ります。
          </span>
        )}
      </div>
    </section>
  );
}
