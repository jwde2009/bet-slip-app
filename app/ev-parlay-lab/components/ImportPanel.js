"use client";

import { useState } from "react";

const SPORTSBOOK_OPTIONS = [
  "Auto",
  "DraftKings",
  "FanDuel",
  "BetMGM",
  "Caesars",
  "Pinnacle",
  "BetOnline",
  "TheScore",
  "Manual",
];

export default function ImportPanel({
  rawText,
  setRawText,
  sportsbook,
  setSportsbook,
  batchRole,
  setBatchRole,
  onParse,
  onClearInput,
  onClearParsedRows,
  hasRows,
  lastParsedAt,
  pendingImports = [],
  pendingUrlImport = null,
  onLoadNewestImport,
  onClearPendingImports,
  onClearSavedSession,
  importMode = "append",
  setImportMode,
  defaultCollapsed = true,
  ladderHelperEvents = [],
}) {
  const safeLadderEvents = Array.isArray(ladderHelperEvents) ? ladderHelperEvents : [];
  const defaultBetMgmLadderEvent = safeLadderEvents[0]?.eventName || "";
  const [betMgmLadderEvent, setBetMgmLadderEvent] = useState("");
  const [betMgmThresholds, setBetMgmThresholds] = useState({
    player_points: "",
    player_assists: "",
    player_rebounds: "",
    player_threes: "",
  });
  const [betMgmComboLines, setBetMgmComboLines] = useState([
    { marketType: "player_pra", threshold: "" },
  ]);

  const resolvedBetMgmLadderEvent = betMgmLadderEvent || defaultBetMgmLadderEvent;

  function updateBetMgmThreshold(marketType, threshold) {
    setBetMgmThresholds((prev) => ({
      ...prev,
      [marketType]: threshold,
    }));
  }

  function updateBetMgmComboLine(index, patch) {
    setBetMgmComboLines((prev) =>
      prev.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line
      )
    );
  }

  function addBetMgmComboLine() {
    setBetMgmComboLines((prev) => [
      ...prev,
      { marketType: "player_points_rebounds", threshold: "" },
    ]);
  }

  function buildBetMgmThresholdConfigLines() {
    const event = String(resolvedBetMgmLadderEvent || "").trim();

    if (!event) {
      window.alert("Choose an event before adding BetMGM thresholds.");
      return [];
    }

    const configRows = [];

    for (const market of BETMGM_PRIMARY_LADDER_MARKETS) {
      const threshold = String(betMgmThresholds[market.marketType] || "").trim();
      if (!threshold) continue;

      configRows.push(
        `sport=WNBA | event=${event} | market=${market.marketType} | threshold=${threshold}`
      );
    }

    for (const comboLine of betMgmComboLines) {
      const marketType = String(comboLine.marketType || "").trim();
      const threshold = String(comboLine.threshold || "").trim();

      if (!marketType || !threshold) continue;

      configRows.push(
        `sport=WNBA | event=${event} | market=${marketType} | threshold=${threshold}`
      );
    }

    if (!configRows.length) {
      window.alert("Choose at least one threshold before adding BetMGM thresholds.");
      return [];
    }

    return [
      "BETMGM_LADDER_THRESHOLDS_START",
      ...configRows,
      "BETMGM_LADDER_THRESHOLDS_END",
    ];
  }

  function insertBetMgmLadderThresholdConfig() {
    const configLines = buildBetMgmThresholdConfigLines();
    if (!configLines.length) return;

    const current = String(rawText || "");
    const withoutOldConfig = current
      .replace(/\n?BETMGM_LADDER_THRESHOLDS_START[\s\S]*?BETMGM_LADDER_THRESHOLDS_END\n?/gi, "\n")
      .trim();

    const nextText = withoutOldConfig
      ? `${configLines.join("\n")}\n\n${withoutOldConfig}`
      : `${configLines.join("\n")}\n`;

    setRawText(nextText);
  }

  return (
    <details style={sectionStyle}>
      <summary style={summaryStyle}>
        <span>1. Import Odds</span>
        <span style={summaryMetaStyle}>
          {pendingImports.length ? `${pendingImports.length} pending import${pendingImports.length === 1 ? "" : "s"}` : "Collapsed by default"}
        </span>
      </summary>

      <p style={mutedStyle}>
        Paste extracted odds text here and choose the source book. Extension imports can be loaded from the pending-import tools at the bottom of this box.
      </p>

      {/^bet\s*online$/i.test(String(sportsbook || "").trim()) && (
        <p style={mutedStyle}>
          BetOnline defaults to a sharp source. MLB strikeouts, outs recorded,
          hits+runs+RBIs and home-run Yes/No props can be parsed when both prices
          are included. Main lines are not supported yet. Imports pause for review.
        </p>
      )}

      <div style={controlsRowStyle}>
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>Sportsbook</span>
          <select
            value={sportsbook}
            onChange={(e) => {
              const nextBook = e.target.value;
              setSportsbook(nextBook);

              if (nextBook === "Pinnacle" || nextBook === "BetOnline") {
                setBatchRole("fair_odds");
              } else if (nextBook !== "Auto") {
                setBatchRole("target");
              }
            }}
            style={inputStyle}
          >
            {SPORTSBOOK_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>Batch Role</span>
          <select
            value={batchRole}
            onChange={(e) => setBatchRole(e.target.value)}
            style={inputStyle}
          >
            <option value="target">Target book</option>
            <option value="fair_odds">Fair odds / sharp source</option>
          </select>
        </label>
      </div>

      <div style={soccerImportReminderStyle}>
        <div style={soccerImportReminderTitleStyle}>Soccer parlay import reminder</div>
        <div style={soccerImportReminderTextStyle}>
          Target full-time / Regular Time only. For BetMGM, manually open <strong>All</strong> or <strong>Totals</strong>, click <strong>Show More</strong> when available, then run the extension.
        </div>
        <div style={soccerImportReminderTextStyle}>
          Prioritize: <strong>3-Way Moneyline / Match Result</strong>, <strong>Total Goals</strong>, <strong>Both Teams To Score</strong>, <strong>Double Chance</strong>, and <strong>Total Corners</strong>.
        </div>
        <div style={soccerImportReminderSkipStyle}>
          Skip for now: 1st half / 2nd half, 00:00-15:00, team totals, team shots, player props, goalscorers, correct score, goal bands, and combo markets like BTTS + total goals.
        </div>
      </div>

      <div style={betMgmLadderHelperStyle}>
        <div style={betMgmLadderTitleStyle}>BetMGM WNBA Ladder Threshold Helper</div>
        <div style={betMgmLadderSubtleStyle}>
          Use this when BetMGM shows ladder-only WNBA props. Pick the event and active thresholds, then add the config to the top of the raw input before parsing.
        </div>

        <div style={betMgmLadderGridStyle}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Event</span>
            <select
              value={resolvedBetMgmLadderEvent}
              onChange={(event) => setBetMgmLadderEvent(event.target.value)}
              style={inputStyle}
            >
              {safeLadderEvents.length ? (
                safeLadderEvents.map((eventOption) => (
                  <option key={eventOption.eventName} value={eventOption.eventName}>
                    {eventOption.eventName}
                  </option>
                ))
              ) : (
                <option value="">Load FanDuel/Pinnacle/BetMGM main lines first</option>
              )}
            </select>
          </label>

          {BETMGM_PRIMARY_LADDER_MARKETS.map((market) => (
            <label key={market.marketType} style={fieldStyle}>
              <span style={fieldLabelStyle}>{market.label}</span>
              <select
                value={betMgmThresholds[market.marketType] || ""}
                onChange={(event) => updateBetMgmThreshold(market.marketType, event.target.value)}
                style={inputStyle}
              >
                <option value="">Skip</option>
                {BETMGM_LADDER_THRESHOLD_OPTIONS.map((threshold) => (
                  <option key={`${market.marketType}_${threshold}`} value={threshold}>
                    {threshold}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div style={comboHelperStyle}>
          <div style={comboHelperTitleStyle}>Combos</div>

          {betMgmComboLines.map((comboLine, index) => (
            <div key={`betmgm_combo_${index}`} style={comboLineStyle}>
              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>Combo market</span>
                <select
                  value={comboLine.marketType}
                  onChange={(event) => updateBetMgmComboLine(index, { marketType: event.target.value })}
                  style={inputStyle}
                >
                  {BETMGM_COMBO_LADDER_MARKETS.map((market) => (
                    <option key={market.marketType} value={market.marketType}>
                      {market.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>Value</span>
                <select
                  value={comboLine.threshold}
                  onChange={(event) => updateBetMgmComboLine(index, { threshold: event.target.value })}
                  style={inputStyle}
                >
                  <option value="">Skip</option>
                  {BETMGM_LADDER_THRESHOLD_OPTIONS.map((threshold) => (
                    <option key={`combo_${index}_${threshold}`} value={threshold}>
                      {threshold}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}

          <div style={betMgmLadderButtonRowStyle}>
            <button type="button" onClick={addBetMgmComboLine} style={secondaryButtonStyle}>
              Add another combo line
            </button>

            <button type="button" onClick={insertBetMgmLadderThresholdConfig} style={primaryActionButtonStyle}>
              Add thresholds
            </button>
          </div>
        </div>
      </div>

      <textarea
        value={rawText || ""}
        onChange={(e) => setRawText(e.target.value)}
        style={textareaStyle}
        placeholder="Paste odds text here..."
        spellCheck={false}
      />

      <div style={{ marginTop: 8, fontSize: 12, color: "#166534", fontWeight: 700 }}>
        Input chars: {(rawText || "").length}
      </div>

      <div style={actionRowStyle}>
        <button type="button" onClick={onParse} style={primaryButtonStyle}>
          Parse Input
        </button>

        <button type="button" onClick={onClearInput} style={secondaryButtonStyle}>
          Clear Input
        </button>

        <button
          type="button"
          onClick={onClearParsedRows}
          style={{
            ...dangerButtonStyle,
            ...(hasRows ? {} : disabledButtonStyle),
          }}
          disabled={!hasRows}
        >
          Clear Parsed Rows
        </button>

        <span style={mutedStyle}>
          {lastParsedAt ? `Last parsed: ${new Date(lastParsedAt).toLocaleString()}` : "Not parsed yet"}
        </span>
      </div>

      {pendingUrlImport ? (
        <div style={importNoticeStyle}>
          Imported scraped text from URL. Review or click Parse.
        </div>
      ) : null}

      <div style={pendingPanelStyle}>
        <div style={pendingTitleStyle}>Pending scraped imports: {pendingImports.length}</div>

        <div style={pendingActionRowStyle}>
          <button
            type="button"
            onClick={() => onLoadNewestImport?.({ append: false })}
            style={primaryButtonStyle}
          >
            Load newest import
          </button>

          <button
            type="button"
            onClick={() => onLoadNewestImport?.({ append: true })}
            style={secondaryButtonStyle}
          >
            Append newest import
          </button>

          <label style={inlineFieldStyle}>
            Import Mode
            <select
              value={importMode}
              onChange={(event) => setImportMode?.(event.target.value)}
              style={inputStyle}
            >
              <option value="append">Append / dedupe</option>
              <option value="replace_book">Replace this book</option>
              <option value="replace_book_event">Replace this book + event</option>
            </select>
          </label>

          <button type="button" onClick={onClearPendingImports} style={dangerButtonStyle}>
            Clear pending imports
          </button>

          <button type="button" onClick={onClearSavedSession} style={warningButtonStyle}>
            Clear saved session
          </button>
        </div>
      </div>
    </details>
  );
}

const BETMGM_PRIMARY_LADDER_MARKETS = [
  { marketType: "player_points", label: "Points" },
  { marketType: "player_assists", label: "Assists" },
  { marketType: "player_rebounds", label: "Rebounds" },
  { marketType: "player_threes", label: "3-Pointers" },
];

const BETMGM_COMBO_LADDER_MARKETS = [
  { marketType: "player_pra", label: "Points + Rebounds + Assists" },
  { marketType: "player_points_rebounds", label: "Points + Rebounds" },
  { marketType: "player_points_assists", label: "Points + Assists" },
  { marketType: "player_rebounds_assists", label: "Rebounds + Assists" },
];

const BETMGM_LADDER_THRESHOLD_OPTIONS = Array.from({ length: 40 }, (_, index) => `${index + 1}+`);

const sectionStyle = {
  background: "#f0fdf4",
  border: "2px solid #166534",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};

const summaryStyle = {
  cursor: "pointer",
  fontWeight: 900,
  color: "#14532d",
  fontSize: 20,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const summaryMetaStyle = {
  fontSize: 12,
  fontWeight: 800,
  color: "#166534",
  background: "#dcfce7",
  border: "1px solid #86efac",
  borderRadius: 999,
  padding: "4px 9px",
};

const mutedStyle = {
  color: "#166534",
  fontSize: 14,
};

const controlsRowStyle = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const fieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 220,
};

const fieldLabelStyle = {
  fontSize: 12,
  fontWeight: 800,
  color: "#166534",
  textTransform: "uppercase",
};

const inlineFieldStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 900,
  color: "#166534",
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #86efac",
  background: "#fff",
  color: "#14532d",
  fontWeight: 700,
};

const textareaStyle = {
  width: "100%",
  minHeight: 220,
  padding: 12,
  borderRadius: 8,
  border: "1px solid #86efac",
  fontFamily: "monospace",
  fontSize: 14,
  resize: "vertical",
  background: "#fff",
  color: "#111",
};

const actionRowStyle = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginTop: 12,
};

const baseButtonStyle = {
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const primaryButtonStyle = {
  ...baseButtonStyle,
  background: "#166534",
  color: "#f0fdf4",
};

const secondaryButtonStyle = {
  ...baseButtonStyle,
  background: "#dcfce7",
  color: "#14532d",
  border: "1px solid #86efac",
};

const dangerButtonStyle = {
  ...baseButtonStyle,
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
};

const warningButtonStyle = {
  ...baseButtonStyle,
  background: "#fff7ed",
  color: "#7c2d12",
  border: "1px solid #fdba74",
};

const disabledButtonStyle = {
  opacity: 0.45,
  cursor: "not-allowed",
};

const importNoticeStyle = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  background: "#ecfdf5",
  border: "1px solid #86efac",
  color: "#166534",
  fontWeight: 700,
};

const pendingPanelStyle = {
  marginTop: 14,
  padding: 12,
  borderRadius: 10,
  background: "#ecfdf5",
  border: "1px solid #86efac",
};

const pendingTitleStyle = {
  fontWeight: 900,
  color: "#166534",
  marginBottom: 8,
};

const pendingActionRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const soccerImportReminderStyle = {
  marginTop: 12,
  marginBottom: 12,
  padding: 12,
  borderRadius: 10,
  background: "#eff6ff",
  border: "1px solid #93c5fd",
};

const soccerImportReminderTitleStyle = {
  fontWeight: 900,
  color: "#1d4ed8",
  marginBottom: 6,
};

const soccerImportReminderTextStyle = {
  fontSize: 12,
  color: "#1e3a8a",
  fontWeight: 700,
  lineHeight: 1.45,
  marginBottom: 6,
};

const soccerImportReminderSkipStyle = {
  fontSize: 12,
  color: "#475569",
  fontWeight: 700,
  lineHeight: 1.45,
};

const betMgmLadderHelperStyle = {
  marginTop: 12,
  marginBottom: 12,
  padding: 12,
  borderRadius: 10,
  background: "#fff7ed",
  border: "1px solid #fdba74",
};

const betMgmLadderTitleStyle = {
  fontWeight: 900,
  color: "#7c2d12",
  marginBottom: 4,
};

const betMgmLadderSubtleStyle = {
  fontSize: 12,
  color: "#9a3412",
  fontWeight: 700,
  marginBottom: 10,
};

const betMgmLadderGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
  alignItems: "end",
};

const comboHelperStyle = {
  marginTop: 12,
  display: "grid",
  gap: 10,
};

const comboHelperTitleStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: "#7c2d12",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const comboLineStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

const betMgmLadderButtonRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const primaryActionButtonStyle = {
  ...secondaryButtonStyle,
  background: "#7c2d12",
  borderColor: "#7c2d12",
  color: "white",
};
