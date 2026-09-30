export function isTargetZone(t) {
  const pct = parseFloat(t?.targetZonePct);
  return !!t?.targetZone && pct > 0 && pct < 100;
}

export default function TargetZoneBadge({ ticket, size = 11 }) {
  if (!isTargetZone(ticket)) return null;
  return (
    <span title="Spot sprayed: loads and tank mix are calculated on the target zone rate"
      style={{ background: "#f3eefc", color: "#4a2a7a", border: "1px solid #7a4ab0",
        borderRadius: 4, padding: "1px 7px", fontSize: size, fontWeight: 700, whiteSpace: "nowrap" }}>
      ◎ Spot Spray
    </span>
  );
}
