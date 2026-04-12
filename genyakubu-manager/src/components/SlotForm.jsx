import { useId, useState } from "react";
import { DAYS } from "../data";
import { S } from "../styles/common";

export function SlotForm({ slot, onSave, onCancel, suggestions, timetables, activeTimetableId }) {
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
      timetableId: activeTimetableId || 1,
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
    onSave(f);
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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label
                htmlFor={inputId}
                style={{
                  width: 70,
                  fontSize: 12,
                  fontWeight: 700,
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {l}
                {req && (
                  <span style={{ color: "#c44" }} aria-label="必須">
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
                  style={{ ...S.input, borderColor: errors[k] ? "#c44" : "#ccc" }}
                />
              )}
            </div>
            {errors[k] && (
              <div
                id={errorId}
                role="alert"
                style={{ marginLeft: 78, fontSize: 10, color: "#c44", marginTop: 2 }}
              >
                {errors[k]}
              </div>
            )}
          </div>
        );
      })}
      {timetables && timetables.length > 1 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label
              style={{
                width: 70,
                fontSize: 12,
                fontWeight: 700,
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              時間割
            </label>
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
