"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  compareValues,
  getDisplayedBookmaker,
  getSortableValue,
} from "../utils/tableHelpers";
import {
  americanOddsFromStakeAndProfit,
  americanOddsFromStakeAndReturn,
} from "../utils/oddsHelpers";

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

function getLeagueOptionsForRow(row) {
  const text = `${row?.selection || ""} ${row?.marketDetail || ""} ${row?.fixtureEvent || ""}`.toLowerCase();

  if (/nba|points|rebounds|assists|double-double|triple-double/.test(text)) {
    return ["", "NBA", "NCAAM", "NCAAW"];
  }

  if (/mlb|baseball|strikeouts|rbis|home runs|hits|earned runs/.test(text)) {
    return ["", "MLB", "Baseball"];
  }

  if (/nhl|hockey|shots on goal|puck line|goalscorer/.test(text)) {
    return ["", "NHL"];
  }

  if (/ufc|mma|submission|ko\/tko|decision/.test(text)) {
    return ["", "MMA"];
  }

  if (/soccer|mls|ucl|premier league|la liga|serie a|bundesliga/.test(text)) {
    return ["", "Soccer"];
  }

  if (/tennis|atp|wta|total games|games spread/.test(text)) {
    return ["", "Tennis"];
  }

  return [
    "",
    "NBA",
    "NCAAM",
    "NCAAW",
    "NFL",
    "MLB",
    "NHL",
    "Soccer",
    "MMA",
    "Tennis",
    "Baseball",
    "Multi",
  ];
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
  getRowAttentionLevel,
}) {
  const [hoverPreview, setHoverPreview] = useState({
    rowId: "",
    src: "",
    alt: "",
    visible: false,
    locked: false,
    x: 0,
    y: 0,
  });
  const [pulseRowId, setPulseRowId] = useState(null);
  const [previewZoomed, setPreviewZoomed] = useState(false);
  const [previewZoomOrigin, setPreviewZoomOrigin] = useState({ x: "50%", y: "0%" });
  const [dragState, setDragState] = useState({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
  });

  const imageScrollRef = useRef(null);
useEffect(() => {
  if (!selectedRowId) return;

  setPulseRowId(selectedRowId);

  const timeout = setTimeout(() => {
    setPulseRowId(null);
  }, 450);

  return () => clearTimeout(timeout);
}, [selectedRowId]);
  const closeHoverPreview = () => {
    setHoverPreview({
      rowId: "",
      src: "",
      alt: "",
      visible: false,
      locked: false,
      x: 0,
      y: 0,
    });
    setPreviewZoomed(false);
    setPreviewZoomOrigin({ x: "50%", y: "0%" });
    if (imageScrollRef.current) {
      imageScrollRef.current.scrollTop = 0;
    }
  };

  const getPreviewPosition = () => {
    const margin = 20;
    const previewWidth = Math.min(1120, window.innerWidth - margin * 2);
    const desiredX = 500;
    const x = Math.max(margin, Math.min(desiredX, window.innerWidth - previewWidth - margin));
    const y = 20;
    return { x, y };
  };

  useEffect(() => {
    if (!dragState.dragging) return;

    const handleMouseMove = (e) => {
      setHoverPreview((prev) => ({
        ...prev,
        x: Math.max(20, e.clientX - dragState.offsetX),
        y: Math.max(20, e.clientY - dragState.offsetY),
      }));
    };

    const handleMouseUp = () => {
      setDragState((prev) => ({
        ...prev,
        dragging: false,
      }));
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState]);

  function beginPreviewDrag(e) {
    if (!hoverPreview.locked) return;

    const interactive = e.target.closest("button, input, select, textarea, label");
    if (interactive) return;

    e.preventDefault();

    setDragState({
      dragging: true,
      offsetX: e.clientX - hoverPreview.x,
      offsetY: e.clientY - hoverPreview.y,
    });
  }

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

  const previewNeedsReview =
    !!previewRow &&
    (
      previewRow.likelyParserIssue === "Y" ||
      !previewRow.sportLeague ||
      !previewRow.oddsUS ||
      previewRow.oddsSource === "Calculated" ||
      String(previewRow.parseWarning || "").includes("stake_missing") ||
      String(previewRow.parseWarning || "").includes("selection_missing") ||
      String(previewRow.parseWarning || "").includes("fixture_missing")
    );

  function getNumericMoney(value) {
    const n = Number(String(value || "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }

  function autoFillCalculatedFields(row) {
    if (!row) return;

    const stake = getNumericMoney(row.stake);
    const payout = getNumericMoney(row.payout);
    const toWin = getNumericMoney(row.toWin);

    if (!row.oddsUS) {
      let calculatedOdds = "";

      if (Number.isFinite(stake) && Number.isFinite(payout) && payout > stake) {
        calculatedOdds = americanOddsFromStakeAndReturn(stake, payout);
      } else if (Number.isFinite(stake) && Number.isFinite(toWin) && toWin > 0) {
        calculatedOdds = americanOddsFromStakeAndProfit(stake, toWin);
      }

      if (calculatedOdds) {
        handleRowFieldChange(row.id, "oddsUS", calculatedOdds);
        handleRowFieldChange(row.id, "oddsSource", "Calculated");
        handleRowFieldChange(row.id, "reviewLater", "Y");
      }
    }

    if (!row.payout && Number.isFinite(stake) && row.oddsUS) {
      const oddsNum = Number(String(row.oddsUS).replace(/[^0-9+-]/g, ""));
      if (Number.isFinite(oddsNum) && stake > 0) {
        let toWinCalc = 0;
        if (oddsNum > 0) toWinCalc = (stake * oddsNum) / 100;
        if (oddsNum < 0) toWinCalc = (stake * 100) / Math.abs(oddsNum);

        if (toWinCalc > 0) {
          const payoutCalc = (stake + toWinCalc).toFixed(2);
          handleRowFieldChange(row.id, "payout", payoutCalc);
          handleRowFieldChange(row.id, "reviewLater", "Y");
        }
      }
    }
  }

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
                setPreviewZoomed(false);
                setPreviewZoomOrigin({ x: "50%", y: "0%" });
                if (imageScrollRef.current) {
                  imageScrollRef.current.scrollTop = 0;
                }

                const position = getPreviewPosition();

                setHoverPreview((prev) => {
                  const sameRow = prev.rowId === row.id;

                  if (sameRow && prev.locked) {
                    return {
                      rowId: "",
                      src: "",
                      alt: "",
                      visible: false,
                      locked: false,
                      x: 0,
                      y: 0,
                    };
                  }

                  return {
                    rowId: row.id,
                    src: row.sourceImageUrl,
                    alt: row.sourceFileName,
                    visible: true,
                    locked: true,
                    x: position.x,
                    y: position.y,
                  };
                });
              }}
              style={{
                display: "inline-block",
                cursor: "pointer",
              }}
              title="Click to open preview"
            >
              <img
                src={row.sourceImageUrl}
                alt={row.sourceFileName}
                style={{
                  width: 84,
                  height: 84,
                  objectFit: "cover",
                  borderRadius: 6,
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
      return (
        <td key={reactKey} style={{ ...cellStyle, backgroundColor: rowBg }}>
          {getDisplayedBookmaker(row)}
        </td>
      );
    }
    if (colKey === "confidenceFlag") {
      const confidence = String(row.confidenceFlag || "").trim().toLowerCase();

      let bg = "#e5e7eb";
      let color = "#374151";

      if (confidence === "high") {
        bg = "#166534";
        color = "#ecfdf5";
      } else if (confidence === "medium") {
        bg = "#ca8a04";
        color = "#fefce8";
      } else if (confidence === "low") {
        bg = "#dc2626";
        color = "#fef2f2";
      }

      return (
        <td key={reactKey} style={{ ...cellStyle, backgroundColor: rowBg }}>
          {row.confidenceFlag ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 68,
                padding: "4px 10px",
                borderRadius: 999,
                fontWeight: 800,
                fontSize: 12,
                background: bg,
                color,
              }}
            >
              {row.confidenceFlag}
            </span>
          ) : (
            ""
          )}
        </td>
      );
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
          onMouseDown={beginPreviewDrag}
          style={{
            position: "fixed",
            left: hoverPreview.x,
            top: hoverPreview.y,
            zIndex: 9999,
            pointerEvents: hoverPreview.locked ? "auto" : "none",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 12,
            boxShadow: "0 16px 40px rgba(0,0,0,0.3)",
            padding: 12,
            width: 1120,
            maxWidth: "92vw",
            maxHeight: "85vh",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
              gap: 12,
              cursor: hoverPreview.locked ? "move" : "default",
              userSelect: "none",
            }}
          >
            <div style={{ fontWeight: 700 }}>
              {hoverPreview.locked ? "Review Panel" : "Preview"}
            </div>

            {hoverPreview.locked && (
              <button onClick={closeHoverPreview} style={smallButtonStyle}>
                Close
              </button>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "360px minmax(0, 1fr)",
              gap: 16,
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <strong>Selection:</strong>{" "}
                <input
                  value={previewRow?.selection || ""}
                  onChange={(e) =>
                    previewRow &&
                    handleRowFieldChange(previewRow.id, "selection", e.target.value)
                  }
                  style={{
                    marginLeft: 8,
                    width: "70%",
                    padding: "6px 8px",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                  }}
                />
              </div>

              <div>
                <strong>League:</strong>{" "}
                <select
                  value={previewRow?.sportLeague || ""}
                  onChange={(e) =>
                    previewRow &&
                    handleRowFieldChange(previewRow.id, "sportLeague", e.target.value)
                  }
                  style={{
                    marginLeft: 8,
                    padding: "6px 8px",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                  }}
                >
                  {getLeagueOptionsForRow(previewRow || {}).map((league) => (
                    <option key={league || "blank"} value={league}>
                      {league || "Select league"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <strong>Stake:</strong>{" "}
                <input
                  value={previewRow?.stake || ""}
                  onChange={(e) =>
                    previewRow &&
                    handleRowFieldChange(previewRow.id, "stake", e.target.value)
                  }
                  style={{
                    marginLeft: 8,
                    width: 120,
                    padding: "6px 8px",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                  }}
                />
              </div>

              <div>
                <strong>Odds:</strong>{" "}
                <input
                  value={previewRow?.oddsUS || ""}
                  onChange={(e) =>
                    previewRow &&
                    handleRowFieldChange(previewRow.id, "oddsUS", e.target.value)
                  }
                  style={{
                    marginLeft: 8,
                    width: 120,
                    padding: "6px 8px",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                    background:
                      previewRow?.oddsSource === "Calculated" ? "#fee2e2" : "#fff",
                    color:
                      previewRow?.oddsSource === "Calculated" ? "#991b1b" : "#111827",
                    fontWeight:
                      previewRow?.oddsSource === "Calculated" ? 700 : 400,
                  }}
                />
              </div>

              <div>
                <strong>Payout:</strong>{" "}
                <input
                  value={previewRow?.payout || ""}
                  onChange={(e) =>
                    previewRow &&
                    handleRowFieldChange(previewRow.id, "payout", e.target.value)
                  }
                  style={{
                    marginLeft: 8,
                    width: 120,
                    padding: "6px 8px",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                    background:
                      !previewRow?.payout && previewRow?.oddsUS ? "#fee2e2" : "#fff",
                  }}
                />
              </div>

              {previewNeedsReview && (
                <div
                  style={{
                    padding: "8px 10px",
                    border: "1px solid #fecaca",
                    borderRadius: 6,
                    background: "#fee2e2",
                    color: "#991b1b",
                    fontWeight: 700,
                  }}
                >
                  Needs Review
                </div>
              )}

              {hoverPreview.locked && previewRow && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  <button
                    onClick={() =>
                      handleRowFieldChange(
                        previewRow.id,
                        "reviewLater",
                        previewRow.reviewLater === "Y" ? "N" : "Y"
                      )
                    }
                    style={smallButtonStyle}
                  >
                    Review Later
                  </button>

                  <button
                    onClick={() => autoFillCalculatedFields(previewRow)}
                    style={smallButtonStyle}
                  >
                    Auto Fill Odds / Payout
                  </button>

                  <button
                    onClick={() => {
                      handleRowFieldChange(previewRow.id, "reviewResolved", "Y");
                      handleRowFieldChange(previewRow.id, "reviewLater", "N");
                    }}
                    style={smallButtonStyle}
                  >
                    Mark Reviewed
                  </button>

                  <button
                    onClick={() => setWinStatusForRow(previewRow.id, "Y", false)}
                    style={smallButtonStyle}
                  >
                    Win
                  </button>

                  <button
                    onClick={() => setWinStatusForRow(previewRow.id, "N", false)}
                    style={smallButtonStyle}
                  >
                    Loss
                  </button>

                  <button
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
            </div>

            <div
              ref={imageScrollRef}
              style={{
                maxHeight: "80vh",
                height: previewZoomed ? "70vh" : "auto",
                overflowY: previewZoomed ? "auto" : "hidden",
                overflowX: "hidden",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                background: "#fff",
              }}
            >
              <img
                src={hoverPreview.src}
                alt={hoverPreview.alt}
                onClick={(e) => {
                  if (!hoverPreview.locked) return;

                  if (previewZoomed) {
                    setPreviewZoomed(false);
                    setPreviewZoomOrigin({ x: "50%", y: "0%" });
                    if (imageScrollRef.current) {
                      imageScrollRef.current.scrollTop = 0;
                    }
                    return;
                  }

                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width) * 100;
                  const y = ((e.clientY - rect.top) / rect.height) * 100;

                  setPreviewZoomOrigin({
                    x: `${x}%`,
                    y: `${y}%`,
                  });

                  setPreviewZoomed(true);
                }}
                style={{
                  width: "100%",
                  height: "auto",
                  display: "block",
                  borderRadius: 6,
                  cursor: hoverPreview.locked
                    ? previewZoomed
                      ? "zoom-out"
                      : "zoom-in"
                    : "default",
                  transform: previewZoomed ? "scale(1)" : "scale(0.45)",
                  transformOrigin: previewZoomed
                    ? `${previewZoomOrigin.x} ${previewZoomOrigin.y}`
                    : "50% 0%",
                  transition: "transform 0.15s ease",
                }}
              />
            </div>
          </div>
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
              const attentionLevel = getRowAttentionLevel ? getRowAttentionLevel(row) : "";
              const isResolved = row.reviewResolved === "Y";

              const needsReview =
                row.likelyParserIssue === "Y" ||
                !row.sportLeague ||
                !row.oddsUS ||
                row.oddsSource === "Calculated";

              const isSelected = row.id === selectedRowId;

              const rowBg =
                isSelected
                  ? "#e0f2fe" // stronger blue
                  : isResolved
                  ? "#f1f8e9"
                  : attentionLevel === "duplicate"
                  ? "#fdecea"
                  : needsReview
                  ? "#fff8e1"
                  : zebra;

              return (
                <tr
                  key={row.id}
                  onClick={() => setSelectedRowId(row.id)}
                  style={{
                  backgroundColor: rowBg,
                  cursor: "pointer",

                  outline: isSelected
                    ? "3px solid #0284c7"
                    : isResolved
                    ? "2px solid #a3d9a5"
                    : attentionLevel === "duplicate"
                    ? "2px solid #dc2626"
                    : needsReview
                    ? "2px solid #f0b429"
                    : "none",

                  outlineOffset: "-2px",

                  borderLeft: isSelected
                    ? "6px solid #0284c7"
                    : needsReview
                    ? "6px solid #f0b429"
                    : attentionLevel === "duplicate"
                    ? "6px solid #dc2626"
                    : "none",

                  // 🔥 Glow pulse effect
                  boxShadow:
                    pulseRowId === row.id
                      ? "0 0 0 6px rgba(2,132,199,0.45)"
                      : isSelected
                      ? "0 0 0 2px rgba(2,132,199,0.2)"
                      : "none",

                  transition: "box-shadow 0.25s ease",
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