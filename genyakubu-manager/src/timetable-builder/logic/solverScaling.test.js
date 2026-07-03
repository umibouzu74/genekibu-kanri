// E4b: solver スケーリング計測 (手動実行のベンチマーク)。
//
// 通常の `npm test` ではスキップされる (実行に数十秒かかるため)。
// 実行: `npm run bench:solver`  (BENCH=1 で有効化)
//
// 計測の目的は「何コマまで数秒以内に解けるか」と、探索が刺さる構成の
// 特定。2026-07-03 の実測 (コンテナ環境) の要点:
//   - 実行時間の上限は maxIterations (500k) で頭打ちし、コマ数に応じて
//     1 iteration あたり ~3µs (168 コマ) 〜 ~6µs (1008 コマ)。
//     つまり最悪でも 1 案あたり 1.6〜3.2 秒程度で返ってくる
//   - 難易度はコマ数ではなく「クォータの均等性」に支配される。
//     500 コマでも科目クォータが D*P を割り切る構成なら数百 iteration で
//     完全解。168 コマでも不均等 (24 = 5+5+5+5+4) だと 500k を使い切って
//     部分解 (159/168 前後) に落ちる
//   - 上記から、既定 500k は「待ち時間の上限を数秒に抑える」妥当な既定。
//     不均等クォータの改善余地はソルバの科目選択順 (LCV 化) にある
//     (ROADMAP E4b の記録参照)
import { describe, expect, it } from 'vitest';
import { generateSinglePattern } from './autoGenerator';

const SUBJECTS = ['英語', '数学', '国語', '理科', '社会'];

function wrapEntities(labels) {
  return labels.map((label, i) => ({ id: i + 1, label }));
}

// D×P×C のベンチ用 project。
// - クォータ: 各クラス D*P コマを 5 科目に均等配分 (割り切れない分は先頭
//   科目から +1 → 「不均等」構成になる)
// - 講師: 科目ごとに ceil(C*0.6)+1 名 (単科目担当)。NG・合同・他タブ無し
function buildBenchProject({ days, periods, classes }) {
  const dates = wrapEntities(
    Array.from({ length: days }, (_, i) => `7/${20 + i}`)
  );
  const periodEnts = wrapEntities(
    Array.from({ length: periods }, (_, i) => `${i + 1}限`)
  );
  const classEnts = wrapEntities(
    Array.from({ length: classes }, (_, i) => `C${i + 1}`)
  );
  const total = days * periods;
  const base = Math.floor(total / SUBJECTS.length);
  let rem = total - base * SUBJECTS.length;
  const subjectCounts = {};
  for (const s of SUBJECTS) {
    subjectCounts[s] = base + (rem > 0 ? 1 : 0);
    rem--;
  }
  const perSubject = Math.ceil(classes * 0.6) + 1;
  const teachers = [];
  for (const s of SUBJECTS) {
    for (let i = 0; i < perSubject; i++) {
      teachers.push({
        name: `${s}T${i + 1}`,
        subjects: [s],
        ngSlots: [],
        ngClasses: [],
        priorityClasses: [],
      });
    }
  }
  return {
    version: 4,
    name: 'bench',
    teachers,
    activeTabId: 1,
    dates,
    periods: periodEnts,
    tabs: [
      {
        id: 1,
        name: 'tab1',
        config: { classes: classEnts, subjectCounts },
        schedule: {},
      },
    ],
    externalCounts: {},
    combinedGroups: [],
    subjects: SUBJECTS,
    subjectColors: {},
  };
}

// 均等/不均等クォータの対比が付くようにサイズを選ぶ。
// (D*P % 5 === 0 なら均等 → 簡単、それ以外は不均等 → 探索が刺さりやすい)
//
// 注意: periods > 科目数 の構成は「同日・同クラスで科目重複禁止」により
// 構造的に解が存在しない (初版の XL 12d×6p×14c はこれで常に部分解だった)。
// ベンチ構成を足すときは periods ≤ 科目数 を守ること。
const SIZES = [
  { name: 'S 27 (3d×3p×3c, 不均等)', days: 3, periods: 3, classes: 3 },
  { name: 'M 168 (6d×4p×7c, 不均等)', days: 6, periods: 4, classes: 7 },
  { name: 'M2 210 (6d×5p×7c, 均等)', days: 6, periods: 5, classes: 7 },
  { name: 'L 500 (10d×5p×10c, 均等)', days: 10, periods: 5, classes: 10 },
  // 実運用外のストレス構成 (18 クラス)。充足可能かは未検証で、
  // 「上限到達時の挙動 (実行時間・部分解の充填度)」を見るのが目的
  { name: 'XL 864 (12d×4p×18c, 不均等)', days: 12, periods: 4, classes: 18 },
];

describe.skipIf(!process.env.BENCH)('solver スケーリング計測 (E4b)', () => {
  it('サイズ別に実行時間・iteration・完全/部分解を計測する', () => {
    const rows = [];
    for (const size of SIZES) {
      for (const seed of [1, 2]) {
        const project = buildBenchProject(size);
        const t0 = performance.now();
        const r = generateSinglePattern({ project, activeTabId: 1, seed });
        const ms = performance.now() - t0;
        rows.push({
          size: size.name,
          seed,
          ms: Math.round(ms),
          iterations: r.iterations,
          'µs/iter': r.iterations ? +(ms * 1000 / r.iterations).toFixed(1) : 0,
          complete: r.solution != null,
          filled: `${r.filledCount}/${r.totalSlots}`,
        });
        // 計測条件の健全性: 途中で例外落ちせず必ず結果が返ること
        expect(r.totalSlots).toBeGreaterThan(0);
      }
    }
    // eslint-disable-next-line no-console
    console.table(rows);
  }, 600_000);
});
