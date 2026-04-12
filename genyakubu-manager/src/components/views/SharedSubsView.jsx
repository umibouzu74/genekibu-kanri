import { useMemo } from "react";
import {
  DAY_COLOR as DC,
  dateToDay,
  gradeColor as GC,
} from "../../data";
import { colors, font, radius } from "../../styles/tokens";
import { StatusBadge } from "../StatusBadge";

/**
 * Read-only view rendered when a shared URL is opened.
 * Receives decoded share payload and displays substitution data.
 *
 * @param {{ data: { slots: import("../../types").Slot[], substitutions: import("../../types").Substitute[], generatedAt: string } }} props
 */
export function SharedSubsView({ data }) {
  const { slots, substitutions, generatedAt } = data;

  const slotMap = useMemo(() => {
    const m = {};
    slots.forEach((s) => {
      m[s.id] = s;
    });
    return m;
  }, [slots]);

  // Group substitutions by date, sorted ascending.
  const dayGroups = useMemo(() => {
    const byDate = {};
    for (const sub of substitutions) {
      if (!byDate[sub.date]) byDate[sub.date] = [];
      byDate[sub.date].push(sub);
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, subs]) => ({
        date,
        dow: dateToDay(date),
        subs: subs.sort((a, b) => {
          const sa = slotMap[a.slotId];
          const sb = slotMap[b.slotId];
          if (!sa || !sb) return 0;
          return (sa.time || "").localeCompare(sb.time || "");
        }),
      }));
  }, [substitutions, slotMap]);

  const genDate = generatedAt
    ? new Date(generatedAt).toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      style={{
        fontFamily: font.stack,
        background: colors.bg,
        minHeight: "100vh",
        padding: "16px 12px",
        maxWidth: 700,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: colors.primary,
          color: "#fff",
          borderRadius: radius.lg,
          padding: "16px 20px",
          marginBottom: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
          代行情報（共有）
        </h1>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 6,
            flexWrap: "wrap",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            {substitutions.length}件の代行
          </span>
          {genDate && (
            <span style={{ fontSize: 11, opacity: 0.6 }}>
              作成: {genDate}
            </span>
          )}
        </div>
      </div>

      {/* Day groups */}
      {dayGroups.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: colors.inkMuted,
            padding: 40,
            background: colors.surface,
            borderRadius: radius.lg,
            border: `1px solid ${colors.border}`,
            fontSize: 14,
          }}
        >
          共有された代行データはありません
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {dayGroups.map(({ date, dow, subs }) => (
            <div key={date}>
              {/* Day header */}
              <div
                style={{
                  background: DC[dow] || "#666",
                  color: "#fff",
                  padding: "8px 14px",
                  borderRadius: `${radius.lg}px ${radius.lg}px 0 0`,
                  fontWeight: 800,
                  fontSize: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>
                  {date}（{dow}）
                </span>
                <span style={{ fontSize: 11, opacity: 0.8 }}>
                  {subs.length}件
                </span>
              </div>

              {/* Substitute cards */}
              <div
                style={{
                  background: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderTop: "none",
                  borderRadius: `0 0 ${radius.lg}px ${radius.lg}px`,
                  overflow: "hidden",
                }}
              >
                {subs.map((sub, i) => {
                  const slot = slotMap[sub.slotId];
                  const gc = slot ? GC(slot.grade) : null;
                  return (
                    <div
                      key={sub.id ?? i}
                      style={{
                        padding: "10px 14px",
                        borderTop: i > 0 ? `1px solid ${colors.border}` : "none",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      {/* Top row: time + grade + subject + status */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        {slot && (
                          <>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: colors.ink,
                              }}
                            >
                              {slot.time}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: "1px 6px",
                                borderRadius: radius.sm,
                                background: gc?.b || "#eee",
                                color: gc?.f || "#666",
                              }}
                            >
                              {slot.grade}
                              {slot.cls ? ` ${slot.cls}` : ""}
                            </span>
                            <span style={{ fontSize: 11, color: colors.inkMuted }}>
                              {slot.subj}
                            </span>
                          </>
                        )}
                        <span style={{ marginLeft: "auto" }}>
                          <StatusBadge status={sub.status} />
                        </span>
                      </div>

                      {/* Bottom row: teacher change info */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 13,
                        }}
                      >
                        <span style={{ fontWeight: 600, color: colors.accentRed }}>
                          {sub.originalTeacher}
                        </span>
                        <span style={{ color: colors.inkSubtle, fontSize: 11 }}>→</span>
                        <span
                          style={{
                            fontWeight: 700,
                            color: sub.substitute
                              ? colors.accentGreen
                              : colors.inkGhost,
                          }}
                        >
                          {sub.substitute || "未定"}
                        </span>
                        {slot?.room && (
                          <span
                            style={{
                              marginLeft: "auto",
                              fontSize: 10,
                              color: colors.inkSubtle,
                              background: colors.surfaceAlt,
                              padding: "1px 6px",
                              borderRadius: radius.sm,
                            }}
                          >
                            {slot.room}
                          </span>
                        )}
                      </div>

                      {/* Memo */}
                      {sub.memo && (
                        <div
                          style={{
                            fontSize: 11,
                            color: colors.inkMuted,
                            background: colors.surfaceAlt,
                            padding: "4px 8px",
                            borderRadius: radius.sm,
                            marginTop: 2,
                          }}
                        >
                          {sub.memo}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          textAlign: "center",
          marginTop: 24,
          padding: "12px 0",
          fontSize: 11,
          color: colors.inkSubtle,
        }}
      >
        <span>現役部 授業管理システム</span>
        <span style={{ margin: "0 6px" }}>|</span>
        <a
          href={window.location.pathname}
          style={{ color: colors.accentBlue, textDecoration: "none" }}
        >
          アプリを開く
        </a>
      </div>
    </div>
  );
}
