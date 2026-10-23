// ─── 講習の季節 (春期 / 夏期 / 冬期) ごとの project の状態 ─────────────
// 講習時間割作成の project は季節ごとに別の保存先にある (timetable-builder/
// utils/seasons)。本体 (hooks/useBuilderProjects) はクラウドと LocalStorage の
// 読み取り結果をここへ渡し、季節ごとに「どの project を使うか」と「状態」を
// 決める。講習時間割作成の画面 (開く / 未作成なら始め方を出す) と、講師の
// 月間の「講」(全季節) が同じ決定を使う。
//
// 状態:
//   ready   … 季節の project がある (クラウド or この端末)
//   legacy  … 季節の project は無いが、季節に分ける前の単一 project がこの季節の
//             もの (日付から推定)。開くとこの季節へ移す (旧ノードは消さない)
//   missing … どこにも無い (講習時間割作成では始め方を出す)
//   loading … クラウドをまだ読めていない (読めるまで決めない — 先に決めると、
//             クラウドにある季節を「未作成」と出したり、古い端末のキャッシュを
//             移したりする)
//
// 決まり:
//   - クラウドに値があればそれ (表示は解釈できたときだけ。新しい形式などで読めない
//     ときはこの端末の値を出す)。無ければこの端末の値
//   - 単一 project は、クラウドが使える端末ではクラウドの旧ノードが正。旧ノードを
//     読めるまで (or 空 / 読めないと分かるまで) は loading。この端末の旧キーは
//     クラウドが使えない端末 (未設定 / 旧ノードが空・読めない) でだけ使う。
//     クラウドに季節が 1 つでもあれば (= どこかの端末で移行が始まっている)、この端末の
//     旧キーは使わない (旧ノードが後から空になったとき、古い控えを生き返らせない)
//     旧ノードが空 / 読めないときは、季節のノードを全部読めるまで決めない (読めた順に
//     よっては、季節のある端末で古い旧キーを legacy として開いてしまう)
//   - loading / missing の季節には、この端末の旧キーがその季節のものなら localFallback に
//     付ける (オフラインで開いたとき・クラウドに季節があって旧キーを使わないときに、人が
//     選べば手元の控えで始められるように。自動では使わない)

import { KOSHU_SEASONS } from "../timetable-builder/utils/seasons";
import { inferProjectSeason } from "../timetable-builder/utils/seasonProject";

/**
 * @typedef {{received?: boolean, raw?: string|null, project?: object|null, error?: boolean}} CloudSlot
 *   received: 初回の値を受け取った / raw: 生の値 (null = 空) / project: 解釈した project
 *   (解釈できなければ null) / error: 読めなかった (権限など)
 * @typedef {{exists?: boolean, project?: object|null}} LocalSlot
 *   exists: LocalStorage にキーがある (壊れていても true) / project: 解釈した project
 */

/**
 * 季節に分ける前の単一 project のうち、どれを使うか。
 * @param {{configured: boolean, legacyCloud?: CloudSlot, legacyLocal?: LocalSlot}} args
 * @returns {{pending: boolean, project: object|null}}
 */
export function resolveLegacyProject({
  configured,
  legacyCloud,
  legacyLocal,
  anySeasonInCloud = false,
  allSeasonsKnown = true,
}) {
  if (configured) {
    if (legacyCloud?.raw != null) return { pending: false, project: legacyCloud.project ?? null };
    if (!legacyCloud?.received && !legacyCloud?.error) return { pending: true, project: null };
    // 旧ノードが空 / 読めない: この端末の旧キーを使うかは、季節のノードを全部読んでから
    if (legacyLocal?.project && !allSeasonsKnown) return { pending: true, project: null };
    if (anySeasonInCloud) return { pending: false, project: null };
  }
  return { pending: false, project: legacyLocal?.project ?? null };
}

const anySeasonIn = (cloud) => KOSHU_SEASONS.some(({ key }) => cloud?.[key]?.raw != null);
const allSeasonsKnownIn = (cloud) =>
  KOSHU_SEASONS.every(({ key }) => cloud?.[key]?.received || cloud?.[key]?.error);

/**
 * クラウドの旧ノードの project が、推定した季節のノードへ移し終わっているか
 * (どこかの端末で移行済み)。この端末に残った旧キーを消してよいかの判定。
 * @param {{cloud?: Record<string, CloudSlot>, legacyCloud?: CloudSlot, today?: Date}} args
 */
export function isLegacyMigrated({ cloud = {}, legacyCloud, today = new Date() }) {
  const project = legacyCloud?.project;
  if (!project) return false;
  return cloud[inferProjectSeason(project, today)]?.raw != null;
}

/**
 * @param {{
 *   configured: boolean,
 *   cloud?: Record<string, CloudSlot>,   // 季節 → クラウドの読み取り
 *   local?: Record<string, LocalSlot>,   // 季節 → この端末の読み取り
 *   legacyCloud?: CloudSlot,
 *   legacyLocal?: LocalSlot,
 *   today?: Date,                        // 単一 project の季節の推定 (日付が無いとき)
 * }} args
 * @returns {Record<string, {status: "ready"|"legacy"|"missing"|"loading", source: "cloud"|"local"|"legacy"|null, project: object|null, localFallback?: object|null}>}
 */
export function resolveSeasonProjects({
  configured,
  cloud = {},
  local = {},
  legacyCloud,
  legacyLocal,
  today = new Date(),
}) {
  const legacy = resolveLegacyProject({
    configured,
    legacyCloud,
    legacyLocal,
    anySeasonInCloud: configured && anySeasonIn(cloud),
    allSeasonsKnown: !configured || allSeasonsKnownIn(cloud),
  });
  const legacySeason = legacy.project ? inferProjectSeason(legacy.project, today) : null;
  const localLegacySeason = legacyLocal?.project ? inferProjectSeason(legacyLocal.project, today) : null;
  const loading = (key) => ({
    status: "loading",
    source: null,
    project: null,
    localFallback: localLegacySeason === key ? legacyLocal.project : null,
  });
  const out = {};
  for (const { key } of KOSHU_SEASONS) {
    const c = cloud[key] || {};
    const l = local[key] || {};
    if (configured && c.raw != null) {
      out[key] = { status: "ready", source: "cloud", project: c.project ?? l.project ?? null };
    } else if (l.exists) {
      out[key] = { status: "ready", source: "local", project: l.project ?? null };
    } else if (configured && !c.received && !c.error) {
      out[key] = loading(key);
    } else if (legacy.pending) {
      out[key] = loading(key);
    } else if (legacySeason === key) {
      out[key] = { status: "legacy", source: "legacy", project: legacy.project };
    } else {
      out[key] = {
        status: "missing",
        source: null,
        project: null,
        localFallback: localLegacySeason === key ? legacyLocal.project : null,
      };
    }
  }
  return out;
}
