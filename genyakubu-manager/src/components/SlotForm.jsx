import { useId, useState } from "react";
import { DAYS } from "../data";
import { S } from "../styles/common";
import { isBiweekly } from "../utils/biweekly";

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
      {isBiweekly(f.note) && (
        <BiweeklyAnchorSection
          anchors={f.biweeklyAnchors}
          onChange={(anchors) => up("biweeklyAnchors", anchors)}
        />
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
