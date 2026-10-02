import { OFFSITE_LESSON_COLOR as OC } from "../constants/colors";
import { formatOffsiteTime, formatOffsitePeriod } from "../utils/offsiteLessons";
import { sortTeacherNames } from "../utils/teacherKana";

// その日に他校舎へ授業に出ている講師 (utils/offsiteLessons) のバナー。
// 日別ダッシュボード (DashDayRow)・タイムテーブル (ExcelGridView)・
// 欠勤組み換えで共有する。塾の授業ではないのでコマの欄には混ぜず、日単位で
// 「この時間は誰が居ないか」を 1 行ずつ出す (行き先 × 時刻ごとに講師をまとめる)。
// 呼び出し側は休講日でも隠さない (休講日は既定で他校舎も休みなので、出ている
// のは「休講日も行く」と登録した予定だけ — それは出すべき情報)。
// onOpen (id) を渡すと講師名から他校舎の授業の画面 (その 1 件) を開ける。
export function OffsiteLessonBanner({ lessons, teacherKana, onOpen, style }) {
  if (!lessons || lessons.length === 0) return null;
  const groups = [];
  const byKey = new Map();
  for (const r of lessons) {
    const key = `${r.time}|${r.place}`;
    if (!byKey.has(key)) {
      const g = { key, time: r.time, place: r.place, recs: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    byKey.get(key).recs.push(r);
  }
  const activatable = typeof onOpen === "function";
  return (
    <div
      role="note"
      aria-label="他校舎の授業"
      style={{
        background: OC.bannerBg,
        border: `1px solid ${OC.bannerBorder}`,
        borderRadius: 8,
        padding: "6px 12px",
        marginBottom: 10,
        display: "flex",
        flexDirection: "column",
        gap: 3,
        ...style,
      }}
    >
      {groups.map((g) => {
        const names = sortTeacherNames(
          [...new Set(g.recs.map((r) => r.teacher))],
          teacherKana
        );
        return (
          <div
            key={g.key}
            style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}
          >
            <span
              style={{
                background: OC.color,
                color: "#fff",
                fontSize: 10,
                fontWeight: 800,
                padding: "1px 6px",
                borderRadius: 3,
              }}
            >
              🏫 他校舎
            </span>
            <b>{formatOffsiteTime(g.time)}</b>
            <span style={{ fontWeight: 700 }}>{g.place}</span>
            <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
              {names.map((name) => {
                const rec = g.recs.find((r) => r.teacher === name);
                const title = `${name}: ${g.place} ${formatOffsiteTime(g.time)} (${formatOffsitePeriod(rec)})${
                  rec.memo ? `\n${rec.memo}` : ""
                }`;
                return activatable ? (
                  <button
                    key={name}
                    type="button"
                    className="inline-activate"
                    onClick={() => onOpen(rec.id)}
                    title={`${title}\nクリックで他校舎の授業を開きます`}
                    style={{
                      border: "none",
                      background: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: OC.deep,
                      fontWeight: 700,
                      fontSize: 12,
                      textDecoration: "underline dotted",
                    }}
                  >
                    {name}
                  </button>
                ) : (
                  <span key={name} title={title} style={{ color: OC.deep, fontWeight: 700 }}>
                    {name}
                  </span>
                );
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
