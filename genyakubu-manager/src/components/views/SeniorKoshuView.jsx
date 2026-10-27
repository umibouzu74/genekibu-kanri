import { useMemo, useState } from "react";
import { useToasts } from "../../hooks/useToasts";
import { useConfirm } from "../../hooks/useConfirm";
import { useRemoveWithUndo } from "../../hooks/useCrudResource";
import { useToday } from "../../hooks/useToday";
import { PrintButton } from "../PrintButton";
import { MultiDateCalendar } from "../MultiDateCalendar";
import { S, colors } from "../../styles/common";
import { fmtMD, parseLocalDate } from "../../utils/dateHelpers";
import { WEEKDAYS } from "../../constants/schools";
import { fiscalYearOf } from "../../utils/teacherAffiliations";
import { compareTeacherNames } from "../../utils/teacherKana";
import { formatOffsiteTime, offsiteTimeRange } from "../../utils/offsiteLessons";
import {
  SENIOR_KOSHU_TEMPLATE,
  addSeniorLessons,
  applySeniorKoshuImport,
  formatTermDates,
  lessonDates,
  parseDateListYmd,
  parseSeniorKoshuImport,
  removePeriod,
  removeTerm,
  toggleLessonSkip,
  updateSeniorLesson,
  upsertPeriod,
  upsertTerm,
} from "../../utils/seniorKoshu";

// ─── 高校部・予備校の講習 ─────────────────────────────────────────────
// 期 (日の並び) × 時限 (時刻) × 担当 (講師・学年・講座名) を登録する画面
// (utils/seniorKoshu)。登録した担当は講師の月間の予定に出て、講習時間割作成が
// 取り込んで自動NG にする。パンフレットの担当表は「📋 表でまとめて登録」で貼る。
//
// 削除: 担当は cascade 無しなので removeWithUndo。期・時限は担当ごと消えるので
// 確認ダイアログ (CLAUDE.md の削除 UX ルール)。
// 印刷系統: PrintButton (window.print())。入力欄と操作ボタンは no-print。

const ACCENT = "#6a3fa0";
const box = { ...S.panel, padding: 14, marginBottom: 14 };
const h3 = { fontSize: 15, fontWeight: 800, margin: "0 0 8px" };
const hint = { fontSize: 11, color: colors.inkSubtle };
const smallBtn = {
  border: "1px solid #ccc",
  background: "#fff",
  borderRadius: 6,
  padding: "3px 8px",
  fontSize: 12,
  cursor: "pointer",
};
const dangerBtn = { ...smallBtn, borderColor: "#e0b4b4", color: "#c03030" };
const primaryBtn = { ...S.btn(true), background: ACCENT, padding: "6px 12px" };
const th = { textAlign: "left", fontSize: 12, padding: "4px 6px", borderBottom: "1px solid #ddd", whiteSpace: "nowrap" };
const td = { fontSize: 13, padding: "4px 6px", borderBottom: "1px solid #eee", verticalAlign: "top" };

const startMin = (time) => offsiteTimeRange(time)?.start ?? 24 * 60;
const wd = (d) => WEEKDAYS[parseLocalDate(d)?.getDay() ?? 0];

/**
 * @param {object} props
 * @param {import("../../types").SeniorKoshuData} props.data
 * @param {(next: any) => void} props.onSave (値 か updater)
 * @param {boolean} props.isAdmin
 * @param {string[]} [props.teacherNames] 本体の講師名 (入力候補・知らない名前の注意)
 * @param {Record<string, string>} [props.teacherKana]
 * @param {(teacher: string) => void} [props.onSelectTeacher] 講師名 → その人の月間
 */
export function SeniorKoshuView({
  data,
  onSave,
  isAdmin,
  teacherNames = [],
  teacherKana = {},
  onSelectTeacher,
}) {
  const today = useToday();
  const toasts = useToasts();
  const confirm = useConfirm();
  const [termFilter, setTermFilter] = useState("current");
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState(null); // 'import' | 'term' | 'period' | 'lesson'
  const [editTermId, setEditTermId] = useState(null);
  const [editPeriodId, setEditPeriodId] = useState(null);
  const [openDaysId, setOpenDaysId] = useState(null);
  const [editLessonId, setEditLessonId] = useState(null);

  const saveLessons = (lessons) => onSave((prev) => ({ ...prev, lessons }));
  const removeLessonWithUndo = useRemoveWithUndo({ list: data.lessons, save: saveLessons });
  const cmpTeacher = useMemo(() => compareTeacherNames(teacherKana), [teacherKana]);
  const knownTeachers = useMemo(() => new Set(teacherNames), [teacherNames]);

  // 期の絞り込み: これから (最後の日が今日以降) / すべて / 期ごと
  const visibleTerms = useMemo(() => {
    const list = [...data.terms].sort((a, b) => (a.dates[0] || "").localeCompare(b.dates[0] || "") || a.id - b.id);
    if (termFilter === "all") return list;
    if (termFilter === "current") return list.filter((t) => !t.dates.length || t.dates[t.dates.length - 1] >= today);
    return list.filter((t) => String(t.id) === termFilter);
  }, [data.terms, termFilter, today]);
  const periodById = useMemo(() => new Map(data.periods.map((p) => [p.id, p])), [data.periods]);
  const q = query.trim();
  const matches = (l) => !q || [l.teacher, l.course, l.grade, l.memo].some((v) => String(v || "").includes(q));

  const unknownTeachers = useMemo(
    () => [...new Set(data.lessons.map((l) => l.teacher))].filter((n) => !knownTeachers.has(n)).sort(cmpTeacher),
    [data.lessons, knownTeachers, cmpTeacher]
  );

  const handleRemoveTerm = async (term) => {
    const n = data.lessons.filter((l) => l.termId === term.id).length;
    const ok = await confirm({
      title: "期の削除",
      message: `期「${term.name}」を消します。${n > 0 ? `この期の担当 ${n} 件も消えます。` : ""}よろしいですか？`,
      okLabel: "消す",
      tone: "danger",
    });
    if (!ok) return;
    onSave((prev) => removeTerm(prev, term.id));
    toasts.success(`期「${term.name}」を消しました`);
  };
  const handleRemovePeriod = async (period) => {
    const n = data.lessons.filter((l) => l.periodId === period.id).length;
    const ok = await confirm({
      title: "時限の削除",
      message: `時限「${period.name}」を消します。${n > 0 ? `この時限の担当 ${n} 件も消えます。` : ""}よろしいですか？`,
      okLabel: "消す",
      tone: "danger",
    });
    if (!ok) return;
    onSave((prev) => removePeriod(prev, period.id));
    toasts.success(`時限「${period.name}」を消しました`);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 12, color: colors.inkMuted, lineHeight: 1.7, flex: "1 1 320px" }}>
          高校部 (高1・高2 / 高3) と予備校の講習の担当です。登録すると、その講師の月間の予定に「講」で出ます
          (時間割にコマの無い先生もサイドバーに並びます)。講習時間割作成 (中学の講習) では ⚙ 設定 → 講師不在・NG の
          「🎓 本体の高校・予備校の講習を取り込む」で講師の不在 (自動NG) になります。期 (日程) と時限 (時刻) を作ってから
          担当を入れます。パンフレットの担当表は「📋 表でまとめて登録」で貼れます。
        </p>
        <PrintButton />
      </div>

      {isAdmin && (
        <div className="no-print" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {[
            ["import", "📋 表でまとめて登録"],
            ["term", "＋ 期"],
            ["period", "＋ 時限"],
            ["lesson", "＋ 担当"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-expanded={panel === key}
              onClick={() => setPanel(panel === key ? null : key)}
              style={{ ...S.btn(panel === key), padding: "6px 12px" }}
            >{label}</button>
          ))}
        </div>
      )}

      {isAdmin && panel === "import" && (
        <ImportPanel data={data} onSave={onSave} today={today} onDone={() => setPanel(null)} knownTeachers={knownTeachers} />
      )}
      {isAdmin && panel === "term" && (
        <TermEditor
          data={data}
          onSave={onSave}
          today={today}
          onDone={() => setPanel(null)}
        />
      )}
      {isAdmin && panel === "period" && (
        <PeriodEditor data={data} onSave={onSave} onDone={() => setPanel(null)} />
      )}
      {isAdmin && panel === "lesson" && (
        <LessonForm data={data} onSave={onSave} onDone={() => setPanel(null)} teacherNames={teacherNames} />
      )}

      {/* 期・時限 */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        <section style={{ ...box, flex: "1 1 320px" }} aria-labelledby="senior-koshu-terms">
          <h3 id="senior-koshu-terms" style={h3}>期 ({data.terms.length})</h3>
          {data.terms.length === 0 && <div style={hint}>まだ期がありません。</div>}
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {[...data.terms].sort((a, b) => (a.dates[0] || "").localeCompare(b.dates[0] || "")).map((t) => (
              <li key={t.id} style={{ padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
                {editTermId === t.id ? (
                  <TermEditor data={data} onSave={onSave} today={today} term={t} onDone={() => setEditTermId(null)} />
                ) : (
                  <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                    <b style={{ fontSize: 13 }}>{t.name}</b>
                    <span style={{ fontSize: 12, color: "#555" }}>{formatTermDates(t.dates)}</span>
                    <span style={hint}>担当 {data.lessons.filter((l) => l.termId === t.id).length}</span>
                    {isAdmin && (
                      <span className="no-print" style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                        <button type="button" style={smallBtn} onClick={() => setEditTermId(t.id)} aria-label={`期「${t.name}」を直す`}>直す</button>
                        <button type="button" style={dangerBtn} onClick={() => handleRemoveTerm(t)} aria-label={`期「${t.name}」を消す`}>消す</button>
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section style={{ ...box, flex: "1 1 260px" }} aria-labelledby="senior-koshu-periods">
          <h3 id="senior-koshu-periods" style={h3}>時限 ({data.periods.length})</h3>
          {data.periods.length === 0 && <div style={hint}>まだ時限がありません。</div>}
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {[...data.periods].sort((a, b) => startMin(a.time) - startMin(b.time)).map((p) => (
              <li key={p.id} style={{ padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
                {editPeriodId === p.id ? (
                  <PeriodEditor data={data} onSave={onSave} period={p} onDone={() => setEditPeriodId(null)} />
                ) : (
                  <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                    <b style={{ fontSize: 13 }}>{p.name}</b>
                    <span style={{ fontSize: 12, color: p.time ? "#555" : "#c03030" }}>{p.time ? formatOffsiteTime(p.time) : "時刻なし"}</span>
                    {isAdmin && (
                      <span className="no-print" style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                        <button type="button" style={smallBtn} onClick={() => setEditPeriodId(p.id)} aria-label={`時限「${p.name}」を直す`}>直す</button>
                        <button type="button" style={dangerBtn} onClick={() => handleRemovePeriod(p)} aria-label={`時限「${p.name}」を消す`}>消す</button>
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 担当 */}
      <section style={box} aria-labelledby="senior-koshu-lessons">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <h3 id="senior-koshu-lessons" style={{ ...h3, margin: 0 }}>担当 ({data.lessons.length})</h3>
          <span className="no-print" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={termFilter}
              onChange={(e) => setTermFilter(e.target.value)}
              style={{ ...S.input, width: "auto", padding: "4px 8px", fontSize: 12 }}
              aria-label="期で絞る"
            >
              <option value="current">これからの期</option>
              <option value="all">すべての期</option>
              {data.terms.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
            </select>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="講師・講座名で探す"
              aria-label="講師・講座名で探す"
              style={{ ...S.input, width: 180, padding: "4px 8px", fontSize: 12 }}
            />
          </span>
        </div>
        {unknownTeachers.length > 0 && (
          <div style={{ ...hint, color: "#9a5b00", marginBottom: 6 }} className="no-print">
            時間割・講師管理に出てこない講師: {unknownTeachers.join("・")} (月間の予定はサイドバーの講師一覧から開けます。名前の打ち間違いがないか確かめてください)
          </div>
        )}
        {visibleTerms.length === 0 && <div style={hint}>表示する期がありません。</div>}
        {visibleTerms.map((t) => {
          const lessons = data.lessons
            .filter((l) => l.termId === t.id && matches(l))
            .sort((a, b) =>
              startMin(periodById.get(a.periodId)?.time) - startMin(periodById.get(b.periodId)?.time)
              || String(a.grade || "").localeCompare(String(b.grade || ""), "ja")
              || String(a.course).localeCompare(String(b.course), "ja")
              || cmpTeacher(a.teacher, b.teacher));
          if (lessons.length === 0 && q) return null;
          return (
            <div key={t.id} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: ACCENT, margin: "6px 0 2px" }}>
                {t.name} <span style={{ fontWeight: 400, color: "#666", fontSize: 12 }}>{formatTermDates(t.dates)}</span>
              </div>
              {lessons.length === 0 ? (
                <div style={hint}>担当がまだありません。</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={th}>時限</th>
                        <th style={th}>学年</th>
                        <th style={th}>講座名</th>
                        <th style={th}>講師</th>
                        <th style={th}>担当する日</th>
                        <th style={th}>メモ</th>
                        {isAdmin && <th style={th} className="no-print"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {lessons.map((l) => {
                        const period = periodById.get(l.periodId);
                        const days = lessonDates(data, l);
                        const editing = editLessonId === l.id;
                        return (
                          <tr key={l.id}>
                            <td style={td}>
                              {period?.name}
                              <div style={hint}>{period?.time ? formatOffsiteTime(period.time) : ""}</div>
                            </td>
                            {editing ? (
                              <LessonEditCells lesson={l} onSave={onSave} onDone={() => setEditLessonId(null)} />
                            ) : (
                              <>
                                <td style={td}>{l.grade || ""}</td>
                                <td style={td}>{l.course}</td>
                                <td style={td}>
                                  {onSelectTeacher ? (
                                    <button
                                      type="button"
                                      onClick={() => onSelectTeacher(l.teacher)}
                                      style={{ border: "none", background: "none", padding: 0, color: "#1a4e8a", textDecoration: "underline", cursor: "pointer", fontSize: 13 }}
                                      title={`${l.teacher} の月間の予定を開く`}
                                    >{l.teacher}</button>
                                  ) : l.teacher}
                                </td>
                              </>
                            )}
                            <td style={td}>
                              <span>{days.length}/{t.dates.length}日</span>
                              {l.skipDates && l.skipDates.length > 0 && (
                                <div style={hint}>外す: {l.skipDates.map((d) => fmtMD(d)).join("・")}</div>
                              )}
                              {isAdmin && t.dates.length > 1 && (
                                <button
                                  type="button"
                                  className="no-print"
                                  style={{ ...smallBtn, marginLeft: 4 }}
                                  aria-expanded={openDaysId === l.id}
                                  onClick={() => setOpenDaysId(openDaysId === l.id ? null : l.id)}
                                  aria-label={`${l.teacher} ${l.course} の担当する日を選ぶ`}
                                >📅</button>
                              )}
                              {openDaysId === l.id && (
                                <div className="no-print" style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 4 }} role="group" aria-label="担当する日 (押すと外す)">
                                  {t.dates.map((d) => {
                                    const on = !(l.skipDates || []).includes(d);
                                    return (
                                      <button
                                        key={d}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => onSave((prev) => toggleLessonSkip(prev, l.id, d))}
                                        style={{
                                          ...smallBtn,
                                          padding: "1px 6px",
                                          background: on ? "#efe7f8" : "#fff",
                                          borderColor: on ? ACCENT : "#ccc",
                                          textDecoration: on ? "none" : "line-through",
                                          color: on ? "#333" : "#999",
                                        }}
                                      >{fmtMD(d)}({wd(d)})</button>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                            {!editing && <td style={td}>{l.memo || ""}</td>}
                            {isAdmin && !editing && (
                              <td style={{ ...td, whiteSpace: "nowrap" }} className="no-print">
                                <button type="button" style={smallBtn} onClick={() => setEditLessonId(l.id)} aria-label={`${l.teacher} ${l.course} を直す`}>直す</button>{" "}
                                <button
                                  type="button"
                                  style={dangerBtn}
                                  aria-label={`${l.teacher} ${l.course} を消す`}
                                  onClick={() => removeLessonWithUndo(l.id, { successMsg: `担当を消しました (${t.name} ${period?.name || ""} ${l.course} ${l.teacher})` })}
                                >消す</button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

// 期を作る / 直す: 名前 + 日 (期間で足す・カレンダーで 1 日ずつ)
function TermEditor({ data, onSave, today, term = null, onDone }) {
  const toasts = useToasts();
  const [name, setName] = useState(term?.name || "");
  const [dates, setDates] = useState(term?.dates || []);
  const [range, setRange] = useState("");
  const [error, setError] = useState(null);
  const toggle = (d) => setDates((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  const addRange = () => {
    const { dates: add, unknown } = parseDateListYmd(range, fiscalYearOf(today));
    if (unknown.length > 0 || add.length === 0) {
      setError(`「${range}」が読めません (例: 12/24〜12/27、12/24・26・28)`);
      return;
    }
    setDates((prev) => [...new Set([...prev, ...add])].sort());
    setRange("");
    setError(null);
  };
  const submit = () => {
    const r = upsertTerm(data, { id: term?.id ?? null, name, dates });
    if (r.error) {
      setError(r.error);
      return;
    }
    if (dates.length === 0) {
      setError("期の日を 1 日以上選んでください");
      return;
    }
    onSave((prev) => upsertTerm(prev, { id: term?.id ?? null, name, dates }).data || prev);
    toasts.success(term ? `期「${name.trim()}」を直しました` : `期「${name.trim()}」を作りました`);
    onDone();
  };
  return (
    <div className="no-print" style={{ ...box, borderColor: ACCENT }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 8 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={S.formLabel}>期の名前</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 高3 Ⅰ期" style={{ ...S.input, width: 200 }} aria-label="期の名前" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={S.formLabel}>期間で足す (日曜は入りません)</span>
          <input
            value={range}
            onChange={(e) => setRange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent?.isComposing) { e.preventDefault(); addRange(); } }}
            placeholder="例: 12/24〜12/27"
            style={{ ...S.input, width: 180 }}
            aria-label="期間で足す"
          />
        </label>
        <button type="button" style={smallBtn} onClick={addRange}>足す</button>
        {dates.length > 0 && <button type="button" style={smallBtn} onClick={() => setDates([])}>日を全部外す</button>}
      </div>
      <div style={{ fontSize: 12, marginBottom: 6 }}>期の日: <b>{formatTermDates(dates)}</b></div>
      <MultiDateCalendar selected={dates} onToggle={toggle} initialMonth={dates[0] || today} label="期の日" />
      {error && <div role="alert" style={{ color: "#c03030", fontSize: 12, marginTop: 6 }}>{error}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button type="button" style={primaryBtn} onClick={submit}>{term ? "直す" : "作る"}</button>
        <button type="button" style={smallBtn} onClick={onDone}>やめる</button>
      </div>
    </div>
  );
}

// 時限を作る / 直す: 名前 + 時刻
function PeriodEditor({ data, onSave, period = null, onDone }) {
  const toasts = useToasts();
  const [name, setName] = useState(period?.name || "");
  const [time, setTime] = useState(period?.time || "");
  const [error, setError] = useState(null);
  const submit = () => {
    const r = upsertPeriod(data, { id: period?.id ?? null, name, time });
    if (r.error) {
      setError(r.error);
      return;
    }
    onSave((prev) => upsertPeriod(prev, { id: period?.id ?? null, name, time }).data || prev);
    toasts.success(period ? `時限「${name.trim()}」を直しました` : `時限「${name.trim()}」を作りました`);
    onDone();
  };
  return (
    <div className="no-print" style={{ ...box, borderColor: ACCENT }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={S.formLabel}>時限の名前</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 予備校３限" style={{ ...S.input, width: 160 }} aria-label="時限の名前" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={S.formLabel}>時刻</span>
          <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="例: 12:25-13:35" style={{ ...S.input, width: 140 }} aria-label="時限の時刻" />
        </label>
        <button type="button" style={primaryBtn} onClick={submit}>{period ? "直す" : "作る"}</button>
        <button type="button" style={smallBtn} onClick={onDone}>やめる</button>
      </div>
      {error && <div role="alert" style={{ color: "#c03030", fontSize: 12, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

// 担当を足す: 期・時限・学年・講座名・講師 (「・」で何人でも)・メモ
function LessonForm({ data, onSave, onDone, teacherNames }) {
  const toasts = useToasts();
  const [termId, setTermId] = useState(data.terms[0]?.id ?? "");
  const [periodId, setPeriodId] = useState(data.periods[0]?.id ?? "");
  const [grade, setGrade] = useState("");
  const [course, setCourse] = useState("");
  const [teachers, setTeachers] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState(null);
  if (data.terms.length === 0 || data.periods.length === 0) {
    return (
      <div className="no-print" style={{ ...box, borderColor: ACCENT, fontSize: 13 }}>
        先に期と時限を作ってください (「📋 表でまとめて登録」なら期・時限もいっしょに作れます)。
      </div>
    );
  }
  const submit = () => {
    const names = teachers.normalize("NFKC").split(/[・·･、,/]/).map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) return setError("講師を入れてください");
    if (!course.trim()) return setError("講座名を入れてください");
    const drafts = names.map((teacher) => ({ teacher, termId: Number(termId), periodId: Number(periodId), grade, course, memo }));
    const r = addSeniorLessons(data, drafts);
    if (r.added.length === 0) return setError("同じ担当がもうあります");
    onSave((prev) => addSeniorLessons(prev, drafts).data);
    toasts.success(`担当を ${r.added.length} 件足しました (${names.join("・")}: ${course.trim()})${r.skipped ? ` 登録済み ${r.skipped} 件は飛ばしました` : ""}`);
    setTeachers("");
    setError(null);
  };
  return (
    <div className="no-print" style={{ ...box, borderColor: ACCENT }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={S.formLabel}>期</span>
          <select value={termId} onChange={(e) => setTermId(e.target.value)} style={{ ...S.input, width: "auto" }} aria-label="担当の期">
            {data.terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={S.formLabel}>時限</span>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={{ ...S.input, width: "auto" }} aria-label="担当の時限">
            {data.periods.map((p) => <option key={p.id} value={p.id}>{p.name} {p.time ? formatOffsiteTime(p.time) : ""}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={S.formLabel}>学年</span>
          <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="高3 / 予備校" list="senior-koshu-grades" style={{ ...S.input, width: 100 }} aria-label="担当の学年" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={S.formLabel}>講座名</span>
          <input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="共通テスト英語" style={{ ...S.input, width: 220 }} aria-label="担当の講座名" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={S.formLabel}>講師 (「・」で何人でも)</span>
          <input value={teachers} onChange={(e) => setTeachers(e.target.value)} placeholder="伊藤・藤本" list="senior-koshu-teachers" style={{ ...S.input, width: 160 }} aria-label="担当の講師" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={S.formLabel}>メモ</span>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} style={{ ...S.input, width: 140 }} aria-label="担当のメモ" />
        </label>
        <button type="button" style={primaryBtn} onClick={submit}>足す</button>
        <button type="button" style={smallBtn} onClick={onDone}>閉じる</button>
      </div>
      <datalist id="senior-koshu-grades">
        {["高1", "高2", "高3", "高1・2", "予備校"].map((g) => <option key={g} value={g} />)}
      </datalist>
      <datalist id="senior-koshu-teachers">
        {teacherNames.map((n) => <option key={n} value={n} />)}
      </datalist>
      {error && <div role="alert" style={{ color: "#c03030", fontSize: 12, marginTop: 6 }}>{error}</div>}
      <div style={{ ...hint, marginTop: 6 }}>担当しない日 (2 科目を 2 日ずつなど) は、足した後に一覧の 📅 で外します。</div>
    </div>
  );
}

// 担当の一覧の行で直す (学年・講座名・講師・メモ)
function LessonEditCells({ lesson, onSave, onDone }) {
  const [grade, setGrade] = useState(lesson.grade || "");
  const [course, setCourse] = useState(lesson.course || "");
  const [teacher, setTeacher] = useState(lesson.teacher);
  const [memo, setMemo] = useState(lesson.memo || "");
  const save = () => {
    if (!teacher.trim() || !course.trim()) return;
    onSave((prev) => updateSeniorLesson(prev, lesson.id, { grade, course, teacher, memo }));
    onDone();
  };
  const inp = { ...S.input, padding: "3px 6px", fontSize: 12 };
  return (
    <>
      <td style={td}><input value={grade} onChange={(e) => setGrade(e.target.value)} style={{ ...inp, width: 70 }} aria-label="学年" /></td>
      <td style={td}><input value={course} onChange={(e) => setCourse(e.target.value)} style={{ ...inp, width: 200 }} aria-label="講座名" /></td>
      <td style={td}><input value={teacher} onChange={(e) => setTeacher(e.target.value)} style={{ ...inp, width: 90 }} aria-label="講師" /></td>
      <td style={td} colSpan={1}>
        <input value={memo} onChange={(e) => setMemo(e.target.value)} style={{ ...inp, width: 100 }} aria-label="メモ" />
      </td>
      <td style={{ ...td, whiteSpace: "nowrap" }} className="no-print">
        <button type="button" style={smallBtn} onClick={save}>保存</button>{" "}
        <button type="button" style={smallBtn} onClick={onDone}>やめる</button>
      </td>
    </>
  );
}

// 📋 表でまとめて登録
function ImportPanel({ data, onSave, today, onDone, knownTeachers }) {
  const toasts = useToasts();
  const [text, setText] = useState("");
  const [fiscalYear, setFiscalYear] = useState(() => fiscalYearOf(today));
  const parsed = useMemo(
    () => (text.trim() ? parseSeniorKoshuImport(text, { data, fiscalYear: Number(fiscalYear) }) : null),
    [text, data, fiscalYear]
  );
  const preview = useMemo(() => (parsed ? applySeniorKoshuImport(data, parsed) : null), [parsed, data]);
  const unknown = parsed ? [...new Set(parsed.drafts.map((d) => d.teacher))].filter((n) => !knownTeachers.has(n)) : [];
  const submit = () => {
    if (!parsed || !preview || (preview.added.length === 0 && preview.createdTerms === 0 && preview.createdPeriods === 0)) return;
    onSave((prev) => applySeniorKoshuImport(prev, parsed).data);
    toasts.success(
      `担当 ${preview.added.length} 件を登録しました` +
      (preview.createdTerms || preview.createdPeriods ? ` (期 ${preview.createdTerms}・時限 ${preview.createdPeriods} を作りました)` : "") +
      (preview.skipped ? ` 登録済み ${preview.skipped} 件は飛ばしました` : "")
    );
    setText("");
    onDone();
  };
  return (
    <div className="no-print" style={{ ...box, borderColor: ACCENT }}>
      <div style={{ fontSize: 13, marginBottom: 6 }}>
        1 行目は見出し: <code>講師 期 時限 学年 講座名 外す日 メモ 日付 時刻</code> (タブ区切り。Excel・スプレッドシートからそのまま貼れます。カンマ区切りでも可。列の順は自由)。
        講師は「・」で何人でも。期・時限は名前で今あるものに合わせ、無ければ「日付」(例: 12/24〜12/27) と「時刻」(例: 12:25-13:35) の列から作ります。
        外す日はその講師が担当しない日です。
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12 }}>
          年度 (月日だけの日付の年){" "}
          <input type="number" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} style={{ ...S.input, width: 90, padding: "3px 6px" }} aria-label="年度" />
        </label>
        <button type="button" style={smallBtn} onClick={() => setText(SENIOR_KOSHU_TEMPLATE)}>見本を入れる</button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="高校・予備校の講習の表"
        placeholder={SENIOR_KOSHU_TEMPLATE}
        style={{ ...S.input, height: 140, fontFamily: "monospace", fontSize: 12 }}
      />
      {parsed && preview && (
        <div role="status" style={{ fontSize: 12, marginTop: 6 }}>
          <div>
            担当 <b>{preview.added.length} 件</b>を登録します
            {preview.skipped > 0 && ` (登録済み ${preview.skipped} 件は飛ばします)`}
            {parsed.newTerms.length > 0 && ` / 新しい期: ${parsed.newTerms.map((t) => `${t.name} (${formatTermDates(t.dates)})`).join("、")}`}
            {parsed.newPeriods.length > 0 && ` / 新しい時限: ${parsed.newPeriods.map((p) => `${p.name} ${formatOffsiteTime(p.time)}`).join("、")}`}
          </div>
          {unknown.length > 0 && (
            <div style={{ color: "#9a5b00" }}>時間割・講師管理に出てこない講師: {unknown.join("・")} (そのまま登録します。打ち間違いがないか確かめてください)</div>
          )}
          {parsed.errors.length > 0 && (
            <ul style={{ color: "#c03030", margin: "4px 0", paddingLeft: 18 }}>
              {parsed.errors.slice(0, 8).map((e, i) => <li key={i}>{e.line} 行目: {e.message}</li>)}
              {parsed.errors.length > 8 && <li>他 {parsed.errors.length - 8} 行</li>}
            </ul>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button
          type="button"
          style={primaryBtn}
          onClick={submit}
          disabled={!preview || (preview.added.length === 0 && preview.createdTerms === 0 && preview.createdPeriods === 0)}
        >登録する{preview && preview.added.length > 0 ? ` (${preview.added.length} 件)` : ""}</button>
        <button type="button" style={smallBtn} onClick={onDone}>閉じる</button>
      </div>
    </div>
  );
}
