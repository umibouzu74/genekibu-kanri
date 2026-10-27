import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Modal } from "./Modal";
import { S } from "../styles/common";
import { useToday } from "../hooks/useToday";
import { useToasts } from "../hooks/useToasts";
import { fmtMDWeekday, isValidDateStr } from "../utils/dateHelpers";
import { countDayAttendance } from "../utils/partTimeAttendance";
import { computeTeachingMinutes } from "../utils/teachingMinutes";
import { makeEventHelpers } from "./views/dashboardHelpers";
import {
  CARD_MISSING,
  CARD_MISSING_CHOICES,
  describeCardForget,
  findCardForget,
  formatRecordedAt,
  missesIn,
  missesOut,
  normalizeClockTime,
  removeCardForget,
  restoreCardForget,
  setCardForget,
} from "../utils/cardForgets";

// ─── 💳 バイトのカード忘れを記録するダイアログ ─────────────────────
// 出退勤のカードを通し忘れた日を、責任者 (管理者) がその場で残す
// (utils/cardForgets)。経理はバイト出勤表 (画面・印刷・Excel) と講師の月間で見る。
// サイドバーの「💳 カード忘れの記録」・メインメニュー・Cmd+K・講師の月間の 💳・
// バイト出勤表のセルから開く (どれも App の openCardForget)。
//
// - 人はバイト一覧から押して選ぶ。その日に授業がある人を先に (時間帯つき) 並べる
//   (時間割から決まる並びで、使用頻度・履歴ではない)
// - 同じ人・同じ日に記録があれば読み込んで直す / 消す (1 人 × 1 日で 1 件)
// - 時刻は任意 (わかる範囲で)。打刻できなかった側だけ入れる
// - 保存・消すは 6 秒の「元に戻す」(戻すのはその人・その日だけ)
// - その日の授業は授業時間の集計 (バイト出勤表) と同じ computeTeachingMinutes で拾う
//   (代行・振替・休講を反映した後)。App は授業のデータを lessonData で渡すだけ
//   (このダイアログは遅延読み込みなので、集計のモジュールを本体に持ち込まない)

const MUTED = "#666";
const ACCENT = "#b45309"; // 白地でコントラスト 4.5:1 以上

/** その日の授業の時間帯 ("17:00〜20:30・14:00〜15:20")。授業が無ければ "" */
function lessonText(entries) {
  if (!entries || entries.length === 0) return "";
  const { blocks } = countDayAttendance(entries);
  return blocks.length > 0 ? blocks.map((b) => `${b.start}〜${b.end}`).join("・") : "時刻なし";
}

const emptyDraft = () => ({ missing: CARD_MISSING.BOTH, inTime: "", outTime: "", memo: "" });
const draftOf = (rec) =>
  rec
    ? { missing: rec.missing, inTime: rec.inTime || "", outTime: rec.outTime || "", memo: rec.memo || "" }
    : emptyDraft();

/**
 * その日に実際に教えた授業 (講師名 → 授業)。授業時間の集計と同じ拾い方
 * @param {object} lessonData computeTeachingMinutes の引数 (期間と isOffForGrade 以外)
 * @param {string} date
 * @returns {Map<string, object[]>}
 */
function lessonsOnDate(lessonData, date) {
  const { holidays = [], examPeriods = [], specialEvents = [] } = lessonData || {};
  const { isOffForGrade } = makeEventHelpers(holidays, examPeriods, specialEvents);
  const { rows } = computeTeachingMinutes({ ...lessonData, isOffForGrade, startDate: date, endDate: date });
  return new Map([...rows].map(([name, row]) => [name, row.entries]));
}

/**
 * @param {{
 *   records: object[],
 *   onSave: (next: object[] | ((prev: object[]) => object[])) => void,
 *   staffNames: string[],
 *   initial?: {name?: string, date?: string},
 *   lessonData?: object,
 *   onClose: () => void,
 * }} props
 *   staffNames … バイトの名前 (よみ順に並べて渡す)
 *   lessonData … その日の授業を拾うためのデータ (lessonsOnDate)。無ければ授業を出さない
 */
export function CardForgetDialog({ records = [], onSave, staffNames = [], initial = {}, lessonData, onClose }) {
  const baseId = useId();
  const today = useToday();
  const toasts = useToasts();
  const [date, setDate] = useState(() => (isValidDateStr(initial.date || "") ? initial.date : today));
  const [name, setName] = useState(initial.name || "");
  const [draft, setDraft] = useState(() =>
    draftOf(initial.name ? findCardForget(records, initial.name, initial.date || today) : null)
  );
  const [errors, setErrors] = useState({});
  const saveRef = useRef(null);

  const existing = useMemo(
    () => (name && isValidDateStr(date) ? findCardForget(records, name, date) : null),
    [records, name, date]
  );
  // 人・日を選び直したら、その (人, 日) の記録を読み込む。記録が無ければ、
  // 入れかけの内容はそのまま (日付を直しただけで時刻を打ち直させない)。
  // 読み込んでいた記録から離れるときだけ空に戻す
  const load = (nextName, nextDate) => {
    const next = nextName && isValidDateStr(nextDate) ? findCardForget(records, nextName, nextDate) : null;
    setName(nextName);
    setDate(nextDate);
    if (next) setDraft(draftOf(next));
    else if (existing) setDraft(emptyDraft());
    setErrors((e) => ({ ...e, name: undefined, date: undefined }));
  };

  // 人が決まっていれば、開いたらすぐ保存を押せるように (Modal の focus trap が
  // 先に ✕ へ入れるので、親であるここで入れ直す)
  useEffect(() => {
    if (initial.name) saveRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 開いたときだけ
  }, []);

  const lessons = useMemo(
    () => (lessonData && isValidDateStr(date) ? lessonsOnDate(lessonData, date) : null),
    [lessonData, date]
  );
  // その日に授業がある人 / その他 (どちらも渡された並び = よみ順のまま)
  const groups = useMemo(() => {
    const names = [...staffNames];
    // バイト一覧にいない人の記録を直すときも、その人を選べるように
    if (name && !names.includes(name)) names.push(name);
    if (!lessons) return [{ key: "all", label: null, names }];
    const working = names.filter((n) => (lessons.get(n) || []).length > 0);
    const others = names.filter((n) => !working.includes(n));
    return [
      { key: "working", label: "この日に授業がある人", names: working },
      { key: "others", label: working.length > 0 ? "その他のバイト" : "バイト", names: others },
    ].filter((g) => g.names.length > 0);
  }, [staffNames, name, lessons]);

  const isFuture = isValidDateStr(date) && date > today;
  const selectedLessons = name ? lessonText(lessons?.get(name)) : "";

  const normalizeField = (key) => {
    const r = normalizeClockTime(draft[key]);
    if (r.ok) {
      setDraft((d) => ({ ...d, [key]: r.time }));
      setErrors((e) => ({ ...e, [key]: undefined }));
    } else {
      setErrors((e) => ({ ...e, [key]: r.error }));
    }
    return r;
  };

  const label = (n, d) => `${n} ${fmtMDWeekday(d)}`;

  const submit = (e) => {
    e?.preventDefault();
    const nextErrors = {};
    if (!isValidDateStr(date)) nextErrors.date = "日付を入れてください";
    else if (isFuture) nextErrors.date = "今日より先の日には記録できません";
    if (!name) nextErrors.name = "バイトを選んでください";
    const inTime = missesIn(draft.missing) ? normalizeClockTime(draft.inTime) : { ok: true, time: "" };
    const outTime = missesOut(draft.missing) ? normalizeClockTime(draft.outTime) : { ok: true, time: "" };
    if (!inTime.ok) nextErrors.inTime = inTime.error;
    if (!outTime.ok) nextErrors.outTime = outTime.error;
    if (inTime.time && outTime.time && outTime.time <= inTime.time) {
      nextErrors.outTime = "退勤は出勤より後の時刻にしてください";
    }
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    const previous = existing;
    onSave((prev) =>
      setCardForget(prev, {
        name,
        date,
        missing: draft.missing,
        inTime: inTime.time,
        outTime: outTime.time,
        memo: draft.memo,
      })
    );
    toasts.push(`${label(name, date)} のカード忘れを${previous ? "直しました" : "記録しました"}`, {
      tone: "success",
      duration: 6000,
      action: {
        label: "元に戻す",
        onClick: () => onSave((cur) => restoreCardForget(cur, name, date, previous)),
      },
    });
    onClose();
  };

  const remove = () => {
    if (!existing) return;
    const previous = existing;
    onSave((prev) => removeCardForget(prev, name, date));
    toasts.push(`${label(name, date)} のカード忘れの記録を消しました`, {
      tone: "info",
      duration: 6000,
      action: {
        label: "元に戻す",
        onClick: () => onSave((cur) => restoreCardForget(cur, name, date, previous)),
      },
    });
    onClose();
  };

  // 最近の記録 (日付の新しい順に 8 件)。押すとその記録を読み込む
  const recent = useMemo(
    () => [...records].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)).slice(0, 8),
    [records]
  );

  const fieldLabel = { ...S.formLabel, color: "#444", marginTop: 12 };
  const errorText = (msg, id) =>
    msg ? (
      <div id={id} role="alert" style={{ fontSize: 12, color: "#b42318", marginTop: 4 }}>
        {msg}
      </div>
    ) : null;
  const pill = (on) => ({
    ...S.btn(on),
    padding: "6px 12px",
    border: on ? "none" : "1px solid #ccc",
    fontWeight: on ? 800 : 600,
  });
  const timeInput = (key, text) => {
    const id = `${baseId}-${key}`;
    return (
      <div style={{ flex: "1 1 140px", minWidth: 0 }}>
        <label htmlFor={id} style={{ ...S.formLabel, color: "#444" }}>
          {text}
        </label>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="例: 16:50"
          value={draft[key]}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
          onBlur={() => normalizeField(key)}
          aria-invalid={errors[key] ? true : undefined}
          aria-describedby={errors[key] ? `${id}-err` : undefined}
          style={{ ...S.input, padding: "6px 8px" }}
        />
        {errorText(errors[key], `${id}-err`)}
      </div>
    );
  };

  return (
    <Modal title="💳 カード忘れの記録" onClose={onClose} width="min(560px, 100%)">
      <form onSubmit={submit}>
        <p style={{ fontSize: 12, color: MUTED, margin: "0 0 4px", lineHeight: 1.6 }}>
          出退勤のカードを通し忘れた日を残します。バイト出勤表 (画面・印刷・Excel) と講師の月間に印が付き、
          経理が給与の締めでカードの記録と突き合わせられます。出勤日数は変わりません (授業から数えます)。
        </p>

        <label htmlFor={`${baseId}-date`} style={fieldLabel}>
          日付
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            id={`${baseId}-date`}
            type="date"
            value={date}
            max={today}
            onChange={(e) => load(name, e.target.value)}
            aria-invalid={errors.date ? true : undefined}
            style={{ ...S.input, width: "auto", padding: "6px 8px" }}
          />
          {isValidDateStr(date) && <span style={{ fontSize: 13, color: "#444" }}>{fmtMDWeekday(date)}</span>}
          {date !== today && (
            <button type="button" onClick={() => load(name, today)} style={{ ...pill(false), fontSize: 12 }}>
              今日
            </button>
          )}
        </div>
        {errorText(errors.date || (isFuture ? "今日より先の日には記録できません" : ""), `${baseId}-date-err`)}

        <div style={fieldLabel} id={`${baseId}-name-label`}>
          バイト
        </div>
        {groups.length === 0 ? (
          <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>
            バイトが登録されていません (講師管理 → バイト一覧で登録すると選べます)
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.key} style={{ marginBottom: 6 }}>
              {g.label && <div style={{ fontSize: 11, color: MUTED, margin: "2px 0 4px" }}>{g.label}</div>}
              <div role="group" aria-labelledby={`${baseId}-name-label`} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {g.names.map((n) => {
                  const on = n === name;
                  const time = lessons ? lessonText(lessons.get(n)) : "";
                  const has = isValidDateStr(date) && findCardForget(records, n, date);
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={on}
                      onClick={() => load(n, date)}
                      title={has ? `${n}: ${describeCardForget(has)}` : undefined}
                      style={{ ...pill(on), display: "inline-flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.3 }}
                    >
                      <span>
                        {n}
                        {has && <span aria-label="(記録あり)"> 💳</span>}
                      </span>
                      {time && <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>{time}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
        {errorText(errors.name)}

        {existing && (
          <div
            role="note"
            style={{
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              color: "#7c2d12",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 12,
              marginTop: 8,
            }}
          >
            この日の記録があります
            {existing.recordedAt ? ` (${formatRecordedAt(existing.recordedAt)} 記録)` : ""}。直して保存するか、消せます。
          </div>
        )}

        <div style={fieldLabel} id={`${baseId}-missing-label`}>
          打刻できなかったもの
        </div>
        <div role="group" aria-labelledby={`${baseId}-missing-label`} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CARD_MISSING_CHOICES.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={draft.missing === c.key}
              onClick={() => setDraft((d) => ({ ...d, missing: c.key }))}
              style={pill(draft.missing === c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div style={{ ...fieldLabel, fontWeight: 400, color: MUTED }}>
          実際の時刻 (わかる範囲で。空欄でも記録できます)
          {selectedLessons && (
            <span style={{ display: "block", color: ACCENT }}>
              {name} のこの日の授業: {selectedLessons}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {missesIn(draft.missing) && timeInput("inTime", "出勤")}
          {missesOut(draft.missing) && timeInput("outTime", "退勤")}
        </div>

        <label htmlFor={`${baseId}-memo`} style={fieldLabel}>
          メモ (任意)
        </label>
        <input
          id={`${baseId}-memo`}
          type="text"
          value={draft.memo}
          onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))}
          placeholder="例: 責任者が出勤を確認"
          style={{ ...S.input, padding: "6px 8px" }}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
          {existing && (
            <button
              type="button"
              onClick={remove}
              style={{ ...S.btn(false), background: "#fdecec", color: "#b42318" }}
            >
              この記録を消す
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={S.btn(false)}>
            キャンセル
          </button>
          <button ref={saveRef} type="submit" style={S.btn(true)}>
            {existing ? "直して保存" : "記録する"}
          </button>
        </div>
      </form>

      {recent.length > 0 && (
        <details style={{ marginTop: 16, fontSize: 12 }}>
          <summary style={{ cursor: "pointer", color: "#444" }}>最近の記録 (日付の新しい順)</summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.8 }}>
            {recent.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="inline-activate"
                  onClick={() => load(r.name, r.date)}
                  style={{
                    border: "none",
                    background: "none",
                    padding: 0,
                    font: "inherit",
                    color: "#2e6a9e",
                    cursor: "pointer",
                    textDecoration: "underline",
                    textAlign: "left",
                  }}
                >
                  {fmtMDWeekday(r.date)} {r.name}
                </button>
                <span style={{ color: MUTED }}> — {describeCardForget(r)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Modal>
  );
}
