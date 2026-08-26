"use client";

function Pill({ label, bg, color }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontWeight: 800,
        fontSize: 12,
        background: bg,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function Swatch({ label, bg, border }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        fontWeight: 700,
        color: "#374151",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          background: bg,
          border: `2px solid ${border}`,
          display: "inline-block",
        }}
      />
      {label}
    </div>
  );
}

export default function ReviewLegend() {
  return (
    <div
      style={{
        border: "1px solid #d1d5db",
        borderRadius: 10,
        padding: 12,
        background: "#fafafa",
        display: "grid",
        gap: 10,
        alignContent: "start",
      }}
    >
      <div style={{ fontWeight: 800, color: "#111827" }}>Key</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill label="High" bg="#166534" color="#ecfdf5" />
        <Pill label="Medium" bg="#ca8a04" color="#fefce8" />
        <Pill label="Low" bg="#dc2626" color="#fef2f2" />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <Swatch label="Selected row" bg="#f7fbff" border="#93c5fd" />
        <Swatch label="Resolved row" bg="#f1f8e9" border="#a3d9a5" />
        <Swatch label="Needs review" bg="#fff8e1" border="#f0b429" />
        <Swatch label="Duplicate" bg="#fdecea" border="#dc2626" />
      </div>
    </div>
  );
}