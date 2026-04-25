import { S } from "../styles/common";
import { colors } from "../styles/tokens";

// ─── ShareLinkButton ────────────────────────────────────────────────
// Info-toned secondary button used to generate a shareable link. The
// busy state shows feedback via opacity + cursor + label swap.
export function ShareLinkButton({
  onClick,
  busy,
  label = "共有リンクを作成",
  busyLabel = "生成中...",
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        ...S.btn(false),
        fontSize: 11,
        background: colors.infoSoft,
        color: colors.info,
        border: `1px solid ${colors.infoBorder}`,
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? busyLabel : label}
    </button>
  );
}
