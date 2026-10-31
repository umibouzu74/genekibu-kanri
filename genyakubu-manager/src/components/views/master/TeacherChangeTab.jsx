import { useMemo, useState } from "react";
import { DAYS, sortSlots as sortS } from "../../../data";
import { S } from "../../../styles/common";
import { useToasts } from "../../../hooks/useToasts";
import { slotTeacherNamesEver } from "../../../utils/biweekly";
import { firstSubjToken } from "../../../utils/cohorts";
import { sortTeacherNames } from "../../../utils/teacherKana";
import {
  applyTeacherChange,
  candidateSlotsForChange,
  describeTeacherChange,
  findRecordsAfterChange,
  listTeacherChanges,
  removeTeacherChange,
  restoreTeacherChanges,
} from "../../../utils/teacherChangePlan";

// ─── 担当変更タブ (コースマスター管理、A5 2026-10-31) ─────────────────
// 学期の途中から担当が変わるコマに、開始日つきの担当の切り替え
// (slot.teacherChanges) をまとめて付ける。コマの講師欄を書き換えると開始日より
// 前の過去分 (月間・授業時間の集計・バイト出勤表) まで新しい担当になり、毎週の
// 代行を立てると残りの全部の日に代行が並ぶので、そのどちらでもない手段。
// 第N回・隔週の週送りは変わらない (担当が変わっても同じ授業として数える)。
// 付ける / 取り消すは cascade の無い操作なので 6 秒の「元に戻す」。

const label = { fontSize: 10, fontWeight: 700, display: "block", marginBottom: 2 };
const box = {
  background: "#fff",
  padding: 12,
  borderRadius: 8,
  border: "1px solid #e0e0e0",
  marginBottom: 12,
};

export function TeacherChangeTab({
  slots,
  timetables,
  subs = [],
  saveSubs,
  adjustments = [],
  saveSlots,
  isAdmin,
  teacherKana = {},
  partTimeStaff = [],
  defaultTimetableId = null,
}) {
  const toasts = useToasts();
  const [oldTeacher, setOldTeacher] = useState("");
  const [newTeacher, setNewTeacher] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [memo, setMemo] = useState("");
  const [timetableId, setTimetableId] = useState(defaultTimetableId);
  const [grade, setGrade] = useState("");
  const [day, setDay] = useState("");
  const [subj, setSubj] = useState("");
  const [school, setSchool] = useState("");
  // 外したコマ (既定は候補を全部付ける)
  const [unchecked, setUnchecked] = useState(() => new Set());

  const teacherNames = useMemo(() => {
    const set = new Set();
    for (const s of slots || []) for (const t of slotTeacherNamesEver(s)) set.add(t);
    for (const p of partTimeStaff || []) if (p?.name) set.add(p.name);
    return sortTeacherNames([...set], teacherKana);
  }, [slots, partTimeStaff, teacherKana]);
  const grades = useMemo(() => [...new Set((slots || []).map((s) => s.grade))].sort(), [slots]);
  // 学校名 = 科目名の頭の語 (空白の無い科目名は学校なし。utils/cohorts)
  const schools = useMemo(() => {
    const set = new Set();
    for (const s of slots || []) {
      if (/\s/.test((s.subj || "").trim())) set.add(firstSubjToken(s.subj));
    }
    return [...set].sort();
  }, [slots]);

  const candidates = useMemo(
    () =>
      sortS(
        candidateSlotsForChange(slots, {
          oldTeacher,
          from,
          timetableId: timetables?.length > 1 && timetableId != null ? timetableId : null,
          grade,
          day,
          subj,
          school,
        })
      ),
    [slots, oldTeacher, from, timetableId, timetables, grade, day, subj, school]
  );
  const chosenIds = candidates.filter((s) => !unchecked.has(s.id)).map((s) => s.id);
  const validUntil = !until || !from || until >= from;
  const canApply =
    isAdmin && oldTeacher.trim() && newTeacher.trim() && from && chosenIds.length > 0 && validUntil &&
    newTeacher.trim() !== oldTeacher.trim();

  const records = useMemo(
    () =>
      from && oldTeacher
        ? findRecordsAfterChange({
            subs,
            adjustments,
            slotIds: chosenIds,
            oldTeacher: oldTeacher.trim(),
            newTeacher,
            from,
            until: until || null,
          })
        : { redundantSubs: [], otherSubs: [], reschedules: [] },
    // chosenIds は毎回新しい配列なので join した値で比べる
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subs, adjustments, chosenIds.join(","), oldTeacher, newTeacher, from, until]
  );

  const registered = useMemo(() => listTeacherChanges(slots), [slots]);
  const ttName = (id) => (timetables || []).find((t) => t.id === (id ?? 1))?.name || "";

  const apply = () => {
    if (!canApply) return;
    const snapshot = (slots || [])
      .filter((s) => chosenIds.includes(s.id))
      .map((s) => ({ id: s.id, teacherChanges: s.teacherChanges }));
    const change = {
      oldTeacher: oldTeacher.trim(),
      newTeacher,
      from,
      until: until || null,
      memo,
    };
    saveSlots((prev) => applyTeacherChange(prev, chosenIds, change).slots);
    toasts.success(
      `${chosenIds.length} コマに担当の切り替え（${from} から ${oldTeacher.trim()} → ${newTeacher.trim()}）を付けました`,
      {
        duration: 6000,
        action: {
          label: "元に戻す",
          onClick: () => saveSlots((prev) => restoreTeacherChanges(prev, snapshot)),
        },
      }
    );
    setUnchecked(new Set());
  };

  const removeRedundantSubs = () => {
    if (!isAdmin || !saveSubs || records.redundantSubs.length === 0) return;
    const removed = records.redundantSubs;
    const ids = new Set(removed.map((x) => x.id));
    saveSubs((prev) => (prev || []).filter((x) => !ids.has(x.id)));
    toasts.success(`不要になった代行 ${removed.length} 件を解除しました`, {
      duration: 6000,
      action: {
        label: "元に戻す",
        onClick: () =>
          saveSubs((prev) => {
            const have = new Set((prev || []).map((x) => x.id));
            return [...(prev || []), ...removed.filter((x) => !have.has(x.id))];
          }),
      },
    });
  };

  const cancelRegistered = (item) => {
    if (!isAdmin) return;
    const snapshot = [{ id: item.slot.id, teacherChanges: item.slot.teacherChanges }];
    saveSlots((prev) => removeTeacherChange(prev, item.slot.id, item.change.from));
    toasts.success(`担当の切り替え（${describeTeacherChange(item)}）を取り消しました`, {
      duration: 6000,
      action: {
        label: "元に戻す",
        onClick: () => saveSlots((prev) => restoreTeacherChanges(prev, snapshot)),
      },
    });
  };

  return (
    <div>
      <div style={box}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>担当変更（開始日つき）</div>
        <div style={{ fontSize: 11, color: "#666", lineHeight: 1.7, marginBottom: 8 }}>
          学期の途中から担当が変わるコマに使います。開始日より前の日は今の担当のまま、開始日から
          新しい担当になります（月間・週間・ダッシュボード・授業時間の集計・バイト出勤表・代行の元講師）。
          第N回・隔週の週送りは変わりません。
        </div>
        <datalist id="teacher-change-names">
          {teacherNames.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={label} htmlFor="tc-old">旧担当</label>
            <input id="tc-old" list="teacher-change-names" value={oldTeacher}
              onChange={(e) => { setOldTeacher(e.target.value); setUnchecked(new Set()); }}
              style={{ ...S.input, width: 120 }} />
          </div>
          <div>
            <label style={label} htmlFor="tc-from">開始日</label>
            <input id="tc-from" type="date" value={from}
              onChange={(e) => { setFrom(e.target.value); setUnchecked(new Set()); }}
              style={{ ...S.input, width: "auto" }} />
          </div>
          <div>
            <label style={label} htmlFor="tc-new">新担当</label>
            <input id="tc-new" list="teacher-change-names" value={newTeacher}
              onChange={(e) => setNewTeacher(e.target.value)}
              placeholder="複数は「・」で" style={{ ...S.input, width: 140 }} />
          </div>
          <div>
            <label style={label} htmlFor="tc-until">◯日まで（任意）</label>
            <input id="tc-until" type="date" value={until} min={from || undefined}
              onChange={(e) => setUntil(e.target.value)} style={{ ...S.input, width: "auto" }} />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={label} htmlFor="tc-memo">メモ（任意）</label>
            <input id="tc-memo" value={memo} onChange={(e) => setMemo(e.target.value)}
              style={{ ...S.input }} />
          </div>
        </div>
        {!validUntil && (
          <div role="alert" style={{ color: "#c03030", fontSize: 11, marginTop: 4 }}>
            「◯日まで」は開始日より後にしてください
          </div>
        )}
        {until && validUntil && (
          <div style={{ color: "#666", fontSize: 11, marginTop: 4 }}>
            {until} の翌日から元の担当に戻ります（期間限定の変更）
          </div>
        )}
      </div>

      <div style={box}>
        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>対象のコマを絞る</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          {timetables?.length > 1 && (
            <div>
              <label style={label} htmlFor="tc-tt">時間割</label>
              <select id="tc-tt" value={timetableId == null ? "" : String(timetableId)}
                onChange={(e) => setTimetableId(e.target.value === "" ? null : Number(e.target.value))}
                style={{ ...S.input, width: "auto" }}>
                <option value="">すべて</option>
                {timetables.map((t) => (
                  <option key={t.id} value={String(t.id)}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label style={label} htmlFor="tc-grade">学年</label>
            <select id="tc-grade" value={grade} onChange={(e) => setGrade(e.target.value)}
              style={{ ...S.input, width: "auto" }}>
              <option value="">すべて</option>
              {grades.map((g) => (<option key={g} value={g}>{g}</option>))}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="tc-day">曜日</label>
            <select id="tc-day" value={day} onChange={(e) => setDay(e.target.value)}
              style={{ ...S.input, width: "auto" }}>
              <option value="">すべて</option>
              {DAYS.map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="tc-subj">科目に含む文字</label>
            <input id="tc-subj" value={subj} onChange={(e) => setSubj(e.target.value)}
              placeholder="例: 数学" style={{ ...S.input, width: 110 }} />
          </div>
          {schools.length > 0 && (
            <div>
              <label style={label} htmlFor="tc-school">学校名</label>
              <select id="tc-school" value={school} onChange={(e) => setSchool(e.target.value)}
                style={{ ...S.input, width: "auto" }}>
                <option value="">すべて</option>
                {schools.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
          )}
        </div>

        <div style={{ marginTop: 10 }}>
          {!oldTeacher.trim() || !from ? (
            <div style={{ fontSize: 12, color: "#888" }}>旧担当と開始日を入れると、対象のコマが並びます。</div>
          ) : candidates.length === 0 ? (
            <div style={{ fontSize: 12, color: "#888" }}>
              {from} の時点で {oldTeacher.trim()} が担当しているコマはありません（条件を確かめてください）。
            </div>
          ) : (
            <ul aria-label="担当変更の対象のコマ" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {candidates.map((s) => (
                <li key={s.id} style={{ fontSize: 12, padding: "2px 0" }}>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={!unchecked.has(s.id)}
                      onChange={() => {
                        const next = new Set(unchecked);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        setUnchecked(next);
                      }}
                    />
                    {s.day} {s.time} {s.grade}
                    {s.cls && s.cls !== "-" ? s.cls : ""} {s.subj}（{s.teacher}
                    {s.note ? ` / ${s.note}` : ""}）
                    {timetables?.length > 1 && (
                      <span style={{ color: "#888", fontSize: 10 }}>{ttName(s.timetableId)}</span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(records.redundantSubs.length > 0 ||
          records.otherSubs.length > 0 ||
          records.reschedules.length > 0) && (
          <div role="alert" style={{ marginTop: 10, background: "#fff8e6", border: "1px solid #ecd9a0", borderRadius: 6, padding: 8, fontSize: 11, lineHeight: 1.7 }}>
            {records.redundantSubs.length > 0 && (
              <div>
                ・開始日以降に、代行者が新担当と同じ代行が {records.redundantSubs.length} 件あります
                （{records.redundantSubs.map((x) => x.date).join("・")}）。担当変更を付けると不要になります。
                {isAdmin && saveSubs && (
                  <button type="button" onClick={removeRedundantSubs}
                    style={{ ...S.btn(false), fontSize: 11, padding: "2px 8px", marginLeft: 6 }}>
                    まとめて解除
                  </button>
                )}
              </div>
            )}
            {records.otherSubs.length > 0 && (
              <div>
                ・開始日以降に旧担当の代行・欠勤が {records.otherSubs.length} 件あります
                （{records.otherSubs.map((x) => `${x.date}${x.substitute ? ` → ${x.substitute}` : " 代行未定"}`).join("・")}）。
                担当変更の後は元講師がその日の担当でなくなるので、授業管理で確かめてください。
              </div>
            )}
            {records.reschedules.length > 0 && (
              <div>
                ・開始日以降に振替が {records.reschedules.length} 件あります
                （{records.reschedules.map((a) => `${a.date} → ${a.targetDate}`).join("・")}）。
                振替先の担当が旧担当のままのものは、時間割調整一覧で確かめてください。
              </div>
            )}
          </div>
        )}

        {isAdmin && (
          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={apply} disabled={!canApply}
              style={{ ...S.btn(true), background: "#2a4a8e", opacity: canApply ? 1 : 0.5 }}>
              {chosenIds.length} コマに担当変更を付ける
            </button>
          </div>
        )}
      </div>

      <div style={box}>
        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>
          登録済みの担当の切り替え（{registered.length} 件）
        </div>
        {registered.length === 0 ? (
          <div style={{ fontSize: 12, color: "#888" }}>まだありません。</div>
        ) : (
          <ul aria-label="登録済みの担当の切り替え" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {registered.map((item) => (
              <li key={`${item.slot.id}-${item.change.from}`} style={{ fontSize: 12, padding: "3px 0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700 }}>{describeTeacherChange(item)}</span>
                <span>
                  {item.slot.day} {item.slot.time} {item.slot.grade}
                  {item.slot.cls && item.slot.cls !== "-" ? item.slot.cls : ""} {item.slot.subj}
                </span>
                {timetables?.length > 1 && (
                  <span style={{ color: "#888", fontSize: 10 }}>{ttName(item.slot.timetableId)}</span>
                )}
                {item.change.memo && <span style={{ color: "#666" }}>{item.change.memo}</span>}
                {isAdmin && (
                  <button type="button" onClick={() => cancelRegistered(item)}
                    aria-label={`${describeTeacherChange(item)} ${item.slot.subj} の切り替えを取り消す`}
                    style={{ ...S.btn(false), fontSize: 11, padding: "2px 8px", background: "#fde8e8", color: "#c03030" }}>
                    取り消す
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
