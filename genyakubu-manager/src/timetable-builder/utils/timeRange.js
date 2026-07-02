// 時刻文字列のパース・時間帯の重なり判定ユーティリティ。
//
// 「13:00~13:45」「12:25-13:35」「13:00～」など、時限ラベル / 他学年セッションの
// 自由記述から開始・終了分 (minutes since midnight) を取り出すための純粋関数群。
// React 非依存でユニットテスト可能。
//
// 時刻は分単位の整数で表現する (例: 13:00 → 780)。終了が不明な場合は end=null。
// 開始も取れない場合は parse 結果自体が null。

const HHMM_REGEX = /^\s*(\d{1,2})\s*[:：]\s*(\d{2})\s*$/;

// 「HH:mm」一つを minutes に変換 (失敗時 null)。全角コロンも許容。
export function parseHHmm(text) {
  if (text == null) return null;
  const m = String(text).match(HHMM_REGEX);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h < 0 || h > 47 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

// 「13:00~13:45」「12:25-13:35」「13:00~」「13:00」など、任意の文字列から
// 時間帯を抽出する。前後に「1限 (」「)」等の装飾があっても可。
// 戻り値: { startMin, endMin } | null
//   - startMin: 必須 (取れなければ null を返す)
//   - endMin: 取れなければ null (= 開始のみ判明)
export function parseTimeRange(text) {
  if (text == null) return null;
  const s = String(text);

  // 文字列中の「HH:mm[~|-|–]HH:mm」「HH:mm[~|-|–]」「HH:mm」を順に探索
  // (装飾文字を許容するため、最初に見つけた数値ペアを採用)
  // 全角コロンを半角に正規化してから検索。波ダッシュ U+301C (〜、macOS の
  // 日本語 IME が既定で出す) は下の文字クラスの U+FF5E (～) と見た目が
  // ほぼ同じで取りこぼしやすいので、ここで ~ に正規化してしまう。
  const normalized = s.replace(/：/g, ':').replace(/〜/g, '~');

  // 範囲表記を優先 (HH:mm + 区切り + HH:mm)
  const rangeMatch = normalized.match(
    /(\d{1,2}:\d{2})\s*[~～\-–]\s*(\d{1,2}:\d{2})/,
  );
  if (rangeMatch) {
    const startMin = parseHHmm(rangeMatch[1]);
    const endMin = parseHHmm(rangeMatch[2]);
    if (startMin != null && endMin != null) {
      return { startMin, endMin };
    }
  }

  // 開始のみ (HH:mm + 区切り、終了不明)
  const startOnlyMatch = normalized.match(/(\d{1,2}:\d{2})\s*[~～\-–]/);
  if (startOnlyMatch) {
    const startMin = parseHHmm(startOnlyMatch[1]);
    if (startMin != null) return { startMin, endMin: null };
  }

  // 「区切り → HH:mm」(終了のみ表記、例: '~14:00', '1限 (~14:00)') は
  // ambiguous なので null を返す。下の single fallback で '14:00' を
  // 抜き出して『開始のみ』と誤解釈すると終端が開始に反転して自動NGが
  // 全く違う時限にかかるため、明示的に reject する。
  const endOnlyMatch = normalized.match(/[~～\-–]\s*(\d{1,2}:\d{2})/);
  if (endOnlyMatch) return null;

  // 単独 HH:mm
  const single = normalized.match(/(\d{1,2}:\d{2})/);
  if (single) {
    const startMin = parseHHmm(single[1]);
    if (startMin != null) return { startMin, endMin: null };
  }

  return null;
}

// 時限エンティティから時間帯を取得。
// 構造化フィールド (startTime / endTime, HH:mm 文字列) があれば優先、
// 無ければ label から自動解析。両方無ければ null。
export function getPeriodTimeRange(period) {
  if (!period) return null;
  const startFromField = parseHHmm(period.startTime);
  const endFromField = parseHHmm(period.endTime);
  if (startFromField != null) {
    return { startMin: startFromField, endMin: endFromField };
  }
  return parseTimeRange(period.label);
}

// 他学年セッションから時間帯を取得。
// 構造化フィールド (startTime / endTime) があれば優先、無ければ
// label を解析してフォールバック。
export function getSessionTimeRange(session) {
  if (!session) return null;
  const startFromField = parseHHmm(session.startTime);
  const endFromField = parseHHmm(session.endTime);
  if (startFromField != null) {
    return { startMin: startFromField, endMin: endFromField };
  }
  return parseTimeRange(session.label);
}

// 2 つの時間帯が重なるかを判定。
//   - 双方終了不明: 開始が一致したら重なりと見なす (保守的)
//   - 片方終了不明: その点が他方の [start, end] 内にあれば重なり
//   - 双方終了あり: [s1, e1] と [s2, e2] が overlap するか (端点接触は非重複)
// 戻り値: boolean。どちらかが null/未取得なら false。
export function timeRangesOverlap(a, b) {
  if (!a || !b) return false;
  if (a.startMin == null || b.startMin == null) return false;

  const aHasEnd = a.endMin != null;
  const bHasEnd = b.endMin != null;

  if (!aHasEnd && !bHasEnd) {
    return a.startMin === b.startMin;
  }
  if (!aHasEnd) {
    return a.startMin >= b.startMin && a.startMin < b.endMin;
  }
  if (!bHasEnd) {
    return b.startMin >= a.startMin && b.startMin < a.endMin;
  }
  // 両方終了あり: 端点接触 (e.g. 13:35 終了と 13:35 開始) は非重複扱い
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

// minutes を "HH:mm" に整形 (UI 表示・プレビュー用)。null/undefined は null。
export function formatHHmm(minutes) {
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
