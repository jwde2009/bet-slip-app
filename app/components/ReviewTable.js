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
  padding: "6px 8px",
  verticalAlign: "top",
  background: "#fff",
  color: "#000",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 13,
  lineHeight: 1.25,
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
  rowNeedsReview,
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
  const [editingCell, setEditingCell] = useState({
    rowId: "",
    key: "",
  });

  const imageScrollRef = useRef(null);
  const selectedRowRef = useRef(null);
  useEffect(() => {
    if (!selectedRowId) return;

    setPulseRowId(selectedRowId);

    if (selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }

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
    { key: "marketType", label: "Market", sortable: true },
    { key: "fixtureEvent", label: "Fixture / Event", sortable: true },
    { key: "stake", label: "Stake", sortable: true },
    { key: "oddsUS", label: "Odds", sortable: true },
    { key: "likelyHedge", label: "Hedge", sortable: true },
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
    { key: "marketType", label: "Market", sortable: true },
    { key: "betSourceTag", label: "Source Tag", sortable: true },
    { key: "fixtureEvent", label: "Fixture / Event", sortable: true },
    { key: "stake", label: "Stake", sortable: true },
    { key: "oddsUS", label: "Odds", sortable: true },
    { key: "oddsMissingReason", label: "Odds Note", sortable: true },
    { key: "impliedProbability", label: "Imp Prob", sortable: true },
    { key: "confidenceFlag", label: "Confidence", sortable: true },
    { key: "reviewBucket", label: "Priority", sortable: true },
    { key: "reviewReasons", label: "Review Reasons", sortable: false },
    { key: "likelyParserIssue", label: "QA", sortable: true },
    { key: "live", label: "Live", sortable: true },
    { key: "bonusBet", label: "Bonus", sortable: true },
    { key: "reviewLater", label: "Review", sortable: true },
    { key: "likelyHedge", label: "Hedge", sortable: true },
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

  const fallbackRowNeedsReview = (row) =>
    !!row &&
    (
      row.reviewResolved !== "Y" &&
      (
        row.likelyParserIssue === "Y" ||
        !row.sportLeague ||
        !row.oddsUS ||
        row.oddsSource === "Calculated" ||
        String(row.parseWarning || "").includes("stake_missing") ||
        String(row.parseWarning || "").includes("selection_missing") ||
        String(row.parseWarning || "").includes("fixture_missing") ||
        row.reviewLater === "Y"
      )
    );

  const reviewCheck = rowNeedsReview || fallbackRowNeedsReview;

  const previewNeedsReview = !!previewRow && reviewCheck(previewRow);

  function jumpToNextReviewRow(currentRowId) {
    if (!rows?.length) return;

    const currentIndex = rows.findIndex((row) => row.id === currentRowId);
    if (currentIndex === -1) return;

    let nextRowId = currentRowId;

    for (let i = currentIndex + 1; i < rows.length; i += 1) {
      if (reviewCheck(rows[i])) {
        nextRowId = rows[i].id;
        break;
      }
    }

    if (nextRowId === currentRowId) {
      for (let i = 0; i < currentIndex; i += 1) {
        if (reviewCheck(rows[i])) {
          nextRowId = rows[i].id;
          break;
        }
      }
    }

    setSelectedRowId(nextRowId);

    setHoverPreview((prev) => {
      if (!prev.locked) return prev;
      return {
        ...prev,
        rowId: nextRowId,
      };
    });
  }

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

    const inlineEditableKeys = new Set([
    "selection",
    "fixtureEvent",
    "stake",
    "oddsUS",
    "betDate",
    "eventDate",
    "sportLeague",
    "betType",
    "toWin",
    "payout",
  ]);

  function beginInlineEdit(rowId, key) {
    setEditingCell({ rowId, key });
  }

  function stopInlineEdit() {
    setEditingCell({ rowId: "", key: "" });
  }

  function renderInlineEditor(row, rowBg, colKey, reactKey) {
    const value = row[colKey] || "";
    const isEditing = editingCell.rowId === row.id && editingCell.key === colKey;

    if (!inlineEditableKeys.has(colKey)) {
      return (
        <td
          key={reactKey}
          style={{ ...cellStyle, backgroundColor: rowBg }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {value}
        </td>
      );
    }

    if (!isEditing) {
      return (
        <td
          key={reactKey}
          style={{ ...cellStyle, backgroundColor: rowBg, cursor: "text" }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            beginInlineEdit(row.id, colKey);
          }}
          title="Double-click to edit"
        >
          {value}
        </td>
      );
    }

    if (colKey === "sportLeague") {
      return (
        <td key={reactKey} style={{ ...cellStyle, backgroundColor: rowBg }}>
          <select
            autoFocus
            value={value}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => handleRowFieldChange(row.id, colKey, e.target.value)}
            onBlur={stopInlineEdit}
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid #2563eb",
              borderRadius: 4,
              background: "#fff",
              color: "#000",
            }}
          >
            {getLeagueOptionsForRow(row).map((league) => (
              <option key={league || "blank"} value={league}>
                {league || "Select league"}
              </option>
            ))}
          </select>
        </td>
      );
    }

    return (
      <td key={reactKey} style={{ ...cellStyle, backgroundColor: rowBg }}>
        <input
          autoFocus
          value={value}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => handleRowFieldChange(row.id, colKey, e.target.value)}
          onBlur={stopInlineEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") stopInlineEdit();
            if (e.key === "Escape") stopInlineEdit();
          }}
          style={{
            width: "100%",
            padding: "6px 8px",
            border: "1px solid #2563eb",
            borderRadius: 4,
            background: "#fff",
            color: "#000",
            boxSizing: "border-box",
          }}
        />
      </td>
    );
  }

  const renderCell = (row, rowBg, colKey, reactKey) => {
    if (colKey === "reviewBucket") {
      return (
        <td key={reactKey} style={{ ...cellStyle, backgroundColor: rowBg }}>
          {row.reviewBucket || ""}
          {row.reviewPriority ? ` (${row.reviewPriority})` : ""}
        </td>
      );
    }

    if (colKey === "reviewReasons") {
      return (
        <td key={reactKey} style={{ ...cellStyle, backgroundColor: rowBg, whiteSpace: "normal" }}>
          {row.reviewReasons || ""}
        </td>
      );
    }
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

              setHoverPreview((prev) => {
                if (!prev.locked) return prev;
                return {
                  ...prev,
                  rowId: row.id,
                  src: row.sourceImageUrl || "",
                  alt: row.sourceFileName || "",
                  visible: !!row.sourceImageUrl,
                };
              });
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

               if (colKey === "likelyHedge") {
      const override = String(row.hedgeOverride || "").toUpperCase();
      const isLikely = row.likelyHedge === "Y";
      const guaranteedProfit = row.guaranteedProfit === "Y";

      let badgeBg = "#e5e7eb";
      let badgeColor = "#374151";
      let badgeText = "";

      if (override === "Y") {
        badgeBg = "#166534";
        badgeColor = "#ecfdf5";
        badgeText = "Confirmed";
      } else if (override === "N") {
        badgeBg = "#9a3412";
        badgeColor = "#fff7ed";
        badgeText = "Denied";
      } else if (isLikely) {
        const quality = String(row.hedgeQuality || "").trim();

        if (quality === "Guaranteed Profit") {
          badgeBg = "#065f46";
          badgeColor = "#ecfdf5";
          badgeText = "Guaranteed Profit";
        } else if (quality === "Middle") {
          badgeBg = "#7c3aed";
          badgeColor = "#f5f3ff";
          badgeText = "Middle";
        } else {
          badgeBg = "#2563eb";
          badgeColor = "#eff6ff";
          badgeText = "Likely Hedge";
        }
      }

      return (
        <td
          key={reactKey}
          style={{ ...cellStyle, backgroundColor: rowBg, whiteSpace: "normal" }}
        >
          {badgeText ? (
            <div style={{ marginBottom: 8 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 110,
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontWeight: 800,
                  fontSize: 12,
                  background: badgeBg,
                  color: badgeColor,
                }}
              >
                {badgeText}
              </span>
            </div>
          ) : (
            <div style={{ marginBottom: 8, color: "#6b7280" }}>—</div>
          )}

          {row.hedgeClusterId && (
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              <strong>Cluster:</strong> {row.hedgeClusterId.slice(0, 8)}
               ({row.hedgeClusterSize || 2})
            </div>
          )}

          {row.hedgeConfidence && (
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              <strong>Confidence:</strong> {row.hedgeConfidence}
            </div>
          )}

          {row.hedgePartnerBookmaker && (
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              <strong>Pair:</strong> {row.hedgePartnerBookmaker}
            </div>
          )}

          {row.hedgeStake && row.hedgeQuality !== "Middle" && (
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              <strong>Hedge Stake:</strong> ${row.hedgeStake}
            </div>
          )}

          {guaranteedProfit && row.guaranteedProfitAmount && (
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              <strong>Guaranteed:</strong> ${row.guaranteedProfitAmount}
            </div>
          )}

          {row.hedgeProfitIfThisWins && row.hedgeQuality !== "Middle" && (
            <div style={{ fontSize: 12, marginBottom: 4 }}>
              <strong>This wins:</strong> ${row.hedgeProfitIfThisWins}
            </div>
          )}

          {row.hedgeProfitIfOtherWins && row.hedgeQuality !== "Middle" && (
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              <strong>Other wins:</strong> ${row.hedgeProfitIfOtherWins}
            </div>
          )}

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRowFieldChange(row.id, "hedgeOverride", "Y");
                handleRowFieldChange(
                  row.id,
                  "betSourceTag",
                  row.hedgeQuality === "Middle" ? "Middle" : "Hedge"
                );
              }}
              style={smallButtonStyle}
            >
              Confirm
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRowFieldChange(row.id, "hedgeOverride", "N");
              }}
              style={smallButtonStyle}
            >
              Deny
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRowFieldChange(row.id, "hedgeOverride", "");
              }}
              style={smallButtonStyle}
            >
              Reset
            </button>
          </div>
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

    return renderInlineEditor(row, rowBg, colKey, reactKey);
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
            <strong>Bookmaker:</strong>{" "}
            <select
              value={previewRow?.bookmaker || ""}
              onChange={(e) =>
                previewRow &&
                handleRowFieldChange(previewRow.id, "bookmaker", e.target.value)
              }
              style={{
                marginLeft: 8,
                padding: "6px 8px",
                border: "1px solid #ccc",
                borderRadius: 6,
              }}
            >
              <option value="">Select</option>
              <option value="DraftKings">DraftKings</option>
              <option value="BetMGM">BetMGM</option>
              <option value="FanDuel">FanDuel</option>
              <option value="Caesars">Caesars</option>
              <option value="Fanatics">Fanatics</option>
              <option value="theScore">theScore</option>
              <option value="bet365">bet365</option>
              <option value="Circa">Circa</option>
              <option value="Kalshi">Kalshi</option>
            </select>
          </div>

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

              <div style={{ display: "grid", gap: 6 }}>
                <strong>Notes:</strong>
                <textarea
                  value={previewRow?.reviewNotes || ""}
                  onChange={(e) =>
                    previewRow &&
                    handleRowFieldChange(previewRow.id, "reviewNotes", e.target.value)
                  }
                  placeholder="Add parser/debug notes here"
                  style={{
                    width: "100%",
                    minHeight: 110,
                    padding: "8px 10px",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                    background: "#fff",
                    color: "#000",
                    resize: "vertical",
                    fontFamily: "Arial, sans-serif",
                    boxSizing: "border-box",
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

                      setTimeout(() => {
                        jumpToNextReviewRow(previewRow.id);
                      }, 0);
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

      <div
        style={{
          overflowX: "auto",
          overflowY: "auto",
          maxHeight: "74vh",
          minHeight: "58vh",
          border: "1px solid #ddd",
          borderRadius: 6,
        }}
      >
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
                      position: "sticky",
                      top: 0,
                      zIndex: 3,
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

              const isHedgeRow = row.likelyHedge === "Y";

              const rowBg =
                isSelected
                  ? "#e0f2fe"
                  : attentionLevel === "resolved-critical"
                  ? "#fff7ed"
                  : attentionLevel === "resolved"
                  ? "#f1f8e9"
                  : attentionLevel === "duplicate"
                  ? "#fdecea"
                  : needsReview
                  ? "#fff8e1"
                  : isHedgeRow
                  ? "#faf5ff"
                  : zebra;

              return (
                <tr
                  key={row.id}
                  ref={row.id === selectedRowId ? selectedRowRef : null}
                  onClick={() => {
                    setSelectedRowId(row.id);

                    setHoverPreview((prev) => {
                      if (!prev.locked) return prev;
                      return {
                        ...prev,
                        rowId: row.id,
                        src: row.sourceImageUrl || "",
                        alt: row.sourceFileName || "",
                        visible: !!row.sourceImageUrl,
                      };
                    });
                  }}
                  style={{
                  backgroundColor: rowBg,
                  cursor: "pointer",

                  outline: isSelected
                    ? "3px solid #0284c7"
                    : attentionLevel === "resolved-critical"
                    ? "2px solid #ea580c"
                    : attentionLevel === "resolved"
                    ? "2px solid #a3d9a5"
                    : attentionLevel === "duplicate"
                    ? "2px solid #dc2626"
                    : needsReview
                    ? "2px solid #f0b429"
                    : "none",

                  outlineOffset: "-2px",

                  borderLeft: isSelected
                    ? "6px solid #0284c7"
                    : attentionLevel === "resolved-critical"
                    ? "6px solid #ea580c"
                    : attentionLevel === "resolved"
                    ? "6px solid #65a30d"
                    : needsReview
                    ? "6px solid #f0b429"
                    : attentionLevel === "duplicate"
                    ? "6px solid #dc2626"
                    : row.guaranteedProfit === "Y"
                    ? "6px solid #16a34a"
                    : row.likelyHedge === "Y"
                    ? "6px solid #7c3aed"
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