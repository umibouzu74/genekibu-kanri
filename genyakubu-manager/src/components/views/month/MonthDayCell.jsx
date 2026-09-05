import { ADJ_COLOR, DAY_BG as DB, DAY_COLOR as DC, WEEKDAYS, gradeColor as GC } from "../../../data";
import { EXTRA_LESSON_COLOR, KOSHU_EXTERNAL_COLOR, KOSHU_LESSON_COLOR } from "../../../constants/colors";
import { biweeklyDisplaySubject, isBiweekly } from "../../../utils/biweekly";
import { buildSessionCountMap, formatSessionNumber } from "../../../utils/sessionCount";
import { classifyDayHolidays, describeHolidayTargets } from "../../../utils/scheduleHelpers";
import { cutoffShortText } from "../../../constants/cutoffMessages";
import { describeRescheduleTarget } from "../../../utils/adjustmentDisplay";
import { getDayCutoffKind } from "../../../utils/timetable";
import { resolveSlotDaySchedule } from "../../../utils/daySchedules";
import { specialEventTypeMeta } from "../../../constants/specialEvents";
import { subStateMeta, subTargetLabel } from "../../../utils/substituteState";
import { summarizeTeacherDayOff, teacherAwayReason } from "../../../utils/teacherDayOff";
import { timeStartToMin } from "../../../utils/dateHelpers";

// 講師別カレンダー (MonthView) の 1 日ぶんのセル (2026-09-05 に切り出し)。
// 月単位で作る索引・判定関数は MonthView が `ctx` にまとめて渡す (1 日ごとに
// 作り直さない)。カードは種類をまたいで開始時刻順 (dayCards / pushCards) —
// CLAUDE.md「講師別カレンダーのカードは開始時刻順」のとおり、カードを増やす
// ときは pushCards に載せること。

// 「この講師にとっては休みの日」のセル色と見出し色。理由ごとに既存の色を
// 使い回す (代行は依頼中=赤 / 確定=緑 と状態で色が変わるので、日単位では
// 中立の青にする)。
const DAY_OFF_TONE = {
  absent: { bg: "#fdeeee", fg: "#c03030" },
  sub: { bg: "#eaf1f8", fg: "#2a5a8a" },
  combine: { bg: ADJ_COLOR.combine.bannerBg, fg: ADJ_COLOR.combine.deep },
  reschedule: {
    bg: ADJ_COLOR.reschedule.bannerBg,
    fg: ADJ_COLOR.reschedule.deep,
  },
  mixed: { bg: "#eef0f2", fg: "#5a6570" },
};

export function MonthDayCell({ d, ctx }) {
  const {
    absorbedByHostKey,
    activeGroupLabels,
    biweeklyAnchors,
    dayMap,
    daySchedules,
    displayCutoff,
    examPeriods,
    examPeriodsForDate,
    examPrepByDate,
    extraByDate,
    holMap,
    holidays,
    hostByAbsorbedKey,
    isAdmin,
    isTeacherAttending,
    koshuByDate,
    month,
    moveByKey,
    onEdit,
    onEditExtraLesson,
    rescheduleInByDate,
    rescheduleOutByKey,
    sessionCtx,
    showExam,
    showSpecial,
    slotById,
    specialEventsForDate,
    subForTeacher,
    teacher,
    teacherSubs,
    todayD,
    todayM,
    todayY,
    year,
  } = ctx;
  const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dow = new Date(year, month - 1, d).getDay();
  const dn = WEEKDAYS[dow];
  const hols = holMap[ds] || [];
  const { fullOff: isFullOff, offDepts, granularHols } = classifyDayHolidays(hols);
  const epActive = showExam ? examPeriodsForDate(ds) : [];
  const hasExam = epActive.length > 0;
  const evActive = showSpecial ? specialEventsForDate(ds) : [];
  const hasEvent = evActive.length > 0;
  const isT = todayY === year && todayM === month && todayD === d;
  const cutoffKind = getDayCutoffKind(ds, displayCutoff, { activeGroupLabels });
  const dayCutoff = cutoffKind != null;
  const sl = isFullOff || dayCutoff
    ? []
    : (dayMap[dn] || []).filter((s) => isTeacherAttending(s, ds));
  // 振替で当日に来る予定のコマ (この teacher が担当する分)。
  // adj.targetTeacher 指定時はその講師、未指定時は元 slot.teacher。
  // 休講日でも消さない (追加授業と同じく「その日にやる」と明示登録
  // したコマ。日まるごと振替の受け先は休講日になるのが典型なので、
  // ここで巻き添えにすると紙面にも画面にも出なくなる)。
  const incomingForDay = dayCutoff
    ? []
    : (rescheduleInByDate.get(ds) || [])
          .map((adj) => {
            const slot = slotById.get(adj.slotId);
            if (!slot) return null;
            const tgtTeacher = adj.targetTeacher || slot.teacher;
            if (tgtTeacher !== teacher) return null;
            return { adj, slot };
          })
          .filter(Boolean);
  // 追加授業 (この日付に単発で入るコマ、この teacher が担当する分)。
  // 休講日でも表示する (通常授業と違い「その日にやる」と明示的に
  // 登録した単発コマなので、休講の巻き添えで消さない)。
  const extraForDay = dayCutoff ? [] : extraByDate.get(ds) || [];
  // 講習コマ (講習時間割作成からの読み取り専用反映)。講習期間は
  // 通常時間割の表示範囲 (displayCutoff) の外になるのが常なので、
  // 追加授業と違いカットオフでも消さない。休講の巻き添えでも
  // 消さないのは追加授業と同じ (日付を明示して組んだコマのため)。
  const koshuForDay = koshuByDate.get(ds) || [];
  // この teacher が他人のコマを代行する行で使う slot も session count
  // の対象に含めるため、ここで抽出して結合した計算用リストを作る。
  // この teacher が「他人のコマ」を代行する分。カード表示と
  // session count の両方で使う。
  const externalSubsForDay = isFullOff
    ? []
    : teacherSubs.filter(
        (sub) =>
          sub.date === ds &&
          sub.substitute === teacher &&
          !sl.some((s) => s.id === sub.slotId)
      );
  const externalSubSlots = dayCutoff
    ? []
    : externalSubsForDay
        .map((sub) => slotById.get(sub.slotId))
        .filter(Boolean);
  const sessionCountMap =
    displayCutoff && (sl.length > 0 || externalSubSlots.length > 0)
      ? buildSessionCountMap([...sl, ...externalSubSlots], ds, sessionCtx)
      : null;
  // コマごとに「この講師の手を離れたか」と理由 (代行 / 合同 / 振替)。
  // カードの取消線と日単位の判定で同じ答えを使う。
  const awayReasonBySlot = new Map(
    sl.map((s) => [
      s.id,
      teacherAwayReason({
        teacher,
        sub: subForTeacher(ds, s.id),
        absorbed: hostByAbsorbedKey.has(`${ds}|${s.id}`),
        rescheduledOut: rescheduleOutByKey.get(`${ds}|${s.id}`),
      }),
    ])
  );
  // その日のコマが全部手を離れた = この講師にとっては休みの日。
  // カードの薄字だけだと月の一覧で「その日が空いた」ことに気付けない
  // ので、休講日と同じ強さで日単位の状態として見せる。
  const dayOff =
    isFullOff || dayCutoff
      ? { off: false, reason: null, label: "" }
      : summarizeTeacherDayOff(
          sl.map((s) => awayReasonBySlot.get(s.id)),
          incomingForDay.length +
            extraForDay.length +
            koshuForDay.length +
            externalSubSlots.length
        );
  const offTone = dayOff.off ? DAY_OFF_TONE[dayOff.reason] : null;
  // その日のカードは種類 (通常コマ / 他人のコマの代行 / 振替で入る
  // コマ / 追加授業 / 講習 / 特訓) をまたいで**開始時刻の早い順**に
  // 1 本に並べる。種類ごとに固めると 17:00 の代行が 19:40 の自分の
  // コマより後に出て、その日の動きが時系列で読めない。
  const dayCards = [];
  const pushCards = (times, els) => {
    els.forEach((el, i) => {
      if (!el) return;
      const time = times[i];
      dayCards.push({
        // 時刻を持たないカード (時限表記だけの講習コマ) は末尾へ。
        t: time ? timeStartToMin(time) : Number.MAX_SAFE_INTEGER,
        seq: dayCards.length,
        el,
      });
    });
  };
  // 通常コマ。移動・特別時程で時刻が読み替わるコマは読み替え後の
  // 時刻で並べる (カードに出ている時刻と並び順を一致させる)。
  pushCards(
    sl.map(
      (s) =>
        moveByKey.get(`${ds}|${s.id}`) ||
        resolveSlotDaySchedule(s, ds, daySchedules)?.time ||
        s.time
    ),
    sl.map((s) => {
      const gc = GC(s.grade);
      const sessionNum = sessionCountMap ? sessionCountMap.get(s.id) || 0 : 0;
      const sub = subForTeacher(ds, s.id);
      const st = sub ? subStateMeta(sub) : null;
      const hostSlotId = hostByAbsorbedKey.get(`${ds}|${s.id}`);
      const absorbed = hostSlotId != null;
      const hostSlot = absorbed ? slotById.get(hostSlotId) : null;
      const hostedIds = absorbedByHostKey.get(`${ds}|${s.id}`);
      const isHost = !absorbed && !!hostedIds;
      // 特別時程の時刻読み替え (個別 move 優先)。cancelled は
      // isTeacherAttending で除外済みなのでここには来ない。
      const dayScheduleMove = moveByKey.has(`${ds}|${s.id}`)
        ? null
        : resolveSlotDaySchedule(s, ds, daySchedules);
      const moveTarget =
        moveByKey.get(`${ds}|${s.id}`) || dayScheduleMove?.time;
      const rescheduledOut = rescheduleOutByKey.get(`${ds}|${s.id}`);
      // 「自分が不在」: 代行で別人が入る or 合同で吸収された or
      // 振替で他日へ。判定は日単位の休み判定と共有する。
      const awayReason = awayReasonBySlot.get(s.id);
      const away = !!awayReason;
      // 誰に / どこへ渡ったかをカードに出す (tooltip だけだと
      // 一覧を見ているときに気付けない)。
      const awayNote =
        awayReason === "absent"
          ? subTargetLabel(sub)
          : awayReason === "sub"
            ? `→ ${sub.substitute}`
            : awayReason === "combine"
            ? `→ ${hostSlot?.teacher || "?"} に合同`
            : awayReason === "reschedule"
              ? `→${describeRescheduleTarget(rescheduledOut, {
                  short: true,
                  originalTeacher: s.teacher,
                })}`
              : null;
      const awayNoteColor =
        awayReason === "absent" || awayReason === "sub"
          ? st?.color || "#2a5a8a"
          : awayReason === "combine"
            ? ADJ_COLOR.combine.deep
            : ADJ_COLOR.reschedule.deep;
      // カード全体の色: absorbed > rescheduledOut > sub > 曜日色
      const cardBg = absorbed
        ? ADJ_COLOR.combine.bg
        : rescheduledOut
          ? ADJ_COLOR.reschedule.bg
          : sub
            ? st.bg
            : DB[s.day];
      const cardBorder = absorbed
        ? ADJ_COLOR.combine.color
        : rescheduledOut
          ? ADJ_COLOR.reschedule.color
          : sub
            ? st.color
            : DC[s.day];
      const displayTime = moveTarget
        ? moveTarget.split("-")[0]
        : s.time.split("-")[0];
      const badges = [];
      if (absorbed) badges.push({ label: "合", color: ADJ_COLOR.combine.color });
      if (isHost) badges.push({ label: "合+", color: ADJ_COLOR.combine.color });
      if (sub) badges.push({ label: "代", color: st.color });
      if (moveTarget) badges.push({ label: "移", color: ADJ_COLOR.move.color });
      if (rescheduledOut) {
        badges.push({ label: "振", color: ADJ_COLOR.reschedule.color });
      }
      const titleParts = [
        `${s.time} ${s.grade} ${s.subj} ${s.room || ""}`,
      ];
      if (moveTarget) {
        titleParts.push(
          dayScheduleMove?.time
            ? `[特別時程${dayScheduleMove.schedule?.label ? `: ${dayScheduleMove.schedule.label}` : ""}] ${s.time} → ${moveTarget}`
            : `[移動] ${s.time} → ${moveTarget}`
        );
      }
      if (rescheduledOut) {
        const tgt = [rescheduledOut.targetDate];
        if (rescheduledOut.targetTime) tgt.push(rescheduledOut.targetTime);
        if (rescheduledOut.targetTeacher) {
          tgt.push(`(${rescheduledOut.targetTeacher})`);
        }
        titleParts.push(`[振替] → ${tgt.join(" ")}`);
      }
      if (absorbed && hostSlot) {
        titleParts.push(
          `[合同] ${hostSlot.grade}${hostSlot.cls && hostSlot.cls !== "-" ? hostSlot.cls : ""} ${hostSlot.subj} に統合 (${hostSlot.teacher})`
        );
      }
      if (isHost && hostedIds) {
        const labels = hostedIds
          .map((id) => {
            const a = slotById.get(id);
            return a
              ? `${a.grade}${a.cls && a.cls !== "-" ? a.cls : ""} ${a.subj}`
              : `#${id}`;
          })
          .join(" / ");
        titleParts.push(`[合同ホスト] + ${labels}`);
      }
      if (sub) {
        titleParts.push(
          `[代行] ${sub.originalTeacher} → ${subTargetLabel(sub)} (${st.label})${sub.memo ? "\n" + sub.memo : ""}`
        );
      }
      if (isAdmin) titleParts.push("クリックで編集");
      const cardEditable = isAdmin && !!onEdit;
      return (
        <div
          key={`slot-${s.id}`}
          className="month-print-card"
          role={cardEditable ? "button" : undefined}
          tabIndex={cardEditable ? 0 : undefined}
          style={{
            fontSize: 11,
            lineHeight: 1.4,
            padding: "2px 3px",
            margin: "1px 0",
            borderRadius: 3,
            background: cardBg,
            borderLeft: `2px solid ${cardBorder}`,
            overflow: "hidden",
            textOverflow: "ellipsis",
            // 手を離れたコマは行き先 ("→8/28" / "→ 福江") を
            // 続けて出すので折り返す
            whiteSpace: away ? "normal" : "nowrap",
            cursor: cardEditable ? "pointer" : "default",
            opacity: away ? 0.55 : 1,
          }}
          onClick={() => cardEditable && onEdit(s)}
          onKeyDown={
            cardEditable
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEdit(s);
                  }
                }
              : undefined
          }
          title={titleParts.join("\n")}
        >
          {badges.map((b, i) => (
            <span
              key={`b-${i}`}
              style={{
                background: b.color,
                color: "#fff",
                fontSize: 8,
                fontWeight: 800,
                padding: "0 3px",
                borderRadius: 2,
                marginRight: 2,
              }}
            >
              {b.label}
            </span>
          ))}
          {sessionNum > 0 && (
            <span
              title={`第${sessionNum}回`}
              style={{
                background: "#3a6ea5",
                color: "#fff",
                fontSize: 8,
                fontWeight: 800,
                padding: "0 3px",
                borderRadius: 2,
                marginRight: 2,
              }}
            >
              {formatSessionNumber(sessionNum)}
            </span>
          )}
          <span
            style={{
              background: gc.b,
              color: gc.f,
              fontSize: 8,
              fontWeight: 700,
              padding: "0 3px",
              borderRadius: 2,
              marginRight: 2,
            }}
          >
            {s.grade}
            {s.cls && s.cls !== "-" ? s.cls : ""}
          </span>
          <span
            style={{
              textDecoration: away ? "line-through" : "none",
              color: away ? "#7a7a7a" : "inherit",
            }}
          >
            <b>{displayTime}</b>{" "}
            {isBiweekly(s.note)
              ? `${biweeklyDisplaySubject(s, ds, biweeklyAnchors, holidays, examPeriods)}（隔週）`
              : s.subj}
          </span>
          {awayNote && (
            <span
              style={{
                marginLeft: 3,
                fontWeight: 800,
                color: awayNoteColor,
              }}
            >
              {awayNote}
            </span>
          )}
        </div>
      );
    })
  );
  pushCards(
    externalSubsForDay.map((sub) => slotById.get(sub.slotId)?.time),
    externalSubsForDay.map((sub) => {
      const slot = slotById.get(sub.slotId);
      if (!slot) return null;
      const st = subStateMeta(sub);
      const gc = GC(slot.grade);
      const sessionNum = sessionCountMap
        ? sessionCountMap.get(slot.id) || 0
        : 0;
      return (
        <div
          key={`ext-${sub.id}`}
          className="month-print-card"
          style={{
            fontSize: 11,
            lineHeight: 1.4,
            padding: "2px 3px",
            margin: "1px 0",
            borderRadius: 3,
            background: st.bg,
            borderLeft: `2px solid ${st.color}`,
            overflow: "hidden",
            textOverflow: "ellipsis",
            // 「(◯◯ の代行)」を続けて出すので折り返す
            whiteSpace: "normal",
          }}
          title={`${slot.time} ${slot.grade} ${slot.subj} ${slot.room || ""}\n[代行] ${sub.originalTeacher}の代わりに担当 (${st.label})${sub.memo ? "\n" + sub.memo : ""}`}
        >
          <span
            style={{
              background: st.color,
              color: "#fff",
              fontSize: 8,
              fontWeight: 800,
              padding: "0 3px",
              borderRadius: 2,
              marginRight: 2,
            }}
          >
            代
          </span>
          {sessionNum > 0 && (
            <span
              title={`第${sessionNum}回`}
              style={{
                background: "#3a6ea5",
                color: "#fff",
                fontSize: 8,
                fontWeight: 800,
                padding: "0 3px",
                borderRadius: 2,
                marginRight: 2,
              }}
            >
              {formatSessionNumber(sessionNum)}
            </span>
          )}
          <span
            style={{
              background: gc.b,
              color: gc.f,
              fontSize: 8,
              fontWeight: 700,
              padding: "0 3px",
              borderRadius: 2,
              marginRight: 2,
            }}
          >
            {slot.grade}
            {slot.cls && slot.cls !== "-" ? slot.cls : ""}
          </span>
          <b>{slot.time.split("-")[0]}</b> {slot.subj}
          <span
            style={{
              marginLeft: 3,
              fontWeight: 700,
              color: st.color,
            }}
          >
            ({sub.originalTeacher} の代行)
          </span>
        </div>
      );
    })
  );
  pushCards(
    incomingForDay.map(({ adj, slot }) => adj.targetTime || slot.time),
    incomingForDay.map(({ adj, slot }) => {
      const gc = GC(slot.grade);
      const tgtTime = adj.targetTime || slot.time;
      return (
        <div
          key={`rsch-in-${adj.id}`}
          className="month-print-card"
          style={{
            fontSize: 11,
            lineHeight: 1.4,
            padding: "2px 3px",
            margin: "1px 0",
            borderRadius: 3,
            background: ADJ_COLOR.reschedule.bg,
            borderLeft: `2px solid ${ADJ_COLOR.reschedule.color}`,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={`[振替で当日担当] ${slot.grade}${
            slot.cls && slot.cls !== "-" ? slot.cls : ""
          } ${slot.subj} (${tgtTime})\n元: ${adj.date} ${slot.time}${
            adj.memo ? "\n" + adj.memo : ""
          }`}
        >
          <span
            style={{
              background: ADJ_COLOR.reschedule.color,
              color: "#fff",
              fontSize: 8,
              fontWeight: 800,
              padding: "0 3px",
              borderRadius: 2,
              marginRight: 2,
            }}
          >
            振
          </span>
          <span
            style={{
              background: gc.b,
              color: gc.f,
              fontSize: 8,
              fontWeight: 700,
              padding: "0 3px",
              borderRadius: 2,
              marginRight: 2,
            }}
          >
            {slot.grade}
            {slot.cls && slot.cls !== "-" ? slot.cls : ""}
          </span>
          <b>{tgtTime.split("-")[0]}</b> {slot.subj}
        </div>
      );
    })
  );
  pushCards(
    extraForDay.map((lesson) => lesson.time),
    extraForDay.map((lesson) => {
      const gc = GC(lesson.grade);
      const clickable = !!onEditExtraLesson;
      return (
        <div
          key={`extra-${lesson.id}`}
          className="month-print-card"
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={
            clickable ? () => onEditExtraLesson(lesson.id) : undefined
          }
          onKeyDown={
            clickable
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEditExtraLesson(lesson.id);
                  }
                }
              : undefined
          }
          style={{
            fontSize: 11,
            lineHeight: 1.4,
            padding: "2px 3px",
            margin: "1px 0",
            borderRadius: 3,
            background: EXTRA_LESSON_COLOR.bg,
            borderLeft: `2px solid ${EXTRA_LESSON_COLOR.color}`,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            cursor: clickable ? "pointer" : "default",
          }}
          title={`[追加授業${lesson.label ? `: ${lesson.label}` : ""}] ${lesson.grade}${
            lesson.cls && lesson.cls !== "-" ? lesson.cls : ""
          } ${lesson.subj} (${lesson.time})${
            lesson.room ? `\n教室: ${lesson.room}` : ""
          }${lesson.note ? "\n" + lesson.note : ""}${
            clickable ? "\n\nクリックで編集画面を開きます" : ""
          }`}
        >
          <span
            style={{
              background: EXTRA_LESSON_COLOR.color,
              color: "#fff",
              fontSize: 8,
              fontWeight: 800,
              padding: "0 3px",
              borderRadius: 2,
              marginRight: 2,
            }}
          >
            追
          </span>
          <span
            style={{
              background: gc.b,
              color: gc.f,
              fontSize: 8,
              fontWeight: 700,
              padding: "0 3px",
              borderRadius: 2,
              marginRight: 2,
            }}
          >
            {lesson.grade}
            {lesson.cls && lesson.cls !== "-" ? lesson.cls : ""}
          </span>
          <b>{lesson.time.split("-")[0]}</b> {lesson.subj}
        </div>
      );
    })
  );
  pushCards(
    koshuForDay.map((lesson) => lesson.time),
    koshuForDay.map((lesson) => {
      const external = lesson.kind === "external";
      const col = external ? KOSHU_EXTERNAL_COLOR : KOSHU_LESSON_COLOR;
      const gc = GC(lesson.grade);
      const startText = lesson.time
        ? lesson.time.split("-")[0]
        : lesson.periodLabel;
      // 回数連番 (①②… = そのクラスでその科目が何回目か)。
      // 講習時間割作成の画面・配布用 Excel と同じ番号。
      const subjText = `${lesson.subj}${lesson.countText || ""}`;
      const title = external
        ? `[講習期間の外部授業] ${lesson.subj}${
            lesson.time ? ` (${lesson.time})` : ""
          }\n講習時間割作成の「講師不在・NG」で登録されたコマ`
        : `[講習${
            lesson.projectName ? `: ${lesson.projectName}` : ""
          }] ${lesson.tabName} ${lesson.cls} ${subjText} (${
            lesson.periodLabel
          }${lesson.time ? ` ${lesson.time}` : ""})\n編集は「講習時間割作成」で行います`;
      return (
        <div
          key={`koshu-${lesson.key}`}
          className="month-print-card"
          style={{
            fontSize: 11,
            lineHeight: 1.4,
            padding: "2px 3px",
            margin: "1px 0",
            borderRadius: 3,
            background: col.bg,
            borderLeft: `2px solid ${col.color}`,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={title}
        >
          <span
            style={{
              background: col.color,
              color: "#fff",
              fontSize: 8,
              fontWeight: 800,
              padding: "0 3px",
              borderRadius: 2,
              marginRight: 2,
            }}
          >
            {external ? "外" : "講"}
          </span>
          {!external && (
            <span
              style={{
                background: gc.b,
                color: gc.f,
                fontSize: 8,
                fontWeight: 700,
                padding: "0 3px",
                borderRadius: 2,
                marginRight: 2,
              }}
            >
              {lesson.cls || lesson.grade}
            </span>
          )}
          {startText && <b>{startText}</b>} {subjText}
        </div>
      );
    })
  );
  pushCards(
    [examPrepByDate.get(ds)?.[0]?.start],
    [
      (() => {
        const shifts = examPrepByDate.get(ds);
        if (!shifts || shifts.length === 0) return null;
        const first = shifts[0];
        const last = shifts[shifts.length - 1];
        return (
          <div
            key={`examprep-${ds}`}
            className="month-print-card"
            style={{
              fontSize: 11,
              lineHeight: 1.4,
              padding: "2px 3px",
              margin: "1px 0",
              borderRadius: 3,
              background: "#fdf5e8",
              borderLeft: "2px solid #e0a030",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={`特訓シフト ${first.start}〜${last.end}\n${shifts
              .map((s) => `${s.no}校時 ${s.start}-${s.end}`)
              .join("\n")}`}
          >
            <span
              style={{
                background: "#e0a030",
                color: "#fff",
                fontSize: 8,
                fontWeight: 800,
                padding: "0 3px",
                borderRadius: 2,
                marginRight: 2,
              }}
            >
              特訓
            </span>
            <b>{first.start}</b>〜{last.end}{" "}
            <span style={{ fontSize: 10, color: "#8a5a1a" }}>
              ({shifts.length}校時)
            </span>
          </div>
        );
      })(),
    ]
  );
  dayCards.sort((a, b) => a.t - b.t || a.seq - b.seq);
  return (
    <div
      className="month-print-cell"
      style={{
        background: dayCutoff
          ? "#f5f5f0"
          : isFullOff
            ? "#f8f0f0"
            : offTone
              ? offTone.bg
              : hasExam && !isT
              ? "#fdf5e8"
              : isT
                ? "#fffbe6"
                : dow === 0
                  ? "#fdf5f5"
                  : dow === 6
                    ? "#f5f5fd"
                    : "#fff",
        minHeight: 90,
        padding: 4,
        border: isT ? "2px solid #e6a800" : "none",
        position: "relative",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: isT ? 800 : 600,
          color: dow === 0 ? "#c44" : dow === 6 ? "#44c" : "#333",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{d}</span>
        {dayOff.off && (
          <span
            title={`この日の ${sl.length} コマはすべて他の担当に移っています`}
            style={{ fontSize: 9, color: offTone.fg, fontWeight: 800 }}
          >
            {dayOff.label}
          </span>
        )}
        {isFullOff && (
          <span style={{ fontSize: 9, color: "#c44", fontWeight: 400 }}>
            {hols[0].label}
          </span>
        )}
        {!isFullOff && offDepts.length > 0 && (
          <span style={{ fontSize: 8, color: "#c88", fontWeight: 400 }}>
            {offDepts.map((d) => d.replace("部", "")).join(",") + "休"}
          </span>
        )}
        {!isFullOff && granularHols.length > 0 && (
          <span style={{ fontSize: 7, color: "#4a7a9a", fontWeight: 400, display: "block" }}>
            {granularHols.map(describeHolidayTargets).join(", ") + "休"}
          </span>
        )}
        {!isFullOff && hasExam && (
          <span
            style={{
              fontSize: 7,
              color: "#b07020",
              fontWeight: 700,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              textAlign: "right",
              lineHeight: 1.2,
            }}
          >
            {epActive.map((ep, i) => (
              <span
                key={ep.id ?? i}
                style={{
                  whiteSpace: "normal",
                  overflowWrap: "anywhere",
                }}
              >
                {ep.name}
                {(ep.tags || []).length > 0 && (
                  <span style={{ opacity: 0.7 }}>
                    [{ep.tags.join("·")}]
                  </span>
                )}
              </span>
            ))}
          </span>
        )}
      </div>
      {hasEvent && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            margin: "2px 0",
          }}
        >
          {evActive.map((ev) => {
            const meta = specialEventTypeMeta(ev.eventType);
            return (
              <span
                key={ev.id}
                title={`${meta.label}: ${ev.name}${ev.memo ? "\n" + ev.memo : ""}`}
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "1px 4px",
                  borderRadius: 3,
                  background: meta.bg,
                  color: meta.fg,
                  borderLeft: `2px solid ${meta.accent}`,
                  whiteSpace: "normal",
                  overflowWrap: "anywhere",
                  lineHeight: 1.3,
                }}
              >
                {meta.icon} {ev.name}
                {(ev.tags || []).length > 0 && (
                  <span style={{ opacity: 0.7 }}>
                    [{ev.tags.join("·")}]
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
      {dayCutoff ? (
        // 講習コマがある日は「通常時間割は未確定」の注記より講習の
        // 予定そのもの (下の講カード) を紙面に出す。
        koshuForDay.length > 0 ? null : (
          <div
            style={{ fontSize: 10, color: "#a09060", textAlign: "center", marginTop: 8 }}
          >
            {cutoffShortText(cutoffKind)}
          </div>
        )
      ) : isFullOff ? (
        <div
          style={{ fontSize: 10, color: "#caa", textAlign: "center", marginTop: 8 }}
        >
          休
        </div>
      ) : null}
      {/* その日のカード。種類をまたいで開始時刻順 (dayCards) */}
      {dayCards.map((c) => c.el)}
    </div>
  );
}
