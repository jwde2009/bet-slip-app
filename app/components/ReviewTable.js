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

import {
  TEAM_ALIASES_BY_SPORT,
  normalizeTeamNameBySport,
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
  handleRowFieldChange,
  tableMode = "debug",
  getRowAttentionLevel,
  rowNeedsReview,
  allRows = [],
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
  const popupMainLineSideRef = useRef(null);
  const popupMainLineLineRef = useRef(null);
  const popupStakeRef = useRef(null);
  const popupOddsRef = useRef(null);
  const popupPayoutRef = useRef(null);
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

  const allReviewRows = allRows?.length ? allRows : rows;
  const previewRow = allReviewRows.find((row) => row.id === hoverPreview.rowId) || null;

  useEffect(() => {
    if (!previewRow?.id) return;

    const parts = getDateParts(previewRow.betDate || "");

    setReviewDateParts({
      rowId: previewRow.id,
      month: parts.month || "",
      day: parts.day || "",
      year: parts.year || "",
    });
  }, [previewRow?.id]);

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

  function getHedgePartnerRows(row = {}) {
    if (!row?.id) return [];

    const clusterId = String(row.hedgeClusterId || "").trim();
    const partnerBookText = String(row.hedgePartnerBookmaker || "").toLowerCase();

    let partners = [];

    if (clusterId) {
      partners = allReviewRows.filter(
        (candidate) => candidate.id !== row.id && candidate.hedgeClusterId === clusterId
      );
    }

    // Fallback for older rows where the cluster ID did not persist but the partner book did.
    if (!partners.length && partnerBookText) {
      partners = allReviewRows.filter((candidate) => {
        if (!candidate || candidate.id === row.id) return false;
        const book = String(getDisplayedBookmaker(candidate) || candidate.bookmaker || "").toLowerCase();
        if (!book || !partnerBookText.includes(book)) return false;

        const sameCluster =
          candidate.likelyHedge === "Y" &&
          (
            candidate.hedgePartnerBookmaker ||
            candidate.hedgeQuality ||
            candidate.hedgeConfidence
          );

        return !!sameCluster;
      });
    }

    return partners;
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

  function ignoreCurrentHedgeMatch(row = {}) {
    if (!row?.id) return;

    const partners = getHedgePartnerRows(row);

    if (!partners.length) {
      // This is intentionally pair-specific. Do not mark the row itself as
      // "not a hedge" because it may still match a different hedge later.
      return;
    }

    const partnerIds = partners.map((partner) => partner.id).filter(Boolean);

    handleRowFieldChange(
      row.id,
      "ignoredHedgePartnerIds",
      appendUniqueIds(row.ignoredHedgePartnerIds, partnerIds)
    );

    handleRowFieldChange(row.id, "hedgeOverride", "");

    partners.forEach((partner) => {
      handleRowFieldChange(
        partner.id,
        "ignoredHedgePartnerIds",
        appendUniqueIds(partner.ignoredHedgePartnerIds, [row.id])
      );

      if (partner.hedgeOverride !== "Y") {
        handleRowFieldChange(partner.id, "hedgeOverride", "");
      }
    });
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
      .replace(/\b(?:over|under|o\/u|u\/o|yes|no|total|to record|made|player)\b/gi, " ")
      .replace(/\b\d+(?:\.\d+)?\+?\b/g, " ")
      .replace(/\b(?:points?|pts?|rebounds?|rebs?|assists?|asts?|threes?|3-?pointers?|pra|rbis?|hits?|home runs?|hrs?|strikeouts?|ks|saves?|shots on goal|sog|goals?)\b/gi, " ")
      .replace(/[^a-zA-Z.'-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function inferPlayerSubjectFromParsedText(row = {}) {
    const existing = String(row.canonicalSubject || row.canonicalPlayer || "").trim();
    if (existing) return existing;

    const sourceText = String(row.sourceText || "");
    const selection = String(row.selection || "");
    const marketDetail = String(row.marketDetail || "");

    const marketWords = "(?:points?|pts?|rebounds?|rebs?|assists?|asts?|threes?|made threes?|3-?pointers?|pra|double-double|triple-double|shots on goal|sog|saves?|goals?|strikeouts?|ks|total bases?|home runs?|hrs?|rbis?|hits?)";

    const candidates = [
      selection,
      marketDetail,
      sourceText,
    ].filter(Boolean);

    for (const candidateText of candidates) {
      const patterns = [
        new RegExp(`\\b([A-Z][A-Za-z.'-]+(?:\\s+[A-Z][A-Za-z.'-]+){0,3})\\s+(?:total\\s+)?${marketWords}\\b`, "i"),
        new RegExp(`\\b([A-Z][A-Za-z.'-]+(?:\\s+[A-Z][A-Za-z.'-]+){0,3})\\s+(?:over|under)\\s+\\d+(?:\\.\\d+)?`, "i"),
        new RegExp(`\\b([A-Z][A-Za-z.'-]+(?:\\s+[A-Z][A-Za-z.'-]+){0,3})\\s*-\\s*(?:made\\s+)?${marketWords}\\b`, "i"),
      ];

      for (const pattern of patterns) {
        const match = String(candidateText || "").match(pattern);
        const raw = cleanParsedPlayerCandidate(match?.[1] || "");

        if (raw && raw.length >= 3 && raw.split(" ").length <= 4) {
          return titleCaseParsedName(raw);
        }
      }
    }

    const fallback = cleanParsedPlayerCandidate(selection);
    if (fallback && fallback.length >= 3 && fallback.split(" ").length <= 4) {
      return titleCaseParsedName(fallback);
    }

    return "";
  }

  function isPlayerPropMarketText(value = "") {
    return /\b(points?|pts?|rebounds?|rebs?|assists?|asts?|threes?|3-?pointers?|pra|points?\s*\+\s*rebounds?|points?\s*\+\s*assists?|rebounds?\s*\+\s*assists?|shots on goal|sog|saves?|goals?|strikeouts?|ks|total bases?|home runs?|hrs?|rbis?|hits?)\b/i.test(String(value || ""));
  }

  function isMainLineMarketText(value = "") {
    return /\b(moneyline|match winner|winner|spread|run line|puck line|handicap|total|game total|team total|over\/under|o\/u)\b/i.test(String(value || ""));
  }

  function normalizeMainLineMarket(value = "") {
    const text = String(value || "").toLowerCase().replace(/\s+/g, " ").trim();

    if (!text) return "";
    if (/moneyline|match winner|winner/.test(text)) return "moneyline";
    if (/spread|run line|puck line|handicap/.test(text)) return "spread";
    if (/total|game total|team total|over\/under|o\/u/.test(text)) return "total";
    if (/[a-z].*[+-]\d+(?:\.\d+)?/.test(text) || /\b[+-]\d+(?:\.\d+)?\b/.test(text)) return "spread";

    return "";
  }

  function inferMainLineMarketFromRow(row = {}) {
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

  function getMainLineSelectionPlaceholder(market = "", side = "") {
    const cleanMarket = String(market || "").toLowerCase();
    const cleanSide = String(side || "").trim();

    if (cleanMarket === "moneyline") return cleanSide || "Selected side/team";
    if (cleanMarket === "spread") return `${cleanSide || "Team"} +3.5`;
    if (cleanMarket === "total") return "Over 8.5";

    return "Clean selection";
  }

  function inferMainLineSideAndLine(row = {}) {
    const participants = inferParticipantsFromParsedText(row);
    const explicitSide = cleanParticipantTextForMatching(row.mainLineSide || "");
    const explicitLine = String(row.mainLineLine || "").trim();

    if (explicitSide || explicitLine) {
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
      if (parsed.side || parsed.line) return parsed;
    }

    return { side: "", line: "" };
  }

  function getReviewBetKind(row = {}) {
    const explicit = String(row.reviewBetKind || "").trim();

    if (["main_line", "player_prop", "other"].includes(explicit)) return explicit;

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

  function setReviewBetKindForCurrentRow(row = {}, kind = "") {
    if (!row?.id || !kind) return;

    handleRowFieldChange(row.id, "reviewBetKind", kind);

    if (kind === "main_line") {
      const market = inferMainLineMarketFromRow(row) || "spread";
      const sideLine = inferMainLineSideAndLine(row);

      handleRowFieldChange(row.id, "betType", market);
      handleRowFieldChange(row.id, "canonicalMarketContext", market);
      handleRowFieldChange(row.id, "reviewMarketType", market);
      handleRowFieldChange(row.id, "propMarket", "");
      handleRowFieldChange(row.id, "canonicalSubject", "");
      handleRowFieldChange(row.id, "playerLastName", "");

      if (sideLine.side) handleRowFieldChange(row.id, "mainLineSide", sideLine.side);
      if (sideLine.line) handleRowFieldChange(row.id, "mainLineLine", sideLine.line);

      if (popupPropMarketRef.current) popupPropMarketRef.current.value = market;
      if (popupMarketContextRef.current) popupMarketContextRef.current.value = market;
      if (popupBetTypeRef.current) popupBetTypeRef.current.value = market;
      if (popupMainLineSideRef.current) popupMainLineSideRef.current.value = sideLine.side || "";
      if (popupMainLineLineRef.current) popupMainLineLineRef.current.value = sideLine.line || "";
      if (popupSubjectRef.current) popupSubjectRef.current.value = "";
      if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = "";
      return;
    }

    if (kind === "player_prop") {
      handleRowFieldChange(row.id, "betType", "player prop");
      handleRowFieldChange(row.id, "canonicalMarketContext", "player prop");

      if (popupMarketContextRef.current) popupMarketContextRef.current.value = "player prop";
      if (popupBetTypeRef.current) popupBetTypeRef.current.value = "player prop";
      return;
    }

    handleRowFieldChange(row.id, "betType", row.betType || "game prop");
  }

  function getSmartContextSuggestions(row = {}) {
    const participants = inferParticipantsFromParsedText(row);
    const kind = getReviewBetKind(row);

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

    const subject = inferPlayerSubjectFromParsedText(row);
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
    if (!row?.id) return;

    const { updateRefs = true, showToast = false } = options;
    const suggestions = getSmartContextSuggestions(row);
    const rowId = row.id;
    const updates = [];
    const kind = suggestions.reviewBetKind || getReviewBetKind(row);

    function applyField(field, value, ref = null) {
      if (!value) return;

      const refValue = ref?.current?.value;
      const existing = refValue !== undefined && String(refValue || "").trim()
        ? refValue
        : row[field];

      if (!valueIsBlank(existing)) return;

      updates.push([field, value]);

      if (updateRefs && ref?.current) {
        ref.current.value = value;
      }
    }

    applyField("participantA", suggestions.participantA, popupParticipantARef);
    applyField("participantANormalized", suggestions.participantANormalized);
    applyField("participantB", suggestions.participantB, popupParticipantBRef);
    applyField("participantBNormalized", suggestions.participantBNormalized);

    if (kind === "main_line") {
      const market = suggestions.mainLineMarket || "spread";

      updates.push(["reviewBetKind", "main_line"]);
      updates.push(["betType", market]);
      updates.push(["canonicalMarketContext", market]);
      updates.push(["reviewMarketType", market]);

      if (suggestions.mainLineSide) updates.push(["mainLineSide", suggestions.mainLineSide]);
      if (suggestions.mainLineLine) updates.push(["mainLineLine", suggestions.mainLineLine]);

      if (row.parsedContextAutofilled === "Y" || !row.reviewResolved) {
        updates.push(["propMarket", ""]);
        updates.push(["canonicalSubject", ""]);
        updates.push(["playerLastName", ""]);
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
      applyField("canonicalSubject", suggestions.canonicalSubject, popupSubjectRef);
      applyField("playerLastName", suggestions.playerLastName, popupPlayerLastNameRef);
      applyField("propMarket", suggestions.propMarket, popupPropMarketRef);

      const currentBetType = String(row.betType || popupBetTypeRef.current?.value || "").trim().toLowerCase();
      const canCorrectBetType =
        !currentBetType ||
        currentBetType === "straight" ||
        currentBetType === "moneyline" ||
        currentBetType === "spread" ||
        currentBetType === "total";

      if (suggestions.betType && canCorrectBetType) {
        updates.push(["betType", suggestions.betType]);

        if (updateRefs && popupBetTypeRef.current) {
          popupBetTypeRef.current.value = suggestions.betType;
        }
      }

      updates.push(["reviewBetKind", "player_prop"]);

      if (suggestions.canonicalMarketContext && valueIsBlank(row.canonicalMarketContext)) {
        updates.push(["canonicalMarketContext", suggestions.canonicalMarketContext]);

        if (updateRefs && popupMarketContextRef.current && !popupMarketContextRef.current.value) {
          popupMarketContextRef.current.value = suggestions.canonicalMarketContext;
        }
      }
    } else {
      updates.push(["reviewBetKind", "other"]);
    }

    if (!updates.length) {
      if (showToast) window.alert("No blank parsed context fields to fill.");
      return;
    }

    const seen = new Set();
    updates.forEach(([field, value]) => {
      const key = `${field}:${value}`;
      if (seen.has(key)) return;
      seen.add(key);
      handleRowFieldChange(rowId, field, value);
    });

    if (updates.length) {
      handleRowFieldChange(rowId, "parsedContextAutofilled", "Y");
    }
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

    // Safe smart-fill: only fills blank context fields from already-parsed text.
    // It does not overwrite manual edits.
    applyParsedContextSuggestions(target, { updateRefs: false });

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
      visible: !!target.sourceImageUrl,
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
          visible: !!partnerToReview.sourceImageUrl,
          locked: true,
        }));

        if (imageScrollRef.current) {
          imageScrollRef.current.scrollTop = 0;
        }
      }, 0);
    }
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

  function movePopupToRow(nextRow) {
    if (!nextRow?.id) return false;

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
        visible: !!nextRow.sourceImageUrl,
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
      setReviewActionNotice("No previous reviewed row in this review session.");
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
    movePopupToRow(previousRow);
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

    setReviewHistory((prev) => [currentRowId, ...prev.filter((id) => id !== currentRowId)].slice(0, 25));
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

  function promptForHedgeDecisionIfNeeded(row = {}) {
    if (!row?.id) return true;
    const unresolvedHedge = row.likelyHedge === "Y" && row.hedgeOverride !== "Y" && row.hedgeOverride !== "N";
    if (!unresolvedHedge) return true;

    const answer = window.prompt(
      `Possible hedge match identified.\n\nType Y if this is a valid hedge match.\nType N if this is NOT this match.\nCancel to keep reviewing.`,
      ""
    );
    if (answer === null) return false;
    const normalized = String(answer || "").trim().toLowerCase();
    if (["y", "yes"].includes(normalized)) {
      confirmHedgeCluster(row, false);
      return true;
    }
    if (["n", "no"].includes(normalized)) {
      ignoreCurrentHedgeMatch(row);
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

    const eventValue = popupFixtureRef.current?.value || row.fixtureEvent || buildContextEventLabel(row);
    if (!eventValue) {
      const next = promptRequiredReviewValue("Event", "", "Chicago Bulls @ New York Knicks");
      if (next === null) return false;
      if (popupFixtureRef.current) popupFixtureRef.current.value = next;
      handleRowFieldChange(rowId, "fixtureEvent", next);
    } else if (!row.fixtureEvent && eventValue) {
      handleRowFieldChange(rowId, "fixtureEvent", eventValue);
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
        const label = market === "total" ? "Over / Under" : "Selected Side / Team";
        const example = market === "total" ? "Over" : "Mexico";
        const next = promptRequiredReviewValue(label, "", example);
        if (next === null) return false;
        side = market === "total" ? normalizeSelectionSide(next) : cleanParticipantTextForMatching(next);
      }
      if (popupMainLineSideRef.current) popupMainLineSideRef.current.value = side;
      handleRowFieldChange(rowId, "mainLineSide", side);

      let line = cleanMainLineLineValue(popupMainLineLineRef.current?.value || row.mainLineLine || "", market);
      if (["spread", "total"].includes(market) && !line) {
        const next = promptRequiredReviewValue("Line", "", market === "spread" ? "+3.5" : "8.5");
        if (next === null) return false;
        line = cleanMainLineLineValue(next, market);
      }
      if (popupMainLineLineRef.current) popupMainLineLineRef.current.value = line;
      handleRowFieldChange(rowId, "mainLineLine", line);
    }

    if (kind === "player_prop") {
      let subject = cleanParticipantTextForMatching(popupSubjectRef.current?.value || row.canonicalSubject || row.canonicalPlayer || "");
      if (!subject) {
        const next = promptRequiredReviewValue("Player / Subject", "", "Ryan Rollins");
        if (next === null) return false;
        subject = cleanParticipantTextForMatching(next);
      }
      if (popupSubjectRef.current) popupSubjectRef.current.value = subject;
      handleRowFieldChange(rowId, "canonicalSubject", subject);

      let lastName = popupPlayerLastNameRef.current?.value || row.playerLastName || getLastNameFromText(subject);
      if (!lastName) {
        const next = promptRequiredReviewValue("Player Last Name", "", "Rollins");
        if (next === null) return false;
        lastName = next;
      }
      if (popupPlayerLastNameRef.current) popupPlayerLastNameRef.current.value = lastName;
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

      const yesNoMarket = isYesNoPlayerPropMarket(propMarket) || /\b(yes|no)\b/i.test(row.selection || row.marketDetail || "");
      const ctx = getPopupSelectionBuildContext(row);
      if (yesNoMarket && !["Yes", "No"].includes(normalizeSelectionSide(ctx.existingText))) {
        const outcome = promptForPlayerPropOutcome("", false);
        if (!outcome) return false;
        const nextSelection = cleanSelectionTextForReview(`${subject} ${outcome} ${propMarket}`);
        if (popupSelectionRef.current) popupSelectionRef.current.value = nextSelection;
        handleRowFieldChange(rowId, "selection", nextSelection);
      }
    }

    let selection = cleanSelectionTextForReview(popupSelectionRef.current?.value || row.selection || "");
    if (!selection) {
      buildBetFieldsForCurrentRow(row);
      selection = cleanSelectionTextForReview(popupSelectionRef.current?.value || row.selection || "");
    }
    if (!selection) {
      const next = promptRequiredReviewValue("Final Selection", "", kind === "player_prop" ? "Ryan Rollins Under 17.5 Points" : "Mexico +3.5");
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

    if (rowNeedsDateConfirm(row)) {
      const confirmedDate = confirmPopupDate(currentRowId);

      if (!confirmedDate) {
        setReviewActionNotice("Not confirmed yet. Enter/confirm the bet date first.");
        return;
      }
    }

    if (!promptForMissingRequiredFields(row)) {
      setReviewActionNotice("Not confirmed yet. Complete the prompted field(s) first.");
      return;
    }

    commitPopupReviewEdits(currentRowId);
    saveLastReviewedContext(row);

    handleRowFieldChange(currentRowId, "reviewResolved", "Y");
    handleRowFieldChange(currentRowId, "reviewLater", "N");

    setReviewActionNotice("Confirmed. Moving to the next visible row...");

    setTimeout(() => jumpToNextReviewRow(currentRowId), 0);
  }

function getReviewPassStatusForPopup(row = {}) {
  const status = String(row?.status || "").toLowerCase();

  if (!row?.betDate || row?.betDateNeedsConfirm === "Y") return "Date Confirm";
  if (!row?.stake || !row?.oddsUS || !row?.selection) return "Parser Issue";
  if (!row?.win && !["open", "cashed out", "voided", "void", "push"].includes(status)) return "Parser Issue";
  if (row?.likelyHedge === "Y" && row?.hedgeOverride !== "Y" && row?.hedgeOverride !== "N") return "Hedge Check";
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
    sportLeague: popupLeagueRef.current?.value || row?.sportLeague || "",
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
    canonicalSubject: popupSubjectRef.current?.value || row?.canonicalSubject || "",
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

function getPopupDateValue(row) {
  const parts = getActiveReviewDateParts(row);

  const dateFromParts = buildDateFromParts(
    parts.month,
    parts.day,
    parts.year
  );

  return dateFromParts || row?.betDate || "";
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

  const fromReadOnlyInput = popupBetDateRef.current?.value;

  if (fromReadOnlyInput) return fromReadOnlyInput;

  const fromParts = buildDateFromParts(
    popupBetMonthRef.current?.value,
    popupBetDayRef.current?.value,
    popupBetYearRef.current?.value
  );

  if (fromParts) return fromParts;

  const fromPreviewRow =
    previewRow && previewRow.id === row?.id
      ? previewRow.betDate || previewRow.eventDate || ""
      : "";

  return row?.betDate || row?.eventDate || fromPreviewRow || "";
}

function confirmPopupDate(rowId) {
  if (!rowId) return false;

  const row = rows.find((r) => r.id === rowId);
  const nextDate = getDateValueFromVisibleInputs(row);

  if (!nextDate) {
    window.alert("Enter a Bet Date before confirming. If a date is visible, click into one of the MM/DD/YYYY boxes once, then Confirm Date again.");
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

function canProceedFromPopup(row) {
  if (!row) return false;

  if (rowNeedsDateConfirm(row)) {
    window.alert("Confirm the Bet Date before moving to the next row.");
    return false;
  }

  return true;
}

function normalizePropMarketValue(value = "") {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[+&]/g, " + ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

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

  return text;
}

function inferPropMarketFromRow(row = {}) {
  const sources = [
    row.propMarket,
    row.canonicalMarketContext,
    row.marketDetail,
    row.selection,
    row.sourceText,
  ]
    .filter(Boolean)
    .join(" ");

  return normalizePropMarketValue(sources);
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
  if (/player prop|player|points|rebounds|assists|goals|shots|strikeouts|home runs|total bases/.test(text)) return "player prop";
  if (/game prop/.test(text)) return "game prop";
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

function isYesNoPlayerPropMarket(value = "") {
  const text = String(value || "").toLowerCase();

  return /double[-\s]?double|triple[-\s]?double|to record|record a|anytime|goal scorer|goalscorer|first basket|hit a home run|home run|homer|score a goal/.test(text);
}

function promptForPlayerPropOutcome(currentValue = "", allowOverUnder = true) {
  const examples = allowOverUnder ? "Over, Under, Yes, or No" : "Yes or No";
  const raw = window.prompt(`Enter player prop outcome/side: ${examples}`, currentValue || (allowOverUnder ? "Over" : "Yes"));
  return normalizeSelectionSide(raw || "");
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

  const subject = String(
    popupSubjectRef.current?.value ||
      row.canonicalSubject ||
      row.canonicalPlayer ||
      (reviewKind === "player_prop" ? inferPlayerSubjectFromParsedText(row) : "") ||
      ""
  ).trim();

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
    mainLineMarket: normalizeMainLineMarket(popupPropMarketRef.current?.value || popupMarketContextRef.current?.value || row.reviewMarketType || row.betType || row.marketDetail || ""),
    mainLineSide: popupMainLineSideRef.current?.value || row.mainLineSide || mainLine.side || "",
    mainLineLine: cleanMainLineLineValue(
      popupMainLineLineRef.current?.value || row.mainLineLine || mainLine.line || "",
      normalizeMainLineMarket(popupPropMarketRef.current?.value || popupMarketContextRef.current?.value || row.reviewMarketType || row.betType || row.marketDetail || "")
    ),
  };
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

function buildSelectionFromPopupValues(row = {}) {
  const ctx = getPopupSelectionBuildContext(row);
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
      if (!side) side = window.prompt("Enter moneyline side/team", ctx.participantA || ctx.participantB || "") || "";
      return cleanParticipantTextForMatching(side);
    }

    if (market === "spread") {
      if (!side) side = window.prompt("Enter spread side/team", ctx.participantA || ctx.participantB || "") || "";

      side = cleanParticipantTextForMatching(side);

      if (!line || !/^[+-]/.test(line)) line = promptForSelectionLine("spread line", line || "");
      if (line === null) return "";
      line = String(line || "").trim();
      if (!side || !line) return "";
      return `${side} ${line}`.replace(/\s+/g, " ").trim();
    }

    if (market === "total") {
      if (!side || !["Over", "Under"].includes(normalizeSelectionSide(side))) side = promptForSelectionSide(side || "");
      if (!line) line = promptForSelectionLine("total line", "");
      if (line === null) return "";
      line = String(line || "").trim();
      if (!side || !line) return "";
      return `${normalizeSelectionSide(side)} ${line}`.replace(/\s+/g, " ").trim();
    }
  }

  if (reviewKind === "player_prop") {
    const subject = cleanParticipantTextForMatching(ctx.subject);
    const propMarket = ctx.propMarket || normalizePropMarketValue(ctx.existingText);

    if (!subject || !propMarket) {
      window.alert("Need Player / Subject and Market before building a player prop selection.");
      return "";
    }

    let side = normalizeSelectionSide(ctx.existingText || ctx.existingSelection || "");
    const yesNoMarket = isYesNoPlayerPropMarket(propMarket) || ["Yes", "No"].includes(side);

    if (yesNoMarket) {
      if (!side || !["Yes", "No"].includes(side)) {
        side = promptForPlayerPropOutcome("", false);
      }

      if (!side || !["Yes", "No"].includes(side)) return "";

      return cleanSelectionTextForReview(`${subject} ${side} ${propMarket}`);
    }

    let line = ctx.line;
    if (!line) line = promptForSelectionLine("player prop line", "");
    if (line === null) return "";
    line = String(line || "").trim();
    if (!line) return "";

    if (/\+$/.test(line)) return cleanSelectionTextForReview(`${subject} ${line} ${propMarket}`);

    if (!side || !["Over", "Under"].includes(side)) side = promptForPlayerPropOutcome("", true);
    if (!side) return "";

    return cleanSelectionTextForReview(`${subject} ${side} ${line} ${propMarket}`);
  }

  const manual = window.prompt("Enter the cleaned selection:", ctx.existingSelection || "");
  return cleanSelectionTextForReview(manual || "");
}

function buildSelectionForCurrentRow(row = {}) {
  if (!row?.id) return;

  applyParsedContextSuggestions(row, { updateRefs: true });

  const nextSelection = buildSelectionFromPopupValues(row);
  if (!nextSelection) return;

  const ctx = getPopupSelectionBuildContext(row);
  const kind = ctx.reviewKind || getReviewBetKind(row);

  const cleanedNextSelection = cleanSelectionTextForReview(nextSelection);

  if (popupSelectionRef.current) popupSelectionRef.current.value = cleanedNextSelection;
  handleRowFieldChange(row.id, "selection", cleanedNextSelection);

  if (kind === "main_line") {
    const market = ctx.mainLineMarket || inferMainLineMarketFromRow(row) || "spread";

    handleRowFieldChange(row.id, "reviewBetKind", "main_line");
    handleRowFieldChange(row.id, "betType", market);
    handleRowFieldChange(row.id, "canonicalMarketContext", market);
    handleRowFieldChange(row.id, "reviewMarketType", market);
    handleRowFieldChange(row.id, "propMarket", "");
    handleRowFieldChange(row.id, "canonicalSubject", "");
    handleRowFieldChange(row.id, "playerLastName", "");
    handleRowFieldChange(row.id, "mainLineSide", ctx.mainLineSide || "");
    handleRowFieldChange(row.id, "mainLineLine", cleanMainLineLineValue(ctx.mainLineLine || "", market));

    if (popupBetTypeRef.current) popupBetTypeRef.current.value = market;
    if (popupMarketContextRef.current) popupMarketContextRef.current.value = market;
    if (popupPropMarketRef.current) popupPropMarketRef.current.value = market;
    return;
  }

  if (kind === "player_prop") {
    handleRowFieldChange(row.id, "reviewBetKind", "player_prop");
    handleRowFieldChange(row.id, "betType", "player prop");
    handleRowFieldChange(row.id, "canonicalMarketContext", "player prop");

    if (popupBetTypeRef.current) popupBetTypeRef.current.value = "player prop";
    if (popupMarketContextRef.current) popupMarketContextRef.current.value = "player prop";
  }
}


function buildBetFieldsForCurrentRow(row = {}) {
  if (!row?.id) return;

  const currentRowId = row.id;

  // One button does the full review-normalization pass:
  // 1. fill parsed context blanks
  // 2. apply likely major-sport league when recognized
  // 3. build the clean fixture/event
  // 4. build the clean selection from the visible mode-specific fields
  applyParsedContextSuggestions(row, { updateRefs: true });
  maybeApplyInferredLeague(row, { promptOnMismatch: false });

  const nextEventLabel = buildContextEventLabel(row);

  if (nextEventLabel) {
    if (popupFixtureRef.current) {
      popupFixtureRef.current.value = nextEventLabel;
    }

    handleRowFieldChange(currentRowId, "fixtureEvent", nextEventLabel);
  }

  buildSelectionForCurrentRow(row);
  setReviewActionNotice("Built event, market, bet type, and selection from the visible fields.");
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
    .replace(/^[\s"'“”*•·–—-]+/g, " ")
    .replace(/["'“”]+$/g, " ")
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
    .replace(/^[\s"'“”*•·–—-]+/g, "")
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
      "okc thunder": "Oklahoma City Thunder",
      "uta jazz": "Utah Jazz",
      "sac kings": "Sacramento Kings",
    },
  };

  return bySport[sport]?.[key] || common[key] || "";
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

function normalizeParticipantName(value = "", league = "") {
  const raw = cleanParticipantTextForMatching(value);
  if (!raw) return "";

  const sportKey = getAliasSportKey(league);
  const localAlias = getLocalParticipantAliasOverride(raw, sportKey);

  if (localAlias) return localAlias;

  return normalizeTeamNameBySport(raw, sportKey) || raw;
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
  const clean = normalizeAliasLookupKey(value);

  if (!clean || !sportKey) return false;

  const map = TEAM_ALIASES_BY_SPORT[String(sportKey || "").toUpperCase()] || {};

  if (map[clean]) return true;

  return Object.values(map).some(
    (canonical) => normalizeAliasLookupKey(canonical) === clean
  );
}

function inferMajorSportKeyFromValues(values = []) {
  const majorSportKeys = ["NBA", "NHL", "MLB", "NFL"];
  const scores = {};

  for (const value of values) {
    const clean = cleanParticipantTextForMatching(value);

    if (!clean) continue;

    for (const sportKey of majorSportKeys) {
      if (participantLooksLikeSport(clean, sportKey)) {
        scores[sportKey] = (scores[sportKey] || 0) + 1;
      }
    }
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (!sorted.length) return "";

  // If two sports tie, do not guess.
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return "";

  return sorted[0][0];
}

function inferLeagueFromReviewRow(row = {}) {
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

  const sportKey = inferMajorSportKeyFromValues(values);

  return getLeagueLabelFromMajorSportKey(sportKey);
}

function setLeagueForReviewRow(rowId, league = "") {
  if (!rowId || !league) return;

  if (popupLeagueRef.current) {
    popupLeagueRef.current.value = league;
  }

  handleRowFieldChange(rowId, "sportLeagueManual", "Y");
  handleRowFieldChange(rowId, "sportLeague", league);
}

function maybeApplyInferredLeague(row = {}, { promptOnMismatch = true } = {}) {
  if (!row?.id) return "";

  const inferredLeague = inferLeagueFromReviewRow(row);

  if (!inferredLeague) return "";

  const currentLeague =
    popupLeagueRef.current?.value ||
    row.sportLeague ||
    "";

  const currentKey = getMajorSportKeyFromLeague(currentLeague);
  const inferredKey = getMajorSportKeyFromLeague(inferredLeague);

  if (!currentLeague) {
    setLeagueForReviewRow(row.id, inferredLeague);
    return inferredLeague;
  }

  if (currentKey && inferredKey && currentKey !== inferredKey) {
    if (!promptOnMismatch) return currentLeague;

    const shouldChange = window.confirm(
      `League looks wrong.\n\nCurrent: ${currentLeague}\nDetected from teams: ${inferredLeague}\n\nChange league to ${inferredLeague}?`
    );

    if (shouldChange) {
      setLeagueForReviewRow(row.id, inferredLeague);
      return inferredLeague;
    }
  }

  return currentLeague;
}

function getParticipantOptionsForLeague(league = "") {
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

function getPreviewLeagueValue(row) {
  return (
    popupLeagueRef.current?.value ||
    row?.sportLeague ||
    ""
  );
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

function markPopupResult(rowId, resultValue) {
  if (!rowId) return;

  const row = rows.find((r) => r.id === rowId);
  const dateStillNeedsConfirm = rowNeedsDateConfirm(row);

  commitPopupReviewEdits(rowId);
  saveLastReviewedContext(row || { id: rowId });

  if (resultValue === "Y") {
    handleRowFieldChange(rowId, "win", "Y");
    handleRowFieldChange(rowId, "status", "Won");
  }

  if (resultValue === "N") {
    handleRowFieldChange(rowId, "win", "N");
    handleRowFieldChange(rowId, "status", "Lost");
    handleRowFieldChange(rowId, "payout", "0.00");
    handleRowFieldChange(rowId, "toWin", "0.00");
  }

  if (resultValue === "V") {
    handleRowFieldChange(rowId, "win", "");
    handleRowFieldChange(rowId, "status", "Voided");
    handleRowFieldChange(rowId, "payout", "0.00");
    handleRowFieldChange(rowId, "toWin", "0.00");
  }

  if (dateStillNeedsConfirm) {
    handleRowFieldChange(rowId, "reviewResolved", "N");
    handleRowFieldChange(rowId, "reviewLater", "Y");
    setReviewActionNotice("Result saved. Confirm the date before this row can clear review.");
    return;
  }

  handleRowFieldChange(rowId, "reviewResolved", "Y");
  handleRowFieldChange(rowId, "reviewLater", "N");

  setReviewActionNotice("Result saved. Moving to next visible row...");
  setTimeout(() => jumpToNextReviewRow(rowId), 0);
}

function commitPopupReviewEdits(rowId) {
  if (!rowId) return;

  const row = rows.find((r) => r.id === rowId);
  const leagueValue = popupLeagueRef.current?.value || row?.sportLeague || "";

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

  if (popupSubjectRef.current) {
    const rawSubject = popupSubjectRef.current.value;
    const lastName = popupPlayerLastNameRef.current?.value || getLastNameFromText(rawSubject);

    handleRowFieldChange(rowId, "canonicalSubject", rawSubject);
    handleRowFieldChange(rowId, "playerLastName", lastName);
  }

  if (popupPropMarketRef.current) {
    handleRowFieldChange(
      rowId,
      "propMarket",
      normalizePropMarketValue(popupPropMarketRef.current.value)
    );
  }

  if (popupMarketContextRef.current) {
    const rawMarketContext = popupMarketContextRef.current.value;
    const normalizedContext = normalizeMarketContext(rawMarketContext);
    const normalizedBetType = normalizeBetTypeValue(rawMarketContext);

    handleRowFieldChange(rowId, "canonicalMarketContext", normalizedContext);

    if (normalizedBetType) {
      handleRowFieldChange(rowId, "betType", normalizedBetType);
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
                        confirmHedgeCluster(previewRow, false);
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
                        ignoreCurrentHedgeMatch(previewRow);
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

      {hoverPreview.visible && hoverPreview.src && (
        <div
          onMouseDown={beginPreviewDrag}
          style={{
            position: "fixed",
            inset: 12,
            zIndex: 9999,
            pointerEvents: hoverPreview.locked ? "auto" : "none",
            background: "#fff",
            border: "1px solid #cbd5e1",
            borderRadius: 14,
            boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            padding: 8,
            width: "auto",
            maxWidth: "none",
            maxHeight: "none",
            overflow: "auto",
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
              margin-bottom: 10px;
              padding: 10px;
              border: 1px solid #bbf7d0;
              border-radius: 12px;
              background: #f0fdf4;
              box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
            }

            .review-money-card {
              min-width: 120px;
              padding: 8px 10px;
              border: 1px solid #d1fae5;
              border-radius: 10px;
              background: #ffffff;
            }

            .review-money-label {
              display: block;
              font-size: 11px;
              color: #64748b;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.04em;
            }

            .review-money-value {
              display: block;
              margin-top: 2px;
              font-size: 19px;
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
              marginBottom: 6,
              gap: 10,
              cursor: hoverPreview.locked ? "move" : "default",
              userSelect: "none",
            }}
          >
            <div style={{ fontWeight: 700 }}>
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
                  display: "grid",
                  gridTemplateColumns: "minmax(280px, 1fr) auto",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#166534", fontWeight: 900 }}>
                    Current row {getVisibleRowPosition(previewRow.id) || ""}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 16,
                      fontWeight: 900,
                      color: "#0f172a",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={previewRow.selection || ""}
                  >
                    {cleanSelectionTextForReview(popupSelectionRef.current?.value || previewRow.selection || "") || "No selection"}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 12,
                      color: "#475569",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={previewRow.fixtureEvent || ""}
                  >
                    {getDisplayedBookmaker(previewRow) || previewRow.bookmaker || "Book"} · {previewRow.sportLeague || "League"} · {previewRow.fixtureEvent || "No event"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <div className="review-money-card" style={{ minWidth: 150 }}>
                    <span className="review-money-label">League</span>
                    <input
                      value={previewRow.sportLeague || ""}
                      list={`league-options-top-${previewRow.id}`}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setLeagueForReviewRow(previewRow.id, e.target.value)}
                      onBlur={() => maybeApplyInferredLeague(previewRow, { promptOnMismatch: true })}
                      style={{
                        width: 120,
                        border: "1px solid #bbf7d0",
                        borderRadius: 6,
                        padding: "4px 6px",
                        fontSize: 18,
                        fontWeight: 950,
                        color: "#0f172a",
                      }}
                    />
                    <datalist id={`league-options-top-${previewRow.id}`}>
                      {getLeagueOptionsForRow(previewRow || {}).map((league) => (
                        <option key={league || "blank"} value={league} />
                      ))}
                    </datalist>
                  </div>

                  <div className="review-money-card">
                    <span className="review-money-label">Stake</span>
                    <input
                      ref={popupStakeRef}
                      value={previewRow.stake || ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleRowFieldChange(previewRow.id, "stake", e.target.value)}
                      style={{
                        width: 88,
                        border: "1px solid #bbf7d0",
                        borderRadius: 6,
                        padding: "4px 6px",
                        fontSize: 18,
                        fontWeight: 950,
                        color: "#0f172a",
                      }}
                    />
                  </div>

                  <div className="review-money-card">
                    <span className="review-money-label">Odds</span>
                    <input
                      ref={popupOddsRef}
                      value={previewRow.oddsUS || ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleRowFieldChange(previewRow.id, "oddsUS", e.target.value)}
                      style={{
                        width: 76,
                        border: "1px solid #bbf7d0",
                        borderRadius: 6,
                        padding: "4px 6px",
                        fontSize: 18,
                        fontWeight: 950,
                        color: "#0f172a",
                      }}
                    />
                  </div>

                  <div className="review-money-card">
                    <span className="review-money-label">Payout</span>
                    <input
                      ref={popupPayoutRef}
                      value={previewRow.payout || ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleRowFieldChange(previewRow.id, "payout", e.target.value)}
                      style={{
                        width: 92,
                        border: "1px solid #bbf7d0",
                        borderRadius: 6,
                        padding: "4px 6px",
                        fontSize: 18,
                        fontWeight: 950,
                        color: "#0f172a",
                      }}
                    />
                  </div>

                  <button
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
                    ← Back
                  </button>

                  <button
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
              gridTemplateColumns: "minmax(820px, 1fr) clamp(380px, 31vw, 540px)",
              gap: 12,
              alignItems: "start",
              minHeight: 0,
              maxHeight: "calc(100vh - 72px)",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            <div
              className="full-review-form-columns"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "flex-start",
                maxHeight: "calc(100vh - 146px)",
                overflowY: "auto",
                overflowX: "hidden",
                paddingRight: 10,
                paddingBottom: 80,
                boxSizing: "border-box",
                overscrollBehavior: "contain",
              }}
            >
              <div className="review-secondary-section">
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
              <option value="The Score">The Score</option>
              <option value="Bet365">Bet365</option>
              <option value="Circa">Circa</option>
              <option value="Kalshi">Kalshi</option>
            </select>
          </div>


          <div className="review-primary-section">
            <strong>Event:</strong>{" "}
            <input
              key={`fixture-${previewRow?.id || "none"}`}
              ref={popupFixtureRef}
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
              style={{
                marginLeft: 8,
                width: "calc(100% - 92px)",
                padding: "6px 8px",
                border: "1px solid #ccc",
                borderRadius: 6,
              }}
            />
          </div>

            <div className="review-primary-section">
              <strong>League:</strong>{" "}
              <input
                key={`league-${previewRow?.id || "none"}`}
                list={`league-options-${previewRow?.id || "none"}`}
                ref={popupLeagueRef}
                value={previewRow?.sportLeague || ""}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => previewRow && setLeagueForReviewRow(previewRow.id, e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();

                  if (e.key === "Enter" && previewRow) {
                    setLeagueForReviewRow(previewRow.id, e.currentTarget.value);
                    e.currentTarget.blur();
                  }
                }}
                onBlur={() => {
                  if (!previewRow) return;

                  maybeApplyInferredLeague(previewRow, { promptOnMismatch: true });
                }}
                placeholder="NBA, Baseball, NHL..."
                style={{
                  marginLeft: 8,
                  width: 120,
                  padding: "6px 8px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              />

              <datalist id={`league-options-${previewRow?.id || "none"}`}>
                {getLeagueOptionsForRow(previewRow || {}).map((league) => (
                  <option key={league || "blank"} value={league} />
                ))}
              </datalist>
            </div>
              <div className="review-primary-section">
                <strong>Bet Type:</strong>{" "}
                <input
                  key={`bet-type-${previewRow?.id || "none"}`}
                  ref={popupBetTypeRef}
                  list={`bet-type-options-${previewRow?.id || "none"}`}
                  defaultValue={previewRow?.betType || ""}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();

                    if (e.key === "Enter" && previewRow) {
                      handleRowFieldChange(previewRow.id, "betType", e.currentTarget.value);
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={(e) =>
                    previewRow &&
                    handleRowFieldChange(previewRow.id, "betType", e.currentTarget.value)
                  }
                  placeholder="moneyline, spread, total..."
                  style={{
                    marginLeft: 8,
                    width: 135,
                    padding: "6px 8px",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                  }}
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
              {hoverPreview.locked && previewRow && (
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
                  }}
                >
                  <strong style={{ marginRight: 4 }}>Review Pass:</strong>
                  {getFieldPill(getReviewPassStatusForPopup(previewRow), "info")}
                  {getFieldPill("Date", previewRow.betDateNeedsConfirm === "Y" || !previewRow.betDate ? "warn" : "good")}
                  {getFieldPill("Money", previewRow.stake && previewRow.oddsUS ? "good" : "bad")}
                  {getFieldPill("Result", previewRow.win || ["open", "voided", "void", "push", "cashed out"].includes(String(previewRow.status || "").toLowerCase()) ? "good" : "bad")}
                  {getFieldPill("Context", previewRow.sportLeague && (previewRow.fixtureEvent || previewRow.participantANormalized || previewRow.participantBNormalized) ? "good" : "warn")}
                  {getFieldPill("Hedge", previewRow.likelyHedge === "Y" ? "warn" : "good")}
                </div>
              )}
              {hoverPreview.locked && previewRow && previewRow.likelyHedge === "Y" && (
                <div
                  style={{
                    padding: 8,
                    border: "2px solid #7c3aed",
                    borderRadius: 12,
                    background: "#faf5ff",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 900, color: "#4c1d95" }}>
                    Possible Hedge Match
                  </div>

                  <div style={{ fontSize: 13, display: "grid", gap: 4 }}>
                    <div><strong>Quality:</strong> {previewRow.hedgeQuality || "Likely Hedge"}</div>
                    <div><strong>Partner book:</strong> {previewRow.hedgePartnerBookmaker || "—"}</div>
                    <div><strong>Profit range:</strong> {previewRow.hedgeProfitLow || "—"} → {previewRow.hedgeProfitHigh || "—"}</div>
                  </div>

                  {getHedgePartnerRows(previewRow).length > 0 ? (
                    getHedgePartnerRows(previewRow).slice(0, 3).map((partner) => (
                      <div
                        key={`partner-${partner.id}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: partner.sourceImageUrl ? "92px 1fr" : "1fr",
                          gap: 10,
                          alignItems: "start",
                          padding: 8,
                          border: "1px solid #ddd6fe",
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
                              border: "1px solid #c4b5fd",
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

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmHedgeCluster(previewRow, false);
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
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 13, color: "#6b7280" }}>
                      No matching row is currently loaded in the review table. Keep both weeks loaded for cross-week hedge review.
                    </div>
                  )}
                </div>
              )}

              {hoverPreview.locked && previewRow && (() => {
                const reviewKind = getReviewBetKind(previewRow);
                const suggestions = getSmartContextSuggestions(previewRow || {});
                const mainLineMarket = suggestions.mainLineMarket || inferMainLineMarketFromRow(previewRow) || "spread";
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
                          Pick the bet kind first. For moneyline/spread/total, Selected Side is the team/player/team-pair you bet.
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button type="button" onClick={() => setReviewBetKindForCurrentRow(previewRow, "main_line")} style={getBetKindButtonStyle("main_line", reviewKind)}>
                          Main Line
                        </button>
                        <button type="button" onClick={() => setReviewBetKindForCurrentRow(previewRow, "player_prop")} style={getBetKindButtonStyle("player_prop", reviewKind)}>
                          Player Prop
                        </button>
                        <button type="button" onClick={() => setReviewBetKindForCurrentRow(previewRow, "other")} style={getBetKindButtonStyle("other", reviewKind)}>
                          Game Prop / Other
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
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
                      <div>
                        <strong>Participant A:</strong>
                        <input
                          key={`participant-a-${previewRow?.id || "none"}`}
                          ref={popupParticipantARef}
                          tabIndex={1}
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

                      <div>
                        <strong>Participant B:</strong>
                        <input
                          key={`participant-b-${previewRow?.id || "none"}`}
                          ref={popupParticipantBRef}
                          tabIndex={2}
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
                              tabIndex={3}
                              list={`main-market-options-${previewRow?.id || "none"}`}
                              defaultValue={mainLineMarket}
                              onClick={(e) => e.stopPropagation()}
                              autoComplete="off"
                              onBlur={(e) => {
                                if (!previewRow) return;
                                const market = normalizeMainLineMarket(e.currentTarget.value) || e.currentTarget.value || "spread";
                                handleRowFieldChange(previewRow.id, "reviewBetKind", "main_line");
                                handleRowFieldChange(previewRow.id, "reviewMarketType", market);
                                handleRowFieldChange(previewRow.id, "canonicalMarketContext", market);
                                handleRowFieldChange(previewRow.id, "betType", market);
                                handleRowFieldChange(previewRow.id, "propMarket", "");
                                if (popupMarketContextRef.current) popupMarketContextRef.current.value = market;
                                if (popupBetTypeRef.current) popupBetTypeRef.current.value = market;
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
                              tabIndex={4}
                              defaultValue={cleanMainLineSide}
                              onClick={(e) => e.stopPropagation()}
                              autoComplete="off"
                              onBlur={(e) => {
                                if (!previewRow) return;

                                const cleanedSide = cleanParticipantTextForMatching(e.currentTarget.value);

                                e.currentTarget.value = cleanedSide;
                                handleRowFieldChange(previewRow.id, "mainLineSide", cleanedSide);
                              }}
                              placeholder={mainLineMarket === "total" ? "Over or Under" : "Andreozzi / Guinard, Mexico, Celtics..."}
                              style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                            />
                            <div style={{ fontSize: 12, marginTop: 3, color: "#1d4ed8", fontWeight: 700 }}>
                              This is the side you bet. For moneyline, this becomes the selection.
                            </div>
                          </div>

                          <div>
                            <strong>{mainLineMarket === "moneyline" ? "Line: not used" : "Line:"}</strong>
                            <input
                              key={`main-line-${previewRow?.id || "none"}`}
                              ref={popupMainLineLineRef}
                              tabIndex={5}
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
                              placeholder={mainLineMarket === "moneyline" ? "leave blank" : "+3.5 or 8.5"}
                              style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                            />
                          </div>
                        </>
                      )}

                      {reviewKind === "player_prop" && (
                        <>
                          <div>
                            <strong>Player / Subject:</strong>
                            <input
                              key={`subject-${previewRow?.id || "none"}`}
                              ref={popupSubjectRef}
                              tabIndex={3}
                              defaultValue={previewRow?.canonicalSubject || previewRow?.canonicalPlayer || suggestions.canonicalSubject || ""}
                              onClick={(e) => e.stopPropagation()}
                              autoComplete="off"
                              onBlur={(e) => {
                                if (!previewRow) return;
                                const rawSubject = e.currentTarget.value;
                                const inferredLastName = getLastNameFromText(rawSubject);
                                const lastName = popupPlayerLastNameRef.current?.value || inferredLastName;
                                handleRowFieldChange(previewRow.id, "canonicalSubject", rawSubject);
                                handleRowFieldChange(previewRow.id, "playerLastName", lastName);
                                handleRowFieldChange(previewRow.id, "reviewBetKind", "player_prop");
                                handleRowFieldChange(previewRow.id, "betType", "player prop");
                                if (popupPlayerLastNameRef.current && !popupPlayerLastNameRef.current.value) popupPlayerLastNameRef.current.value = inferredLastName;
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
                              tabIndex={4}
                              defaultValue={previewRow?.playerLastName || getLastNameFromText(previewRow?.canonicalSubject || previewRow?.canonicalPlayer || "") || suggestions.playerLastName || ""}
                              onClick={(e) => e.stopPropagation()}
                              autoComplete="off"
                              onBlur={(e) => previewRow && handleRowFieldChange(previewRow.id, "playerLastName", e.currentTarget.value)}
                              placeholder="Rollins"
                              style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                            />
                          </div>

                          <div>
                            <strong>Prop Market:</strong>
                            <input
                              key={`prop-market-${previewRow?.id || "none"}`}
                              ref={popupPropMarketRef}
                              tabIndex={5}
                              list={`prop-market-options-${previewRow?.id || "none"}`}
                              defaultValue={previewRow?.propMarket || suggestions.propMarket || ""}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={(e) => {
                                if (!previewRow) return;
                                const normalizedPropMarket = normalizePropMarketValue(e.currentTarget.value);
                                handleRowFieldChange(previewRow.id, "reviewBetKind", "player_prop");
                                handleRowFieldChange(previewRow.id, "propMarket", normalizedPropMarket);
                                handleRowFieldChange(previewRow.id, "betType", "player prop");
                                handleRowFieldChange(previewRow.id, "canonicalMarketContext", "player prop");
                                if (popupBetTypeRef.current) popupBetTypeRef.current.value = "player prop";
                                if (popupMarketContextRef.current) popupMarketContextRef.current.value = "player prop";
                                e.currentTarget.value = normalizedPropMarket;
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
                              <option value="threes" />
                              <option value="goals" />
                              <option value="shots on goal" />
                              <option value="saves" />
                              <option value="strikeouts" />
                              <option value="total bases" />
                              <option value="home runs" />
                              <option value="rbis" />
                              <option value="hits" />
                            </datalist>
                          </div>
                        </>
                      )}

                      {reviewKind === "other" && (
                        <div>
                          <strong>Market:</strong>
                          <input
                            key={`other-market-${previewRow?.id || "none"}`}
                            ref={popupPropMarketRef}
                            tabIndex={3}
                            defaultValue={previewRow?.canonicalMarketContext || previewRow?.marketDetail || ""}
                            onClick={(e) => e.stopPropagation()}
                            autoComplete="off"
                            onBlur={(e) => {
                              if (!previewRow) return;
                              handleRowFieldChange(previewRow.id, "reviewBetKind", "other");
                              handleRowFieldChange(previewRow.id, "canonicalMarketContext", e.currentTarget.value);
                            }}
                            placeholder="first basket, game prop, future..."
                            style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                          />
                        </div>
                      )}

                      <div>
                        <strong>Final Selection:</strong>
                        <input
                          key={`selection-${previewRow?.id || "none"}`}
                          ref={popupSelectionRef}
                          tabIndex={7}
                          value={previewRow?.selection || ""}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            previewRow &&
                            handleRowFieldChange(previewRow.id, "selection", e.target.value)
                          }
                          onBlur={(e) => {
                            if (!previewRow) return;

                            const cleanedSelection = cleanSelectionTextForReview(e.currentTarget.value);
                            e.currentTarget.value = cleanedSelection;
                            handleRowFieldChange(previewRow.id, "selection", cleanedSelection);
                          }}
                          placeholder={
                            reviewKind === "main_line"
                              ? getMainLineSelectionPlaceholder(mainLineMarket, cleanMainLineSide)
                              : reviewKind === "player_prop"
                              ? "Ryan Rollins Under 17.5 Points"
                              : "Clean selection"
                          }
                          style={{ width: "100%", padding: "7px 9px", border: "1px solid #93c5fd", borderRadius: 6, marginTop: 4 }}
                        />
                        <div style={{ fontSize: 12, marginTop: 3, color: "#475569", fontWeight: 700 }}>
                          This is the exported bet selection. For moneyline it should match Selected Side / Team.
                        </div>
                      </div>

                      <div>
                        <strong>Bet Type / Market:</strong>
                        <input
                          key={`market-context-${previewRow?.id || "none"}-${reviewKind}`}
                          ref={popupMarketContextRef}
                          tabIndex={8}
                          list={`market-context-options-${previewRow?.id || "none"}`}
                          defaultValue={reviewKind === "main_line" ? mainLineMarket : reviewKind === "player_prop" ? "player prop" : (inferBetTypeFromRow(previewRow || {}) || previewRow?.canonicalMarketContext || previewRow?.marketDetail || "")}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => {
                            if (!previewRow) return;
                            const rawMarketContext = e.currentTarget.value;
                            const normalizedContext = normalizeMarketContext(rawMarketContext);
                            const normalizedBetType = normalizeBetTypeValue(rawMarketContext);
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
                          <option value="futures" />
                          <option value="straight" />
                        </datalist>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="review-money-date-section">

              <div
                style={{
                  padding: 8,
                  border: rowNeedsDateConfirm(previewRow) ? "3px solid #b45309" : "1px solid #d1d5db",
                  borderRadius: 10,
                  background: rowNeedsDateConfirm(previewRow) ? "#fef3c7" : "#f9fafb",
                }}
              >
                <strong>Bet Date:</strong>{" "}

                {rowNeedsDateConfirm(previewRow) && (
                  <div style={{ marginTop: 4, marginBottom: 8, fontWeight: 900, color: "#92400e" }}>
                    ⚠ Date needs confirmation before continuing.
                  </div>
                )}

                <input
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
                  style={{
                    marginLeft: 8,
                    width: 42,
                    padding: "6px 8px",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                  }}
                />

                <input
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
                  style={{
                    marginLeft: 4,
                    width: 42,
                    padding: "6px 8px",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                  }}
                />

                <input
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
                  style={{
                    marginLeft: 4,
                    width: 62,
                    padding: "6px 8px",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                  }}
                />

                <input
                  ref={popupBetDateRef}
                  value={getPopupDateValue(previewRow)}
                  readOnly
                  placeholder="MM/DD/YYYY"
                  style={{
                    marginLeft: 8,
                    width: 112,
                    padding: "6px 8px",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                    background: "#f9fafb",
                  }}
                />

                <button
                  type="button"
                  onClick={() => previewRow && usePreviousBetDateForRow(previewRow.id)}
                  style={{ ...smallButtonStyle, marginLeft: 8 }}
                >
                  Use Prev Date
                </button>

                <button
                  type="button"
                  onClick={() => previewRow && shiftBetDateForRow(previewRow.id, -1)}
                  style={{ ...smallButtonStyle, marginLeft: 6 }}
                >
                  -1 Day
                </button>

                <button
                  type="button"
                  onClick={() => previewRow && shiftBetDateForRow(previewRow.id, 1)}
                  style={{ ...smallButtonStyle, marginLeft: 6 }}
                >
                  +1 Day
                </button>

                <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>
                  Prev: {previewRow ? getPreviousRowDate(previewRow.id) || "—" : "—"}
                </span>

                <button
                  type="button"
                  onClick={() => previewRow && confirmPopupDate(previewRow.id)}
                  style={{
                    ...smallButtonStyle,
                    marginLeft: 8,
                    fontWeight: 900,
                    border: "1px solid #166534",
                    background: "#dcfce7",
                    color: "#14532d",
                  }}
                >
                  Confirm Date
                </button>
              </div>

                <strong>Stake:</strong>{" "}
                <input
                  ref={popupStakeRef}
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
                  ref={popupOddsRef}
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
                  ref={popupPayoutRef}
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

              {hoverPreview.locked && previewRow && (
                <div
                  style={{
                    ...getParsedResultStyle(previewRow),
                    padding: 8,
                    borderRadius: 10,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 800 }}>
                    PARSED RESULT
                  </div>

                  <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 1 }}>
                    {getParsedResultLabel(previewRow)}
                  </div>

                  <div style={{ fontSize: 13, display: "grid", gap: 3 }}>
                    <div>
                      <strong>Status:</strong> {previewRow.status || "—"}
                    </div>

                    <div>
                      <strong>Bonus Bet:</strong>{" "}
                      {previewRow.bonusBet === "Y" ? "Yes" : "No"}
                    </div>

                    <div>
                      <strong>Stake / Odds / Payout:</strong>{" "}
                      <span style={{ fontSize: 16, fontWeight: 900 }}>
                        {formatMoneyForReview(previewRow.stake)} / {previewRow.oddsUS || "—"} / {formatMoneyForReview(previewRow.payout)}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => confirmAndAdvanceFromPopup(previewRow)}
                      style={{
                        ...smallButtonStyle,
                        fontWeight: 800,
                        border: "1px solid #166534",
                        background: "#dcfce7",
                        color: "#14532d",
                      }}
                    >
                      Confirm + Next
                    </button>

                    <button
                      type="button"
                      onClick={() => markPopupResult(previewRow.id, "Y")}
                      style={smallButtonStyle}
                    >
                      Correct: Win
                    </button>

                    <button
                      type="button"
                      onClick={() => markPopupResult(previewRow.id, "N")}
                      style={smallButtonStyle}
                    >
                      Correct: Loss
                    </button>

                    <button
                      type="button"
                      onClick={() => markPopupResult(previewRow.id, "V")}
                      style={smallButtonStyle}
                    >
                      Correct: Void
                    </button>
                  </div>
                </div>
              )}
              <div className="review-notes-section" style={{ display: "grid", gap: 6 }}>
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
                <>
                  
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                <button
                  onClick={() => {
                    const currentRowId = previewRow.id;

                    if (!canProceedFromPopup(previewRow)) return;

                    commitPopupReviewEdits(currentRowId);
                    setTimeout(() => jumpToNextReviewRow(currentRowId), 0);
                  }}
                  style={smallButtonStyle}
                >
                  Next / No Change
                </button>


                <button
                  onClick={() => {
                    const currentRowId = previewRow.id;

                    if (!canProceedFromPopup(previewRow)) return;

                    commitPopupReviewEdits(currentRowId);

                    handleRowFieldChange(
                      currentRowId,
                      "reviewLater",
                      previewRow.reviewLater === "Y" ? "N" : "Y"
                    );

                    handleRowFieldChange(currentRowId, "reviewResolved", "N");

                    setTimeout(() => {
                      jumpToNextReviewRow(currentRowId);
                    }, 0);
                  }}
                  style={smallButtonStyle}
                >
                  Later + Next
                </button>

                <button
                  onClick={() =>
                    handleRowFieldChange(
                      previewRow.id,
                      "bonusBet",
                      previewRow.bonusBet === "Y" ? "N" : "Y"
                    )
                  }
                  style={smallButtonStyle}
                >
                  Toggle Bonus
                </button>

                <button
                  onClick={() => autoFillCalculatedFields(previewRow)}
                  style={smallButtonStyle}
                >
                  Auto Fill Money
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
                </>
              )}
            </div>

            <div
              ref={imageScrollRef}
              style={{
                height: "calc(100vh - 146px)",
                maxHeight: "calc(100vh - 146px)",
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
            </div>
          </div>
        </div>
      )}

      <h3 style={{ color: "#000" }}>Review Queue</h3>

      <div
        style={{
          overflowX: "auto",
        overflowY: "auto",
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
    </div>
  );
}
