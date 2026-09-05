import { useEffect, useState } from "react";

// 「印刷専用の DOM を出してから window.print() し、印刷ダイアログが閉じたら
// 元に戻す」トグル。true にすると描画反映を待って印刷を開き、afterprint で
// 自動的に false に戻る (全曜日印刷・講師別週間印刷が同じ手順を持っていた)。
export function usePrintOnce() {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const t = setTimeout(() => window.print(), 50); // 描画が反映されてから
    return () => {
      window.removeEventListener("afterprint", done);
      clearTimeout(t);
    };
  }, [printing]);
  return [printing, setPrinting];
}
