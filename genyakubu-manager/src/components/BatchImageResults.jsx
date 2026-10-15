import { useMemo, useState } from "react";
import { S } from "../styles/common";
import { canShareFiles, downloadFiles } from "../utils/htmlImage";

// まとめて印刷ダイアログの「🖼 画像にする」で作った画像の一覧
// (hooks/usePrintJobs.handleBatchImages の結果)。
//
// - まとめて共有 / まとめて保存: 全員分を一度に (グループのトークへ送るとき)
// - 各行の 共有 / 保存: その人の分だけ (個別のトークへ 1 人ずつ送るとき)。
//   複数月を選んだときは、その人の月を全部まとめて渡す
//
// 共有は端末の共有シート (navigator.share)。iPad / iPhone ではそこから LINE
// などへそのまま送れ、「画像を保存」で写真にも入る。navigator.share は
// クリック直下でしか呼べないので、画像は生成済みの File を持っておき、
// ボタンのハンドラから同期的に呼ぶ (await を挟まない)。
// 共有シートが無いブラウザ (PC の Firefox など) は「保存」だけを出す。
//
// images: { key, teacher, year, month, file, url }[] (並びは印刷順)
export function BatchImageResults({ images = [], onBack, onClose }) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const img of images) {
      if (!map.has(img.teacher)) map.set(img.teacher, []);
      map.get(img.teacher).push(img);
    }
    return [...map.entries()].map(([teacher, items]) => ({ teacher, items }));
  }, [images]);
  const allFiles = useMemo(() => images.map((img) => img.file), [images]);
  // 1 人分 (1 枚) を共有できるか / 全員分をまとめて共有できるか (枚数が
  // 多すぎると共有シートが断る端末がある) を別々に見る
  const canShareOne = useMemo(
    () => allFiles.length > 0 && canShareFiles([allFiles[0]]),
    [allFiles]
  );
  const canShareAll = useMemo(
    () => canShareOne && canShareFiles(allFiles),
    [canShareOne, allFiles]
  );
  const [message, setMessage] = useState("");

  const share = (files) => {
    setMessage("");
    // await より前に navigator.share を呼ぶ (クリック直下の扱いを保つ)
    navigator.share({ files }).catch((err) => {
      // 共有シートを閉じただけ (キャンセル) は何も言わない
      if (err?.name === "AbortError") return;
      console.warn("[batch-image] share failed:", err);
      setMessage(`共有できませんでした (${err?.name || "エラー"})。「保存」を使ってください。`);
    });
  };
  const save = (files) => {
    setMessage("");
    downloadFiles(files);
  };

  const monthLabel = (items) => items.map((img) => `${img.year}年${img.month}月`).join("・");

  return (
    <div>
      <p style={{ fontSize: 13, margin: "0 0 10px", color: "#333" }}>
        🖼 {images.length} 枚の画像ができました（{groups.length} 名）。
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        {canShareAll && (
          <button
            type="button"
            onClick={() => share(allFiles)}
            aria-label={`${images.length} 枚をまとめて共有`}
            style={S.btn(true)}
          >
            📤 まとめて共有（{images.length} 枚）
          </button>
        )}
        <button
          type="button"
          onClick={() => save(allFiles)}
          aria-label={`${images.length} 枚をまとめて保存`}
          style={S.btn(!canShareAll)}
        >
          ⬇ まとめて保存
        </button>
      </div>
      <p style={{ fontSize: 11, color: "#666", margin: "0 0 10px", lineHeight: 1.6 }}>
        {canShareOne
          ? "「共有」から LINE などへそのまま送れます (「画像を保存」で写真にも入ります)。1 人ずつ送るときは各行の「共有」を使ってください。"
          : "このブラウザは共有に対応していないので、画像はダウンロードとして保存されます。"}
      </p>

      <ul
        aria-label="できた画像"
        style={{
          listStyle: "none",
          margin: "0 0 12px",
          padding: 8,
          maxHeight: 360,
          overflow: "auto",
          border: "1px solid #eee",
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {groups.map((g) => {
          const files = g.items.map((img) => img.file);
          return (
            <li
              key={g.teacher}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 6,
                border: "1px solid #ddd",
                borderRadius: 8,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", gap: 4 }}>
                {g.items.map((img) => (
                  <a
                    key={img.key}
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="大きく表示"
                  >
                    <img
                      src={img.url}
                      alt={`${g.teacher} ${img.year}年${img.month}月の月次予定`}
                      style={{
                        width: 96,
                        height: "auto",
                        display: "block",
                        border: "1px solid #ccc",
                        borderRadius: 4,
                        background: "#fff",
                      }}
                    />
                  </a>
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{g.teacher}</div>
                <div style={{ fontSize: 11, color: "#666" }}>{monthLabel(g.items)}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {canShareOne && (
                  <button
                    type="button"
                    onClick={() => share(files)}
                    aria-label={`${g.teacher} の画像を共有`}
                    style={{ ...S.btn(true), padding: "6px 12px", fontSize: 12 }}
                  >
                    📤 共有
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => save(files)}
                  aria-label={`${g.teacher} の画像を保存`}
                  style={{ ...S.btn(false), padding: "6px 12px", fontSize: 12 }}
                >
                  ⬇ 保存
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {message && (
        <div role="alert" style={{ fontSize: 12, color: "#a02020", marginBottom: 10 }}>
          {message}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <button type="button" onClick={onBack} style={S.btn(false)}>
          ← 選び直す
        </button>
        <button type="button" onClick={onClose} style={S.btn(false)}>
          閉じる
        </button>
      </div>
    </div>
  );
}
