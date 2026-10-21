import { useId, useState } from "react";
import { splitTeacherField } from "../utils/biweekly";
import { DAYS } from "../data";
import { S } from "../styles/common";
import { colors } from "../styles/tokens";
import { isBiweekly } from "../utils/biweekly";
import { dateToDay, fmtDateWeekday } from "../utils/dateHelpers";
import { normalizeSlotCountFields } from "../utils/slotDates";
import { FieldError } from "./FieldError";
import { MultiDateCalendar } from "./MultiDateCalendar";


// defaultTimetableId: 新しく作るコマの時間割の既定 (今の時間割。コースマスター
// 管理で時間割を選んでいればその時間割)
export function SlotForm({ slot, onSave, onCancel, suggestions, timetables, defaultTimetableId }) {
  const formId = useId();
  const [f, setF] = useState(
    slot || {
      day: "月",
      time: "19:00-20:20",
      grade: "",
      cls: "",
      room: "",
      subj: "",
      teacher: "",
      note: "",
      timetableId: defaultTimetableId || 1,
    }
  );
  const [errors, setErrors] = useState({});
  const up = (k, v) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const required = ["time", "grade", "subj", "teacher"];
  // datalist の id (フィールドごと)。suggestions が無いキーは undefined → list 属性なし。
  const listIds = {
    time: suggestions?.times?.length ? `${formId}-times` : undefined,
    grade: suggestions?.grades?.length ? `${formId}-grades` : undefined,
    room: suggestions?.rooms?.length ? `${formId}-rooms` : undefined,
    subj: suggestions?.subjs?.length ? `${formId}-subjs` : undefined,
    teacher: suggestions?.teachers?.length ? `${formId}-teachers` : undefined,
  };
  const fields = [
    { k: "day", l: "曜日", type: "select", opts: DAYS },
    { k: "time", l: "時間帯", ph: "19:00-20:20", req: true },
    { k: "grade", l: "学年", ph: "中1, 高3 等", req: true },
    { k: "cls", l: "クラス", ph: "S, AB 等" },
    { k: "room", l: "教室", ph: "601, 亀21 等" },
    { k: "subj", l: "科目", ph: "英語, 高松一 数学 等", req: true },
    { k: "teacher", l: "担当講師", ph: "講師名", req: true },
    { k: "note", l: "備考", ph: "隔週, 合同 等" },
  ];
  const handleSave = () => {
    const errs = {};
    required.forEach((k) => {
      if (!f[k]?.trim()) errs[k] = "必須項目です";
    });
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    // 複数講師の区切りを正史の "·" に正規化して保存する (H1f と同じ理由:
    // IME の素の入力は "・" になりがちで、"·" 前提の消費側と食い違う)。
    onSave(normalizeSlotCountFields({ ...f, teacher: splitTeacherField(f.teacher).join("·") }));
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* 候補リスト (datalist) - 表示はされない */}
      {listIds.time && (
        <datalist id={listIds.time}>
          {suggestions.times.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      )}
      {listIds.grade && (
        <datalist id={listIds.grade}>
          {suggestions.grades.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      )}
      {listIds.room && (
        <datalist id={listIds.room}>
          {suggestions.rooms.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      )}
      {listIds.subj && (
        <datalist id={listIds.subj}>
          {suggestions.subjs.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      )}
      {listIds.teacher && (
        <datalist id={listIds.teacher}>
          {suggestions.teachers.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      )}
      {fields.map(({ k, l, ph, type, opts, req }) => {
        const inputId = `${formId}-${k}`;
        const errorId = `${inputId}-err`;
        return (
          <div key={k}>
            <div className="slot-form-row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label htmlFor={inputId} style={S.formLabelInline}>
                {l}
                {req && (
                  <span style={{ color: colors.danger }} aria-label="必須">
                    *
                  </span>
                )}
              </label>
              {type === "select" ? (
                <select
                  id={inputId}
                  value={f[k]}
                  onChange={(e) => up(k, e.target.value)}
                  style={{ ...S.input, width: "auto", minWidth: 80 }}
                >
                  {opts.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={inputId}
                  value={f[k] || ""}
                  onChange={(e) => up(k, e.target.value)}
                  placeholder={ph}
                  required={req}
                  list={listIds[k]}
                  aria-invalid={errors[k] ? "true" : undefined}
                  aria-describedby={errors[k] ? errorId : undefined}
                  style={{ ...S.input, borderColor: errors[k] ? colors.danger : "#ccc" }}
                />
              )}
            </div>
            <FieldError
              id={errorId}
              className="slot-form-row-error"
              style={{ marginLeft: 78 }}
            >
              {errors[k]}
            </FieldError>
          </div>
        );
      })}
      {timetables && timetables.length > 1 && (
        <div>
          <div className="slot-form-row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={S.formLabelInline}>時間割</label>
            <select
              value={f.timetableId ?? 1}
              onChange={(e) => up("timetableId", Number(e.target.value))}
              style={{ ...S.input, width: "auto", minWidth: 150 }}
            >
              {timetables.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {isBiweekly(f.note) && (
        <BiweeklyAnchorSection
          anchors={f.biweeklyAnchors}
          onChange={(anchors) => up("biweeklyAnchors", anchors)}
        />
      )}
      <CountAndDatesSection f={f} up={up} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
        <button onClick={onCancel} style={S.btn(false)}>
          キャンセル
        </button>
        <button onClick={handleSave} style={S.btn(true)}>
          保存
        </button>
      </div>
    </div>
  );
}

function BiweeklyAnchorSection({ anchors, onChange }) {
  const hasCustom = Array.isArray(anchors) && anchors.length > 0;
  const [useCustom, setUseCustom] = useState(hasCustom);
  const [newDate, setNewDate] = useState("");

  const sorted = hasCustom
    ? [...anchors].sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const toggleCustom = (checked) => {
    setUseCustom(checked);
    if (!checked) onChange(undefined);
  };

  const addAnchor = () => {
    if (!newDate) return;
    const current = Array.isArray(anchors) ? anchors : [];
    if (current.some((a) => a.date === newDate)) return;
    onChange([...current, { date: newDate, weekType: "A" }]);
    setNewDate("");
  };

  const removeAnchor = (date) => {
    const next = (anchors || []).filter((a) => a.date !== date);
    onChange(next.length > 0 ? next : undefined);
    if (next.length === 0) setUseCustom(false);
  };

  return (
    <div
      style={{
        background: "#f8f0e8",
        border: "1px solid #e0c8a0",
        borderRadius: 8,
        padding: 10,
        marginTop: 4,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#8a6a1a" }}>
        隔週の基準設定
      </div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          cursor: "pointer",
          marginBottom: 6,
        }}
      >
        <input
          type="checkbox"
          checked={useCustom}
          onChange={(e) => toggleCustom(e.target.checked)}
        />
        このコマ専用の基準日を設定する
      </label>
      {!useCustom && (
        <div style={{ fontSize: 10, color: "#888" }}>
          グローバル基準（コースマスター管理 → 隔週管理で設定）を使用します
        </div>
      )}
      {useCustom && (
        <div>
          {sorted.length > 0 && (
            <div style={{ marginBottom: 6, display: "flex", flexDirection: "column", gap: 3 }}>
              {sorted.map((a) => (
                <div
                  key={a.date}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                    background: "#fff",
                    padding: "3px 8px",
                    borderRadius: 4,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{a.date}</span>
                  <span
                    style={{
                      background: "#2e6a9e",
                      color: "#fff",
                      padding: "1px 6px",
                      borderRadius: 3,
                      fontSize: 9,
                      fontWeight: 700,
                    }}
                  >
                    A週
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAnchor(a.date)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 11,
                      color: "#c05030",
                      marginLeft: "auto",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              style={{ ...S.input, width: "auto", fontSize: 11 }}
            />
            <button
              type="button"
              onClick={addAnchor}
              disabled={!newDate}
              style={{ ...S.btn(false), fontSize: 10, opacity: newDate ? 1 : 0.5 }}
            >
              追加
            </button>
          </div>
          <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>
            このコマ専用のA週基準日を設定します。ずれが生じた場合、新しい基準日を追加してください。
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 回数・実施日 (不定期のコマ / 曜日ごとの回数 / 数え始め) ────────────
// マークテストのように「決まった日だけ実施する」「月 (本校) と土 (亀井町) で
// 同じ内容を別の回数で数える」「2 学期は⑨から」というコマ用。どれも既定は
// 従来どおりなので、使うときだけ開く。判定は utils/slotDates と
// utils/sessionCount。
function CountAndDatesSection({ f, up }) {
  const used =
    f.irregular === true ||
    f.separateWeekdayCount === true ||
    (Number(f.sessionStartNumber) || 0) > 1;
  const [open, setOpen] = useState(used);
  const dates = Array.isArray(f.onlyDates) ? [...f.onlyDates].sort() : [];
  const wrongDay = f.irregular === true ? dates.filter((d) => dateToDay(d) !== f.day) : [];
  const toggleDate = (d) => {
    up("onlyDates", dates.includes(d) ? dates.filter((x) => x !== d) : [...dates, d].sort());
  };
  return (
    <div
      style={{
        background: "#f4f7fb",
        border: "1px solid #c8d6e8",
        borderRadius: 8,
        padding: 10,
        marginTop: 4,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          color: "#2a4a7a",
        }}
      >
        {open ? "▼" : "▶"} 回数・実施日
        {!open && used && (
          <span style={{ fontWeight: 400, fontSize: 10, marginLeft: 6 }}>
            {[
              f.irregular === true && `不定期 (${dates.length} 日)`,
              f.separateWeekdayCount === true && "曜日ごとに数える",
              (Number(f.sessionStartNumber) || 0) > 1 && `第${f.sessionStartNumber}回から`,
            ]
              .filter(Boolean)
              .join(" / ")}
          </span>
        )}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <div>
            <label style={checkRow}>
              <input
                type="checkbox"
                checked={f.irregular === true}
                onChange={(e) => up("irregular", e.target.checked)}
              />
              決まった日だけ実施する (不定期のコマ)
            </label>
            {f.irregular === true && (
              <div style={{ marginLeft: 22, marginTop: 6 }}>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 6, lineHeight: 1.5 }}>
                  実施日を押して選びます ({f.day}曜のみ)。選んでいない日は時間割にも出ず、
                  回数も進みません (休講日の登録は要りません)。
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <MultiDateCalendar
                    selected={dates}
                    onToggle={toggleDate}
                    allowedWeekday={f.day}
                    label="実施日を選ぶカレンダー"
                  />
                  <div style={{ fontSize: 11, maxWidth: 220 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>実施日: {dates.length} 日</div>
                    {dates.length === 0 && (
                      <div role="status" style={{ color: colors.danger }}>
                        実施日が無いと、このコマはどの日にも出ません
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 150, overflowY: "auto" }}>
                      {dates.map((d) => (
                        <span key={d} style={{ color: dateToDay(d) === f.day ? "#333" : colors.danger }}>
                          {fmtDateWeekday(d)}
                        </span>
                      ))}
                    </div>
                    {wrongDay.length > 0 && (
                      <div role="status" style={{ color: colors.danger, marginTop: 4 }}>
                        曜日の違う日 {wrongDay.length} 日は保存時に外します
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          <label style={checkRow}>
            <input
              type="checkbox"
              checked={f.separateWeekdayCount === true}
              onChange={(e) => up("separateWeekdayCount", e.target.checked)}
            />
            <span>
              この曜日のコマだけで回数を数える
              <span style={{ display: "block", fontSize: 10, color: "#888" }}>
                月 (本校) と土 (亀井町) のように、会場違いで同じ内容のコマをそれぞれの番号で数えるとき
              </span>
            </span>
          </label>
          <label style={{ ...checkRow, alignItems: "center" }}>
            数え始め: 第
            <input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={f.sessionStartNumber ?? ""}
              onChange={(e) =>
                up("sessionStartNumber", e.target.value === "" ? undefined : Number(e.target.value))
              }
              aria-label="数え始めの回"
              style={{ ...S.input, width: 64, fontSize: 12 }}
            />
            回から (空欄 = 第1回)
          </label>
          <div style={{ fontSize: 10, color: "#888", marginTop: -4, marginLeft: 22 }}>
            その期 (時間割の開始日) の最初の回の番号。2 学期は⑨から、のように前の期から続けて数えるとき
          </div>
        </div>
      )}
    </div>
  );
}

const checkRow = {
  display: "flex",
  alignItems: "flex-start",
  gap: 6,
  fontSize: 12,
  cursor: "pointer",
  lineHeight: 1.5,
};
