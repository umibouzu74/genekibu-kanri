// LocalStorage 容量の健全性チェック (E6c)。
//
// LocalStorage はオリジンあたり概ね 5MB が上限。大規模な講習プロジェクト
// (多数のタブ + スナップショット + 履歴) で上限に近づくと、保存が silent に
// 失敗してデータを失う恐れがある。起動時に概算サイズを測り、しきい値を超えたら
// toast で警告する。
//
// 純粋関数として切り出し、ScheduleApp 側の effect から呼ぶ。

// 多くのブラウザの localStorage 上限 (オリジンあたり)。
export const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

// この割合を超えたら警告する (ROADMAP E6c の「50%」)。
export const STORAGE_WARN_RATIO = 0.5;

// 値を直列化した時の概算バイト数。localStorage は UTF-16 で保持するため
// 1 文字 ≈ 2 byte で概算する (絵文字等のサロゲートペアも length に 2 含まれる)。
// value: 文字列ならそのまま、それ以外は JSON.stringify する。直列化不能なら 0。
export function estimateStorageBytes(value: unknown): number {
  if (value == null) return 0;
  let str: string | undefined;
  try {
    str = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return 0;
  }
  if (typeof str !== 'string') return 0;
  return str.length * 2;
}

// プロジェクトの保存サイズが警告しきい値を超えているか判定する。
export function checkStorageHealth(
  project: unknown,
  { limitBytes = STORAGE_LIMIT_BYTES, warnRatio = STORAGE_WARN_RATIO }: { limitBytes?: number; warnRatio?: number } = {},
): { bytes: number; ratio: number; warn: boolean } {
  const bytes = estimateStorageBytes(project);
  const ratio = limitBytes > 0 ? bytes / limitBytes : 0;
  return { bytes, ratio, warn: ratio >= warnRatio };
}

// N1g: origin に実際に格納されている全キーの合計バイト数を測る。
// LocalStorage の上限は origin 単位で、builder は親アプリ (原学部管理) の
// データ・テンプレート・corrupt バックアップと同居する。project 単体の
// 概算だけでは「警告は出ないのに autosave が QuotaExceeded で失敗する」が
// 起きうる。アクセス不能 (private mode 等) は null を返す。
export function measureLocalStorageBytes(): number | null {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key == null) continue;
      const value = localStorage.getItem(key);
      total += (key.length + (value?.length ?? 0)) * 2;
    }
    return total;
  } catch {
    return null;
  }
}

// origin 全体の実使用量が警告しきい値を超えているか判定する (N1g)。
// localStorage にアクセスできない環境では null。
export function checkOriginStorageHealth(
  { limitBytes = STORAGE_LIMIT_BYTES, warnRatio = STORAGE_WARN_RATIO }: { limitBytes?: number; warnRatio?: number } = {},
): { bytes: number; ratio: number; warn: boolean } | null {
  const bytes = measureLocalStorageBytes();
  if (bytes == null) return null;
  const ratio = limitBytes > 0 ? bytes / limitBytes : 0;
  return { bytes, ratio, warn: ratio >= warnRatio };
}

// バイト数を人間可読な文字列にする (KB / MB)。
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
