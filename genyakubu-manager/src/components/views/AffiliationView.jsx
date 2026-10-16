import { useMemo, useRef, useState } from "react";
import { useToday } from "../../hooks/useToday";
import { useToasts } from "../../hooks/useToasts";
import { S, colors } from "../../styles/common";
import { sortTeacherNames, teacherMatchesQuery } from "../../utils/teacherKana";
import {
  AFFILIATION_CATEGORIES,
  DEFAULT_CATEGORY,
  categoryMeta,
  changesFromPreviousYear,
  fiscalYearOf,
  fmtFiscalYear,
  groupByAffiliation,
  indexAffiliationChanges,
  resetAffiliation,
  resolveAffiliation,
  setAffiliation,
  teacherNamesForYear,
} from "../../utils/teacherAffiliations";

// ─── 講師の所属 ─────────────────────────────────────────────────────
// 講師を「現役部 常勤 / 現役部 非常勤 / 予備校部」に分ける画面。区分は年度
// ごとで、何もしなければ前の年度のまま引き継がれる (utils/teacherAffiliations)。
//
// 操作は「名前を押して選ぶ (何人でも) → 移す先の区分を押す」の 2 手。
// 4 月の入れ替えで何人も動かすことが多いので、1 人ずつのプルダウンにしない。
// 選んだ人の「この年度の変更を取り消す」で前の年度の区分に戻せる。
//
// 並べる講師 = その年度に時間割のコマを持つ人 + バイト一覧 + 現役部に
// 入れてある人 (時間割にいない常勤も)。現役部から外して予備校部に戻した人は、
// 時間割にいなければ一覧から消える (辞めた人をいつまでも並べない)。
// 時間割にまだいない人 (4 月からの新任など) は下の「＋ 加える」で入れる。
//
// 有給・半休を記録するのは「現役部 常勤」の人 (LeaveView)。

const SOURCE_TEXT = {
  "this-year": (y) => `${fmtFiscalYear(y)}から`,
  inherited: (y) => `${fmtFiscalYear(y)}から引き継ぎ`,
  "part-time": () => "バイト一覧にいるので現役部 非常勤 (既定)",
  default: () => "登録なし (既定)",
};

// 前の年度からの変更を「向き (from → to)」ごとにまとめる (出てきた順)
function groupYearChanges(changes) {
  const byKey = new Map();
  for (const c of changes) {
    const key = `${c.from}>${c.to}`;
    if (!byKey.has(key)) byKey.set(key, { from: c.from, to: c.to, names: [] });
    byKey.get(key).names.push(c.name);
  }
  return [...byKey.values()];
}

const chipStyle = (tone, selected, editable) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "5px 11px",
  borderRadius: 16,
  fontSize: 13,
  fontWeight: 700,
  border: `1.5px solid ${selected ? colors.primary : tone.border}`,
  background: selected ? colors.primary : "#fff",
  color: selected ? "#fff" : tone.fg,
  cursor: editable ? "pointer" : "default",
  boxShadow: selected ? "0 0 0 2px #fff inset" : "none",
  lineHeight: 1.3,
});

const smallTag = (bg, fg) => ({
  fontSize: 9,
  fontWeight: 800,
  padding: "0 4px",
  borderRadius: 3,
  background: bg,
  color: fg,
});

export function AffiliationView({
  affiliations = [],
  onSave,
  slots = [],
  timetables = [],
  partTimeStaff = [],
  teacherKana = {},
  isAdmin = false,
  // 有給・半休の画面を開く (管理者だけが読める画面なので、読める人にだけ渡す)
  onOpenLeave,
}) {
  const today = useToday();
  const toasts = useToasts();
  const thisYear = fiscalYearOf(today);
  const [year, setYear] = useState(thisYear);
  const [selected, setSelected] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState(AFFILIATION_CATEGORIES[0].key);
  const editable = isAdmin && typeof onSave === "function";

  const partTimeNames = useMemo(
    () => new Set((partTimeStaff || []).map((s) => s?.name).filter(Boolean)),
    [partTimeStaff]
  );
  const index = useMemo(() => indexAffiliationChanges(affiliations), [affiliations]);

  // この年度の一覧に並べる講師
  const names = useMemo(() => {
    const set = teacherNamesForYear(slots, timetables, year);
    for (const n of partTimeNames) set.add(n);
    for (const n of index.keys()) {
      if (resolveAffiliation(index, n, year, partTimeNames).category !== DEFAULT_CATEGORY) {
        set.add(n);
      }
    }
    return sortTeacherNames([...set], teacherKana);
  }, [slots, timetables, year, partTimeNames, index, teacherKana]);

  const shownNames = useMemo(() => {
    const q = query.trim();
    return q ? names.filter((n) => teacherMatchesQuery(n, q, teacherKana)) : names;
  }, [names, query, teacherKana]);

  const groups = useMemo(
    () => groupByAffiliation(shownNames, index, year, partTimeNames),
    [shownNames, index, year, partTimeNames]
  );
  const yearChanges = useMemo(
    () => changesFromPreviousYear(names, index, year, partTimeNames),
    [names, index, year, partTimeNames]
  );

  // 年度を変えても選択は残す (同じ人を続けて動かすことがある) が、一覧に
  // いない人は外す
  const selectedNames = useMemo(() => names.filter((n) => selected.has(n)), [names, selected]);
  const selectedHasThisYearChange = selectedNames.some(
    (n) => resolveAffiliation(index, n, year, partTimeNames).source === "this-year"
  );

  // 「元に戻す」で、押した時点の保存値へ戻すための最新値
  const latestRef = useRef(affiliations);
  latestRef.current = affiliations;
  const commit = (next, message) => {
    const before = latestRef.current;
    onSave(next);
    toasts.push(message, {
      tone: "success",
      duration: 6000,
      action: {
        label: "元に戻す",
        onClick: () => onSave(before),
      },
    });
  };

  const toggle = (name) => {
    if (!editable) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const moveSelected = (categoryKey) => {
    if (selectedNames.length === 0) return;
    const meta = categoryMeta(categoryKey);
    commit(
      setAffiliation(latestRef.current, selectedNames, year, categoryKey, partTimeNames),
      `${selectedNames.length === 1 ? selectedNames[0] : `${selectedNames.length} 人`}を${fmtFiscalYear(year)}から「${meta.label}」にしました`
    );
    setSelected(new Set());
  };

  const resetSelected = () => {
    if (selectedNames.length === 0) return;
    commit(
      resetAffiliation(latestRef.current, selectedNames, year, partTimeNames),
      `${selectedNames.length === 1 ? selectedNames[0] : `${selectedNames.length} 人`}の${fmtFiscalYear(year)}の変更を取り消しました`
    );
    setSelected(new Set());
  };

  const addPerson = () => {
    const name = newName.trim();
    if (!name) return;
    if (/[·・･]/.test(name)) {
      toasts.error("講師名に中黒 (・) は使えません (複数講師の区切りと区別できないため)");
      return;
    }
    const current = resolveAffiliation(index, name, year, partTimeNames).category;
    if (current === newCategory) {
      toasts.info(`${name} はもう「${categoryMeta(newCategory).label}」です`);
      setNewName("");
      return;
    }
    commit(
      setAffiliation(latestRef.current, [name], year, newCategory, partTimeNames),
      `${name} を${fmtFiscalYear(year)}から「${categoryMeta(newCategory).label}」に加えました`
    );
    setNewName("");
  };

  const yearBtn = (y, label) => (
    <button
      type="button"
      onClick={() => setYear(y)}
      style={{ ...S.btn(false), padding: "5px 10px", fontSize: 12 }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <section style={{ ...S.panel, padding: "10px 14px", fontSize: 13, lineHeight: 1.6 }}>
        <div>
          講師を<b>現役部 常勤</b>・<b>現役部 非常勤</b>・<b>予備校部</b>に分けます。区分は
          <b>年度ごと</b>で、何もしなければ前の年度のまま次の年度へ引き継がれます (4
          月に変わった人だけ動かせば済みます)。
        </div>
        <div style={{ color: colors.inkMuted, fontSize: 12 }}>
          分けていない講師は予備校部、バイト一覧の人は最初から現役部 非常勤です。 「現役部
          常勤」の人の有給・半休を記録できます。
        </div>
      </section>

      {/* 年度と絞り込み */}
      <div
        className="no-print"
        style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
      >
        {yearBtn(year - 1, `◀ ${fmtFiscalYear(year - 1)}`)}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="年度"
            style={{ ...S.input, width: "auto", fontWeight: 800, fontSize: 15, padding: "5px 8px" }}
          >
            {Array.from({ length: 7 }, (_, i) => thisYear - 4 + i)
              .concat(year < thisYear - 4 || year > thisYear + 2 ? [year] : [])
              .sort((a, b) => a - b)
              .map((y) => (
                <option key={y} value={y}>
                  {fmtFiscalYear(y)}
                  {y === thisYear ? " (今年度)" : ""}
                </option>
              ))}
          </select>
        </label>
        {yearBtn(year + 1, `${fmtFiscalYear(year + 1)} ▶`)}
        {year !== thisYear && yearBtn(thisYear, "今年度へ")}
        <span style={{ fontSize: 12, color: colors.inkMuted }}>
          {year}/4/1 〜 {year + 1}/3/31
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前・よみで絞る"
          aria-label="講師を名前・よみで絞る"
          style={{ ...S.input, width: 180, marginLeft: "auto", padding: "5px 8px", fontSize: 13 }}
        />
      </div>

      {yearChanges.length > 0 && (
        <section
          aria-label={`${fmtFiscalYear(year)}の変更`}
          style={{
            ...S.panel,
            padding: "8px 14px",
            background: colors.warningSoft,
            borderColor: "#f0dc90",
            fontSize: 13,
          }}
        >
          <b>
            {fmtFiscalYear(year)}に変わった人 ({yearChanges.length})
          </b>
          {/* 4 月の入れ替えは同じ向きの移動がまとまるので、向きごとに 1 行 */}
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {groupYearChanges(yearChanges).map((g) => (
              <li key={`${g.from}>${g.to}`}>
                {categoryMeta(g.from).label} → <b>{categoryMeta(g.to).label}</b>:{" "}
                {g.names.join("・")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {editable && (
        <div
          className="no-print"
          role="region"
          aria-label="選んだ講師を移す"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 5,
            ...S.panel,
            padding: "8px 12px",
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
            background: selectedNames.length ? colors.infoSoft : colors.surfaceAlt,
            borderColor: selectedNames.length ? colors.infoBorder : colors.border,
          }}
        >
          {selectedNames.length === 0 ? (
            <span style={{ fontSize: 13, color: colors.inkMuted }}>
              名前を押して選ぶと (何人でも)、ここで移す先を選べます
            </span>
          ) : (
            <>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {selectedNames.length <= 3
                  ? selectedNames.join("・")
                  : `${selectedNames.slice(0, 3).join("・")} ほか ${selectedNames.length - 3} 人`}{" "}
                を{fmtFiscalYear(year)}から →
              </span>
              {AFFILIATION_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => moveSelected(c.key)}
                  style={{
                    ...S.btn(false),
                    padding: "5px 12px",
                    fontSize: 13,
                    background: c.tone.bg,
                    color: c.tone.fg,
                    border: `1px solid ${c.tone.border}`,
                  }}
                >
                  {c.label}
                </button>
              ))}
              {selectedHasThisYearChange && (
                <button
                  type="button"
                  onClick={resetSelected}
                  title="この年度に変えた分を取り消して、前の年度の区分に戻します"
                  style={{ ...S.btn(false), padding: "5px 12px", fontSize: 12 }}
                >
                  ↩ この年度の変更を取り消す
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                style={{ ...S.btn(false), padding: "5px 12px", fontSize: 12, marginLeft: "auto" }}
              >
                選択を解除
              </button>
            </>
          )}
        </div>
      )}

      {groups.map(({ category, names: inGroup }) => {
        const allSelected = inGroup.length > 0 && inGroup.every((n) => selected.has(n));
        return (
          <section
            key={category.key}
            aria-label={`${category.label} ${inGroup.length} 人`}
            style={{
              ...S.panel,
              borderLeft: `5px solid ${category.tone.fg}`,
              padding: "10px 14px",
              breakInside: "avoid",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 8,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 15, color: category.tone.fg }}>
                {category.label}
                <span style={{ marginLeft: 6, fontSize: 13 }}>{inGroup.length} 人</span>
              </h2>
              <span style={{ fontSize: 12, color: colors.inkMuted }}>{category.desc}</span>
              <span className="no-print" style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {category.tracksLeave && onOpenLeave && (
                  <button
                    type="button"
                    onClick={onOpenLeave}
                    style={{ ...S.btn(false), padding: "3px 10px", fontSize: 12 }}
                  >
                    🌴 有給・半休を開く
                  </button>
                )}
                {editable && inGroup.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const n of inGroup) {
                          if (allSelected) next.delete(n);
                          else next.add(n);
                        }
                        return next;
                      })
                    }
                    style={{ ...S.btn(false), padding: "3px 10px", fontSize: 12 }}
                  >
                    {allSelected ? "この区分の選択を外す" : "この区分を全員選ぶ"}
                  </button>
                )}
              </span>
            </div>
            {inGroup.length === 0 ? (
              <div style={{ fontSize: 12, color: colors.inkGhost }}>
                {query ? "絞り込みに当たる人はいません" : "まだいません"}
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {inGroup.map((name) => {
                  const r = resolveAffiliation(index, name, year, partTimeNames);
                  const isSel = selected.has(name);
                  const title = `${name}: ${categoryMeta(r.category).label} — ${SOURCE_TEXT[r.source](r.fromYear)}${
                    editable ? "\n押して選ぶ" : ""
                  }`;
                  const tags = (
                    <>
                      {r.source === "this-year" && (
                        <span style={smallTag(isSel ? "#fff" : "#fff3c4", "#8a6000")}>
                          {String(year).slice(2)}年度〜
                        </span>
                      )}
                      {partTimeNames.has(name) && (
                        <span style={smallTag(isSel ? "#fff" : "#eef4fb", "#2a5a8a")}>バイト</span>
                      )}
                    </>
                  );
                  return editable ? (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={isSel}
                      onClick={() => toggle(name)}
                      title={title}
                      style={chipStyle(category.tone, isSel, true)}
                    >
                      {isSel && <span aria-hidden="true">✓</span>}
                      {name}
                      {tags}
                    </button>
                  ) : (
                    <span key={name} title={title} style={chipStyle(category.tone, false, false)}>
                      {name}
                      {tags}
                    </span>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {editable && (
        <section
          className="no-print"
          aria-label="時間割にいない人を加える"
          style={{ ...S.panel, padding: "10px 14px" }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
            ＋ 時間割にいない人を加える
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addPerson();
            }}
            style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="講師名 (時間割と同じ書き方で)"
              aria-label="加える講師名"
              style={{ ...S.input, width: 200, padding: "6px 8px", fontSize: 13 }}
            />
            <span style={{ fontSize: 13 }}>を{fmtFiscalYear(year)}から</span>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              aria-label="加える区分"
              style={{ ...S.input, width: "auto", padding: "6px 8px", fontSize: 13 }}
            >
              {AFFILIATION_CATEGORIES.filter((c) => c.key !== DEFAULT_CATEGORY).map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!newName.trim()}
              style={{ ...S.btn(true), padding: "6px 14px", fontSize: 13 }}
            >
              加える
            </button>
          </form>
          <div style={{ fontSize: 11, color: colors.inkMuted, marginTop: 4 }}>
            4 月からの新任・コマを持たない常勤など。時間割に入れば自動で一覧に並びます。
          </div>
        </section>
      )}
    </div>
  );
}
