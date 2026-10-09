// 予定表の読み込みで、利用者にそのまま見せる (日本語の) エラー。
// これ以外の例外 (ライブラリの英語のエラー・想定外の壊れ方) は、
// workbookFile が「読み込めませんでした」の文言に包んで出す。
export class WorkbookError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkbookError";
  }
}

export const PASSWORD_MESSAGE =
  "パスワードで保護されたファイルは読めません。Excel でパスワードを解除して保存し直してから、読み込んでください。";
