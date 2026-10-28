// 本体の行事予定の名前の比べ方 (2026-10-27)。全角半角・空白の違いを同じ名前として
// 扱う。講習のタブと行事予定 (講習) の結び付け (utils/courseEventCheck) と reducer が
// 共有する。無依存 (reducer から本体のモジュールを引き込まないように)。
export function normalizeEventName(name: unknown): string {
  return String(name ?? '').normalize('NFKC').replace(/\s+/g, '').trim();
}
