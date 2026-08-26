"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  compareValues,
  getDisplayedBookmaker,
  getSortableValue,
} from "../utils/tableHelpers";
import {
  americanOddsFromStakeAndProfit,
  americanOddsFromStakeAndReturn,
} from "../utils/oddsHelpers";

import {
  TEAM_ALIASES_BY_SPORT,
} from "../ev-parlay-lab/data/teamAliases";


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
    return ["", "Baseball"];
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
    "Baseball",
    "NHL",
    "Soccer",
    "MMA",
    "Tennis",
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
  handleRowFieldChange: handleRowFieldChangeProp,
  handleRowFieldsChange: handleRowFieldsChangeProp,
  tableMode = "debug",
  getRowAttentionLevel,
  rowNeedsReview,
  allRows = [],
  onReattachSingleScreenshot,
  onClearReviewedScreenshots,
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
  
  const [lastReviewedContext, setLastReviewedContext] = useState(null);
  const [reviewDateParts, setReviewDateParts] = useState({
    rowId: "",
    month: "",
    day: "",
    year: "",
  });

  const [hedgeDetailPreview, setHedgeDetailPreview] = useState({
    visible: false,
    rowId: "",
  });

  const [reviewActionNotice, setReviewActionNotice] = useState("");
  const [reviewHistory, setReviewHistory] = useState([]);
  const [showHedgeCandidatesByRowId, setShowHedgeCandidatesByRowId] = useState({});
  const [parlayLegDraftByRowId, setParlayLegDraftByRowId] = useState({});
  const [knownPlayerNames, setKnownPlayerNames] = useState([]);
  const [knownTeamNamesByLeague, setKnownTeamNamesByLeague] = useState({});
  const [reviewDraftByRowId, setReviewDraftByRowId] = useState({});
  const reviewDraftByRowIdRef = useRef({});
  const manuallyEditedPlayerSubjectRowIdsRef = useRef(new Set());
  const rowUpdateBatchRef = useRef({
    depth: 0,
    rowId: "",
    updates: {},
  });

  const KNOWN_PLAYER_NAMES_STORAGE_KEY = "betSlipKnownPlayerNamesV1";
  const KNOWN_TEAM_NAMES_STORAGE_KEY = "betSlipKnownTeamNamesByLeagueV1";

  const imageScrollRef = useRef(null);
  const selectedRowRef = useRef(null);
  const popupSelectionRef = useRef(null);
  const popupFixtureRef = useRef(null);
  const popupLeagueRef = useRef(null);
  const popupBetDateRef = useRef(null);
  const popupBetMonthRef = useRef(null);
  const popupBetDayRef = useRef(null);
  const popupBetYearRef = useRef(null);
  const popupBetTypeRef = useRef(null);
  const popupParticipantARef = useRef(null);
  const popupParticipantBRef = useRef(null);
  const popupSubjectRef = useRef(null);
  const popupMarketContextRef = useRef(null);
  const popupPlayerLastNameRef = useRef(null);
  const popupPropMarketRef = useRef(null);
  const popupPropSideRef = useRef(null);
  const popupPropLineRef = useRef(null);
  const popupMainLineSideRef = useRef(null);
  const popupMainLineLineRef = useRef(null);
  const popupStakeRef = useRef(null);
  const popupOddsRef = useRef(null);
  const popupPayoutRef = useRef(null);

  const DRAFT_REVIEW_FIELDS = new Set([
    "eventDate",
    "betDate",
    "sportLeague",
    "sportLeagueManual",
    "bookmaker",
    "betType",
    "reviewBetKind",
    "reviewMarketType",
    "selection",
    "fixtureEvent",
    "participantA",
    "participantANormalized",
    "participantB",
    "participantBNormalized",
    "canonicalSubject",
    "canonicalPlayer",
    "playerSubjectManual",
    "playerSubjectUserEdited",
    "playerLastName",
    "propMarket",
    "propSide",
    "propLine",
    "canonicalMarketContext",
    "mainLineSide",
    "mainLineLine",
    "stake",
    "oddsUS",
    "oddsSource",
    "oddsMissingReason",
    "payout",
    "toWin",
    "marketDetail",
    "reviewNotes",
    "performanceCategory",
    "parlayLegsJson",
    "parlayLegCount",
    "parlayLegsConfirmed",
    "parlayLegsSkipped",
    "parsedContextAutofilled",
    "leagueMismatchOverrideKey",
  ]);

  function isDraftableReviewField(rowId, field) {
    return (
      hoverPreview.locked &&
      hoverPreview.rowId === rowId &&
      DRAFT_REVIEW_FIELDS.has(field)
    );
  }

  function getRefValueForRow(ref, rowId = "") {
    const current = ref?.current;
    if (!current) return "";

    const refRowId = String(current.dataset?.rowId || "");
    const activeRowId = String(rowId || "");

    // Prevent stale uncontrolled input values from the previous reviewed row
    // from being reused while React is switching the full-page review to a new bet.
    if (activeRowId && refRowId && refRowId !== activeRowId) return "";

    return current.value || "";
  }

  function isRowUpdateBatchActive(rowId = "") {
    const batch = rowUpdateBatchRef.current;
    return !!(
      batch &&
      batch.depth > 0 &&
      batch.rowId &&
      String(batch.rowId) === String(rowId || "")
    );
  }

  function beginRowUpdateBatch(rowId = "") {
    if (!rowId) return false;

    const batch = rowUpdateBatchRef.current;

    if (batch.depth > 0) {
      if (String(batch.rowId) !== String(rowId)) {
        throw new Error(`Cannot batch updates for row ${rowId} while row ${batch.rowId} is active.`);
      }

      rowUpdateBatchRef.current = {
        ...batch,
        depth: batch.depth + 1,
      };
      return true;
    }

    rowUpdateBatchRef.current = {
      depth: 1,
      rowId,
      updates: {},
    };

    return true;
  }

  function queueRowUpdateBatch(rowId = "", updates = {}) {
    if (!rowId || !updates || typeof updates !== "object") return false;
    if (!isRowUpdateBatchActive(rowId)) return false;

    const batch = rowUpdateBatchRef.current;
    rowUpdateBatchRef.current = {
      ...batch,
      updates: {
        ...(batch.updates || {}),
        ...updates,
      },
    };

    return true;
  }

  function clearReviewDraftWithoutCommit(rowId = "") {
    if (!rowId || !reviewDraftByRowIdRef.current[rowId]) return false;

    const nextDrafts = { ...reviewDraftByRowIdRef.current };
    delete nextDrafts[rowId];
    reviewDraftByRowIdRef.current = nextDrafts;
    setReviewDraftByRowId(nextDrafts);
    return true;
  }

  function flushRowUpdateBatch(rowId = "", options = {}) {
    const { deferParentUpdate = false } = options;
    const batch = rowUpdateBatchRef.current;

    if (!batch || batch.depth <= 0 || String(batch.rowId) !== String(rowId || "")) {
      return false;
    }

    if (batch.depth > 1) {
      rowUpdateBatchRef.current = {
        ...batch,
        depth: batch.depth - 1,
      };
      return false;
    }

    const draft = reviewDraftByRowIdRef.current[rowId] || {};
    const combinedUpdates = {
      ...draft,
      ...(batch.updates || {}),
    };

    rowUpdateBatchRef.current = {
      depth: 0,
      rowId: "",
      updates: {},
    };

    if (reviewDraftByRowIdRef.current[rowId]) {
      clearReviewDraftWithoutCommit(rowId);
    }

    const currentRow = getLoadedReviewRowById(rowId) || {};
    const cleanUpdates = {};

    Object.entries(combinedUpdates).forEach(([field, value]) => {
      if (!field) return;

      const currentValue = currentRow[field] ?? "";
      const nextValue = value ?? "";

      if (String(currentValue) === String(nextValue)) return;
      cleanUpdates[field] = value;
    });

    const fields = Object.keys(cleanUpdates);
    if (!fields.length) return false;

    if (typeof handleRowFieldsChangeProp === "function") {
      const applyParentUpdate = () => handleRowFieldsChangeProp(rowId, cleanUpdates);

      if (deferParentUpdate) {
        startTransition(applyParentUpdate);
      } else {
        applyParentUpdate();
      }
    } else {
      fields.forEach((field) => handleRowFieldChangeProp(rowId, field, cleanUpdates[field]));
    }

    return true;
  }

  function runRowUpdateBatch(rowId = "", callback = null, options = {}) {
    if (!rowId || typeof callback !== "function") return undefined;

    beginRowUpdateBatch(rowId);

    try {
      return callback();
    } finally {
      flushRowUpdateBatch(rowId, options);
    }
  }

  function updateReviewDraft(rowId, updates = {}) {
    if (!rowId || !updates || typeof updates !== "object") return;

    const currentDraft = reviewDraftByRowIdRef.current[rowId] || {};
    const nextDraft = { ...currentDraft };
    let changed = false;

    Object.entries(updates).forEach(([field, value]) => {
      if (!field) return;
      const nextValue = value ?? "";
      if (String(nextDraft[field] ?? "") === String(nextValue)) return;
      nextDraft[field] = value;
      changed = true;
    });

    if (!changed) return;

    reviewDraftByRowIdRef.current = {
      ...reviewDraftByRowIdRef.current,
      [rowId]: nextDraft,
    };

    setReviewDraftByRowId(reviewDraftByRowIdRef.current);
  }

  function commitReviewDraft(rowId, extraUpdates = {}) {
    if (!rowId) return false;

    const draft = reviewDraftByRowIdRef.current[rowId] || {};
    const updates = { ...draft, ...(extraUpdates || {}) };
    const fields = Object.keys(updates).filter(Boolean);

    if (isRowUpdateBatchActive(rowId)) {
      if (fields.length) queueRowUpdateBatch(rowId, updates);
      if (reviewDraftByRowIdRef.current[rowId]) clearReviewDraftWithoutCommit(rowId);
      return fields.length > 0;
    }

    if (fields.length) {
      if (typeof handleRowFieldsChangeProp === "function") {
        handleRowFieldsChangeProp(rowId, updates);
      } else {
        fields.forEach((field) => handleRowFieldChangeProp(rowId, field, updates[field]));
      }
    }

    if (reviewDraftByRowIdRef.current[rowId]) {
      clearReviewDraftWithoutCommit(rowId);
    }

    return fields.length > 0;
  }

  function discardReviewDraft(rowId) {
    if (!rowId || !reviewDraftByRowIdRef.current[rowId]) return;
    const nextDrafts = { ...reviewDraftByRowIdRef.current };
    delete nextDrafts[rowId];
    reviewDraftByRowIdRef.current = nextDrafts;
    setReviewDraftByRowId(nextDrafts);
  }

  function handleRowFieldChange(id, field, value) {
    if (!id || !field) return;

    const nextValue =
      field === "selection"
        ? canonicalizeAnytimeGoalscorerSelectionForRow(id, value)
        : value;

    if (queueRowUpdateBatch(id, { [field]: nextValue })) {
      return;
    }

    if (isDraftableReviewField(id, field)) {
      updateReviewDraft(id, { [field]: nextValue });
      return;
    }

    handleRowFieldChangeProp(id, field, nextValue);
  }

  function handleRowFieldsChange(id, updates = {}) {
    if (!id || !updates || typeof updates !== "object") return;

    const normalizedUpdates = { ...updates };

    if (Object.prototype.hasOwnProperty.call(normalizedUpdates, "selection")) {
      normalizedUpdates.selection =
        canonicalizeAnytimeGoalscorerSelectionForRow(
          id,
          normalizedUpdates.selection,
          normalizedUpdates
        );
    }

    if (queueRowUpdateBatch(id, normalizedUpdates)) {
      return;
    }

    const draftUpdates = {};
    const rowUpdates = {};

    Object.entries(normalizedUpdates).forEach(([field, value]) => {
      if (isDraftableReviewField(id, field)) {
        draftUpdates[field] = value;
      } else {
        rowUpdates[field] = value;
      }
    });

    if (Object.keys(draftUpdates).length) updateReviewDraft(id, draftUpdates);

    if (Object.keys(rowUpdates).length) {
      if (typeof handleRowFieldsChangeProp === "function") {
        handleRowFieldsChangeProp(id, rowUpdates);
      } else {
        Object.entries(rowUpdates).forEach(([field, value]) => handleRowFieldChangeProp(id, field, value));
      }
    }
  }

  function getLoadedReviewRowById(rowId) {
    if (!rowId) return null;

    return (
      (Array.isArray(allRows) ? allRows : []).find((row) => row.id === rowId) ||
      (Array.isArray(rows) ? rows : []).find((row) => row.id === rowId) ||
      null
    );
  }

  function applyRowFieldUpdates(rowId, updates = {}) {
    if (!rowId || !updates || typeof updates !== "object") return false;

    const currentRow = getLoadedReviewRowById(rowId) || {};
    const cleanUpdates = {};

    Object.entries(updates).forEach(([field, value]) => {
      if (!field) return;

      const currentValue = currentRow[field] ?? "";
      const nextValue = value ?? "";

      if (String(currentValue) === String(nextValue)) return;

      cleanUpdates[field] = value;
    });

    if (!Object.keys(cleanUpdates).length) return false;

    if (typeof handleRowFieldsChange === "function") {
      handleRowFieldsChange(rowId, cleanUpdates);
    } else {
      Object.entries(cleanUpdates).forEach(([field, value]) => {
        handleRowFieldChange(rowId, field, value);
      });
    }

    return true;
  }
  const autoNormalizedReviewRowsRef = useRef(new Set());
  const lastReviewRowIdRef = useRef("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KNOWN_PLAYER_NAMES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];

      if (Array.isArray(parsed)) {
        setKnownPlayerNames(
          parsed
            .filter((item) => item?.name)
            .slice(0, 500)
        );
      }
    } catch (error) {
      console.warn("Could not load known player names", error);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KNOWN_TEAM_NAMES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setKnownTeamNamesByLeague(parsed);
      }
    } catch (error) {
      console.warn("Could not load known team names", error);
    }
  }, []);

  function persistKnownPlayerNames(nextPlayers = []) {
    const unique = [];
    const seen = new Set();

    nextPlayers.forEach((item) => {
      const name = cleanPlayerNameForLibrary(item?.name || "", {
        allowSingleWord: isLastNameOnlyPlayerLeague(item?.league || ""),
      });
      const key = normalizeKnownPlayerKey(name);
      if (!name || !key || seen.has(key)) return;
      seen.add(key);
      unique.push({
        ...item,
        name,
        lastName: item?.lastName || getLastNameFromText(name),
        updatedAt: item?.updatedAt || new Date().toISOString(),
      });
    });

    const limited = unique.slice(0, 500);
    setKnownPlayerNames(limited);

    try {
      localStorage.setItem(KNOWN_PLAYER_NAMES_STORAGE_KEY, JSON.stringify(limited));
    } catch (error) {
      console.warn("Could not save known player names", error);
    }
  }


  function normalizeKnownTeamLeagueKey(league = "") {
    const text = String(league || "")
      .trim()
      .toLowerCase()
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ");

    if (!text) return "unknown";
    if (text === "baseball" || text === "mlb") return "mlb";
    if (["nba", "wnba", "nhl", "nfl"].includes(text)) return text;
    if (/^(soccer|mls|epl|premier league|la liga|serie a|bundesliga|ligue 1|ucl|champions league|europa league|international soccer|championship|england championship|efl championship)$/.test(text)) return "soccer";
    if (/^(ncaa|ncaam|ncaaw|ncaab|ncaaf|cbb|cfb|college|college basketball|college football)$/.test(text)) return "college";

    return text.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
  }

  function getKnownTeamsForLeague(league = "") {
    const leagueKey = normalizeKnownTeamLeagueKey(league);
    const direct = knownTeamNamesByLeague?.[leagueKey] || [];
    const sharedSoccer = leagueKey === "soccer" ? knownTeamNamesByLeague?.soccer || [] : [];

    return Array.from(new Set([...(Array.isArray(direct) ? direct : []), ...(Array.isArray(sharedSoccer) ? sharedSoccer : [])]))
      .map((name) => cleanParticipantTextForMatching(name))
      .filter(Boolean);
  }

  function findKnownCustomTeamName(value = "", league = "") {
    const raw = cleanParticipantTextForMatching(value);
    if (!raw) return "";

    const rawVariants = getSideCompareVariants(raw);
    const teams = getKnownTeamsForLeague(league);

    let best = "";
    let bestScore = 0;

    teams.forEach((team) => {
      const teamVariants = getSideCompareVariants(team);

      for (const rawKey of rawVariants) {
        for (const teamKey of teamVariants) {
          if (!rawKey || !teamKey) continue;

          let score = 0;
          if (rawKey === teamKey) score = 1000 + teamKey.length;
          else if (teamKey.length >= 4 && rawKey.includes(teamKey)) score = 500 + teamKey.length;
          else if (rawKey.length >= 4 && teamKey.includes(rawKey)) score = 400 + rawKey.length;

          if (score > bestScore) {
            bestScore = score;
            best = team;
          }
        }
      }
    });

    return best;
  }

  function persistKnownTeamName(league = "", teamName = "") {
    const cleaned = cleanParticipantTextForMatching(teamName);
    if (!cleaned) return false;

    const leagueKey = normalizeKnownTeamLeagueKey(league);
    const current = knownTeamNamesByLeague && typeof knownTeamNamesByLeague === "object" ? knownTeamNamesByLeague : {};
    const existing = Array.isArray(current[leagueKey]) ? current[leagueKey] : [];

    if (existing.some((name) => normalizeSideCompareKey(name) === normalizeSideCompareKey(cleaned))) {
      return true;
    }

    const next = {
      ...current,
      [leagueKey]: [...existing, cleaned].slice(-1000),
    };

    setKnownTeamNamesByLeague(next);

    try {
      localStorage.setItem(KNOWN_TEAM_NAMES_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn("Could not save known team name", error);
    }

    return true;
  }

  function pushReviewHistoryEntry(rowId = "") {
    const id = String(rowId || "").trim();
    if (!id) return;

    setReviewHistory((prev) => {
      const cleaned = (prev || []).filter((existingId) => existingId && existingId !== id);
      return [id, ...cleaned].slice(0, 50);
    });
  }

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
    const closingRowId = hoverPreview.rowId || lastReviewRowIdRef.current || "";

    if (closingRowId) {
      commitReviewDraft(closingRowId);
      pushReviewHistoryEntry(closingRowId);
      lastReviewRowIdRef.current = closingRowId;
    }

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


  function deleteCurrentRowScreenshot(row = {}) {
    if (!row?.id) return;

    if (row.sourceImageUrl && String(row.sourceImageUrl).startsWith("blob:")) {
      try {
        URL.revokeObjectURL(row.sourceImageUrl);
      } catch (error) {
        // Safe to ignore stale blob URLs.
      }
    }

    const clearedAt = new Date().toISOString();

    handleRowFieldChange(row.id, "sourceImageUrl", "");
    handleRowFieldChange(row.id, "sourceImageClearedAt", clearedAt);
    handleRowFieldChange(row.id, "sourceImageClearedManually", "Y");

    setHoverPreview((prev) =>
      prev.rowId === row.id
        ? {
            ...prev,
            src: "",
            alt: row.sourceFileName || prev.alt || "",
            visible: true,
            locked: true,
          }
        : prev
    );

    setReviewActionNotice("Screenshot preview deleted for this row. Use Reattach Screenshot if you need it again.");
  }

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

  function blurActiveFieldFromBlankClick(e) {
    const target = e.target;
    const interactive = target?.closest?.("button, input, select, textarea, label, [contenteditable='true'], [role='button']");

    if (interactive) return false;

    const active = document.activeElement;
    const activeTag = String(active?.tagName || "").toLowerCase();
    const activeIsField =
      ["input", "textarea", "select"].includes(activeTag) ||
      active?.isContentEditable;

    if (activeIsField && typeof active.blur === "function") {
      active.blur();
      return true;
    }

    return false;
  }

  function beginPreviewDrag(e) {
    if (!hoverPreview.locked) return;

    const interactive = e.target.closest("button, input, select, textarea, label, [contenteditable='true'], [role='button']");
    if (interactive) return;

    // Clicking blank space should leave the active field so keyboard shortcuts work again.
    // Do NOT call preventDefault or start the old drag handler here. The full-page review
    // is fixed/inset now, so drag is not useful, and preventing default can block scrollbar
    // dragging / normal scroll behavior inside nested review panels.
    blurActiveFieldFromBlankClick(e);
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

  const allReviewRows = allRows?.length ? allRows : rows;

  function normalizePerformanceCategory(value = "") {
    const text = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");

    if (!text) return "";
    if (/\b(?:hedge|middle|guaranteed profit)\b/.test(text)) return "hedge";
    if (/(?:\bev\s*\+|\+\s*ev\b|positive\s*ev|plus\s*ev)/.test(text)) return "ev";
    if (/\b(?:fun|recreational|recreation)\b/.test(text)) return "fun";

    return "";
  }

  function getPerformanceCategoryForRow(row = {}) {
    // The explicit tracker category is authoritative and does not modify the
    // separate hedge-review workflow.
    const explicitCategory = normalizePerformanceCategory(
      row.performanceCategory || ""
    );
    if (explicitCategory) return explicitCategory;

    const tagText = [
      row.betSourceTag,
      row.sourceTag,
      row.betCategory,
      row.wagerCategory,
      row.strategyType,
      row.strategy,
    ]
      .filter(Boolean)
      .join(" ");

    const confirmedHedge =
      String(row.hedgeOverride || "").toUpperCase() === "Y" ||
      normalizePerformanceCategory(tagText) === "hedge";

    if (confirmedHedge) return "hedge";

    const positiveEv =
      normalizePerformanceCategory(tagText) === "ev" ||
      [row.positiveEV, row.isPositiveEV, row.evPositive].some(
        (value) => String(value || "").toUpperCase() === "Y"
      );

    if (positiveEv) return "ev";
    if (normalizePerformanceCategory(tagText) === "fun") return "fun";

    return "";
  }

  const performanceTracker = useMemo(() => {
    const empty = () => ({
      wins: 0,
      losses: 0,
      dollarsWon: 0,
      dollarsLost: 0,
      net: 0,
      missingMoney: 0,
    });

    const summary = {
      total: empty(),
      hedge: empty(),
      ev: empty(),
      fun: empty(),
      unclassified: empty(),
      settledCount: 0,
      duplicateRowsSkipped: 0,
    };

    const seenSettledBets = new Set();

    function parseMoney(value) {
      const number = Number(
        String(value ?? "")
          .replace(/,/g, "")
          .replace(/[^0-9.-]/g, "")
      );

      return Number.isFinite(number) ? number : NaN;
    }

    function getSettledResult(row = {}) {
      const status = String(row.status || "").trim().toLowerCase();

      if (row.win === "Y" || status === "won" || status === "win") {
        return "win";
      }

      if (row.win === "N" || status === "lost" || status === "loss") {
        return "loss";
      }

      return "";
    }

    function getSettledBetKey(row = {}) {
      const bookmaker = String(
        getDisplayedBookmaker(row) || row.bookmaker || ""
      )
        .trim()
        .toLowerCase();
      const owner = String(row.accountOwner || "").trim().toLowerCase();
      const betId = String(row.betId || "").trim().toLowerCase();

      // Bet IDs are the safest way to prevent a duplicated upload from being
      // counted twice. Rows without a bet ID remain distinct by row ID.
      return betId
        ? `${owner}::${bookmaker}::${betId}`
        : `row::${row.id || Math.random()}`;
    }

    function getMoneyResult(row = {}, result = "") {
      const stake = parseMoney(row.stake);
      const payout = parseMoney(row.payout);
      const toWin = parseMoney(row.toWin);
      const isBonusBet =
        String(row.bonusBet || "").trim().toUpperCase() === "Y";

      if (result === "win") {
        // toWin is stored as profit when available. Payout is total return for
        // cash bets, but cash winnings for a bonus bet whose stake is not returned.
        if (isBonusBet && Number.isFinite(payout) && payout >= 0) {
          return { won: payout, lost: 0, missing: false };
        }

        if (Number.isFinite(toWin) && toWin >= 0) {
          return { won: toWin, lost: 0, missing: false };
        }

        if (
          Number.isFinite(payout) &&
          Number.isFinite(stake) &&
          payout >= stake
        ) {
          return {
            won: payout - stake,
            lost: 0,
            missing: false,
          };
        }

        return { won: 0, lost: 0, missing: true };
      }

      if (result === "loss") {
        // A lost bonus bet does not lose cash bankroll.
        if (isBonusBet) {
          return { won: 0, lost: 0, missing: false };
        }

        if (Number.isFinite(stake) && stake >= 0) {
          return { won: 0, lost: stake, missing: false };
        }

        return { won: 0, lost: 0, missing: true };
      }

      return { won: 0, lost: 0, missing: false };
    }

    function addResult(record, result, money) {
      const resultKey = result === "win" ? "wins" : "losses";
      record[resultKey] += 1;
      record.dollarsWon += money.won;
      record.dollarsLost += money.lost;
      record.net = record.dollarsWon - record.dollarsLost;

      if (money.missing) record.missingMoney += 1;
    }

    (allReviewRows || []).forEach((row) => {
      const result = getSettledResult(row);
      if (!result) return;

      const settledKey = getSettledBetKey(row);

      if (seenSettledBets.has(settledKey)) {
        summary.duplicateRowsSkipped += 1;
        return;
      }

      seenSettledBets.add(settledKey);
      summary.settledCount += 1;

      const money = getMoneyResult(row, result);
      addResult(summary.total, result, money);

      const category = getPerformanceCategoryForRow(row);

      if (category && summary[category]) {
        addResult(summary[category], result, money);
      } else {
        addResult(summary.unclassified, result, money);
      }
    });

    return summary;
  }, [allReviewRows]);

  function formatTrackerMoney(value = 0, options = {}) {
    const { signed = false } = options;
    const number = Number(value || 0);
    const absolute = Math.abs(number).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    if (!signed) return `$${absolute}`;
    if (number > 0) return `+$${absolute}`;
    if (number < 0) return `-$${absolute}`;
    return "$0.00";
  }

  function renderPerformanceTracker() {
    const items = [
      ["Total", performanceTracker.total],
      ["Hedge", performanceTracker.hedge],
      ["EV+", performanceTracker.ev],
      ["Fun", performanceTracker.fun],
    ];

    return (
      <div style={{ display: "grid", gap: 6 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(145px, 1fr))",
            gap: 7,
          }}
        >
          {items.map(([label, record]) => (
            <div
              key={`performance-${label}`}
              style={{
                display: "grid",
                gap: 3,
                padding: "7px 9px",
                borderRadius: 9,
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f172a",
                fontSize: 12,
              }}
              title={`${label}: ${record.wins} wins, ${record.losses} losses, ${formatTrackerMoney(record.dollarsWon)} profit won, ${formatTrackerMoney(record.dollarsLost)} stake lost`}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "baseline",
                }}
              >
                <strong style={{ fontSize: 12 }}>{label}</strong>
                <span style={{ fontSize: 15, fontWeight: 950 }}>
                  {record.wins}-{record.losses}
                </span>
              </div>

              <div style={{ color: "#166534", fontWeight: 900 }}>
                Won {formatTrackerMoney(record.dollarsWon)}
              </div>
              <div style={{ color: "#991b1b", fontWeight: 900 }}>
                Lost {formatTrackerMoney(record.dollarsLost)}
              </div>
              <div
                style={{
                  color: record.net >= 0 ? "#166534" : "#991b1b",
                  fontWeight: 950,
                }}
              >
                Net {formatTrackerMoney(record.net, { signed: true })}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            fontSize: 11,
            color: "#475569",
            fontWeight: 750,
          }}
        >
          Won $ is net profit from winning bets; Lost $ is cash stake lost.
          Bonus-bet losses count as $0.00.
          {performanceTracker.unclassified.wins +
            performanceTracker.unclassified.losses >
          0
            ? ` Unclassified settled bets: ${
                performanceTracker.unclassified.wins +
                performanceTracker.unclassified.losses
              }.`
            : ""}
          {performanceTracker.total.missingMoney > 0
            ? ` Missing money data: ${performanceTracker.total.missingMoney} settled bet${
                performanceTracker.total.missingMoney === 1 ? "" : "s"
              }.`
            : ""}
          {performanceTracker.duplicateRowsSkipped > 0
            ? ` Duplicate bet-ID rows skipped: ${performanceTracker.duplicateRowsSkipped}.`
            : ""}
        </div>
      </div>
    );
  }

  function renderPerformanceCategoryControls(row = {}) {
    if (!row?.id) return null;

    const explicit = normalizePerformanceCategory(
      row.performanceCategory || ""
    );
    const effective = getPerformanceCategoryForRow(row);
    const buttons = [
      ["hedge", "Hedge"],
      ["ev", "EV+"],
      ["fun", "Fun"],
    ];

    return (
      <div
        style={{
          marginTop: 7,
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <strong style={{ fontSize: 12, color: "#334155" }}>
          Performance category:
        </strong>

        {buttons.map(([value, label]) => {
          const active = explicit === value;

          return (
            <button
              key={`performance-category-${value}`}
              type="button"
              onClick={() => {
                handleRowFieldChange(
                  row.id,
                  "performanceCategory",
                  label
                );
                setReviewActionNotice(
                  `Performance category set to ${label}. Save or Confirm + Next to commit it.`
                );
              }}
              style={{
                ...smallButtonStyle,
                padding: "4px 8px",
                border: active
                  ? "2px solid #1d4ed8"
                  : "1px solid #cbd5e1",
                background: active ? "#dbeafe" : "#ffffff",
                color: active ? "#1e3a8a" : "#334155",
                fontWeight: 900,
              }}
            >
              {label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => {
            handleRowFieldChange(row.id, "performanceCategory", "");
            setReviewActionNotice(
              "Explicit performance category cleared. Confirmed hedge/source-tag fallback will still apply."
            );
          }}
          style={{
            ...smallButtonStyle,
            padding: "4px 8px",
            border: !explicit
              ? "2px solid #64748b"
              : "1px solid #cbd5e1",
            background: !explicit ? "#f1f5f9" : "#ffffff",
            color: "#334155",
            fontWeight: 850,
          }}
        >
          Auto / Unclassified
        </button>

        <span style={{ fontSize: 11, color: "#64748b", fontWeight: 750 }}>
          Currently:{" "}
          {effective === "hedge"
            ? "Hedge"
            : effective === "ev"
            ? "EV+"
            : effective === "fun"
            ? "Fun"
            : "Unclassified"}
        </span>
      </div>
    );
  }

  const rawPreviewRow = allReviewRows.find((row) => row.id === hoverPreview.rowId) || null;
  const previewRowDraft = rawPreviewRow?.id ? (reviewDraftByRowId[rawPreviewRow.id] || {}) : {};
  const previewRow = rawPreviewRow ? { ...rawPreviewRow, ...previewRowDraft } : null;

  // Performance note: auto-normalize-on-open was intentionally removed.
  // Use M / Build Normalize for the heavier normalization pass. Full-page edits
  // are now kept in a local draft and committed once on Save/Next/Confirm.

  useEffect(() => {
    if (!previewRow?.id) return;

    const dateFromRow = normalizeReviewDateValue(previewRow.betDate || "");
    const dateFromScreenshotName = !dateFromRow ? extractBetDateFromScreenshotName(previewRow) : "";
    const activeDate = dateFromRow || dateFromScreenshotName || "";
    const parts = getDateParts(activeDate);

    setReviewDateParts({
      rowId: previewRow.id,
      month: parts.month || "",
      day: parts.day || "",
      year: parts.year || "",
    });

    // Keep screenshot-name dates visible in draft review without immediately
    // committing the row. Confirm Date / Confirm + Next will save it.
    if (dateFromScreenshotName) {
      updateReviewDraft(previewRow.id, {
        betDate: dateFromScreenshotName,
        eventDate: previewRow.eventDate || dateFromScreenshotName,
      });
    }
  }, [previewRow?.id]);

  // Do not auto-focus the League input when a review row opens.
  // The blank review form should start with keyboard shortcuts active, so M can
  // normalize immediately without first leaving or clearing a text field.

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

  function getPlayerLastNameKeyForHedge(row = {}) {
    const source =
      row.playerLastName ||
      row.canonicalSubject ||
      row.canonicalPlayer ||
      row.selection ||
      "";

    return normalizeKnownPlayerKey(getLastNameFromText(source));
  }

  function getHedgeEventCompareKey(row = {}) {
    return normalizeKnownPlayerKey(
      row.fixtureEvent ||
        [row.participantANormalized, row.participantBNormalized]
          .filter(Boolean)
          .join(" @ ") ||
        [row.participantA, row.participantB]
          .filter(Boolean)
          .join(" @ ")
    );
  }

  function getLastNameHedgeCandidateRows(row = {}) {
    if (!row?.id) return [];

    const lastNameKey = getPlayerLastNameKeyForHedge(row);
    if (!lastNameKey) return [];

    const rowMarket = normalizePropMarketValue(
      row.propMarket || inferPropMarketFromRow(row) || ""
    );
    const rowEventKey = getHedgeEventCompareKey(row);
    const rowLeague = normalizeReviewLeagueKey(row.sportLeague || "");
    const rowBook = String(
      getDisplayedBookmaker(row) || row.bookmaker || ""
    )
      .trim()
      .toLowerCase();

    return allReviewRows.filter((candidate) => {
      if (!candidate?.id || candidate.id === row.id) return false;

      const candidateLastNameKey =
        getPlayerLastNameKeyForHedge(candidate);
      if (!candidateLastNameKey || candidateLastNameKey !== lastNameKey) {
        return false;
      }

      const candidateBook = String(
        getDisplayedBookmaker(candidate) ||
          candidate.bookmaker ||
          ""
      )
        .trim()
        .toLowerCase();

      if (rowBook && candidateBook && rowBook === candidateBook) {
        return false;
      }

      const candidateLeague = normalizeReviewLeagueKey(
        candidate.sportLeague || ""
      );
      if (
        rowLeague &&
        candidateLeague &&
        rowLeague !== candidateLeague
      ) {
        return false;
      }

      const candidateEventKey = getHedgeEventCompareKey(candidate);
      if (
        rowEventKey &&
        candidateEventKey &&
        rowEventKey !== candidateEventKey
      ) {
        return false;
      }

      const candidateMarket = normalizePropMarketValue(
        candidate.propMarket ||
          inferPropMarketFromRow(candidate) ||
          ""
      );

      if (
        rowMarket &&
        candidateMarket &&
        rowMarket !== candidateMarket
      ) {
        return false;
      }

      return true;
    });
  }

  function isRowInHedgeReviewContext(row = {}) {
    const tag = String(row.betSourceTag || "").trim().toLowerCase();
    const quality = String(row.hedgeQuality || "").trim().toLowerCase();

    return !!(
      row.likelyHedge === "Y" ||
      row.autoLikelyHedge === "Y" ||
      row.guaranteedProfit === "Y" ||
      row.hedgeClusterId ||
      row.hedgePartnerBookmaker ||
      row.hedgeOverride === "Y" ||
      tag === "hedge" ||
      tag === "middle" ||
      row.largeStakeHedgeReview === "Y" ||
      row.everHedgeCandidate === "Y" ||
      row.everLikelyHedge === "Y" ||
      row.hedgeCandidateIds ||
      quality.includes("hedge") ||
      quality.includes("middle") ||
      quality.includes("payout match") ||
      getIgnoredHedgePartnerIds(row).length > 0 ||
      getLastNameHedgeCandidateRows(row).length > 0
    );
  }

  function getDelimitedIdList(value = "") {
    return String(value || "")
      .split(/[,|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function getUnhandledHedgeCandidateIdsForReview(row = {}) {
    const candidateIds = getDelimitedIdList(row.hedgeCandidateIds);

    if (!candidateIds.length) return [];

    const ignoredIds = new Set(getIgnoredHedgePartnerIds(row));
    const confirmedIds = new Set(
      getDelimitedIdList(row.confirmedHedgePartnerIds || row.hedgePartnerIds)
    );

    return candidateIds.filter(
      (id) => id && !ignoredIds.has(id) && !confirmedIds.has(id)
    );
  }

  function rowHasUnresolvedHedgeDecision(row = {}) {
    if (!row) return false;

    const override = String(row.hedgeOverride || "").trim().toUpperCase();

    if (override === "Y" || override === "N") return false;

    const candidateIds = getDelimitedIdList(row.hedgeCandidateIds);
    const ignoredIds = getIgnoredHedgePartnerIds(row);

    // When candidate IDs are stored, only candidates that have not already
    // been confirmed or hidden as Not This Match should keep the row in review.
    if (candidateIds.length) {
      return getUnhandledHedgeCandidateIdsForReview(row).length > 0;
    }

    // Older rows may only retain the ignored partner IDs. Treat those hidden
    // pair decisions as complete instead of reopening Hedge Check forever.
    if (ignoredIds.length) return false;

    // A same-event player-prop last-name match is a possible hedge even when
    // OCR/parser first names differ. Review it manually instead of rewriting
    // either player's saved full name.
    if (getLastNameHedgeCandidateRows(row).length) return true;

    return !!(
      row.likelyHedge === "Y" ||
      row.autoLikelyHedge === "Y" ||
      row.guaranteedProfit === "Y" ||
      row.hedgeClusterId
    );
  }

  function getAllHedgeCandidateRows(row = {}) {
    if (!row?.id) return [];

    const candidates = [];
    const seen = new Set();
    const addCandidate = (candidate) => {
      if (!candidate?.id || candidate.id === row.id || seen.has(candidate.id)) return;
      seen.add(candidate.id);
      candidates.push(candidate);
    };

    const clusterId = String(row.hedgeClusterId || "").trim();
    const partnerBookText = String(row.hedgePartnerBookmaker || "").toLowerCase();

    // New hedge scan stores every candidate id, not just the primary/top pair.
    // This lets Not This Match hide exactly one pair while the other candidates remain visible.
    getDelimitedIdList(row.hedgeCandidateIds).forEach((id) => {
      addCandidate(allReviewRows.find((candidate) => candidate?.id === id));
    });

    if (clusterId) {
      allReviewRows.forEach((candidate) => {
        if (candidate?.hedgeClusterId === clusterId) addCandidate(candidate);
      });
    }

    // Always include pair-specific Not This Match partners so Undo has something
    // visible even if the visible candidate card is currently hidden.
    getIgnoredHedgePartnerIds(row).forEach((id) => {
      addCandidate(allReviewRows.find((candidate) => candidate?.id === id));
    });

    // Confirmed hedge rows can keep a partner list even when the current scan is stale.
    getDelimitedIdList(row.confirmedHedgePartnerIds || row.hedgePartnerIds).forEach((id) => {
      addCandidate(allReviewRows.find((candidate) => candidate?.id === id));
    });

    // Do not rewrite names to force a match. Same-event player props with the
    // same last name are surfaced as possible hedge candidates even when their
    // first names differ.
    getLastNameHedgeCandidateRows(row).forEach(addCandidate);

    // Fallback for older rows where the cluster ID did not persist but the partner
    // book text did. This is intentionally broad only inside the explicit
    // "Show Hedge Candidates" workflow.
    if (!candidates.length && partnerBookText) {
      allReviewRows.forEach((candidate) => {
        if (!candidate || candidate.id === row.id) return;
        const book = String(getDisplayedBookmaker(candidate) || candidate.bookmaker || "").toLowerCase();
        if (!book || !partnerBookText.includes(book)) return;

        const sameCluster =
          candidate.likelyHedge === "Y" ||
          candidate.autoLikelyHedge === "Y" ||
          candidate.hedgePartnerBookmaker ||
          candidate.hedgeQuality ||
          candidate.hedgeConfidence ||
          candidate.hedgeOverride === "Y";

        if (sameCluster) addCandidate(candidate);
      });
    }

    return candidates;
  }

  function getHedgePartnerRows(row = {}) {
    return getAllHedgeCandidateRows(row).filter((partner) => !isIgnoredHedgePair(row, partner));
  }

  function appendUniqueIds(value = "", ids = []) {
    const existing = String(value || "")
      .split(/[,|]/)
      .map((item) => item.trim())
      .filter(Boolean);

    const next = [...existing];

    ids.forEach((id) => {
      if (id && !next.includes(id)) next.push(id);
    });

    return next.join(",");
  }

  function removeDelimitedIds(value = "", idsToRemove = []) {
    const removeSet = new Set((idsToRemove || []).filter(Boolean));

    return String(value || "")
      .split(/[,|]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((id) => !removeSet.has(id))
      .join(",");
  }

  const HEDGE_COMPUTED_FIELDS = [
    "likelyHedge",
    "autoLikelyHedge",
    "hedgeClusterId",
    "hedgeClusterSize",
    "hedgePartnerBookmaker",
    "hedgeConfidence",
    "hedgeQuality",
    "guaranteedProfit",
    "guaranteedProfitAmount",
    "hedgeStake",
    "hedgeProfitLow",
    "hedgeProfitHigh",
    "hedgeProfitIfThisWins",
    "hedgeProfitIfOtherWins",
  ];

  function getIgnoredHedgePartnerIds(row = {}) {
    return String(row?.ignoredHedgePartnerIds || "")
      .split(/[,|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function isIgnoredHedgePair(rowA = {}, rowB = {}) {
    if (!rowA?.id || !rowB?.id) return false;

    const ignoredByA = getIgnoredHedgePartnerIds(rowA);
    const ignoredByB = getIgnoredHedgePartnerIds(rowB);

    return ignoredByA.includes(rowB.id) || ignoredByB.includes(rowA.id);
  }

  function getIgnoredHedgePartnerRows(row = {}) {
    if (!row?.id) return [];

    const ignoredIds = getIgnoredHedgePartnerIds(row);
    if (!ignoredIds.length) return [];

    return ignoredIds
      .map((id) => allReviewRows.find((candidate) => candidate?.id === id))
      .filter(Boolean);
  }

  function parseIgnoredHedgeSnapshots(row = {}) {
    try {
      const parsed = JSON.parse(row?.ignoredHedgePairSnapshotsJson || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function stringifyIgnoredHedgeSnapshots(value = {}) {
    const entries = Object.entries(value || {}).filter(([key]) => !!key);
    if (!entries.length) return "";
    return JSON.stringify(Object.fromEntries(entries));
  }

  function pickHedgeComputedFields(row = {}) {
    const picked = {};

    HEDGE_COMPUTED_FIELDS.forEach((field) => {
      picked[field] = row?.[field] ?? "";
    });

    return picked;
  }

  function makeIgnoredHedgeSnapshot(row = {}, partner = {}) {
    return {
      partnerId: partner?.id || "",
      partnerBookmaker: getDisplayedBookmaker(partner) || partner?.bookmaker || "",
      partnerSelection: partner?.selection || "",
      partnerEvent: partner?.fixtureEvent || "",
      partnerLeague: partner?.sportLeague || "",
      ignoredAt: new Date().toISOString(),
      rowFields: pickHedgeComputedFields(row),
      partnerFields: pickHedgeComputedFields(partner),
    };
  }

  function upsertIgnoredHedgeSnapshot(row = {}, partner = {}, snapshot = null) {
    if (!row?.id || !partner?.id) return "";

    const snapshots = parseIgnoredHedgeSnapshots(row);
    snapshots[partner.id] = snapshot || makeIgnoredHedgeSnapshot(row, partner);
    return stringifyIgnoredHedgeSnapshots(snapshots);
  }

  function removeIgnoredHedgeSnapshot(row = {}, partnerId = "") {
    if (!partnerId) return row?.ignoredHedgePairSnapshotsJson || "";

    const snapshots = parseIgnoredHedgeSnapshots(row);
    delete snapshots[partnerId];
    return stringifyIgnoredHedgeSnapshots(snapshots);
  }

  function getIgnoredHedgeMatchItems(row = {}) {
    const ignoredIds = getIgnoredHedgePartnerIds(row);
    if (!ignoredIds.length) return [];

    const snapshots = parseIgnoredHedgeSnapshots(row);

    return ignoredIds.map((id, index) => {
      const partner = allReviewRows.find((candidate) => candidate?.id === id) || null;
      const snapshot = snapshots[id] || {};
      const bookLabel = partner
        ? getDisplayedBookmaker(partner) || partner.bookmaker || "partner"
        : snapshot.partnerBookmaker || "partner";
      const selection = partner?.selection || snapshot.partnerSelection || "";
      const event = partner?.fixtureEvent || snapshot.partnerEvent || "";
      const context = [selection, event].filter(Boolean).join(" · ");

      return {
        id,
        partner,
        snapshot,
        label: `Possible hedge ${index + 1} hidden as not a match (${bookLabel}) — click to undo`,
        context,
      };
    });
  }

  function getIgnoredHedgeMatchLabel(row = {}) {
    const items = getIgnoredHedgeMatchItems(row);

    if (!items.length) return "";
    if (items.length === 1) return items[0].label;

    return `${items.length} possible hedge pairs hidden as not matches — click one below to undo`;
  }

  function resetIgnoredHedgeMatches(row = {}, explicitPartners = null) {
    if (!row?.id) return;

    const explicitArray = Array.isArray(explicitPartners)
      ? explicitPartners
      : explicitPartners?.id
      ? [explicitPartners]
      : [];

    const fallbackItem = !explicitArray.length ? getIgnoredHedgeMatchItems(row)[0] : null;
    const idsToReset = explicitArray.length
      ? explicitArray.map((partner) => partner.id).filter(Boolean)
      : fallbackItem?.id
      ? [fallbackItem.id]
      : [];

    if (!idsToReset.length) return;

    const rowSnapshots = parseIgnoredHedgeSnapshots(row);
    const rowUpdates = {
      ignoredHedgePartnerIds: removeDelimitedIds(row.ignoredHedgePartnerIds, idsToReset),
    };

    idsToReset.forEach((partnerId) => {
      const snapshot = rowSnapshots[partnerId];
      if (snapshot?.rowFields) {
        Object.assign(rowUpdates, snapshot.rowFields);
      }
      rowUpdates.ignoredHedgePairSnapshotsJson = removeIgnoredHedgeSnapshot(
        { ...row, ignoredHedgePairSnapshotsJson: rowUpdates.ignoredHedgePairSnapshotsJson ?? row.ignoredHedgePairSnapshotsJson },
        partnerId
      );
    });

    handleRowFieldsChange(row.id, rowUpdates);

    idsToReset.forEach((partnerId) => {
      const partner = allReviewRows.find((candidate) => candidate?.id === partnerId) || null;
      if (!partner) return;

      const reverseSnapshots = parseIgnoredHedgeSnapshots(partner);
      const reverseSnapshot = reverseSnapshots[row.id] || rowSnapshots[partnerId];
      const partnerUpdates = {
        ignoredHedgePartnerIds: removeDelimitedIds(partner.ignoredHedgePartnerIds, [row.id]),
        ignoredHedgePairSnapshotsJson: removeIgnoredHedgeSnapshot(partner, row.id),
      };

      if (reverseSnapshot?.partnerFields) {
        Object.assign(partnerUpdates, reverseSnapshot.partnerFields);
      } else if (reverseSnapshot?.rowFields && reverseSnapshot?.partnerId === row.id) {
        Object.assign(partnerUpdates, reverseSnapshot.rowFields);
      }

      handleRowFieldsChange(partner.id, partnerUpdates);
    });

    setReviewActionNotice("Undo complete. That possible hedge pair is visible again. If it does not appear, run Hedge Scan to recompute possible matches.");
  }

  function clearComputedHedgeFieldsForRow(rowId) {
    if (!rowId) return;

    handleRowFieldsChange(rowId, {
      likelyHedge: "N",
      autoLikelyHedge: "N",
      hedgeClusterId: "",
      hedgeClusterSize: "",
      hedgePartnerBookmaker: "",
      hedgeConfidence: "",
      hedgeQuality: "",
      guaranteedProfit: "N",
      guaranteedProfitAmount: "",
      hedgeStake: "",
      hedgeProfitLow: "",
      hedgeProfitHigh: "",
      hedgeProfitIfThisWins: "",
      hedgeProfitIfOtherWins: "",
    });
  }


  function clearRowFromHedgeReview(row = {}) {
    if (!row?.id) return;

    handleRowFieldsChange(row.id, {
      likelyHedge: "N",
      autoLikelyHedge: "N",
      hedgeOverride: "N",
      hedgeClusterId: "",
      hedgeClusterSize: "",
      hedgePartnerBookmaker: "",
      hedgeConfidence: "",
      hedgeQuality: "",
      guaranteedProfit: "N",
      guaranteedProfitAmount: "",
      hedgeStake: "",
      hedgeProfitLow: "",
      hedgeProfitHigh: "",
      hedgeProfitIfThisWins: "",
      hedgeProfitIfOtherWins: "",
      betSourceTag: ["hedge", "middle"].includes(String(row.betSourceTag || "").trim().toLowerCase()) ? "" : row.betSourceTag,
      reviewLater: row.reviewLater === "Y" ? "N" : row.reviewLater,
      lastHedgePairDecisionAt: new Date().toISOString(),
    });

    setShowHedgeCandidatesByRowId((prev) => ({
      ...prev,
      [row.id]: false,
    }));

    setReviewActionNotice("Cleared this row from Hedge Review. It can still be picked up again later if you run Hedge Scan and it qualifies.");
  }

  function clearConfirmedHedgeSourceTagIfNeeded(row = {}) {
    const tag = String(row.betSourceTag || "").trim().toLowerCase();

    if (tag === "hedge" || tag === "middle") {
      handleRowFieldChange(row.id, "betSourceTag", "");
    }
  }

  function ignoreCurrentHedgeMatch(row = {}, explicitPartner = null) {
    if (!row?.id) return;

    const visiblePartners = getHedgePartnerRows(row);
    const partners = explicitPartner?.id
      ? [explicitPartner]
      : visiblePartners.slice(0, 1);

    if (!partners.length) {
      setReviewActionNotice("No visible hedge match to hide. If this should still be a hedge, run Hedge Scan again.");
      return;
    }

    const partner = partners[0];
    const partnerIds = [partner.id].filter(Boolean);
    const rowSnapshot = makeIgnoredHedgeSnapshot(row, partner);
    const partnerSnapshot = makeIgnoredHedgeSnapshot(partner, row);

    // Pair-specific ignore only. Do NOT clear likelyHedge / cluster fields here.
    // Keeping the computed fields in place lets Undo immediately reveal the same
    // pair again without requiring a fresh hedge scan. The visible card hides the
    // pair by filtering getHedgePartnerRows() against ignoredHedgePartnerIds.
    handleRowFieldsChange(row.id, {
      ignoredHedgePartnerIds: appendUniqueIds(row.ignoredHedgePartnerIds, partnerIds),
      ignoredHedgePairSnapshotsJson: upsertIgnoredHedgeSnapshot(row, partner, rowSnapshot),
      hedgeOverride: "",
      lastHedgePairDecisionAt: new Date().toISOString(),
    });

    handleRowFieldsChange(partner.id, {
      ignoredHedgePartnerIds: appendUniqueIds(partner.ignoredHedgePartnerIds, [row.id]),
      ignoredHedgePairSnapshotsJson: upsertIgnoredHedgeSnapshot(partner, row, partnerSnapshot),
      hedgeOverride: "",
      lastHedgePairDecisionAt: new Date().toISOString(),
    });

    setReviewActionNotice(
      `Possible hedge pair hidden as not a match (${getDisplayedBookmaker(partner) || partner.bookmaker || "partner"}). Click the orange undo banner to show it again.`
    );
  }

  function cleanParsedParticipantName(value = "") {
    return cleanParticipantTextForMatching(value);
  }

  function inferParticipantsFromParsedText(row = {}) {
    const league = row.sportLeague || popupLeagueRef.current?.value || "";
    const fixtureText = String(row.fixtureEvent || row.eventName || "").trim();

    if (!fixtureText) {
      return { participantA: "", participantB: "", participantANormalized: "", participantBNormalized: "" };
    }

    const cleanedFixture = cleanParticipantTextForMatching(fixtureText);

    const parts = cleanedFixture
      .replace(/\s+[-–—]\s+/g, " @ ")
      .split(/\s+(?:@|vs\.?|v\.?|at)\s+/i)
      .map(cleanParsedParticipantName)
      .filter(Boolean);

    if (parts.length < 2) {
      return { participantA: "", participantB: "", participantANormalized: "", participantBNormalized: "" };
    }

    const participantA = parts[0];
    const participantB = parts.slice(1).join(" ");

    return {
      participantA,
      participantB,
      participantANormalized: normalizeParticipantName(participantA, league),
      participantBNormalized: normalizeParticipantName(participantB, league),
    };
  }

  function titleCaseParsedName(value = "") {
    const smallWords = new Set(["jr", "sr", "ii", "iii", "iv"]);
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .map((part) => {
        if (!part) return "";
        const lower = part.toLowerCase();

        if (smallWords.has(lower.replace(/\./g, ""))) return part.toUpperCase();

        return lower
          .split("-")
          .map((piece) => piece ? piece.charAt(0).toUpperCase() + piece.slice(1) : piece)
          .join("-");
      })
      .join(" ");
  }

  function cleanParsedPlayerCandidate(value = "") {
    return String(value || "")
      .replace(/\b(?:over|under|o\/u|u\/o|yes|no|total|to record|recorded|record|made|make|player|prop|moneyline|spread|run line|puck line|handicap|match result|cost)\b/gi, " ")
      .replace(/\b(?:anytime\s+goal\s*scorer|anytime\s+goalscorer|goal\s*scorer|goalscorer|score\s+a\s+goal|to\s+score|double[-\s]?double|triple[-\s]?double)\b/gi, " ")
      .replace(/\banytime\b(?=\s*$)/gi, " ")
      .replace(/\b\d+(?:\.\d+)?\+?\b/g, " ")
      .replace(/\b(?:points?|pts?|rebounds?|rebs?|assists?|asts?|threes?|3-?pointers?|pra|rbis?|hits?|home runs?|hrs?|strikeouts?|ks|saves?|shots on goal|sog|goals?)\b/gi, " ")
      .replace(/[^a-zA-Z.'-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isGenericPlayerSubjectLabel(value = "") {
    const text = String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) return true;

    return /^(?:anytime|goal scorer|goalscorer|anytime goal scorer|anytime goalscorer|score a goal|to score|double double|triple double|moneyline|spread|total|player prop|prop|yes|no|over|under|points|rebounds|assists|goals|threes|shots on goal|method of victory|method of win|decision|submission|ko tko|tko|knockout)$/.test(text);
  }

  function cleanPlayerSubjectForBuild(value = "") {
    let text = String(value || "")
      .replace(/[“”]/g, '"')
      .replace(/[’]/g, "'")
      .replace(/^[\s"'“”‘’*•·–—-]+/g, " ")
      .replace(/\b(?:made|make|o\s*\/?\s*u|u\s*\/?\s*o|over|under|yes|no|total|to record|recorded|record|player|prop|moneyline|spread|run line|puck line|handicap|match result|cost)\b/gi, " ")
      .replace(/\b(?:anytime\s+goal\s*scorer|anytime\s+goalscorer|goal\s*scorer|goalscorer|score\s+a\s+goal|to\s+score|double[-\s]?double|triple[-\s]?double)\b/gi, " ")
      .replace(/\banytime\b(?=\s*$)/gi, " ")
      .replace(/\b\d+(?:\.\d+)?\+?\b/g, " ")
      .replace(/\b(?:points?|pts?|rebounds?|rebs?|assists?|asts?|threes?|3-?pointers?|3\s*pointers?|three\s*pointers?|made threes?|made\s+3s|pra|rbis?|hits?|home runs?|hrs?|strikeouts?|ks|saves?|shots on goal|sog|goals?)\b/gi, " ")
      .replace(/[^a-zA-Z.'-]+/g, " ")
      .replace(/(^|\s)[-–—]+(?=\s|$)/g, " ")
      .replace(/[-–—]+$/g, " ")
      .replace(/^[-–—]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text || isGenericPlayerSubjectLabel(text)) return "";

    const parts = text.split(/\s+/).filter(Boolean);

    // OCR often leaves a trailing lone "i" or "l" after O/U text. Remove
    // trailing one-letter junk, but keep normal multi-letter name pieces.
    while (parts.length > 1 && /^[A-Za-z]$/.test(parts[parts.length - 1])) {
      parts.pop();
    }

    // Some books duplicate the player after a dash, like
    // "Kyle Kuzma - Kyle Kuzma -". Keep the first clean name-sized phrase.
    const cleaned = parts.join(" ").replace(/\s+/g, " ").trim();
    const repeated = cleaned.match(/^(.+?)\s+\1\b/i);
    const next = titleCaseParsedName(repeated ? repeated[1] : cleaned);

    return isGenericPlayerSubjectLabel(next) ? "" : next;
  }

  function playerPropSubjectLooksDirty(value = "") {
    const text = String(value || "").toLowerCase();

    return (
      isGenericPlayerSubjectLabel(text) ||
      /\b(?:made|make|o\s*\/?\s*u|u\s*\/?\s*o|over|under|moneyline|spread|match result|cost|anytime|goal\s*scorer|goalscorer|double[-\s]?double|triple[-\s]?double|points?|pts?|rebounds?|rebs?|assists?|asts?|threes?|3-?pointers?|shots on goal|sog|strikeouts?|home runs?|total bases?)\b/.test(text) ||
      /\d+(?:\.\d+)?/.test(text) ||
      text.length > 34
    );
  }

  function getSafePlayerSubject(value = "") {
    const cleaned = cleanPlayerSubjectForBuild(value);
    if (cleaned) return cleaned;

    const raw = String(value || "").trim();
    if (!raw) return "";

    // Do not let market labels become the player name. This prevents rows from
    // reverting to labels like "Anytime Goalscorer" after you manually type
    // the real player name.
    if (isGenericPlayerSubjectLabel(raw) || playerPropSubjectLooksDirty(raw)) return "";

    return cleanParticipantTextForMatching(raw);
  }

  function getLockedPlayerSubjectForRow(row = {}) {
    if (!row?.id) return "";

    const draft = reviewDraftByRowIdRef.current[row.id] || {};
    const wasUserEdited =
      manuallyEditedPlayerSubjectRowIdsRef.current.has(row.id) ||
      draft.playerSubjectUserEdited === "Y" ||
      row.playerSubjectUserEdited === "Y";

    if (!wasUserEdited) return "";

    const visibleValue = getRefValueForRow(popupSubjectRef, row.id);
    const visibleSubject = getSafePlayerSubject(visibleValue);
    if (visibleSubject) return visibleSubject;

    const draftSubject = getSafePlayerSubject(
      draft.canonicalSubject || draft.canonicalPlayer || ""
    );
    if (draftSubject) return draftSubject;

    const committedSubject = getSafePlayerSubject(
      row.canonicalSubject || row.canonicalPlayer || ""
    );
    return committedSubject || "";
  }

  function getVisiblePlayerSubjectForRow(row = {}) {
    if (!row?.id) return "";

    const visibleValue = getRefValueForRow(popupSubjectRef, row.id);

    if (!visibleValue) return "";

    return getPlayerSubjectForReviewLeague(row, visibleValue);
  }

  function getVisiblePlayerPropMarketForRow(row = {}) {
    if (!row?.id) return "";

    const visibleValue = getRefValueForRow(popupPropMarketRef, row.id);

    return normalizePropMarketValue(visibleValue || "");
  }

  function inferPlayerSubjectFromParsedText(row = {}) {
    const lockedSubject = getLockedPlayerSubjectForRow(row);
    if (lockedSubject) return lockedSubject;

    const visibleSubject = getVisiblePlayerSubjectForRow(row);
    if (visibleSubject) return visibleSubject;

    const sourceText = String(row.sourceText || "");
    const selection = String(row.selection || "");
    const marketDetail = String(row.marketDetail || "");

    const marketWords = "(?:points?|pts?|rebounds?|rebs?|reb|assists?|asts?|ast|assts?|asst|threes?|made threes?|3-?pointers?|3pt|3pts|3pm|3fgm|pra|p\\+r|p\\+a|r\\+a|double[-\\s]?double|dd|dbl\\s+dbl|triple[-\\s]?double|trpl\\s+dbl|shots on goal|sog|saves?|svs?|goals?|strikeouts?|ks|total bases?|tb|home runs?|hrs?|rbis?|hits?)";
    const yesNoGoalWords = "(?:anytime\\s+goal\\s*scorer|anytime\\s+goalscorer|goal\\s*scorer|goalscorer|score\\s+a\\s+goal|to\\s+score|double[-\\s]?double|triple[-\\s]?double)";

    const candidates = [sourceText, marketDetail, selection].filter(Boolean);

    for (const candidateText of candidates) {
      const patterns = [
        new RegExp(`\\b([A-Z][A-Za-z.'-]+(?:\\s+[A-Z][A-Za-z.'-]+){1,3})\\b(?:\\s+[+\\-]\\d{2,5}){0,3}[^A-Za-z0-9]{0,12}${yesNoGoalWords}\\b`, "i"),
        new RegExp(`\\b([A-Z][A-Za-z.'-]+(?:\\s+[A-Z][A-Za-z.'-]+){0,3})\\s+(?:total\\s+)?${marketWords}\\b`, "i"),
        new RegExp(`\\b([A-Z][A-Za-z.'-]+(?:\\s+[A-Z][A-Za-z.'-]+){0,3})\\s+(?:over|under)\\s+\\d+(?:\\.\\d+)?`, "i"),
        new RegExp(`\\b([A-Z][A-Za-z.'-]+(?:\\s+[A-Z][A-Za-z.'-]+){0,3})\\s*-\\s*(?:made\\s+)?${marketWords}\\b`, "i"),
      ];

      for (const pattern of patterns) {
        const match = String(candidateText || "").match(pattern);
        const raw = cleanPlayerSubjectForBuild(match?.[1] || "");

        if (raw && raw.length >= 3 && raw.split(" ").length <= 4) {
          return titleCaseParsedName(raw);
        }
      }
    }

    const existing = cleanPlayerSubjectForBuild(
      row.canonicalSubject || row.canonicalPlayer || ""
    );
    if (existing) return existing;

    const fallback = cleanPlayerSubjectForBuild(selection);
    if (fallback && fallback.length >= 3 && fallback.split(" ").length <= 4) {
      return titleCaseParsedName(fallback);
    }

    return "";
  }

  function normalizeKnownPlayerKey(value = "") {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanPlayerNameForLibrary(value = "", options = {}) {
    const { allowSingleWord = false } = options;
    const cleaned = cleanParsedPlayerCandidate(value)
      .replace(/^[^a-zA-Z]+/g, "")
      .replace(/[^a-zA-Z.'’\-\s]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned) return "";

    const parts = cleaned.split(/\s+/).filter(Boolean);

    // One-word subjects are normally too risky for future auto-detection.
    // MMA/UFC and Tennis/ATP/WTA are the only exceptions because the review
    // workflow intentionally stores those player subjects by last name only.
    if (parts.length < 2 && !allowSingleWord) return "";

    const disallowed = new Set([
      "over",
      "under",
      "points",
      "rebounds",
      "assists",
      "threes",
      "made",
      "player",
      "prop",
      "total",
      "moneyline",
      "spread",
      "cost",
    ]);

    if (parts.some((part) => disallowed.has(part.toLowerCase()))) return "";

    return titleCaseParsedName(cleaned);
  }

  function getRowTextForKnownPlayerSearch(row = {}) {
    const values = [row.selection, row.marketDetail, row.sourceText];

    if (row.playerSubjectUserEdited === "Y") {
      values.push(row.canonicalSubject, row.canonicalPlayer);
    }

    return values.filter(Boolean).join(" ");
  }

  function findExplicitFullPlayerNameInCurrentRow(
    row = {},
    lastNameValue = ""
  ) {
    const lastName = cleanPlayerSubjectForBuild(lastNameValue || "");
    const lastNameParts = String(lastName || "")
      .split(/\s+/)
      .filter(Boolean);
    const finalLastName =
      lastNameParts[lastNameParts.length - 1] ||
      getLastNameFromText(lastNameValue || "");

    if (!finalLastName) return "";

    const escapedLastName = finalLastName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
    const fullNamePattern = new RegExp(
      `\\b([A-Z][A-Za-z.'’\\-]{1,30})\\s+(${escapedLastName})\\b`,
      "i"
    );
    const disallowedFirstWords = new Set([
      "anytime",
      "over",
      "under",
      "player",
      "total",
      "final",
      "points",
      "rebounds",
      "assists",
      "threes",
      "goals",
      "saves",
      "game",
      "games",
    ]);

    const sources = [
      row.sourceText,
      row.marketDetail,
      row.rawSelection,
      row.selection,
    ].filter(Boolean);

    for (const sourceText of sources) {
      const match = String(sourceText || "").match(fullNamePattern);
      const firstName = String(match?.[1] || "").trim();
      const matchedLastName = String(match?.[2] || "").trim();

      if (!firstName || !matchedLastName) continue;
      if (disallowedFirstWords.has(firstName.toLowerCase())) continue;

      return titleCaseParsedName(`${firstName} ${matchedLastName}`);
    }

    return "";
  }

  function findKnownPlayerMatchForRow(row = {}) {
    const textKey = normalizeKnownPlayerKey(getRowTextForKnownPlayerSearch(row));
    const allowSingleWord = isLastNameOnlyPlayerLeague(
      getPreviewLeagueValue(row)
    );

    if (!textKey) return null;

    const sorted = [...knownPlayerNames]
      .filter((item) => item?.name)
      .sort((a, b) => String(b.name || "").length - String(a.name || "").length);

    for (const item of sorted) {
      const key = normalizeKnownPlayerKey(item.name);
      if (!key || (key.split(" ").length < 2 && !allowSingleWord)) continue;

      const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const pattern = new RegExp(`(^|\\s)${safeKey}(?=\\s|$)`, "i");
      if (pattern.test(textKey)) return item;
    }

    // Safer last-name fallback: only use this when the row already has a real
    // matchup/context and the last name is unique in the learned player library.
    // This catches screenshots that OCR only as "Mobley" after you have once
    // confirmed "Evan Mobley" as a player prop.
    if (rowHasTwoIdentifiedParticipants(row)) {
      const tokens = new Set(textKey.split(" ").filter(Boolean));
      const lastNameMatches = [];

      for (const item of sorted) {
        const name = cleanPlayerNameForLibrary(item.name || "", {
          allowSingleWord,
        });
        const lastName = normalizeKnownPlayerKey(item.lastName || getLastNameFromText(name));

        if (!name || !lastName || !tokens.has(lastName)) continue;

        const explicitFullName = findExplicitFullPlayerNameInCurrentRow(
          row,
          lastName
        );

        // Current screenshot/OCR text is authoritative. Do not turn
        // "Klay Thompson" into a learned player such as "Ausar Thompson"
        // merely because the last name matches.
        if (
          explicitFullName &&
          normalizeKnownPlayerKey(explicitFullName) !==
            normalizeKnownPlayerKey(name)
        ) {
          continue;
        }

        const sameLastNameCount = sorted.filter((candidate) => {
          const candidateLast = normalizeKnownPlayerKey(
            candidate?.lastName || getLastNameFromText(candidate?.name || "")
          );
          return candidateLast === lastName;
        }).length;

        if (sameLastNameCount === 1) {
          lastNameMatches.push({ ...item, name });
        }
      }

      if (lastNameMatches.length === 1) return lastNameMatches[0];
    }

    return null;
  }

  function applyKnownPlayerMatchToRow(row = {}, options = {}) {
    if (!row?.id) return null;

    const { updateRefs = true } = options;
    const match = findKnownPlayerMatchForRow(row);

    if (!match?.name) return null;

    const name = cleanPlayerNameForReviewRow(match.name, row);
    if (!name) return null;

    const lastName = getLastNameFromText(name);

    const playerUpdates = {
      reviewBetKind: "player_prop",
      betType: "player prop",
      canonicalMarketContext: "player prop",
      canonicalSubject: name,
      playerLastName: lastName,
    };

    if (match.league && !row.sportLeague) {
      playerUpdates.sportLeague = match.league;
      if (popupLeagueRef.current) popupLeagueRef.current.value = match.league;
    }

    applyRowFieldUpdates(row.id, playerUpdates);

    if (updateRefs) {
      if (popupSubjectRef.current) popupSubjectRef.current.value = name;
      if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = "";
      if (popupBetTypeRef.current) popupBetTypeRef.current.value = "player prop";
      if (popupMarketContextRef.current) popupMarketContextRef.current.value = "player prop";
    }

    return { ...match, name, lastName };
  }

  function rememberConfirmedPlayerProp(row = {}) {
    if (!row?.id) return;

    const betType = String(
      popupBetTypeRef.current?.value || row.betType || row.reviewBetKind || ""
    ).toLowerCase();

    const isPlayerProp =
      betType.includes("player") ||
      row.reviewBetKind === "player_prop" ||
      String(row.canonicalMarketContext || "").toLowerCase().includes("player");

    if (!isPlayerProp) return;

    const rawName =
      getRefValueForRow(popupSubjectRef, row.id) ||
      row.canonicalSubject ||
      row.canonicalPlayer ||
      "";

    const league = getPreviewLeagueValue(row);
    const name = cleanPlayerNameForReviewRow(rawName, row);
    if (!name) return;

    const key = normalizeKnownPlayerKey(name);
    const now = new Date().toISOString();
    const propMarket = normalizePropMarketValue(
      popupPropMarketRef.current?.value || row.propMarket || ""
    );

    const withoutExisting = knownPlayerNames.filter(
      (item) => normalizeKnownPlayerKey(item?.name || "") !== key
    );

    const existing = knownPlayerNames.find(
      (item) => normalizeKnownPlayerKey(item?.name || "") === key
    );

    const nextEntry = {
      ...(existing || {}),
      name,
      lastName: getLastNameFromText(name),
      league: league || existing?.league || "",
      lastPropMarket: propMarket || existing?.lastPropMarket || "",
      count: Number(existing?.count || 0) + 1,
      updatedAt: now,
    };

    persistKnownPlayerNames([nextEntry, ...withoutExisting]);
  }

  function isPlayerPropMarketText(value = "") {
    return /\b(points?|pts?|rebounds?|rebs?|reb|assists?|asts?|ast|assts?|asst|threes?|3-?pointers?|three\s*pointers?|made\s+threes?|made\s+3s|3pt|3pts|3pm|3fgm|pra|p\s*\+\s*r|p\s*\+\s*a|r\s*\+\s*a|points?\s*\+\s*rebounds?|points?\s*\+\s*assists?|rebounds?\s*\+\s*assists?|double[-\s]?double|dd|dbl\s+dbl|triple[-\s]?double|trpl\s+dbl|to\s+record|record\s+a|anytime|first\s+basket|shots on goal|sog|saves?|svs?|goals?|strikeouts?|ks|total bases?|tb|home runs?|hrs?|rbis?|hits?|method of victory|method of win|winning method|win method|mov)\b/i.test(String(value || ""));
  }

  function getGamePropMarketLabel(value = "") {
    const text = String(value || "")
      .toLowerCase()
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) return "";

    const minuteValueToWord = {
      ten: "ten",
      "10": "ten",
      fifteen: "fifteen",
      "15": "fifteen",
      twenty: "twenty",
      "20": "twenty",
    };

    const goalWindowMatch =
      text.match(
        /\b(?:a\s+)?goals?\s+(?:scored\s+)?(?:in|within)\s+(?:the\s+)?(?:first|1st)\s+(ten|10|fifteen|15|twenty|20)\s*(?:minutes?|mins?|min)\b/i
      ) ||
      text.match(
        /\b(?:first|1st)\s+(ten|10|fifteen|15|twenty|20)\s*(?:minutes?|mins?|min)\b[^\n|]{0,60}\bgoals?\b/i
      );

    if (goalWindowMatch) {
      const rawMinutes = String(goalWindowMatch[1] || "").toLowerCase();
      const minutesWord = minuteValueToWord[rawMinutes] || rawMinutes;
      return `goals in first ${minutesWord} minutes`;
    }

    if (/\bboth\s+teams\s+to\s+score\b/i.test(text)) return "both teams to score";
    if (/\bteam\s+to\s+score\s+first\b/i.test(text)) return "team to score first";
    if (/\bfirst\s+goal\b/i.test(text)) return "first goal";
    if (/\blast\s+goal\b/i.test(text)) return "last goal";
    if (/\bcorrect\s+score\b/i.test(text)) return "correct score";
    if (/\bwinning\s+margin\b/i.test(text)) return "winning margin";
    if (/\bmethod\s+of\s+first\s+basket\b/i.test(text)) return "method of first basket";

    return "";
  }


  function formatGamePropMarketLabel(value = "") {
    const smallWords = new Set(["in", "of", "the", "to", "and"]);

    return String(value || "")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((word, index) =>
        index > 0 && smallWords.has(word)
          ? word
          : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join(" ");
  }

  function buildGamePropSelection(
    marketValue = "",
    outcomeValue = "",
    fallbackSelection = ""
  ) {
    const combinedMarketText = [marketValue, fallbackSelection]
      .filter(Boolean)
      .join(" ");

    const market =
      getGamePropMarketLabel(combinedMarketText) ||
      cleanSelectionTextForReview(marketValue).toLowerCase();

    const outcome = normalizeSelectionSide(
      [outcomeValue, fallbackSelection].filter(Boolean).join(" ")
    );

    if (!market) {
      return cleanSelectionTextForReview(fallbackSelection);
    }

    const marketLabel = formatGamePropMarketLabel(market);

    if (["Yes", "No"].includes(outcome)) {
      return `${marketLabel}: ${outcome}`;
    }

    const existing = cleanSelectionTextForReview(fallbackSelection);

    if (existing && getGamePropMarketLabel(existing)) {
      return existing;
    }

    return marketLabel;
  }

  function textLooksLikeGameProp(value = "") {
    return !!getGamePropMarketLabel(value);
  }

  function rowHasTwoIdentifiedParticipants(row = {}) {
    const choices = getMainLineParticipantChoices(row);
    return choices.filter((choice) => String(choice?.display || "").trim()).length >= 2;
  }

  function getLikelyPlayerSubjectCandidate(row = {}) {
    if (!rowHasTwoIdentifiedParticipants(row)) return "";

    const sources = [
      getRefValueForRow(popupSubjectRef, row.id),
      row.canonicalSubject,
      row.canonicalPlayer,
      row.playerName,
      row.selection,
      row.marketDetail,
      row.sourceText,
    ].filter(Boolean);

    for (const source of sources) {
      const candidate = cleanPlayerSubjectForBuild(source);

      if (!candidate) continue;
      if (candidate.length < 3 || candidate.length > 34) continue;
      if (candidate.split(/\s+/).length > 4) continue;
      if (/\d/.test(candidate)) continue;
      if (/\b(?:over|under|yes|no|moneyline|spread|total|player|prop|points|rebounds|assists|threes|made|o\s*\/\s*u|u\s*\/\s*o)\b/i.test(candidate)) continue;
      if (normalizeSelectionSide(candidate) || isDrawSideValue(candidate)) continue;
      if (findParticipantMatchForSide(candidate, row)) continue;

      return titleCaseParsedName(candidate);
    }

    return "";
  }

  function rowShouldDefaultToPlayerProp(row = {}) {
    const currentLeague = getPreviewLeagueValue(row);
    const betTypeText = String(row.betType || row.canonicalMarketContext || row.reviewMarketType || "").toLowerCase();

    // Soccer rows in this app are main-line only. Do not auto-promote a
    // soccer moneyline/spread/total to player prop just because a club name
    // looks like a standalone person/team name. Manual Player Prop still works
    // if the user explicitly chooses it.
    if (isSoccerLeagueForReview(currentLeague) && !betTypeText.includes("player prop")) {
      return false;
    }

    if (!rowHasTwoIdentifiedParticipants(row)) return false;

    const candidate = getLikelyPlayerSubjectCandidate(row);
    if (!candidate) return false;

    const combined = [
      popupMarketContextRef.current?.value,
      popupPropMarketRef.current?.value,
      row.betType,
      row.canonicalMarketContext,
      row.marketDetail,
      row.propMarket,
      row.selection,
      row.sourceText,
    ].filter(Boolean).join(" ");

    if (isPlayerPropMarketText(combined)) return true;

    const betType = String(row.betType || "").toLowerCase();

    // If a row has a matchup plus a standalone name where a team side should be,
    // it is more likely a misclassified player prop than a moneyline/spread/total.
    if (/moneyline|spread|total|straight/.test(betType)) {
      const sideText = popupMainLineSideRef.current?.value || row.mainLineSide || row.selection || "";
      return !!getLikelyPlayerSubjectCandidate({ ...row, selection: sideText });
    }

    return false;
  }

  function isMainLineMarketText(value = "") {
    return /\b(moneyline|match winner|winner|spread|run line|puck line|handicap|total|totals|game total|team total|over\/under|o\/u)\b/i.test(String(value || ""));
  }

  function textLooksLikeMainLineTotal(value = "") {
    const text = String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    if (!text) return false;

    if (/\b(total|totals|game total|team total|over\/under|o\/u)\b/.test(text)) return true;

    // Main-line totals often OCR as just "Under 230.5" or "Over 5.5".
    // Player props are still protected by getReviewBetKind's player-prop check.
    if (/\b(over|under|o|u)\s*\d+(?:\.\d+)?\b/.test(text)) return true;

    return false;
  }

  function sideValueIsTotalSide(value = "") {
    return ["Over", "Under"].includes(normalizeSelectionSide(value));
  }

  function normalizeMainLineMarket(value = "") {
    const text = String(value || "").toLowerCase().replace(/\s+/g, " ").trim();

    if (!text) return "";
    if (/moneyline|match winner|winner/.test(text)) return "moneyline";
    if (textLooksLikeMainLineTotal(text)) return "total";
    if (/spread|run line|puck line|handicap/.test(text)) return "spread";
    if (/[a-z].*[+-]\d+(?:\.\d+)?/.test(text) || /\b[+-]\d+(?:\.\d+)?\b/.test(text)) return "spread";

    return "";
  }

  function inferMainLineMarketFromRow(row = {}) {
    const sideSources = [
      popupMainLineSideRef.current?.value,
      row.mainLineSide,
      row.selection,
      row.marketDetail,
      row.canonicalMarketContext,
    ];

    // If the visible/parsed side is Over or Under, that should override stale
    // spread/moneyline values left in Market Type / Bet Type fields.
    if (sideSources.some(sideValueIsTotalSide)) return "total";

    const totalSources = [
      row.reviewMarketType,
      row.canonicalMarketContext,
      row.marketDetail,
      row.selection,
      row.sourceText,
      popupMarketContextRef.current?.value,
      popupPropMarketRef.current?.value,
    ];

    if (totalSources.some(textLooksLikeMainLineTotal)) return "total";

    const sources = [
      popupMarketContextRef.current?.value,
      popupPropMarketRef.current?.value,
      row.reviewMarketType,
      row.betType,
      row.canonicalMarketContext,
      row.marketDetail,
      row.selection,
      row.sourceText,
    ];

    for (const source of sources) {
      const market = normalizeMainLineMarket(source);
      if (market) return market;
    }

    return "";
  }

  function extractMainLineSideAndLineFromText(value = "", participants = {}) {
    const text = String(value || "").replace(/\s+/g, " ").trim();

    if (!text) return { side: "", line: "" };

    const total = text.match(/\b(over|under|o|u)\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (total) {
      return {
        side: normalizeSelectionSide(total[1]),
        line: total[2],
      };
    }

    const spread = text.match(/\b([A-Za-z][A-Za-z0-9 .&'’/-]{1,50}?)\s*([+-]\d+(?:\.\d+)?)\b/);
    if (spread) {
      return {
        side: cleanParsedParticipantName(spread[1]),
        line: spread[2],
      };
    }

    const signed = text.match(/\b([+-]\d+(?:\.\d+)?)\b/);
    if (signed) {
      return {
        side: participants.participantB || participants.participantA || "",
        line: signed[1],
      };
    }

    return { side: "", line: "" };
  }

  function cleanMainLineLineValue(value = "", market = "") {
    const text = String(value || "").trim();

    if (!text || /^blank$/i.test(text) || /^none$/i.test(text) || /^n\/a$/i.test(text)) return "";
    if (String(market || "").toLowerCase() === "moneyline") return "";

    return text;
  }

  function getVisibleMainLineLineForRow(row = {}, market = "") {
    const cleanMarket = normalizeMainLineMarket(market || "") || market;
    const visibleLine = getRefValueForRow(popupMainLineLineRef, row.id);
    const storedLine = String(row.mainLineLine || "").trim();

    const sources = [
      row.selection,
      row.marketDetail,
      row.rawSelection,
      row.sourceText,
    ];

    let inferredLine = "";

    for (const source of sources) {
      const parsed = extractMainLineSideAndLineFromText(source || "", {
        participantA: row.participantA || row.participantANormalized || "",
        participantB: row.participantB || row.participantBNormalized || "",
      });

      if (parsed.line) {
        inferredLine = parsed.line;
        break;
      }
    }

    return cleanMainLineLineValue(
      visibleLine || storedLine || inferredLine,
      cleanMarket
    );
  }

  function getMainLineSelectionPlaceholder(market = "", side = "") {
    const cleanMarket = String(market || "").toLowerCase();
    const cleanSide = String(side || "").trim();

    if (cleanMarket === "moneyline") return cleanSide || "Selected side/team";
    if (cleanMarket === "spread") return `${cleanSide || "Team"} +3.5`;
    if (cleanMarket === "total") return "Over 8.5";

    return "Clean selection";
  }

  function buildCanonicalMainLineSelection(
    row = {},
    marketValue = "",
    sideValue = "",
    lineValue = ""
  ) {
    const market =
      normalizeMainLineMarket(marketValue || "") ||
      String(marketValue || "").trim().toLowerCase();
    const normalizedSide = normalizeMainLineSideValue(
      sideValue || "",
      row,
      market
    );
    const league = getPreviewLeagueValue(row);
    const side =
      market !== "total" &&
      isLastNameOnlyPlayerLeague(league) &&
      normalizedSide
        ? titleCaseParsedName(getLastNameFromText(normalizedSide))
        : normalizedSide;
    const line = cleanMainLineLineValue(lineValue || "", market);

    if (market === "moneyline") return side;

    if (market === "spread" && side && line) {
      return cleanSelectionTextForReview(`${side} ${line}`);
    }

    if (market === "total" && line) {
      const totalSide = normalizeSelectionSide(side);
      if (["Over", "Under"].includes(totalSide)) {
        return cleanSelectionTextForReview(`${totalSide} ${line}`);
      }
    }

    return "";
  }

  function inferMainLineSideAndLine(row = {}) {
    const participants = inferParticipantsFromParsedText(row);
    const explicitLine = String(row.mainLineLine || "").trim();
    const explicitMarket = normalizeMainLineMarket(
      row.reviewMarketType || row.betType || row.marketDetail || ""
    );
    const explicitSide = normalizeMainLineSideValue(
      row.mainLineSide || "",
      row,
      explicitMarket
    );

    const explicitSideIsValid =
      explicitMarket === "total"
        ? ["Over", "Under"].includes(normalizeSelectionSide(explicitSide))
        : isDrawSideValue(explicitSide) ||
          !!findParticipantMatchForSide(explicitSide, row) ||
          getMainLineParticipantChoices(row).length === 0;

    if (explicitSide && explicitSideIsValid) {
      return {
        side: explicitSide,
        line: explicitLine,
      };
    }

    const sources = [
      row.selection,
      row.marketDetail,
      row.canonicalMarketContext,
      row.sourceText,
    ];

    for (const source of sources) {
      const parsed = extractMainLineSideAndLineFromText(source, participants);
      if (!parsed.side && !parsed.line) continue;

      const parsedSide = normalizeMainLineSideValue(
        parsed.side || "",
        row,
        explicitMarket
      );
      const matchedSide =
        explicitMarket === "total"
          ? normalizeSelectionSide(parsedSide)
          : findParticipantMatchForSide(parsedSide, row)?.display || parsedSide;

      if (matchedSide || parsed.line) {
        return {
          side: matchedSide,
          line: parsed.line || explicitLine,
        };
      }
    }

    return { side: explicitSideIsValid ? explicitSide : "", line: explicitLine };
  }

  function parseParlayLegs(row = {}) {
    const raw = row.parlayLegsJson || row.parlayLegs || "";

    if (Array.isArray(raw)) return raw.filter(Boolean);

    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  function serializeParlayLegs(legs = []) {
    return JSON.stringify((legs || []).filter(Boolean));
  }

  function getParlayLegSummary(leg = {}) {
    const selection = cleanSelectionTextForReview(leg.selection || "");
    const event = cleanSelectionTextForReview(leg.fixtureEvent || leg.event || "");
    const league = String(leg.sportLeague || leg.league || "").trim();
    const pieces = [selection, event, league].filter(Boolean);
    return pieces.join(" · ") || "Incomplete leg";
  }

  function getReviewLeagueDisplayLabel(row = {}) {
    const raw = String(getPreviewLeagueValue(row)).trim();

    const key = raw
      .toLowerCase()
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const labels = {
      nba: "NBA",
      wnba: "WNBA",
      ncaam: "NCAAM",
      ncaaw: "NCAAW",
      ncaaf: "NCAAF",
      nfl: "NFL",
      nhl: "NHL",
      mlb: "MLB",
      baseball: "Baseball",
      mma: "MMA",
      ufc: "UFC",
      soccer: "Soccer",
      tennis: "Tennis",
      golf: "Golf",
      multi: "Multi-Sport",
      "multi sport": "Multi-Sport",
    };

    if (labels[key]) return labels[key];
    if (!raw) return "Multi-Sport";

    return raw
      .split(/\s+/)
      .filter(Boolean)
      .map((part) =>
        part.length <= 5 && /^[a-z0-9]+$/i.test(part)
          ? part.toUpperCase()
          : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      )
      .join(" ");
  }

  function getParlaySummaryLabel(row = {}) {
    return `${getReviewLeagueDisplayLabel(row)} Parlay`;
  }

  function getPromoSpecialEventLabel(row = {}) {
    return `${getReviewLeagueDisplayLabel(row)} Promo Special`;
  }

  function applyParlaySummaryLabels(row = {}, extraUpdates = {}) {
    if (!row?.id) return "";

    const label = getParlaySummaryLabel(row);

    if (popupSelectionRef.current) popupSelectionRef.current.value = label;
    if (popupFixtureRef.current) popupFixtureRef.current.value = label;
    if (popupBetTypeRef.current) popupBetTypeRef.current.value = "parlay";
    if (popupMarketContextRef.current) popupMarketContextRef.current.value = "parlay";

    applyRowFieldUpdates(row.id, {
      reviewBetKind: "parlay",
      betType: "parlay",
      canonicalMarketContext: "parlay",
      reviewMarketType: "parlay",
      selection: label,
      fixtureEvent: label,
      ...extraUpdates,
    });

    return label;
  }

  function skipParlayLegEntry(row = {}) {
    if (!row?.id) return;

    const legs = parseParlayLegs(row);
    const label = applyParlaySummaryLabels(row, {
      parlayLegsSkipped: "Y",
      parlayLegsConfirmed: "N",
      parlayLegCount: legs.length ? String(legs.length) : "",
    });

    setReviewActionNotice(
      `${label} saved as a summary-only parlay. Individual legs were not required.`
    );
  }

  function resumeParlayLegEntry(row = {}) {
    if (!row?.id) return;

    handleRowFieldChange(row.id, "parlayLegsSkipped", "N");
    setReviewActionNotice("Individual parlay-leg entry reopened.");
  }

  function getDefaultParlayLegDraft(row = {}) {
    const inferredLeague = row?.sportLeague || popupLeagueRef.current?.value || "";
    const rawEvent = popupFixtureRef.current?.value || row?.fixtureEvent || "";
    const inferredEvent = /\bparlay$/i.test(String(rawEvent || "").trim())
      ? ""
      : rawEvent;

    return {
      legType: "main_line",
      sportLeague: inferredLeague,
      fixtureEvent: inferredEvent,
      market: "moneyline",
      selectedSide: "",
      line: "",
      subject: "",
      propMarket: "",
      outcome: "",
      selection: "",
    };
  }

  function getParlayLegDraft(row = {}) {
    if (!row?.id) return getDefaultParlayLegDraft(row);
    return parlayLegDraftByRowId[row.id] || getDefaultParlayLegDraft(row);
  }

  function setParlayLegDraftField(rowId, field, value) {
    if (!rowId) return;

    setParlayLegDraftByRowId((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || {}),
        [field]: value,
      },
    }));
  }

  function normalizeParlayLegSide(value = "", row = {}, draft = {}) {
    const market = normalizeMainLineMarket(draft.market || "");

    if (market === "total") return normalizeSelectionSide(value || "");

    return normalizeParticipantName(value, draft.sportLeague || row.sportLeague || "") || cleanParticipantTextForMatching(value);
  }

  function buildParlayLegSelection(row = {}, draft = {}) {
    const legType = String(draft.legType || "main_line");
    const manualSelection = cleanSelectionTextForReview(draft.selection || "");

    if (legType === "other") return manualSelection;

    if (legType === "main_line") {
      const market = normalizeMainLineMarket(draft.market || "moneyline") || "moneyline";
      const side = normalizeParlayLegSide(draft.selectedSide || "", row, { ...draft, market });
      const line = cleanMainLineLineValue(draft.line || "", market);

      if (market === "moneyline") return side;
      if (market === "spread" && side && line) return `${side} ${line}`.replace(/\s+/g, " ").trim();
      if (market === "total" && side && line) return `${normalizeSelectionSide(side)} ${line}`.replace(/\s+/g, " ").trim();

      return manualSelection;
    }

    if (legType === "player_prop") {
      const subject = cleanParticipantTextForMatching(draft.subject || "");
      const propMarket = normalizePropMarketValue(draft.propMarket || "");
      const outcome = normalizeSelectionSide(draft.outcome || manualSelection || "");
      const line = String(draft.line || "").trim();

      if (!subject || !propMarket) return manualSelection;

      if (isYesNoPlayerPropMarket(propMarket) || ["Yes", "No"].includes(outcome)) {
        if (!["Yes", "No"].includes(outcome)) return manualSelection;
        return cleanSelectionTextForReview(`${subject} ${outcome} ${propMarket}`);
      }

      if (line && /\+$/.test(line)) return cleanSelectionTextForReview(`${subject} ${line} ${propMarket}`);
      if (line && ["Over", "Under"].includes(outcome)) return cleanSelectionTextForReview(`${subject} ${outcome} ${line} ${propMarket}`);

      return manualSelection;
    }

    return manualSelection;
  }

  function confirmParlayLegForCurrentRow(row = {}) {
    if (!row?.id) return;

    const existingLegs = parseParlayLegs(row);
    const draft = getParlayLegDraft(row);
    const legIndex = existingLegs.length + 1;
    const selection = buildParlayLegSelection(row, draft);
    const league = draft.sportLeague || row.sportLeague || "";
    const rowEvent = /\bparlay$/i.test(String(row.fixtureEvent || "").trim())
      ? ""
      : row.fixtureEvent || "";
    const event = draft.fixtureEvent || rowEvent;

    if (!selection) {
      window.alert("Enter enough leg info to build a leg selection, or type the leg selection manually.");
      return;
    }

    const nextLeg = {
      id: `leg-${Date.now()}-${legIndex}`,
      legIndex,
      legType: draft.legType || "main_line",
      sportLeague: league,
      fixtureEvent: event,
      market: draft.legType === "player_prop" ? normalizePropMarketValue(draft.propMarket || "") : normalizeMainLineMarket(draft.market || "") || draft.market || "",
      selectedSide: normalizeParlayLegSide(draft.selectedSide || "", row, draft),
      line: cleanMainLineLineValue(draft.line || "", draft.market || ""),
      subject: cleanParticipantTextForMatching(draft.subject || ""),
      propMarket: normalizePropMarketValue(draft.propMarket || ""),
      outcome: normalizeSelectionSide(draft.outcome || ""),
      selection,
      confirmed: "Y",
    };

    const nextLegs = [...existingLegs, nextLeg].map((leg, index) => ({
      ...leg,
      legIndex: index + 1,
    }));

    applyParlaySummaryLabels(row, {
      parlayLegsJson: serializeParlayLegs(nextLegs),
      parlayLegCount: String(nextLegs.length),
      parlayLegsConfirmed: "N",
      parlayLegsSkipped: "N",
    });

    setParlayLegDraftByRowId((prev) => ({
      ...prev,
      [row.id]: {
        ...getDefaultParlayLegDraft(row),
        sportLeague: league,
        fixtureEvent: event,
      },
    }));

    setReviewActionNotice(`Confirmed parlay leg ${legIndex}. Enter leg ${legIndex + 1}, or click All Legs Entered.`);
  }

  function removeParlayLeg(row = {}, legIndexToRemove = 0) {
    if (!row?.id) return;

    const nextLegs = parseParlayLegs(row)
      .filter((leg) => Number(leg.legIndex) !== Number(legIndexToRemove))
      .map((leg, index) => ({ ...leg, legIndex: index + 1 }));

    handleRowFieldChange(row.id, "parlayLegsJson", serializeParlayLegs(nextLegs));
    handleRowFieldChange(row.id, "parlayLegCount", nextLegs.length ? String(nextLegs.length) : "");
    handleRowFieldChange(row.id, "parlayLegsConfirmed", "N");
    handleRowFieldChange(row.id, "parlayLegsSkipped", "N");
    setReviewActionNotice(`Removed parlay leg ${legIndexToRemove}.`);
  }

  function editParlayLeg(row = {}, leg = {}) {
    if (!row?.id || !leg) return;

    setParlayLegDraftByRowId((prev) => ({
      ...prev,
      [row.id]: {
        legType: leg.legType || "main_line",
        sportLeague: leg.sportLeague || row.sportLeague || "",
        fixtureEvent: leg.fixtureEvent || row.fixtureEvent || "",
        market: leg.market || "moneyline",
        selectedSide: leg.selectedSide || "",
        line: leg.line || "",
        subject: leg.subject || "",
        propMarket: leg.propMarket || "",
        outcome: leg.outcome || "",
        selection: leg.selection || "",
      },
    }));

    removeParlayLeg(row, leg.legIndex);
    handleRowFieldChange(row.id, "parlayLegsSkipped", "N");
    setReviewActionNotice(`Loaded leg ${leg.legIndex} for editing. Confirm it again when done.`);
  }

  function confirmAllParlayLegs(row = {}) {
    if (!row?.id) return;

    const legs = parseParlayLegs(row);

    if (!legs.length) {
      window.alert("Confirm at least one parlay leg first, or leave this as a normal parlay summary without leg-level hedge matching.");
      return;
    }

    const label = applyParlaySummaryLabels(row, {
      parlayLegCount: String(legs.length),
      parlayLegsConfirmed: "Y",
      parlayLegsSkipped: "N",
    });

    setReviewActionNotice(
      `${label}: all ${legs.length} leg${legs.length === 1 ? "" : "s"} confirmed.`
    );
  }

  function getReviewBetKind(row = {}) {
    const explicit = String(row.reviewBetKind || "").trim();

    const combined = [
      popupMarketContextRef.current?.value,
      popupPropMarketRef.current?.value,
      row.reviewMarketType,
      row.betType,
      row.canonicalMarketContext,
      row.marketDetail,
      row.propMarket,
      row.selection,
      row.sourceText,
    ].filter(Boolean).join(" ");

    // Strong market wording must repair a stale parser label. Example:
    // "KINGS/MAMMOTH GOAL IN 1ST 10 MINS" is a game prop even when an
    // earlier parser pass saved betType/reviewBetKind as player prop.
    const gamePropMarket = getGamePropMarketLabel(combined);

    if (explicit === "parlay") return "parlay";
    if (explicit === "promo_special") return "promo_special";

    if (/\bpromo[\s_-]*special\b/i.test(combined)) {
      return "promo_special";
    }

    if (gamePropMarket) return "other";

    if (explicit === "player_prop") return "player_prop";
    if (explicit === "other") return "other";

    const explicitMainLineMarket = normalizeMainLineMarket(
      popupPropMarketRef.current?.value ||
        popupMarketContextRef.current?.value ||
        row.reviewMarketType ||
        row.betType ||
        row.canonicalMarketContext ||
        row.marketDetail ||
        ""
    );

    const explicitPlayerPropText = [
      row.reviewBetKind,
      row.betType,
      row.canonicalMarketContext,
      row.reviewMarketType,
    ].filter(Boolean).join(" ").toLowerCase();

    if (
      explicit === "main_line" &&
      explicitMainLineMarket &&
      !explicitPlayerPropText.includes("player prop")
    ) {
      return "main_line";
    }

    const shouldDefaultPlayerProp = rowShouldDefaultToPlayerProp(row);

    if (shouldDefaultPlayerProp) {
      return "player_prop";
    }

    if (explicit === "main_line") return "main_line";
    if (String(row.betType || "").toLowerCase().includes("parlay")) return "parlay";

    const mainMarket = inferMainLineMarketFromRow(row);
    const hasPlayerFields =
      !!row.propMarket ||
      !!row.playerLastName ||
      !!row.canonicalSubject ||
      !!row.canonicalPlayer;

    if (mainMarket && !isPlayerPropMarketText(combined)) return "main_line";

    if (
      String(row.betType || "").toLowerCase().includes("player prop") ||
      hasPlayerFields ||
      isPlayerPropMarketText(combined)
    ) {
      return "player_prop";
    }

    if (mainMarket || isMainLineMarketText(combined)) return "main_line";

    return "other";
  }

  function getBetKindButtonStyle(kind, activeKind) {
    const active = kind === activeKind;

    return {
      ...smallButtonStyle,
      border: active ? "2px solid #1d4ed8" : "1px solid #bfdbfe",
      background: active ? "#dbeafe" : "#ffffff",
      color: active ? "#1e3a8a" : "#334155",
      fontWeight: active ? 950 : 800,
    };
  }

  function getMainLineMarketButtonStyle(market = "", activeMarket = "", activeKind = "") {
    const active = activeKind === "main_line" && String(market || "") === String(activeMarket || "");

    return {
      ...smallButtonStyle,
      border: active ? "2px solid #1d4ed8" : "1px solid #bfdbfe",
      background: active ? "#dbeafe" : "#ffffff",
      color: active ? "#1e3a8a" : "#334155",
      fontWeight: active ? 950 : 800,
    };
  }

  function setMainLineMarketForCurrentRow(row = {}, marketValue = "") {
    if (!row?.id) return;

    const market = normalizeMainLineMarket(marketValue) || marketValue || "moneyline";
    const sideLine = inferMainLineSideAndLine(row);
    const normalizedSide = normalizeMainLineSideValue(row.mainLineSide || sideLine.side || "", row, market);
    const line = cleanMainLineLineValue(row.mainLineLine || sideLine.line || "", market);

    handleRowFieldChange(row.id, "reviewBetKind", "main_line");
    handleRowFieldChange(row.id, "betType", market);
    handleRowFieldChange(row.id, "canonicalMarketContext", market);
    handleRowFieldChange(row.id, "reviewMarketType", market);
    handleRowFieldChange(row.id, "propMarket", "");
    handleRowFieldChange(row.id, "canonicalSubject", "");
    handleRowFieldChange(row.id, "playerLastName", "");
    handleRowFieldChange(row.id, "mainLineSide", normalizedSide);
    handleRowFieldChange(row.id, "mainLineLine", market === "moneyline" ? "" : line);

    const nextSelection =
      market === "moneyline" && normalizedSide
        ? normalizedSide
        : market === "spread" && normalizedSide && line
        ? `${normalizedSide} ${line}`.replace(/\s+/g, " ").trim()
        : market === "total" && normalizedSide && line
        ? `${normalizeSelectionSide(normalizedSide)} ${line}`.replace(/\s+/g, " ").trim()
        : "";

    if (nextSelection) {
      handleRowFieldChange(row.id, "selection", nextSelection);
      if (popupSelectionRef.current) popupSelectionRef.current.value = nextSelection;
    }

    if (popupPropMarketRef.current) popupPropMarketRef.current.value = market;
    if (popupMarketContextRef.current) popupMarketContextRef.current.value = market;
    if (popupBetTypeRef.current) popupBetTypeRef.current.value = market;
    if (popupMainLineSideRef.current) popupMainLineSideRef.current.value = normalizedSide || "";
    if (popupMainLineLineRef.current) popupMainLineLineRef.current.value = market === "moneyline" ? "" : line || "";
    if (popupSubjectRef.current) popupSubjectRef.current.value = "";
    if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = "";
  }

  function setMainLineSideForCurrentRow(row = {}, sideValue = "") {
    if (!row?.id) return;

    let market =
      normalizeMainLineMarket(
        popupPropMarketRef.current?.value ||
          popupMarketContextRef.current?.value ||
          row.reviewMarketType ||
          row.betType ||
          row.marketDetail ||
          ""
      ) || "moneyline";

    if (sideValueIsTotalSide(sideValue)) {
      market = "total";
    }

    const normalizedSide = normalizeMainLineSideValue(sideValue, row, market);
    const line = cleanMainLineLineValue(
      popupMainLineLineRef.current?.value || row.mainLineLine || "",
      market
    );

    handleRowFieldChange(row.id, "reviewBetKind", "main_line");
    handleRowFieldChange(row.id, "mainLineSide", normalizedSide);

    if (market === "total") {
      handleRowFieldChange(row.id, "betType", "total");
      handleRowFieldChange(row.id, "canonicalMarketContext", "total");
      handleRowFieldChange(row.id, "reviewMarketType", "total");
      if (popupPropMarketRef.current) popupPropMarketRef.current.value = "total";
      if (popupMarketContextRef.current) popupMarketContextRef.current.value = "total";
      if (popupBetTypeRef.current) popupBetTypeRef.current.value = "total";
    }

    if (popupMainLineSideRef.current) {
      popupMainLineSideRef.current.value = normalizedSide || "";
    }

    const nextSelection =
      market === "moneyline" && normalizedSide
        ? normalizedSide
        : market === "spread" && normalizedSide && line
        ? `${normalizedSide} ${line}`.replace(/\s+/g, " ").trim()
        : market === "total" && normalizedSide && line
        ? `${normalizeSelectionSide(normalizedSide)} ${line}`.replace(/\s+/g, " ").trim()
        : "";

    if (nextSelection) {
      handleRowFieldChange(row.id, "selection", nextSelection);
      if (popupSelectionRef.current) popupSelectionRef.current.value = nextSelection;
    }
  }

  function setReviewBetKindForCurrentRow(row = {}, kind = "") {
    if (!row?.id || !kind) return;

    handleRowFieldChange(row.id, "reviewBetKind", kind);

    if (kind === "main_line") {
      setMainLineMarketForCurrentRow(row, inferMainLineMarketFromRow(row) || "moneyline");
      return;
    }

    if (kind === "player_prop") {
      const cleanedSubject =
        getLockedPlayerSubjectForRow(row) ||
        getSafePlayerSubject(row.canonicalSubject || row.canonicalPlayer || "") ||
        inferPlayerSubjectFromParsedText(row) ||
        "";

      const updates = {
        betType: "player prop",
        canonicalMarketContext: "player prop",
      };

      if (cleanedSubject) {
        updates.canonicalSubject = cleanedSubject;
        updates.playerLastName = getLastNameFromText(cleanedSubject);
        updates.playerSubjectManual = "Y";

        if (popupSubjectRef.current) popupSubjectRef.current.value = cleanedSubject;
        if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = "";
      }

      applyRowFieldUpdates(row.id, updates);

      if (popupMarketContextRef.current) popupMarketContextRef.current.value = "player prop";
      if (popupBetTypeRef.current) popupBetTypeRef.current.value = "player prop";
      return;
    }

    if (kind === "parlay") {
      applyParlaySummaryLabels(row, {
        propMarket: "",
        parlayLegsSkipped: row.parlayLegsSkipped || "N",
      });
      return;
    }

    if (kind === "promo_special") {
      const eventLabel = getPromoSpecialEventLabel(row);
      const currentSelection = cleanSelectionTextForReview(row.selection || "");
      const inferredOutcome = normalizeSelectionSide(
        [row.selection, row.marketDetail, row.sourceText].filter(Boolean).join(" ")
      );
      const nextSelection =
        inferredOutcome ||
        (!/^(?:straight|promo|promo special)$/i.test(currentSelection)
          ? currentSelection
          : "");

      const updates = {
        reviewBetKind: "promo_special",
        betType: "straight",
        canonicalMarketContext: "promo special",
        reviewMarketType: "promo special",
        propMarket: "",
        fixtureEvent: eventLabel,
      };

      if (nextSelection) updates.selection = nextSelection;

      applyRowFieldUpdates(row.id, updates);

      if (popupFixtureRef.current) popupFixtureRef.current.value = eventLabel;
      if (popupMarketContextRef.current) popupMarketContextRef.current.value = "promo special";
      if (popupBetTypeRef.current) popupBetTypeRef.current.value = "straight";
      if (popupPropMarketRef.current) popupPropMarketRef.current.value = "promo special";
      if (nextSelection && popupSelectionRef.current) popupSelectionRef.current.value = nextSelection;
      return;
    }

    if (kind === "other") {
      const gamePropSource = [
        popupPropMarketRef.current?.value,
        popupMarketContextRef.current?.value,
        row.reviewMarketType,
        row.canonicalMarketContext,
        row.marketDetail,
        row.selection,
        row.sourceText,
      ].filter(Boolean).join(" ");
      const gamePropMarket = getGamePropMarketLabel(gamePropSource);
      const currentBetType = String(row.betType || "").trim();
      const nextBetType =
        gamePropMarket || /player\s+prop/i.test(currentBetType)
          ? "game prop"
          : currentBetType || "game prop";
      const nextMarket =
        gamePropMarket ||
        cleanSelectionTextForReview(
          popupPropMarketRef.current?.value ||
          row.canonicalMarketContext ||
          row.marketDetail ||
          "game prop"
        ).toLowerCase();

      applyRowFieldUpdates(row.id, {
        reviewBetKind: "other",
        betType: nextBetType,
        canonicalMarketContext: nextMarket,
        reviewMarketType: nextMarket,
        propMarket: "",
        canonicalSubject: "",
        canonicalPlayer: "",
        playerLastName: "",
        playerSubjectManual: "N",
      });

      if (popupBetTypeRef.current) popupBetTypeRef.current.value = nextBetType;
      if (popupMarketContextRef.current) popupMarketContextRef.current.value = nextMarket;
      if (popupPropMarketRef.current) popupPropMarketRef.current.value = nextMarket;
      if (popupSubjectRef.current) popupSubjectRef.current.value = "";
      if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = "";
      return;
    }

    handleRowFieldChange(row.id, "betType", row.betType || "game prop");
  }

  function getSmartContextSuggestions(row = {}) {
    const participants = inferParticipantsFromParsedText(row);
    const kind = getReviewBetKind(row);

    if (kind === "parlay") {
      const summaryLabel = getParlaySummaryLabel(row);

      return {
        ...participants,
        reviewBetKind: "parlay",
        canonicalSubject: "",
        playerLastName: "",
        propMarket: "",
        betType: "parlay",
        canonicalMarketContext: "parlay",
        reviewMarketType: "parlay",
        selection: summaryLabel,
        fixtureEvent: summaryLabel,
      };
    }

    if (kind === "promo_special") {
      return {
        ...participants,
        reviewBetKind: "promo_special",
        canonicalSubject: "",
        playerLastName: "",
        propMarket: "",
        betType: "straight",
        canonicalMarketContext: "promo special",
        reviewMarketType: "promo special",
        fixtureEvent: getPromoSpecialEventLabel(row),
      };
    }

    if (kind === "main_line") {
      const market = inferMainLineMarketFromRow(row);
      const sideLine = inferMainLineSideAndLine(row);

      return {
        ...participants,
        reviewBetKind: "main_line",
        mainLineMarket: market,
        mainLineSide: sideLine.side,
        mainLineLine: sideLine.line,
        canonicalSubject: "",
        playerLastName: "",
        propMarket: "",
        betType: market || "",
        canonicalMarketContext: market || "",
      };
    }

    const gamePropSource = [
      popupPropMarketRef.current?.value,
      popupMarketContextRef.current?.value,
      row.reviewMarketType,
      row.canonicalMarketContext,
      row.marketDetail,
      row.selection,
      row.sourceText,
    ].filter(Boolean).join(" ");
    const gamePropMarket = getGamePropMarketLabel(gamePropSource);

    if (gamePropMarket) {
      return {
        ...participants,
        reviewBetKind: "other",
        canonicalSubject: "",
        canonicalPlayer: "",
        playerLastName: "",
        propMarket: "",
        betType: "game prop",
        canonicalMarketContext: gamePropMarket,
        reviewMarketType: gamePropMarket,
      };
    }

    const lockedSubject = getLockedPlayerSubjectForRow(row);
    const visibleSubject = getVisiblePlayerSubjectForRow(row);
    const subject =
      lockedSubject ||
      visibleSubject ||
      inferPlayerSubjectFromParsedText(row) ||
      getLikelyPlayerSubjectCandidate(row);
    const playerLastName = getLastNameFromText(subject);
    const propMarket = inferPropMarketFromRow(row);
    const selectionContext = [
      row.selection,
      row.marketDetail,
      row.canonicalMarketContext,
      row.sourceText,
    ].filter(Boolean).join(" ");

    const looksLikePlayerProp =
      kind === "player_prop" ||
      !!subject ||
      !!propMarket ||
      /\b(over|under)\s+\d+(?:\.\d+)?\b/i.test(selectionContext) &&
        isPlayerPropMarketText(selectionContext);

    return {
      ...participants,
      reviewBetKind: looksLikePlayerProp ? "player_prop" : "other",
      canonicalSubject: subject,
      playerLastName,
      propMarket,
      betType: looksLikePlayerProp ? "player prop" : "",
      canonicalMarketContext: looksLikePlayerProp ? "player prop" : normalizeMarketContext(row.canonicalMarketContext || row.marketDetail || row.betType || ""),
    };
  }

  function valueIsBlank(value) {
    return !String(value || "").trim();
  }

  function applyParsedContextSuggestions(row = {}, options = {}) {
    const {
      updateRefs = true,
      showToast = false,
      returnUpdatesOnly = false,
    } = options;

    if (!row?.id) return returnUpdatesOnly ? {} : false;

    const lockedPlayerSubject = getLockedPlayerSubjectForRow(row);
    const visiblePlayerSubject = getVisiblePlayerSubjectForRow(row);
    const suggestions = getSmartContextSuggestions(row);
    const fieldUpdates = {};
    const kind = suggestions.reviewBetKind || getReviewBetKind(row);

    function queue(field, value) {
      if (!field) return;
      fieldUpdates[field] = value ?? "";
    }

    function fillBlank(field, value, ref = null) {
      if (!value) return;

      const refValue = ref?.current?.value;
      const existing =
        refValue !== undefined && String(refValue || "").trim()
          ? refValue
          : row[field];

      if (!valueIsBlank(existing)) return;

      queue(field, value);

      if (updateRefs && ref?.current) {
        ref.current.value = value;
      }
    }

    fillBlank("participantA", suggestions.participantA, popupParticipantARef);
    fillBlank("participantANormalized", suggestions.participantANormalized);
    fillBlank("participantB", suggestions.participantB, popupParticipantBRef);
    fillBlank("participantBNormalized", suggestions.participantBNormalized);

    if (kind === "main_line") {
      const market = suggestions.mainLineMarket || "spread";

      queue("reviewBetKind", "main_line");
      queue("betType", market);
      queue("canonicalMarketContext", market);
      queue("reviewMarketType", market);

      if (suggestions.mainLineSide) queue("mainLineSide", suggestions.mainLineSide);
      if (suggestions.mainLineLine) queue("mainLineLine", suggestions.mainLineLine);

      if (row.parsedContextAutofilled === "Y" || !row.reviewResolved) {
        queue("propMarket", "");
        queue("canonicalSubject", "");
        queue("canonicalPlayer", "");
        queue("playerLastName", "");
        queue("playerSubjectManual", "N");
      }

      if (updateRefs) {
        if (popupPropMarketRef.current) popupPropMarketRef.current.value = market;
        if (popupMarketContextRef.current) popupMarketContextRef.current.value = market;
        if (popupBetTypeRef.current) popupBetTypeRef.current.value = market;
        if (popupMainLineSideRef.current) popupMainLineSideRef.current.value = suggestions.mainLineSide || "";
        if (popupMainLineLineRef.current) popupMainLineLineRef.current.value = suggestions.mainLineLine || "";
        if (popupSubjectRef.current) popupSubjectRef.current.value = "";
        if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = "";
      }
    } else if (kind === "player_prop") {
      const playerSubject =
        getLockedPlayerSubjectForRow(row) ||
        visiblePlayerSubject ||
        suggestions.canonicalSubject ||
        getLikelyPlayerSubjectCandidate(row);
      const playerLastName =
        getLastNameFromText(playerSubject) ||
        suggestions.playerLastName;

      fillBlank("canonicalSubject", playerSubject, popupSubjectRef);
      fillBlank("canonicalPlayer", playerSubject);
      fillBlank("playerLastName", playerLastName, popupPlayerLastNameRef);
      fillBlank("propMarket", suggestions.propMarket, popupPropMarketRef);

      const currentBetType = String(
        fieldUpdates.betType || row.betType || popupBetTypeRef.current?.value || ""
      )
        .trim()
        .toLowerCase();
      const canCorrectBetType =
        !currentBetType ||
        currentBetType === "straight" ||
        currentBetType === "moneyline" ||
        currentBetType === "spread" ||
        currentBetType === "total";

      if (suggestions.betType && canCorrectBetType) {
        queue("betType", suggestions.betType);
      }

      queue("reviewBetKind", "player_prop");
      queue("canonicalMarketContext", "player prop");

      if (playerSubject) queue("playerSubjectManual", "Y");

      if (updateRefs) {
        if (popupBetTypeRef.current) popupBetTypeRef.current.value = "player prop";
        if (popupMarketContextRef.current) popupMarketContextRef.current.value = "player prop";
      }
    } else if (kind === "parlay") {
      const summaryLabel = getParlaySummaryLabel({ ...row, ...fieldUpdates });

      queue("reviewBetKind", "parlay");
      queue("betType", "parlay");
      queue("canonicalMarketContext", "parlay");
      queue("reviewMarketType", "parlay");
      queue("selection", summaryLabel);
      queue("fixtureEvent", summaryLabel);

      if (updateRefs) {
        if (popupBetTypeRef.current) popupBetTypeRef.current.value = "parlay";
        if (popupMarketContextRef.current) popupMarketContextRef.current.value = "parlay";
        if (popupSelectionRef.current) popupSelectionRef.current.value = summaryLabel;
        if (popupFixtureRef.current) popupFixtureRef.current.value = summaryLabel;
      }
    } else if (kind === "promo_special") {
      const promoEvent = getPromoSpecialEventLabel({ ...row, ...fieldUpdates });

      queue("reviewBetKind", "promo_special");
      queue("betType", "straight");
      queue("canonicalMarketContext", "promo special");
      queue("reviewMarketType", "promo special");
      queue("fixtureEvent", promoEvent);

      if (updateRefs) {
        if (popupBetTypeRef.current) popupBetTypeRef.current.value = "straight";
        if (popupMarketContextRef.current) popupMarketContextRef.current.value = "promo special";
        if (popupPropMarketRef.current) popupPropMarketRef.current.value = "promo special";
        if (popupFixtureRef.current) popupFixtureRef.current.value = promoEvent;
      }
    } else {
      queue("reviewBetKind", "other");

      if (suggestions.betType === "game prop") {
        const gamePropMarket =
          suggestions.canonicalMarketContext ||
          getGamePropMarketLabel(
            [
              popupPropMarketRef.current?.value,
              popupMarketContextRef.current?.value,
              row.reviewMarketType,
              row.canonicalMarketContext,
              row.marketDetail,
              row.selection,
              row.sourceText,
            ]
              .filter(Boolean)
              .join(" ")
          ) ||
          "game prop";

        queue("betType", "game prop");
        queue("canonicalMarketContext", gamePropMarket);
        queue("reviewMarketType", gamePropMarket);
        queue("propMarket", "");
        queue("canonicalSubject", "");
        queue("canonicalPlayer", "");
        queue("playerLastName", "");
        queue("playerSubjectManual", "N");

        if (updateRefs) {
          if (popupBetTypeRef.current) popupBetTypeRef.current.value = "game prop";
          if (popupMarketContextRef.current) popupMarketContextRef.current.value = gamePropMarket;
          if (popupPropMarketRef.current) popupPropMarketRef.current.value = gamePropMarket;
          if (popupSubjectRef.current) popupSubjectRef.current.value = "";
          if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = "";
        }
      }
    }

    queue("parsedContextAutofilled", "Y");

    if (returnUpdatesOnly) return fieldUpdates;

    const changed = applyRowFieldUpdates(row.id, fieldUpdates);

    if (!changed && showToast) {
      window.alert("No blank parsed context fields to fill.");
    }

    return changed;
  }

  function openHedgeDetailPopup(row) {
    if (!row?.id) return;

    setHedgeDetailPreview({
      visible: true,
      rowId: row.id,
    });
  }

  function closeHedgeDetailPopup() {
    setHedgeDetailPreview({
      visible: false,
      rowId: "",
    });
  }

  function openReviewPanelForRow(row, showPartnerFirst = false) {
    if (!row) return;

    const partners = getHedgePartnerRows(row);
    const target = showPartnerFirst && partners[0] ? partners[0] : row;
    const position = getPreviewPosition();

    // Performance: do not auto-normalize or smart-fill when a row opens.
    // Use M / Build Normalize when a row needs cleanup. This prevents stale
    // player-prop fields from carrying bet-to-bet and keeps navigation fast.
    const priorReviewRowId = hoverPreview.rowId || lastReviewRowIdRef.current || "";
    if (priorReviewRowId && priorReviewRowId !== target.id) {
      pushReviewHistoryEntry(priorReviewRowId);
    }
    lastReviewRowIdRef.current = target.id;

    setSelectedRowId(target.id);
    // Start compact so the screenshot stays locked to the right third.
    // Click the screenshot if you need to zoom in.
    setPreviewZoomed(false);
    setPreviewZoomOrigin({ x: "50%", y: "0%" });

    if (imageScrollRef.current) {
      imageScrollRef.current.scrollTop = 0;
    }

    setHoverPreview({
      rowId: target.id,
      src: target.sourceImageUrl || "",
      alt: target.sourceFileName || "",
      visible: true,
      locked: true,
      x: position.x,
      y: position.y,
    });
  }

  function confirmHedgeCluster(row = {}, jumpToPartner = false) {
    if (!row?.id) return;

    const partners = getHedgePartnerRows(row);
    const rowIds = [row.id, ...partners.map((partner) => partner.id)];
    const sourceTag = String(row.hedgeQuality || "").toLowerCase().includes("middle")
      ? "Middle"
      : "Hedge";

    commitPopupReviewEdits(row.id);

    rowIds.forEach((id) => {
      handleRowFieldChange(id, "hedgeOverride", "Y");
      handleRowFieldChange(id, "betSourceTag", sourceTag);
      handleRowFieldChange(id, "likelyHedge", "Y");
      handleRowFieldChange(id, "autoLikelyHedge", "Y");
    });

    handleRowFieldChange(row.id, "reviewResolved", "Y");
    handleRowFieldChange(row.id, "reviewLater", "N");

    const partnerToReview =
      partners.find((partner) => partner.reviewResolved !== "Y") ||
      partners[0] ||
      null;

    if (jumpToPartner && partnerToReview) {
      handleRowFieldChange(partnerToReview.id, "reviewLater", "Y");

      setTimeout(() => {
        setSelectedRowId(partnerToReview.id);

        setHoverPreview((prev) => ({
          ...prev,
          rowId: partnerToReview.id,
          src: partnerToReview.sourceImageUrl || "",
          alt: partnerToReview.sourceFileName || "",
          visible: true,
          locked: true,
        }));

        if (imageScrollRef.current) {
          imageScrollRef.current.scrollTop = 0;
        }
      }, 0);
    }
  }


  function confirmHedgePair(row = {}, partner = null) {
    if (!row?.id || !partner?.id) return;

    const sourceTag = [row.hedgeQuality, partner.hedgeQuality]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes("middle")
      ? "Middle"
      : "Hedge";

    const now = new Date().toISOString();
    const clusterId =
      row.hedgeClusterId ||
      partner.hedgeClusterId ||
      [row.id, partner.id].sort().join("__");

    commitPopupReviewEdits(row.id);

    handleRowFieldsChange(row.id, {
      ignoredHedgePartnerIds: removeDelimitedIds(row.ignoredHedgePartnerIds, [partner.id]),
      ignoredHedgePairSnapshotsJson: removeIgnoredHedgeSnapshot(row, partner.id),
      hedgeOverride: "Y",
      betSourceTag: sourceTag,
      likelyHedge: "Y",
      autoLikelyHedge: "Y",
      hedgeClusterId: clusterId,
      hedgeClusterSize: row.hedgeClusterSize || partner.hedgeClusterSize || "2",
      hedgePartnerBookmaker: getDisplayedBookmaker(partner) || partner.bookmaker || row.hedgePartnerBookmaker || "",
      confirmedHedgePartnerIds: appendUniqueIds(row.confirmedHedgePartnerIds, [partner.id]),
      hedgeCandidateIds: appendUniqueIds(row.hedgeCandidateIds, [partner.id]),
      hedgeCandidateCount: row.hedgeCandidateCount || "1",
      everHedgeCandidate: "Y",
      everLikelyHedge: "Y",
      hedgeHistoryReason: row.hedgeHistoryReason || "Confirmed hedge",
      hedgeConfidence: row.hedgeConfidence || partner.hedgeConfidence || "Confirmed",
      hedgeQuality: row.hedgeQuality || partner.hedgeQuality || "Confirmed Hedge",
      reviewResolved: "Y",
      reviewLater: "N",
      lastHedgePairDecisionAt: now,
    });

    handleRowFieldsChange(partner.id, {
      ignoredHedgePartnerIds: removeDelimitedIds(partner.ignoredHedgePartnerIds, [row.id]),
      ignoredHedgePairSnapshotsJson: removeIgnoredHedgeSnapshot(partner, row.id),
      hedgeOverride: "Y",
      betSourceTag: sourceTag,
      likelyHedge: "Y",
      autoLikelyHedge: "Y",
      hedgeClusterId: clusterId,
      hedgeClusterSize: partner.hedgeClusterSize || row.hedgeClusterSize || "2",
      hedgePartnerBookmaker: getDisplayedBookmaker(row) || row.bookmaker || partner.hedgePartnerBookmaker || "",
      confirmedHedgePartnerIds: appendUniqueIds(partner.confirmedHedgePartnerIds, [row.id]),
      hedgeCandidateIds: appendUniqueIds(partner.hedgeCandidateIds, [row.id]),
      hedgeCandidateCount: partner.hedgeCandidateCount || "1",
      everHedgeCandidate: "Y",
      everLikelyHedge: "Y",
      hedgeHistoryReason: partner.hedgeHistoryReason || "Confirmed hedge",
      hedgeConfidence: partner.hedgeConfidence || row.hedgeConfidence || "Confirmed",
      hedgeQuality: partner.hedgeQuality || row.hedgeQuality || "Confirmed Hedge",
      lastHedgePairDecisionAt: now,
    });

    setShowHedgeCandidatesByRowId((prev) => ({
      ...prev,
      [row.id]: true,
    }));

    setReviewActionNotice(
      `Confirmed this hedge pair with ${getDisplayedBookmaker(partner) || partner.bookmaker || "partner"}. Other candidates were not changed.`
    );
  }

  const previewNeedsReview = !!previewRow && reviewCheck(previewRow);

  function formatMoneyForReview(value) {
    const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));

    if (!Number.isFinite(n)) return "—";

    return `$${n.toFixed(2)}`;
  }

  function getVisibleRowPosition(rowId) {
    const index = rows.findIndex((row) => row.id === rowId);

    if (index === -1) return "";

    return `${index + 1} of ${rows.length}`;
  }

  function movePopupToRow(nextRow, options = {}) {
    if (!nextRow?.id) return false;

    const { addCurrentToHistory = true } = options;
    const currentReviewRowId = hoverPreview.rowId || lastReviewRowIdRef.current || "";

    if (addCurrentToHistory && currentReviewRowId && currentReviewRowId !== nextRow.id) {
      pushReviewHistoryEntry(currentReviewRowId);
    }

    lastReviewRowIdRef.current = nextRow.id;

    setSelectedRowId(nextRow.id);
    setPreviewZoomed(false);
    setPreviewZoomOrigin({ x: "50%", y: "0%" });

    setHoverPreview((prev) => {
      if (!prev.locked) return prev;

      return {
        ...prev,
        rowId: nextRow.id,
        src: nextRow.sourceImageUrl || "",
        alt: nextRow.sourceFileName || "",
        visible: true,
        locked: true,
      };
    });

    if (imageScrollRef.current) {
      imageScrollRef.current.scrollTop = 0;
    }

    return true;
  }

  function goBackToPreviousReviewRow() {
    const previousId = reviewHistory[0];

    if (!previousId) {
      setReviewActionNotice("No previous review row saved yet. After you move through or close review rows, Back will remember the stack.");
      return;
    }

    const previousRow =
      allReviewRows.find((row) => row.id === previousId) ||
      rows.find((row) => row.id === previousId) ||
      null;

    if (!previousRow) {
      setReviewHistory((prev) => prev.slice(1));
      setReviewActionNotice("Previous row is no longer loaded.");
      return;
    }

    setReviewHistory((prev) => prev.slice(1));
    movePopupToRow(previousRow, { addCurrentToHistory: false });
    setReviewActionNotice(`Back to previous row (${getVisibleRowPosition(previousRow.id) || "loaded row"}).`);
  }

  function getNextVisibleRowAfter(currentRowId) {
    if (!rows?.length) return null;

    const currentIndex = rows.findIndex((row) => row.id === currentRowId);
    const candidates =
      currentIndex >= 0
        ? [...rows.slice(currentIndex + 1), ...rows.slice(0, currentIndex)]
        : rows;

    return candidates.find((row) => row?.id && row.id !== currentRowId) || null;
  }

  function jumpToNextReviewRow(currentRowId) {
    const nextRow = getNextVisibleRowAfter(currentRowId);

    if (!nextRow) {
      setReviewActionNotice("Confirmed. No other visible rows match the current filters.");
      return;
    }

    movePopupToRow(nextRow);
    setReviewActionNotice(`Confirmed. Moved to next visible row (${getVisibleRowPosition(nextRow.id)}).`);
  }

  function promptRequiredReviewValue(label, currentValue = "", example = "") {
    const promptText = example
      ? `${label} is missing or incomplete. Enter ${label}.\nExample: ${example}`
      : `${label} is missing or incomplete. Enter ${label}.`;

    const raw = window.prompt(promptText, currentValue || "");
    if (raw === null) return null;
    return String(raw || "").trim();
  }


  function getMainLineParticipantShortcutData(row = {}) {
    const choices = getMainLineParticipantChoices(row).slice(0, 2);
    const shortcutOwners = new Map();

    function addShortcut(value = "", choiceIndex = -1) {
      const key = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      if (key.length !== 1 || ["a", "b", "1", "2"].includes(key)) return;

      if (!shortcutOwners.has(key)) {
        shortcutOwners.set(key, choiceIndex);
        return;
      }

      if (shortcutOwners.get(key) !== choiceIndex) {
        shortcutOwners.set(key, -1);
      }
    }

    const genericLastWords = new Set([
      "club",
      "fc",
      "cf",
      "sc",
      "afc",
      "hockey",
      "team",
      "university",
      "college",
    ]);

    choices.forEach((choice, choiceIndex) => {
      const values = [choice?.display, choice?.raw].filter(Boolean);

      values.forEach((value) => {
        const words = String(value || "")
          .trim()
          .split(/\s+/)
          .map((word) => word.replace(/[^A-Za-z0-9]/g, ""))
          .filter(Boolean);

        if (!words.length) return;

        addShortcut(words[0].charAt(0), choiceIndex);

        const meaningfulWords = words.filter(
          (word) => !genericLastWords.has(word.toLowerCase())
        );
        const lastWord = meaningfulWords[meaningfulWords.length - 1] || words[words.length - 1];

        addShortcut(lastWord.charAt(0), choiceIndex);
      });
    });

    const uniqueShortcutsByChoice = choices.map(() => []);

    shortcutOwners.forEach((choiceIndex, shortcut) => {
      if (choiceIndex >= 0 && uniqueShortcutsByChoice[choiceIndex]) {
        uniqueShortcutsByChoice[choiceIndex].push(shortcut.toUpperCase());
      }
    });

    uniqueShortcutsByChoice.forEach((shortcuts) => shortcuts.sort());

    return {
      choices,
      shortcutOwners,
      uniqueShortcutsByChoice,
    };
  }

  function promptForMainLineParticipantChoice(
    row = {},
    market = "moneyline",
    currentValue = ""
  ) {
    const { choices, shortcutOwners, uniqueShortcutsByChoice } =
      getMainLineParticipantShortcutData(row);

    if (choices.length < 2) {
      return promptRequiredReviewValue(
        market === "spread" ? "Spread Side / Team" : "Moneyline Side / Team",
        currentValue,
        choices[0]?.display || "Toronto Raptors"
      );
    }

    const marketLabel = market === "spread" ? "spread" : "moneyline";
    const choiceLines = choices.map((choice, index) => {
      const slot = index === 0 ? "A" : "B";
      const extraShortcuts = uniqueShortcutsByChoice[index] || [];
      const shortcutText = extraShortcuts.length
        ? ` (also ${extraShortcuts.join(" or ")})`
        : "";

      return `${slot} = ${choice.display}${shortcutText}`;
    });

    const promptText = [
      `Choose the ${marketLabel} side.`,
      "",
      ...choiceLines,
      "",
      "Enter A or B. You can also enter a listed shortcut or type the team/player name.",
    ].join("\n");

    let promptDefault = currentValue || "";

    while (true) {
      const raw = window.prompt(promptText, promptDefault);
      if (raw === null) return null;

      const entered = String(raw || "").trim();
      if (!entered) {
        window.alert("Enter A or B, a listed shortcut, or the team/player name.");
        promptDefault = "";
        continue;
      }

      const directMatch = findParticipantMatchForSide(entered, row);
      if (directMatch?.display) {
        if (popupMainLineSideRef.current) {
          popupMainLineSideRef.current.value = directMatch.display;
        }
        return directMatch.display;
      }

      const normalized = entered.toLowerCase().trim();

      if (normalized === "a" || normalized === "1" || /^a\s*[:=\-]\s*/i.test(entered)) {
        const selected = choices[0]?.display || "";
        if (popupMainLineSideRef.current) popupMainLineSideRef.current.value = selected;
        return selected;
      }

      if (normalized === "b" || normalized === "2" || /^b\s*[:=\-]\s*/i.test(entered)) {
        const selected = choices[1]?.display || "";
        if (popupMainLineSideRef.current) popupMainLineSideRef.current.value = selected;
        return selected;
      }

      if (normalized.length === 1) {
        const shortcutOwner = shortcutOwners.get(normalized);

        if (Number.isInteger(shortcutOwner) && shortcutOwner >= 0) {
          const selected = choices[shortcutOwner]?.display || "";
          if (popupMainLineSideRef.current) popupMainLineSideRef.current.value = selected;
          return selected;
        }
      }

      window.alert(
        `Choice not recognized. Enter A for ${choices[0].display}, B for ${choices[1].display}, or type the team/player name.`
      );
      promptDefault = entered;
    }
  }

  function promptResultIfMissing(row = {}) {
    const status = String(row.status || "").toLowerCase();
    const hasResult = row.win || ["won", "lost", "voided", "void", "push", "cashed out", "open"].includes(status);
    if (hasResult) return true;

    const raw = window.prompt("Result is missing. Enter W, L, V, Push, Open, or Cashout.", "");
    if (raw === null) return false;
    const value = String(raw || "").trim().toLowerCase();

    if (["w", "win", "won", "y"].includes(value)) {
      handleRowFieldChange(row.id, "win", "Y");
      handleRowFieldChange(row.id, "status", "Won");
      return true;
    }
    if (["l", "loss", "lost", "n"].includes(value)) {
      handleRowFieldChange(row.id, "win", "N");
      handleRowFieldChange(row.id, "status", "Lost");
      handleRowFieldChange(row.id, "payout", "0.00");
      handleRowFieldChange(row.id, "toWin", "0.00");
      return true;
    }
    if (["v", "void", "voided"].includes(value)) {
      handleRowFieldChange(row.id, "win", "");
      handleRowFieldChange(row.id, "status", "Voided");
      handleRowFieldChange(row.id, "payout", "0.00");
      handleRowFieldChange(row.id, "toWin", "0.00");
      return true;
    }
    if (["push", "p"].includes(value)) {
      handleRowFieldChange(row.id, "win", "");
      handleRowFieldChange(row.id, "status", "Push");
      return true;
    }
    if (["open", "o"].includes(value)) {
      handleRowFieldChange(row.id, "win", "");
      handleRowFieldChange(row.id, "status", "Open");
      return true;
    }
    if (["cashout", "cashed out", "cash out"].includes(value)) {
      handleRowFieldChange(row.id, "win", "");
      handleRowFieldChange(row.id, "status", "Cashed Out");
      return true;
    }
    window.alert("Result was not recognized. Use W, L, V, Push, Open, or Cashout.");
    return false;
  }

  function isConfirmedHedgeRow(row = {}) {
    const override = String(row.hedgeOverride || "").trim().toUpperCase();
    const tag = String(row.betSourceTag || "").trim().toLowerCase();
    const quality = String(row.hedgeQuality || "").trim().toLowerCase();

    return !!(
      override === "Y" ||
      tag === "hedge" ||
      tag === "middle" ||
      String(row.confirmedHedgePartnerIds || row.hedgePartnerIds || "").trim() ||
      quality.includes("confirmed hedge") ||
      quality.includes("confirmed middle")
    );
  }

  function formatHedgePromptCandidateDetails(row = {}) {
    if (!row) return "Hedge candidate: —";

    const book = getDisplayedBookmaker(row) || row.bookmaker || "Book";
    const event = row.fixtureEvent || row.eventName || "No event";
    const selection = row.selection || row.marketDetail || "No selection";
    const stake = row.stake ? `$${row.stake}` : "—";
    const odds = row.oddsUS || "—";
    const payout = row.payout ? `$${row.payout}` : "—";

    return [
      `Hedge candidate: ${book}`,
      `${event}`,
      `${selection}`,
      `Stake ${stake} · Odds ${odds} · Payout ${payout}`,
    ].join("\n");
  }

  function buildHedgeDecisionPrompt(row = {}, candidate = null) {
    const quality = row.hedgeQuality || row.hedgeConfidence || "Possible Hedge";
    const profit =
      row.hedgeProfitLow || row.hedgeProfitHigh
        ? `Potential profit: ${row.hedgeProfitLow || "—"} → ${row.hedgeProfitHigh || "—"}`
        : "Potential profit: —";

    const detailLines = [
      "Possible hedge match identified.",
      "",
      `Quality: ${quality}`,
      profit,
      "",
      candidate
        ? formatHedgePromptCandidateDetails(candidate)
        : "Hedge candidate: no visible candidate is currently loaded.",
      "",
      "Type Y to confirm this candidate as the hedge.",
      "Type N to hide this candidate as Not This Match.",
      "Cancel to keep reviewing.",
    ];

    return detailLines.join("\n");
  }

  function promptForHedgeDecisionIfNeeded(row = {}) {
    if (!row?.id) return true;

    // If this row has already been confirmed as a hedge/middle, do not keep
    // prompting on Confirm + Next. It can still be reviewed through Hedge History.
    if (isConfirmedHedgeRow(row)) return true;

    const visiblePartners = getHedgePartnerRows(row);
    const topPartner = visiblePartners[0] || null;

    // Hidden-only candidates should not block normal review with a prompt.
    // Use the Hedge Candidates panel/undo banners to restore or confirm those.
    if (!topPartner) return true;

    const unresolvedHedge = rowHasUnresolvedHedgeDecision(row);
    if (!unresolvedHedge) return true;

    const answer = window.prompt(buildHedgeDecisionPrompt(row, topPartner), "");
    if (answer === null) return false;
    const normalized = String(answer || "").trim().toLowerCase();
    if (["y", "yes"].includes(normalized)) {
      confirmHedgePair(row, topPartner);
      return true;
    }
    if (["n", "no"].includes(normalized)) {
      ignoreCurrentHedgeMatch(row, topPartner);
      return true;
    }
    window.alert("Enter Y or N for the possible hedge match.");
    return false;
  }

  function promptForMissingRequiredFields(row = {}) {
    if (!row?.id) return false;
    const rowId = row.id;
    const kind = getReviewBetKind(row);

    let league = maybeApplyInferredLeague(row, { promptOnMismatch: true }) || getPreviewLeagueValue(row);
    if (!league) {
      const next = promptRequiredReviewValue("League", row.sportLeague || "", "NBA, Baseball, UFC");
      if (next === null) return false;
      league = next;
      setLeagueForReviewRow(rowId, next);
    }

    let participantA = popupParticipantARef.current?.value || row.participantA || row.participantANormalized || "";
    let participantB = popupParticipantBRef.current?.value || row.participantB || row.participantBNormalized || "";

    if (!["parlay", "promo_special"].includes(kind)) {
      if (!participantA) {
        const next = promptRequiredReviewValue("Participant A", "", "Chicago Bulls, USA, Andre Fili");
        if (next === null) return false;
        participantA = cleanParticipantTextForMatching(next);
        if (popupParticipantARef.current) popupParticipantARef.current.value = participantA;
        handleRowFieldChange(rowId, "participantA", participantA);
        handleRowFieldChange(rowId, "participantANormalized", normalizeParticipantName(participantA, league));
      }
      if (!participantB) {
        const next = promptRequiredReviewValue("Participant B", "", "New York Knicks, Mexico, Jose Delgado");
        if (next === null) return false;
        participantB = cleanParticipantTextForMatching(next);
        if (popupParticipantBRef.current) popupParticipantBRef.current.value = participantB;
        handleRowFieldChange(rowId, "participantB", participantB);
        handleRowFieldChange(rowId, "participantBNormalized", normalizeParticipantName(participantB, league));
      }
    }

    if (!validateParticipantTeamsBeforeProceed(row)) {
      return false;
    }

    const eventValue =
      kind === "parlay"
        ? getParlaySummaryLabel({ ...row, sportLeague: league })
        : kind === "promo_special"
        ? getPromoSpecialEventLabel({ ...row, sportLeague: league })
        : popupFixtureRef.current?.value || row.fixtureEvent || buildContextEventLabel(row);

    if (!eventValue && !["parlay", "promo_special"].includes(kind)) {
      const next = promptRequiredReviewValue("Event", "", "Chicago Bulls @ New York Knicks");
      if (next === null) return false;
      if (popupFixtureRef.current) popupFixtureRef.current.value = next;
      handleRowFieldChange(rowId, "fixtureEvent", next);
    } else if (eventValue) {
      if (popupFixtureRef.current) popupFixtureRef.current.value = eventValue;
      handleRowFieldChange(rowId, "fixtureEvent", eventValue);
    }

    if (kind === "promo_special") {
      handleRowFieldChange(rowId, "reviewBetKind", "promo_special");
      handleRowFieldChange(rowId, "betType", "straight");
      handleRowFieldChange(rowId, "canonicalMarketContext", "promo special");
      handleRowFieldChange(rowId, "reviewMarketType", "promo special");

      if (popupBetTypeRef.current) popupBetTypeRef.current.value = "straight";
      if (popupMarketContextRef.current) popupMarketContextRef.current.value = "promo special";
      if (popupPropMarketRef.current) popupPropMarketRef.current.value = "promo special";
    }

    if (kind === "main_line") {
      let market = normalizeMainLineMarket(popupPropMarketRef.current?.value || row.reviewMarketType || row.betType || row.marketDetail || "");
      if (!market) {
        const next = promptRequiredReviewValue("Market Type", "", "moneyline, spread, total");
        if (next === null) return false;
        market = normalizeMainLineMarket(next) || next;
      }
      if (popupPropMarketRef.current) popupPropMarketRef.current.value = market;
      if (popupMarketContextRef.current) popupMarketContextRef.current.value = market;
      if (popupBetTypeRef.current) popupBetTypeRef.current.value = market;
      handleRowFieldChange(rowId, "reviewBetKind", "main_line");
      handleRowFieldChange(rowId, "reviewMarketType", market);
      handleRowFieldChange(rowId, "betType", market);
      handleRowFieldChange(rowId, "canonicalMarketContext", market);

      let side = cleanParticipantTextForMatching(popupMainLineSideRef.current?.value || row.mainLineSide || "");
      if (!side) {
        if (market === "moneyline") {
          const next = promptForMainLineParticipantChoice(row, "moneyline", "");
          if (next === null) return false;
          side = next;
        } else {
          const label = market === "total" ? "Over / Under" : "Selected Side / Team";
          const example = market === "total" ? "Over" : "Mexico";
          const next = promptRequiredReviewValue(label, "", example);
          if (next === null) return false;
          side = market === "total" ? normalizeSelectionSide(next) : cleanParticipantTextForMatching(next);
        }
      }
      side = normalizeMainLineSideValue(side, row, market);

      const sideValidation = validateMainLineSideForProceed(row, market, side);
      if (!sideValidation.ok) {
        window.alert(sideValidation.message);
        if (popupMainLineSideRef.current) {
          popupMainLineSideRef.current.focus();
          popupMainLineSideRef.current.select?.();
        }
        return false;
      }

      side = sideValidation.side || side;

      if (popupMainLineSideRef.current) popupMainLineSideRef.current.value = side;
      handleRowFieldChange(rowId, "mainLineSide", side);

      let line = getVisibleMainLineLineForRow(row, market);
      if (["spread", "total"].includes(market) && !line) {
        const next = promptRequiredReviewValue(
          "Line",
          line,
          market === "spread" ? "+3.5" : "8.5"
        );
        if (next === null) return false;
        line = cleanMainLineLineValue(next, market);
      }
      if (popupMainLineLineRef.current) popupMainLineLineRef.current.value = line;
      handleRowFieldChange(rowId, "mainLineLine", line);

      const canonicalMainLineSelection = buildCanonicalMainLineSelection(
        row,
        market,
        side,
        line
      );

      if (canonicalMainLineSelection) {
        if (popupSelectionRef.current) {
          popupSelectionRef.current.value = canonicalMainLineSelection;
        }
        handleRowFieldChange(rowId, "selection", canonicalMainLineSelection);
      }
    }

    if (kind === "player_prop") {
      const rawSubjectValue =
        getRefValueForRow(popupSubjectRef, row.id) ||
        row.canonicalSubject ||
        row.canonicalPlayer ||
        "";
      let subject = getPlayerSubjectForReviewLeague(
        { ...row, sportLeague: league },
        rawSubjectValue
      );
      if (!subject) {
        const next = promptRequiredReviewValue("Player / Subject", "", "Ryan Rollins");
        if (next === null) return false;
        subject = getPlayerSubjectForReviewLeague(
          { ...row, sportLeague: league },
          next
        );
      }
      if (popupSubjectRef.current) popupSubjectRef.current.value = subject;
      const manualSubjectUpdates = preserveManualPlayerSubjectAndMaybeSelection(row, subject);
      applyRowFieldUpdates(rowId, {
        ...manualSubjectUpdates,
        canonicalSubject: subject,
        canonicalPlayer: subject,
        playerSubjectManual: "Y",
      });

      let lastName = popupPlayerLastNameRef.current?.value || row.playerLastName || getLastNameFromText(subject);
      if (!lastName) {
        const next = promptRequiredReviewValue("Player Last Name", "", "Rollins");
        if (next === null) return false;
        lastName = next;
      }
      if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = "";
      handleRowFieldChange(rowId, "playerLastName", lastName);

      let propMarket = normalizePropMarketValue(popupPropMarketRef.current?.value || row.propMarket || row.marketDetail || row.selection || "");
      if (!propMarket) {
        const next = promptRequiredReviewValue("Prop Market", "", "points, rebounds, double-double");
        if (next === null) return false;
        propMarket = normalizePropMarketValue(next);
      }
      if (popupPropMarketRef.current) popupPropMarketRef.current.value = propMarket;
      handleRowFieldChange(rowId, "propMarket", propMarket);
      handleRowFieldChange(rowId, "betType", "player prop");
      handleRowFieldChange(rowId, "canonicalMarketContext", "player prop");

      const ctx = getPopupSelectionBuildContext(row);

      if (isMethodOfVictoryMarket(propMarket)) {
        const nextSelection = buildMethodOfVictorySelection(row, subject, {
          promptIfMissing: true,
        });

        if (!nextSelection) return false;
        if (popupSelectionRef.current) popupSelectionRef.current.value = nextSelection;
        handleRowFieldChange(rowId, "selection", nextSelection);
      } else {
        const yesNoMarket = isYesNoPlayerPropMarket(propMarket) || /\b(yes|no)\b/i.test(row.selection || row.marketDetail || "");
        const inferredOutcome = inferYesNoPlayerPropSide(ctx.existingText, propMarket);

        if (yesNoMarket && !["Yes", "No"].includes(inferredOutcome)) {
          const outcome = promptForPlayerPropOutcome("", false);
          if (!outcome) return false;
          const nextSelection = cleanSelectionTextForReview(
            `${subject} ${outcome} ${getPropMarketSelectionLabel(propMarket)}`
          );
          if (popupSelectionRef.current) popupSelectionRef.current.value = nextSelection;
          handleRowFieldChange(rowId, "selection", nextSelection);
        } else if (yesNoMarket && ["Yes", "No"].includes(inferredOutcome)) {
          const nextSelection = cleanSelectionTextForReview(
            `${subject} ${inferredOutcome} ${getPropMarketSelectionLabel(propMarket)}`
          );
          if (popupSelectionRef.current) popupSelectionRef.current.value = nextSelection;
          handleRowFieldChange(rowId, "selection", nextSelection);
        }
      }

      const currentSelection = cleanSelectionTextForReview(
        popupSelectionRef.current?.value || row.selection || ""
      );
      const explicitMarketSelection = ensurePlayerPropMarketInSelection(
        row,
        currentSelection,
        subject,
        propMarket
      );

      if (explicitMarketSelection && explicitMarketSelection !== currentSelection) {
        if (popupSelectionRef.current) popupSelectionRef.current.value = explicitMarketSelection;
        handleRowFieldChange(rowId, "selection", explicitMarketSelection);
      }
    }

    if (kind === "other") {
      const gamePropMarket = getGamePropMarketLabel(
        [
          popupPropMarketRef.current?.value,
          popupMarketContextRef.current?.value,
          row.reviewMarketType,
          row.canonicalMarketContext,
          row.marketDetail,
          row.selection,
          row.sourceText,
        ]
          .filter(Boolean)
          .join(" ")
      );
      const gamePropOutcome = normalizeSelectionSide(
        [
          popupSelectionRef.current?.value,
          row.selection,
          row.marketDetail,
          row.sourceText,
        ]
          .filter(Boolean)
          .join(" ")
      );

      if (gamePropMarket) {
        const gamePropUpdates = {
          reviewBetKind: "other",
          betType: "game prop",
          canonicalMarketContext: gamePropMarket,
          reviewMarketType: gamePropMarket,
          marketDetail: gamePropMarket,
          propMarket: "",
          canonicalSubject: "",
          canonicalPlayer: "",
          playerLastName: "",
          playerSubjectManual: "N",
        };

        const descriptiveGamePropSelection = buildGamePropSelection(
          gamePropMarket,
          gamePropOutcome,
          popupSelectionRef.current?.value || row.selection || ""
        );

        if (descriptiveGamePropSelection) {
          gamePropUpdates.selection = descriptiveGamePropSelection;
          if (popupSelectionRef.current) {
            popupSelectionRef.current.value = descriptiveGamePropSelection;
          }
        }

        if (popupBetTypeRef.current) popupBetTypeRef.current.value = "game prop";
        if (popupMarketContextRef.current) popupMarketContextRef.current.value = gamePropMarket;
        if (popupPropMarketRef.current) popupPropMarketRef.current.value = gamePropMarket;
        applyRowFieldUpdates(rowId, gamePropUpdates);
      }
    }

    let selection = cleanSelectionTextForReview(popupSelectionRef.current?.value || row.selection || "");
    if (!selection) {
      buildBetFieldsForCurrentRow(row);
      selection = cleanSelectionTextForReview(popupSelectionRef.current?.value || row.selection || "");
    }
    if (!selection) {
      const selectionExample =
        kind === "player_prop"
          ? "Ryan Rollins Under 17.5 Points"
          : kind === "parlay"
          ? getParlaySummaryLabel({ ...row, sportLeague: league })
          : kind === "promo_special"
          ? "Yes"
          : "Mexico +3.5";
      const next = promptRequiredReviewValue("Final Selection", "", selectionExample);
      if (next === null) return false;
      selection = cleanSelectionTextForReview(next);
    }
    if (popupSelectionRef.current) popupSelectionRef.current.value = selection;
    handleRowFieldChange(rowId, "selection", selection);

    let stake = popupStakeRef.current?.value || row.stake || "";
    if (!stake) {
      const next = promptRequiredReviewValue("Stake", "", "25.00");
      if (next === null) return false;
      stake = next;
    }
    if (popupStakeRef.current) popupStakeRef.current.value = stake;
    handleRowFieldChange(rowId, "stake", stake);

    let odds = popupOddsRef.current?.value || row.oddsUS || "";
    if (!odds) {
      const next = promptRequiredReviewValue("Odds", "", "+100 or -110");
      if (next === null) return false;
      odds = next;
    }
    if (popupOddsRef.current) popupOddsRef.current.value = odds;
    handleRowFieldChange(rowId, "oddsUS", odds);

    return promptResultIfMissing(row) && promptForHedgeDecisionIfNeeded(row);
  }

  function confirmAndAdvanceFromPopup(row = {}) {
    if (!row?.id) return;

    const currentRowId = row.id;

    const shouldAdvance = runRowUpdateBatch(currentRowId, () => {
      // Hard gate: no review path can mark a row complete without a real Bet Date.
      // Screenshot filename/folder dates are allowed and are written to the row here.
      if (!ensureBetDateReadyForProceed(row, "Confirm + Next")) {
        return false;
      }

      if (!promptForMissingRequiredFields(row)) {
        setReviewActionNotice("Not confirmed yet. Complete the prompted field(s) first.");
        return false;
      }

      commitPopupReviewEdits(currentRowId);
      rememberConfirmedPlayerProp({ ...row, id: currentRowId });
      saveLastReviewedContext(row);

      handleRowFieldsChange(currentRowId, {
        reviewResolved: "Y",
        reviewLater: "N",
      });

      setReviewActionNotice("Confirmed. Moving to the next visible row...");
      return true;
    }, { deferParentUpdate: true });

    // Keep the row save and the row transition inside the same click event.
    // React can then batch the parent row update with the local preview change,
    // instead of rendering once for save and again from a zero-delay timeout.
    if (shouldAdvance) {
      jumpToNextReviewRow(currentRowId);
    }
  }

function getReviewPassStatusForPopup(row = {}) {
  const status = String(row?.status || "").toLowerCase();

  if (!row?.betDate || row?.betDateNeedsConfirm === "Y") return "Date Confirm";
  if (!row?.stake || !row?.oddsUS || !row?.selection) return "Parser Issue";
  if (!row?.win && !["open", "cashed out", "voided", "void", "push"].includes(status)) return "Parser Issue";
  if (rowHasUnresolvedHedgeDecision(row)) return "Hedge Check";
  if (!row?.sportLeague || !row?.fixtureEvent) return "Context Needed";
  if (row?.reviewResolved === "Y") return "Export Ready";
  return "Clean";
}

function getFieldPill(label, status) {
  let bg = "#e5e7eb";
  let color = "#374151";

  if (status === "good") {
    bg = "#dcfce7";
    color = "#166534";
  } else if (status === "warn") {
    bg = "#fef3c7";
    color = "#92400e";
  } else if (status === "bad") {
    bg = "#fee2e2";
    color = "#991b1b";
  } else if (status === "info") {
    bg = "#dbeafe";
    color = "#1d4ed8";
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        background: bg,
        color,
        border: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      {label}
    </span>
  );
}

function buildContextFromPopup(row = {}) {
  const dateValue = getPopupDateValue(row);

  return {
    betDate: dateValue,
    sportLeague: getPreviewLeagueValue(row),
    betType: popupBetTypeRef.current?.value || row?.betType || "",
    fixtureEvent: popupFixtureRef.current?.value || row?.fixtureEvent || "",
    participantA: popupParticipantARef.current?.value || row?.participantA || "",
    participantB: popupParticipantBRef.current?.value || row?.participantB || "",
    participantANormalized: getParticipantANormalized(row),
    participantBNormalized: getParticipantBNormalized(row),
    playerLastName: popupPlayerLastNameRef.current?.value || row?.playerLastName || "",
    propMarket: normalizePropMarketValue(
      popupPropMarketRef.current?.value || row?.propMarket || ""
    ),
    canonicalSubject:
      getRefValueForRow(popupSubjectRef, row?.id || "") ||
      row?.canonicalSubject ||
      "",
    canonicalMarketContext:
      popupMarketContextRef.current?.value || row?.canonicalMarketContext || "",
  };
}

function saveLastReviewedContext(row = {}) {
  setLastReviewedContext(buildContextFromPopup(row));
}

function applyContextToCurrentRow(row, mode = "all") {
  if (!row || !lastReviewedContext) return;

  const currentRowId = row.id;
  const ctx = lastReviewedContext;

if (mode === "all" || mode === "date") {
  if (ctx.betDate) {
    const parts = getDateParts(ctx.betDate);

    handleRowFieldChange(currentRowId, "betDate", ctx.betDate);
    handleRowFieldChange(currentRowId, "betDateNeedsConfirm", "Y");
    handleRowFieldChange(currentRowId, "betDateConfirmed", "N");

    setReviewDateParts({
      rowId: currentRowId,
      month: parts.month || "",
      day: parts.day || "",
      year: parts.year || "",
    });

    if (popupBetMonthRef.current) popupBetMonthRef.current.value = parts.month;
    if (popupBetDayRef.current) popupBetDayRef.current.value = parts.day;
    if (popupBetYearRef.current) popupBetYearRef.current.value = parts.year;
    if (popupBetDateRef.current) popupBetDateRef.current.value = ctx.betDate;
  }
}

  if (mode === "all" || mode === "league") {
    handleRowFieldChange(currentRowId, "sportLeagueManual", "Y");
    handleRowFieldChange(currentRowId, "sportLeague", ctx.sportLeague || "");
    if (popupLeagueRef.current) popupLeagueRef.current.value = ctx.sportLeague || "";
  }

  if (mode === "all" || mode === "participants") {
    handleRowFieldChange(currentRowId, "participantA", ctx.participantA || "");
    handleRowFieldChange(currentRowId, "participantB", ctx.participantB || "");
    handleRowFieldChange(currentRowId, "participantANormalized", ctx.participantANormalized || "");
    handleRowFieldChange(currentRowId, "participantBNormalized", ctx.participantBNormalized || "");

    if (popupParticipantARef.current) popupParticipantARef.current.value = ctx.participantA || ctx.participantANormalized || "";
    if (popupParticipantBRef.current) popupParticipantBRef.current.value = ctx.participantB || ctx.participantBNormalized || "";
  }

  if (mode === "all" || mode === "betType") {
    handleRowFieldChange(currentRowId, "betType", ctx.betType || "");
    if (popupBetTypeRef.current) popupBetTypeRef.current.value = ctx.betType || "";
  }

  if (mode === "all" || mode === "event") {
    handleRowFieldChange(currentRowId, "fixtureEvent", ctx.fixtureEvent || "");
    if (popupFixtureRef.current) popupFixtureRef.current.value = ctx.fixtureEvent || "";
  }
}



function normalizeDateFromPartsFlexible(monthValue = "", dayValue = "", yearValue = "") {
  const yearRaw = String(yearValue || "").trim();
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  return buildDateFromParts(monthValue, dayValue, year);
}

function extractBetDateFromScreenshotName(row = {}) {
  const candidates = [
    row.sourceFileName,
    row.sourceRelativePath,
    row.sourceImageReattachedName,
    row.uploadBatchFolder,
    row.uploadBatchParentFolder,
    row.folder,
    row.parentFolder,
  ]
    .map((value) => String(value || ""))
    .filter(Boolean);

  for (const candidate of candidates) {
    const text = candidate.replace(/\\/g, "/");

    // Android/iOS/Windows style compact dates: Screenshot_20260618-130502, IMG_2026_06_18, etc.
    const compactYmd = text.match(/(?:^|[^0-9])((?:20)\d{2})(\d{2})(\d{2})(?:[^0-9]|$)/);
    if (compactYmd) {
      const date = buildDateFromParts(compactYmd[2], compactYmd[3], compactYmd[1]);
      if (date) return date;
    }

    // YYYY-MM-DD, YYYY_MM_DD, YYYY.MM.DD, YYYY MM DD.
    const separatedYmd = text.match(/(?:^|[^0-9])((?:20)\d{2})[._\-\s]+(\d{1,2})[._\-\s]+(\d{1,2})(?:[^0-9]|$)/);
    if (separatedYmd) {
      const date = buildDateFromParts(separatedYmd[2], separatedYmd[3], separatedYmd[1]);
      if (date) return date;
    }

    // MM-DD-YYYY, MM_DD_YY, MM.DD.YYYY, or MM/DD/YYYY in filenames/folders.
    const separatedMdy = text.match(/(?:^|[^0-9])(\d{1,2})[._\-/\s]+(\d{1,2})[._\-/\s]+((?:20)?\d{2})(?:[^0-9]|$)/);
    if (separatedMdy) {
      const date = normalizeDateFromPartsFlexible(separatedMdy[1], separatedMdy[2], separatedMdy[3]);
      if (date) return date;
    }

    // Month-name folder/file labels: Jun 18 2026, June 18, 2026, Jun-18-26.
    const monthName = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[._\-\s]+(\d{1,2})(?:st|nd|rd|th)?(?:[,_._\-\s]+((?:20)?\d{2}))?\b/i);
    if (monthName) {
      const monthMap = {
        jan: 1, january: 1,
        feb: 2, february: 2,
        mar: 3, march: 3,
        apr: 4, april: 4,
        may: 5,
        jun: 6, june: 6,
        jul: 7, july: 7,
        aug: 8, august: 8,
        sep: 9, sept: 9, september: 9,
        oct: 10, october: 10,
        nov: 11, november: 11,
        dec: 12, december: 12,
      };
      const month = monthMap[String(monthName[1] || "").toLowerCase()];
      const year = monthName[3] || new Date().getFullYear();
      const date = normalizeDateFromPartsFlexible(month, monthName[2], year);
      if (date) return date;
    }
  }

  return "";
}

function getActiveReviewDateParts(row = {}) {
  if (reviewDateParts.rowId === row?.id) {
    return reviewDateParts;
  }

  const parts = getDateParts(row?.betDate || "");

  return {
    rowId: row?.id || "",
    month: parts.month || "",
    day: parts.day || "",
    year: parts.year || "",
  };
}

function normalizeReviewDateValue(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const parts = getDateParts(raw);
  return buildDateFromParts(parts.month, parts.day, parts.year);
}

function getPopupDateValue(row) {
  const parts = getActiveReviewDateParts(row);

  const dateFromParts = buildDateFromParts(
    parts.month,
    parts.day,
    parts.year
  );

  return dateFromParts || normalizeReviewDateValue(row?.betDate || "") || extractBetDateFromScreenshotName(row) || "";
}

function rowNeedsDateConfirm(row) {
  if (!row) return false;

  const currentDate = getPopupDateValue(row);
  return !currentDate || row.betDateNeedsConfirm === "Y";
}

function removeReviewWarningTokens(existing = "", patterns = []) {
  const parts = String(existing || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  const kept = parts.filter((part) => {
    const lower = part.toLowerCase();

    return !patterns.some((pattern) =>
      typeof pattern === "string"
        ? lower.includes(pattern.toLowerCase())
        : pattern.test(lower)
    );
  });

  return kept.join(" | ");
}

function removeDateConfirmWarnings(existing = "") {
  return removeReviewWarningTokens(existing, [
    "bet_date_copied_from_previous_upload_row_needs_confirm",
    "bet_date_missing_needs_confirm",
    "no_bet_date_detected",
    "date_missing",
    "date needs confirm",
    "date_needs_confirm",
    "needs date confirm",
  ]);
}

function clearDateConfirmState(rowId, row = {}, nextDate = "") {
  if (!rowId) return;

  handleRowFieldChange(rowId, "betDateNeedsConfirm", "N");
  handleRowFieldChange(rowId, "betDateConfirmed", "Y");
  handleRowFieldChange(rowId, "betDateInferred", "N");

  const cleanedWarning = removeDateConfirmWarnings(row?.parseWarning || "");

  if (cleanedWarning !== (row?.parseWarning || "")) {
    handleRowFieldChange(rowId, "parseWarning", cleanedWarning);
  }

  if (nextDate) {
    const parts = getDateParts(nextDate);

    setReviewDateParts({
      rowId,
      month: parts.month || "",
      day: parts.day || "",
      year: parts.year || "",
    });
  }
}

function getDateValueFromVisibleInputs(row = {}) {
  const fromState = getPopupDateValue(row);

  if (fromState) return fromState;

  const fromReadOnlyInput = normalizeReviewDateValue(popupBetDateRef.current?.value || "");

  if (fromReadOnlyInput) return fromReadOnlyInput;

  const fromParts = buildDateFromParts(
    popupBetMonthRef.current?.value,
    popupBetDayRef.current?.value,
    popupBetYearRef.current?.value
  );

  if (fromParts) return fromParts;

  const fromPreviewRow =
    previewRow && previewRow.id === row?.id
      ? normalizeReviewDateValue(previewRow.betDate || "")
      : "";

  const fromScreenshotName = extractBetDateFromScreenshotName(row);

  if (fromScreenshotName) return fromScreenshotName;

  // Confirm + Next must require a real Bet Date. Do not silently promote
  // eventDate into betDate here, because that can let rows clear review with
  // no visible/confirmed bet date. Screenshot filename/folder dates above are
  // allowed because those are the intended fallback date source.
  return normalizeReviewDateValue(row?.betDate || "") || fromPreviewRow || "";
}

function confirmPopupDate(rowId) {
  if (!rowId) return false;

  const row = rows.find((r) => r.id === rowId);
  const nextDate = getDateValueFromVisibleInputs(row);

  if (!nextDate) {
    window.alert("Enter a Bet Date before confirming. Confirm + Next cannot proceed without a visible MM/DD/YYYY bet date.");
    return false;
  }

  handleRowFieldChange(rowId, "betDate", nextDate);

  if (row && !row.eventDate) {
    handleRowFieldChange(rowId, "eventDate", nextDate);
  }

  clearDateConfirmState(rowId, row, nextDate);
  saveLastReviewedContext({ ...(row || { id: rowId }), betDate: nextDate });
  setReviewActionNotice(`Date confirmed: ${nextDate}`);

  return true;
}

function ensureBetDateReadyForProceed(row = {}, actionLabel = "Confirm + Next") {
  if (!row?.id) return false;

  const loadedRow = getLoadedReviewRowById(row.id) || row;
  let nextDate = getDateValueFromVisibleInputs(row);

  const needsDateConfirmation =
    !nextDate ||
    String(row.betDateNeedsConfirm || loadedRow.betDateNeedsConfirm || "").toUpperCase() === "Y";

  if (actionLabel === "Confirm + Next" && needsDateConfirmation) {
    const enteredDate = window.prompt(
      `Confirm the Bet Date before moving to the next row.

Press OK to confirm the displayed date, or enter a new date in MM/DD/YYYY format.`,
      nextDate || ""
    );

    if (enteredDate === null) {
      setReviewActionNotice("Date not confirmed. Confirm + Next stopped on this row.");
      return false;
    }

    const confirmedDate = normalizeReviewDateValue(enteredDate);

    if (!confirmedDate) {
      const message = "Enter a valid Bet Date in MM/DD/YYYY format before continuing.";
      window.alert(message);
      setReviewActionNotice(message);
      return false;
    }

    nextDate = confirmedDate;
  }

  if (!nextDate) {
    const message = `${actionLabel} cannot proceed without a visible Bet Date. Enter MM/DD/YYYY or make sure the screenshot/folder name contains the bet date.`;
    window.alert(message);
    setReviewActionNotice(message);
    return false;
  }

  const currentBetDate = normalizeReviewDateValue(row.betDate || loadedRow.betDate || "");
  const cleanedWarning = removeDateConfirmWarnings(loadedRow.parseWarning || row.parseWarning || "");
  const updates = {};

  if (currentBetDate !== nextDate) updates.betDate = nextDate;
  if (!row.eventDate && !loadedRow.eventDate) updates.eventDate = nextDate;
  if (row.betDateNeedsConfirm !== "N" || loadedRow.betDateNeedsConfirm !== "N") updates.betDateNeedsConfirm = "N";
  if (row.betDateConfirmed !== "Y" || loadedRow.betDateConfirmed !== "Y") updates.betDateConfirmed = "Y";
  if (row.betDateInferred !== "N" || loadedRow.betDateInferred !== "N") updates.betDateInferred = "N";
  if (cleanedWarning !== (loadedRow.parseWarning || row.parseWarning || "")) updates.parseWarning = cleanedWarning;

  if (Object.keys(updates).length) {
    handleRowFieldsChange(row.id, updates);
  }

  const parts = getDateParts(nextDate);
  setReviewDateParts({
    rowId: row.id,
    month: parts.month || "",
    day: parts.day || "",
    year: parts.year || "",
  });

  return true;
}

function canProceedFromPopup(row) {
  if (!row) return false;

  if (!ensureBetDateReadyForProceed(row, "Next / No Change")) {
    return false;
  }

  if (!validateParticipantTeamsBeforeProceed(row)) {
    return false;
  }

  if (!validatePopupMainLineSideBeforeProceed(row)) {
    return false;
  }

  return true;
}

function detectKnownPropMarketFromText(value = "") {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[+&]/g, " + ")
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9+./ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

  // Exact short-form aliases are safe here because they only match when the
  // entire field/value is the abbreviation. This avoids treating an NFL "TD"
  // inside longer source text as a basketball triple-double.
  const exactAliasKey = text
    .replace(/\./g, "")
    .replace(/\s*\+\s*/g, "+")
    .replace(/\s+/g, " ")
    .trim();

  const exactAliases = {
    "3": "threes",
    pt: "points",
    pts: "points",
    reb: "rebounds",
    rebs: "rebounds",
    ast: "assists",
    asts: "assists",
    asst: "assists",
    assts: "assists",
    "3pt": "threes",
    "3pts": "threes",
    "3pm": "threes",
    "3fgm": "threes",
    pra: "points + rebounds + assists",
    pr: "points + rebounds",
    "p+r": "points + rebounds",
    pa: "points + assists",
    "p+a": "points + assists",
    ra: "rebounds + assists",
    "r+a": "rebounds + assists",
    dd: "double-double",
    "dbl dbl": "double-double",
    td: "triple-double",
    "trpl dbl": "triple-double",
    "3d": "triple-double",
    sog: "shots on goal",
    sv: "saves",
    svs: "saves",
    k: "strikeouts",
    ks: "strikeouts",
    tb: "total bases",
    hr: "home runs",
    hrs: "home runs",
    rbi: "rbis",
    rbis: "rbis",
    mov: "method of victory",
    game: "games",
    games: "games",
    gms: "games",
  };

  if (exactAliases[exactAliasKey]) return exactAliases[exactAliasKey];

  // Combo markets must be checked before their individual components.
  if (/\b(?:points?\s*\+\s*rebounds?\s*\+\s*assists?|pts?\s*\+\s*reb(?:s)?\s*\+\s*(?:ast|asts|asst|assts)|pts?\s+reb(?:s)?\s+(?:ast|asts|asst|assts)|pra|points rebounds assists)\b/.test(text)) return "points + rebounds + assists";
  if (/\b(?:points?\s*\+\s*rebounds?|pts?\s*\+\s*reb(?:s)?|p\s*\+\s*r|points rebounds)\b/.test(text)) return "points + rebounds";
  if (/\b(?:points?\s*\+\s*assists?|pts?\s*\+\s*(?:ast|asts|asst|assts)|p\s*\+\s*a|points assists)\b/.test(text)) return "points + assists";
  if (/\b(?:rebounds?\s*\+\s*assists?|reb(?:s)?\s*\+\s*(?:ast|asts|asst|assts)|r\s*\+\s*a|rebounds assists)\b/.test(text)) return "rebounds + assists";

  // Yes/No achievement markets.
  if (/\b(?:double[-\s]?double|dd|dbl\s+dbl)\b/.test(text)) return "double-double";
  if (/\b(?:triple[-\s]?double|trpl\s+dbl|3d)\b/.test(text)) return "triple-double";

  // Three-point props are especially noisy in OCR/book text:
  // "MADE THREES", "Three Pointers Made", "3 pointers", "3pt", etc.
  if (/\b(?:made\s+)?(?:threes?|3\s*-?\s*pointers?|three\s+pointers?|3pt|3pts|3\s*pt|3pm|3fgm|3s)\b/.test(text)) return "threes";
  if (/\b(?:three\s+pointers?\s+made|3\s*-?\s*pointers?\s+made|made\s+3s)\b/.test(text)) return "threes";

  if (
    /\b(?:total\s+games?|games?\s+o\/?u|games?\s+over\s*\/?\s*under|games?\s+(?:over|under)\s+\d+(?:\.\d+)?)\b/.test(text)
  ) {
    return "games";
  }

  if (/shot.*goal|\bsog\b/.test(text)) return "shots on goal";
  if (/\b(?:strikeouts?|ks)\b/.test(text)) return "strikeouts";
  if (/\b(?:total bases?|tb)\b/.test(text)) return "total bases";
  if (/\b(?:home runs?|homers?|hrs?)\b/.test(text)) return "home runs";
  if (/\brbis?\b/.test(text)) return "rbis";
  if (/\bhits?\b/.test(text)) return "hits";
  if (/\b(?:assists?|asts?|assts?|asst)\b/.test(text)) return "assists";
  if (/\b(?:rebounds?|rebs?|reb)\b/.test(text)) return "rebounds";
  if (/\b(?:points?|pts?)\b/.test(text)) return "points";
  if (/anytime goal scorer|anytime goalscorer|goalscorer|goal scorer|player goals|\bgoals?\b/.test(text)) return "goals";
  if (/\b(?:saves?|svs?)\b/.test(text)) return "saves";
  if (/method of victory|method of win|winning method|win method|to win by|wins? by|by ko|ko\/tko|tko|knockout|submission|decision|\bmov\b/.test(text)) return "method of victory";

  return "";
}
function inferPropMarketFromSources(sources = []) {
  for (const source of sources) {
    const detected = detectKnownPropMarketFromText(source);
    if (detected) return detected;
  }

  const joined = sources.filter(Boolean).join(" ");
  return normalizePropMarketValue(joined);
}

function normalizePropMarketValue(value = "") {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[+&]/g, " + ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

  const known = detectKnownPropMarketFromText(text);
  if (known) return known;

  // Common combo labels.
  if (/\bpra\b|\bpoints?\s*\+\s*rebounds?\s*\+\s*assists?\b|\bpts?\s*\+\s*reb(?:s)?\s*\+\s*ast(?:s)?\b|\bpoints rebounds assists\b/.test(text)) {
    return "points + rebounds + assists";
  }

  if (/\bpoints?\s*\+\s*rebounds?\b|\bpts?\s*\+\s*reb(?:s)?\b|\bpr\b|\bpoints rebounds\b/.test(text)) {
    return "points + rebounds";
  }

  if (/\bpoints?\s*\+\s*assists?\b|\bpts?\s*\+\s*ast(?:s)?\b|\bpa\b|\bpoints assists\b/.test(text)) {
    return "points + assists";
  }

  if (/\brebounds?\s*\+\s*assists?\b|\breb(?:s)?\s*\+\s*ast(?:s)?\b|\bra\b|\brebounds assists\b/.test(text)) {
    return "rebounds + assists";
  }

  if (/assist/.test(text)) return "assists";
  if (/rebound/.test(text)) return "rebounds";
  if (/\bpoints?\b|\bpts\b/.test(text)) return "points";
  if (/three|3-pointer|3 pointer|threes|made threes|3pt|3 pt/.test(text)) return "threes";
  if (/double-double|double double/.test(text)) return "double-double";
  if (/triple-double|triple double/.test(text)) return "triple-double";
  if (/yes\s+double-double|yes\s+double double|no\s+double-double|no\s+double double/.test(text)) return "double-double";
  if (/yes\s+triple-double|yes\s+triple double|no\s+triple-double|no\s+triple double/.test(text)) return "triple-double";
  if (/anytime goal scorer|anytime goalscorer|goalscorer|goal scorer|player goals|\bgoals?\b/.test(text)) return "goals";
  if (/shot.*goal|sog/.test(text)) return "shots on goal";
  if (/save/.test(text)) return "saves";
  if (/strikeout|ks\b/.test(text)) return "strikeouts";
  if (/total base/.test(text)) return "total bases";
  if (/home run|homer/.test(text)) return "home runs";
  if (/rbi/.test(text)) return "rbis";
  if (/\bhit\b|hits\b/.test(text)) return "hits";
  if (/method of victory|method of win|winning method|win method|to win by|wins? by|by ko|ko\/tko|tko|knockout|submission|decision/.test(text)) {
    return "method of victory";
  }

  return text;
}

function inferPropMarketFromRow(row = {}) {
  return inferPropMarketFromSources([
    row.propMarket,
    row.canonicalMarketContext,
    row.marketDetail,
    row.selection,
    row.sourceText,
  ]);
}

function getLastNameFromText(value = "") {
  const cleaned = String(value || "")
    .replace(/[^A-Za-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const parts = cleaned.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || "";
}


function normalizeBetTypeValue(value = "") {
  const text = String(value || "").toLowerCase().replace(/\s+/g, " ").trim();

  if (!text) return "";

  if (/moneyline|match winner|winner/.test(text)) return "moneyline";
  if (/spread|puck line|run line|handicap/.test(text)) return "spread";
  if (/total|over\/under|o\/u/.test(text)) return "total";
  if (/promo[\s_-]*special|sportsbook[\s_-]*special|promotion[\s_-]*special/.test(text)) return "straight";
  if (getGamePropMarketLabel(text) || /game prop/.test(text)) return "game prop";
  if (/player prop|player|points|rebounds|assists|goals|shots|strikeouts|home runs|total bases/.test(text)) return "player prop";
  if (/parlay|sgp|same game parlay/.test(text)) return "parlay";
  if (/future/.test(text)) return "futures";
  if (/straight/.test(text)) return "straight";

  return text;
}

function inferBetTypeFromRow(row = {}) {
  const existing = String(row.betType || "").trim();
  if (existing) return existing;

  const text = [
    row.selection,
    row.marketDetail,
    row.canonicalMarketContext,
  ]
    .filter(Boolean)
    .join(" ");

  return normalizeBetTypeValue(text);
}

function normalizeMarketContext(value = "") {
  let text = String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

  if (/\b(?:promo[\s_-]*special|sportsbook[\s_-]*special|promotion[\s_-]*special)\b/.test(text)) {
    return "promo special";
  }

  const gamePropMarket = getGamePropMarketLabel(text);
  if (gamePropMarket) return gamePropMarket;

  text = text
    .replace(/\bplayer\s+/g, "")
    .replace(/\bto record\b/g, "")
    .replace(/\bo\/u\b/g, "")
    .replace(/\bover\/under\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/\bpra\b|\bpoints?\s*\+\s*rebounds?\s*\+\s*assists?\b|\bpts?\s*\+\s*reb(?:s)?\s*\+\s*ast(?:s)?\b|\bpoints rebounds assists\b/.test(text)) {
    return "points + rebounds + assists";
  }

  if (/\bpoints?\s*\+\s*rebounds?\b|\bpts?\s*\+\s*reb(?:s)?\b|\bpr\b|\bpoints rebounds\b/.test(text)) {
    return "points + rebounds";
  }

  if (/\bpoints?\s*\+\s*assists?\b|\bpts?\s*\+\s*ast(?:s)?\b|\bpa\b|\bpoints assists\b/.test(text)) {
    return "points + assists";
  }

  if (/\brebounds?\s*\+\s*assists?\b|\breb(?:s)?\s*\+\s*ast(?:s)?\b|\bra\b|\brebounds assists\b/.test(text)) {
    return "rebounds + assists";
  }

  const sideLine = text.match(/\b(over|under)\s+(\d+(?:\.\d+)?)\b/i);
  const side = sideLine ? sideLine[1].toLowerCase() : "";
  const line = sideLine ? sideLine[2] : "";

  let market = "";

  if (/anytime goal scorer|anytime goalscorer|goalscorer|to score|player goals|\bgoals\b/.test(text)) {
    market = "goals";
  } else if (/assist/.test(text)) {
    market = "assists";
  } else if (/rebound/.test(text)) {
    market = "rebounds";
  } else if (/point/.test(text)) {
    market = "points";
  } else if (/three|3-pointer|3 pointer|threes/.test(text)) {
    market = "threes";
  } else if (/shot.*goal|sog/.test(text)) {
    market = "shots on goal";
  } else if (/strikeout|ks\b/.test(text)) {
    market = "strikeouts";
  } else if (/total base/.test(text)) {
    market = "total bases";
  } else if (/home run|homer/.test(text)) {
    market = "home runs";
  } else if (/method of victory|method of win|winning method|win method|to win by|wins? by|by ko|ko\/tko|tko|knockout|submission|decision/.test(text)) {
    market = "method of victory";
  } else if (/moneyline|match winner|winner/.test(text)) {
    market = "moneyline";
  } else if (/spread|puck line|run line|handicap/.test(text)) {
    market = "spread";
  } else if (/total/.test(text)) {
    market = "total";
  } else if (/top\s*\d+/.test(text)) {
    market = text.match(/top\s*\d+/)?.[0] || text;
  } else {
    market = text;
  }

  if (side && line && market) return `${side} ${line} ${market}`;
  if (side && market) return `${side} ${market}`;
  return market;
}

function buildContextEventLabel(row) {
  const a = getParticipantANormalized(row);
  const b = getParticipantBNormalized(row);

  if (a && b) return `${a} @ ${b}`;
  if (a) return a;
  if (b) return b;

  return String(row?.fixtureEvent || "").trim();
}

function normalizeSelectionSide(value = "") {
  const text = String(value || "").trim().toLowerCase();

  if (!text) return "";

  if (/^(o|over)$/.test(text)) return "Over";
  if (/^(u|under)$/.test(text)) return "Under";
  if (/^(y|yes)$/.test(text)) return "Yes";
  if (/^(n|no)$/.test(text)) return "No";

  if (/\bover\b/.test(text)) return "Over";
  if (/\bunder\b/.test(text)) return "Under";
  if (/\byes\b/.test(text)) return "Yes";
  if (/\bno\b/.test(text)) return "No";

  return "";
}

function isMmaReviewLeague(value = "") {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");

  return text === "mma" || text === "ufc";
}

function formatCombatLastName(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";

  return text
    .split(/([-'’])/)
    .map((part) => {
      if (!part || /^[-'’]$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}

function getMmaSubjectLastName(row = {}, value = "") {
  const league = getPreviewLeagueValue(row);
  if (!isMmaReviewLeague(league)) return "";

  const participantValues = [
    popupParticipantARef.current?.value,
    popupParticipantBRef.current?.value,
    row.participantA,
    row.participantB,
    row.participantANormalized,
    row.participantBNormalized,
  ]
    .map((item) => cleanParticipantTextForMatching(item || ""))
    .filter(Boolean);

  const participantLastNames = Array.from(
    new Map(
      participantValues
        .map((participant) => {
          const lastName = getLastNameFromText(participant);
          return lastName
            ? [normalizeKnownPlayerKey(lastName), lastName]
            : null;
        })
        .filter(Boolean)
    ).values()
  );

  const sourceGroups = [
    [popupSelectionRef.current?.value, row.selection, row.marketDetail, value],
    [row.sourceText],
  ];

  for (const sources of sourceGroups) {
    for (const source of sources.filter(Boolean)) {
      const sourceKey = normalizeKnownPlayerKey(source);
      const matches = participantLastNames.filter((lastName) => {
        const key = normalizeKnownPlayerKey(lastName);
        if (!key) return false;
        const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(^|\\s)${safeKey}(?=\\s|$)`, "i").test(sourceKey);
      });

      if (matches.length === 1) return matches[0];
    }
  }

  const cleaned = String(value || "")
    .replace(/\bby\s+(?:points?|(?:unanimous|split|majority|technical)\s+decision|decision|ko\s*\/?\s*tko|tko\s*\/?\s*ko|ko|tko|knockout|submission)\b.*$/i, " ")
    .replace(/\b(?:method of victory|method of win|winning method|win method)\b.*$/i, " ")
    .replace(/\bby\b.*$/i, " ")
    .replace(/[^A-Za-z.'’\-\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const lastName = getLastNameFromText(cleaned);
  return formatCombatLastName(lastName);
}

function isTennisReviewLeague(value = "") {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");

  return text === "tennis" || text === "atp" || text === "wta";
}

function isLastNameOnlyPlayerLeague() {
  // Player / Subject is now always stored with the full reviewed name.
  // Hedge matching may compare last names, but saving never deletes first names.
  return false;
}

function getPlayerSubjectForReviewLeague(row = {}, value = "") {
  const rawValue = String(value || "").trim();

  if (!rawValue) return "";

  const fullSubject =
    getSafePlayerSubject(rawValue) ||
    cleanPlayerSubjectForBuild(rawValue) ||
    cleanParticipantTextForMatching(rawValue);

  if (!fullSubject) return "";

  // Preserve the full reviewed name for every sport, including MMA and Tennis.
  return titleCaseParsedName(fullSubject);
}

function cleanPlayerNameForReviewRow(value = "", row = {}) {
  const league = getPreviewLeagueValue(row);
  const subject = getPlayerSubjectForReviewLeague(row, value);

  if (!subject) return "";

  return (
    cleanPlayerNameForLibrary(subject, {
      allowSingleWord: isLastNameOnlyPlayerLeague(league),
    }) || subject
  );
}

function isMethodOfVictoryMarket(value = "") {
  return normalizePropMarketValue(value) === "method of victory";
}

function getMethodOfVictoryOutcome(value = "") {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

  if (/\bby\s+points?\b|\bpoints?\s+decision\b/.test(text)) return "By Points";
  if (/\bby\s+unanimous\s+decision\b|\bunanimous\s+decision\b/.test(text)) return "By Unanimous Decision";
  if (/\bby\s+split\s+decision\b|\bsplit\s+decision\b/.test(text)) return "By Split Decision";
  if (/\bby\s+majority\s+decision\b|\bmajority\s+decision\b/.test(text)) return "By Majority Decision";
  if (/\bby\s+technical\s+decision\b|\btechnical\s+decision\b/.test(text)) return "By Technical Decision";
  if (/\bby\s+decision\b|\bdecision\b/.test(text)) return "By Decision";
  if (/\bby\s+(?:ko\s*\/?\s*tko|tko\s*\/?\s*ko|ko|tko|knockout)\b|\bko\s*\/?\s*tko\b|\btko\s*\/?\s*ko\b|\bknockout\b/.test(text)) return "By KO/TKO";
  if (/\bby\s+submission\b|\bsubmission\b/.test(text)) return "By Submission";

  return "";
}

function buildMethodOfVictorySelection(row = {}, subjectValue = "", options = {}) {
  const { promptIfMissing = false } = options;
  const subject = getPlayerSubjectForReviewLeague(row, subjectValue);

  const sources = [
    popupSelectionRef.current?.value,
    row.selection,
    row.marketDetail,
    row.sourceText,
  ]
    .filter(Boolean)
    .join(" ");

  let outcome = getMethodOfVictoryOutcome(sources);

  if (!outcome && promptIfMissing) {
    const raw = window.prompt(
      "Enter method of victory: By Points, By Decision, By KO/TKO, or By Submission",
      ""
    );

    if (raw === null) return "";
    outcome = getMethodOfVictoryOutcome(raw);

    if (!outcome) {
      window.alert("Method was not recognized. Use Points, Decision, KO/TKO, or Submission.");
      return "";
    }
  }

  if (!subject || !outcome) return "";
  return cleanSelectionTextForReview(`${subject} ${outcome}`);
}

function getPropMarketSelectionLabel(value = "") {
  const market = normalizePropMarketValue(value);
  const labels = {
    points: "Points",
    rebounds: "Rebounds",
    assists: "Assists",
    threes: "Threes",
    "points + rebounds + assists": "Points + Rebounds + Assists",
    "points + rebounds": "Points + Rebounds",
    "points + assists": "Points + Assists",
    "rebounds + assists": "Rebounds + Assists",
    "double-double": "Double-Double",
    "triple-double": "Triple-Double",
    goals: "Goals",
    "shots on goal": "Shots on Goal",
    saves: "Saves",
    strikeouts: "Strikeouts",
    "total bases": "Total Bases",
    "home runs": "Home Runs",
    rbis: "RBIs",
    hits: "Hits",
    games: "Games",
  };

  return labels[market] || market;
}

function playerPropSelectionHasMarket(selection = "", propMarket = "") {
  const market = normalizePropMarketValue(propMarket);
  if (!selection || !market) return false;
  return detectKnownPropMarketFromText(selection) === market;
}

function getStructuredPlayerPropSide(row = {}, marketValue = "") {
  const market = normalizePropMarketValue(marketValue);
  const visible = getRefValueForRow(popupPropSideRef, row.id);
  const stored = String(row.propSide || "").trim();

  const explicit = normalizeSelectionSide(visible || stored);
  if (explicit) return explicit;

  const sources = [
    row.selection,
    row.marketDetail,
    row.sourceText,
  ].filter(Boolean);

  if (market === "goals") {
    return inferGoalZeroHalfSide(sources);
  }

  if (market === "home runs") {
    return inferHomeRunZeroHalfSide(sources);
  }

  return (
    inferYesNoPlayerPropSide(sources.join(" "), market) ||
    normalizeSelectionSide(sources.join(" "))
  );
}

function getStructuredPlayerPropLine(
  row = {},
  marketValue = "",
  sideValue = ""
) {
  const market = normalizePropMarketValue(marketValue);
  const visible = getRefValueForRow(popupPropLineRef, row.id);
  const stored = String(row.propLine || "").trim();

  if (visible) return visible;
  if (stored) return stored;

  if (
    ["goals", "home runs"].includes(market) &&
    ["Over", "Under", "Yes", "No"].includes(
      normalizeSelectionSide(sideValue)
    )
  ) {
    return "0.5";
  }

  return (
    extractLineFromText(row.selection || "") ||
    extractLineFromText(row.marketDetail || "") ||
    extractLineFromText(row.sourceText || "") ||
    ""
  );
}

function buildExactPlayerPropSelection(row = {}) {
  const market = normalizePropMarketValue(
    getRefValueForRow(popupPropMarketRef, row.id) ||
      row.propMarket ||
      inferPropMarketFromRow(row) ||
      ""
  );

  if (!market || market === "player prop") {
    return cleanSelectionTextForReview(row.selection || "");
  }

  const subjectRaw =
    getRefValueForRow(popupSubjectRef, row.id) ||
    row.canonicalSubject ||
    row.canonicalPlayer ||
    inferPlayerSubjectFromParsedText(row) ||
    "";
  const subject = getPlayerSubjectForReviewLeague(row, subjectRaw);
  const side = getStructuredPlayerPropSide(row, market);
  const normalizedSide = normalizeSelectionSide(side);
  const line = getStructuredPlayerPropLine(row, market, normalizedSide);

  if (market === "games") {
    if (["Over", "Under"].includes(normalizedSide) && line) {
      return cleanSelectionTextForReview(
        `${normalizedSide} ${line} Games`
      );
    }

    return cleanSelectionTextForReview(row.selection || "");
  }

  if (!subject) {
    return cleanSelectionTextForReview(row.selection || "");
  }

  if (isMethodOfVictoryMarket(market)) {
    return (
      buildMethodOfVictorySelection(row, subject, {
        promptIfMissing: false,
      }) || cleanSelectionTextForReview(row.selection || "")
    );
  }

  if (market === "goals") {
    if (["Yes", "Over"].includes(normalizedSide)) {
      return cleanSelectionTextForReview(
        `${subject} Over ${line || "0.5"} Goals`
      );
    }

    if (["No", "Under"].includes(normalizedSide)) {
      return cleanSelectionTextForReview(
        `${subject} Under ${line || "0.5"} Goals`
      );
    }
  }

  if (market === "home runs") {
    if (["Yes", "Over"].includes(normalizedSide)) {
      return cleanSelectionTextForReview(
        `${subject} Over ${line || "0.5"} HR`
      );
    }

    if (["No", "Under"].includes(normalizedSide)) {
      return cleanSelectionTextForReview(
        `${subject} Under ${line || "0.5"} HR`
      );
    }
  }

  const marketLabel = getPropMarketSelectionLabel(market);

  if (["double-double", "triple-double"].includes(market)) {
    if (["Yes", "No"].includes(normalizedSide)) {
      return cleanSelectionTextForReview(
        `${subject} ${normalizedSide} ${marketLabel}`
      );
    }
  }

  if (line && /\+$/.test(line)) {
    return cleanSelectionTextForReview(
      `${subject} ${line} ${marketLabel}`
    );
  }

  if (["Over", "Under"].includes(normalizedSide) && line) {
    return cleanSelectionTextForReview(
      `${subject} ${normalizedSide} ${line} ${marketLabel}`
    );
  }

  if (["Yes", "No"].includes(normalizedSide)) {
    return cleanSelectionTextForReview(
      `${subject} ${normalizedSide} ${marketLabel}`
    );
  }

  return cleanSelectionTextForReview(row.selection || "");
}

function buildExactExportedSelection(row = {}) {
  const kind = getReviewBetKind(row);

  if (kind === "player_prop") {
    return buildExactPlayerPropSelection(row);
  }

  if (kind === "main_line") {
    const market =
      normalizeMainLineMarket(
        getRefValueForRow(popupPropMarketRef, row.id) ||
          row.reviewMarketType ||
          row.betType ||
          row.marketDetail ||
          ""
      ) || "";
    const side =
      getRefValueForRow(popupMainLineSideRef, row.id) ||
      row.mainLineSide ||
      "";
    const line =
      getRefValueForRow(popupMainLineLineRef, row.id) ||
      row.mainLineLine ||
      "";

    return (
      buildCanonicalMainLineSelection(row, market, side, line) ||
      cleanSelectionTextForReview(row.selection || "")
    );
  }

  if (kind === "parlay") return getParlaySummaryLabel(row);

  return cleanSelectionTextForReview(
    getRefValueForRow(popupSelectionRef, row.id) ||
      row.selection ||
      ""
  );
}

function expandSingleWordPlayerSubjectFromRow(row = {}, value = "") {
  const subject = getPlayerSubjectForReviewLeague(row, value);
  if (!subject) return "";

  const league = getPreviewLeagueValue(row);

  // MMA/UFC and Tennis intentionally use last names only.
  if (isLastNameOnlyPlayerLeague(league)) return subject;

  const parts = subject.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return subject;

  const lastNameKey = normalizeKnownPlayerKey(subject);
  if (!lastNameKey) return subject;

  // Current screenshot/OCR text must beat learned last-name history.
  const explicitFullName = findExplicitFullPlayerNameInCurrentRow(
    row,
    subject
  );

  if (explicitFullName) {
    return explicitFullName;
  }

  // Do not use an older bet or learned-player history to fill a first name.
  // If the current row does not explicitly expose a full name, keep the value
  // exactly as reviewed instead of guessing.
  return subject;
}

function buildStructuredPlayerPropSelection(
  row = {},
  subjectValue = "",
  propMarketValue = "",
  fallbackSelection = ""
) {
  const market = normalizePropMarketValue(propMarketValue);
  const subject = expandSingleWordPlayerSubjectFromRow(row, subjectValue);
  const selection = cleanSelectionTextForReview(
    fallbackSelection || row.selection || ""
  );

  if (!market || market === "player prop") return selection;

  // Tennis total-games markets describe the match total, not a player.
  // Never prefix these selections with a parsed subject such as "Games".
  if (market === "games") {
    const combinedGamesText = [
      selection,
      row.selection,
      row.marketDetail,
      row.sourceText,
    ]
      .filter(Boolean)
      .join(" ");

    const gamesSide = normalizeSelectionSide(combinedGamesText);
    const gamesLine =
      extractLineFromText(selection) ||
      extractLineFromText(row.marketDetail || "") ||
      extractLineFromText(row.sourceText || "");

    if (["Over", "Under"].includes(gamesSide) && gamesLine) {
      return cleanSelectionTextForReview(
        `${gamesSide} ${gamesLine} Games`
      );
    }

    return selection.replace(/^games?\s+/i, "").trim();
  }

  if (!subject) return selection;

  if (isMethodOfVictoryMarket(market)) {
    return (
      buildMethodOfVictorySelection(row, subject, { promptIfMissing: false }) ||
      selection
    );
  }

  const combinedSources = [
    selection,
    row.selection,
    row.marketDetail,
    row.sourceText,
  ].filter(Boolean);
  const combined = combinedSources.join(" ");

  if (market === "home runs") {
    const homeRunSelection = buildHomeRunZeroHalfSelection(
      row,
      subject,
      combinedSources
    );

    if (homeRunSelection) return homeRunSelection;
  }

  if (market === "goals") {
    const goalSelection = buildGoalZeroHalfSelection(
      row,
      subject,
      combinedSources
    );

    if (goalSelection) return goalSelection;
  }

  const zeroHalf = inferZeroHalfPlayerProp(
    row,
    {
      existingSelection: selection,
      existingText: combined,
    },
    market
  );

  if (zeroHalf && zeroHalf.market === market) {
    return cleanSelectionTextForReview(
      `${subject} ${zeroHalf.side} ${zeroHalf.line} ${getPropMarketSelectionLabel(market)}`
    );
  }

  const side =
    inferYesNoPlayerPropSide(combined, market) ||
    normalizeSelectionSide(combined);
  const line =
    extractLineFromText(selection) ||
    extractLineFromText(row.marketDetail || "");
  const marketLabel = getPropMarketSelectionLabel(market);

  if (["Yes", "No"].includes(side)) {
    return cleanSelectionTextForReview(`${subject} ${side} ${marketLabel}`);
  }

  if (line && /\+$/.test(String(line))) {
    return cleanSelectionTextForReview(`${subject} ${line} ${marketLabel}`);
  }

  if (line && ["Over", "Under"].includes(side)) {
    return cleanSelectionTextForReview(
      `${subject} ${side} ${line} ${marketLabel}`
    );
  }

  return ensurePlayerPropMarketInSelection(
    row,
    selection,
    subject,
    market
  );
}

function buildVisibleStructuredPlayerPropSelection(
  row = {},
  selectionValue = ""
) {
  const subjectRaw =
    getVisiblePlayerSubjectForRow(row) ||
    getLockedPlayerSubjectForRow(row) ||
    inferPlayerSubjectFromParsedText(row) ||
    row.canonicalSubject ||
    row.canonicalPlayer ||
    "";
  const subject = expandSingleWordPlayerSubjectFromRow(row, subjectRaw);
  const propMarket =
    getVisiblePlayerPropMarketForRow(row) ||
    normalizePropMarketValue(
      row.propMarket ||
        inferPropMarketFromRow(row) ||
        ""
    );
  const selection = cleanSelectionTextForReview(
    selectionValue || popupSelectionRef.current?.value || row.selection || ""
  );

  if (!subject || !propMarket || propMarket === "player prop") {
    return selection;
  }

  if (propMarket === "goals") {
    const goalSelection = buildGoalZeroHalfSelection(
      row,
      subject,
      [
        selection,
        row.selection,
        row.marketDetail,
        row.sourceText,
      ]
    );

    if (goalSelection) return goalSelection;
  }

  return buildStructuredPlayerPropSelection(
    row,
    subject,
    propMarket,
    selection
  );
}

function ensurePlayerPropMarketInSelection(
  row = {},
  selectionValue = "",
  subjectValue = "",
  propMarketValue = ""
) {
  const market = normalizePropMarketValue(propMarketValue);
  const selection = cleanSelectionTextForReview(selectionValue);

  if (!market || market === "player prop") return selection;

  if (isMethodOfVictoryMarket(market)) {
    return buildMethodOfVictorySelection(row, subjectValue, { promptIfMissing: false }) || selection;
  }

  const subject = expandSingleWordPlayerSubjectFromRow(row, subjectValue);

  if (market === "home runs") {
    const homeRunSelection = buildHomeRunZeroHalfSelection(
      row,
      subject,
      [
        selection,
        row.selection,
        row.marketDetail,
        row.sourceText,
      ]
    );

    if (homeRunSelection) return homeRunSelection;
  }

  if (market === "goals") {
    const goalSelection = buildGoalZeroHalfSelection(
      row,
      subject,
      [
        selection,
        row.selection,
        row.marketDetail,
        row.sourceText,
      ]
    );

    if (goalSelection) return goalSelection;
  }

  // Canonicalize sportsbook labels such as "Anytime Goalscorer" before the
  // generic "selection already contains the market" early return below.
  // Otherwise malformed text like "Anytime Over 0.5 Goalscorer" can be kept
  // and the confirmed player name can disappear from the exported selection.
  const zeroHalf = subject
    ? inferZeroHalfPlayerProp(
        row,
        {
          existingSelection: selection,
          existingText: [
            selection,
            row.selection,
            row.marketDetail,
            row.sourceText,
          ]
            .filter(Boolean)
            .join(" "),
        },
        market
      )
    : null;

  if (zeroHalf && zeroHalf.market === market) {
    return cleanSelectionTextForReview(
      `${subject} ${zeroHalf.side} ${zeroHalf.line} ${getPropMarketSelectionLabel(market)}`
    );
  }

  // The structured review fields above Final Selection are authoritative.
  // Final Selection may provide a missing side/line/outcome, but it must not
  // preserve an old player name or old market after those fields were edited.
  const side =
    inferYesNoPlayerPropSide(
      [
        selection,
        row.selection,
        row.marketDetail,
        row.sourceText,
      ]
        .filter(Boolean)
        .join(" "),
      market
    ) || normalizeSelectionSide(selection);
  const line = extractLineFromText(selection);
  const marketLabel = getPropMarketSelectionLabel(market);

  if (subject && side && line && !/\+$/.test(line)) {
    return cleanSelectionTextForReview(`${subject} ${side} ${line} ${marketLabel}`);
  }

  if (subject && line && /\+$/.test(line)) {
    return cleanSelectionTextForReview(`${subject} ${line} ${marketLabel}`);
  }

  if (subject && ["Yes", "No"].includes(side)) {
    return cleanSelectionTextForReview(`${subject} ${side} ${marketLabel}`);
  }

  const selectionKey = normalizeKnownPlayerKey(selection);
  const subjectKey = normalizeKnownPlayerKey(subject);
  const selectionAlreadyUsesCurrentSubject =
    !!subjectKey && selectionKey.includes(subjectKey);

  if (
    selectionAlreadyUsesCurrentSubject &&
    playerPropSelectionHasMarket(selection, market)
  ) {
    return selection;
  }

  if (subject && selection && (side || line)) {
    return cleanSelectionTextForReview(`${subject} ${side || ""} ${line || ""} ${marketLabel}`);
  }

  return selection;
}

function isYesNoPlayerPropMarket(value = "") {
  const text = String(value || "").toLowerCase();
  const normalizedMarket = normalizePropMarketValue(value);

  // Method of victory is not a Yes/No market. Its outcome is the winning
  // method itself: Points/Decision, KO/TKO, or Submission.
  return (
    normalizedMarket === "double-double" ||
    normalizedMarket === "triple-double" ||
    /to record|record a|anytime|goal scorer|goalscorer|first basket|hit a home run|home run|homer|score a goal/.test(text)
  );
}

function inferYesNoPlayerPropSide(value = "", propMarketValue = "") {
  const explicitSide = normalizeSelectionSide(value);
  if (["Yes", "No"].includes(explicitSide)) return explicitSide;

  const text = String(value || "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const market = normalizePropMarketValue(propMarketValue);

  if (!text || !market) return "";

  if (["double-double", "triple-double"].includes(market)) {
    if (/\b(?:not to record|to not record|no)\b[^.]{0,40}\b(?:double[-\s]?double|triple[-\s]?double|dd|td)\b/.test(text)) {
      return "No";
    }

    if (/\b(?:to record|records?|recorded|achieve|achieves|achieved|get|gets|got)\b[^.]{0,50}\b(?:double[-\s]?double|triple[-\s]?double|dd|td)\b/.test(text)) {
      return "Yes";
    }
  }

  // Sportsbook labels such as "Anytime Goalscorer" or "To hit a home run"
  // describe the positive side even when the word Yes is omitted.
  if (/\b(?:anytime|to score|score a goal|to hit a home run|hit a home run|to record)\b/.test(text)) {
    return "Yes";
  }

  return "";
}

function inferHomeRunZeroHalfSide(values = []) {
  const sources = Array.isArray(values) ? values : [values];

  for (const source of sources) {
    const text = String(source || "")
      .toLowerCase()
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) continue;

    if (/^(?:n|no)$/.test(text)) return "Under";
    if (/^(?:y|yes)$/.test(text)) return "Over";

    if (
      /\bunder\s+0\.5\s+(?:home runs?|hrs?|hr)\b/.test(text) ||
      /\b(?:no|without)\s+(?:a\s+)?(?:home run|homer|hr)\b/.test(text) ||
      /\bnot\s+to\s+(?:hit|record)\s+(?:a\s+)?home run\b/.test(text) ||
      /\b(?:home run|homer|hr)\s*[:=-]?\s*no\b/.test(text)
    ) {
      return "Under";
    }

    if (
      /\bover\s+0\.5\s+(?:home runs?|hrs?|hr)\b/.test(text) ||
      /\b(?:yes|anytime)\s+(?:home run|homer|hr)\b/.test(text) ||
      /\b(?:home run|homer|hr)\s*[:=-]?\s*yes\b/.test(text) ||
      /\b(?:to\s+hit|hits?|hit|to\s+record|records?)\s+(?:a\s+)?home run\b/.test(text)
    ) {
      return "Over";
    }
  }

  return "";
}

function buildHomeRunZeroHalfSelection(
  row = {},
  subjectValue = "",
  values = []
) {
  const subject = expandSingleWordPlayerSubjectFromRow(row, subjectValue);
  if (!subject) return "";

  const side = inferHomeRunZeroHalfSide(values);
  if (!side) return "";

  return cleanSelectionTextForReview(`${subject} ${side} 0.5 HR`);
}

function inferGoalZeroHalfSide(values = []) {
  const sources = Array.isArray(values) ? values : [values];

  for (const source of sources) {
    const text = String(source || "")
      .toLowerCase()
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) continue;

    if (/^(?:n|no)$/.test(text)) return "Under";
    if (/^(?:y|yes)$/.test(text)) return "Over";

    if (
      /\bunder\s+0\.5\s+goals?\b/.test(text) ||
      /\b(?:no|without|zero)\s+(?:a\s+)?goals?\b/.test(text) ||
      /\bnot\s+to\s+score\b/.test(text) ||
      /\bgoals?\s*[:=-]?\s*no\b/.test(text)
    ) {
      return "Under";
    }

    if (
      /\bover\s+0\.5\s+goals?\b/.test(text) ||
      /\banytime(?:\s+goal\s*scorer|\s+goalscorer)?\b/.test(text) ||
      /\bgoal\s*scorer\b/.test(text) ||
      /\bgoalscorer\b/.test(text) ||
      /\b(?:to\s+score|score\s+a\s+goal)\b/.test(text) ||
      /\bgoals?\s*[:=-]?\s*yes\b/.test(text)
    ) {
      return "Over";
    }
  }

  return "";
}

function buildGoalZeroHalfSelection(
  row = {},
  subjectValue = "",
  values = []
) {
  const subject = expandSingleWordPlayerSubjectFromRow(row, subjectValue);
  if (!subject) return "";

  const side = inferGoalZeroHalfSide(values);
  if (!side) return "";

  return cleanSelectionTextForReview(`${subject} ${side} 0.5 Goals`);
}

function canonicalizeAnytimeGoalscorerSelectionForRow(
  rowId = "",
  selectionValue = "",
  rowOverrides = {}
) {
  if (!rowId) return selectionValue;

  const loadedRow = getLoadedReviewRowById(rowId) || {};
  const draft = reviewDraftByRowIdRef.current[rowId] || {};
  const row = {
    ...loadedRow,
    ...draft,
    ...(rowOverrides || {}),
    id: rowId,
  };

  const visibleMarket = getRefValueForRow(popupPropMarketRef, rowId);
  const market = normalizePropMarketValue(
    visibleMarket || row.propMarket || ""
  );

  if (market !== "goals") return selectionValue;

  const visibleSubject = getRefValueForRow(popupSubjectRef, rowId);
  const subject =
    visibleSubject ||
    row.canonicalSubject ||
    row.canonicalPlayer ||
    inferPlayerSubjectFromParsedText(row) ||
    "";

  if (!subject) return selectionValue;

  const canonical = buildGoalZeroHalfSelection(
    row,
    subject,
    [
      selectionValue,
      row.selection,
      row.marketDetail,
      row.sourceText,
    ]
  );

  return canonical || selectionValue;
}

function promptForPlayerPropOutcome(currentValue = "", allowOverUnder = true) {
  const examples = allowOverUnder ? "O, U, Over, Under, Yes, or No" : "Y, N, Yes, or No";
  const raw = window.prompt(
    `Enter player prop outcome/side: ${examples}`,
    currentValue || (allowOverUnder ? "O" : "Y")
  );

  return normalizeSelectionSide(raw || "");
}

function promptForPlayerPropMarket(currentValue = "") {
  const normalizedCurrent = normalizePropMarketValue(currentValue || "");
  const raw = window.prompt(
    `Enter / confirm player prop market.
Examples: points, rebounds, assists, threes / 3 pointers, PRA, shots on goal, strikeouts, home runs, double-double`,
    normalizedCurrent || currentValue || ""
  );

  if (raw === null) return null;

  return normalizePropMarketValue(raw || normalizedCurrent || "");
}

function promptForPlayerPropSubject(currentValue = "") {
  const raw = window.prompt(
    `Enter Player / Subject.
Example: Ryan Rollins`,
    cleanPlayerSubjectForBuild(currentValue || "") || currentValue || ""
  );

  if (raw === null) return null;

  return getSafePlayerSubject(raw || "");
}

function savePlayerPropBuildValues(row = {}, values = {}) {
  if (!row?.id) return;

  const subject = getPlayerSubjectForReviewLeague(row, values.subject || "");
  const propMarket = normalizePropMarketValue(values.propMarket || "");

  handleRowFieldChange(row.id, "reviewBetKind", "player_prop");
  handleRowFieldChange(row.id, "betType", "player prop");
  handleRowFieldChange(row.id, "canonicalMarketContext", "player prop");

  if (subject) {
    handleRowFieldChange(row.id, "canonicalSubject", subject);
    handleRowFieldChange(row.id, "playerLastName", getLastNameFromText(subject));
    handleRowFieldChange(row.id, "playerSubjectManual", "Y");

    if (popupSubjectRef.current) popupSubjectRef.current.value = subject;
    if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = "";
  }

  if (propMarket) {
    handleRowFieldChange(row.id, "propMarket", propMarket);
    if (popupPropMarketRef.current) popupPropMarketRef.current.value = propMarket;
  }

  if (popupBetTypeRef.current) popupBetTypeRef.current.value = "player prop";
  if (popupMarketContextRef.current) popupMarketContextRef.current.value = "player prop";
}

function extractLineFromText(value = "") {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

  const ladder = text.match(/\b(\d+(?:\.\d+)?)\s*\+\b/);
  if (ladder) return `${ladder[1]}+`;

  const sideLine = text.match(/\b(?:over|under|o|u)\s*([+-]?\d+(?:\.\d+)?)/i);
  if (sideLine) return sideLine[1];

  const spread = text.match(/\b([+-]\d+(?:\.\d+)?)\b/);
  if (spread) return spread[1];

  const number = text.match(/\b(\d+(?:\.\d+)?)\b/);
  return number ? number[1] : "";
}

function getPopupSelectionBuildContext(row = {}) {
  const selectionText = popupSelectionRef.current?.value || row.selection || "";
  const reviewKind = getReviewBetKind(row);
  const marketText = [
    popupMarketContextRef.current?.value,
    popupPropMarketRef.current?.value,
    row.betType,
    row.marketDetail,
    row.canonicalMarketContext,
    row.propMarket,
    row.selection,
    row.sourceText,
  ].filter(Boolean).join(" ");

  const betType = normalizeBetTypeValue(
    popupBetTypeRef.current?.value ||
      row.betType ||
      marketText
  );

  const lockedSubject = getLockedPlayerSubjectForRow(row);
  const visibleSubject = getVisiblePlayerSubjectForRow(row);
  const inferredSubject =
    reviewKind === "player_prop" ? inferPlayerSubjectFromParsedText(row) : "";
  const rawSubjectCandidate =
    lockedSubject ||
    visibleSubject ||
    inferredSubject ||
    row.canonicalSubject ||
    row.canonicalPlayer ||
    "";

  const subject = getPlayerSubjectForReviewLeague(
    row,
    rawSubjectCandidate
  );

  const propMarket = normalizePropMarketValue(
    popupPropMarketRef.current?.value ||
      row.propMarket ||
      (reviewKind === "player_prop" ? inferPropMarketFromRow(row) : "") ||
      ""
  );

  const participantA = String(
    popupParticipantARef.current?.value ||
      row.participantA ||
      row.participantANormalized ||
      ""
  ).trim();

  const participantB = String(
    popupParticipantBRef.current?.value ||
      row.participantB ||
      row.participantBNormalized ||
      ""
  ).trim();

  const existingText = [
    selectionText,
    row.marketDetail,
    row.canonicalMarketContext,
    row.sourceText,
  ].filter(Boolean).join(" ");

  const mainLine = inferMainLineSideAndLine(row);

  const selectionSideMatch =
    findParticipantMatchForSide(selectionText, row)?.display ||
    findParticipantMatchForSide(row.selection || "", row)?.display ||
    findParticipantMatchForSide(row.rawSelection || "", row)?.display ||
    "";

  const visibleMainLineSide =
    popupMainLineSideRef.current?.value || row.mainLineSide || "";
  const visibleMainLineSideMatch = findParticipantMatchForSide(
    visibleMainLineSide,
    row
  )?.display;
  const rawMainLineSide =
    (sideValueIsTotalSide(visibleMainLineSide)
      ? normalizeSelectionSide(visibleMainLineSide)
      : visibleMainLineSideMatch) ||
    mainLine.side ||
    selectionSideMatch ||
    visibleMainLineSide ||
    "";

  const inferredMainLineMarket = sideValueIsTotalSide(rawMainLineSide)
    ? "total"
    : inferMainLineMarketFromRow(row) ||
      normalizeMainLineMarket(
        popupPropMarketRef.current?.value ||
          popupMarketContextRef.current?.value ||
          row.reviewMarketType ||
          row.betType ||
          row.marketDetail ||
          ""
      );

  return {
    reviewKind,
    betType,
    subject,
    propMarket,
    participantA,
    participantB,
    existingSelection: selectionText,
    existingText,
    side: normalizeSelectionSide(existingText),
    line: extractLineFromText(selectionText) || extractLineFromText(row.marketDetail || ""),
    mainLineMarket: inferredMainLineMarket,
    mainLineSide: rawMainLineSide,
    mainLineLine: cleanMainLineLineValue(
      getVisibleMainLineLineForRow(row, inferredMainLineMarket) || mainLine.line || "",
      inferredMainLineMarket
    ),
  };
}


function leagueSupportsZeroHalfPropNormalization(league = "") {
  const text = String(league || "").trim().toLowerCase();
  return text === "nhl" || isSoccerLeagueForReview(league);
}

function getZeroHalfPropMarketFromText(text = "") {
  const value = String(text || "").toLowerCase();

  if (/\b(?:goals?|goal scorer|goalscorer|score a goal|anytime goal)\b/.test(value)) return "goals";
  if (/\b(?:points?|pts?)\b/.test(value)) return "points";
  if (/\b(?:assists?|asts?)\b/.test(value)) return "assists";

  return "";
}

function inferZeroHalfPlayerProp(row = {}, ctx = {}, propMarketValue = "") {
  const league = getPreviewLeagueValue(row);
  if (!leagueSupportsZeroHalfPropNormalization(league)) return null;

  const combined = [
    propMarketValue,
    ctx.existingSelection,
    ctx.existingText,
    row.selection,
    row.marketDetail,
    row.sourceText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");

  if (!combined) return null;

  const market = normalizePropMarketValue(propMarketValue) || getZeroHalfPropMarketFromText(combined);
  const supportedMarket = ["goals", "points", "assists"].includes(market) ? market : getZeroHalfPropMarketFromText(combined);

  if (!supportedMarket) return null;

  const underPattern = new RegExp(`\\b(?:no|without|zero|0)\\s+(?:${supportedMarket}|${supportedMarket.slice(0, -1)})\\b`, "i");
  const overPattern = new RegExp(`\\b(?:anytime|1\\+|one\\+|record(?:s|ed)?\\s+(?:a|an|one|1\\+)?)\\s+(?:${supportedMarket}|${supportedMarket.slice(0, -1)})\\b`, "i");
  const scoreGoalPattern = supportedMarket === "goals" && /\b(?:score a goal|to score|anytime goal scorer|anytime goalscorer|goalscorer)\b/i.test(combined);

  if (underPattern.test(combined)) {
    return { side: "Under", line: "0.5", market: supportedMarket };
  }

  if (overPattern.test(combined) || scoreGoalPattern) {
    return { side: "Over", line: "0.5", market: supportedMarket };
  }

  return null;
}


function getPlayerSelectionUsingManualSubject(row = {}, subjectValue = "") {
  const rawSubject =
    subjectValue ||
    getRefValueForRow(popupSubjectRef, row.id) ||
    row.canonicalSubject ||
    row.canonicalPlayer ||
    "";
  const subject = getPlayerSubjectForReviewLeague(row, rawSubject);
  if (!subject) return "";

  const propMarket = normalizePropMarketValue(
    popupPropMarketRef.current?.value || row.propMarket || inferPropMarketFromRow(row) || ""
  );

  const combined = [
    popupSelectionRef.current?.value,
    row.selection,
    row.marketDetail,
    row.sourceText,
    propMarket,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");

  const market = propMarket || getZeroHalfPropMarketFromText(combined) || "";

  if (isMethodOfVictoryMarket(market)) {
    return buildMethodOfVictorySelection(row, subject, { promptIfMissing: false });
  }

  if (market === "home runs") {
    const homeRunSelection = buildHomeRunZeroHalfSelection(
      row,
      subject,
      [
        popupSelectionRef.current?.value,
        row.selection,
        row.marketDetail,
        row.sourceText,
      ]
    );

    if (homeRunSelection) return homeRunSelection;
  }

  if (market === "goals") {
    const goalSelection = buildGoalZeroHalfSelection(
      row,
      subject,
      [
        popupSelectionRef.current?.value,
        row.selection,
        row.marketDetail,
        row.sourceText,
      ]
    );

    if (goalSelection) return goalSelection;
  }

  const zeroMarket = ["goals", "points", "assists"].includes(market)
    ? market
    : getZeroHalfPropMarketFromText(combined);

  if (zeroMarket && leagueSupportsZeroHalfPropNormalization(getPreviewLeagueValue(row))) {
    const singular = zeroMarket.replace(/s$/, "");
    const underPattern = new RegExp(`\\b(?:no|without|zero|0)\\s+(?:${zeroMarket}|${singular})\\b`, "i");
    const overPattern = new RegExp(`\\b(?:anytime|1\\+|one\\+|record(?:s|ed)?\\s+(?:a|an|one|1\\+)?)\\s+(?:${zeroMarket}|${singular})\\b`, "i");
    const scoreGoalPattern = zeroMarket === "goals" && /\b(?:score a goal|to score|anytime goal scorer|anytime goalscorer|goalscorer)\b/i.test(combined);

    if (underPattern.test(combined)) return cleanSelectionTextForReview(`${subject} Under 0.5 ${zeroMarket}`);
    if (overPattern.test(combined) || scoreGoalPattern) return cleanSelectionTextForReview(`${subject} Over 0.5 ${zeroMarket}`);
  }

  const side = normalizeSelectionSide(combined);
  const line = extractLineFromText(combined);

  const marketLabel = getPropMarketSelectionLabel(market);

  if (market && side && line && !/\+$/.test(String(line))) {
    return cleanSelectionTextForReview(`${subject} ${side} ${line} ${marketLabel}`);
  }

  if (market && /\+$/.test(String(line))) {
    return cleanSelectionTextForReview(`${subject} ${line} ${marketLabel}`);
  }

  if (market && ["Yes", "No"].includes(side)) {
    return cleanSelectionTextForReview(`${subject} ${side} ${marketLabel}`);
  }

  return "";
}

function shouldReplacePlayerSelectionForManualSubject(row = {}, subjectValue = "") {
  const subject = getPlayerSubjectForReviewLeague(row, subjectValue || "");
  if (!subject) return false;

  const selection = String(popupSelectionRef.current?.value || row.selection || "").trim();
  if (!selection) return true;

  const selectionKey = normalizeKnownPlayerKey(selection);
  const subjectKey = normalizeKnownPlayerKey(subject);
  const subjectMatches =
    !!subjectKey && selectionKey.includes(subjectKey);

  const currentMarket = normalizePropMarketValue(
    popupPropMarketRef.current?.value ||
      row.propMarket ||
      inferPropMarketFromRow(row) ||
      ""
  );
  const selectionMarket = detectKnownPropMarketFromText(selection);

  // An edited Player / Subject or Prop Market must replace stale text in
  // Final Selection. Final Selection is only a fallback source for side/line.
  if (!subjectMatches) return true;
  if (
    currentMarket &&
    currentMarket !== "player prop" &&
    selectionMarket !== currentMarket
  ) {
    return true;
  }

  return (
    /\b(?:anytime|goal\s*scorer|goalscorer|score\s+a\s+goal|to\s+score|double[-\s]?double|triple[-\s]?double)\b/i.test(selection) ||
    /^\s*(?:yes|no|over|under)\b/i.test(selection) ||
    /\b(?:moneyline|spread|cost|match result)\b/i.test(selection)
  );
}

function preserveManualPlayerSubjectAndMaybeSelection(row = {}, subjectValue = "") {
  if (!row?.id) return {};

  const rawSubject =
    subjectValue ||
    getRefValueForRow(popupSubjectRef, row.id) ||
    row.canonicalSubject ||
    row.canonicalPlayer ||
    "";
  const subject = getPlayerSubjectForReviewLeague(row, rawSubject);
  if (!subject) return {};

  const updates = {
    canonicalSubject: subject,
    canonicalPlayer: subject,
    playerLastName: getLastNameFromText(subject),
    playerSubjectManual: "Y",
    reviewBetKind: "player_prop",
    betType: "player prop",
    canonicalMarketContext: "player prop",
  };

  const nextSelection = getPlayerSelectionUsingManualSubject(row, subject);
  if (nextSelection && shouldReplacePlayerSelectionForManualSubject(row, subject)) {
    updates.selection = nextSelection;
    if (popupSelectionRef.current) popupSelectionRef.current.value = nextSelection;
  }

  if (popupSubjectRef.current && popupSubjectRef.current.value !== subject) popupSubjectRef.current.value = subject;
  if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = "";
  if (popupBetTypeRef.current) popupBetTypeRef.current.value = "player prop";
  if (popupMarketContextRef.current) popupMarketContextRef.current.value = "player prop";

  return updates;
}

function promptForSelectionLine(kind = "line", currentValue = "") {
  return window.prompt(
    `Enter ${kind} number / threshold.\nExamples: 17.5, 4+, -2.5`,
    currentValue || ""
  );
}

function promptForSelectionSide(currentValue = "") {
  const raw = window.prompt("Enter side: Over or Under", currentValue || "Over");
  return normalizeSelectionSide(raw || "");
}

function buildSelectionFromPopupValues(row = {}, options = {}) {
  const { persistPlayerPropValues = true } = options;
  const ctx = getPopupSelectionBuildContext(row);

  function syncPlayerPropBuildValues(values = {}) {
    const subject = getSafePlayerSubject(values.subject || "");
    const propMarket = normalizePropMarketValue(values.propMarket || "");

    if (persistPlayerPropValues) {
      savePlayerPropBuildValues(row, { subject, propMarket });
      return;
    }

    if (subject) {
      if (popupSubjectRef.current) popupSubjectRef.current.value = subject;
      if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = "";
    }

    if (propMarket && popupPropMarketRef.current) {
      popupPropMarketRef.current.value = propMarket;
    }

    if (popupBetTypeRef.current) popupBetTypeRef.current.value = "player prop";
    if (popupMarketContextRef.current) popupMarketContextRef.current.value = "player prop";
  }
  const reviewKind = ctx.reviewKind || getReviewBetKind(row);

  if (reviewKind === "main_line") {
    const market = ctx.mainLineMarket || inferMainLineMarketFromRow(row) || normalizeBetTypeValue(ctx.betType) || "";
    let side = String(ctx.mainLineSide || "").trim();
    let line = String(ctx.mainLineLine || "").trim();

    if (!market) {
      window.alert("Choose a main-line market first: moneyline, spread, or total.");
      return "";
    }

    if (market === "moneyline") {
      if (!side) {
        const selectedSide = promptForMainLineParticipantChoice(
          row,
          "moneyline",
          ""
        );
        if (selectedSide === null) return "";
        side = selectedSide;
      }

      return buildCanonicalMainLineSelection(row, market, side, "");
    }

    if (market === "spread") {
      if (!side) side = window.prompt("Enter spread side/team", ctx.participantA || ctx.participantB || "") || "";

      side = normalizeMainLineSideValue(side, row, market);

      if (!line || !/^[+-]/.test(line)) line = promptForSelectionLine("spread line", line || "");
      if (line === null) return "";
      line = String(line || "").trim();
      if (!side || !line) return "";
      return buildCanonicalMainLineSelection(row, market, side, line);
    }

    if (market === "total") {
      if (!side || !["Over", "Under"].includes(normalizeSelectionSide(side))) side = promptForSelectionSide(side || "");
      if (!line) line = promptForSelectionLine("total line", "");
      if (line === null) return "";
      line = String(line || "").trim();
      if (!side || !line) return "";
      return buildCanonicalMainLineSelection(row, market, side, line);
    }
  }

  if (reviewKind === "parlay") {
    return getParlaySummaryLabel(row);
  }

  if (reviewKind === "promo_special") {
    const existing = cleanSelectionTextForReview(
      ctx.existingSelection || row.selection || ""
    );
    const inferredOutcome = normalizeSelectionSide(
      [existing, row.marketDetail, row.sourceText].filter(Boolean).join(" ")
    );

    if (inferredOutcome) return inferredOutcome;
    if (existing && !/^(?:straight|promo|promo special)$/i.test(existing)) return existing;

    const manual = window.prompt(
      "Enter the promo-special outcome/selection. Example: Yes",
      "Yes"
    );

    return cleanSelectionTextForReview(manual || "");
  }

  if (reviewKind === "other") {
    const existing = cleanSelectionTextForReview(
      ctx.existingSelection || row.selection || ""
    );
    const gamePropMarket = getGamePropMarketLabel(
      [
        popupPropMarketRef.current?.value,
        popupMarketContextRef.current?.value,
        row.reviewMarketType,
        row.canonicalMarketContext,
        row.marketDetail,
        row.selection,
        row.sourceText,
      ].filter(Boolean).join(" ")
    );
    const inferredOutcome = normalizeSelectionSide(
      [existing, row.marketDetail, row.sourceText].filter(Boolean).join(" ")
    );

    if (gamePropMarket) {
      return buildGamePropSelection(
        gamePropMarket,
        inferredOutcome,
        existing
      );
    }
  }

  if (reviewKind === "player_prop") {
    const rawSubject = getLockedPlayerSubjectForRow(row) || ctx.subject || inferPlayerSubjectFromParsedText(row) || "";
    let subject = getPlayerSubjectForReviewLeague(row, rawSubject);

    if (!subject) {
      const promptedSubject = promptForPlayerPropSubject(rawSubject || "");
      if (promptedSubject === null) return "";
      subject = getSafePlayerSubject(promptedSubject);
    }

    // If the parser stuffed market/O-U/line junk into the player field, do not
    // reuse it as the player name. Use the cleaned player name in the visible fields.
    if (rawSubject && subject && playerPropSubjectLooksDirty(rawSubject)) {
      if (popupSubjectRef.current) popupSubjectRef.current.value = subject;
      if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = "";
    }

    const inferredMarket = inferPropMarketFromSources([
      row.sourceText,
      row.marketDetail,
      row.selection,
      ctx.existingText,
      ctx.propMarket,
      row.propMarket,
    ]);

    // Only prompt for player prop details when something is actually missing.
    // If the visible boxes already contain player/market/side/line, M should
    // build from them without another toast.
    let propMarket = normalizePropMarketValue(ctx.propMarket || row.propMarket || "");
    if (!propMarket || propMarket === "player prop") {
      propMarket = inferredMarket && inferredMarket !== "player prop" ? inferredMarket : "";
    }

    if (!propMarket) {
      const promptedMarket = promptForPlayerPropMarket(inferredMarket && inferredMarket !== "player prop" ? inferredMarket : "");
      if (promptedMarket === null) return "";
      propMarket = promptedMarket;
    }

    const isTotalGamesMarket = propMarket === "games";

    if ((!subject && !isTotalGamesMarket) || !propMarket) {
      window.alert("Need Player / Subject and Market before building a player prop selection.");
      return "";
    }

    if (isTotalGamesMarket) {
      const gamesText = [
        ctx.existingText,
        ctx.existingSelection,
        row.selection,
        row.marketDetail,
        row.sourceText,
      ]
        .filter(Boolean)
        .join(" ");

      let gamesSide = normalizeSelectionSide(gamesText);
      let gamesLine = String(
        ctx.line ||
          extractLineFromText(ctx.existingSelection || "") ||
          extractLineFromText(row.marketDetail || "") ||
          extractLineFromText(row.sourceText || "") ||
          ""
      ).trim();

      if (!["Over", "Under"].includes(gamesSide)) {
        gamesSide = promptForSelectionSide("");
      }

      if (!gamesSide) return "";

      if (!gamesLine) {
        gamesLine = promptForSelectionLine("total games line", "");
        if (gamesLine === null) return "";
        gamesLine = String(gamesLine || "").trim();
      }

      if (!gamesLine) return "";

      syncPlayerPropBuildValues({ subject: "", propMarket });
      return cleanSelectionTextForReview(
        `${gamesSide} ${gamesLine} Games`
      );
    }

    if (isMethodOfVictoryMarket(propMarket)) {
      const methodSelection = buildMethodOfVictorySelection(row, subject, {
        promptIfMissing: true,
      });

      if (!methodSelection) return "";

      subject = getPlayerSubjectForReviewLeague(row, subject);
      syncPlayerPropBuildValues({ subject, propMarket });
      return methodSelection;
    }

    if (propMarket === "home runs") {
      const homeRunSelection = buildHomeRunZeroHalfSelection(
        row,
        subject,
        [
          ctx.existingSelection,
          ctx.existingText,
          row.selection,
          row.marketDetail,
          row.sourceText,
        ]
      );

      if (homeRunSelection) {
        syncPlayerPropBuildValues({ subject, propMarket });
        return homeRunSelection;
      }
    }

    if (propMarket === "goals") {
      const goalSelection = buildGoalZeroHalfSelection(
        row,
        subject,
        [
          ctx.existingSelection,
          ctx.existingText,
          row.selection,
          row.marketDetail,
          row.sourceText,
        ]
      );

      if (goalSelection) {
        syncPlayerPropBuildValues({ subject, propMarket });
        return goalSelection;
      }
    }

    const zeroHalf = inferZeroHalfPlayerProp(row, ctx, propMarket);

    if (zeroHalf) {
      propMarket = zeroHalf.market || propMarket;
      syncPlayerPropBuildValues({ subject, propMarket });
      if (popupPropMarketRef.current) popupPropMarketRef.current.value = propMarket;
      return cleanSelectionTextForReview(`${subject} ${zeroHalf.side} ${zeroHalf.line} ${getPropMarketSelectionLabel(propMarket)}`);
    }

    const inferredSide = inferYesNoPlayerPropSide(
      ctx.existingText || ctx.existingSelection || "",
      propMarket
    ) || normalizeSelectionSide(ctx.existingText || ctx.existingSelection || "");
    const existingLine = String(ctx.line || extractLineFromText(ctx.existingSelection || "") || "").trim();
    const yesNoMarket = isYesNoPlayerPropMarket(propMarket) || ["Yes", "No"].includes(inferredSide);

    syncPlayerPropBuildValues({ subject, propMarket });

    if (yesNoMarket) {
      let side = ["Yes", "No"].includes(inferredSide) ? inferredSide : "";

      if (!side) {
        side = promptForPlayerPropOutcome("", false);
      }

      if (!side || !["Yes", "No"].includes(side)) return "";

      return cleanSelectionTextForReview(`${subject} ${side} ${getPropMarketSelectionLabel(propMarket)}`);
    }

    let side = ["Over", "Under"].includes(inferredSide) ? inferredSide : "";

    if (!side) {
      side = promptForPlayerPropOutcome("", true);
    }

    if (!side || !["Over", "Under"].includes(side)) return "";

    let line = existingLine;

    if (!line) {
      line = promptForSelectionLine("player prop line", "");
      if (line === null) return "";
      line = String(line || "").trim();
    }

    if (!line) return "";

    if (/\+$/.test(line)) return cleanSelectionTextForReview(`${subject} ${line} ${getPropMarketSelectionLabel(propMarket)}`);

    return cleanSelectionTextForReview(`${subject} ${side} ${line} ${getPropMarketSelectionLabel(propMarket)}`);
  }

  const manual = window.prompt("Enter the cleaned selection:", ctx.existingSelection || "");
  return cleanSelectionTextForReview(manual || "");
}

function collectLeagueNormalizationUpdates(row = {}, baseUpdates = {}) {
  const updates = {};
  const workingRow = { ...row, ...baseUpdates };
  const currentLeague = getPreviewLeagueValue(workingRow);
  const isCollegeLeague = isCollegeLeagueForAlias(currentLeague);
  const inferredLeague = inferLeagueFromReviewRow(workingRow, {
    requireSafeCollegeOverride: isCollegeLeague,
  });

  let finalLeague = currentLeague;

  if (inferredLeague) {
    if (!currentLeague) {
      finalLeague = inferredLeague;
      updates.leagueMismatchOverrideKey = "";
    } else {
      const currentKey = getMajorSportKeyFromLeague(currentLeague);
      const inferredKey = getMajorSportKeyFromLeague(inferredLeague);
      const currentComparable =
        currentKey || String(currentLeague || "").trim().toLowerCase();
      const inferredComparable =
        inferredKey || String(inferredLeague || "").trim().toLowerCase();
      const leaguesDiffer =
        !!currentComparable &&
        !!inferredComparable &&
        currentComparable !== inferredComparable;

      if (leaguesDiffer) {
        const mismatchDecisionKey = getLeagueMismatchDecisionKey(
          currentLeague,
          inferredLeague
        );
        const priorDeniedThisChange =
          !!mismatchDecisionKey &&
          workingRow.leagueMismatchOverrideKey === mismatchDecisionKey;
        const canAutoCorrectStrongWrongLeague =
          !priorDeniedThisChange &&
          workingRow.sportLeagueManual !== "Y" &&
          !!inferredKey &&
          hasStrongMajorLeagueOverrideEvidence(workingRow, inferredKey);

        if (canAutoCorrectStrongWrongLeague) {
          finalLeague = inferredLeague;
          updates.leagueMismatchOverrideKey = "";
        } else {
          finalLeague = getCanonicalLeagueLabelForReview(currentLeague);
          if (mismatchDecisionKey) {
            updates.leagueMismatchOverrideKey = mismatchDecisionKey;
          }
        }
      }
    }
  }

  if (finalLeague) {
    updates.sportLeagueManual = "Y";
    updates.sportLeague = finalLeague;
    if (popupLeagueRef.current) popupLeagueRef.current.value = finalLeague;
  }

  const leagueForParticipants = finalLeague || workingRow.sportLeague || "";
  const rawA = cleanParticipantTextForMatching(
    popupParticipantARef.current?.value ||
      workingRow.participantA ||
      workingRow.participantANormalized ||
      ""
  );
  const rawB = cleanParticipantTextForMatching(
    popupParticipantBRef.current?.value ||
      workingRow.participantB ||
      workingRow.participantBNormalized ||
      ""
  );

  if (rawA) {
    updates.participantA = rawA;
    updates.participantANormalized = normalizeParticipantName(
      rawA,
      leagueForParticipants
    );
    if (popupParticipantARef.current) popupParticipantARef.current.value = rawA;
  }

  if (rawB) {
    updates.participantB = rawB;
    updates.participantBNormalized = normalizeParticipantName(
      rawB,
      leagueForParticipants
    );
    if (popupParticipantBRef.current) popupParticipantBRef.current.value = rawB;
  }

  return updates;
}

function collectSelectionUpdatesForCurrentRow(row = {}, baseUpdates = {}) {
  if (!row?.id) return {};

  const workingRow = { ...row, ...baseUpdates };
  const updates = {};
  const nextSelection = buildSelectionFromPopupValues(workingRow, {
    persistPlayerPropValues: false,
  });
  const ctx = getPopupSelectionBuildContext(workingRow);
  const kind = ctx.reviewKind || getReviewBetKind(workingRow);

  if (nextSelection) {
    const cleanedNextSelection = cleanSelectionTextForReview(nextSelection);
    updates.selection = cleanedNextSelection;
    if (popupSelectionRef.current) {
      popupSelectionRef.current.value = cleanedNextSelection;
    }
  }

  if (kind === "main_line") {
    const market =
      ctx.mainLineMarket || inferMainLineMarketFromRow(workingRow) || "spread";
    const normalizedMainLineSide = normalizeMainLineSideValue(
      ctx.mainLineSide || "",
      workingRow,
      market
    );

    Object.assign(updates, {
      reviewBetKind: "main_line",
      betType: market,
      canonicalMarketContext: market,
      reviewMarketType: market,
      propMarket: "",
      canonicalSubject: "",
      canonicalPlayer: "",
      playerLastName: "",
      playerSubjectManual: "N",
      mainLineSide: normalizedMainLineSide,
      mainLineLine: cleanMainLineLineValue(ctx.mainLineLine || "", market),
    });

    if (popupMainLineSideRef.current && normalizedMainLineSide) {
      popupMainLineSideRef.current.value = normalizedMainLineSide;
    }
    if (popupBetTypeRef.current) popupBetTypeRef.current.value = market;
    if (popupMarketContextRef.current) popupMarketContextRef.current.value = market;
    if (popupPropMarketRef.current) popupPropMarketRef.current.value = market;
    if (popupSubjectRef.current) popupSubjectRef.current.value = "";
    if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = "";

    return updates;
  }

  if (kind === "parlay") {
    const legs = parseParlayLegs(workingRow);
    const label = getParlaySummaryLabel(workingRow);

    Object.assign(updates, {
      reviewBetKind: "parlay",
      betType: "parlay",
      canonicalMarketContext: "parlay",
      reviewMarketType: "parlay",
      selection: label,
      fixtureEvent: label,
      parlayLegCount: legs.length
        ? String(legs.length)
        : workingRow.parlayLegCount || "",
    });

    if (popupSelectionRef.current) popupSelectionRef.current.value = label;
    if (popupFixtureRef.current) popupFixtureRef.current.value = label;
    if (popupBetTypeRef.current) popupBetTypeRef.current.value = "parlay";
    if (popupMarketContextRef.current) popupMarketContextRef.current.value = "parlay";

    return updates;
  }

  if (kind === "promo_special") {
    const eventLabel = getPromoSpecialEventLabel(workingRow);

    Object.assign(updates, {
      reviewBetKind: "promo_special",
      betType: "straight",
      canonicalMarketContext: "promo special",
      reviewMarketType: "promo special",
      fixtureEvent: eventLabel,
    });

    if (popupBetTypeRef.current) popupBetTypeRef.current.value = "straight";
    if (popupMarketContextRef.current) popupMarketContextRef.current.value = "promo special";
    if (popupPropMarketRef.current) popupPropMarketRef.current.value = "promo special";
    if (popupFixtureRef.current) popupFixtureRef.current.value = eventLabel;

    return updates;
  }

  if (kind === "player_prop") {
    const rawSubject =
      getLockedPlayerSubjectForRow(workingRow) ||
      inferPlayerSubjectFromParsedText(workingRow) ||
      workingRow.canonicalSubject ||
      workingRow.canonicalPlayer ||
      "";

    const manualSubject = expandSingleWordPlayerSubjectFromRow(
      workingRow,
      rawSubject
    );
    const playerUpdates = manualSubject
      ? preserveManualPlayerSubjectAndMaybeSelection(workingRow, manualSubject)
      : {};
    const propMarket = normalizePropMarketValue(
      popupPropMarketRef.current?.value ||
        workingRow.propMarket ||
        inferPropMarketFromRow(workingRow) ||
        ""
    );

    Object.assign(updates, playerUpdates, {
      reviewBetKind: "player_prop",
      betType: "player prop",
      canonicalMarketContext: "player prop",
    });

    if (manualSubject) {
      updates.canonicalSubject = manualSubject;
      updates.canonicalPlayer = manualSubject;
      updates.playerLastName = getLastNameFromText(manualSubject);
      updates.playerSubjectManual = "Y";

      if (popupSubjectRef.current) {
        popupSubjectRef.current.value = manualSubject;
      }
    }

    if (propMarket) updates.propMarket = propMarket;

    // The visible structured Prop Market is authoritative. Always rebuild the
    // selection from it so a stale "Points" selection cannot override PRA,
    // Points + Rebounds, Points + Assists, or Rebounds + Assists.
    const structuredSelection = buildVisibleStructuredPlayerPropSelection(
      {
        ...workingRow,
        canonicalSubject: manualSubject || workingRow.canonicalSubject || "",
        canonicalPlayer: manualSubject || workingRow.canonicalPlayer || "",
        propMarket,
      },
      nextSelection ||
        popupSelectionRef.current?.value ||
        workingRow.selection ||
        ""
    );

    if (structuredSelection) {
      updates.selection = cleanSelectionTextForReview(structuredSelection);

      if (popupSelectionRef.current) {
        popupSelectionRef.current.value = updates.selection;
      }
    }

    if (popupBetTypeRef.current) popupBetTypeRef.current.value = "player prop";
    if (popupMarketContextRef.current) popupMarketContextRef.current.value = "player prop";

    return updates;
  }

  if (kind === "other") {
    const gamePropMarket = getGamePropMarketLabel(
      [
        popupPropMarketRef.current?.value,
        popupMarketContextRef.current?.value,
        workingRow.reviewMarketType,
        workingRow.canonicalMarketContext,
        workingRow.marketDetail,
        workingRow.selection,
        workingRow.sourceText,
      ]
        .filter(Boolean)
        .join(" ")
    );
    const nextMarket =
      gamePropMarket ||
      cleanSelectionTextForReview(
        popupPropMarketRef.current?.value ||
          workingRow.canonicalMarketContext ||
          workingRow.marketDetail ||
          "game prop"
      ).toLowerCase();

    const gamePropOutcome = normalizeSelectionSide(
      [
        popupSelectionRef.current?.value,
        workingRow.selection,
        workingRow.marketDetail,
        workingRow.sourceText,
      ]
        .filter(Boolean)
        .join(" ")
    );

    Object.assign(updates, {
      reviewBetKind: "other",
      betType: "game prop",
      canonicalMarketContext: nextMarket,
      reviewMarketType: nextMarket,
      marketDetail: nextMarket,
      propMarket: "",
      canonicalSubject: "",
      canonicalPlayer: "",
      playerLastName: "",
      playerSubjectManual: "N",
    });

    if (gamePropMarket) {
      const descriptiveGamePropSelection = buildGamePropSelection(
        gamePropMarket,
        gamePropOutcome,
        popupSelectionRef.current?.value || workingRow.selection || ""
      );

      if (descriptiveGamePropSelection) {
        updates.selection = descriptiveGamePropSelection;
        if (popupSelectionRef.current) {
          popupSelectionRef.current.value = descriptiveGamePropSelection;
        }
      }
    }

    if (popupBetTypeRef.current) popupBetTypeRef.current.value = "game prop";
    if (popupMarketContextRef.current) popupMarketContextRef.current.value = nextMarket;
    if (popupPropMarketRef.current) popupPropMarketRef.current.value = nextMarket;
    if (popupSubjectRef.current) popupSubjectRef.current.value = "";
    if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = "";
  }

  return updates;
}

function buildSelectionForCurrentRow(row = {}, baseUpdates = {}) {
  if (!row?.id) return false;

  const selectionUpdates = collectSelectionUpdatesForCurrentRow(
    row,
    baseUpdates
  );

  return applyRowFieldUpdates(row.id, {
    ...baseUpdates,
    ...selectionUpdates,
  });
}

function buildBetFieldsForCurrentRow(row = {}) {
  if (!row?.id) return;

  // Performance-critical path: compute every normalization change in memory,
  // then write the row once. The previous path repeatedly mapped/re-enriched
  // the entire rows array for each individual field update.
  let updates = applyParsedContextSuggestions(row, {
    updateRefs: true,
    returnUpdatesOnly: true,
  });

  updates = {
    ...updates,
    ...collectLeagueNormalizationUpdates(row, updates),
  };

  let workingRow = { ...row, ...updates };
  const reviewKind = getReviewBetKind(workingRow);
  const nextEventLabel =
    reviewKind === "parlay"
      ? getParlaySummaryLabel(workingRow)
      : reviewKind === "promo_special"
      ? getPromoSpecialEventLabel(workingRow)
      : buildContextEventLabel(workingRow);

  if (nextEventLabel) {
    updates.fixtureEvent = nextEventLabel;
    if (popupFixtureRef.current) {
      popupFixtureRef.current.value = nextEventLabel;
    }
  }

  workingRow = { ...row, ...updates };
  const selectionUpdates = collectSelectionUpdatesForCurrentRow(
    workingRow,
    updates
  );

  updates = {
    ...updates,
    ...selectionUpdates,
    parsedContextAutofilled: "Y",
  };

  const changed = runRowUpdateBatch(row.id, () =>
    applyRowFieldUpdates(row.id, updates)
  );

  setReviewActionNotice(
    changed
      ? "Built event, market, bet type, and selection in one committed update."
      : "No normalization changes were needed for this row."
  );
}


function tryAutoNormalizeBetFields(row = {}, options = {}) {
  if (!row?.id) return false;

  const { source = "manual", showNotice = true } = options;
  const currentRowId = row.id;
  let changed = false;
  const updates = {};

  function queue(field, value) {
    if (!field) return;
    updates[field] = value;
  }

  const oddsCalculated = calculateOddsFromStakeAndPayout(row, { showNotice: false });
  if (oddsCalculated) changed = true;

  const lockedPlayerSubject = getLockedPlayerSubjectForRow(row);
  const visiblePlayerSubject = getVisiblePlayerSubjectForRow(row);

  const suggestions = getSmartContextSuggestions(row);
  const kind = suggestions.reviewBetKind || getReviewBetKind(row);

  function maybeFill(field, value, ref = null) {
    if (!value) return;

    const refValue = ref?.current?.value;
    const existing = refValue !== undefined && String(refValue || "").trim()
      ? refValue
      : row[field];

    if (String(existing || "").trim()) return;

    queue(field, value);
    if (ref?.current) ref.current.value = value;
  }

  maybeFill("participantA", suggestions.participantA, popupParticipantARef);
  maybeFill("participantANormalized", suggestions.participantANormalized);
  maybeFill("participantB", suggestions.participantB, popupParticipantBRef);
  maybeFill("participantBNormalized", suggestions.participantBNormalized);

  const inferredLeague = inferLeagueFromReviewRow({ ...row, ...updates }, {
    requireSafeCollegeOverride: isCollegeLeagueForAlias(row.sportLeague || popupLeagueRef.current?.value || ""),
  });

  if (inferredLeague) {
    const currentLeague = getPreviewLeagueValue(row);
    const currentKey = getMajorSportKeyFromLeague(currentLeague);
    const inferredKey = getMajorSportKeyFromLeague(inferredLeague);
    const shouldSetLeague =
      !currentLeague ||
      (currentKey && inferredKey && currentKey !== inferredKey) ||
      (isCollegeLeagueForAlias(currentLeague) && inferredLeague !== currentLeague);

    if (shouldSetLeague) {
      queue("sportLeagueManual", "Y");
      queue("sportLeague", inferredLeague);
      if (popupLeagueRef.current) popupLeagueRef.current.value = inferredLeague;
    }
  }

  const workingRow = { ...row, ...updates };
  const currentLeagueForRefs = getPreviewLeagueValue(workingRow) || row.sportLeague || "";

  const normalizedA = normalizeParticipantName(
    popupParticipantARef.current?.value || workingRow.participantA || workingRow.participantANormalized || "",
    currentLeagueForRefs
  );
  const normalizedB = normalizeParticipantName(
    popupParticipantBRef.current?.value || workingRow.participantB || workingRow.participantBNormalized || "",
    currentLeagueForRefs
  );

  if (normalizedA) queue("participantANormalized", normalizedA);
  if (normalizedB) queue("participantBNormalized", normalizedB);

  const rowForSelection = {
    ...workingRow,
    participantA: popupParticipantARef.current?.value || workingRow.participantA || "",
    participantB: popupParticipantBRef.current?.value || workingRow.participantB || "",
    participantANormalized: normalizedA || workingRow.participantANormalized || "",
    participantBNormalized: normalizedB || workingRow.participantBNormalized || "",
    sportLeague: currentLeagueForRefs,
  };

  const nextEventLabel =
    kind === "parlay"
      ? getParlaySummaryLabel(rowForSelection)
      : kind === "promo_special"
      ? getPromoSpecialEventLabel(rowForSelection)
      : buildContextEventLabel(rowForSelection);

  if (nextEventLabel) {
    if (popupFixtureRef.current) popupFixtureRef.current.value = nextEventLabel;
    queue("fixtureEvent", nextEventLabel);
  }

  const ctx = getPopupSelectionBuildContext(rowForSelection);
  const reviewKind =
    ctx.reviewKind || kind || getReviewBetKind(rowForSelection);
  let nextSelection = "";

  if (reviewKind === "parlay") {
    const summaryLabel = getParlaySummaryLabel(rowForSelection);
    queue("reviewBetKind", "parlay");
    queue("betType", "parlay");
    queue("canonicalMarketContext", "parlay");
    queue("reviewMarketType", "parlay");
    queue("fixtureEvent", summaryLabel);
    nextSelection = summaryLabel;
  }

  if (reviewKind === "promo_special") {
    queue("reviewBetKind", "promo_special");
    queue("betType", "straight");
    queue("canonicalMarketContext", "promo special");
    queue("reviewMarketType", "promo special");
    queue("fixtureEvent", getPromoSpecialEventLabel(rowForSelection));

    const existingPromoSelection = cleanSelectionTextForReview(
      popupSelectionRef.current?.value || rowForSelection.selection || ""
    );
    const promoOutcome = normalizeSelectionSide(
      [existingPromoSelection, rowForSelection.marketDetail, rowForSelection.sourceText]
        .filter(Boolean)
        .join(" ")
    );

    nextSelection =
      promoOutcome ||
      (!/^(?:straight|promo|promo special)$/i.test(existingPromoSelection)
        ? existingPromoSelection
        : "");
  }

  if (reviewKind === "main_line") {
    const market =
      ctx.mainLineMarket ||
      suggestions.mainLineMarket ||
      inferMainLineMarketFromRow(rowForSelection) ||
      normalizeBetTypeValue(ctx.betType) ||
      "";

    const rawSideCandidate =
      ctx.mainLineSide ||
      rowForSelection.mainLineSide ||
      (market === "moneyline" ? (popupSelectionRef.current?.value || rowForSelection.selection || "") : "") ||
      "";

    const side = market === "total"
      ? normalizeSelectionSide(rawSideCandidate || ctx.existingText || "")
      : normalizeMainLineSideValue(rawSideCandidate, rowForSelection, market);
    const line = cleanMainLineLineValue(ctx.mainLineLine || rowForSelection.mainLineLine || "", market);

    if (market) {
      queue("reviewBetKind", "main_line");
      queue("reviewMarketType", market);
      queue("canonicalMarketContext", market);
      queue("betType", market);
      queue("propMarket", "");

      if (popupBetTypeRef.current) popupBetTypeRef.current.value = market;
      if (popupMarketContextRef.current) popupMarketContextRef.current.value = market;
      if (popupPropMarketRef.current) popupPropMarketRef.current.value = market;
    }

    if (side) {
      queue("mainLineSide", side);
      if (popupMainLineSideRef.current) popupMainLineSideRef.current.value = side;
    }

    if (market === "moneyline" && side) {
      nextSelection = buildCanonicalMainLineSelection(
        rowForSelection,
        market,
        side,
        ""
      );
      queue("mainLineLine", "");
      if (popupMainLineLineRef.current) popupMainLineLineRef.current.value = "";
    } else if (market === "spread" && side && line) {
      nextSelection = buildCanonicalMainLineSelection(
        rowForSelection,
        market,
        side,
        line
      );
      queue("mainLineLine", line);
    } else if (market === "total" && ["Over", "Under"].includes(side) && line) {
      nextSelection = buildCanonicalMainLineSelection(
        rowForSelection,
        market,
        side,
        line
      );
      queue("mainLineLine", line);
    }
  }

  if (reviewKind === "player_prop") {
    const rawSubject =
      getLockedPlayerSubjectForRow(row) ||
      visiblePlayerSubject ||
      cleanPlayerNameForReviewRow(ctx.subject, rowForSelection) ||
      cleanParticipantTextForMatching(ctx.subject);
    const subject = getPlayerSubjectForReviewLeague(
      rowForSelection,
      rawSubject
    );
    const propMarket = ctx.propMarket || normalizePropMarketValue(ctx.existingText);
    const side = inferYesNoPlayerPropSide(
      ctx.existingText || ctx.existingSelection || "",
      propMarket
    ) || normalizeSelectionSide(ctx.existingText || ctx.existingSelection || "");
    const line = String(ctx.line || "").trim();
    const yesNoMarket = isYesNoPlayerPropMarket(propMarket) || ["Yes", "No"].includes(side);

    if (subject) {
      queue("canonicalSubject", subject);
      queue("playerSubjectManual", "Y");
      if (popupSubjectRef.current) popupSubjectRef.current.value = subject;

      const lastName = getLastNameFromText(subject);
      queue("playerLastName", lastName);
      if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = "";
    }

    const zeroHalf = inferZeroHalfPlayerProp(rowForSelection, ctx, propMarket);
    const finalPropMarket = zeroHalf?.market || propMarket;

    if (finalPropMarket) {
      queue("propMarket", finalPropMarket);
      if (popupPropMarketRef.current) popupPropMarketRef.current.value = finalPropMarket;
    }

    queue("reviewBetKind", "player_prop");
    queue("betType", "player prop");
    queue("canonicalMarketContext", "player prop");

    if (popupBetTypeRef.current) popupBetTypeRef.current.value = "player prop";
    if (popupMarketContextRef.current) popupMarketContextRef.current.value = "player prop";

    const homeRunSelection =
      finalPropMarket === "home runs"
        ? buildHomeRunZeroHalfSelection(
            rowForSelection,
            subject,
            [
              ctx.existingSelection,
              ctx.existingText,
              rowForSelection.selection,
              rowForSelection.marketDetail,
              rowForSelection.sourceText,
            ]
          )
        : "";
    const goalSelection =
      finalPropMarket === "goals"
        ? buildGoalZeroHalfSelection(
            rowForSelection,
            subject,
            [
              ctx.existingSelection,
              ctx.existingText,
              rowForSelection.selection,
              rowForSelection.marketDetail,
              rowForSelection.sourceText,
            ]
          )
        : "";

    if (isMethodOfVictoryMarket(finalPropMarket)) {
      nextSelection = buildMethodOfVictorySelection(rowForSelection, subject, {
        promptIfMissing: false,
      });
    } else if (homeRunSelection) {
      nextSelection = homeRunSelection;
    } else if (goalSelection) {
      nextSelection = goalSelection;
    } else if (zeroHalf && subject && finalPropMarket) {
      nextSelection = `${subject} ${zeroHalf.side} ${zeroHalf.line} ${getPropMarketSelectionLabel(finalPropMarket)}`;
    } else if (yesNoMarket && subject && finalPropMarket && ["Yes", "No"].includes(side)) {
      nextSelection = `${subject} ${side} ${getPropMarketSelectionLabel(finalPropMarket)}`;
    } else if (subject && finalPropMarket && line && /\+$/.test(line)) {
      nextSelection = `${subject} ${line} ${getPropMarketSelectionLabel(finalPropMarket)}`;
    } else if (subject && finalPropMarket && line && ["Over", "Under"].includes(side)) {
      nextSelection = `${subject} ${side} ${line} ${getPropMarketSelectionLabel(finalPropMarket)}`;
    }

    if (!nextSelection && finalPropMarket) {
      nextSelection = ensurePlayerPropMarketInSelection(
        rowForSelection,
        ctx.existingSelection || rowForSelection.selection || "",
        subject,
        finalPropMarket
      );
    }
  }

  if (nextSelection) {
    const cleanedNextSelection = cleanSelectionTextForReview(nextSelection);
    if (popupSelectionRef.current) popupSelectionRef.current.value = cleanedNextSelection;
    queue("selection", cleanedNextSelection);
  }

  if (Object.keys(updates).length) {
    changed = applyRowFieldUpdates(currentRowId, updates) || changed;
  }

  if (showNotice && changed) {
    const baseMessage = source === "auto_open"
      ? "Auto-normalized from recognized team/market context."
      : "Auto-normalized from the current review fields.";

    setReviewActionNotice(
      oddsCalculated
        ? `${baseMessage} Calculated odds from stake and payout.`
        : baseMessage
    );
  }

  return changed;
}

function getDateParts(value = "") {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!m) {
    return { month: "", day: "", year: "" };
  }

  return {
    month: m[1],
    day: m[2],
    year: m[3],
  };
}

function normalizeDateYear(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^\d{2}$/.test(raw)) return `20${raw}`;
  if (/^\d{4}$/.test(raw)) return raw;

  return raw;
}

function buildDateFromParts(monthValue = "", dayValue = "", yearValue = "") {
  const month = String(monthValue || "").trim();
  const day = String(dayValue || "").trim();
  const year = normalizeDateYear(yearValue);

  if (!month || !day || !year) return "";

  const m = Number(month);
  const d = Number(day);
  const y = Number(year);

  if (!Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(y)) return "";
  if (m < 1 || m > 12) return "";
  if (d < 1 || d > 31) return "";
  if (year.length !== 4) return "";

  const date = new Date(y, m - 1, d);

  if (
    Number.isNaN(date.getTime()) ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d ||
    date.getFullYear() !== y
  ) {
    return "";
  }

  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

function cleanParticipantTextForMatching(value = "") {
  return String(value || "")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/(^|\s)#\s*/g, "$1")
    .replace(/^[\s"'“”*#?&•·–—-]+/g, " ")
    .replace(/["'“”#]+$/g, " ")
    .replace(/[\s,.;:!?&]+$/g, " ")
    .replace(/^[\s,.;:!?&]+/g, " ")
    .replace(/\+/g, " ")
    .replace(/\bNeutral\s+(?:Venue|Site|Court|Field|Stadium|Arena|Ice|Location)\b/gi, " ")
    .replace(/\b(?:at|@)\s+Neutral\b/gi, " ")
    .replace(/\b(?:Venue|Neutral Site|Neutral Court|Neutral Field|Neutral Stadium|Neutral Arena)\b/gi, " ")
    .replace(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b\.?/gi, " ")
    .replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b\.?\s+\d{1,2}(?:,\s*\d{2,4})?/gi, " ")
    .replace(/\b\d{1,2}:\d{2}\s*(?:AM|PM|ET|CT|MT|PT)?\b/gi, " ")
    .replace(/\s*\|\s*(?:points?|rebounds?|assists?|props?|prop|player prop|moneyline|spread|total|run line|puck line).*$/i, "")
    .replace(/\b(?:moneyline|match betting|run line|puck line|spread|handicap|game total|team total)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSelectionTextForReview(value = "") {
  return String(value || "")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/(^|\s)#\s*/g, "$1")
    .replace(/^[\s"'“”*#•·–—-]+/g, "")
    .replace(/\bNeutral\s+(?:Venue|Site|Court|Field|Stadium|Arena|Ice|Location)\b/gi, " ")
    .replace(/\b(?:Venue|Neutral Site|Neutral Court|Neutral Field|Neutral Stadium|Neutral Arena)\b/gi, " ")
    .replace(/^\s*(?:spread|moneyline|total)\s+(?=yes\b|no\b|over\b|under\b)/i, "")
    .replace(/\s+cost\s+(?:moneyline|spread|total)\b.*$/i, "")
    .replace(/\s+[+-]\d{2,5}\s+cost\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAliasLookupKey(value = "") {
  return cleanParticipantTextForMatching(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactAliasLookupKey(value = "") {
  return normalizeAliasLookupKey(value).replace(/\s+/g, "");
}

function aliasCandidateIsSafeContainedMatch(aliasKey = "") {
  const key = normalizeAliasLookupKey(aliasKey);
  const wordCount = key.split(" ").filter(Boolean).length;
  const compactLength = compactAliasLookupKey(key).length;

  // Exact abbreviations still work elsewhere. Contained matching needs safer
  // aliases so junk text does not turn college teams into pro teams.
  return wordCount >= 2 || compactLength >= 7;
}

function isLikelyTrailingOcrJunkForTeamAlias(value = "") {
  const key = normalizeAliasLookupKey(value);
  const compact = compactAliasLookupKey(value);

  if (!key || !compact) return true;
  if (/\d{3,}/.test(compact)) return true;
  if (/\d/.test(compact) && /[a-z]/.test(compact)) return true;
  if (/^[o0l1i]{4,}\d*$/.test(compact)) return true;

  return false;
}

function aliasCandidateAllowsTrailingOcrJunk(candidateKey = "", canonical = "") {
  const key = normalizeAliasLookupKey(candidateKey);
  const canonicalKey = normalizeAliasLookupKey(canonical);
  const wordCount = key.split(" ").filter(Boolean).length;
  const compactLength = compactAliasLookupKey(key).length;

  // Let single-word country/full-name aliases survive OCR suffixes, e.g.
  // "Mexico ooo0o002010" -> "Mexico", without allowing tiny city/team
  // abbreviations to match inside random text.
  return wordCount >= 2 || (key === canonicalKey && compactLength >= 5);
}

function findUniqueTeamNicknameMatch(value = "", sportKeys = []) {
  const lookup = normalizeAliasLookupKey(value);
  const compactLookup = compactAliasLookupKey(value);

  if (!lookup && !compactLookup) return null;

  const keysToSearch = (sportKeys || []).length
    ? sportKeys.map((key) => String(key || "").toUpperCase()).filter(Boolean)
    : Object.keys(TEAM_ALIASES_BY_SPORT || {});

  const paddedLookup = ` ${lookup} `;
  const matchesByCanonical = new Map();

  function addCandidate(sportKey = "", canonical = "", candidateValue = "") {
    const candidateKey = normalizeAliasLookupKey(candidateValue);
    const candidateCompact = compactAliasLookupKey(candidateKey);
    const words = candidateKey.split(" ").filter(Boolean);

    if (!candidateKey || !candidateCompact) return;

    // A generic nickname must be substantial enough to avoid matching tiny
    // OCR fragments. Multi-word suffixes such as "Red Sox" and single-word
    // nicknames such as "Lakers", "Giants", and "Canucks" are supported.
    const safeNickname =
      (words.length === 1 && candidateCompact.length >= 5) ||
      (words.length >= 2 && candidateCompact.length >= 6);

    if (!safeNickname) return;

    const wholeWordMatch = paddedLookup.includes(` ${candidateKey} `);
    const compactEdgeMatch =
      compactLookup === candidateCompact ||
      compactLookup.startsWith(candidateCompact) ||
      compactLookup.endsWith(candidateCompact);

    if (!wholeWordMatch && !compactEdgeMatch) return;

    const canonicalKey = `${sportKey}::${normalizeAliasLookupKey(canonical)}`;
    const score =
      candidateCompact.length +
      words.length * 10 +
      (wholeWordMatch ? 35 : 0) +
      (compactLookup === candidateCompact ? 40 : 0);

    const existing = matchesByCanonical.get(canonicalKey);

    if (!existing || score > existing.score) {
      matchesByCanonical.set(canonicalKey, {
        sportKey,
        canonical,
        aliasKey: candidateKey,
        score,
        exact: compactLookup === candidateCompact,
        contained: wholeWordMatch || compactEdgeMatch,
        nicknameMatch: true,
      });
    }
  }

  for (const sportKey of keysToSearch) {
    const aliasMap = TEAM_ALIASES_BY_SPORT[sportKey] || {};
    const canonicalNames = Array.from(
      new Set(Object.values(aliasMap).filter(Boolean))
    );

    canonicalNames.forEach((canonical) => {
      const canonicalWords = normalizeAliasLookupKey(canonical)
        .split(" ")
        .filter(Boolean);

      if (!canonicalWords.length) return;

      // Try the final two words first for names like Red Sox, White Sox,
      // Blue Jays, Trail Blazers, and Maple Leafs.
      if (canonicalWords.length >= 2) {
        addCandidate(
          sportKey,
          canonical,
          canonicalWords.slice(-2).join(" ")
        );
      }

      addCandidate(
        sportKey,
        canonical,
        canonicalWords[canonicalWords.length - 1]
      );
    });

    // Also use single- or multi-word aliases already maintained in the shared
    // alias database. This makes the behavior apply to every team rather than
    // requiring one-off code for Lakers, Suns, Giants, and so on.
    Object.entries(aliasMap).forEach(([alias, canonical]) => {
      addCandidate(sportKey, canonical, alias);
    });
  }

  const matches = Array.from(matchesByCanonical.values());

  // When the league is blank, names such as Giants, Kings, Cardinals, and
  // Panthers may belong to multiple sports. Do not guess in those cases.
  if (matches.length !== 1) return null;

  return matches[0];
}

function findBestTeamAliasMatch(value = "", sportKeys = []) {
  const lookup = normalizeAliasLookupKey(value);
  const compactLookup = compactAliasLookupKey(value);

  if (!lookup && !compactLookup) return null;

  const keysToSearch = (sportKeys || []).length
    ? sportKeys.map((key) => String(key || "").toUpperCase()).filter(Boolean)
    : Object.keys(TEAM_ALIASES_BY_SPORT || {});

  const paddedLookup = ` ${lookup} `;
  let best = null;

  for (const sportKey of keysToSearch) {
    const aliasMap = TEAM_ALIASES_BY_SPORT[sportKey] || {};

    for (const [aliasKeyRaw, canonical] of Object.entries(aliasMap)) {
      if (!aliasKeyRaw || !canonical) continue;

      const aliasKey = normalizeAliasLookupKey(aliasKeyRaw);
      const canonicalKey = normalizeAliasLookupKey(canonical);
      const candidates = Array.from(new Set([aliasKey, canonicalKey].filter(Boolean)));

      for (const candidateKey of candidates) {
        const candidateCompact = compactAliasLookupKey(candidateKey);
        const exact = lookup === candidateKey || compactLookup === candidateCompact;
        const paddedCandidate = ` ${candidateKey} `;
        const contained =
          aliasCandidateIsSafeContainedMatch(candidateKey) &&
          (
            paddedLookup.includes(paddedCandidate) ||
            (candidateCompact && compactLookup.includes(candidateCompact))
          );
        const trailingOcrJunkMatch =
          paddedLookup.startsWith(paddedCandidate) &&
          aliasCandidateAllowsTrailingOcrJunk(candidateKey, canonical) &&
          isLikelyTrailingOcrJunkForTeamAlias(lookup.slice(candidateKey.length).trim());

        if (!exact && !contained && !trailingOcrJunkMatch) continue;

        const wordCount = candidateKey.split(" ").filter(Boolean).length;
        const score =
          candidateKey.length +
          wordCount * 10 +
          (exact ? 100 : 0) +
          (trailingOcrJunkMatch ? 75 : 0) +
          (candidateKey === canonicalKey ? 25 : 0);

        if (!best || score > best.score) {
          best = {
            sportKey,
            canonical,
            aliasKey: candidateKey,
            score,
            exact,
            contained,
          };
        }
      }
    }
  }

  // Generic fallback: match a unique team nickname anywhere in noisy text.
  // Examples: "_A Lakers", "x Canucks 3Q", "Francisco Giants", or
  // "ticket text Phoenix Suns boost". The league/sport filter keeps this safe.
  return best || findUniqueTeamNicknameMatch(value, keysToSearch);
}

function countTeamAliasMatchesForSport(values = [], sportKey = "") {
  const key = String(sportKey || "").toUpperCase();
  if (!key) return 0;

  const seenCanonicals = new Set();

  for (const value of values) {
    const localCanonical = getLocalParticipantAliasOverride(value, key);
    const match = findBestTeamAliasMatch(value, [key]);
    const canonical = localCanonical || match?.canonical || "";
    if (canonical) seenCanonicals.add(canonical);
  }

  return seenCanonicals.size;
}

function getLocalParticipantAliasOverride(value = "", sportKey = "") {
  const key = normalizeAliasLookupKey(value);
  const sport = String(sportKey || "").toUpperCase();

  const common = {
    "chi bulls": "Chicago Bulls",
    "chicago bull": "Chicago Bulls",
    "chicago bulls": "Chicago Bulls",
  };

  const bySport = {
    NBA: {
      ...common,
      "gs warriors": "Golden State Warriors",
      "g s warriors": "Golden State Warriors",
      "ny knicks": "New York Knicks",
      "nyk knicks": "New York Knicks",
      "la clippers": "Los Angeles Clippers",
      "angeles clippers": "Los Angeles Clippers",
      "la lakers": "Los Angeles Lakers",
      "l a lakers": "Los Angeles Lakers",
      lalakers: "Los Angeles Lakers",
      lakers: "Los Angeles Lakers",
      "los angeles lakers": "Los Angeles Lakers",
      "los angeles clippers": "Los Angeles Clippers",
      "los angeles c": "Los Angeles Clippers",
      "okc thunder": "Oklahoma City Thunder",
      "pho suns": "Phoenix Suns",
      "phx suns": "Phoenix Suns",
      "phoenix suns": "Phoenix Suns",
      "uta jazz": "Utah Jazz",
      "sac kings": "Sacramento Kings",
    },
    MLB: {
      "sf giants": "San Francisco Giants",
      "s f giants": "San Francisco Giants",
      "san fran giants": "San Francisco Giants",
      "san francisco giants": "San Francisco Giants",
      "francisco giants": "San Francisco Giants",
    },
  };

  const maps = sport
    ? [bySport[sport] || {}, sport === "NBA" ? common : {}]
    : [common, ...Object.values(bySport)];
  const exactMap = Object.assign({}, ...maps);

  if (exactMap[key]) return exactMap[key];

  const compactKey = compactAliasLookupKey(key);
  let best = null;

  Object.entries(exactMap).forEach(([alias, canonical]) => {
    const aliasKey = normalizeAliasLookupKey(alias);
    const aliasCompact = compactAliasLookupKey(aliasKey);
    const safeContained =
      aliasKey.split(" ").filter(Boolean).length >= 2 ||
      aliasCompact.length >= 6;

    if (!safeContained) return;

    const contained =
      ` ${key} `.includes(` ${aliasKey} `) ||
      (aliasCompact && compactKey.includes(aliasCompact));

    if (!contained) return;

    const score = aliasCompact.length;
    if (!best || score > best.score) {
      best = { canonical, score };
    }
  });

  return best?.canonical || "";
}

function isCollegeLeagueForAlias(league = "") {
  const text = String(league || "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");

  return /^(ncaa|ncaam|ncaaw|ncaab|ncaaf|cbb|cfb|college|college basketball|college football|mens college basketball|men college basketball|womens college basketball|women college basketball)$/.test(text);
}

function isSoccerLeagueForReview(league = "") {
  const text = String(league || "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");

  return /^(soccer|mls|epl|premier league|la liga|serie a|bundesliga|ligue 1|ucl|champions league|europa league|international soccer)$/.test(text);
}

function getAliasSportKey(league = "") {
  const value = String(league || "").trim().toLowerCase();

  if (value === "baseball" || value === "mlb") return "MLB";
  if (value === "nba") return "NBA";
  if (value === "wnba") return "WNBA";
  if (value === "nhl") return "NHL";
  if (value === "nfl") return "NFL";

  if (
    value === "soccer" ||
    value === "mls" ||
    value === "epl" ||
    value === "premier league" ||
    value === "la liga" ||
    value === "serie a" ||
    value === "bundesliga" ||
    value === "ligue 1"
  ) {
    return "";
  }

  return String(league || "").trim().toUpperCase();
}

function normalizeReviewLeagueKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function isIndividualParticipantLeagueForReview(league = "") {
  const text = normalizeReviewLeagueKey(league);

  // These leagues use people, not team aliases. Never search NBA/NHL/MLB/NFL
  // alias maps for participant names such as Carlos Alcaraz or Joao Fonseca.
  return /^(tennis|atp|wta|mma|ufc|boxing|golf|pga|lpga)$/.test(text);
}

function shouldProtectLeagueFromMajorInference(league = "") {
  if (!String(league || "").trim()) return false;

  return (
    isIndividualParticipantLeagueForReview(league) ||
    isSoccerLeagueForReview(league)
  );
}

function normalizeParticipantName(value = "", league = "") {
  const raw = cleanParticipantTextForMatching(value);
  if (!raw) return "";

  // Tennis/MMA/golf participants are people. Keep the visible name exactly as
  // reviewed instead of passing it through shared pro-team alias fallback.
  if (isIndividualParticipantLeagueForReview(league)) {
    return raw;
  }

  // NCAA / college team names are intentionally manual. Do not fall back to
  // WNBA/MLB/NBA/etc. aliases, because names like Connecticut, Houston,
  // Arizona, Purdue, and Tennessee are ambiguous across college/pro sports.
  if (isCollegeLeagueForAlias(league)) {
    return raw;
  }

  // Soccer may use the shared soccer alias maps, but must never fall through to
  // MLB/NBA/NHL/NFL aliases when a club is not recognized.
  if (isSoccerLeagueForReview(league)) {
    const soccerMatch = findBestTeamAliasMatch(raw, getSoccerAliasSportKeys());
    if (soccerMatch?.canonical) return soccerMatch.canonical;

    const knownCustomSoccerTeam = findKnownCustomTeamName(raw, league);
    return knownCustomSoccerTeam || raw;
  }

  const sportKey = getAliasSportKey(league);
  const majorSportKeys = ["NBA", "WNBA", "NHL", "MLB", "NFL"];

  if (majorSportKeys.includes(String(sportKey || "").toUpperCase())) {
    // Authoritative league aliases must beat stale learned custom-team values.
    // This repairs cases where an older bad save such as "Francisco Giants"
    // would otherwise overwrite a newly typed "San Francisco Giants".
    const localAlias = getLocalParticipantAliasOverride(raw, sportKey);
    if (localAlias) return localAlias;

    const sportSpecific = findBestTeamAliasMatch(raw, [sportKey]);
    if (sportSpecific?.canonical) return sportSpecific.canonical;

    const knownCustomMajorTeam = findKnownCustomTeamName(raw, league);
    return knownCustomMajorTeam || raw;
  }

  const knownCustomTeam = findKnownCustomTeamName(raw, league);
  if (knownCustomTeam) return knownCustomTeam;

  // Only an actually blank league may use safe cross-sport inference. An
  // explicit league such as Tennis, MMA, Golf, Soccer, or a custom league wins.
  if (!String(league || "").trim()) {
    const safeMajorAlias = normalizeSafeMajorSportAlias(raw);
    if (safeMajorAlias) return safeMajorAlias;
  }

  return raw;
}


function getMajorSportKeyFromLeague(value = "") {
  const text = String(value || "").trim().toLowerCase();

  if (text === "baseball" || text === "mlb") return "MLB";
  if (text === "nba") return "NBA";
  if (text === "nhl") return "NHL";
  if (text === "nfl") return "NFL";

  return "";
}

function getLeagueLabelFromMajorSportKey(value = "") {
  const sportKey = String(value || "").toUpperCase();

  if (sportKey === "MLB") return "Baseball";
  if (["NBA", "NHL", "NFL"].includes(sportKey)) return sportKey;

  return "";
}

function participantLooksLikeSport(value = "", sportKey = "") {
  const key = String(sportKey || "").toUpperCase();
  if (!key) return false;

  return !!findBestTeamAliasMatch(value, [key]);
}


function isSafeMajorSportAliasForCollegeOverride(value = "", sportKey = "") {
  const key = String(sportKey || "").toUpperCase();
  if (!key) return false;

  const match = findBestTeamAliasMatch(value, [key]);
  if (!match?.canonical) return false;

  const aliasWordCount = String(match.aliasKey || "").split(" ").filter(Boolean).length;
  const canonicalKey = normalizeAliasLookupKey(match.canonical);
  const lookup = normalizeAliasLookupKey(value);

  // Exact full/canonical team names and multi-word aliases are safe. Single city
  // aliases are not safe enough to override NCAA/manual rows.
  return match.aliasKey === canonicalKey || aliasWordCount >= 2 || lookup === canonicalKey;
}


function normalizeSafeMajorSportAlias(value = "") {
  const clean = cleanParticipantTextForMatching(value);
  if (!clean) return "";

  const match = findBestTeamAliasMatch(clean, ["NBA", "NHL", "MLB", "NFL", "WNBA"]);
  if (!match?.canonical) return "";

  if (!isSafeMajorSportAliasForCollegeOverride(clean, match.sportKey)) return "";

  return match.canonical;
}


function inferMajorSportKeyFromValues(values = [], options = {}) {
  const { requireSafeCollegeOverride = false } = options;
  const majorSportKeys = ["NBA", "NHL", "MLB", "NFL", "WNBA"];
  const scores = {};

  for (const value of values) {
    const clean = cleanParticipantTextForMatching(value);
    if (!clean) continue;

    for (const sportKey of majorSportKeys) {
      const localCanonical = getLocalParticipantAliasOverride(clean, sportKey);
      const match = findBestTeamAliasMatch(clean, [sportKey]);
      const matches = requireSafeCollegeOverride
        ? !!localCanonical || isSafeMajorSportAliasForCollegeOverride(clean, sportKey)
        : !!localCanonical || !!match;

      if (matches) {
        // Multi-word / contained aliases get more weight than single exact city
        // aliases, which keeps inference conservative but still catches noisy
        // strings like "? CHA Hornets" and "& SACKings".
        const words = String(match?.aliasKey || localCanonical || "").split(" ").filter(Boolean).length;
        const weight = Math.max(1, words) + (match?.contained ? 1 : 0) + (localCanonical ? 2 : 0);
        scores[sportKey] = (scores[sportKey] || 0) + weight;
      }
    }
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (!sorted.length) return "";

  // If two sports tie, do not guess.
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return "";

  return sorted[0][0];
}


function inferLeagueFromReviewRow(row = {}, options = {}) {
  const currentLeague = getPreviewLeagueValue(row);

  // Never reinterpret an explicit Tennis/MMA/Golf/Soccer row as a major US
  // team sport because a stale fixture or alias happens to match MLB/NBA/etc.
  if (shouldProtectLeagueFromMajorInference(currentLeague)) {
    return "";
  }

  const values = [
    popupParticipantARef.current?.value,
    popupParticipantBRef.current?.value,
    row.participantA,
    row.participantB,
    row.participantANormalized,
    row.participantBNormalized,
    row.fixtureEvent,
    row.selection,
    row.marketDetail,
    row.sourceText,
  ].filter(Boolean);

  const sportKey = inferMajorSportKeyFromValues(values, options);

  return getLeagueLabelFromMajorSportKey(sportKey);
}

function setLeagueForReviewRow(rowId, league = "") {
  if (!rowId || !league) return;

  const nextLeague = String(league || "").trim();
  const currentRow =
    allReviewRows.find((candidate) => candidate.id === rowId) ||
    rows.find((candidate) => candidate.id === rowId) ||
    {};

  if (popupLeagueRef.current) {
    popupLeagueRef.current.value = nextLeague;
  }

  const participantA = popupParticipantARef.current?.value || currentRow.participantA || currentRow.participantANormalized || "";
  const participantB = popupParticipantBRef.current?.value || currentRow.participantB || currentRow.participantBNormalized || "";
  const market = normalizeMainLineMarket(
    popupPropMarketRef.current?.value ||
      popupMarketContextRef.current?.value ||
      currentRow.reviewMarketType ||
      currentRow.betType ||
      currentRow.marketDetail ||
      ""
  );
  const side = popupMainLineSideRef.current?.value || currentRow.mainLineSide || currentRow.selection || "";
  const normalizedA = participantA ? normalizeParticipantName(participantA, nextLeague) : "";
  const normalizedB = participantB ? normalizeParticipantName(participantB, nextLeague) : "";
  const workingRow = {
    ...currentRow,
    sportLeague: nextLeague,
    participantA,
    participantB,
    participantANormalized: normalizedA,
    participantBNormalized: normalizedB,
  };

  const updates = {
    sportLeagueManual: "Y",
    sportLeague: nextLeague,
    leagueMismatchOverrideKey: "",
  };

  if (participantA) updates.participantANormalized = normalizedA;
  if (participantB) updates.participantBNormalized = normalizedB;

  if (market && side && market !== "total") {
    const normalizedSide = normalizeMainLineSideValue(side, workingRow, market);
    if (normalizedSide) {
      updates.mainLineSide = normalizedSide;

      if (market === "moneyline") {
        updates.selection = normalizedSide;
        if (popupMainLineSideRef.current) popupMainLineSideRef.current.value = normalizedSide;
        if (popupSelectionRef.current) popupSelectionRef.current.value = normalizedSide;
      }
    }
  }

  const rowKind = String(currentRow.reviewBetKind || "").trim();
  const isParlayRow =
    rowKind === "parlay" ||
    /\bparlay\b/i.test(
      [currentRow.betType, currentRow.canonicalMarketContext, currentRow.reviewMarketType]
        .filter(Boolean)
        .join(" ")
    );
  const isPromoSpecialRow =
    rowKind === "promo_special" ||
    /\bpromo[\s_-]*special\b/i.test(
      [currentRow.canonicalMarketContext, currentRow.reviewMarketType]
        .filter(Boolean)
        .join(" ")
    );

  if (isParlayRow) {
    const summaryLabel = getParlaySummaryLabel(workingRow);
    updates.selection = summaryLabel;
    updates.fixtureEvent = summaryLabel;
    if (popupSelectionRef.current) popupSelectionRef.current.value = summaryLabel;
    if (popupFixtureRef.current) popupFixtureRef.current.value = summaryLabel;
  } else if (isPromoSpecialRow) {
    const promoEvent = getPromoSpecialEventLabel(workingRow);
    updates.fixtureEvent = promoEvent;
    if (popupFixtureRef.current) popupFixtureRef.current.value = promoEvent;
  }

  applyRowFieldUpdates(rowId, updates);
}

function hasStrongMajorLeagueOverrideEvidence(row = {}, inferredSportKey = "") {
  const values = [
    popupParticipantARef.current?.value,
    popupParticipantBRef.current?.value,
    row.participantA,
    row.participantB,
    row.participantANormalized,
    row.participantBNormalized,
    row.fixtureEvent,
  ].filter(Boolean);

  return countTeamAliasMatchesForSport(values, inferredSportKey) >= 2;
}

function getLeagueMismatchDecisionKey(currentLeague = "", inferredLeague = "") {
  const currentKey = getMajorSportKeyFromLeague(currentLeague) || String(currentLeague || "").trim().toLowerCase();
  const inferredKey = getMajorSportKeyFromLeague(inferredLeague) || String(inferredLeague || "").trim().toLowerCase();

  if (!currentKey || !inferredKey) return "";
  return `${currentKey}=>${inferredKey}`;
}

function getCanonicalLeagueLabelForReview(value = "") {
  const majorKey = getMajorSportKeyFromLeague(value);
  return getLeagueLabelFromMajorSportKey(majorKey) || String(value || "").trim();
}

function keepCurrentLeagueAgainstInference(row = {}, currentLeague = "", inferredLeague = "") {
  if (!row?.id || !currentLeague) return currentLeague || "";

  const confirmedCurrentLeague = getCanonicalLeagueLabelForReview(currentLeague);
  const decisionKey = getLeagueMismatchDecisionKey(confirmedCurrentLeague, inferredLeague);

  // First apply the current/manual league normally so participant aliases rerun
  // against the user's chosen league. setLeagueForReviewRow clears stale mismatch
  // decisions, so we then write the current dismissal key after it.
  setLeagueForReviewRow(row.id, confirmedCurrentLeague);

  if (decisionKey) {
    applyRowFieldUpdates(row.id, {
      sportLeagueManual: "Y",
      sportLeague: confirmedCurrentLeague,
      leagueMismatchOverrideKey: decisionKey,
    });
  }

  if (popupLeagueRef.current) popupLeagueRef.current.value = confirmedCurrentLeague;

  return confirmedCurrentLeague;
}

function maybeApplyInferredLeague(row = {}, { promptOnMismatch = true } = {}) {
  if (!row?.id) return "";

  const currentLeague = getPreviewLeagueValue(row);

  // Preserve explicit individual/soccer leagues. This also prevents an already
  // corrupted fixture label from feeding MLB evidence back into the next pass.
  if (shouldProtectLeagueFromMajorInference(currentLeague)) {
    return currentLeague;
  }

  const isCollegeLeague = isCollegeLeagueForAlias(currentLeague);

  // If the row is already marked NCAA/college, only override when there are
  // safe pro-team aliases such as BOS Celtics / OKC Thunder. This avoids
  // changing University of Houston to Houston Rockets.
  const inferredLeague = inferLeagueFromReviewRow(row, {
    requireSafeCollegeOverride: isCollegeLeague,
  });

  if (!inferredLeague) return currentLeague || "";

  if (!currentLeague) {
    setLeagueForReviewRow(row.id, inferredLeague);
    return inferredLeague;
  }

  const currentKey = getMajorSportKeyFromLeague(currentLeague);
  const inferredKey = getMajorSportKeyFromLeague(inferredLeague);
  const mismatchDecisionKey = getLeagueMismatchDecisionKey(currentLeague, inferredLeague);
  const priorDeniedThisChange =
    !!mismatchDecisionKey && row.leagueMismatchOverrideKey === mismatchDecisionKey;

  if (priorDeniedThisChange) {
    return getCanonicalLeagueLabelForReview(currentLeague);
  }

  const currentComparable = currentKey || String(currentLeague || "").trim().toLowerCase();
  const inferredComparable = inferredKey || String(inferredLeague || "").trim().toLowerCase();
  const leaguesDiffer =
    !!currentComparable &&
    !!inferredComparable &&
    currentComparable !== inferredComparable;

  if (!leaguesDiffer) {
    return currentLeague;
  }

  const currentWasManuallyChosen = row.sportLeagueManual === "Y";
  const canAutoCorrectStrongWrongLeague =
    !currentWasManuallyChosen &&
    !!inferredKey &&
    hasStrongMajorLeagueOverrideEvidence(row, inferredKey);

  // Do not show a blocking browser confirm here. It can trap the review flow,
  // especially when the user has manually typed/selected the league. If the
  // parser likely guessed wrong and team evidence is very strong, auto-correct.
  // Otherwise trust the current/manual league and remember that choice for this row.
  if (canAutoCorrectStrongWrongLeague) {
    setLeagueForReviewRow(row.id, inferredLeague);
    return inferredLeague;
  }

  return keepCurrentLeagueAgainstInference(row, currentLeague, inferredLeague);
}

function getParticipantOptionsForLeague(league = "") {
  if (isCollegeLeagueForAlias(league)) return [];

  const sportKey = getAliasSportKey(league);
  const mapsToUse = [];

  if (sportKey && TEAM_ALIASES_BY_SPORT[sportKey]) {
    mapsToUse.push(TEAM_ALIASES_BY_SPORT[sportKey]);
  }

  // Soccer is spread across several sport keys in the EV alias database.
  if (!sportKey || /^soccer$/i.test(String(league || ""))) {
    [
      "MLS",
      "EPL",
      "LALIGA",
      "SERIEA",
      "BUNDESLIGA",
      "LIGUE1",
      "INTL",
    ].forEach((key) => {
      if (TEAM_ALIASES_BY_SPORT[key]) mapsToUse.push(TEAM_ALIASES_BY_SPORT[key]);
    });
  }

  const values = new Set();

  for (const map of mapsToUse) {
    Object.entries(map || {}).forEach(([alias, canonical]) => {
      if (canonical) values.add(canonical);
      if (alias && alias.length <= 24) values.add(alias);
    });
  }

  return Array.from(values).sort((a, b) =>
    String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
}

function getPreviewLeagueValue(row = {}) {
  const rowId = String(row?.id || "");
  const current = popupLeagueRef.current;
  const refRowId = String(current?.dataset?.rowId || "");

  // While this row is open, the review input is authoritative even when blank.
  // A blank box tells Normalize to infer the league from the current bet text.
  if (current && rowId && refRowId === rowId) {
    return String(current.value || "").trim();
  }

  return String(row?.sportLeague || "").trim();
}

function getParticipantANormalized(row) {
  return normalizeParticipantName(
    popupParticipantARef.current?.value || row?.participantA || "",
    getPreviewLeagueValue(row)
  );
}

function getParticipantBNormalized(row) {
  return normalizeParticipantName(
    popupParticipantBRef.current?.value || row?.participantB || "",
    getPreviewLeagueValue(row)
  );
}

function normalizeSideCompareKey(value = "") {
  return cleanParticipantTextForMatching(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bst\.?\b/g, "saint")
    .replace(/\bst\.\s*/g, "saint ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSideCompareVariants(value = "") {
  const base = normalizeSideCompareKey(value);
  const variants = new Set();

  if (base) variants.add(base);

  const stripCommonSchoolWords = (text = "") =>
    String(text || "")
      .replace(/^university of\s+/i, "")
      .replace(/^college of\s+/i, "")
      .replace(/\s+state university$/i, " state")
      .replace(/\s+university$/i, "")
      .replace(/\s+college$/i, "")
      .replace(/\s+/g, " ")
      .trim();

  if (base) variants.add(stripCommonSchoolWords(base));

  if (/^[a-z]\s+/.test(base)) {
    const withoutSingleLetter = base.replace(/^[a-z]\s+/, "").trim();
    if (withoutSingleLetter) {
      variants.add(withoutSingleLetter);
      variants.add(stripCommonSchoolWords(withoutSingleLetter));
    }
  }

  return Array.from(variants).filter((item) => item && item.length >= 2);
}

function getMainLineParticipantChoices(row = {}) {
  const league = getPreviewLeagueValue(row);
  const rawA = popupParticipantARef.current?.value || row?.participantA || row?.participantANormalized || "";
  const rawB = popupParticipantBRef.current?.value || row?.participantB || row?.participantBNormalized || "";
  const choices = [];

  function addChoice(source, rawValue = "") {
    const cleaned = cleanParticipantTextForMatching(rawValue);
    if (!cleaned) return;

    const normalized = normalizeParticipantName(cleaned, league) || cleaned;
    const display = normalized || cleaned;

    if (!display) return;
    if (choices.some((choice) => normalizeSideCompareKey(choice.display) === normalizeSideCompareKey(display))) return;

    choices.push({
      source,
      display,
      raw: cleaned,
      variants: Array.from(new Set([
        ...getSideCompareVariants(cleaned),
        ...getSideCompareVariants(normalized),
        ...getSideCompareVariants(display),
      ])).filter(Boolean),
    });
  }

  addChoice("Participant A", rawA);
  addChoice("Participant B", rawB);
  return choices;
}

function findParticipantMatchForSide(value = "", row = {}) {
  const raw = cleanParticipantTextForMatching(value);
  if (!raw) return null;

  const league = getPreviewLeagueValue(row);
  const normalizedSide = normalizeParticipantName(raw, league) || raw;
  const sideVariants = Array.from(new Set([
    ...getSideCompareVariants(raw),
    ...getSideCompareVariants(normalizedSide),
  ])).filter(Boolean);

  if (!sideVariants.length) return null;

  const choices = getMainLineParticipantChoices(row);
  const matches = [];

  for (const choice of choices) {
    const choiceVariants = choice.variants || [];
    let score = 0;

    for (const sideKey of sideVariants) {
      for (const choiceKey of choiceVariants) {
        if (!sideKey || !choiceKey) continue;

        if (sideKey === choiceKey) {
          score = Math.max(score, 1000 + choiceKey.length);
          continue;
        }

        if (choiceKey.length >= 4 && sideKey.includes(choiceKey)) {
          score = Math.max(score, 500 + choiceKey.length);
        }

        if (sideKey.length >= 4 && choiceKey.includes(sideKey)) {
          score = Math.max(score, 400 + sideKey.length);
        }
      }
    }

    if (score > 0) matches.push({ ...choice, score });
  }

  matches.sort((a, b) => b.score - a.score || b.display.length - a.display.length);
  if (!matches.length) return null;
  if (matches.length > 1 && matches[0].score === matches[1].score) return null;

  return matches[0];
}

function isDrawSideValue(value = "") {
  const key = normalizeSideCompareKey(value);
  return key === "draw" || key === "tie";
}

function normalizeMainLineSideValue(value = "", row = {}, market = "") {
  const raw = cleanParticipantTextForMatching(value);
  const cleanMarket = String(market || "").trim().toLowerCase();

  if (!raw) return "";

  if (cleanMarket === "total") {
    return normalizeSelectionSide(raw) || raw;
  }

  if (isDrawSideValue(raw)) return "Draw";

  const participantMatch = findParticipantMatchForSide(raw, row);
  if (participantMatch?.display) return participantMatch.display;

  return normalizeParticipantName(raw, getPreviewLeagueValue(row)) || raw;
}


function getStrictTeamValidationSportKey(league = "") {
  const key = getMajorSportKeyFromLeague(league);
  if (["NBA", "NHL", "MLB", "NFL"].includes(key)) return key;
  if (String(league || "").trim().toLowerCase() === "wnba") return "WNBA";
  return "";
}

function getSoccerAliasSportKeys() {
  return ["MLS", "EPL", "LALIGA", "SERIEA", "BUNDESLIGA", "LIGUE1", "INTL"];
}

function findOfficialTeamMatchForLeague(value = "", league = "") {
  const raw = cleanParticipantTextForMatching(value);
  if (!raw) return null;

  const strictSportKey = getStrictTeamValidationSportKey(league);
  if (strictSportKey) return findBestTeamAliasMatch(raw, [strictSportKey]);

  if (isSoccerLeagueForReview(league)) return findBestTeamAliasMatch(raw, getSoccerAliasSportKeys());

  const sportKey = getAliasSportKey(league);
  if (sportKey) return findBestTeamAliasMatch(raw, [sportKey]);

  return null;
}

function validateParticipantTeamNameForProceed(row = {}, field = "participantA") {
  const league = getPreviewLeagueValue(row);
  const rawValue =
    field === "participantB"
      ? popupParticipantBRef.current?.value || row.participantB || row.participantBNormalized || ""
      : popupParticipantARef.current?.value || row.participantA || row.participantANormalized || "";

  const raw = cleanParticipantTextForMatching(rawValue);
  if (!raw) return { ok: true, raw: "", normalized: "" };

  const strictSportKey = getStrictTeamValidationSportKey(league);
  const localAlias = getLocalParticipantAliasOverride(
    raw,
    strictSportKey || getAliasSportKey(league)
  );
  const officialMatch = findOfficialTeamMatchForLeague(raw, league);
  const customMatch = findKnownCustomTeamName(raw, league);

  // Local review aliases are part of the same normalization system used by
  // normalizeParticipantName. Accept them during strict team validation too,
  // so aliases such as PHO Suns do not normalize correctly and then get
  // rejected by Confirm + Next.
  if (localAlias) {
    return { ok: true, raw, normalized: localAlias, source: "local alias" };
  }

  if (officialMatch?.canonical) {
    return { ok: true, raw, normalized: officialMatch.canonical, source: "official" };
  }

  if (customMatch) {
    return { ok: true, raw, normalized: customMatch, source: "custom" };
  }

  if (strictSportKey) {
    return {
      ok: false,
      raw,
      normalized: "",
      strict: true,
      message: `${field === "participantB" ? "Participant B" : "Participant A"} does not look like a valid ${league} team.

Current value: ${raw}

Fix the team name before confirming.`,
    };
  }

  if (isSoccerLeagueForReview(league)) {
    return {
      ok: false,
      raw,
      normalized: "",
      canRegister: true,
      message: `${field === "participantB" ? "Participant B" : "Participant A"} was not recognized as a saved/known soccer team.

Current value: ${raw}

Save and register this team name for future normalization?`,
    };
  }

  // College/manual leagues intentionally allow manual team names.
  return { ok: true, raw, normalized: raw, source: "manual" };
}

function validateParticipantTeamsBeforeProceed(row = {}) {
  if (!row?.id) return true;

  const kind = getReviewBetKind(row);
  if (["parlay", "promo_special"].includes(kind)) return true;

  const league = getPreviewLeagueValue(row);
  if (!league) return true;

  const results = [
    ["participantA", validateParticipantTeamNameForProceed(row, "participantA")],
    ["participantB", validateParticipantTeamNameForProceed(row, "participantB")],
  ];

  const updates = {};

  for (const [field, result] of results) {
    if (result.ok) {
      if (result.normalized) {
        updates[field === "participantB" ? "participantBNormalized" : "participantANormalized"] = result.normalized;
      }
      continue;
    }

    if (result.canRegister) {
      const shouldRegister = window.confirm(result.message);
      if (!shouldRegister) {
        const ref = field === "participantB" ? popupParticipantBRef : popupParticipantARef;
        ref.current?.focus();
        ref.current?.select?.();
        setReviewActionNotice("Confirm blocked until the unrecognized team name is corrected or registered.");
        return false;
      }

      persistKnownTeamName(league, result.raw);
      updates[field === "participantB" ? "participantBNormalized" : "participantANormalized"] = result.raw;
      continue;
    }

    window.alert(result.message);
    const ref = field === "participantB" ? popupParticipantBRef : popupParticipantARef;
    ref.current?.focus();
    ref.current?.select?.();
    setReviewActionNotice("Confirm blocked because a team name is not valid for this league.");
    return false;
  }

  if (Object.keys(updates).length) {
    if (updates.participantANormalized && popupParticipantARef.current) {
      // Keep the visible input as entered; normalized label below the box updates from row state.
    }

    applyRowFieldUpdates(row.id, updates);
  }

  return true;
}

function validateMainLineSideForProceed(row = {}, market = "", sideValue = "") {
  const cleanMarket = String(market || "").trim().toLowerCase();
  const side = cleanParticipantTextForMatching(sideValue);

  if (!side) {
    return { ok: false, side: "", message: "Selected Side / Team is missing." };
  }

  if (cleanMarket === "total") {
    const sideLabel = normalizeSelectionSide(side);
    return sideLabel
      ? { ok: true, side: sideLabel, message: "" }
      : { ok: false, side, message: "For totals, choose Over or Under before continuing." };
  }

  if (isDrawSideValue(side)) return { ok: true, side: "Draw", message: "" };

  const choices = getMainLineParticipantChoices(row);
  if (!choices.length) {
    return { ok: true, side: normalizeMainLineSideValue(side, row, market), message: "" };
  }

  const match = findParticipantMatchForSide(side, row);
  if (match?.display) return { ok: true, side: match.display, message: "" };

  return {
    ok: false,
    side,
    message: `Selected Side / Team must match Participant A or Participant B before continuing.

Current side: ${side}
Participant A/B: ${choices.map((choice) => choice.display).join(" / ")}`,
  };
}

function validatePopupMainLineSideBeforeProceed(row = {}) {
  if (!row?.id) return true;
  if (getReviewBetKind(row) !== "main_line") return true;

  const market = normalizeMainLineMarket(
    popupPropMarketRef.current?.value ||
      popupMarketContextRef.current?.value ||
      row.reviewMarketType ||
      row.betType ||
      row.marketDetail ||
      ""
  );

  if (!market) return true;

  const sideValue = popupMainLineSideRef.current?.value || row.mainLineSide || row.selection || "";
  const validation = validateMainLineSideForProceed(row, market, sideValue);

  if (!validation.ok) {
    window.alert(validation.message);
    if (popupMainLineSideRef.current) {
      popupMainLineSideRef.current.focus();
      popupMainLineSideRef.current.select?.();
    }
    setReviewActionNotice("Selected Side / Team must match Participant A or Participant B before continuing.");
    return false;
  }

  if (validation.side) {
    if (popupMainLineSideRef.current) popupMainLineSideRef.current.value = validation.side;
    handleRowFieldChange(row.id, "mainLineSide", validation.side);

    const line = getVisibleMainLineLineForRow(row, market);
    const nextSelection =
      market === "moneyline"
        ? validation.side
        : market === "spread" && line
        ? `${validation.side} ${line}`.replace(/\s+/g, " ").trim()
        : market === "total" && line
        ? `${validation.side} ${line}`.replace(/\s+/g, " ").trim()
        : "";

    if (nextSelection) {
      if (popupSelectionRef.current) popupSelectionRef.current.value = nextSelection;
      handleRowFieldChange(row.id, "selection", nextSelection);
    }
  }

  return true;
}

function buildFixtureFromPopupParticipants(row) {
  const a = getParticipantANormalized(row);
  const b = getParticipantBNormalized(row);

  if (a && b) return `${a} @ ${b}`;
  return "";
}


function parseDateInput(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;

  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);

  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getFullYear() !== year
  ) {
    return null;
  }

  return date;
}

function formatDateInput(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = String(date.getFullYear());

  return `${mm}/${dd}/${yyyy}`;
}

function getPreviousRowDate(rowId) {
  const orderedRows = sortedRows || rows;
  const index = orderedRows.findIndex((row) => row.id === rowId);
  if (index <= 0) return "";

  for (let i = index - 1; i >= 0; i -= 1) {
    if (orderedRows[i]?.betDate) return orderedRows[i].betDate;
  }

  return "";
}

function setBetDateForRow(rowId, value) {
  if (!rowId) return;

  const parts = getDateParts(value || "");

  setReviewDateParts({
    rowId,
    month: parts.month || "",
    day: parts.day || "",
    year: parts.year || "",
  });

  handleRowFieldChange(rowId, "betDate", value);
  handleRowFieldChange(rowId, "betDateNeedsConfirm", "Y");
  handleRowFieldChange(rowId, "betDateConfirmed", "N");

  // Event date usually equals bet date for review/export unless a parser supplied a separate event date.
  const row = rows.find((r) => r.id === rowId);

  if (row && !row.eventDate) {
    handleRowFieldChange(rowId, "eventDate", value);
  }
}

function shiftBetDateForRow(rowId, deltaDays) {
  const row = rows.find((r) => r.id === rowId);
  if (!row) return;

  const baseDateText = row.betDate || getPreviousRowDate(rowId);
  const baseDate = parseDateInput(baseDateText);

  if (!baseDate) return;

  baseDate.setDate(baseDate.getDate() + deltaDays);

  setBetDateForRow(rowId, formatDateInput(baseDate));
}

function usePreviousBetDateForRow(rowId) {
  const previousDate = getPreviousRowDate(rowId);
  if (!previousDate) return;

  setBetDateForRow(rowId, previousDate);
}

  function getNumericMoney(value) {
    const n = Number(String(value || "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }

function getParsedResultLabel(row) {
  if (!row) return "UNKNOWN";

  if (row.win === "Y") return "WIN";
  if (row.win === "N") return "LOSS";

  const status = String(row.status || "").trim().toLowerCase();

  if (status === "won") return "WIN";
  if (status === "lost") return "LOSS";
  if (status === "voided" || status === "void" || status === "push") return "VOID";
  if (status === "cashed out") return "CASHED OUT";
  if (status === "open") return "OPEN";

  return "UNKNOWN";
}

function getParsedResultStyle(row) {
  const label = getParsedResultLabel(row);

  if (label === "WIN") {
    return {
      background: "#dcfce7",
      border: "3px solid #166534",
      color: "#14532d",
    };
  }

  if (label === "LOSS") {
    return {
      background: "#fee2e2",
      border: "3px solid #991b1b",
      color: "#7f1d1d",
    };
  }

  if (label === "VOID" || label === "PUSH") {
    return {
      background: "#f3f4f6",
      border: "3px solid #4b5563",
      color: "#111827",
    };
  }

  if (label === "CASHED OUT") {
    return {
      background: "#dbeafe",
      border: "3px solid #1d4ed8",
      color: "#1e3a8a",
    };
  }

  return {
    background: "#fef3c7",
    border: "3px solid #b45309",
    color: "#78350f",
  };
}

function getParsedResultPillStyle(row) {
  const parsedStyle = getParsedResultStyle(row);

  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 4,
    marginBottom: 6,
    padding: "5px 8px",
    borderRadius: 8,
    background: parsedStyle.background,
    border: String(parsedStyle.border || "1px solid #d1d5db").replace(/^3px/, "1px"),
    color: parsedStyle.color,
    fontSize: 13,
    fontWeight: 950,
    lineHeight: 1.15,
  };
}



function getReviewReasonItems(row = {}) {
  if (!row) return [];

  const status = String(row.status || "").toLowerCase();
  const reasons = [];

  if (!row.betDate || row.betDateNeedsConfirm === "Y") reasons.push("Date needs confirm");
  if (!row.sportLeague) reasons.push("League missing");
  if (!row.fixtureEvent && !row.participantANormalized && !row.participantBNormalized) reasons.push("Event/context missing");
  if (!row.stake) reasons.push("Stake missing");
  if (!row.oddsUS) reasons.push("Odds missing");
  if (!row.payout && !row.toWin) reasons.push("Payout/return missing");
  if (!row.win && !["open", "cashed out", "voided", "void", "push"].includes(status)) reasons.push("Result missing");
  if (row.likelyParserIssue === "Y" || row.parseWarning) reasons.push("Parser warning");
  if (row.reviewLater === "Y") reasons.push("Review later");
  if (row.largeStakeHedgeReview === "Y") reasons.push("Large stake hedge check");
  if (rowHasUnresolvedHedgeDecision(row)) reasons.push("Hedge decision needed");

  return Array.from(new Set(reasons));
}

function getHedgeReasonItems(row = {}) {
  if (!row) return [];

  const reasons = [];
  const quality = String(row.hedgeQuality || "").toLowerCase();
  const betType = String(row.betType || "").toLowerCase();
  const stakeAmount = Number(String(row.stake || "").replace(/[^0-9.-]/g, ""));

  if (String(row.hedgeOverride || "").toUpperCase() === "Y") reasons.push("Confirmed hedge");
  if (row.largeStakeHedgeReview === "Y" || (Number.isFinite(stakeAmount) && stakeAmount > 200)) reasons.push("Large stake hedge check");
  if (rowHasUnresolvedHedgeDecision(row)) reasons.push("Hedge decision needed");
  if (row.guaranteedProfit === "Y") reasons.push("Guaranteed profit");
  if (quality.includes("payout match")) reasons.push("Payout match");
  if (quality.includes("middle")) reasons.push("Middle check");
  if (!row.sportLeague) reasons.push("League missing");
  if (!row.stake) reasons.push("Stake missing");
  if (!row.oddsUS) reasons.push("Odds missing");
  if (!row.payout && !row.toWin) reasons.push("Payout/return missing");
  if (!row.fixtureEvent && !row.participantANormalized && !row.participantBNormalized) reasons.push("Event/context weak");
  if (betType.includes("player prop") && (!row.playerLastName || !row.propMarket)) reasons.push("Player prop context weak");

  return Array.from(new Set(reasons));
}

function formatReasonLine(items = [], fallback = "No review reason") {
  if (!items.length) return fallback;
  return items.slice(0, 5).join(" · ") + (items.length > 5 ? " · …" : "");
}

function hasMissingHedgeMoney(row = {}) {
  return !row?.stake || !row?.oddsUS || (!row?.payout && !row?.toWin);
}

function savePopupAndStay(row = {}) {
  if (!row?.id) return;

  runRowUpdateBatch(row.id, () => {
    commitPopupReviewEdits(row.id);
    saveLastReviewedContext(row);
  });

  setReviewActionNotice("Saved edits. Staying on this row.");
}

function nextNoChangeFromPopup(row = {}) {
  if (!row?.id) return;

  const currentRowId = row.id;
  let shouldAdvance = false;

  runRowUpdateBatch(currentRowId, () => {
    if (!canProceedFromPopup(row)) return;
    commitPopupReviewEdits(currentRowId);
    shouldAdvance = true;
  });

  if (shouldAdvance) {
    jumpToNextReviewRow(currentRowId);
  }
}

function laterAndNextFromPopup(row = {}) {
  if (!row?.id) return;

  const currentRowId = row.id;

  // Later + Next is an escape hatch. It should always save what is visible and
  // move on, even when team/date/selection validation is currently failing.
  runRowUpdateBatch(currentRowId, () => {
    commitPopupReviewEdits(currentRowId);
    handleRowFieldsChange(currentRowId, {
      reviewLater: "Y",
      reviewResolved: "N",
    });
  });

  setReviewActionNotice("Marked review later. Moving to the next visible row...");
  jumpToNextReviewRow(currentRowId);
}

function jumpToNextMatchingReviewRow(currentRowId, label, predicate) {
  if (!rows?.length) return;

  const currentIndex = rows.findIndex((row) => row.id === currentRowId);
  const candidates =
    currentIndex >= 0
      ? [...rows.slice(currentIndex + 1), ...rows.slice(0, currentIndex)]
      : rows;

  const nextRow = candidates.find(
    (row) => row?.id && row.id !== currentRowId && predicate(row)
  );

  if (!nextRow) {
    setReviewActionNotice(`No other visible ${label} rows.`);
    return;
  }

  setReviewHistory((prev) => [currentRowId, ...prev.filter((id) => id !== currentRowId)].slice(0, 25));
  movePopupToRow(nextRow);
  setReviewActionNotice(`Jumped to next ${label} row (${getVisibleRowPosition(nextRow.id)}).`);
}

function markPopupResult(rowId, resultValue) {
  if (!rowId) return;

  const row = rows.find((r) => r.id === rowId) || { id: rowId };

  runRowUpdateBatch(rowId, () => {
    commitPopupReviewEdits(rowId);
    rememberConfirmedPlayerProp(row);
    saveLastReviewedContext(row);

    const updates = {};

    if (resultValue === "Y") {
      updates.win = "Y";
      updates.status = "Won";
    }

    if (resultValue === "N") {
      updates.win = "N";
      updates.status = "Lost";
      updates.payout = "0.00";
      updates.toWin = "0.00";
    }

    if (resultValue === "V") {
      updates.win = "";
      updates.status = "Voided";
      updates.payout = "0.00";
      updates.toWin = "0.00";
    }

    if (resultValue === "C") {
      updates.win = "";
      updates.status = "Cashed Out";
    }

    applyRowFieldUpdates(rowId, updates);
  });

  setReviewActionNotice("Result saved. Staying on this row.");
}

function commitPopupReviewEdits(rowId) {
  if (!rowId) return;

  const row = rows.find((r) => r.id === rowId);
  const leagueValue = getPreviewLeagueValue(row || { id: rowId });

  if (popupSelectionRef.current) {
    handleRowFieldChange(rowId, "selection", popupSelectionRef.current.value);
  }

  if (popupFixtureRef.current) {
    handleRowFieldChange(rowId, "fixtureEvent", popupFixtureRef.current.value);
  }

  if (popupLeagueRef.current) {
    handleRowFieldChange(rowId, "sportLeagueManual", "Y");
    handleRowFieldChange(rowId, "sportLeague", popupLeagueRef.current.value);
  }

  if (popupBetTypeRef.current) {
    handleRowFieldChange(rowId, "betType", popupBetTypeRef.current.value);
  }

  if (popupParticipantARef.current) {
    const raw = popupParticipantARef.current.value;
    handleRowFieldChange(rowId, "participantA", raw);
    handleRowFieldChange(rowId, "participantANormalized", normalizeParticipantName(raw, leagueValue));
  }

  if (popupParticipantBRef.current) {
    const raw = popupParticipantBRef.current.value;
    handleRowFieldChange(rowId, "participantB", raw);
    handleRowFieldChange(rowId, "participantBNormalized", normalizeParticipantName(raw, leagueValue));
  }

  const visibleSubjectValue = getRefValueForRow(popupSubjectRef, rowId);

  if (visibleSubjectValue) {
    const rawSubject = visibleSubjectValue;
    const cleanedSubject = getPlayerSubjectForReviewLeague(
      row || { sportLeague: leagueValue },
      rawSubject
    );
    const lastName = popupPlayerLastNameRef.current?.value || getLastNameFromText(cleanedSubject);

    if (cleanedSubject) {
      const subjectUpdates = preserveManualPlayerSubjectAndMaybeSelection(row || { id: rowId }, cleanedSubject);
      const wasUserEdited =
        manuallyEditedPlayerSubjectRowIdsRef.current.has(rowId) ||
        row?.playerSubjectUserEdited === "Y";
      applyRowFieldUpdates(rowId, {
        ...subjectUpdates,
        canonicalSubject: cleanedSubject,
        canonicalPlayer: cleanedSubject,
        playerLastName: lastName,
        playerSubjectManual: "Y",
        ...(wasUserEdited ? { playerSubjectUserEdited: "Y" } : {}),
      });
    }

    if (
      cleanedSubject &&
      popupSubjectRef.current &&
      String(popupSubjectRef.current.dataset?.rowId || "") === String(rowId) &&
      popupSubjectRef.current.value !== cleanedSubject
    ) {
      popupSubjectRef.current.value = cleanedSubject;
    }
  }

  const activeReviewKind = getReviewBetKind(row || { id: rowId });

  if (activeReviewKind === "main_line") {
    const market =
      normalizeMainLineMarket(
        popupPropMarketRef.current?.value ||
          popupMarketContextRef.current?.value ||
          row?.reviewMarketType ||
          row?.betType ||
          row?.marketDetail ||
          ""
      ) || "";

    const side =
      popupMainLineSideRef.current?.value ||
      row?.mainLineSide ||
      "";
    const line =
      getVisibleMainLineLineForRow(row || { id: rowId }, market) ||
      "";

    const canonicalMainLineSelection = buildCanonicalMainLineSelection(
      row || { id: rowId, sportLeague: leagueValue },
      market,
      side,
      line
    );

    if (canonicalMainLineSelection) {
      handleRowFieldChange(rowId, "selection", canonicalMainLineSelection);
      if (popupSelectionRef.current) {
        popupSelectionRef.current.value = canonicalMainLineSelection;
      }
    }
  }

  if (popupPropMarketRef.current) {
    const rawMarketValue = popupPropMarketRef.current.value;

    if (activeReviewKind === "player_prop") {
      handleRowFieldChange(
        rowId,
        "propMarket",
        normalizePropMarketValue(rawMarketValue)
      );
    } else if (activeReviewKind === "other") {
      const gamePropMarket =
        getGamePropMarketLabel(rawMarketValue) ||
        cleanSelectionTextForReview(rawMarketValue).toLowerCase();

      handleRowFieldChange(rowId, "propMarket", "");

      if (gamePropMarket) {
        handleRowFieldChange(rowId, "canonicalMarketContext", gamePropMarket);
        handleRowFieldChange(rowId, "reviewMarketType", gamePropMarket);
      }
    }
  }

  if (popupMarketContextRef.current) {
    const rawMarketContext = popupMarketContextRef.current.value;
    const gamePropMarket =
      activeReviewKind === "other"
        ? getGamePropMarketLabel(
            [
              rawMarketContext,
              popupPropMarketRef.current?.value,
              row?.marketDetail,
              row?.selection,
              row?.sourceText,
            ].filter(Boolean).join(" ")
          )
        : "";
    const normalizedContext = gamePropMarket || normalizeMarketContext(rawMarketContext);
    const normalizedBetType = gamePropMarket
      ? "game prop"
      : normalizeBetTypeValue(rawMarketContext);

    handleRowFieldChange(rowId, "canonicalMarketContext", normalizedContext);

    if (normalizedBetType) {
      handleRowFieldChange(rowId, "betType", normalizedBetType);
    }
  }

  if (activeReviewKind === "other") {
    const activeGamePropMarket = getGamePropMarketLabel(
      [
        popupPropMarketRef.current?.value,
        popupMarketContextRef.current?.value,
        row?.reviewMarketType,
        row?.canonicalMarketContext,
        row?.marketDetail,
        row?.selection,
        row?.sourceText,
      ]
        .filter(Boolean)
        .join(" ")
    );

    if (activeGamePropMarket) {
      const activeGamePropSelection = buildGamePropSelection(
        activeGamePropMarket,
        popupSelectionRef.current?.value || row?.selection || "",
        popupSelectionRef.current?.value || row?.selection || ""
      );

      if (activeGamePropSelection) {
        handleRowFieldChange(rowId, "selection", activeGamePropSelection);
        if (popupSelectionRef.current) {
          popupSelectionRef.current.value = activeGamePropSelection;
        }
      }
    }
  }

  if (activeReviewKind === "player_prop") {
    const activeSubjectRaw =
      getRefValueForRow(popupSubjectRef, rowId) ||
      row?.canonicalSubject ||
      row?.canonicalPlayer ||
      "";
    const activeSubject = getPlayerSubjectForReviewLeague(
      row || { sportLeague: leagueValue },
      activeSubjectRaw
    );
    const activePropMarket = normalizePropMarketValue(
      popupPropMarketRef.current?.value || row?.propMarket || row?.marketDetail || ""
    );
    const currentSelection = cleanSelectionTextForReview(
      popupSelectionRef.current?.value || row?.selection || ""
    );
    const normalizedSelection = buildVisibleStructuredPlayerPropSelection(
      {
        ...(row || { id: rowId, sportLeague: leagueValue }),
        canonicalSubject: activeSubject || row?.canonicalSubject || "",
        canonicalPlayer: activeSubject || row?.canonicalPlayer || "",
        propMarket: activePropMarket,
      },
      currentSelection
    );

    if (activeSubject) {
      handleRowFieldsChange(rowId, {
        canonicalSubject: activeSubject,
        canonicalPlayer: activeSubject,
        playerLastName: getLastNameFromText(activeSubject),
        playerSubjectManual: "Y",
      });
      if (popupSubjectRef.current) popupSubjectRef.current.value = activeSubject;
    }

    if (normalizedSelection) {
      handleRowFieldChange(rowId, "selection", normalizedSelection);
      if (popupSelectionRef.current) popupSelectionRef.current.value = normalizedSelection;
    }
  }

  if (popupStakeRef.current) {
    handleRowFieldChange(rowId, "stake", popupStakeRef.current.value);
  }

  if (popupOddsRef.current) {
    handleRowFieldChange(rowId, "oddsUS", popupOddsRef.current.value);
  }

  if (popupPayoutRef.current) {
    handleRowFieldChange(rowId, "payout", popupPayoutRef.current.value);
  }

const nextDate = getPopupDateValue(row);

if (nextDate) {
  handleRowFieldChange(rowId, "betDate", nextDate);

  if (row && !row.eventDate) {
    handleRowFieldChange(rowId, "eventDate", nextDate);
  }
}

  // Commit any ordinary draft fields first. The exact visible structured
  // values below are intentionally queued last so no stale Final Selection,
  // OCR inference, or older player record can overwrite what is on screen.
  commitReviewDraft(rowId);

  const finalRow = {
    ...(row || { id: rowId }),
    id: rowId,
    sportLeague: leagueValue,
    canonicalSubject:
      getRefValueForRow(popupSubjectRef, rowId) ||
      row?.canonicalSubject ||
      "",
    canonicalPlayer:
      getRefValueForRow(popupSubjectRef, rowId) ||
      row?.canonicalPlayer ||
      "",
    propMarket:
      getRefValueForRow(popupPropMarketRef, rowId) ||
      row?.propMarket ||
      "",
    propSide:
      getRefValueForRow(popupPropSideRef, rowId) ||
      row?.propSide ||
      "",
    propLine:
      getRefValueForRow(popupPropLineRef, rowId) ||
      row?.propLine ||
      "",
  };

  const finalKind = getReviewBetKind(finalRow);
  const exactSelection = buildExactExportedSelection(finalRow);

  if (finalKind === "player_prop") {
    const exactSubject = getPlayerSubjectForReviewLeague(
      finalRow,
      finalRow.canonicalSubject || finalRow.canonicalPlayer || ""
    );
    const exactMarket = normalizePropMarketValue(
      finalRow.propMarket || ""
    );
    const exactSide = getStructuredPlayerPropSide(
      finalRow,
      exactMarket
    );
    const exactLine = getStructuredPlayerPropLine(
      finalRow,
      exactMarket,
      exactSide
    );

    handleRowFieldsChange(rowId, {
      reviewBetKind: "player_prop",
      betType: "player prop",
      canonicalMarketContext: "player prop",
      canonicalSubject: exactSubject,
      canonicalPlayer: exactSubject,
      playerLastName: getLastNameFromText(exactSubject),
      playerSubjectManual: exactSubject ? "Y" : "N",
      propMarket: exactMarket,
      propSide: exactSide,
      propLine: exactLine,
      selection: exactSelection,
    });
  } else if (exactSelection) {
    handleRowFieldChange(rowId, "selection", exactSelection);
  }
}


  function getCurrentMoneyValueForRow(row = {}, field = "") {
    if (!row?.id || !field) return "";

    if (previewRow?.id === row.id) {
      if (field === "stake" && popupStakeRef.current) return popupStakeRef.current.value;
      if (field === "oddsUS" && popupOddsRef.current) return popupOddsRef.current.value;
      if (field === "payout" && popupPayoutRef.current) return popupPayoutRef.current.value;
    }

    return row[field] || "";
  }

  function calculateOddsFromStakeAndPayout(row = {}, options = {}) {
    if (!row?.id) return false;

    const { showNotice = false } = options;
    const existingOdds = String(getCurrentMoneyValueForRow(row, "oddsUS") || "").trim();

    // Do not overwrite OCR-captured or manually-entered odds.
    if (existingOdds) return false;

    const stake = getNumericMoney(getCurrentMoneyValueForRow(row, "stake"));
    const payout = getNumericMoney(getCurrentMoneyValueForRow(row, "payout"));
    const toWin = getNumericMoney(row.toWin);

    let calculatedOdds = "";

    // Payout is treated as total return, not profit. Losses/voids with payout 0
    // cannot produce odds, so leave odds blank in those cases.
    if (Number.isFinite(stake) && stake > 0 && Number.isFinite(payout) && payout > stake) {
      calculatedOdds = americanOddsFromStakeAndReturn(stake, payout);
    } else if (Number.isFinite(stake) && stake > 0 && Number.isFinite(toWin) && toWin > 0) {
      calculatedOdds = americanOddsFromStakeAndProfit(stake, toWin);
    }

    if (!calculatedOdds) return false;

    if (popupOddsRef.current && previewRow?.id === row.id) {
      popupOddsRef.current.value = calculatedOdds;
    }

    applyRowFieldUpdates(row.id, {
      oddsUS: calculatedOdds,
      oddsSource: "Calculated from Stake/Payout",
      oddsMissingReason: "",
    });

    if (showNotice) {
      setReviewActionNotice(`Calculated odds ${calculatedOdds} from stake and payout.`);
    }

    return true;
  }

  function calculatePayoutFromStakeAndOdds(row = {}, options = {}) {
    if (!row?.id) return false;

    const { showNotice = false } = options;
    const stake = getNumericMoney(getCurrentMoneyValueForRow(row, "stake"));
    const oddsText = String(getCurrentMoneyValueForRow(row, "oddsUS") || "").trim();
    const odds = Number(oddsText.replace(/[^0-9+-]/g, ""));

    if (!Number.isFinite(stake) || stake <= 0 || !Number.isFinite(odds) || odds === 0) {
      if (showNotice) setReviewActionNotice("No payout calculated. Need stake and American odds.");
      return false;
    }

    const profit = odds > 0 ? (stake * odds) / 100 : (stake * 100) / Math.abs(odds);
    const payout = stake + profit;

    if (!Number.isFinite(profit) || !Number.isFinite(payout)) {
      if (showNotice) setReviewActionNotice("No payout calculated. Check stake and odds.");
      return false;
    }

    const nextPayout = payout.toFixed(2);
    const nextToWin = profit.toFixed(2);

    if (popupPayoutRef.current && previewRow?.id === row.id) {
      popupPayoutRef.current.value = nextPayout;
    }

    applyRowFieldUpdates(row.id, {
      payout: nextPayout,
      toWin: nextToWin,
      payoutSource: "Calculated from Stake/Odds",
    });

    if (showNotice) {
      setReviewActionNotice(`Calculated payout $${nextPayout} from stake and odds.`);
    }

    return true;
  }

  function autoFillCalculatedFields(row) {
    if (!row) return;

    const calculated = calculateOddsFromStakeAndPayout(row, { showNotice: true });

    if (!calculated) {
      setReviewActionNotice("No odds calculated. Need stake plus payout/return, and odds must be blank.");
    }

    // Intentionally do NOT calculate payout from odds. Boosted odds are often
    // missed by OCR, so payout should come from OCR/manual review or reattach.
  }



  useEffect(() => {
    if (!hoverPreview.locked || !previewRow?.id) return;

    const isTypingTarget = (target) => {
      const tag = String(target?.tagName || "").toLowerCase();
      return ["input", "textarea", "select"].includes(tag) || target?.isContentEditable;
    };

    const handler = (event) => {
      const row = previewRow;
      if (!row?.id) return;

      const typing = isTypingTarget(event.target);
      const key = String(event.key || "").toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        savePopupAndStay(row);
        return;
      }

      if (typing) {
        if (key === "m" && (event.ctrlKey || event.altKey || event.metaKey)) {
          event.preventDefault();
          const activeTarget = event.target;
          activeTarget?.blur?.();
          window.setTimeout(() => buildBetFieldsForCurrentRow(row), 0);
          setReviewActionNotice("Field closed. Building / normalizing this bet...");
          return;
        }

        if (key === "escape" || key === "f2") {
          event.preventDefault();
          event.target?.blur?.();
          setReviewActionNotice("Field closed. Keyboard shortcuts are active again.");
        }
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) return;

      if (key === "enter" && event.shiftKey) {
        event.preventDefault();
        nextNoChangeFromPopup(row);
        return;
      }

      if (key === "enter") {
        event.preventDefault();
        confirmAndAdvanceFromPopup(row);
        return;
      }

      const actions = {
        b: () => goBackToPreviousReviewRow(),
        l: () => laterAndNextFromPopup(row),
        w: () => markPopupResult(row.id, "Y"),
        x: () => markPopupResult(row.id, "N"),
        v: () => markPopupResult(row.id, "V"),
        c: () => markPopupResult(row.id, "C"),
        h: () => confirmHedgeCluster(row, false),
        n: () => ignoreCurrentHedgeMatch(row),
        m: () => buildBetFieldsForCurrentRow(row),
        r: () => onReattachSingleScreenshot?.(row.id),
        a: () => autoFillCalculatedFields(row),
        d: () => confirmPopupDate(row.id),
        z: () => {
          setPreviewZoomed((prev) => !prev);
          setPreviewZoomOrigin({ x: "50%", y: "0%" });
          if (imageScrollRef.current) imageScrollRef.current.scrollTop = 0;
        },
        escape: () => closeHoverPreview(),
      };

      if (!actions[key]) return;

      event.preventDefault();
      actions[key]();
    };

    // Use capture mode so Ctrl/Alt/Meta+M still reaches this handler when
    // the active input stops keyboard-event propagation in its own onKeyDown.
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [hoverPreview.locked, previewRow, rows, reviewHistory]);

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
          <input
            autoFocus
            list={`league-options-inline-${row.id}`}
            defaultValue={value}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();

              if (e.key === "Enter") {
                handleRowFieldChange(row.id, "sportLeagueManual", "Y");
                handleRowFieldChange(row.id, colKey, e.currentTarget.value);
                stopInlineEdit();
              }

              if (e.key === "Escape") stopInlineEdit();
            }}
            onBlur={(e) => {
              handleRowFieldChange(row.id, "sportLeagueManual", "Y");
              handleRowFieldChange(row.id, colKey, e.currentTarget.value);
              stopInlineEdit();
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

          <datalist id={`league-options-inline-${row.id}`}>
            {getLeagueOptionsForRow(row).map((league) => (
              <option key={league || "blank"} value={league} />
            ))}
          </datalist>
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
              openReviewPanelForRow(row);
            }}
            style={smallButtonStyle}
          >
            {row.id === selectedRowId ? "Reviewing" : "Review"}
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
                setPreviewZoomed(true);
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
        const confirmedTag = String(row.betSourceTag || "").trim().toLowerCase();

        badgeBg = "#166534";
        badgeColor = "#ecfdf5";
        badgeText = confirmedTag === "middle" ? "Confirmed Middle" : "Confirmed Hedge";
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

          {getIgnoredHedgeMatchItems(row).map((item) => (
            <button
              key={`ignored-hedge-${row.id}-${item.id}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                resetIgnoredHedgeMatches(row, item.partner || { id: item.id });
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                textAlign: "left",
                marginBottom: 8,
                marginRight: 6,
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid #fed7aa",
                background: "#fff7ed",
                color: "#9a3412",
                fontSize: 12,
                fontWeight: 900,
                cursor: "pointer",
              }}
              title={item.context || "Undo this pair-specific Not This Match decision."}
            >
              {item.label}
            </button>
          ))}

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
                openReviewPanelForRow(row);
              }}
              style={smallButtonStyle}
            >
              View Match
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                confirmHedgeCluster(row, false);
              }}
              style={smallButtonStyle}
            >
              Confirm Pair
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                ignoreCurrentHedgeMatch(row);
              }}
              style={smallButtonStyle}
              title="Ignore only this suggested pair. The bet can still match another hedge."
            >
              Not This Match
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
            {row.archived === "Y" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRowFieldChange(row.id, "archived", "N");
                }}
                style={{
                  ...smallButtonStyle,
                  border: "1px solid #166534",
                  background: "#dcfce7",
                  color: "#14532d",
                  fontWeight: 800,
                }}
                title="Restore this row to active rows"
              >
                Unarchive
              </button>
            )}

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

      {hedgeDetailPreview.visible && (
        (() => {
          const detailRow = allReviewRows.find((row) => row.id === hedgeDetailPreview.rowId) || null;

          if (!detailRow) return null;

          return (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 10050,
                background: "rgba(15,23,42,0.72)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 18,
              }}
              onClick={closeHedgeDetailPopup}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "min(1120px, 96vw)",
                  maxHeight: "94vh",
                  background: "#ffffff",
                  borderRadius: 14,
                  border: "1px solid #cbd5e1",
                  boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
                  display: "grid",
                  gridTemplateRows: "auto minmax(0, 1fr) auto",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: 12,
                    borderBottom: "1px solid #e5e7eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "grid", gap: 3 }}>
                    <strong>Possible Hedge Screenshot</strong>
                    <span style={{ fontSize: 13, color: "#475569" }}>
                      {getDisplayedBookmaker(detailRow) || detailRow.bookmaker || "Book"} · {detailRow.selection || "—"} · {detailRow.fixtureEvent || "—"}
                    </span>
                  </div>

                  <button type="button" onClick={closeHedgeDetailPopup} style={smallButtonStyle}>
                    Close
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "280px minmax(0, 1fr)",
                    gap: 12,
                    padding: 12,
                    minHeight: 0,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gap: 8,
                      alignContent: "start",
                      fontSize: 13,
                    }}
                  >
                    <div><strong>Book:</strong> {getDisplayedBookmaker(detailRow) || detailRow.bookmaker || "—"}</div>
                    <div><strong>Selection:</strong> {detailRow.selection || "—"}</div>
                    <div><strong>Event:</strong> {detailRow.fixtureEvent || "—"}</div>
                    <div><strong>League:</strong> {detailRow.sportLeague || "—"}</div>
                    <div><strong>Stake:</strong> {detailRow.stake ? `$${detailRow.stake}` : "—"}</div>
                    <div><strong>Odds:</strong> {detailRow.oddsUS || "—"}</div>
                    <div><strong>Payout:</strong> {detailRow.payout ? `$${detailRow.payout}` : "—"}</div>
                    <div><strong>Result:</strong> {getParsedResultLabel(detailRow)}</div>
                    <div><strong>Hedge Quality:</strong> {detailRow.hedgeQuality || "—"}</div>
                  </div>

                  <div
                    style={{
                      minHeight: 0,
                      maxHeight: "calc(94vh - 145px)",
                      overflow: "auto",
                      background: "#111827",
                      borderRadius: 10,
                      border: "1px solid #0f172a",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "center",
                    }}
                  >
                    {detailRow.sourceImageUrl ? (
                      <img
                        src={detailRow.sourceImageUrl}
                        alt={detailRow.sourceFileName || "possible hedge"}
                        style={{
                          width: "100%",
                          height: "auto",
                          display: "block",
                        }}
                      />
                    ) : (
                      <div style={{ color: "#fff", padding: 24 }}>No screenshot available.</div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    padding: 12,
                    borderTop: "1px solid #e5e7eb",
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (previewRow) {
                        confirmHedgePair(previewRow, detailRow);
                      }
                      closeHedgeDetailPopup();
                    }}
                    style={{
                      ...smallButtonStyle,
                      border: "1px solid #166534",
                      background: "#dcfce7",
                      color: "#14532d",
                      fontWeight: 900,
                    }}
                  >
                    Confirm Hedge Pair
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (previewRow) {
                        ignoreCurrentHedgeMatch(previewRow, detailRow.id !== previewRow.id ? detailRow : null);
                      } else {
                        ignoreCurrentHedgeMatch(detailRow);
                      }
                      closeHedgeDetailPopup();
                    }}
                    style={{
                      ...smallButtonStyle,
                      border: "1px solid #9a3412",
                      background: "#fff7ed",
                      color: "#9a3412",
                      fontWeight: 900,
                    }}
                  >
                    Not This Match
                  </button>

                  <button type="button" onClick={closeHedgeDetailPopup} style={smallButtonStyle}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {hoverPreview.visible && typeof document !== "undefined" && createPortal((
        <div
          onMouseDown={beginPreviewDrag}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            pointerEvents: hoverPreview.locked ? "auto" : "none",
            background: "#fff",
            border: "none",
            borderRadius: 0,
            boxShadow: "none",
            padding: 4,
            fontSize: 13,
            lineHeight: 1.2,
            color: "#0f172a",
            width: "100vw",
            maxWidth: "100vw",
            height: "100vh",
            maxHeight: "100vh",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
          }}
        >
          <style>{`
            .review-card {
              border: 1px solid #bfdbfe;
              border-radius: 12px;
              background: #eff6ff;
              box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
            }

            .review-action-bar {
              position: sticky;
              top: 0;
              z-index: 20;
              margin-bottom: 6px;
              padding: 7px 8px;
              border: 1px solid #bbf7d0;
              border-radius: 12px;
              background: #f0fdf4;
              box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
              flex-shrink: 0;
            }

            .review-money-card {
              min-width: 92px;
              padding: 5px 7px;
              border: 1px solid #d1fae5;
              border-radius: 10px;
              background: #ffffff;
            }

            .review-money-label {
              display: block;
              font-size: 10px;
              color: #64748b;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.04em;
            }

            .review-money-value {
              display: block;
              margin-top: 2px;
              font-size: 16px;
              line-height: 1.15;
              color: #0f172a;
              font-weight: 950;
            }

            .full-review-form-columns > div {
              order: 30;
              flex: 0 0 calc(50% - 6px);
              max-width: calc(50% - 6px);
              box-sizing: border-box;
            }

            .full-review-form-columns .review-build-market-section {
              order: -100;
              flex: 0 0 100%;
              max-width: 100%;
            }

            .review-build-market-section {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .review-build-market-section input {
              width: 100% !important;
              margin-left: 0 !important;
            }

            .review-build-market-section strong {
              display: block;
              margin-bottom: 4px;
            }

            .full-review-form-columns .review-primary-section {
              order: -50;
            }

            .full-review-form-columns .review-secondary-section {
              order: -40;
            }

            .full-review-form-columns .review-money-date-section {
              order: 5;
            }

            .full-review-form-columns .review-result-section {
              order: 6;
            }

            .full-review-form-columns .review-notes-section {
              order: 7;
            }

            .full-review-form-columns input,
            .full-review-form-columns textarea,
            .full-review-form-columns select {
              max-width: 100%;
              box-sizing: border-box;
            }

            .full-review-form-columns button {
              box-sizing: border-box;
            }



            .full-review-form-columns label,
            .full-review-form-columns strong,
            .review-build-market-section label,
            .review-build-market-section strong {
              color: #0f172a !important;
              font-size: 13px !important;
              font-weight: 900 !important;
            }

            .full-review-form-columns input,
            .full-review-form-columns textarea,
            .full-review-form-columns select,
            .review-build-market-section input,
            .review-build-market-section textarea,
            .review-build-market-section select {
              color: #111827 !important;
              background: #ffffff !important;
              opacity: 1 !important;
              font-size: 13px !important;
              line-height: 1.25 !important;
              padding: 5px 7px !important;
              min-height: 30px !important;
            }

            .full-review-form-columns input::placeholder,
            .full-review-form-columns textarea::placeholder,
            .review-build-market-section input::placeholder {
              color: #64748b !important;
              opacity: 1 !important;
            }

            .review-build-market-section,
            .review-build-market-section *:not(button),
            .full-review-form-columns,
            .full-review-form-columns *:not(button) {
              opacity: 1 !important;
              filter: none !important;
            }

            .review-build-market-section div,
            .review-build-market-section span,
            .full-review-form-columns div,
            .full-review-form-columns span {
              color: #0f172a !important;
            }

            .review-build-market-section input,
            .review-build-market-section select,
            .review-build-market-section textarea,
            .full-review-form-columns input,
            .full-review-form-columns select,
            .full-review-form-columns textarea {
              color: #111827 !important;
              -webkit-text-fill-color: #111827 !important;
              background-color: #ffffff !important;
            }

            .review-action-bar button,
            .full-review-form-columns button,
            .review-build-market-section button {
              font-size: 13px !important;
            }

            @media (max-width: 1250px) {
              .full-review-form-columns > div,
              .full-review-form-columns .review-build-market-section {
                flex-basis: 100%;
                max-width: 100%;
              }

              .review-build-market-section {
                grid-template-columns: 1fr !important;
              }
            }
          `}</style>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 3,
              gap: 10,
              cursor: "default",
              userSelect: "none",
              flexShrink: 0,
            }}
          >
            <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 13 }}>
              {hoverPreview.locked ? "Full-Page Review" : "Preview"}
            </div>

            {hoverPreview.locked && (
              <button onClick={closeHoverPreview} style={smallButtonStyle}>
                Close
              </button>
            )}
          </div>

          {hoverPreview.locked && previewRow && (
            <div className="review-action-bar">
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#166534", fontWeight: 900 }}>
                    Current row {getVisibleRowPosition(previewRow.id) || ""} · {getDisplayedBookmaker(previewRow) || previewRow.bookmaker || "Book"} · {previewRow.sportLeague || "League"}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 15,
                      fontWeight: 900,
                      color: "#0f172a",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={previewRow.selection || ""}
                  >
                    {previewRow.bonusBet === "Y" && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          marginRight: 8,
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "2px solid #f97316",
                          background: "#ffedd5",
                          color: "#9a3412",
                          fontSize: 13,
                          fontWeight: 950,
                          verticalAlign: "middle",
                        }}
                      >
                        BONUS
                      </span>
                    )}
                    {buildExactExportedSelection(previewRow) || "No selection"}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 15,
                      fontWeight: 900,
                      color: "#0f172a",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={previewRow.fixtureEvent || ""}
                  >
                    {previewRow.fixtureEvent || "No event"}
                  </div>
                </div>

                <div
                  style={{
                    padding: 8,
                    border: "1px solid #d1d5db",
                    borderRadius: 10,
                    background: "#ffffff",
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    alignItems: "center",
                    minWidth: 0,
                  }}
                >
                  <strong style={{ marginRight: 4, color: "#0f172a" }}>Review Pass:</strong>
                  {getFieldPill(getReviewPassStatusForPopup(previewRow), "info")}
                  {getFieldPill("Date", previewRow.betDateNeedsConfirm === "Y" || !previewRow.betDate ? "warn" : "good")}
                  {getFieldPill("Money", previewRow.stake && previewRow.oddsUS ? "good" : "bad")}
                  {getFieldPill("Result", previewRow.win || ["open", "voided", "void", "push", "cashed out"].includes(String(previewRow.status || "").toLowerCase()) ? "good" : "bad")}
                  {getFieldPill("Context", previewRow.sportLeague && (previewRow.fixtureEvent || previewRow.participantANormalized || previewRow.participantBNormalized) ? "good" : "warn")}
                  {String(previewRow.hedgeOverride || "").toUpperCase() === "Y"
                    ? getFieldPill("Confirmed Hedge", "good")
                    : getFieldPill("Hedge", rowHasUnresolvedHedgeDecision(previewRow) ? "warn" : "good")}

                  <div
                    style={{
                      flexBasis: "100%",
                      display: "grid",
                      gap: 3,
                      marginTop: 4,
                      paddingTop: 6,
                      borderTop: "1px solid #e5e7eb",
                      fontSize: 12,
                      color: "#334155",
                      fontWeight: 800,
                    }}
                  >
                    <div>
                      <strong>Review reason:</strong>{" "}
                      {formatReasonLine(getReviewReasonItems(previewRow), "No blocking review issue")}
                    </div>
                    {getHedgeReasonItems(previewRow).length > 0 && (
                      <div style={{ color: "#6d28d9" }}>
                        <strong>Hedge focus:</strong>{" "}
                        {formatReasonLine(getHedgeReasonItems(previewRow), "No hedge issue")}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <div className="review-money-card" style={{ minWidth: 150 }}>
                    <span className="review-money-label">Parsed League</span>
                    <span className="review-money-value">
                      {previewRow.sportLeague || "—"}
                    </span>
                    <span style={{ display: "block", marginTop: 3, fontSize: 10, color: "#64748b", fontWeight: 800 }}>
                      Review box below starts blank for auto-detect.
                    </span>
                  </div>

                  <div
                    className="review-money-card"
                    style={{
                      minWidth: 230,
                      border: rowNeedsDateConfirm(previewRow) ? "2px solid #b45309" : "1px solid #d1fae5",
                      background: rowNeedsDateConfirm(previewRow) ? "#fef3c7" : "#ffffff",
                    }}
                  >
                    <span className="review-money-label">Bet Date</span>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", marginTop: 3 }}>
                      <input
                        tabIndex={2}
                        ref={popupBetMonthRef}
                        value={getActiveReviewDateParts(previewRow).month}
                        placeholder="MM"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setReviewDateParts((prev) => ({
                            ...prev,
                            rowId: previewRow?.id || prev.rowId,
                            month: e.target.value,
                          }))
                        }
                        style={{ width: 34, padding: "4px 5px", border: "1px solid #cbd5e1", borderRadius: 5, fontSize: 13, fontWeight: 800 }}
                      />

                      <input
                        tabIndex={3}
                        ref={popupBetDayRef}
                        value={getActiveReviewDateParts(previewRow).day}
                        placeholder="DD"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setReviewDateParts((prev) => ({
                            ...prev,
                            rowId: previewRow?.id || prev.rowId,
                            day: e.target.value,
                          }))
                        }
                        style={{ width: 34, padding: "4px 5px", border: "1px solid #cbd5e1", borderRadius: 5, fontSize: 13, fontWeight: 800 }}
                      />

                      <input
                        tabIndex={4}
                        ref={popupBetYearRef}
                        value={getActiveReviewDateParts(previewRow).year}
                        placeholder="YYYY"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setReviewDateParts((prev) => ({
                            ...prev,
                            rowId: previewRow?.id || prev.rowId,
                            year: e.target.value,
                          }))
                        }
                        onBlur={() => {
                          if (!previewRow) return;

                          const parts = getActiveReviewDateParts(previewRow);
                          const dateFromParts = buildDateFromParts(
                            parts.month,
                            parts.day,
                            parts.year
                          );

                          if (dateFromParts) {
                            setBetDateForRow(previewRow.id, dateFromParts);
                          }
                        }}
                        style={{ width: 48, padding: "4px 5px", border: "1px solid #cbd5e1", borderRadius: 5, fontSize: 13, fontWeight: 800 }}
                      />

                      <button
                        tabIndex={5}
                        type="button"
                        onClick={() => previewRow && confirmPopupDate(previewRow.id)}
                        style={{
                          ...smallButtonStyle,
                          padding: "4px 7px",
                          minHeight: 26,
                          border: "1px solid #166534",
                          background: "#dcfce7",
                          color: "#14532d",
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                      >
                        Confirm
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: rowNeedsDateConfirm(previewRow) ? "#92400e" : "#64748b", fontWeight: 900 }}>
                        {getPopupDateValue(previewRow) || "No date"}
                      </span>
                      <button tabIndex={6} type="button" onClick={() => previewRow && usePreviousBetDateForRow(previewRow.id)} style={{ ...smallButtonStyle, padding: "2px 6px", minHeight: 22, fontSize: 11 }}>
                        Prev
                      </button>
                      <button tabIndex={7} type="button" onClick={() => previewRow && shiftBetDateForRow(previewRow.id, -1)} style={{ ...smallButtonStyle, padding: "2px 6px", minHeight: 22, fontSize: 11 }}>
                        -1
                      </button>
                      <button tabIndex={8} type="button" onClick={() => previewRow && shiftBetDateForRow(previewRow.id, 1)} style={{ ...smallButtonStyle, padding: "2px 6px", minHeight: 22, fontSize: 11 }}>
                        +1
                      </button>
                    </div>
                  </div>

                  <div className="review-money-card">
                    <span className="review-money-label">Stake</span>
                    <input
                      tabIndex={9}
                      ref={popupStakeRef}
                      value={previewRow.stake || ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleRowFieldChange(previewRow.id, "stake", e.target.value)}
                      style={{
                        width: 88,
                        border: previewRow.stake ? "1px solid #bbf7d0" : "2px solid #dc2626",
                        borderRadius: 6,
                        padding: "4px 6px",
                        fontSize: 16,
                        fontWeight: 950,
                        color: "#0f172a",
                      }}
                    />
                  </div>

                  <div className="review-money-card">
                    <span className="review-money-label">Odds</span>
                    <input
                      tabIndex={10}
                      ref={popupOddsRef}
                      value={previewRow.oddsUS || ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleRowFieldChange(previewRow.id, "oddsUS", e.target.value)}
                      style={{
                        width: 76,
                        border: previewRow.oddsUS ? "1px solid #bbf7d0" : "2px solid #dc2626",
                        borderRadius: 6,
                        padding: "4px 6px",
                        fontSize: 16,
                        fontWeight: 950,
                        color: "#0f172a",
                      }}
                    />
                  </div>

                  <div className="review-money-card" style={{ minWidth: 220 }}>
                    <span className="review-money-label">Parsed Result / Quick Fix</span>
                    <div style={getParsedResultPillStyle(previewRow)}>
                      <span>{getParsedResultLabel(previewRow)}</span>
                      {previewRow.status && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            opacity: 0.78,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {previewRow.status}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                      <button
                        tabIndex={12}
                        type="button"
                        onClick={() => markPopupResult(previewRow.id, "Y")}
                        style={{
                          ...smallButtonStyle,
                          padding: "4px 7px",
                          minHeight: 28,
                          border: "1px solid #166534",
                          background: "#dcfce7",
                          color: "#14532d",
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                        title="Mark this row as won, save edits, and move on if date is confirmed"
                      >
                        Win
                      </button>
                      <button
                        tabIndex={13}
                        type="button"
                        onClick={() => markPopupResult(previewRow.id, "N")}
                        style={{
                          ...smallButtonStyle,
                          padding: "4px 7px",
                          minHeight: 28,
                          border: "1px solid #991b1b",
                          background: "#fee2e2",
                          color: "#7f1d1d",
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                        title="Mark this row as lost, zero payout, save edits, and move on if date is confirmed"
                      >
                        Loss
                      </button>
                      <button
                        tabIndex={14}
                        type="button"
                        onClick={() => markPopupResult(previewRow.id, "V")}
                        style={{
                          ...smallButtonStyle,
                          padding: "4px 7px",
                          minHeight: 28,
                          border: "1px solid #4b5563",
                          background: "#f3f4f6",
                          color: "#111827",
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                        title="Mark this row as voided, zero payout, save edits, and move on if date is confirmed"
                      >
                        Void
                      </button>
                      <button
                        tabIndex={15}
                        type="button"
                        onClick={() => markPopupResult(previewRow.id, "C")}
                        style={{
                          ...smallButtonStyle,
                          padding: "4px 7px",
                          minHeight: 28,
                          border: "1px solid #1d4ed8",
                          background: "#dbeafe",
                          color: "#1e3a8a",
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                        title="Mark this row as cashed out, keep payout as entered, save edits, and move on if date is confirmed"
                      >
                        Cash Out
                      </button>
                    </div>
                  </div>

                  <div className="review-money-card">
                    <span className="review-money-label">Payout</span>
                    <input
                      tabIndex={11}
                      ref={popupPayoutRef}
                      value={previewRow.payout || ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleRowFieldChange(previewRow.id, "payout", e.target.value)}
                      style={{
                        width: 92,
                        border: previewRow.payout || previewRow.toWin ? "1px solid #bbf7d0" : "2px solid #dc2626",
                        borderRadius: 6,
                        padding: "4px 6px",
                        fontSize: 16,
                        fontWeight: 950,
                        color: "#0f172a",
                      }}
                    />
                  </div>

                  {previewRow.archived === "Y" && (
                    <button
                      type="button"
                      onClick={() => {
                        handleRowFieldChange(previewRow.id, "archived", "N");
                        setReviewActionNotice("Row unarchived. It will return to active views after filters refresh.");
                      }}
                      style={{
                        ...smallButtonStyle,
                        minHeight: 46,
                        padding: "10px 14px",
                        border: "1px solid #166534",
                        background: "#dcfce7",
                        color: "#14532d",
                        fontWeight: 950,
                        fontSize: 14,
                      }}
                      title="Restore this archived row to active rows"
                    >
                      Unarchive
                    </button>
                  )}

                  <button
                    tabIndex={16}
                    type="button"
                    onClick={goBackToPreviousReviewRow}
                    disabled={!reviewHistory.length}
                    style={{
                      ...smallButtonStyle,
                      minHeight: 46,
                      padding: "10px 14px",
                      border: "1px solid #64748b",
                      background: reviewHistory.length ? "#f8fafc" : "#e5e7eb",
                      color: "#334155",
                      fontWeight: 900,
                      fontSize: 14,
                      opacity: reviewHistory.length ? 1 : 0.6,
                    }}
                  >
                    ← Back{reviewHistory.length ? ` (${reviewHistory.length})` : ""}
                  </button>

                  <button
                    tabIndex={17}
                    type="button"
                    onClick={() => confirmAndAdvanceFromPopup(previewRow)}
                    style={{
                      ...smallButtonStyle,
                      minHeight: 46,
                      padding: "10px 16px",
                      border: "1px solid #166534",
                      background: "#16a34a",
                      color: "#ffffff",
                      fontWeight: 950,
                      fontSize: 15,
                    }}
                  >
                    Confirm + Next
                  </button>
                </div>
              </div>

              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: "1px solid #bbf7d0",
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 12, color: "#166534", fontWeight: 900, marginRight: 4 }}>
                  Shortcuts: Enter Confirm · M Normalize · Ctrl/Alt+M normalize from a field · Shift+Enter Next · Ctrl+S Save · W/X/V/C Result · H Hedge · N Not Match · R Reattach · Z Zoom · Esc/F2 exits field
                </span>

                <button
                  type="button"
                  onClick={() => savePopupAndStay(previewRow)}
                  style={smallButtonStyle}
                  title="Keyboard: Ctrl+S"
                >
                  Save / Stay
                </button>

                <button
                  type="button"
                  onClick={() => previewRow && buildBetFieldsForCurrentRow(previewRow)}
                  style={{
                    ...smallButtonStyle,
                    border: "1px solid #2563eb",
                    background: "#dbeafe",
                    color: "#1e3a8a",
                    fontWeight: 950,
                  }}
                  title="Keyboard: M. Fill parsed context, build event, set market/bet type, and build selection."
                >
                  Build / Normalize Bet
                </button>

                <button
                  type="button"
                  onClick={() => previewRow && onReattachSingleScreenshot?.(previewRow.id)}
                  style={{
                    ...smallButtonStyle,
                    border: "1px solid #2563eb",
                    background: hoverPreview.src ? "#f8fafc" : "#eff6ff",
                    color: "#1d4ed8",
                    fontWeight: 800,
                  }}
                  title={`Keyboard: R. Choose ${previewRow?.uploadBatchFolder || previewRow?.folder || previewRow?.parentFolder || "the original folder"}; app will reattach only this row's screenshot.`}
                >
                  Reattach Screenshot
                </button>

                <button
                  type="button"
                  onClick={() => previewRow && deleteCurrentRowScreenshot(previewRow)}
                  disabled={!hoverPreview.src && !previewRow?.sourceImageUrl}
                  style={{
                    ...smallButtonStyle,
                    border: "1px solid #dc2626",
                    background: hoverPreview.src || previewRow?.sourceImageUrl ? "#fef2f2" : "#e5e7eb",
                    color: hoverPreview.src || previewRow?.sourceImageUrl ? "#991b1b" : "#6b7280",
                    fontWeight: 800,
                    opacity: hoverPreview.src || previewRow?.sourceImageUrl ? 1 : 0.65,
                  }}
                  title="Delete only this row's attached screenshot preview. Row data and source filename stay saved."
                >
                  Delete Screenshot
                </button>

                <button
                  type="button"
                  onClick={() => jumpToNextMatchingReviewRow(previewRow.id, "issue", (row) => reviewCheck(row) || row.reviewLater === "Y")}
                  style={smallButtonStyle}
                >
                  Next Issue
                </button>

                <button
                  type="button"
                  onClick={() => jumpToNextMatchingReviewRow(previewRow.id, "hedge", (row) => rowHasUnresolvedHedgeDecision(row))}
                  style={smallButtonStyle}
                >
                  Next Hedge
                </button>

                <button
                  type="button"
                  onClick={() => jumpToNextMatchingReviewRow(previewRow.id, "missing-money", hasMissingHedgeMoney)}
                  style={smallButtonStyle}
                >
                  Next Missing Money
                </button>

                <button
                  type="button"
                  onClick={() => nextNoChangeFromPopup(previewRow)}
                  style={smallButtonStyle}
                >
                  Next / No Change
                </button>

                <button
                  type="button"
                  onClick={() => laterAndNextFromPopup(previewRow)}
                  style={smallButtonStyle}
                >
                  Later + Next
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleRowFieldChange(
                      previewRow.id,
                      "bonusBet",
                      previewRow.bonusBet === "Y" ? "N" : "Y"
                    )
                  }
                  style={{
                    ...smallButtonStyle,
                    border: previewRow.bonusBet === "Y" ? "2px solid #f97316" : smallButtonStyle.border,
                    background: previewRow.bonusBet === "Y" ? "#ffedd5" : smallButtonStyle.backgroundColor,
                    color: previewRow.bonusBet === "Y" ? "#9a3412" : undefined,
                    fontWeight: previewRow.bonusBet === "Y" ? 950 : undefined,
                  }}
                >
                  {previewRow.bonusBet === "Y" ? "BONUS On" : "Toggle Bonus"}
                </button>

                <button
                  type="button"
                  onClick={() => autoFillCalculatedFields(previewRow)}
                  style={smallButtonStyle}
                >
                  Calc Odds
                </button>

                <button
                  type="button"
                  onClick={() => calculatePayoutFromStakeAndOdds(previewRow, { showNotice: true })}
                  style={smallButtonStyle}
                >
                  Calc Payout
                </button>

                <button
                  type="button"
                  onClick={() => onClearReviewedScreenshots?.()}
                  style={smallButtonStyle}
                  title="Free memory by deleting screenshot previews from rows already confirmed/reviewed."
                >
                  Delete Reviewed Screenshots
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

              <div
                style={{
                  marginTop: 7,
                  paddingTop: 7,
                  borderTop: "1px solid #bbf7d0",
                }}
              >
                {renderPerformanceTracker()}
                {renderPerformanceCategoryControls(previewRow)}
              </div>

              {reviewActionNotice && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: reviewActionNotice.includes("Not confirmed") ? "#991b1b" : "#166534",
                    fontWeight: 800,
                  }}
                >
                  {reviewActionNotice}
                </div>
              )}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(520px, 1fr) clamp(340px, 36vw, 620px)",
              gap: 8,
              alignItems: "start",
              flex: "1 1 auto",
              minHeight: 0,
              height: "auto",
              maxHeight: "none",
              overflow: "hidden",
            }}
          >
            <div
              className="full-review-form-columns"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "flex-start",
                minHeight: 0,
                height: "100%",
                maxHeight: "none",
                overflowY: "auto",
                overflowX: "hidden",
                paddingRight: 8,
                paddingBottom: 28,
                boxSizing: "border-box",
                overscrollBehavior: "contain",
              }}
            >
              {hoverPreview.locked && previewRow && isRowInHedgeReviewContext(previewRow) && (() => {
                const showCandidates = !!showHedgeCandidatesByRowId[previewRow.id];
                const allCandidates = getAllHedgeCandidateRows(previewRow);
                const visibleCandidates = getHedgePartnerRows(previewRow);
                const hiddenCandidateCount = allCandidates.filter((candidate) => isIgnoredHedgePair(previewRow, candidate)).length;

                return (
                  <div
                    style={{
                      flex: "0 0 100%",
                      maxWidth: "100%",
                      padding: 10,
                      border: "1px solid #c7d2fe",
                      borderRadius: 12,
                      background: "#eef2ff",
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 950, color: "#312e81" }}>
                        Hedge Candidates
                        <span style={{ marginLeft: 8, fontSize: 12, color: "#475569" }}>
                          {visibleCandidates.length} visible · {hiddenCandidateCount} hidden · {allCandidates.length} stored
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowHedgeCandidatesByRowId((prev) => ({
                              ...prev,
                              [previewRow.id]: !showCandidates,
                            }));
                          }}
                          style={{
                            ...smallButtonStyle,
                            border: "1px solid #4f46e5",
                            background: "#e0e7ff",
                            color: "#312e81",
                            fontWeight: 900,
                          }}
                        >
                          {showCandidates ? "Hide Hedge Candidates" : "Show Hedge Candidates"}
                        </button>

                        {!visibleCandidates.length && !hiddenCandidateCount && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearRowFromHedgeReview(previewRow);
                            }}
                            style={{
                              ...smallButtonStyle,
                              border: "1px solid #9a3412",
                              background: "#fff7ed",
                              color: "#9a3412",
                              fontWeight: 900,
                            }}
                            title="Use this only when this row is in Hedge Review but has no real hedge candidate."
                          >
                            Clear Hedge Review for This Row
                          </button>
                        )}
                      </div>
                    </div>

                    {!visibleCandidates.length && hiddenCandidateCount > 0 && (
                      <div style={{ color: "#9a3412", fontSize: 12, fontWeight: 900 }}>
                        All stored candidates are currently hidden as Not This Match. Use the orange undo banner or expand this panel and click Undo on the hidden pair.
                      </div>
                    )}

                    {!allCandidates.length && (
                      <div style={{ color: "#475569", fontSize: 12, fontWeight: 800 }}>
                        {previewRow.largeStakeHedgeReview === "Y"
                          ? "This row is in Hedge Review because the stake is over $200. Run Hedge Scan after normalizing, or clear this row if it is not a hedge."
                          : "No stored candidates are attached to this hedge flag. Run Hedge Scan after normalizing, or clear this row from Hedge Review if it is not a hedge."}
                      </div>
                    )}

                    {showCandidates && allCandidates.length > 0 && (
                      <div style={{ display: "grid", gap: 8 }}>
                        {allCandidates.map((candidate, candidateIndex) => {
                          const isHidden = isIgnoredHedgePair(previewRow, candidate);
                          const isConfirmed = String(candidate.hedgeOverride || "").toUpperCase() === "Y";

                          return (
                            <div
                              key={`hedge-candidate-panel-${previewRow.id}-${candidate.id}`}
                              style={{
                                padding: 8,
                                border: isHidden ? "1px solid #fed7aa" : isConfirmed ? "1px solid #86efac" : "1px solid #c4b5fd",
                                borderRadius: 10,
                                background: isHidden ? "#fff7ed" : "#ffffff",
                                display: "grid",
                                gap: 5,
                                fontSize: 13,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                                <strong>
                                  Candidate {candidateIndex + 1}: {getDisplayedBookmaker(candidate) || candidate.bookmaker || "Book"}
                                </strong>
                                <span style={{ fontWeight: 900, color: isHidden ? "#9a3412" : isConfirmed ? "#166534" : "#4c1d95" }}>
                                  {isHidden ? "Hidden: Not This Match" : isConfirmed ? "Confirmed side" : "Visible candidate"}
                                </span>
                              </div>

                              <div>{candidate.selection || "—"}</div>
                              <div style={{ color: "#475569" }}>{candidate.fixtureEvent || "—"}</div>
                              <div style={{ color: "#475569" }}>
                                League {candidate.sportLeague || "—"} · Stake {candidate.stake ? `$${candidate.stake}` : "—"} · Odds {candidate.oddsUS || "—"} · Payout {candidate.payout ? `$${candidate.payout}` : "—"}
                              </div>

                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
                                {candidate.sourceImageUrl && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openHedgeDetailPopup(candidate);
                                    }}
                                    style={smallButtonStyle}
                                  >
                                    Open Screenshot
                                  </button>
                                )}

                                {isHidden ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        resetIgnoredHedgeMatches(previewRow, candidate);
                                      }}
                                      style={{
                                        ...smallButtonStyle,
                                        border: "1px solid #ea580c",
                                        background: "#ffedd5",
                                        color: "#9a3412",
                                        fontWeight: 900,
                                      }}
                                    >
                                      Undo Not This Match
                                    </button>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        confirmHedgePair(previewRow, candidate);
                                      }}
                                      style={{
                                        ...smallButtonStyle,
                                        border: "1px solid #166534",
                                        background: "#dcfce7",
                                        color: "#14532d",
                                        fontWeight: 900,
                                      }}
                                      title="Use this if you hid this pair by accident but it is actually the hedge."
                                    >
                                      Confirm Hidden Pair
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        confirmHedgePair(previewRow, candidate);
                                      }}
                                      style={{
                                        ...smallButtonStyle,
                                        border: "1px solid #166534",
                                        background: "#dcfce7",
                                        color: "#14532d",
                                        fontWeight: 900,
                                      }}
                                    >
                                      Confirm Pair
                                    </button>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        ignoreCurrentHedgeMatch(previewRow, candidate);
                                      }}
                                      style={{
                                        ...smallButtonStyle,
                                        border: "1px solid #9a3412",
                                        background: "#fff7ed",
                                        color: "#9a3412",
                                        fontWeight: 900,
                                      }}
                                    >
                                      Not This Match
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {hoverPreview.locked && previewRow && getIgnoredHedgeMatchItems(previewRow).map((item) => (
                <button
                  key={`ignored-hedge-full-${previewRow.id}-${item.id}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetIgnoredHedgeMatches(previewRow, item.partner || { id: item.id });
                  }}
                  style={{
                    flex: "0 0 100%",
                    maxWidth: "100%",
                    padding: "9px 11px",
                    border: "1px solid #fed7aa",
                    borderRadius: 10,
                    background: "#fff7ed",
                    color: "#9a3412",
                    fontWeight: 950,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                  title={item.context || "Undo this pair-specific Not This Match decision."}
                >
                  {item.label}
                  {item.context ? <div style={{ marginTop: 3, fontSize: 12, fontWeight: 800 }}>{item.context}</div> : null}
                </button>
              ))}

              {hoverPreview.locked && previewRow && previewRow.likelyHedge === "Y" && (() => {
                const isConfirmedHedge = String(previewRow.hedgeOverride || "").toUpperCase() === "Y";
                const partnerRows = getHedgePartnerRows(previewRow);

                return (
                  <div
                    style={{
                      padding: 8,
                      border: isConfirmedHedge ? "2px solid #166534" : "2px solid #7c3aed",
                      borderRadius: 12,
                      background: isConfirmedHedge ? "#f0fdf4" : "#faf5ff",
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <div style={{ fontWeight: 900, color: isConfirmedHedge ? "#14532d" : "#4c1d95" }}>
                      {isConfirmedHedge ? "Confirmed Hedge" : "Possible Hedge Match"}
                    </div>
                    <div style={{ fontSize: 12, color: "#6d28d9", fontWeight: 900 }}>
                      Hedge-critical: League {previewRow.sportLeague || "—"} · Stake {previewRow.stake ? `$${previewRow.stake}` : "—"} · Odds {previewRow.oddsUS || "—"} · Payout {previewRow.payout ? `$${previewRow.payout}` : "—"}
                    </div>

                    <div style={{ fontSize: 13, display: "grid", gap: 4 }}>
                      <div><strong>Quality:</strong> {previewRow.hedgeQuality || (isConfirmedHedge ? "Confirmed Hedge" : "Likely Hedge")}</div>
                      <div><strong>Partner book:</strong> {previewRow.hedgePartnerBookmaker || "—"}</div>
                      <div><strong>Profit range:</strong> {previewRow.hedgeProfitLow || "—"} → {previewRow.hedgeProfitHigh || "—"}</div>
                      {isConfirmedHedge && (
                        <div style={{ color: "#166534", fontWeight: 900 }}>
                          This row has been manually confirmed as a hedge.
                        </div>
                      )}
                    </div>

                    {partnerRows.length > 0 ? (
                      partnerRows.slice(0, 3).map((partner) => (
                        <div
                          key={`partner-${partner.id}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: partner.sourceImageUrl ? "92px 1fr" : "1fr",
                            gap: 8,
                            alignItems: "start",
                            padding: 8,
                            border: isConfirmedHedge ? "1px solid #bbf7d0" : "1px solid #ddd6fe",
                            borderRadius: 10,
                            background: "#ffffff",
                          }}
                        >
                          {partner.sourceImageUrl && (
                            <img
                              src={partner.sourceImageUrl}
                              alt={partner.sourceFileName || "hedge partner"}
                              onClick={(e) => {
                                e.stopPropagation();
                                openHedgeDetailPopup(partner);
                              }}
                              style={{
                                width: 84,
                                height: 84,
                                objectFit: "cover",
                                borderRadius: 8,
                                border: isConfirmedHedge ? "1px solid #86efac" : "1px solid #c4b5fd",
                                cursor: "pointer",
                              }}
                              title="Open hedge screenshot"
                            />
                          )}

                          <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                            <div><strong>{getDisplayedBookmaker(partner) || partner.bookmaker || "Partner"}</strong></div>
                            <div>{partner.selection || "—"}</div>
                            <div style={{ color: "#555" }}>{partner.fixtureEvent || "—"}</div>
                            <div>
                              Stake {partner.stake ? `$${partner.stake}` : "—"} · Odds {partner.oddsUS || "—"} · Payout {partner.payout ? `$${partner.payout}` : "—"}
                            </div>

                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openHedgeDetailPopup(partner);
                                }}
                                style={smallButtonStyle}
                              >
                                Open Hedge Screenshot
                              </button>

                              {!isConfirmedHedge && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    confirmHedgePair(previewRow, partner);
                                    closeHedgeDetailPopup();
                                  }}
                                  style={{
                                    ...smallButtonStyle,
                                    border: "1px solid #166534",
                                    background: "#dcfce7",
                                    color: "#14532d",
                                    fontWeight: 900,
                                  }}
                                >
                                  Confirm Hedge Pair
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  ignoreCurrentHedgeMatch(previewRow, partner);
                                  closeHedgeDetailPopup();
                                }}
                                style={{
                                  ...smallButtonStyle,
                                  border: "1px solid #9a3412",
                                  background: "#fff7ed",
                                  color: "#9a3412",
                                  fontWeight: 900,
                                }}
                                title="Ignore only this suggested pair. Both bets can still match another hedge."
                              >
                                Not This Match
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: 13, color: "#6b7280", display: "grid", gap: 6 }}>
                        {getIgnoredHedgeMatchItems(previewRow).length ? (
                          <span>All visible possible hedge matches for this row are currently hidden as Not This Match. Use the orange undo banner above to bring a pair back.</span>
                        ) : (
                          <span>No matching row is currently loaded in the review table. Keep both weeks loaded for cross-week hedge review, or run Hedge Scan after normalizing.</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {hoverPreview.locked && previewRow && (() => {
                const reviewKind = getReviewBetKind(previewRow);
                const suggestions = getSmartContextSuggestions(previewRow || {});
                const mainLineMarket = suggestions.mainLineMarket || inferMainLineMarketFromRow(previewRow) || "moneyline";
                const mainLineSideLine = inferMainLineSideAndLine(previewRow);
                const cleanMainLineLine = cleanMainLineLineValue(
                  previewRow?.mainLineLine || mainLineSideLine.line || "",
                  mainLineMarket
                );
                const cleanMainLineSide =
                  previewRow?.mainLineSide ||
                  mainLineSideLine.side ||
                  "";

                return (
                  <div
                    className="review-build-market-section review-card"
                    style={{
                      padding: 12,
                      display: "grid",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 950, color: "#1e3a8a" }}>
                        Start Here: Bet Type → Build Selection
                        <div style={{ marginTop: 3, fontSize: 12, fontWeight: 700, color: "#1d4ed8" }}>
                          Pick Moneyline, Spread, or Total first so only the relevant fields appear.
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button type="button" onClick={() => setMainLineMarketForCurrentRow(previewRow, "moneyline")} style={getMainLineMarketButtonStyle("moneyline", mainLineMarket, reviewKind)}>
                          Moneyline
                        </button>
                        <button type="button" onClick={() => setMainLineMarketForCurrentRow(previewRow, "spread")} style={getMainLineMarketButtonStyle("spread", mainLineMarket, reviewKind)}>
                          Spread
                        </button>
                        <button type="button" onClick={() => setMainLineMarketForCurrentRow(previewRow, "total")} style={getMainLineMarketButtonStyle("total", mainLineMarket, reviewKind)}>
                          Total
                        </button>
                        <button type="button" onClick={() => setReviewBetKindForCurrentRow(previewRow, "player_prop")} style={getBetKindButtonStyle("player_prop", reviewKind)}>
                          Player Prop
                        </button>
                        <button type="button" onClick={() => setReviewBetKindForCurrentRow(previewRow, "parlay")} style={getBetKindButtonStyle("parlay", reviewKind)}>
                          Parlay
                        </button>
                        <button type="button" onClick={() => setReviewBetKindForCurrentRow(previewRow, "promo_special")} style={getBetKindButtonStyle("promo_special", reviewKind)}>
                          Promo Special
                        </button>
                        <button type="button" onClick={() => setReviewBetKindForCurrentRow(previewRow, "other")} style={getBetKindButtonStyle("other", reviewKind)}>
                          Game Prop / Other
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        tabIndex={18}
                        type="button"
                        onClick={() => previewRow && buildBetFieldsForCurrentRow(previewRow)}
                        style={{
                          ...smallButtonStyle,
                          border: "1px solid #2563eb",
                          background: "#dbeafe",
                          color: "#1e3a8a",
                          fontWeight: 950,
                          padding: "10px 14px",
                        }}
                        title="Fill parsed context, build event, set market/bet type, and build selection"
                      >
                        Build / Normalize Bet
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <strong>Event:</strong>
                        <input
                          key={`fixture-${previewRow?.id || "none"}`}
                          ref={popupFixtureRef}
                          tabIndex={19}
                          defaultValue={previewRow?.fixtureEvent || ""}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation();

                            if (e.key === "Enter" && previewRow) {
                              handleRowFieldChange(previewRow.id, "fixtureEvent", e.currentTarget.value);
                              e.currentTarget.blur();
                            }
                          }}
                          onBlur={(e) =>
                            previewRow &&
                            handleRowFieldChange(previewRow.id, "fixtureEvent", e.currentTarget.value)
                          }
                          placeholder="CHI Bulls @ Los Angeles Clippers"
                          style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                        />
                      </div>

                      <div>
                        <strong>League:</strong>
                        <input
                          key={`league-${previewRow?.id || "none"}`}
                          list={`league-options-${previewRow?.id || "none"}`}
                          ref={popupLeagueRef}
                          data-row-id={previewRow?.id || ""}
                          tabIndex={20}
                          defaultValue=""
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation();

                            if (e.key === "Enter" && previewRow) {
                              const enteredLeague = e.currentTarget.value.trim();

                              if (enteredLeague) {
                                setLeagueForReviewRow(previewRow.id, enteredLeague);
                              } else {
                                buildBetFieldsForCurrentRow(previewRow);
                              }

                              e.currentTarget.blur();
                            }
                          }}
                          onBlur={(e) => {
                            if (!previewRow) return;

                            const enteredLeague = e.currentTarget.value.trim();
                            if (enteredLeague) {
                              setLeagueForReviewRow(previewRow.id, enteredLeague);
                            }
                          }}
                          placeholder={`Auto-detect on Normalize${previewRow?.sportLeague ? ` (parsed: ${previewRow.sportLeague})` : ""}`}
                          style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                        />

                        <datalist id={`league-options-${previewRow?.id || "none"}`}>
                          {getLeagueOptionsForRow(previewRow || {}).map((league) => (
                            <option key={league || "blank"} value={league} />
                          ))}
                        </datalist>
                      </div>

                      <div>
                        <strong>Bookmaker:</strong>
                        <select
                          tabIndex={21}
                          value={previewRow?.bookmaker || ""}
                          onChange={(e) =>
                            previewRow &&
                            handleRowFieldChange(previewRow.id, "bookmaker", e.target.value)
                          }
                          style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4, background: "#fff" }}
                        >
                          <option value="">Select</option>
                          <option value="DraftKings">DraftKings</option>
                          <option value="BetMGM">BetMGM</option>
                          <option value="FanDuel">FanDuel</option>
                          <option value="Caesars">Caesars</option>
                          <option value="Fanatics">Fanatics</option>
                          <option value="The Score">The Score</option>
                          <option value="Bet365">Bet365</option>
                          <option value="Circa">Circa</option>
                          <option value="Kalshi">Kalshi</option>
                        </select>
                      </div>

                      <div>
                        <strong>Bet Type:</strong>
                        <input
                          key={`bet-type-${previewRow?.id || "none"}`}
                          ref={popupBetTypeRef}
                          tabIndex={22}
                          list={`bet-type-options-${previewRow?.id || "none"}`}
                          defaultValue={
                            reviewKind === "other" &&
                            getGamePropMarketLabel(
                              [
                                previewRow?.reviewMarketType,
                                previewRow?.canonicalMarketContext,
                                previewRow?.marketDetail,
                                previewRow?.selection,
                                previewRow?.sourceText,
                              ].filter(Boolean).join(" ")
                            )
                              ? "game prop"
                              : previewRow?.betType || ""
                          }
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation();

                            if (e.key === "Enter" && previewRow) {
                              handleRowFieldChange(previewRow.id, "betType", e.currentTarget.value);
                              e.currentTarget.blur();
                            }
                          }}
                          onBlur={(e) => {
                            if (!previewRow) return;
                            const market = normalizeMainLineMarket(e.currentTarget.value);

                            if (market) {
                              setMainLineMarketForCurrentRow(previewRow, market);
                              e.currentTarget.value = market;
                              return;
                            }

                            handleRowFieldChange(previewRow.id, "betType", e.currentTarget.value);
                          }}
                          placeholder="moneyline, spread, total..."
                          style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                        />

                        <datalist id={`bet-type-options-${previewRow?.id || "none"}`}>
                          <option value="moneyline" />
                          <option value="spread" />
                          <option value="total" />
                          <option value="player prop" />
                          <option value="game prop" />
                          <option value="parlay" />
                          <option value="futures" />
                          <option value="straight" />
                        </datalist>
                      </div>

                      {reviewKind === "parlay" && (() => {
                        const parlayLegs = parseParlayLegs(previewRow);
                        const draft = getParlayLegDraft(previewRow);
                        const nextLegNumber = parlayLegs.length + 1;
                        const draftMarket = normalizeMainLineMarket(draft.market || "moneyline") || draft.market || "moneyline";
                        const draftLegType = draft.legType || "main_line";
                        const skipLegEntry = previewRow.parlayLegsSkipped === "Y";

                        return (
                          <div
                            style={{
                              gridColumn: "1 / -1",
                              display: "grid",
                              gap: 8,
                              padding: 10,
                              border: "2px solid #bfdbfe",
                              borderRadius: 10,
                              background: "#eff6ff",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <div>
                                <strong style={{ color: "#1e3a8a" }}>Parlay Legs</strong>
                                <div style={{ marginTop: 3, fontSize: 12, color: "#1d4ed8", fontWeight: 800 }}>
                                  Confirm one leg at a time. Confirmed legs collapse into labels for leg-level hedge matching later.
                                </div>
                              </div>

                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  onClick={() => confirmAllParlayLegs(previewRow)}
                                  style={{
                                    ...smallButtonStyle,
                                    border: "1px solid #166534",
                                    background: parlayLegs.length ? "#dcfce7" : "#f3f4f6",
                                    color: parlayLegs.length ? "#14532d" : "#6b7280",
                                    fontWeight: 900,
                                  }}
                                >
                                  All Legs Entered
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    skipLegEntry
                                      ? resumeParlayLegEntry(previewRow)
                                      : skipParlayLegEntry(previewRow)
                                  }
                                  style={{
                                    ...smallButtonStyle,
                                    border: skipLegEntry ? "1px solid #2563eb" : "1px solid #7c3aed",
                                    background: skipLegEntry ? "#dbeafe" : "#f5f3ff",
                                    color: skipLegEntry ? "#1e3a8a" : "#5b21b6",
                                    fontWeight: 900,
                                  }}
                                >
                                  {skipLegEntry ? "Enter Individual Legs" : "Use Summary Only"}
                                </button>
                              </div>
                            </div>

                            {skipLegEntry && (
                              <div
                                style={{
                                  padding: "8px 10px",
                                  border: "1px solid #c4b5fd",
                                  borderRadius: 8,
                                  background: "#f5f3ff",
                                  color: "#5b21b6",
                                  fontSize: 13,
                                  fontWeight: 900,
                                }}
                              >
                                Summary-only mode: Selection and Event are both {getParlaySummaryLabel(previewRow)}.
                                Individual legs can be added later by clicking Enter Individual Legs.
                              </div>
                            )}

                            {parlayLegs.length > 0 && (
                              <div style={{ display: "grid", gap: 6 }}>
                                {parlayLegs.map((leg) => (
                                  <div
                                    key={leg.id || `leg-${leg.legIndex}`}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      gap: 8,
                                      padding: "7px 9px",
                                      border: "1px solid #93c5fd",
                                      borderRadius: 8,
                                      background: "#ffffff",
                                      fontSize: 13,
                                    }}
                                  >
                                    <div style={{ minWidth: 0 }}>
                                      <strong>Leg {leg.legIndex}:</strong>{" "}
                                      <span>{getParlayLegSummary(leg)}</span>
                                    </div>

                                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                      <button type="button" onClick={() => editParlayLeg(previewRow, leg)} style={smallButtonStyle}>
                                        Edit
                                      </button>
                                      <button type="button" onClick={() => removeParlayLeg(previewRow, leg.legIndex)} style={smallButtonStyle}>
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div
                              style={{
                                display: skipLegEntry ? "none" : "grid",
                                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                gap: 8,
                                padding: 10,
                                border: "1px solid #bfdbfe",
                                borderRadius: 10,
                                background: "#ffffff",
                              }}
                            >
                              <div style={{ gridColumn: "1 / -1", fontWeight: 950, color: "#1e3a8a" }}>
                                Leg {nextLegNumber}
                              </div>

                              <div>
                                <strong>Leg Type:</strong>
                                <select
                                  value={draftLegType}
                                  onChange={(e) => setParlayLegDraftField(previewRow.id, "legType", e.target.value)}
                                  style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4, background: "#fff" }}
                                >
                                  <option value="main_line">Main Line</option>
                                  <option value="player_prop">Player Prop</option>
                                  <option value="other">Other / Manual</option>
                                </select>
                              </div>

                              <div>
                                <strong>League:</strong>
                                <input
                                  value={draft.sportLeague || ""}
                                  list={`parlay-leg-league-options-${previewRow.id}`}
                                  onChange={(e) => setParlayLegDraftField(previewRow.id, "sportLeague", e.target.value)}
                                  onBlur={(e) => setParlayLegDraftField(previewRow.id, "sportLeague", e.currentTarget.value)}
                                  placeholder="NBA, NHL, Baseball..."
                                  style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                                />
                                <datalist id={`parlay-leg-league-options-${previewRow.id}`}>
                                  {getLeagueOptionsForRow(previewRow || {}).map((league) => (
                                    <option key={`leg-league-${league || "blank"}`} value={league} />
                                  ))}
                                </datalist>
                              </div>

                              <div style={{ gridColumn: "1 / -1" }}>
                                <strong>Event:</strong>
                                <input
                                  value={draft.fixtureEvent || ""}
                                  onChange={(e) => setParlayLegDraftField(previewRow.id, "fixtureEvent", e.target.value)}
                                  onBlur={(e) => setParlayLegDraftField(previewRow.id, "fixtureEvent", e.currentTarget.value)}
                                  placeholder="Vegas Golden Knights @ Edmonton Oilers"
                                  style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                                />
                              </div>

                              {draftLegType === "main_line" && (
                                <>
                                  <div>
                                    <strong>Market:</strong>
                                    <input
                                      value={draft.market || "moneyline"}
                                      list={`parlay-leg-main-market-options-${previewRow.id}`}
                                      onChange={(e) => setParlayLegDraftField(previewRow.id, "market", e.target.value)}
                                      onBlur={(e) => setParlayLegDraftField(previewRow.id, "market", normalizeMainLineMarket(e.currentTarget.value) || e.currentTarget.value)}
                                      placeholder="moneyline, spread, total"
                                      style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                                    />
                                    <datalist id={`parlay-leg-main-market-options-${previewRow.id}`}>
                                      <option value="moneyline" />
                                      <option value="spread" />
                                      <option value="total" />
                                    </datalist>
                                  </div>

                                  <div>
                                    <strong>{draftMarket === "total" ? "Over / Under:" : "Selected Side / Team:"}</strong>
                                    <input
                                      value={draft.selectedSide || ""}
                                      onChange={(e) => setParlayLegDraftField(previewRow.id, "selectedSide", e.target.value)}
                                      onBlur={(e) => setParlayLegDraftField(previewRow.id, "selectedSide", normalizeParlayLegSide(e.currentTarget.value, previewRow, draft))}
                                      placeholder={draftMarket === "total" ? "Over or Under" : "VGK, Celtics, Mexico..."}
                                      style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                                    />
                                    {draftMarket === "total" && (
                                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                                        <button
                                          type="button"
                                          onClick={() => setParlayLegDraftField(previewRow.id, "selectedSide", "Over")}
                                          style={{
                                            ...smallButtonStyle,
                                            border: normalizeSelectionSide(draft.selectedSide) === "Over" ? "2px solid #1d4ed8" : "1px solid #bfdbfe",
                                            background: normalizeSelectionSide(draft.selectedSide) === "Over" ? "#dbeafe" : "#ffffff",
                                            color: "#1e3a8a",
                                            fontWeight: 900,
                                          }}
                                        >
                                          Over
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setParlayLegDraftField(previewRow.id, "selectedSide", "Under")}
                                          style={{
                                            ...smallButtonStyle,
                                            border: normalizeSelectionSide(draft.selectedSide) === "Under" ? "2px solid #1d4ed8" : "1px solid #bfdbfe",
                                            background: normalizeSelectionSide(draft.selectedSide) === "Under" ? "#dbeafe" : "#ffffff",
                                            color: "#1e3a8a",
                                            fontWeight: 900,
                                          }}
                                        >
                                          Under
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    <strong>{draftMarket === "moneyline" ? "Line: not used" : "Line:"}</strong>
                                    <input
                                      value={draft.line || ""}
                                      onChange={(e) => setParlayLegDraftField(previewRow.id, "line", e.target.value)}
                                      onBlur={(e) => setParlayLegDraftField(previewRow.id, "line", cleanMainLineLineValue(e.currentTarget.value, draftMarket))}
                                      placeholder={draftMarket === "moneyline" ? "leave blank" : "+1.5 or 5.5"}
                                      style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                                    />
                                  </div>
                                </>
                              )}

                              {draftLegType === "player_prop" && (
                                <>
                                  <div>
                                    <strong>Player / Subject:</strong>
                                    <input
                                      value={draft.subject || ""}
                                      onChange={(e) => setParlayLegDraftField(previewRow.id, "subject", e.target.value)}
                                      onBlur={(e) => setParlayLegDraftField(previewRow.id, "subject", cleanParticipantTextForMatching(e.currentTarget.value))}
                                      placeholder="Connor McDavid"
                                      style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                                    />
                                  </div>

                                  <div>
                                    <strong>Prop Market:</strong>
                                    <input
                                      value={draft.propMarket || ""}
                                      list={`parlay-leg-prop-market-options-${previewRow.id}`}
                                      onChange={(e) => setParlayLegDraftField(previewRow.id, "propMarket", e.target.value)}
                                      onBlur={(e) => setParlayLegDraftField(previewRow.id, "propMarket", normalizePropMarketValue(e.currentTarget.value))}
                                      placeholder="points, shots on goal, assists..."
                                      style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                                    />
                                    <datalist id={`parlay-leg-prop-market-options-${previewRow.id}`}>
                                      <option value="points" />
                                      <option value="assists" />
                                      <option value="rebounds" />
                                      <option value="points + rebounds + assists" />
                                      <option value="points + rebounds" />
                                      <option value="points + assists" />
                                      <option value="rebounds + assists" />
                                      <option value="double-double" />
                                      <option value="triple-double" />
                                      <option value="shots on goal" />
                                      <option value="goals" />
                                      <option value="saves" />
                                      <option value="strikeouts" />
                                      <option value="home runs" />
                                      <option value="hits" />
                                      <option value="games" />
                                    </datalist>
                                  </div>

                                  <div>
                                    <strong>Outcome / Side:</strong>
                                    <input
                                      value={draft.outcome || ""}
                                      onChange={(e) => setParlayLegDraftField(previewRow.id, "outcome", e.target.value)}
                                      onBlur={(e) => setParlayLegDraftField(previewRow.id, "outcome", normalizeSelectionSide(e.currentTarget.value))}
                                      placeholder="Over, Under, Yes, No"
                                      style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                                    />
                                  </div>

                                  <div>
                                    <strong>Line / Threshold:</strong>
                                    <input
                                      value={draft.line || ""}
                                      onChange={(e) => setParlayLegDraftField(previewRow.id, "line", e.target.value)}
                                      onBlur={(e) => setParlayLegDraftField(previewRow.id, "line", e.currentTarget.value)}
                                      placeholder="3.5 or 1+"
                                      style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                                    />
                                  </div>
                                </>
                              )}

                              <div style={{ gridColumn: "1 / -1" }}>
                                <strong>Final Leg Selection:</strong>
                                <input
                                  value={draft.selection || ""}
                                  onChange={(e) => setParlayLegDraftField(previewRow.id, "selection", e.target.value)}
                                  onBlur={(e) => setParlayLegDraftField(previewRow.id, "selection", cleanSelectionTextForReview(e.currentTarget.value))}
                                  placeholder="Optional manual override. Otherwise built from fields above."
                                  style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                                />
                                <div style={{ fontSize: 12, color: "#475569", fontWeight: 800, marginTop: 4 }}>
                                  Preview: {buildParlayLegSelection(previewRow, draft) || "—"}
                                </div>
                              </div>

                              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  onClick={() => confirmParlayLegForCurrentRow(previewRow)}
                                  style={{
                                    ...smallButtonStyle,
                                    border: "1px solid #2563eb",
                                    background: "#dbeafe",
                                    color: "#1e3a8a",
                                    fontWeight: 950,
                                  }}
                                >
                                  Confirm Leg {nextLegNumber} + Add Next
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setParlayLegDraftByRowId((prev) => ({ ...prev, [previewRow.id]: getDefaultParlayLegDraft(previewRow) }))}
                                  style={smallButtonStyle}
                                >
                                  Clear Current Leg
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div style={{ display: ["parlay", "promo_special"].includes(reviewKind) ? "none" : "block" }}>
                        <strong>Participant A:</strong>
                        <input
                          key={`participant-a-${previewRow?.id || "none"}`}
                          ref={popupParticipantARef}
                          tabIndex={23}
                          list={`participant-options-a-${previewRow?.id || "none"}`}
                          defaultValue={previewRow?.participantA || previewRow?.participantANormalized || suggestions.participantA || ""}
                          onClick={(e) => e.stopPropagation()}
                          autoComplete="off"
                          onBlur={(e) => {
                            if (!previewRow) return;
                            const raw = cleanParticipantTextForMatching(e.currentTarget.value);
                            const normalized = normalizeParticipantName(raw, getPreviewLeagueValue(previewRow));

                            e.currentTarget.value = raw;
                            handleRowFieldChange(previewRow.id, "participantA", raw);
                            handleRowFieldChange(previewRow.id, "participantANormalized", normalized);
                          }}
                          placeholder="USA, Jazz, Andre Fili..."
                          style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                        />
                        <datalist id={`participant-options-a-${previewRow?.id || "none"}`}>
                          {getParticipantOptionsForLeague(getPreviewLeagueValue(previewRow)).map((option) => (
                            <option key={`a-${option}`} value={option} />
                          ))}
                        </datalist>
                        <div style={{ fontSize: 12, marginTop: 3, color: "#1d4ed8" }}>
                          Normalized: {getParticipantANormalized(previewRow) || "—"}
                        </div>
                      </div>

                      <div style={{ display: ["parlay", "promo_special"].includes(reviewKind) ? "none" : "block" }}>
                        <strong>Participant B:</strong>
                        <input
                          key={`participant-b-${previewRow?.id || "none"}`}
                          ref={popupParticipantBRef}
                          tabIndex={24}
                          list={`participant-options-b-${previewRow?.id || "none"}`}
                          defaultValue={previewRow?.participantB || previewRow?.participantBNormalized || suggestions.participantB || ""}
                          onClick={(e) => e.stopPropagation()}
                          autoComplete="off"
                          onBlur={(e) => {
                            if (!previewRow) return;
                            const raw = cleanParticipantTextForMatching(e.currentTarget.value);
                            const normalized = normalizeParticipantName(raw, getPreviewLeagueValue(previewRow));

                            e.currentTarget.value = raw;
                            handleRowFieldChange(previewRow.id, "participantB", raw);
                            handleRowFieldChange(previewRow.id, "participantBNormalized", normalized);
                          }}
                          placeholder="Mexico, Kings, Jose Delgado..."
                          style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                        />
                        <datalist id={`participant-options-b-${previewRow?.id || "none"}`}>
                          {getParticipantOptionsForLeague(getPreviewLeagueValue(previewRow)).map((option) => (
                            <option key={`b-${option}`} value={option} />
                          ))}
                        </datalist>
                        <div style={{ fontSize: 12, marginTop: 3, color: "#1d4ed8" }}>
                          Normalized: {getParticipantBNormalized(previewRow) || "—"}
                        </div>
                      </div>

                      {reviewKind === "main_line" && (
                        <>
                          <div>
                            <strong>Market Type:</strong>
                            <input
                              key={`main-market-${previewRow?.id || "none"}`}
                              ref={popupPropMarketRef}
                              tabIndex={25}
                              list={`main-market-options-${previewRow?.id || "none"}`}
                              defaultValue={mainLineMarket}
                              onClick={(e) => e.stopPropagation()}
                              autoComplete="off"
                              onBlur={(e) => {
                                if (!previewRow) return;
                                const market = normalizeMainLineMarket(e.currentTarget.value) || e.currentTarget.value || "moneyline";
                                setMainLineMarketForCurrentRow(previewRow, market);
                                e.currentTarget.value = market;
                              }}
                              placeholder="moneyline, spread, total"
                              style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                            />
                            <div style={{ fontSize: 12, marginTop: 3, color: "#475569", fontWeight: 700 }}>
                              Main-line market type. Do not put the side/line here.
                            </div>
                            <datalist id={`main-market-options-${previewRow?.id || "none"}`}>
                              <option value="moneyline" />
                              <option value="spread" />
                              <option value="total" />
                            </datalist>
                          </div>

                          <div>
                            <strong>{mainLineMarket === "total" ? "Over / Under:" : "Selected Side / Team:"}</strong>
                            <input
                              key={`main-side-${previewRow?.id || "none"}`}
                              ref={popupMainLineSideRef}
                              data-row-id={previewRow?.id || ""}
                              tabIndex={26}
                              defaultValue={cleanMainLineSide}
                              onClick={(e) => e.stopPropagation()}
                              autoComplete="off"
                              onBlur={(e) => {
                                if (!previewRow) return;

                                const rawSideValue = e.currentTarget.value;

                                if (sideValueIsTotalSide(rawSideValue)) {
                                  setMainLineSideForCurrentRow(previewRow, rawSideValue);
                                  e.currentTarget.value = normalizeSelectionSide(rawSideValue);
                                  setReviewActionNotice("Detected Over/Under side and switched market to Total.");
                                  return;
                                }

                                const normalizedSide = normalizeMainLineSideValue(
                                  rawSideValue,
                                  previewRow,
                                  mainLineMarket
                                );

                                e.currentTarget.value = normalizedSide;
                                handleRowFieldChange(previewRow.id, "mainLineSide", normalizedSide);

                                if (mainLineMarket !== "total" && normalizedSide) {
                                  const validation = validateMainLineSideForProceed(previewRow, mainLineMarket, normalizedSide);
                                  if (!validation.ok) {
                                    setReviewActionNotice("Selected Side / Team does not match Participant A or Participant B yet.");
                                  }
                                }
                              }}
                              placeholder={mainLineMarket === "total" ? "Over or Under" : "Andreozzi / Guinard, Mexico, Celtics..."}
                              style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                            />
                            {mainLineMarket === "total" && (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                                <button
                                  type="button"
                                  onClick={() => previewRow && setMainLineSideForCurrentRow(previewRow, "Over")}
                                  style={{
                                    ...smallButtonStyle,
                                    border: cleanMainLineSide === "Over" ? "2px solid #1d4ed8" : "1px solid #bfdbfe",
                                    background: cleanMainLineSide === "Over" ? "#dbeafe" : "#ffffff",
                                    color: "#1e3a8a",
                                    fontWeight: 900,
                                  }}
                                >
                                  Over
                                </button>
                                <button
                                  type="button"
                                  onClick={() => previewRow && setMainLineSideForCurrentRow(previewRow, "Under")}
                                  style={{
                                    ...smallButtonStyle,
                                    border: cleanMainLineSide === "Under" ? "2px solid #1d4ed8" : "1px solid #bfdbfe",
                                    background: cleanMainLineSide === "Under" ? "#dbeafe" : "#ffffff",
                                    color: "#1e3a8a",
                                    fontWeight: 900,
                                  }}
                                >
                                  Under
                                </button>
                              </div>
                            )}
                            <div style={{ fontSize: 12, marginTop: 3, color: "#1d4ed8", fontWeight: 700 }}>
                              {mainLineMarket === "total"
                                ? "Choose Over or Under. If the line is filled, this updates Final Selection."
                                : "This is the side you bet. For moneyline, this becomes the selection."}
                            </div>
                            {mainLineMarket !== "total" && (
                              <div style={{ fontSize: 12, marginTop: 3, color: findParticipantMatchForSide(cleanMainLineSide, previewRow)?.display ? "#166534" : "#9a3412", fontWeight: 800 }}>
                                Matched side: {findParticipantMatchForSide(cleanMainLineSide, previewRow)?.display || "— must match Participant A or B"}
                              </div>
                            )}
                          </div>

                          {mainLineMarket !== "moneyline" && (
                            <div>
                              <strong>Line:</strong>
                              <input
                                key={`main-line-${previewRow?.id || "none"}`}
                                ref={popupMainLineLineRef}
                                data-row-id={previewRow?.id || ""}
                                tabIndex={27}
                                defaultValue={cleanMainLineLine}
                                onClick={(e) => e.stopPropagation()}
                                autoComplete="off"
                                onBlur={(e) =>
                                  previewRow &&
                                  handleRowFieldChange(
                                    previewRow.id,
                                    "mainLineLine",
                                    cleanMainLineLineValue(e.currentTarget.value, mainLineMarket)
                                  )
                                }
                                placeholder={mainLineMarket === "spread" ? "+3.5" : "8.5"}
                                style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                              />
                            </div>
                          )}
                        </>
                      )}

                      {reviewKind === "player_prop" && (
                        <>
                          <div>
                            <strong>Player / Subject:</strong>
                            <input
                              key={`subject-${previewRow?.id || "none"}`}
                              ref={popupSubjectRef}
                              data-row-id={previewRow?.id || ""}
                              tabIndex={25}
                              defaultValue={getPlayerSubjectForReviewLeague(
                                previewRow,
                                getLockedPlayerSubjectForRow(previewRow) ||
                                  inferPlayerSubjectFromParsedText(previewRow) ||
                                  previewRow?.canonicalSubject ||
                                  previewRow?.canonicalPlayer ||
                                  suggestions.canonicalSubject ||
                                  ""
                              )}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => {
                                if (previewRow?.id) {
                                  manuallyEditedPlayerSubjectRowIdsRef.current.add(previewRow.id);
                                }
                              }}
                              autoComplete="off"
                              onBlur={(e) => {
                                if (!previewRow) return;
                                const rawSubject = e.currentTarget.value;
                                const cleanedSubject = getPlayerSubjectForReviewLeague(
                                  previewRow,
                                  rawSubject
                                );
                                const inferredLastName = getLastNameFromText(cleanedSubject);
                                const lastName = cleanedSubject ? (popupPlayerLastNameRef.current?.value || inferredLastName) : "";

                                e.currentTarget.value = cleanedSubject;

                                const subjectUpdates = {
                                  reviewBetKind: "player_prop",
                                  betType: "player prop",
                                };

                                if (cleanedSubject) {
                                  Object.assign(subjectUpdates, preserveManualPlayerSubjectAndMaybeSelection(previewRow, cleanedSubject));
                                  subjectUpdates.canonicalSubject = cleanedSubject;
                                  subjectUpdates.canonicalPlayer = cleanedSubject;
                                  subjectUpdates.playerLastName = lastName;
                                  subjectUpdates.playerSubjectManual = "Y";
                                  subjectUpdates.playerSubjectUserEdited = "Y";

                                  const nextSelection = buildVisibleStructuredPlayerPropSelection(
                                    {
                                      ...previewRow,
                                      canonicalSubject: cleanedSubject,
                                      canonicalPlayer: cleanedSubject,
                                    },
                                    popupSelectionRef.current?.value || previewRow.selection || ""
                                  );

                                  if (nextSelection) {
                                    subjectUpdates.selection = nextSelection;
                                    if (popupSelectionRef.current) {
                                      popupSelectionRef.current.value = nextSelection;
                                    }
                                  }
                                }

                                applyRowFieldUpdates(previewRow.id, subjectUpdates);

                                if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = "";
                                if (popupBetTypeRef.current) popupBetTypeRef.current.value = "player prop";
                                if (popupMarketContextRef.current) popupMarketContextRef.current.value = "player prop";
                              }}
                              placeholder="Full player, e.g. Ryan Rollins"
                              style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                            />
                          </div>

                          <div>
                            <strong>Player Last Name:</strong>
                            <input
                              key={`player-last-${previewRow?.id || "none"}`}
                              ref={popupPlayerLastNameRef}
                              data-row-id={previewRow?.id || ""}
                              tabIndex={26}
                              defaultValue={""}
                              onClick={(e) => e.stopPropagation()}
                              autoComplete="off"
                              onBlur={(e) => previewRow && handleRowFieldChange(previewRow.id, "playerLastName", e.currentTarget.value)}
                              placeholder="auto-filled from full player name"
                              style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                            />
                          </div>

                          <div>
                            <strong>Prop Market:</strong>
                            <input
                              key={`prop-market-${previewRow?.id || "none"}`}
                              ref={popupPropMarketRef}
                              data-row-id={previewRow?.id || ""}
                              tabIndex={27}
                              list={`prop-market-options-${previewRow?.id || "none"}`}
                              defaultValue={previewRow?.propMarket || suggestions.propMarket || ""}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={(e) => {
                                if (!previewRow) return;
                                const normalizedPropMarket = normalizePropMarketValue(e.currentTarget.value);
                                e.currentTarget.value = normalizedPropMarket;

                                const nextSelection = buildVisibleStructuredPlayerPropSelection(
                                  {
                                    ...previewRow,
                                    propMarket: normalizedPropMarket,
                                  },
                                  popupSelectionRef.current?.value || previewRow.selection || ""
                                );

                                applyRowFieldUpdates(previewRow.id, {
                                  reviewBetKind: "player_prop",
                                  propMarket: normalizedPropMarket,
                                  betType: "player prop",
                                  canonicalMarketContext: "player prop",
                                  ...(nextSelection ? { selection: nextSelection } : {}),
                                });

                                if (nextSelection && popupSelectionRef.current) {
                                  popupSelectionRef.current.value = nextSelection;
                                }
                                if (popupBetTypeRef.current) popupBetTypeRef.current.value = "player prop";
                                if (popupMarketContextRef.current) popupMarketContextRef.current.value = "player prop";
                              }}
                              placeholder="points, rebounds, PRA..."
                              autoComplete="off"
                              style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                            />
                            <datalist id={`prop-market-options-${previewRow?.id || "none"}`}>
                              <option value="points" />
                              <option value="assists" />
                              <option value="rebounds" />
                              <option value="points + rebounds + assists" />
                              <option value="points + rebounds" />
                              <option value="points + assists" />
                              <option value="rebounds + assists" />
                              <option value="PRA" />
                              <option value="P+R" />
                              <option value="P+A" />
                              <option value="R+A" />
                              <option value="double-double" />
                              <option value="triple-double" />
                              <option value="threes" />
                              <option value="goals" />
                              <option value="shots on goal" />
                              <option value="saves" />
                              <option value="strikeouts" />
                              <option value="total bases" />
                              <option value="home runs" />
                              <option value="rbis" />
                              <option value="hits" />
                              <option value="games" />
                              <option value="method of victory" />
                            </datalist>
                          </div>

                          <div>
                            <strong>Outcome / Side:</strong>
                            <input
                              key={`prop-side-${previewRow?.id || "none"}`}
                              ref={popupPropSideRef}
                              data-row-id={previewRow?.id || ""}
                              tabIndex={28}
                              defaultValue={getStructuredPlayerPropSide(
                                previewRow,
                                previewRow?.propMarket ||
                                  suggestions.propMarket ||
                                  ""
                              )}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={(e) => {
                                if (!previewRow) return;

                                const side =
                                  normalizeSelectionSide(
                                    e.currentTarget.value
                                  ) || e.currentTarget.value.trim();

                                e.currentTarget.value = side;
                                handleRowFieldChange(
                                  previewRow.id,
                                  "propSide",
                                  side
                                );

                                const selection =
                                  buildExactPlayerPropSelection({
                                    ...previewRow,
                                    propSide: side,
                                  });

                                if (selection) {
                                  handleRowFieldChange(
                                    previewRow.id,
                                    "selection",
                                    selection
                                  );
                                }
                              }}
                              placeholder="Over, Under, Yes, No"
                              autoComplete="off"
                              style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                            />
                          </div>

                          <div>
                            <strong>Line / Threshold:</strong>
                            <input
                              key={`prop-line-${previewRow?.id || "none"}`}
                              ref={popupPropLineRef}
                              data-row-id={previewRow?.id || ""}
                              tabIndex={29}
                              defaultValue={getStructuredPlayerPropLine(
                                previewRow,
                                previewRow?.propMarket ||
                                  suggestions.propMarket ||
                                  "",
                                getStructuredPlayerPropSide(
                                  previewRow,
                                  previewRow?.propMarket ||
                                    suggestions.propMarket ||
                                    ""
                                )
                              )}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={(e) => {
                                if (!previewRow) return;

                                const line = e.currentTarget.value.trim();
                                handleRowFieldChange(
                                  previewRow.id,
                                  "propLine",
                                  line
                                );

                                const selection =
                                  buildExactPlayerPropSelection({
                                    ...previewRow,
                                    propLine: line,
                                  });

                                if (selection) {
                                  handleRowFieldChange(
                                    previewRow.id,
                                    "selection",
                                    selection
                                  );
                                }
                              }}
                              placeholder="0.5, 17.5, 4+"
                              autoComplete="off"
                              style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                            />
                          </div>
                        </>
                      )}

                      {["other", "promo_special"].includes(reviewKind) && (
                        <div>
                          <strong>{reviewKind === "promo_special" ? "Promo Market Type:" : "Market:"}</strong>
                          <input
                            key={`other-market-${previewRow?.id || "none"}-${reviewKind}`}
                            ref={popupPropMarketRef}
                            tabIndex={25}
                            defaultValue={
                              reviewKind === "promo_special"
                                ? "promo special"
                                : previewRow?.canonicalMarketContext || previewRow?.marketDetail || ""
                            }
                            onClick={(e) => e.stopPropagation()}
                            autoComplete="off"
                            onBlur={(e) => {
                              if (!previewRow) return;

                              if (reviewKind === "promo_special") {
                                e.currentTarget.value = "promo special";
                                applyRowFieldUpdates(previewRow.id, {
                                  reviewBetKind: "promo_special",
                                  betType: "straight",
                                  canonicalMarketContext: "promo special",
                                  reviewMarketType: "promo special",
                                });
                                return;
                              }

                              const rawMarket = e.currentTarget.value;
                              const gamePropMarket =
                                getGamePropMarketLabel(rawMarket) ||
                                cleanSelectionTextForReview(rawMarket).toLowerCase();

                              e.currentTarget.value = gamePropMarket;

                              applyRowFieldUpdates(previewRow.id, {
                                reviewBetKind: "other",
                                betType: "game prop",
                                canonicalMarketContext: gamePropMarket,
                                reviewMarketType: gamePropMarket,
                                propMarket: "",
                                canonicalSubject: "",
                                canonicalPlayer: "",
                                playerLastName: "",
                                playerSubjectManual: "N",
                              });

                              if (popupBetTypeRef.current) popupBetTypeRef.current.value = "game prop";
                              if (popupMarketContextRef.current) popupMarketContextRef.current.value = gamePropMarket;
                            }}
                            placeholder={reviewKind === "promo_special" ? "promo special" : "goals in first ten minutes, both teams to score..."}
                            style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                          />
                        </div>
                      )}

                      <div>
                        <strong>Exported Selection Preview:</strong>
                        {previewRow?.bonusBet === "Y" && (
                          <span
                            style={{
                              display: "inline-flex",
                              marginLeft: 8,
                              padding: "2px 8px",
                              borderRadius: 999,
                              border: "2px solid #f97316",
                              background: "#ffedd5",
                              color: "#9a3412",
                              fontSize: 12,
                              fontWeight: 950,
                            }}
                          >
                            BONUS
                          </span>
                        )}
                        <input
                          key={`selection-${previewRow?.id || "none"}`}
                          ref={popupSelectionRef}
                          data-row-id={previewRow?.id || ""}
                          tabIndex={30}
                          value={buildExactExportedSelection(previewRow)}
                          readOnly
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: "100%",
                            padding: "7px 9px",
                            border: "1px solid #93c5fd",
                            borderRadius: 6,
                            marginTop: 4,
                            background: "#f8fafc",
                            color: "#0f172a",
                            fontWeight: 850,
                          }}
                        />
                        <div style={{ fontSize: 12, marginTop: 3, color: "#475569", fontWeight: 700 }}>
                          Read-only. Edit the structured fields above; Save and Confirm use this exact preview.
                        </div>
                      </div>

                      <div>
                        <strong>Bet Type / Market:</strong>
                        <input
                          key={`market-context-${previewRow?.id || "none"}-${reviewKind}`}
                          ref={popupMarketContextRef}
                          tabIndex={29}
                          list={`market-context-options-${previewRow?.id || "none"}`}
                          defaultValue={
                            reviewKind === "main_line"
                              ? mainLineMarket
                              : reviewKind === "player_prop"
                              ? "player prop"
                              : reviewKind === "parlay"
                              ? "parlay"
                              : reviewKind === "promo_special"
                              ? "promo special"
                              : reviewKind === "other"
                              ? getGamePropMarketLabel(
                                  [
                                    previewRow?.reviewMarketType,
                                    previewRow?.canonicalMarketContext,
                                    previewRow?.marketDetail,
                                    previewRow?.selection,
                                    previewRow?.sourceText,
                                  ].filter(Boolean).join(" ")
                                ) ||
                                previewRow?.canonicalMarketContext ||
                                previewRow?.marketDetail ||
                                "game prop"
                              : inferBetTypeFromRow(previewRow || {}) ||
                                previewRow?.canonicalMarketContext ||
                                previewRow?.marketDetail ||
                                ""
                          }
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => {
                            if (!previewRow) return;
                            const rawMarketContext = e.currentTarget.value;
                            const mainLineMarket = normalizeMainLineMarket(rawMarketContext);

                            if (mainLineMarket) {
                              setMainLineMarketForCurrentRow(previewRow, mainLineMarket);
                              e.currentTarget.value = mainLineMarket;
                              return;
                            }

                            const normalizedContext = normalizeMarketContext(rawMarketContext);
                            const normalizedBetType = normalizeBetTypeValue(rawMarketContext);

                            if (normalizedContext === "promo special") {
                              applyRowFieldUpdates(previewRow.id, {
                                reviewBetKind: "promo_special",
                                betType: "straight",
                                canonicalMarketContext: "promo special",
                                reviewMarketType: "promo special",
                              });
                              e.currentTarget.value = "promo special";
                              return;
                            }

                            handleRowFieldChange(previewRow.id, "canonicalMarketContext", normalizedContext);
                            if (normalizedBetType) handleRowFieldChange(previewRow.id, "betType", normalizedBetType);
                          }}
                          placeholder="moneyline, spread, total, player prop..."
                          autoComplete="off"
                          style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                        />
                        <datalist id={`market-context-options-${previewRow?.id || "none"}`}>
                          <option value="moneyline" />
                          <option value="spread" />
                          <option value="total" />
                          <option value="player prop" />
                          <option value="game prop" />
                          <option value="parlay" />
                          <option value="promo special" />
                          <option value="futures" />
                          <option value="straight" />
                        </datalist>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="review-notes-section" style={{ display: "grid", gap: 6 }}>
                <strong>Notes:</strong>
                <textarea
                  tabIndex={90}
                  value={previewRow?.reviewNotes || ""}
                  onChange={(e) =>
                    previewRow &&
                    handleRowFieldChange(previewRow.id, "reviewNotes", e.target.value)
                  }
                  placeholder="Add parser/debug notes here"
                  style={{
                    width: "100%",
                    minHeight: 76,
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

            </div>

            <div
              ref={imageScrollRef}
              style={{
                minHeight: 0,
                height: "100%",
                maxHeight: "none",
                width: "100%",
                overflowY: previewZoomed ? "auto" : "hidden",
                overflowX: "hidden",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                background: "#111827",
                display: "flex",
                alignItems: previewZoomed ? "flex-start" : "center",
                justifyContent: "center",
                overscrollBehavior: "contain",
              }}
            >
              {hoverPreview.src ? (
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
                    width: previewZoomed ? "100%" : "auto",
                    maxWidth: "100%",
                    maxHeight: previewZoomed ? "none" : "100%",
                    height: previewZoomed ? "auto" : "auto",
                    objectFit: "contain",
                    display: "block",
                    borderRadius: 6,
                    cursor: hoverPreview.locked
                      ? previewZoomed
                        ? "zoom-out"
                        : "zoom-in"
                      : "default",
                  }}
                />
              ) : (
                <div
                  style={{
                    color: "#e5e7eb",
                    padding: 24,
                    textAlign: "center",
                    display: "grid",
                    gap: 8,
                    maxWidth: 360,
                  }}
                >
                  <strong>No screenshot attached for this row.</strong>
                  <span style={{ fontSize: 13, color: "#cbd5e1" }}>
                    Choose {previewRow?.uploadBatchFolder || previewRow?.folder || previewRow?.parentFolder || "the original staged folder"}; the app will search for this row's original filename and reattach only this screenshot.
                  </span>
                  <button
                    type="button"
                    onClick={() => previewRow && onReattachSingleScreenshot?.(previewRow.id)}
                    style={{
                      ...smallButtonStyle,
                      border: "1px solid #93c5fd",
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      fontWeight: 900,
                    }}
                  >
                    Reattach Screenshot
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ), document.body)}

      {!hoverPreview.locked && (
        <>
          <div
            style={{
              marginBottom: 10,
              padding: 9,
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              background: "#f8fafc",
            }}
          >
            {renderPerformanceTracker()}
          </div>

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

              const isCriticalReview = attentionLevel === "critical";
              const isDateConfirmReview = attentionLevel === "date-confirm";
              const isSoftReview = attentionLevel === "soft";

              const needsReview =
                isCriticalReview ||
                isDateConfirmReview ||
                isSoftReview ||
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
                  : isCriticalReview
                  ? "#ef4444"
                  : isDateConfirmReview
                  ? "#ffedd5"
                  : isSoftReview
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
                        visible: true,
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
                    : isCriticalReview
                    ? "3px solid #7f1d1d"
                    : isDateConfirmReview
                    ? "3px solid #f97316"
                    : isSoftReview
                    ? "2px solid #f0b429"
                    : "none",

                  outlineOffset: "-2px",

                  borderLeft: isSelected
                    ? "6px solid #0284c7"
                    : attentionLevel === "resolved-critical"
                    ? "6px solid #ea580c"
                    : attentionLevel === "resolved"
                    ? "6px solid #65a30d"
                    : isCriticalReview
                    ? "10px solid #7f1d1d"
                    : isDateConfirmReview
                    ? "8px solid #f97316"
                    : isSoftReview
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
        </>
      )}
    </div>
  );
}