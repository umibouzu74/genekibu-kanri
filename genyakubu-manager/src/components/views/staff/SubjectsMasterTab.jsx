import { useCallback, useEffect, useRef, useState } from "react";
import { S } from "../../../styles/common";
import { colors } from "../../../styles/tokens";
import { FieldError } from "../../FieldError";

// 教科マスタータブ : カテゴリと教科のインライン CRUD。
//
// インライン編集の保存は **blur / Enter のタイミング** (KanaField と同じ)。
// onChange のたびに onSaveCategory / onSaveSubject を呼ぶと、useSyncedStorage
// が打鍵ごとに localStorage + RTDB へ書き込み、色のドラッグでは数十回飛ぶ。
//   - 名前: 空は保存せず元に戻す。同じ一覧内の重複は行内にエラーを出して
//     保存しない (Escape で元に戻す)
//   - 別名: blur / Enter で配列に分解して保存
//   - 色: ドラッグ中は 300ms のデバウンス、blur で即確定。アンマウント時にも
//     未確定の色を流すが、行が消えた (カテゴリ削除) ときは捨てる — 最後の
//     描画で捕まえた onSaveCategory は削除前の一覧を握っているので、そのまま
//     流すと消したカテゴリが復活する。確定は常に親の ref 経由で「今の一覧に
//     その id があるか」を見てから行う (commitCategoryColor)

const COLOR_DEBOUNCE_MS = 300;

/**
 * blur / Enter で確定するテキスト入力。
 * @param {object} props
 * @param {string} props.value 保存済みの値
 * @param {(next: string) => void} props.onCommit 確定時 (値が変わったときだけ)
 * @param {(next: string) => string|null} [props.validate] エラー文言を返すと保存しない
 * @param {boolean} [props.restoreOnEmpty] 空なら黙って元に戻す
 */
function DraftTextInput({
  value,
  onCommit,
  validate,
  restoreOnEmpty = false,
  errorId,
  style,
  ...inputProps
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(null);

  // 他端末の同期などで外から変わったら追従する (編集中の draft を潰さない
  // よう、保存済みの値が変わったときだけ入れ直す)
  useEffect(() => {
    setDraft(value);
    setError(null);
  }, [value]);

  const commit = () => {
    const next = draft.trim();
    if (next === value) {
      setDraft(value);
      setError(null);
      return;
    }
    if (!next && restoreOnEmpty) {
      setDraft(value);
      setError(null);
      return;
    }
    const err = validate ? validate(next) : null;
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onCommit(next);
  };

  return (
    <div style={{ display: "inline-flex", flexDirection: "column" }}>
      <input
        {...inputProps}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(value);
            setError(null);
          }
        }}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error && errorId ? errorId : undefined}
        style={{ ...style, borderColor: error ? colors.danger : style?.borderColor }}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

/**
 * 色の入力。ドラッグ中の onChange はデバウンスし、blur で即確定する。
 * アンマウント時の flush も最後に描画されたときの onCommit を呼ぶ。この
 * コンポーネント自身は消えた後の props を知りようがないので、onCommit
 * 側が (親の ref 経由で) 今の状態を見て捨てるかどうかを決める。
 */
function DraftColorInput({ value, onCommit, ...inputProps }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef(null);
  const latest = useRef({ draft: value, value, onCommit });
  latest.current = { draft, value, onCommit };

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const flush = () => {
    clearTimer();
    const { draft: d, value: v, onCommit: cb } = latest.current;
    if (d !== v) cb(d);
  };

  // アンマウント時に未確定の色を捨てない
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      {...inputProps}
      type="color"
      value={draft}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        latest.current = { ...latest.current, draft: next };
        clearTimer();
        timer.current = setTimeout(flush, COLOR_DEBOUNCE_MS);
      }}
      onBlur={flush}
    />
  );
}

// 同じ一覧内の重複チェック (自分自身は除く)。表記の前後空白は無視
function makeDuplicateValidator(list, selfId, label) {
  return (next) => {
    const key = next.trim();
    if (!key) return `${label}を入力してください`;
    const dup = list.some((x) => x.id !== selfId && (x.name || "").trim() === key);
    return dup ? `「${key}」は既に登録されています` : null;
  };
}

export function SubjectsMasterTab({
  subjectCategories,
  subjectsByCat,
  newCatName,
  setNewCatName,
  newCatColor,
  setNewCatColor,
  handleAddCategory,
  newSubjByCat,
  setNewSubjByCat,
  handleAddSubject,
  onSaveCategory,
  onDelCategory,
  onSaveSubject,
  onDelSubject,
}) {
  // 色の確定は ref 経由で「今の」一覧と保存関数を見る。DraftColorInput の
  // アンマウント時 flush は最後の描画時の closure から来るので、閉じ込めた
  // 一覧を使うと削除したカテゴリが復活する。id が今の一覧に無ければ捨てる
  const latestRef = useRef({ subjectCategories, onSaveCategory });
  latestRef.current = { subjectCategories, onSaveCategory };
  const commitCategoryColor = useCallback((id, color) => {
    const { subjectCategories: cats, onSaveCategory: save } = latestRef.current;
    const cat = (cats || []).find((c) => c.id === id);
    if (!cat) return;
    if ((cat.color || "#888888") === color) return;
    save({ ...cat, color });
  }, []);

  return (
    <div>
      <div
        style={{
          background: "#fff",
          padding: 14,
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
          カテゴリを追加
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="カテゴリ名 (例: 文系)"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddCategory();
            }}
            style={{ ...S.input, width: 200 }}
          />
          <label style={{ fontSize: 11, color: "#666" }}>
            色:
            <input
              type="color"
              value={newCatColor}
              onChange={(e) => setNewCatColor(e.target.value)}
              style={{ marginLeft: 6, verticalAlign: "middle" }}
            />
          </label>
          <button onClick={handleAddCategory} style={S.btn(true)}>
            ＋ 追加
          </button>
        </div>
      </div>

      {subjectCategories.length === 0 ? (
        <div
          style={{
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #e0e0e0",
            textAlign: "center",
            color: "#bbb",
            padding: 30,
            fontSize: 13,
          }}
        >
          カテゴリが登録されていません
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {subjectCategories.map((cat) => {
            const catSubjects = subjectsByCat.get(cat.id) || [];
            return (
              <div
                key={cat.id}
                style={{
                  background: "#fff",
                  borderRadius: 8,
                  border: `2px solid ${cat.color || "#e0e0e0"}`,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    background: cat.color ? `${cat.color}22` : "#f8f9fa",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <DraftColorInput
                      value={cat.color || "#888888"}
                      onCommit={(color) => commitCategoryColor(cat.id, color)}
                      title="カテゴリ色"
                      aria-label={`${cat.name} の色`}
                      style={{ width: 26, height: 20 }}
                    />
                    <DraftTextInput
                      value={cat.name}
                      restoreOnEmpty
                      validate={makeDuplicateValidator(subjectCategories, cat.id, "カテゴリ名")}
                      onCommit={(name) => onSaveCategory({ ...cat, name })}
                      aria-label={`カテゴリ名 ${cat.name}`}
                      errorId={`cat-name-err-${cat.id}`}
                      style={{
                        ...S.input,
                        fontWeight: 800,
                        fontSize: 14,
                        width: 180,
                        color: cat.color || "#333",
                      }}
                    />
                    <span style={{ fontSize: 11, color: "#888" }}>
                      {catSubjects.length} 教科
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDelCategory(cat.id)}
                    aria-label={`${cat.name} を削除`}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 14,
                      color: colors.danger,
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ padding: "10px 14px" }}>
                  {catSubjects.length === 0 && (
                    <div style={{ fontSize: 11, color: "#bbb", marginBottom: 6 }}>
                      教科が登録されていません
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {catSubjects.map((subj) => (
                      <div
                        key={subj.id}
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "flex-start",
                          padding: "4px 0",
                        }}
                      >
                        <DraftTextInput
                          value={subj.name}
                          restoreOnEmpty
                          validate={makeDuplicateValidator(catSubjects, subj.id, "教科名")}
                          onCommit={(name) => onSaveSubject({ ...subj, name })}
                          aria-label={`教科名 ${subj.name}`}
                          errorId={`subj-name-err-${subj.id}`}
                          style={{ ...S.input, width: 140 }}
                        />
                        <DraftTextInput
                          value={(subj.aliases || []).join(", ")}
                          onCommit={(text) =>
                            onSaveSubject({
                              ...subj,
                              aliases: text
                                .split(",")
                                .map((x) => x.trim())
                                .filter(Boolean),
                            })
                          }
                          placeholder="別名 (カンマ区切り)"
                          aria-label={`${subj.name} の別名`}
                          style={{ ...S.input, width: 320, maxWidth: "100%" }}
                        />
                        <button
                          type="button"
                          onClick={() => onDelSubject(subj.id)}
                          aria-label={`${subj.name} を削除`}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 13,
                            color: colors.danger,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: "1px dashed #e0e0e0",
                    }}
                  >
                    <input
                      value={newSubjByCat[cat.id] || ""}
                      onChange={(e) =>
                        setNewSubjByCat((p) => ({ ...p, [cat.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddSubject(cat.id);
                      }}
                      placeholder="教科名を追加"
                      style={{ ...S.input, width: 180 }}
                    />
                    <button onClick={() => handleAddSubject(cat.id)} style={S.btn(true)}>
                      ＋ 教科
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          fontSize: 11,
          color: "#888",
          marginTop: 10,
          padding: 10,
          background: "#fffbea",
          borderRadius: 6,
          border: "1px solid #f0e8c0",
        }}
      >
        ※ 別名 (aliases) は代行候補フィルタで使用されます。コマの科目文字列が
        教科名または別名のいずれかを含むと、その教科を担当できるバイトが優先表示されます。
      </div>
    </div>
  );
}
