"use client";

import { useMemo, useState } from "react";
import {
  compareValues,
  getDisplayedBookmaker,
  getSortableValue,
} from "../utils/tableHelpers";

const cellStyle = {
  border: "1px solid #ccc",
  padding: 8,
  verticalAlign: "top",
  background: "#fff",
  color: "#000",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const smallButtonStyle = {
  padding: "6px 10px",
  border: "1px solid #ccc",
  borderRadius: 4,
  backgroundColor: "#f5f5f5",
  cursor: "pointer",
};

function getConfidenceSortValue(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "high") return 3;
  if (v === "medium") return 2;
  if (v === "low") return 1;
  return 0;
}

export default function ReviewTable({
  rows,
  selectedRowId,
  setSelectedRowId,
  selectedIds,
  toggleSelected,
  toggleSelectAllVisible,
  allVisibleSelected,
  sortConfig,
  handleSort,
  columnWidths,
  startResize,
  setWinStatusForRow,
  deleteRow,
  handleRowFieldChange,
  tableMode = "debug",
}) {
  const [hoverPreview, setHoverPreview] = useState({
    rowId: "",
    src: "",
    alt: "",
    visible: false,
    locked: false,
  });

  const closeHoverPreview = () => {
    setHoverPreview({
      rowId: "",
      src: "",
      alt: "",
      visible: false,
      locked: false,
    });
  };

  const simplifiedColumns = [
    { key: "select", label: "", sortable: false },
    { key: "edit", label: "Select", sortable: false },
    { key: "image", label: "Image", sortable: false },
    { key: "bookmaker", label: "Bookmaker", sortable: true },
    { key: "eventDate", label: "Event Date", sortable: true },
    { key: "betDate", label: "Bet Date", sortable: true },
    { key: "sportLeague", label: "Sport / League", sortable: true },
    { key: "selection", label: "Selection", sortable: true },
    { key: "betType", label: "Bet Type", sortable: true },
    { key: "fixtureEvent", label: "Fixture / Event", sortable: true },
    { key: "stake", label: "Stake", sortable: true },
    { key: "oddsUS", label: "Odds", sortable: true },
  ];

  const debugColumns = [
    { key: "select", label: "", sortable: false },
    { key: "edit", label: "Select", sortable: false },
    { key: "image", label: "Image", sortable: false },
    { key: "sourceFileName", label: "Source File", sortable: true },
    { key: "accountOwner", label: "Owner", sortable: true },
    { key: "bookmaker", label: "Bookmaker", sortable: true },
    { key: "betId", label: "Bet ID", sortable: true },
    { key: "eventDate", label: "Event Date", sortable: true },
    { key: "betDate", label: "Bet Date", sortable: true },
    { key: "sportLeague", label: "Sport / League", sortable: true },
    { key: "selection", label: "Selection", sortable: true },
    { key: "betType", label: "Bet Type", sortable: true },
    { key: "betSourceTag", label: "Source Tag", sortable: true },
    { key: "fixtureEvent", label: "Fixture / Event", sortable: true },
    { key: "stake", label: "Stake", sortable: true },
    { key: "oddsUS", label: "Odds", sortable: true },
    { key: "oddsMissingReason", label: "Odds Note", sortable: true },
    { key: "impliedProbability", label: "Imp Prob", sortable: true },
    { key: "confidenceFlag", label: "Confidence", sortable: true },
    { key: "likelyParserIssue", label: "QA", sortable: true },
    { key: "live", label: "Live", sortable: true },
    { key: "bonusBet", label: "Bonus", sortable: true },
    { key: "reviewLater", label: "Review", sortable: true },
    { key: "warnings", label: "Warnings", sortable: true },
    { key: "actions", label: "Actions", sortable: false },
  ];

  const reviewColumns = tableMode === "simplified" ? simplifiedColumns : debugColumns;

  const sortedRows = useMemo(() => {
    if (!sortConfig?.key) return rows;

    return [...rows].sort((a, b) => {
      let aValue;
      let bValue;

      if (sortConfig.key === "confidenceFlag") {
        aValue = getConfidenceSortValue(a.confidenceFlag);
        bValue = getConfidenceSortValue(b.confidenceFlag);
      } else {
        aValue = getSortableValue(a, sortConfig.key);
        bValue = getSortableValue(b, sortConfig.key);
      }

      return compareValues(aValue, bValue, sortConfig.direction);
    });
  }, [rows, sortConfig]);

  const previewRow = rows.find((row) => row.id === hoverPreview.rowId) || null;

  const renderCell = (row, rowBg, colKey, reactKey) => {
    if (colKey === "select") {
      return (
        <td key={reactKey} style={{ ...cellStyle, backgroundColor: rowBg }}>
          <input
            type="checkbox"
            checked={selectedIds.includes(row.id)}
            onChange={() => toggleSelected(row.id)}
            onClick={(e) => e.stopPropagation()}
          />
        </td>
      );
    }

    if (colKey === "edit") {
      return (
        <td key={reactKey} style={{ ...cellStyle, backgroundColor: rowBg }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedRowId(row.id);
            }}
            style={smallButtonStyle}
          >
            {row.id === selectedRowId ? "Selected" : "Edit"}
          </button>
        </td>
      );
    }

    if (colKey === "image") {
      return (
        <td key={reactKey} style={{ ...cellStyle, backgroundColor: rowBg, overflow: "visible" }}>
          {row.sourceImageUrl ? (
            <div
              onClick={(e) => {
                e.stopPropagation();
                setHoverPreview((prev) => {
                  const sameRow = prev.rowId === row.id;

                  if (sameRow && prev.locked) {
                    return {
                      rowId: "",
                      src: "",
                      alt: "",
                      visible: false,
                      locked: false,
                    };
                  }

                  return {
                    rowId: row.id,
                    src: row.sourceImageUrl,
                    alt: row.sourceFileName,
                    visible: true,
                    locked: true,
                  };
                });
              }}
              onMouseEnter={() => {
                setHoverPreview((prev) => {
                  if (prev.locked) return prev;
                  return {
                    rowId: row.id,
                    src: row.sourceImageUrl,
                    alt: row.sourceFileName,
                    visible: true,
                    locked: false,
                  };
                });
              }}
              onMouseLeave={() => {
                setHoverPreview((prev) =>
                  prev.locked
                    ? prev
                    : {
                        rowId: "",
                        src: "",
                        alt: "",
                        visible: false,
                        locked: false,
                      }
                );
              }}
              style={{
                display: "inline-block",
                cursor: "pointer",
              }}
              title="Hover to preview, click to lock"
            >
              <img
                src={row.sourceImageUrl}
                alt={row.sourceFileName}
                style={{
                  width: 60,
                  height: 60,
                  objectFit: "cover",
                  borderRadius: 4,
                  border: "1px solid #ccc",
                }}
              />
            </div>
          ) : (
            ""
          )}
        </td>
      );
    }

    if (colKey === "bookmaker") {
      return <td key={reactKey} style={{ ...cellStyle, backgroundColor: rowBg }}>{getDisplayedBookmaker(row)}</td>;
    }

    if (colKey === "likelyParserIssue") {
      return (
        <td key={reactKey} style={{ ...cellStyle, backgroundColor: rowBg }}>
          {row.likelyParserIssue === "Y" ? "Check" : ""}
        </td>
      );
    }

    if (colKey === "warnings") {
      return (
        <td key={reactKey} style={{ ...cellStyle, backgroundColor: rowBg, whiteSpace: "normal" }}>
          {row.parseWarning && <div>{row.parseWarning}</div>}
          {row.duplicateWarning && <div>{row.duplicateWarning}</div>}
        </td>
      );
    }

    if (colKey === "actions") {
      return (
        <td key={reactKey} style={{ ...cellStyle, backgroundColor: rowBg, whiteSpace: "normal" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setWinStatusForRow(row.id, "Y", true);
              }}
              style={smallButtonStyle}
            >
              Win
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setWinStatusForRow(row.id, "N", true);
              }}
              style={smallButtonStyle}
            >
              Loss
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteRow(row.id);
              }}
              style={smallButtonStyle}
            >
              Delete
            </button>
          </div>
        </td>
      );
    }

return (
  <td key={reactKey} style={{ ...cellStyle, backgroundColor: rowBg }}>
    {row[colKey] || ""}
  </td>
);
  };

  return (
    <div style={{ marginTop: 20 }}>
      {hoverPreview.visible && hoverPreview.src && (
        <div
          style={{
            position: "fixed",
            right: 20,
            top: 80,
            zIndex: 9999,
            pointerEvents: hoverPreview.locked ? "auto" : "none",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 12,
            boxShadow: "0 16px 40px rgba(0,0,0,0.3)",
            padding: 12,
            maxHeight: "85vh",
            overflow: "auto",
            width: 760,
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
            <div style={{ fontWeight: 700, color: "#111827" }}>
              {hoverPreview.locked ? "Locked Preview" : "Preview"}
            </div>
            {hoverPreview.locked && (
              <button
                type="button"
                onClick={closeHoverPreview}
                style={{
                  padding: "6px 10px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  background: "#f5f5f5",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            )}
          </div>

          <div style={{ marginBottom: 12, display: "grid", gap: 8 }}>
            <div>
              <strong>Selection:</strong> {previewRow?.selection || "--"}
            </div>
            <div>
              <strong>Stake:</strong> {previewRow?.stake || "--"}
            </div>
            <div>
              <strong>Odds:</strong> {previewRow?.oddsUS || "--"}
            </div>
            <div>
              <strong>Confidence:</strong>{" "}
              <span
                style={{
                  fontWeight: 700,
                  color:
                    previewRow?.confidenceFlag === "High"
                      ? "#166534"
                      : previewRow?.confidenceFlag === "Medium"
                      ? "#b45309"
                      : previewRow?.confidenceFlag === "Low"
                      ? "#b91c1c"
                      : "#374151",
                }}
              >
                {previewRow?.confidenceFlag || "--"}
              </span>
            </div>
          </div>

          {hoverPreview.locked && previewRow && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <button
                type="button"
                onClick={() =>
                  handleRowFieldChange(
                    previewRow.id,
                    "reviewLater",
                    previewRow.reviewLater === "Y" ? "N" : "Y"
                  )
                }
                style={smallButtonStyle}
              >
                {previewRow.reviewLater === "Y" ? "Clear Review Later" : "Review Later"}
              </button>

              <button
                type="button"
                onClick={() => setWinStatusForRow(previewRow.id, "Y", false)}
                style={smallButtonStyle}
              >
                Mark Win
              </button>

              <button
                type="button"
                onClick={() => setWinStatusForRow(previewRow.id, "N", false)}
                style={smallButtonStyle}
              >
                Mark Loss
              </button>

              <button
                type="button"
                onClick={() => {
                  closeHoverPreview();
                  deleteRow(previewRow.id);
                }}
                style={smallButtonStyle}
              >
                Delete
              </button>
            </div>
          )}

          <img
            src={hoverPreview.src}
            alt={hoverPreview.alt}
            style={{
              maxWidth: "100%",
              maxHeight: "70vh",
              objectFit: "contain",
              display: "block",
              borderRadius: 6,
            }}
          />
        </div>
      )}

      <h3 style={{ color: "#000" }}>Review Queue</h3>

      <div style={{ overflowX: "auto", maxHeight: 520, border: "1px solid #ddd", borderRadius: 6 }}>
        <table
          style={{
            borderCollapse: "separate",
            borderSpacing: 0,
            width: "100%",
            backgroundColor: "#fff",
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            {reviewColumns.map((col) => (
              <col key={col.key} style={{ width: columnWidths[col.key] || 120 }} />
            ))}
          </colgroup>

          <thead>
            <tr>
              {reviewColumns.map((col, idx) => {
                const isSorted = sortConfig.key === col.key;
                const sortArrow = isSorted ? (sortConfig.direction === "asc" ? " ▲" : " ▼") : "";

                return (
                  <th
                    key={col.key}
                    style={{
                      borderRight: "1px solid #d1d5db",
                      borderBottom: "2px solid #9ca3af",
                      padding: 0,
                      background: "#e5e7eb",
                      color: "#111827",
                      textAlign: "left",
                      whiteSpace: "nowrap",
                      fontWeight: 700,
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        minHeight: 42,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (col.sortable) handleSort(col.key);
                        }}
                        style={{
                          width: "100%",
                          border: "none",
                          background: "transparent",
                          textAlign: "left",
                          padding: "10px 18px 10px 12px",
                          fontWeight: 700,
                          color: "#111827",
                          cursor: col.sortable ? "pointer" : "default",
                        }}
                      >
                        {idx === 0 ? (
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleSelectAllVisible}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          `${col.label}${sortArrow}`
                        )}
                      </button>

                      <div
                        onMouseDown={(e) => startResize(e, col.key)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          width: 14,
                          height: "100%",
                          cursor: "col-resize",
                          zIndex: 2,
                          background: "transparent",
                        }}
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((row, index) => {
              const zebra = index % 2 === 0 ? "#ffffff" : "#e5e7eb";

              const rowBg =
                row.id === selectedRowId
                  ? "#f7fbff"
                  : row.confidenceFlag === "Low"
                  ? "#fffaf0"
                  : zebra;

              return (
                <tr
                  key={row.id}
                  onClick={() => setSelectedRowId(row.id)}
                  style={{
                    backgroundColor: rowBg,
                    cursor: "pointer",
                  }}
                >
                  {reviewColumns.map((col) => (
                    renderCell(row, rowBg, col.key, col.key)
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}