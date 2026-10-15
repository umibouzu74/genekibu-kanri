// HTML 断片 (月次の紙面) を PNG にする。まとめて印刷ダイアログの 🖼 画像にする
// (hooks/usePrintJobs.handleBatchImages) が使う。
//
// 外部ライブラリは使わず、SVG の <foreignObject> に XHTML として包んで
// <img> に読み込み、canvas に描いて toBlob する (html-to-image 等と同じ原理)。
// 紙面の中身は画面の DOM のスナップショット (outerHTML) で、見た目はほぼ
// インラインスタイル + 渡した CSS だけで決まるので、計算済みスタイルを
// 1 要素ずつ写す処理は要らない。
//
// - **寸法の計測は隠し iframe で行う**。iframe の文書はアプリ本体の CSS
//   (appShell.css の画面専用規則: 過ぎた日を薄くする .month-past など) を
//   読まないので、popup 印刷と同じ「紙面の CSS だけ」の状態で高さを測れる。
//   SVG の中も同じ CSS だけで描かれるので、測った高さと描いた中身が揃う。
// - 画像・Web フォントを含めない (システムフォントのみ) ので、Safari で
//   「1 回目の描画で画像が抜ける」問題は起きない想定。念のため少し待って
//   もう一度描く (html-to-image 系ライブラリの Safari 対策と同じ)。
// - iOS Safari の canvas は 1 枚あたりの画素数に上限がある
//   (約 1,670 万画素)。超えそうなら倍率を下げる (pickCanvasScale)。

const XHTML_NS = "http://www.w3.org/1999/xhtml";

// iOS Safari の canvas 上限 (4096×4096) より少し小さめ
export const MAX_CANVAS_PIXELS = 16_000_000;

// XML 1.0 で使えない制御文字を除く (SVG を XML として読むので、混ざると
// 画像全体が読み込めなくなる)。タブ・改行・CR は残す。
export function stripXmlInvalidChars(s) {
  // eslint-disable-next-line no-control-regex
  return String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");
}

// XHTML 文字列を幅 × 高さの SVG に包む (純粋関数)。
export function buildSvgMarkup({ xhtml, width, height }) {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${stripXmlInvalidChars(xhtml)}</foreignObject>` +
    `</svg>`
  );
}

// 画素数の上限に収まる倍率を返す (純粋関数)。preferred を上限に、
// 幅 × 高さ × 倍率² が maxPixels 以下になる最大の値 (0.1 刻みで切り下げ)。
export function pickCanvasScale({ width, height, preferred = 2, maxPixels = MAX_CANVAS_PIXELS }) {
  const area = Math.max(1, width) * Math.max(1, height);
  const fit = Math.sqrt(maxPixels / area);
  const s = Math.min(preferred, fit);
  return Math.max(0.1, Math.floor(s * 10) / 10);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("SVG image failed to load"));
    img.src = src;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    // 描いた内容が「汚染」扱いだと toBlob が SecurityError を投げる
    // (古い Safari の foreignObject)。呼び出し側で印刷へ案内する
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("canvas.toBlob returned null"));
    }, "image/png");
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// html (紙面の断片) を styles で整えて PNG の Blob にする。
// width は CSS px。返す画像の画素幅は width × 倍率 (既定 2)。
export async function renderHtmlToPng({
  html,
  styles,
  width,
  scale = 2,
  sheetClass = "month-image-sheet",
}) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  Object.assign(iframe.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: `${width}px`,
    height: "100px",
    border: "0",
    visibility: "hidden",
    pointerEvents: "none",
  });
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"></head>` +
        `<body style="margin:0;background:#fff">` +
        `<div id="html-image-sheet" class="${sheetClass}"><style>${styles}</style>${html}</div>` +
        `</body></html>`
    );
    doc.close();
    const sheet = doc.getElementById("html-image-sheet");
    const rect = sheet.getBoundingClientRect();
    const cssWidth = Math.ceil(rect.width) || width;
    const cssHeight = Math.ceil(rect.height);
    // XMLSerializer は HTML 文書の要素を XHTML として書き出す (void 要素の
    // 自己終了・属性の引用・& のエスケープ)。名前空間は外側の要素に付く
    let xhtml = new XMLSerializer().serializeToString(sheet);
    if (!xhtml.includes(`xmlns="${XHTML_NS}"`)) {
      xhtml = xhtml.replace(/^<div\b/, `<div xmlns="${XHTML_NS}"`);
    }
    const svg = buildSvgMarkup({ xhtml, width: cssWidth, height: cssHeight });
    const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);

    const s = pickCanvasScale({ width: cssWidth, height: cssHeight, preferred: scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cssWidth * s);
    canvas.height = Math.round(cssHeight * s);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    const draw = () => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    draw();
    // Safari は SVG の中身の描画が 1 回目に間に合わないことがあるので描き直す
    await wait(60);
    draw();
    return await canvasToBlob(canvas);
  } finally {
    iframe.remove();
  }
}

// 端末の共有シート (iPad / iPhone の「共有」) にファイルを渡せるか。
// navigator.canShare が無いブラウザ (PC の Firefox など) は false。
export function canShareFiles(files) {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return false;
  }
  try {
    return navigator.canShare({ files });
  } catch {
    return false;
  }
}

// ファイルをダウンロードとして保存する (共有シートが無い PC 向け)。
// 複数あるときは少し間を空けて 1 つずつ (まとめて押すとブラウザが
// 「複数のファイルをダウンロード」の許可を 1 回だけ聞いてくる)。
export async function downloadFiles(files, { gapMs = 250 } = {}) {
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    if (i < files.length - 1) await wait(gapMs);
  }
}
