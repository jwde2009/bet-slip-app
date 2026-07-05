"use client";

function getStatusColor(status) {
  switch (status) {
    case "queued":
      return { bg: "#eff6ff", text: "#1d4ed8", border: "#93c5fd" };
    case "processing":
      return { bg: "#fff7ed", text: "#c2410c", border: "#fdba74" };
    case "complete":
      return { bg: "#ecfdf5", text: "#166534", border: "#86efac" };
    case "partial":
      return { bg: "#fffbeb", text: "#a16207", border: "#fcd34d" };
    case "failed":
      return { bg: "#fef2f2", text: "#b91c1c", border: "#fca5a5" };
    default:
      return { bg: "#f9fafb", text: "#374151", border: "#d1d5db" };
  }
}

export default function UploadBatchStatus({ batches, onClearHistory }) {
  if (!batches.length) return null;

  return (
    <div
      style={{
        marginTop: 12,
        marginBottom: 14,
        padding: 12,
        border: "1px solid #d1d5db",
        borderRadius: 10,
        background: "#fafafa",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 800, color: "#111827" }}>Upload Queue</div>
        <button
          type="button"
          onClick={onClearHistory}
          style={{
            padding: "6px 10px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Clear Upload History
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {batches.map((batch) => {
          const colors = getStatusColor(batch.status);

          return (
            <div
              key={batch.id}
              style={{
                border: `1px solid ${colors.border}`,
                background: colors.bg,
                color: colors.text,
                borderRadius: 8,
                padding: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontWeight: 800 }}>{batch.label}</div>
                <div style={{ fontWeight: 800, textTransform: "capitalize" }}>
                  {batch.status}
                </div>
              </div>

              <div style={{ marginTop: 6, fontSize: 14 }}>
                Accepted: <strong>{batch.fileCount}</strong> · Processed:{" "}
                <strong>{batch.processedCount}</strong> / {batch.fileCount} · Rows Created:{" "}
                <strong>{batch.rowsCreated}</strong> · Errors: <strong>{batch.errorCount}</strong>
              </div>

              <div style={{ fontSize: 12, marginTop: 6 }}>
                <strong>Upload Bookmaker:</strong> {batch.uploadBookmaker || "Auto"}
              </div>

              <div style={{ fontSize: 12, marginTop: 4 }}>
                <strong>Path:</strong>{" "}
                {batch.parentFolder && batch.folder
                  ? `${batch.parentFolder} / ${batch.folder}`
                  : batch.folder || batch.parentFolder || "—"}
              </div>

              {batch.fileNames?.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                  {batch.fileNames.slice(0, 4).join(" · ")}
                  {batch.fileNames.length > 4
                    ? ` · +${batch.fileNames.length - 4} more`
                    : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}