import { Fragment, useEffect, useMemo, useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
import { makeNgKey, makeExternalKey } from '../../utils/scheduleKey';
import { computeAutoNgEntries } from '../../utils/autoNg';
import { computePresetMemoBackfill } from '../../utils/presetMemoBackfill';
import { getPeriodTimeRange, parseHHmm } from '../../utils/timeRange';
import { sortPoolDatesByCalendar } from '../../utils/dateGenerate';
import { groupTeachersBySubject } from '../../utils/groupTeachersBySubject';
import NgCsvImport from './NgCsvImport';
import DraftNumberInput from './DraftNumberInput';

// 時刻 <input type="time"> のスピナー刻み (秒)。講習の時刻は 5 分単位が前提
// なので 1 分刻み (= 既定 60) だと『分を合わせづらい』。300 = 5 分にして
// スピナー / 上下キー 1 操作で 5 分動かす (任意の分のタイプ入力は引き続き可)。
const TIME_STEP_SEC = 300;

// 「📅 講師不在・NG」タブ。旧 'external' (他学年・午前) + 'ng' (日時NG) を統合。
//
// 上から下のレイアウト:
//   1. プリセット管理 (折りたたみ)
//   2. 統合一括登録フォーム
//      - 「他学年セッション」「手動NG」の 2 モードをラジオで切替
//      - 共通フィールド: 講師 (複数チェック) / 期間 (start-end date) / メモ
//      - mode='external': 時刻 (start-end)、追加で自動NG派生もまとめて発火
//      - mode='ng': 時限チェックボックス、「まとめてNG / 解除」2 アクション
//   3. 一括解除 (全手動NG / 全NG設定 — どちらも確認ダイアログ付き)
//   4. 日付ごとの折りたたみセクション (日付ヘッダを共有)
//      - その日の他学年セッション一覧 (× で削除)
//      - その日の NG マトリクス (講師×時限、教科グループ付き、自動NG は『自』)
//   5. クイック数値入力グリッド (折りたたみ、最下部)
export default function AbsenceNgPanel() {
  const {
    project,
    handleExternalCountChange,
    addExternalSessions,
    removeExternalSession,
    addExternalSessionPreset,
    updateExternalSessionPreset,
    removeExternalSessionPreset,
    applyPresetMemosToSessions,
    toggleTeacherNg,
    setNgBatch,
    clearAllManualNg,
    clearAllNg,
    analysis,
  } = useProjectContext();
  const { showConfirm, showToast } = useUI();
  const autoNgByTeacher = analysis?.autoNgByTeacher;

  // v4(Y): NG / 他学年セッションは全タブ共通。日付軸は currentConfig (タブの使う日)
  // ではなく『プール全日』(project.dates) を使う。これにより、現タブが使わない日
  // (他学年だけの日) にも講師の不在・NG を設定できる。
  // 時限も同じ理由で E-3 (タブ別 activePeriodIds 絞り込み) の対象外とし、
  // currentConfig.periods ではなく『プール全時限』(project.periods) を使う
  // (例: 中３の昼タブから中1・2専用の夜の時限にも NG を設定できる必要がある)。
  // プールはカレンダー順に並べ替えて使う (F5j)。project.dates は挿入順
  // (tabDates/setByLabels が新ラベルを末尾 push) なので、後からタブに前倒しの
  // 日付を足すとカレンダー順と乖離する。このパネルの期間指定
  // (dateLabelsInRange) は配列位置の slice で範囲を作るため、生順のままだと
  // 「7/15〜7/25」指定が別の日群に化けて一括 NG / セッションが誤登録される。
  // 表示 (NG マトリクス列・クイックグリッド・select) も BasicSettings の
  // sortPoolDatesByCalendar 表示と揃う。パース不能ラベルは末尾 (安定順)。
  const poolDates = useMemo(() => sortPoolDatesByCalendar(project.dates || []), [project.dates]);
  const poolPeriods = useMemo(() => project.periods || [], [project.periods]);

  // ── 折りたたみ state ───────────────────────
  // 初期化時の date id のみキーとして持つ。dates 変更時に stale な key を
  // クリーンアップする useEffect で id 再利用時の silent collapse を防ぐ
  // (code-review P3)。
  const [expandedDates, setExpandedDates] = useState(() => {
    const initial = {};
    poolDates.forEach(d => { initial[d.id] = true; });
    return initial;
  });
  const [quickGridExpanded, setQuickGridExpanded] = useState(false);

  // ── unified bulk form state ───────────────
  const [mode, setMode] = useState('external'); // 'external' | 'ng'
  // 講師選択は『動的全選択モード』を持つ。allMode=true のとき
  // selectedTeacherIdxs は『現在の project.teachers』から動的に解決する
  // (旧 NgSettings の ALL_TEACHERS sentinel と等価)。個別チェックで manual に
  // 切替わり、formTeacherNames で明示管理される (code-review P1)。
  const [formTeachers, setFormTeachers] = useState(() => ({ allMode: false, names: new Set<string>() }));
  // periodIds も同様に『動的全選択』モードを持つ (code-review P2)。
  const [formPeriods, setFormPeriods] = useState(() => ({ allMode: true, ids: new Set<number>() }));
  const [formMemo, setFormMemo] = useState('');
  // 他学年モード用 (時刻)
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  // 共通: 期間。両方とも dates[0] を初期 default に (誤って全期間に広げて
  // 大量セッションが生成される事故を防ぐ — code-review P1)。
  const [formStartDateId, setFormStartDateId] = useState(poolDates[0]?.id ?? null);
  const [formEndDateId, setFormEndDateId] = useState(poolDates[0]?.id ?? null);

  // dates が変わって start/end が無効になったら再同期。
  // 無効化時の snap 先は『nearest valid』とし、widening (last へジャンプ) は
  // しない (code-review P1)。end が無効なら start に揃え (= 単日)、start が
  // 無効なら dates[0] に揃える。
  useEffect(() => {
    const idList = poolDates.map(d => d.id);
    const ids = new Set(idList);
    if (!ids.has(formStartDateId)) {
      setFormStartDateId(idList[0] ?? null);
    }
    if (!ids.has(formEndDateId)) {
      // start が valid なら end を start に揃える (単日に縮退)
      // start も無効なら dates[0] (start と揃う)
      const fallback = ids.has(formStartDateId) ? formStartDateId : (idList[0] ?? null);
      setFormEndDateId(fallback);
    }
  }, [poolDates, formStartDateId, formEndDateId]);

  // expandedDates の stale key を削除する (id 再利用で silent collapse する
  // 事故を防ぐ — code-review P3)
  useEffect(() => {
    const validIds = new Set(poolDates.map(d => d.id));
    setExpandedDates(prev => {
      const next = {};
      let changed = false;
      for (const key of Object.keys(prev)) {
        const idNum = Number(key);
        if (validIds.has(idNum)) next[idNum] = prev[key];
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [poolDates]);

  // teachers が変わったら manual 選択の Set を整合させる。
  // size 比較ではなく Set membership 比較で行う (rename swap 等で size が
  // 変わらなくても内容が変わるケースに対応 — code-review P3)。
  useEffect(() => {
    const names = new Set(project.teachers.map(t => t.name));
    setFormTeachers(prev => {
      if (prev.allMode) return prev;
      const filteredArr = Array.from(prev.names).filter(n => names.has(n));
      const sameSize = filteredArr.length === prev.names.size;
      const sameContent = sameSize && filteredArr.every(n => prev.names.has(n));
      if (sameSize && sameContent) return prev;
      return { ...prev, names: new Set(filteredArr) };
    });
  }, [project.teachers]);
  // periods が変わったら manual 選択の Set を整合させる (同様に membership 比較)
  useEffect(() => {
    const validIds = new Set(poolPeriods.map(p => p.id));
    setFormPeriods(prev => {
      if (prev.allMode) return prev;
      const filteredArr = Array.from(prev.ids).filter(id => validIds.has(id));
      const sameSize = filteredArr.length === prev.ids.size;
      const sameContent = sameSize && filteredArr.every(id => prev.ids.has(id));
      if (sameSize && sameContent) return prev;
      return { ...prev, ids: new Set(filteredArr) };
    });
  }, [poolPeriods]);

  const sessions = useMemo(
    () => project.externalSessions || [],
    [project.externalSessions],
  );
  const presets = useMemo(
    () => project.externalSessionPresets || [],
    [project.externalSessionPresets],
  );
  const teacherGroups = useMemo(
    () => groupTeachersBySubject(project.teachers, project.subjects),
    [project.teachers, project.subjects],
  );
  const teacherIdxByName = useMemo(() => {
    const m = new Map();
    project.teachers.forEach((t, i) => m.set(t.name, i));
    return m;
  }, [project.teachers]);

  // 日付セクション表示用: (date, teacher) → sessions
  const sessionsByDate = useMemo(() => {
    const m = new Map();
    sessions.forEach(s => {
      if (!m.has(s.date)) m.set(s.date, []);
      m.get(s.date).push(s);
    });
    return m;
  }, [sessions]);
  // (date, teacher) ごとのセッション件数 (クイックグリッド用)
  const sessionCountMap = useMemo(() => {
    const map = {};
    sessions.forEach(s => {
      const k = makeExternalKey(s.date, s.teacherName);
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }, [sessions]);

  // 日付ヘッダの NG 件数 (手動 + 自動 両方)
  const ngCountByDate = useMemo(() => {
    const out = {};
    poolDates.forEach(d => {
      let count = 0;
      project.teachers.forEach(t => {
        const autoEntries = autoNgByTeacher?.get(t.name);
        poolPeriods.forEach(p => {
          const k = makeNgKey(d.label, p.label);
          if (t.ngSlots?.includes(k) || autoEntries?.has(k)) count++;
        });
      });
      out[d.id] = count;
    });
    return out;
  }, [poolDates, poolPeriods, project.teachers, autoNgByTeacher]);

  // 期間内の date ラベル配列
  const dateLabelsInRange = useMemo(() => {
    const sIdx = poolDates.findIndex(d => d.id === formStartDateId);
    const eIdx = poolDates.findIndex(d => d.id === formEndDateId);
    if (sIdx < 0 || eIdx < 0) return [];
    const lo = Math.min(sIdx, eIdx);
    const hi = Math.max(sIdx, eIdx);
    return poolDates.slice(lo, hi + 1).map(d => d.label);
  }, [poolDates, formStartDateId, formEndDateId]);

  // ── 講師 / 時限 選択の派生 ───────────────
  // allMode のとき: 現在の project.teachers をそのまま反映 (動的解決)
  // manual のとき: names Set との一致
  // formTeachers.names は teachers 同期 useEffect で常に valid な name しか
  // 持たないので、selectedNames は『現在の project に存在する名前のみ』を
  // 含む (canApply の 1-render ズレを防ぐ — code-review P2)。
  const selectedTeacherNames = useMemo(() => {
    if (formTeachers.allMode) return project.teachers.map(t => t.name);
    return project.teachers
      .map(t => t.name)
      .filter(n => formTeachers.names.has(n));
  }, [project.teachers, formTeachers]);
  const selectedTeacherIdxs = useMemo(() => {
    const namesSet = new Set(selectedTeacherNames);
    return project.teachers
      .map((t, i) => namesSet.has(t.name) ? i : -1)
      .filter(i => i >= 0);
  }, [project.teachers, selectedTeacherNames]);
  const isTeacherSelected = (name) =>
    formTeachers.allMode || formTeachers.names.has(name);

  // 他学年モード: 時刻検証
  const timeValidation = useMemo(() => {
    if (mode !== 'external') return { error: null };
    const startMin = formStartTime ? parseHHmm(formStartTime) : null;
    const endMin = formEndTime ? parseHHmm(formEndTime) : null;
    if (!formStartTime && formEndTime) return { error: '終了時刻だけでなく開始時刻も入力してください' };
    if (formStartTime && startMin == null) return { error: '開始時刻が不正な形式です' };
    if (formEndTime && endMin == null) return { error: '終了時刻が不正な形式です' };
    if (startMin != null && endMin != null && startMin >= endMin) return { error: '開始時刻は終了時刻より前にしてください' };
    return { error: null };
  }, [mode, formStartTime, formEndTime]);

  // 自動NG プレビュー (1 講師あたりの件数)
  const previewPerTeacherNgCount = useMemo(() => {
    if (mode !== 'external' || timeValidation.error) return 0;
    if (!formStartTime || dateLabelsInRange.length === 0) return 0;
    const fakeSessions = dateLabelsInRange.map((dl, idx) => ({
      id: idx, date: dl, teacherName: '*', label: '', memo: '',
      startTime: formStartTime, endTime: formEndTime || undefined,
    }));
    return computeAutoNgEntries('*', fakeSessions, poolPeriods).size;
  }, [mode, formStartTime, formEndTime, dateLabelsInRange, poolPeriods, timeValidation.error]);

  // NG モード: 選択時限の派生 (teachers と同じ動的全選択パターン)
  const selectedPeriodIds = useMemo(() => {
    if (formPeriods.allMode) return poolPeriods.map(p => p.id);
    return poolPeriods.map(p => p.id).filter(id => formPeriods.ids.has(id));
  }, [poolPeriods, formPeriods]);
  const periodLabelsSelected = useMemo(
    () => poolPeriods.filter(p => selectedPeriodIds.includes(p.id)).map(p => p.label),
    [poolPeriods, selectedPeriodIds],
  );
  const isPeriodSelected = (id) =>
    formPeriods.allMode || formPeriods.ids.has(id);

  // canAdd は両モードで selectedTeacherNames を使って判定統一
  // (formTeacherNames.size と selectedTeacherIdxs.length の 1-render ズレ
  // による button 状態矛盾を防ぐ — code-review P2)。
  const canAddExternal =
    mode === 'external' &&
    selectedTeacherNames.length > 0 &&
    dateLabelsInRange.length > 0 &&
    timeValidation.error == null;
  const canApplyNg =
    mode === 'ng' &&
    selectedTeacherNames.length > 0 &&
    dateLabelsInRange.length > 0 &&
    periodLabelsSelected.length > 0;

  // ── teacher 選択ヘルパ ────────────────────
  // 個別 toggle: allMode のときは『all 以外を選択した状態』に切替えるため
  // 全名前から該当を除いた Set を manual で持つ。
  const toggleTeacher = (name) => {
    setFormTeachers(prev => {
      if (prev.allMode) {
        const allNames = project.teachers.map(t => t.name);
        const next = new Set(allNames.filter(n => n !== name));
        return { allMode: false, names: next };
      }
      const next = new Set(prev.names);
      if (next.has(name)) next.delete(name); else next.add(name);
      return { allMode: false, names: next };
    });
  };
  const selectAllTeachers = () => setFormTeachers({ allMode: true, names: new Set() });
  const clearAllTeachers = () => setFormTeachers({ allMode: false, names: new Set() });

  // ── period 選択ヘルパ (NG モード用、teacher と同形) ────
  const togglePeriod = (id) => {
    setFormPeriods(prev => {
      if (prev.allMode) {
        const allIds = poolPeriods.map(p => p.id);
        const next = new Set(allIds.filter(x => x !== id));
        return { allMode: false, ids: next };
      }
      const next = new Set(prev.ids);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { allMode: false, ids: next };
    });
  };
  const selectAllPeriods = () => setFormPeriods({ allMode: true, ids: new Set() });
  const clearAllPeriods = () => setFormPeriods({ allMode: false, ids: new Set() });

  // ── handleAdd (mode 別) ───────────────────
  const handleAddExternal = () => {
    if (!canAddExternal) return;
    const autoLabel = formStartTime
      ? (formEndTime ? `${formStartTime}-${formEndTime}` : formStartTime)
      : '';
    const items = [];
    for (const teacherName of selectedTeacherNames) {
      for (const dl of dateLabelsInRange) {
        items.push({
          date: dl, teacherName, label: autoLabel, memo: formMemo.trim(),
          startTime: formStartTime || undefined,
          endTime: formEndTime || undefined,
        });
      }
    }
    // N1i: reducer は内容が完全一致する既存セッションをスキップするので、
    // toast も実際の登録件数と重複スキップ件数を分けて出す (キーは reducer と同形)。
    const contentKey = (s) =>
      JSON.stringify([s.date, s.teacherName, s.label || '', s.memo || '', s.startTime || '', s.endTime || '']);
    const seen = new Set((project.externalSessions || []).map(contentKey));
    let added = 0;
    for (const it of items) {
      const key = contentKey(it);
      if (seen.has(key)) continue;
      seen.add(key);
      added++;
    }
    const skipped = items.length - added;
    addExternalSessions(items);
    if (added === 0) {
      showToast(`すべて登録済みの内容だったため追加しませんでした (${skipped} 件)`, 'warning', 3000);
    } else {
      showToast(
        skipped > 0
          ? `他学年セッション ${added} 件を登録しました (登録済み ${skipped} 件はスキップ)`
          : `他学年セッション ${added} 件を登録しました`,
        'success',
        3000,
      );
    }
    // 時刻・メモは clear (連打による重複登録を視覚的に防ぐ — code-review P2)。
    // 講師 / date range は連続追加用に残す。
    setFormStartTime('');
    setFormEndTime('');
    setFormMemo('');
  };

  const handleApplyNg = async (value) => {
    if (!canApplyNg) return;
    const teacherCount = selectedTeacherIdxs.length;
    const dayCount = dateLabelsInRange.length;
    const periodCount = periodLabelsSelected.length;
    // OK解除は destructive (既にある NG を消す方向) なので明示確認 —
    // 同じ teachers/dates/periods が selected のまま再クリックで silent に
    // 戻されるのを防ぐ (code-review P2)。
    if (!value) {
      const ok = await showConfirm(
        `${teacherCount} 名 × ${dayCount} 日 × ${periodCount} 時限 の NG を解除します。\nよろしいですか?`,
        { title: 'NG解除の確認', danger: true, confirmLabel: '解除する' },
      );
      if (!ok) return;
    }
    setNgBatch(selectedTeacherIdxs, dateLabelsInRange, periodLabelsSelected, value);
    showToast(
      value
        ? `${teacherCount}名 × ${dayCount}日 × ${periodCount}時限 を NG にしました`
        : `${teacherCount}名 × ${dayCount}日 × ${periodCount}時限 の NG を解除しました`,
      value ? 'warning' : 'success',
      3000,
    );
  };

  // ── 一括解除 (パネル全体) ────────────────────
  // 全講師の手動NG 総件数。0 のときはボタンを disabled にする。
  const manualNgTotal = useMemo(
    () => project.teachers.reduce((sum, t) => sum + (t.ngSlots?.length || 0), 0),
    [project.teachers],
  );

  // 手動NGのみ全解除 (自動NG = 他学年セッション由来は残る)。
  // 破壊的な全消し操作なので必ず showConfirm (danger) を挟む。
  const handleClearAllManualNg = async () => {
    if (manualNgTotal === 0) return;
    const ok = await showConfirm(
      `全講師の手動NG ${manualNgTotal} 件をすべて解除します。\n他学年セッション由来の自動NGは残ります。\nよろしいですか?`,
      { title: '手動NGの全解除', danger: true, confirmLabel: '全解除する' },
    );
    if (!ok) return;
    clearAllManualNg();
    showToast(`手動NG ${manualNgTotal} 件をすべて解除しました`, 'success', 3000);
  };

  // NG設定を全解除 (手動NG + 他学年セッション)。自動NGはセッションから
  // 導出されるため、消すには派生元のセッション自体の削除が必要になる。
  const handleClearAllNg = async () => {
    if (manualNgTotal === 0 && sessions.length === 0) return;
    const ok = await showConfirm(
      `すべてのNG設定を解除します。\n・手動NG ${manualNgTotal} 件\n・他学年セッション ${sessions.length} 件 (自動NGの派生元のため削除されます)\nよろしいですか?`,
      { title: 'NG設定の全解除', danger: true, confirmLabel: 'すべて解除する' },
    );
    if (!ok) return;
    clearAllNg();
    showToast(
      `手動NG ${manualNgTotal} 件と他学年セッション ${sessions.length} 件をすべて解除しました`,
      'success',
      3000,
    );
  };

  // プリセット適用 (他学年モードでのみ呼ばれる UI)
  // 日付は片方だけ解決成功して片方失敗するパターンを禁止 (silent な範囲拡張
  // を防ぐ — code-review P1)。両方解決した場合のみ両方更新する。
  const applyPreset = (presetId) => {
    if (!presetId) return;
    const p = presets.find(x => x.id === Number(presetId));
    if (!p) return;
    // F5l: 時刻・メモはプリセットの値で全置換する。フィールドを持たない
    // プリセットは空にする (部分上書きだと直前に適用したプリセットの
    // 終了時刻やメモが残留し、意図しない混成セッションが登録される)。
    // メモ未設定のプリセットはプリセット名をメモに使う — セッション一覧・
    // NG ツールチップ・講師別 Excel で「予備校か高校か」を判別できるように
    // する (メモ無しだと時刻しか情報が残らない)。
    setFormStartTime(p.startTime || '');
    setFormEndTime(p.endTime || '');
    setFormMemo(p.memo || p.name || '');
    const startD = p.startDateLabel ? poolDates.find(x => x.label === p.startDateLabel) : null;
    const endD = p.endDateLabel ? poolDates.find(x => x.label === p.endDateLabel) : null;
    if (p.startDateLabel && p.endDateLabel) {
      if (startD && endD) {
        setFormStartDateId(startD.id);
        setFormEndDateId(endD.id);
      } else {
        // 片方しか解決しない場合は両方触らず警告
        showToast(
          `プリセットの期間 (${p.startDateLabel}〜${p.endDateLabel}) が現在の日付設定に存在しないため、日付は適用しませんでした`,
          'warning', 4000,
        );
      }
    } else if (p.startDateLabel && startD) {
      // 開始のみ指定 (= 単日プリセット): start に揃え end も同じ日にする
      setFormStartDateId(startD.id);
      setFormEndDateId(startD.id);
    }
    // N4c: 対象講師を持つプリセットは講師選択も展開する (「予備校 = 毎回
    // 同じ講師群」の選び直しをなくす)。講師なしプリセットは選択を触らない。
    // マスタから消えた講師は無視して警告。
    if (Array.isArray(p.teachers) && p.teachers.length > 0) {
      const known = new Set(project.teachers.map(t => t.name));
      const found = p.teachers.filter(n => known.has(n));
      const missing = p.teachers.filter(n => !known.has(n));
      setFormTeachers({ allMode: false, names: new Set(found) });
      if (missing.length > 0) {
        showToast(
          `プリセットの講師のうち ${missing.join('・')} は講師マスタに存在しないため選択しませんでした`,
          'warning', 4000,
        );
      }
    }
  };

  // mode 切替時の state クリア。external モード固有の時刻 / メモが ng モード
  // 中も残り、戻ったとき stale な値で submit されるのを防ぐ (code-review P2)。
  // 共通の teachers / 期間 / period 選択は保持 (フォーム横断で使い回せる)。
  const handleModeChange = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    if (nextMode === 'ng') {
      // 他学年用フィールドは ng モードでは隠れるので clear
      setFormStartTime('');
      setFormEndTime('');
      setFormMemo('');
    }
  };

  // ── 折りたたみヘルパ ──────────────────────
  const toggleDate = (id) => setExpandedDates(prev => ({ ...prev, [id]: !prev[id] }));
  const expandAll = () => {
    const all = {};
    poolDates.forEach(d => { all[d.id] = true; });
    setExpandedDates(all);
  };
  const collapseAll = () => {
    const all = {};
    poolDates.forEach(d => { all[d.id] = false; });
    setExpandedDates(all);
  };

  // 時限の時刻読み取り可否 (注意書き用)
  const periodHasTime = (p) => getPeriodTimeRange(p) != null;
  const periodsMissingTime = poolPeriods.filter(p => !periodHasTime(p));

  // ── プリセット名のメモ後付け (既存セッション向け) ──
  // メモ未設定のセッションを時刻でプリセットと突き合わせる。プリセット名メモ
  // 対応以前の登録分に「予備校 / 高校」の判別を後から与えるための一括操作。
  const memoBackfill = useMemo(
    () => computePresetMemoBackfill(sessions, presets, project.dates || []),
    [sessions, presets, project.dates],
  );
  const handleApplyPresetMemos = () => {
    const n = memoBackfill.assignments.length;
    if (n === 0) return;
    applyPresetMemosToSessions();
    showToast(
      memoBackfill.ambiguousCount > 0
        ? `${n} 件のセッションにプリセット名をメモとして適用しました (複数プリセットに一致した ${memoBackfill.ambiguousCount} 件はスキップ)`
        : `${n} 件のセッションにプリセット名をメモとして適用しました`,
      'success',
      4000,
    );
  };

  // ── render ────────────────────────────────
  return (
    <div>
      <div className="bg-builder-info-soft p-3 mb-4 rounded text-sm text-builder-ink border border-builder-info-border">
        <strong>講師不在 + NG 設定:</strong><br />
        <strong>他学年セッション</strong> (予備校 / 高校等) を時刻付きで登録すると、
        重複時限が自動でNG扱いになります。<br />
        <strong>手動NG</strong> は時限指定で直接登録します (時刻不要)。<br />
        どちらも下の「📋 プリセット」「📅 日付ごとの設定」セクションで一覧・編集できます。
      </div>

      {/* NG 日時の CSV 一括登録 (E2a) */}
      <div className="mb-4">
        <NgCsvImport />
      </div>

      {/* プリセット管理 */}
      <PresetPanel
        presets={presets}
        dates={poolDates}
        addPreset={addExternalSessionPreset}
        updatePreset={updateExternalSessionPreset}
        removePreset={removeExternalSessionPreset}
        selectedTeacherNames={selectedTeacherNames}
      />

      {/* プリセット名のメモ後付け (メモ未設定の既存セッションがあるときだけ表示) */}
      {(memoBackfill.assignments.length > 0 || memoBackfill.ambiguousCount > 0) && (
        <div className="border border-builder-info-border bg-builder-info-soft rounded p-3 mb-4 text-xs text-builder-ink">
          <div className="mb-2">
            🏷 メモ未設定の他学年セッションのうち <strong>{memoBackfill.assignments.length} 件</strong> は、
            時刻がプリセットと一致するためプリセット名をメモとして後付けできます
            (予備校 / 高校の判別用。既存のメモは上書きしません。元に戻すには Undo)。
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleApplyPresetMemos}
              disabled={memoBackfill.assignments.length === 0}
              className="px-3 py-1 bg-builder-blue text-white rounded text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
            >
              プリセット名をメモに一括適用 ({memoBackfill.assignments.length}件)
            </button>
            {memoBackfill.ambiguousCount > 0 && (
              <span className="text-builder-orange">
                ⚠ {memoBackfill.ambiguousCount} 件は同時刻のプリセットが複数あり判別できないため対象外です
              </span>
            )}
          </div>
        </div>
      )}

      {/* 統合一括登録フォーム */}
      <div className="border border-builder-ink-ghost rounded p-3 bg-builder-surface-alt mb-4">
        <div className="font-bold text-builder-ink mb-2">📝 まとめて登録</div>

        {/* モード切替 */}
        <div className="flex flex-wrap gap-2 mb-3" role="radiogroup" aria-label="登録モード">
          <label className={`flex items-center gap-1 px-3 py-1 rounded cursor-pointer text-xs ${mode === 'external' ? 'bg-builder-info-soft border-2 border-builder-blue text-builder-ink font-bold' : 'bg-builder-surface border border-builder-ink-ghost text-builder-ink'}`}>
            <input type="radio" name="absence-ng-mode" value="external" checked={mode === 'external'} onChange={() => handleModeChange('external')} />
            📅 他学年セッション (時刻あり)
          </label>
          <label className={`flex items-center gap-1 px-3 py-1 rounded cursor-pointer text-xs ${mode === 'ng' ? 'bg-builder-danger-soft border-2 border-builder-red text-builder-ink font-bold' : 'bg-builder-surface border border-builder-ink-ghost text-builder-ink'}`}>
            <input type="radio" name="absence-ng-mode" value="ng" checked={mode === 'ng'} onChange={() => handleModeChange('ng')} />
            🚫 手動NG (時限指定)
          </label>
        </div>

        {/* プリセット選択 (他学年モード時のみ表示) — controlled。
            旧コードは defaultValue + 直接 DOM mutation でリセットしていたが、
            条件 remount で stale な選択が再出現するリスクがあったため controlled に
            (code-review P3)。 */}
        {mode === 'external' && presets.length > 0 && (
          <div className="mb-3 flex items-center gap-2 text-xs">
            <span className="text-builder-ink-muted shrink-0">プリセット:</span>
            <select
              value=""
              onChange={(e) => applyPreset(e.target.value)}
              className="flex-1 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
              aria-label="プリセットを選んで時刻・期間・メモをフォームに展開"
            >
              <option value="">— プリセットを選んで適用 —</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>{formatPresetSummary(p)}</option>
              ))}
            </select>
          </div>
        )}

        {/* 講師選択 (共通) */}
        <div className="flex flex-col gap-1 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-builder-ink-muted">
              講師 (複数選択可) — 選択 {selectedTeacherNames.length} 名
              {formTeachers.allMode && (
                <span className="ml-1 text-builder-blue font-bold">[全講師 (動的)]</span>
              )}
            </span>
            <div className="flex gap-1">
              <button type="button" onClick={selectAllTeachers}
                className="text-xs px-2 py-0.5 border border-builder-ink-ghost rounded bg-builder-surface hover:bg-builder-bg text-builder-ink">
                全選択
              </button>
              <button type="button" onClick={clearAllTeachers}
                className="text-xs px-2 py-0.5 border border-builder-ink-ghost rounded bg-builder-surface hover:bg-builder-bg text-builder-ink">
                全解除
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {teacherGroups.map(group => {
              const allSelected = group.teachers.every(t => isTeacherSelected(t.name));
              const toggleGroup = () => {
                setFormTeachers(prev => {
                  if (prev.allMode) {
                    // allMode のとき: グループ内を抜く = manual {全 - group}
                    const allNames = project.teachers.map(t => t.name);
                    const exclude = new Set(group.teachers.map(t => t.name));
                    return { allMode: false, names: new Set(allNames.filter(n => !exclude.has(n))) };
                  }
                  const isAll = group.teachers.every(t => prev.names.has(t.name));
                  const next = new Set(prev.names);
                  if (isAll) group.teachers.forEach(t => next.delete(t.name));
                  else group.teachers.forEach(t => next.add(t.name));
                  return { allMode: false, names: next };
                });
              };
              return (
                <div key={group.key}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold text-builder-ink-muted">━ {group.label} ({group.teachers.length})</span>
                    <button
                      type="button"
                      onClick={toggleGroup}
                      className="text-[10px] px-1.5 py-0 border border-builder-ink-ghost rounded bg-builder-surface hover:bg-builder-bg text-builder-ink-muted"
                    >
                      {allSelected ? 'このグループを解除' : 'このグループを選択'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.teachers.map(t => {
                      const checked = isTeacherSelected(t.name);
                      return (
                        <label
                          key={t.name}
                          className={`flex items-center gap-1 px-2 py-1 border rounded cursor-pointer text-xs ${checked ? 'bg-builder-info-soft border-builder-blue text-builder-ink font-bold' : 'bg-builder-surface border-builder-ink-ghost text-builder-ink hover:bg-builder-bg'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTeacher(t.name)}
                            aria-label={`${t.name} を対象に含める`}
                          />
                          <span>{t.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 期間 (共通) */}
        <div className="flex flex-col gap-1 text-xs mb-3 max-w-md">
          <span className="text-builder-ink-muted">期間 (開始日〜終了日)</span>
          <div className="flex items-center gap-1">
            <select
              value={formStartDateId ?? ''}
              onChange={(e) => setFormStartDateId(Number(e.target.value))}
              className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
              aria-label="開始日"
            >
              {poolDates.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            <span className="text-builder-ink-muted shrink-0">〜</span>
            <select
              value={formEndDateId ?? ''}
              onChange={(e) => setFormEndDateId(Number(e.target.value))}
              className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
              aria-label="終了日"
            >
              {poolDates.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
        </div>

        {/* mode 別: 時刻 OR 時限 */}
        {mode === 'external' ? (
          <>
            <div className="flex flex-col gap-1 text-xs mb-2 max-w-md">
              <span className="text-builder-ink-muted">時刻 (重複時限を自動NG)</span>
              <div className="flex items-center gap-1">
                <input
                  type="time"
                  step={TIME_STEP_SEC}
                  value={formStartTime}
                  onChange={(e) => setFormStartTime(e.target.value)}
                  className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
                  aria-label="開始時刻"
                />
                <span className="text-builder-ink-muted shrink-0">〜</span>
                <input
                  type="time"
                  step={TIME_STEP_SEC}
                  value={formEndTime}
                  onChange={(e) => setFormEndTime(e.target.value)}
                  className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
                  aria-label="終了時刻"
                />
              </div>
            </div>
            <label className="flex flex-col gap-1 text-xs mb-3 max-w-md">
              <span className="text-builder-ink-muted">メモ (任意)</span>
              <input
                type="text"
                value={formMemo}
                onChange={(e) => setFormMemo(e.target.value)}
                placeholder="予備校 / 高2 英語 等"
                className="border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
              />
            </label>
          </>
        ) : (
          <div className="flex flex-col gap-1 text-xs mb-3">
            <div className="flex items-center justify-between max-w-md">
              <span className="text-builder-ink-muted">
                時限 (選択 {selectedPeriodIds.length} / {poolPeriods.length})
                {formPeriods.allMode && (
                  <span className="ml-1 text-builder-blue font-bold">[全時限 (動的)]</span>
                )}
              </span>
              <div className="flex gap-1">
                <button type="button" onClick={selectAllPeriods}
                  className="text-xs px-2 py-0.5 border border-builder-ink-ghost rounded bg-builder-surface hover:bg-builder-bg text-builder-ink">
                  全選択
                </button>
                <button type="button" onClick={clearAllPeriods}
                  className="text-xs px-2 py-0.5 border border-builder-ink-ghost rounded bg-builder-surface hover:bg-builder-bg text-builder-ink">
                  全解除
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {poolPeriods.map(p => (
                <label key={p.id}
                  className={`flex items-center gap-1 px-2 py-1 border rounded cursor-pointer text-xs ${isPeriodSelected(p.id) ? 'bg-builder-info-soft border-builder-blue text-builder-ink font-bold' : 'bg-builder-surface border-builder-ink-ghost text-builder-ink hover:bg-builder-bg'}`}>
                  <input
                    type="checkbox"
                    checked={isPeriodSelected(p.id)}
                    onChange={() => togglePeriod(p.id)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* アクション + プレビュー */}
        <div className="flex flex-wrap gap-2 items-center">
          {mode === 'external' ? (
            <button
              type="button"
              onClick={handleAddExternal}
              disabled={!canAddExternal}
              className="px-3 py-1 bg-builder-primary text-white rounded text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
            >
              他学年セッションとして追加
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleApplyNg(true)}
                disabled={!canApplyNg}
                className="px-3 py-1 bg-builder-red text-white rounded text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              >
                まとめてNGにする
              </button>
              <button
                type="button"
                onClick={() => handleApplyNg(false)}
                disabled={!canApplyNg}
                className="px-3 py-1 bg-builder-surface border border-builder-ink-ghost text-builder-ink rounded text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-builder-bg"
              >
                まとめてOKに解除
              </button>
            </>
          )}
          {timeValidation.error && (
            <span className="text-xs text-builder-red font-bold">⚠️ {timeValidation.error}</span>
          )}
          {mode === 'external' && canAddExternal && (
            <span className="text-xs text-builder-ink-muted">
              対象: {selectedTeacherNames.length}名 × {dateLabelsInRange.length}日 = {selectedTeacherNames.length * dateLabelsInRange.length} 件
              {formStartTime && (
                <>
                  {' / '}
                  {previewPerTeacherNgCount > 0
                    ? <>→ 自動NG {selectedTeacherNames.length * previewPerTeacherNgCount} 件</>
                    : <span className="text-builder-orange">→ 重複する時限なし</span>}
                </>
              )}
            </span>
          )}
          {mode === 'ng' && canApplyNg && (
            <span className="text-xs text-builder-ink-muted">
              対象: {selectedTeacherIdxs.length}名 × {dateLabelsInRange.length}日 × {periodLabelsSelected.length}時限
            </span>
          )}
        </div>

        {mode === 'external' && periodsMissingTime.length > 0 && (
          <div className="text-[11px] text-builder-orange mt-2">
            ⚠️ 時刻が読み取れない時限: {periodsMissingTime.map(p => p.label).join(', ')}
            {' '}(「1限 (13:00~13:45)」のように時刻を入れると自動NG対象に)
          </div>
        )}
      </div>

      {/* 一括解除 (パネル全体) — どちらも確認ダイアログ付きの破壊的操作 */}
      <div className="border border-builder-ink-ghost rounded p-3 bg-builder-surface-alt mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-builder-ink shrink-0">🧹 一括解除:</span>
          <button
            type="button"
            onClick={handleClearAllManualNg}
            disabled={manualNgTotal === 0}
            className="px-3 py-1 bg-builder-surface border border-builder-red text-builder-red rounded text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-builder-danger-soft"
          >
            すべての手動NGを解除 ({manualNgTotal}件)
          </button>
          <button
            type="button"
            onClick={handleClearAllNg}
            disabled={manualNgTotal === 0 && sessions.length === 0}
            className="px-3 py-1 bg-builder-red text-white rounded text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
          >
            すべてのNG設定を解除 (手動NG {manualNgTotal}件 + 他学年 {sessions.length}件)
          </button>
        </div>
        <div className="text-[11px] text-builder-ink-muted mt-1">
          自動NGは他学年セッションから導出されるため、NG設定の全解除では他学年セッションも削除されます
          (プリセットと数値入力の記録は残ります)
        </div>
      </div>

      {/* 日付ごとの折りたたみセクション */}
      <div className="mb-2 flex justify-between items-center">
        <div className="font-bold text-builder-ink text-sm">📅 日付ごとの設定</div>
        <div className="flex gap-2">
          <button onClick={expandAll} className="text-xs px-2 py-1 bg-builder-surface-alt border border-builder-border rounded hover:bg-builder-bg text-builder-ink">すべて展開</button>
          <button onClick={collapseAll} className="text-xs px-2 py-1 bg-builder-surface-alt border border-builder-border rounded hover:bg-builder-bg text-builder-ink">すべて折りたたむ</button>
        </div>
      </div>
      <div className="space-y-2 mb-4">
        {poolDates.map(d => (
          <DateSection
            key={d.id}
            date={d}
            expanded={expandedDates[d.id] !== false}
            onToggle={() => toggleDate(d.id)}
            periods={poolPeriods}
            teacherGroups={teacherGroups}
            teacherIdxByName={teacherIdxByName}
            autoNgByTeacher={autoNgByTeacher}
            sessions={sessionsByDate.get(d.label) || []}
            removeExternalSession={removeExternalSession}
            toggleTeacherNg={toggleTeacherNg}
            ngCount={ngCountByDate[d.id] || 0}
          />
        ))}
      </div>

      {/* クイック数値入力グリッド (折りたたみ・最下部) */}
      <div className="border border-builder-ink-ghost rounded mb-4 bg-builder-surface-alt">
        <button
          type="button"
          onClick={() => setQuickGridExpanded(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm font-bold text-left text-builder-ink hover:bg-builder-bg"
        >
          <span>
            <span className="mr-1">{quickGridExpanded ? '▼' : '▶'}</span>
            🧮 クイック数値入力 (他学年コマ数のみ)
          </span>
          <span className="text-xs text-builder-ink-muted font-normal">
            時刻を伴わない『他学年でN コマ』だけの記録に。詳細セッションがあるセルは件数を表示
          </span>
        </button>
        {quickGridExpanded && (
          <div className="p-3 border-t border-builder-ink-ghost overflow-x-auto">
            <div className="text-xs text-builder-ink-muted mb-2">
              詳細セッション (時刻付き) を登録している場合はそちらが優先。ここでは数字だけの粗い管理に使います。
            </div>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-builder-border p-2 bg-builder-bg min-w-[100px] sticky left-0 z-10 text-builder-ink">講師名</th>
                  {poolDates.map(d => <th key={d.id} className="border border-builder-border p-2 bg-builder-bg min-w-[60px] text-center text-builder-ink">{d.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {teacherGroups.map(group => (
                  <Fragment key={group.key}>
                    <tr className="bg-builder-bg">
                      <td colSpan={1 + poolDates.length} className="border border-builder-border px-2 py-1 text-xs font-bold text-builder-ink-muted sticky left-0 z-10">
                        ━━ {group.label} ━━
                      </td>
                    </tr>
                    {group.teachers.map(t => (
                      <tr key={t.name}>
                        <td className="border border-builder-border p-2 font-bold bg-builder-surface-alt sticky left-0 z-10 text-builder-ink">{t.name}</td>
                        {poolDates.map(d => {
                          const k = makeExternalKey(d.label, t.name);
                          const sessionCnt = sessionCountMap[k];
                          if (sessionCnt) {
                            return (
                              <td key={d.id} className="border border-builder-border p-2 text-center bg-builder-info-soft text-builder-ink"
                                title="詳細セッション登録あり (上の日付別セクションで編集)">
                                {sessionCnt}
                              </td>
                            );
                          }
                          return (
                            <td key={d.id} className="border border-builder-border p-0">
                              <DraftNumberInput
                                min="0"
                                className="w-full h-full p-2 text-center focus:bg-builder-info-soft focus:outline-none text-builder-ink"
                                aria-label={`${d.label} の ${t.name} の外部コマ数`}
                                // `?? ''` で 0 を空表示に潰さない (明示的に 0 と
                                // 入力したセルと未入力セルを区別する — code-review P4)
                                value={project.externalCounts?.[k] ?? ""}
                                placeholder="-"
                                onCommit={(v) => handleExternalCountChange(d.label, t.name, v)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 日付ごとのセクション ────────────────────
// 1 日分の (a) 他学年セッション一覧 + (b) NG マトリクス (講師×時限) を表示。
// expanded=false なら header だけ。
function DateSection({
  date, expanded, onToggle,
  periods, teacherGroups, teacherIdxByName, autoNgByTeacher,
  sessions, removeExternalSession,
  toggleTeacherNg, ngCount,
}) {
  return (
    <div className="border border-builder-border rounded overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-builder-surface-alt hover:bg-builder-bg text-sm font-bold text-left text-builder-ink"
      >
        <span>
          <span className="mr-1">{expanded ? '▼' : '▶'}</span>
          {date.label}
        </span>
        <span className="flex items-center gap-2 text-xs font-normal">
          {sessions.length > 0 && (
            <span className="bg-builder-info-soft text-builder-ink px-1.5 py-0.5 rounded">他学年 {sessions.length}件</span>
          )}
          {ngCount > 0 && (
            <span className="bg-builder-red text-white px-1.5 py-0.5 rounded">NG {ngCount}件</span>
          )}
        </span>
      </button>
      {expanded && (
        <div className="bg-builder-surface">
          {/* 他学年セッション (この日) */}
          <div className="px-3 py-2 border-b border-builder-border">
            <div className="text-xs font-bold text-builder-ink-muted mb-1">
              📅 他学年セッション ({sessions.length}件)
            </div>
            {sessions.length === 0 ? (
              <div className="text-[11px] text-builder-ink-muted italic">
                この日の他学年セッションはまだ登録されていません。上の『まとめて登録』からどうぞ。
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink text-left">講師</th>
                      <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink">時刻</th>
                      <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink">メモ</th>
                      <th className="border border-builder-ink-ghost p-1 bg-builder-bg w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map(s => {
                      const timeText = s.startTime
                        ? (s.endTime ? `${s.startTime}〜${s.endTime}` : `${s.startTime}〜`)
                        : (s.label || '-');
                      return (
                        <tr key={s.id}>
                          <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink font-bold">{s.teacherName}</td>
                          <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink">{timeText}</td>
                          <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink">{s.memo || '-'}</td>
                          <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-center">
                            <button
                              type="button"
                              onClick={() => removeExternalSession(s.id)}
                              aria-label={`${s.date} ${s.teacherName} のセッションを削除`}
                              className="text-builder-red hover:text-builder-red-hover font-bold"
                            >×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* NG マトリクス (講師×時限) */}
          <div className="px-3 py-2">
            <div className="text-xs font-bold text-builder-ink-muted mb-1">
              🚫 NG マトリクス — クリックで切替 (NG=赤 / 自=自動NG / 空=OK)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs whitespace-nowrap">
                <thead>
                  <tr>
                    <th className="border border-builder-ink-ghost p-2 bg-builder-surface-alt sticky left-0 z-10 text-builder-ink">講師名</th>
                    {periods.map(p => (
                      <th key={p.id} className="border border-builder-ink-ghost p-1 bg-builder-surface-alt font-normal min-w-[60px] text-center text-builder-ink">{p.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teacherGroups.map(group => (
                    <Fragment key={group.key}>
                      <tr className="bg-builder-bg">
                        <td
                          colSpan={1 + periods.length}
                          className="border border-builder-ink-ghost px-2 py-1 text-[11px] font-bold text-builder-ink-muted sticky left-0 z-10"
                        >
                          ━━ {group.label} ━━
                        </td>
                      </tr>
                      {group.teachers.map(t => {
                        const idx = teacherIdxByName.get(t.name);
                        const autoEntries = autoNgByTeacher?.get(t.name);
                        return (
                          <tr key={t.name}>
                            <td className="border border-builder-ink-ghost p-2 font-bold bg-builder-surface-alt sticky left-0 z-10 text-builder-ink">{t.name}</td>
                            {periods.map(p => {
                              const k = makeNgKey(date.label, p.label);
                              const isManualNg = t.ngSlots?.includes(k);
                              const autoEntry = autoEntries?.get(k);
                              const isAutoNg = !!autoEntry;
                              const cellClass = isManualNg
                                ? 'bg-builder-red text-white font-bold'
                                : isAutoNg
                                  ? 'bg-builder-border text-builder-ink-muted italic'
                                  : 'bg-builder-surface';
                              const tooltipParts = [];
                              if (isManualNg) tooltipParts.push('手動NG');
                              if (isAutoNg) {
                                const memos = autoEntry.sessions
                                  .map(s => {
                                    const timeText = s.startTime
                                      ? (s.endTime ? `${s.startTime}〜${s.endTime}` : `${s.startTime}〜`)
                                      : (s.label || '');
                                    return s.memo ? `${s.memo} (${timeText})` : timeText;
                                  })
                                  .filter(Boolean)
                                  .join(', ');
                                tooltipParts.push(`自動NG (他学年: ${memos})`);
                              }
                              // F2a: td onClick だけだとキーボード到達不能。
                              // role="button" + tabIndex + Enter/Space で
                              // toggle できるようにする (click と同経路)。
                              const toggle = () => toggleTeacherNg(idx, date.label, p.label);
                              return (
                                <td
                                  key={p.id}
                                  role="button"
                                  tabIndex={0}
                                  aria-pressed={!!isManualNg}
                                  aria-label={`${t.name} ${date.label} ${p.label} の手動NG${isAutoNg ? ' (自動NGあり)' : ''}`}
                                  onClick={toggle}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      toggle();
                                    }
                                  }}
                                  title={tooltipParts.join(' / ') || undefined}
                                  className={`border border-builder-ink-ghost p-1 text-center cursor-pointer hover:opacity-80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-builder-blue focus-visible:ring-inset ${cellClass}`}
                                >
                                  {isManualNg ? 'NG' : isAutoNg ? '自' : ''}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── プリセット管理 (折りたたみ式) ─────────────────
// 旧 ExternalCounts.jsx 内の PresetPanel をそのまま流用。
function PresetPanel({ presets, dates, addPreset, updatePreset, removePreset, selectedTeacherNames = [] }) {
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState(null);
  // F5m: 期間は「なし (null)」を第一級で扱う。旧実装は blankDraft / 編集
  // fallback がプール先頭日に snap していたため、期間なしプリセットを
  // 改名だけして保存すると先頭日の期間が勝手に付与された。
  // N4c: teachers は空配列 = 「講師なし (適用時に講師選択を触らない)」。
  const blankDraft = () => ({
    name: '', startTime: '', endTime: '',
    startDateId: null,
    endDateId: null,
    memo: '',
    teachers: [],
  });
  // lazy init (毎レンダーで blankDraft() を呼ばないため — code-review P3)
  const [draft, setDraft] = useState(() => blankDraft());

  useEffect(() => {
    const ids = dates.map(d => d.id);
    setDraft(d => {
      // null は「期間なし」として常に valid (F5m)
      const startOk = d.startDateId == null || ids.includes(d.startDateId);
      const endOk = d.endDateId == null || ids.includes(d.endDateId);
      if (startOk && endOk) return d;
      // プールから消えた id は「期間なし」へ倒す (先頭日への silent snap を
      // やめ、意図しない期間の付与を防ぐ)
      return {
        ...d,
        startDateId: startOk ? d.startDateId : null,
        endDateId: endOk ? d.endDateId : null,
      };
    });
  }, [dates]);

  const startEdit = (p) => {
    setEditingId(p.id);
    setDraft({
      name: p.name,
      startTime: p.startTime || '',
      endTime: p.endTime || '',
      // 期間なし / プール外ラベルは null (期間なし) として編集する。
      // 先頭日への fallback は「編集を開いただけで期間が化ける」原因 (F5m)。
      startDateId: dates.find(d => d.label === p.startDateLabel)?.id ?? null,
      endDateId: dates.find(d => d.label === p.endDateLabel)?.id ?? null,
      memo: p.memo || '',
      teachers: Array.isArray(p.teachers) ? [...p.teachers] : [],
    });
    setExpanded(true);
  };
  const cancelEdit = () => { setEditingId(null); setDraft(blankDraft()); };

  // プリセットを複製。時刻 / 期間 / メモはそのまま、名前に「 (コピー)」を
  // 付けて即追加する (preset/add の自動採番に乗せる)。頻出パターンの
  // 微調整版を作るときの手間を省く。
  const duplicatePreset = (p) => {
    addPreset({
      name: `${p.name} (コピー)`,
      startTime: p.startTime || '',
      endTime: p.endTime || '',
      startDateLabel: p.startDateLabel || '',
      endDateLabel: p.endDateLabel || '',
      memo: p.memo || '',
      teachers: Array.isArray(p.teachers) ? [...p.teachers] : [],
    });
  };

  const draftValidation = useMemo(() => {
    if (!draft.name.trim()) return '名前を入力してください';
    const sMin = draft.startTime ? parseHHmm(draft.startTime) : null;
    const eMin = draft.endTime ? parseHHmm(draft.endTime) : null;
    if (!draft.startTime && draft.endTime) return '終了時刻だけでなく開始時刻も入力してください';
    if (draft.startTime && sMin == null) return '開始時刻が不正な形式です';
    if (draft.endTime && eMin == null) return '終了時刻が不正な形式です';
    if (sMin != null && eMin != null && sMin >= eMin) return '開始時刻は終了時刻より前にしてください';
    return null;
  }, [draft]);

  const saveDraft = () => {
    if (draftValidation) return;
    const startDateLabel = dates.find(d => d.id === draft.startDateId)?.label;
    const endDateLabel = dates.find(d => d.id === draft.endDateId)?.label;
    const payload = {
      name: draft.name.trim(),
      startTime: draft.startTime || '',
      endTime: draft.endTime || '',
      startDateLabel: startDateLabel || '',
      endDateLabel: endDateLabel || '',
      memo: draft.memo.trim(),
      teachers: draft.teachers,
    };
    if (editingId == null) addPreset(payload);
    else updatePreset(editingId, payload);
    cancelEdit();
  };

  return (
    <div className="border border-builder-ink-ghost rounded mb-4 bg-builder-surface-alt">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-bold text-left text-builder-ink hover:bg-builder-bg"
      >
        <span>
          <span className="mr-1">{expanded ? '▼' : '▶'}</span>
          📋 プリセット管理 ({presets.length})
        </span>
        <span className="text-xs text-builder-ink-muted font-normal">
          頻出パターン (例: 予備校 12:25-13:35) を登録すると 1 クリックで展開できます
        </span>
      </button>
      {expanded && (
        <div className="p-3 border-t border-builder-ink-ghost">
          {presets.length === 0 ? (
            <div className="text-xs text-builder-ink-muted italic mb-3">
              まだプリセットがありません。下のフォームから登録してください。
            </div>
          ) : (
            <div className="overflow-x-auto mb-3">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink text-left">名前</th>
                    <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink">時刻</th>
                    <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink">期間</th>
                    <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink">メモ</th>
                    <th className="border border-builder-ink-ghost p-1 bg-builder-bg text-builder-ink">講師</th>
                    <th className="border border-builder-ink-ghost p-1 bg-builder-bg w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {presets.map(p => (
                    <tr key={p.id} className={editingId === p.id ? 'bg-builder-info-soft' : ''}>
                      <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink font-bold">{p.name}</td>
                      <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink">
                        {p.startTime ? (p.endTime ? `${p.startTime}〜${p.endTime}` : `${p.startTime}〜`) : '-'}
                      </td>
                      <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink">
                        {p.startDateLabel ? (p.endDateLabel && p.endDateLabel !== p.startDateLabel ? `${p.startDateLabel}〜${p.endDateLabel}` : p.startDateLabel) : '-'}
                      </td>
                      <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink">{p.memo || '-'}</td>
                      <td
                        className="border border-builder-ink-ghost p-1 bg-builder-surface text-builder-ink"
                        title={Array.isArray(p.teachers) && p.teachers.length > 0 ? p.teachers.join('・') : undefined}
                      >
                        {Array.isArray(p.teachers) && p.teachers.length > 0 ? `${p.teachers.length}名` : '-'}
                      </td>
                      <td className="border border-builder-ink-ghost p-1 bg-builder-surface text-center whitespace-nowrap">
                        <button type="button" onClick={() => startEdit(p)}
                          className="text-builder-blue hover:underline text-[11px] mr-2"
                          aria-label={`${p.name} を編集`}>編集</button>
                        <button type="button" onClick={() => duplicatePreset(p)}
                          className="text-builder-ink hover:underline text-[11px] mr-2"
                          aria-label={`${p.name} を複製`}>複製</button>
                        <button type="button" onClick={() => removePreset(p.id)}
                          className="text-builder-red hover:underline text-[11px]"
                          aria-label={`${p.name} を削除`}>削除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="bg-builder-surface border border-builder-ink-ghost rounded p-3">
            <div className="font-bold text-builder-ink text-xs mb-2">
              {editingId == null ? '新規プリセットを追加' : `プリセットを編集 (id ${editingId})`}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-builder-ink-muted">名前 *</span>
                <input type="text" value={draft.name}
                  onChange={(e) => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="予備校（早朝）"
                  className="border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-builder-ink-muted">メモ (任意)</span>
                <input type="text" value={draft.memo}
                  onChange={(e) => setDraft(d => ({ ...d, memo: e.target.value }))}
                  placeholder="予備校 / 高2 英語 等"
                  className="border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink" />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-builder-ink-muted">期間 (任意)</span>
                <div className="flex items-center gap-1">
                  <select value={draft.startDateId ?? ''}
                    onChange={(e) => setDraft(d => {
                      const v = e.target.value === '' ? null : Number(e.target.value);
                      // 開始なし → 終了もなし (orphan endDate を作らない)
                      return { ...d, startDateId: v, endDateId: v === null ? null : d.endDateId };
                    })}
                    className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
                    aria-label="プリセット開始日">
                    <option value="">期間なし</option>
                    {dates.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                  <span className="text-builder-ink-muted shrink-0">〜</span>
                  <select value={draft.endDateId ?? ''}
                    disabled={draft.startDateId == null}
                    onChange={(e) => setDraft(d => ({ ...d, endDateId: e.target.value === '' ? null : Number(e.target.value) }))}
                    className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
                    aria-label="プリセット終了日">
                    <option value="">終了日なし (単日)</option>
                    {dates.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-builder-ink-muted">時刻 (任意)</span>
                <div className="flex items-center gap-1">
                  <input type="time" step={TIME_STEP_SEC} value={draft.startTime}
                    onChange={(e) => setDraft(d => ({ ...d, startTime: e.target.value }))}
                    className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
                    aria-label="プリセット開始時刻" />
                  <span className="text-builder-ink-muted shrink-0">〜</span>
                  <input type="time" step={TIME_STEP_SEC} value={draft.endTime}
                    onChange={(e) => setDraft(d => ({ ...d, endTime: e.target.value }))}
                    className="flex-1 min-w-0 border border-builder-ink-ghost rounded px-2 py-1 bg-builder-surface text-builder-ink"
                    aria-label="プリセット終了時刻" />
                </div>
              </div>
            </div>
            {/* N4c: 対象講師 (任意)。「予備校 = 毎回同じ講師群」の適用時に
                講師を選び直す手間をなくす。上の講師チェックの選択状態から取り込む */}
            <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
              <span className="text-builder-ink-muted">対象講師 (任意):</span>
              {draft.teachers.length > 0 ? (
                <>
                  <span className="text-builder-ink" title={draft.teachers.join('・')}>
                    {draft.teachers.slice(0, 4).join('・')}{draft.teachers.length > 4 ? ` 他${draft.teachers.length - 4}名` : ''} ({draft.teachers.length}名)
                  </span>
                  <button type="button"
                    onClick={() => setDraft(d => ({ ...d, teachers: [] }))}
                    className="text-builder-red hover:underline"
                    aria-label="プリセットの対象講師をクリア">✕ クリア</button>
                </>
              ) : (
                <span className="text-builder-ink-ghost">なし (適用時に講師選択を変えません)</span>
              )}
              <button type="button"
                disabled={selectedTeacherNames.length === 0}
                onClick={() => setDraft(d => ({ ...d, teachers: [...selectedTeacherNames] }))}
                className="px-2 py-0.5 border border-builder-ink-ghost rounded text-builder-ink hover:bg-builder-bg disabled:opacity-40 disabled:cursor-not-allowed"
                title="上の「講師 (複数選択可)」で選択中の講師をこのプリセットの対象にします"
              >⬆ 選択中の講師をセット ({selectedTeacherNames.length}名)</button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <button type="button" onClick={saveDraft}
                disabled={draftValidation != null}
                className="px-3 py-1 bg-builder-primary text-white rounded text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90">
                {editingId == null ? 'プリセットを追加' : '変更を保存'}
              </button>
              {editingId != null && (
                <button type="button" onClick={cancelEdit}
                  className="px-3 py-1 border border-builder-ink-ghost bg-builder-surface text-builder-ink rounded text-xs hover:bg-builder-bg">
                  キャンセル
                </button>
              )}
              {draftValidation && (
                <span className="text-xs text-builder-red font-bold">⚠️ {draftValidation}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatPresetSummary(p) {
  const parts = [p.name];
  if (p.startTime) parts.push(p.endTime ? `${p.startTime}-${p.endTime}` : `${p.startTime}〜`);
  if (p.startDateLabel) {
    parts.push(
      p.endDateLabel && p.endDateLabel !== p.startDateLabel
        ? `${p.startDateLabel}〜${p.endDateLabel}`
        : p.startDateLabel,
    );
  }
  // N4c: 対象講師付きプリセットは適用ドロップダウンでも分かるようにする
  if (Array.isArray(p.teachers) && p.teachers.length > 0) parts.push(`講師${p.teachers.length}名`);
  return parts.join(' / ');
}
