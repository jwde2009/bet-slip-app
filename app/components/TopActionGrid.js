"use client";

const gridWrapStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(120px, 1fr))",
  gap: 0,
  border: "2px solid #166534",
  borderRadius: 12,
  overflow: "hidden",
  background: "#dcfce7",
  minWidth: 520,
};

const baseButtonStyle = {
  minHeight: 52,
  padding: "10px 12px",
  border: "none",
  borderRight: "2px solid #166534",
  borderBottom: "2px solid #166534",
  background: "#dcfce7",
  color: "#14532d",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  textAlign: "center",
  lineHeight: 1.15,
};

const disabledStyle = {
  opacity: 0.45,
  cursor: "not-allowed",
};

const dangerStyle = {
  background: "#fef2f2",
  color: "#991b1b",
};

const darkStyle = {
  background: "#166534",
  color: "#f0fdf4",
};

function GridButton({
  label,
  onClick,
  disabled = false,
  variant = "default",
  asLabel = false,
  children = null,
}) {
  const style = {
    ...baseButtonStyle,
    ...(variant === "danger" ? dangerStyle : {}),
    ...(variant === "dark" ? darkStyle : {}),
    ...(disabled ? disabledStyle : {}),
  };

  if (asLabel) {
    return (
      <label style={style}>
        <span>{label}</span>
        {children}
      </label>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} style={style}>
      {label}
    </button>
  );
}

export default function TopActionGrid({
  hasRows,
  hasSelectedRows,
  onUpload,
  onExportCsv,
  onExportDebugCsv,
  onExportSelectedCsv,
  onExportSelectedDebugCsv,
  onExportAppState,
  onImportAppState,
  onAddChangelogEntry,
  onDeleteSelected,
  onMarkSelectedWin,
  onMarkSelectedLoss,
  onClearAll,
}) {
  return (
    <div style={gridWrapStyle}>
            <GridButton label="Upload Bet Slips" variant="dark" asLabel>
        <input
          type="file"
          accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp"
          multiple
          onChange={(e) => onUpload(e.target.files)}
          style={{ display: "none" }}
        />
      </GridButton>

      <GridButton label="Export CSV" onClick={onExportCsv} disabled={!hasRows} />
      <GridButton label="Export Debug" onClick={onExportDebugCsv} disabled={!hasRows} />
      <GridButton
        label="Export Selected"
        onClick={() => onExportSelectedCsv(false)}
        disabled={!hasSelectedRows}
      />

      <GridButton
        label="Selected Debug"
        onClick={() => onExportSelectedDebugCsv(true)}
        disabled={!hasSelectedRows}
      />
      <GridButton label="Export App State" onClick={onExportAppState} />
      <GridButton label="Import App State" asLabel>
        <input
          type="file"
          accept="application/json"
          onChange={(e) => onImportAppState(e.target.files)}
          style={{ display: "none" }}
        />
      </GridButton>
      <GridButton label="Add Changelog" onClick={onAddChangelogEntry} />

      <GridButton
        label="Delete Selected"
        onClick={onDeleteSelected}
        disabled={!hasSelectedRows}
        variant="danger"
      />
      <GridButton
        label="Mark Win"
        onClick={onMarkSelectedWin}
        disabled={!hasSelectedRows}
      />
      <GridButton
        label="Mark Loss"
        onClick={onMarkSelectedLoss}
        disabled={!hasSelectedRows}
      />
      <GridButton
        label="Clear All"
        onClick={onClearAll}
        disabled={!hasRows}
        variant="danger"
      />
    </div>
  );
}