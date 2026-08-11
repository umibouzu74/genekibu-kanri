// ─── 下書きの保存サイズ (通常時間割作成) ────────────────────────────
// 下書きは LocalStorage (+ クラウド同期) に 1 キーで入るため、スナップ
// ショットを溜めると容量を圧迫する。書き込み失敗 (quota) は toast で
// 出るが、そうなる前に「今どれくらい使っているか」が見えないと手の
// 打ちようがない。ここはその見積りを出す純関数。
//
// 実サイズはブラウザの実装差があるので UTF-8 バイト数の目安を出す
// (LocalStorage の実装は UTF-16 で数えることが多く、実際はこれより
// 大きくなりうる — あくまで「増えているか」を見るための指標)。

const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

/** JSON 化したときの概算バイト数 */
export function jsonByteSize(value) {
  let text;
  try {
    text = JSON.stringify(value) ?? "";
  } catch {
    return 0; // 循環参照など (通常は起きない)
  }
  if (encoder) return encoder.encode(text).length;
  // TextEncoder の無い環境: ASCII 前提の下限見積り
  return text.length;
}

/** バイト数を "12.3 KB" のような表示にする */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * プロジェクトの保存サイズの内訳。
 * @returns {{
 *   total: number,      // プロジェクト全体 (スナップショット込み)
 *   snapshots: number,  // スナップショットが占める分
 *   body: number,       // 本体 (total - snapshots)
 *   snapshotSizes: {id: number, name: string, bytes: number}[],
 * }}
 */
export function projectStorageSize(project) {
  if (!project || typeof project !== "object") {
    return { total: 0, snapshots: 0, body: 0, snapshotSizes: [] };
  }
  const snaps = project.snapshots || [];
  const total = jsonByteSize(project);
  const { snapshots: _s, ...body } = project;
  const bodySize = jsonByteSize(body);
  return {
    total,
    snapshots: Math.max(0, total - bodySize),
    body: bodySize,
    snapshotSizes: snaps.map((s) => ({
      id: s.id,
      name: s.name,
      bytes: jsonByteSize(s),
    })),
  };
}
