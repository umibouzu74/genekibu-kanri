import { useEffect, useState } from "react";
import { fmtDate } from "../utils/dateHelpers";

// 「今日」の "YYYY-MM-DD" を返すフック。タブを開いたまま深夜 0 時を跨いだ
// 場合も、翌 0 時 (+1 秒のマージン) に setTimeout で再レンダーして値が
// 変わる (H2c)。useMemo の deps に入れることで「new Date() を deps 外で
// 読んで日付跨ぎに気付けない」問題を解消する。
// スリープ復帰などで setTimeout の発火が遅れても、発火時点の現在日付を
// 読み直すので値は正しくなる。
export function useToday() {
  const [today, setToday] = useState(() => fmtDate(new Date()));

  useEffect(() => {
    let timer;
    const armNextMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        1
      );
      timer = setTimeout(() => {
        setToday(fmtDate(new Date()));
        armNextMidnight();
      }, nextMidnight.getTime() - now.getTime());
    };
    armNextMidnight();
    return () => clearTimeout(timer);
  }, []);

  return today;
}
