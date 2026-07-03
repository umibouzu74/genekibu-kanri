// L4f: CSV 取り込み用の雛形ビルダー。実務では事務スタッフが Excel で CSV を
// 用意するため、現在の科目・日付・時限ラベルを埋めたヘッダ付き雛形を配れる
// ようにする (「| 区切り忘れ」「ラベル不一致」の転記ミスを減らす)。
// ビルダーは純粋関数、ダウンロードだけ DOM を触る薄いヘルパーに分ける。

// 講師マスタ CSV (name,subjects)。subjects は '|' 区切り。
export function buildTeachersCsvTemplate(subjects: string[] | null | undefined): string {
  const subs = (subjects || []).filter(Boolean);
  const first = subs[0] || '英語';
  const pair = subs.length >= 2 ? `${subs[0]}|${subs[1]}` : first;
  return [
    'name,subjects',
    `堀上,${first}`,
    `山田,${pair}`,
    `未定,${subs.join('|') || first}`,
  ].join('\n');
}

// NG 日時 CSV (name,date,period)。date / period は登録済みラベルと一致させる。
export function buildNgCsvTemplate(
  teacherNames: string[] | null | undefined,
  dateLabels: string[] | null | undefined,
  periodLabels: string[] | null | undefined,
): string {
  const name = (teacherNames || []).find(n => n && n !== '未定') || '田中';
  const date1 = (dateLabels || [])[0] || '12/25';
  const date2 = (dateLabels || [])[1] || date1;
  const period1 = (periodLabels || [])[0] || '1限';
  const period2 = (periodLabels || [])[1] || period1;
  return [
    'name,date,period',
    `${name},${date1},${period1}`,
    `${name},${date1},${period2}`,
    `${name},${date2},${period1}`,
  ].join('\n');
}

// テキストを CSV ファイルとしてダウンロードさせる。Excel が UTF-8 を正しく
// 開けるよう BOM を付ける (§M: 不可視文字の直置きは formatter で無音消失
// しうるためエスケープ表記にする)。
export function downloadCsvFile(filename: string, text: string): void {
  const blob = new Blob(['\uFEFF' + text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
