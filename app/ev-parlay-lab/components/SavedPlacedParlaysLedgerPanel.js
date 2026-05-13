"use client";

import { useMemo, useState } from "react";

function todayLocalDateInput() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function makeDefaultManualParlayDraft() {
  return {
    name: "Manual Placed Parlay",
    bookmaker: "DraftKings",
    sport: "NBA",
    placedStake: "",
    placedOddsAmerican: "",
    placedDate: todayLocalDateInput(),
    boostName: "",
    boostPct: "",
    notes: "",
    legsText:
      "Event | Market | Player/Team | Side | Line | Odds\n" +
      "Pistons @ Cavaliers | Points | Cade Cunningham | Over | 24.5 | -110",
  };
}

export default function SavedPlacedParlaysLedgerPanel({
  savedPlacedParlays = [],
  savedLegUsageMap,
  onClearSavedParlays,
  onAddManualPlacedParlay,
  onDeleteSavedParlay,
  onUpdateSavedParlay,
  onConfirmSavedParlayPlaced,
  onSetSavedParlayResult,
  formatSavedDateTime,
}) {
  const [savedCollapsed, setSavedCollapsed] = useState(true);
  const [performanceCollapsed, setPerformanceCollapsed] = useState(true);
  const [manualCollapsed, setManualCollapsed] = useState(true);
  const [dangerCollapsed, setDangerCollapsed] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [manualDraft, setManualDraft] = useState(() => makeDefaultManualParlayDraft());

  const visibleParlays = useMemo(() => {
    const all = Array.isArray(savedPlacedParlays) ? savedPlacedParlays : [];

    if (showArchived) return all;

    return all.filter((parlay) => !isArchivedParlay(parlay));
  }, [savedPlacedParlays, showArchived]);

  const archivedCount = useMemo(
    () => (savedPlacedParlays || []).filter(isArchivedParlay).length,
    [savedPlacedParlays]
  );

  const stats = useMemo(
    () => buildLedgerStats(visibleParlays),
    [visibleParlays]
  );

  function updateManualDraft(key, value) {
    setManualDraft((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function submitManualParlay() {
    onAddManualPlacedParlay?.(manualDraft);
    setManualDraft(makeDefaultManualParlayDraft());
    setSavedCollapsed(false);
  }

  function patchParlay(parlayId, patch = {}) {
    onUpdateSavedParlay?.(parlayId, patch);
  }

  function patchLeg(saved, legIndex, patch = {}) {
    const nextLegs = (saved.legs || []).map((leg, idx) =>
      idx === legIndex ? { ...leg, ...patch } : leg
    );

    patchParlay(saved.id, { legs: nextLegs });
  }

  function archiveParlay(saved) {
    const ok = window.confirm("Archive this parlay? It will be hidden by default but not deleted.");
    if (!ok) return;

    patchParlay(saved.id, {
      status: "archived",
      archivedAt: new Date().toISOString(),
      statusBeforeArchive: saved.status || "saved",
    });
  }

  function restoreParlay(saved) {
    patchParlay(saved.id, {
      status: saved.statusBeforeArchive || (saved.confirmedPlaced ? "placed" : "saved"),
      archivedAt: "",
      statusBeforeArchive: "",
    });
  }

  function archiveAllVisibleParlays() {
    const answer = window.prompt(
      "Archive all currently visible saved/placed parlays? This does NOT permanently delete them.\n\nType ARCHIVE to confirm."
    );

    if (answer !== "ARCHIVE") return;

    onClearSavedParlays?.();
  }

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={{ margin: 0 }}>Saved / Placed Parlays</h3>
          <div style={subtleStyle}>
            Permanent ledger. Saved ideas do not count until Confirm Placed. Double-click editable text to change it.
          </div>
        </div>

        <div style={headerRightStyle}>
          <span style={archivePillStyle}>
            Archived hidden: {archivedCount}
          </span>

          <button
            type="button"
            onClick={() => setShowArchived((prev) => !prev)}
            style={toggleButtonStyle}
          >
            {showArchived ? "Hide Archived" : "Show Archived"}
          </button>
        </div>
      </div>

      <div style={pnlSummaryStyle(stats.netProfitLoss)}>
        <div>
          <div style={pnlLabelStyle}>Placed Parlay Net P&L</div>
          <div style={pnlMainStyle(stats.netProfitLoss)}>
            {formatMoney(stats.netProfitLoss)}
          </div>
        </div>

        <div style={summaryGridStyle}>
          <SummaryPill label="Placed" value={stats.placedCount} />
          <SummaryPill label="Pending" value={stats.pendingCount} />
          <SummaryPill label="Won" value={stats.wonCount} />
          <SummaryPill label="Lost" value={stats.lostCount} />
          <SummaryPill label="Total Staked" value={formatMoney(stats.totalStaked)} />
          <SummaryPill label="ROI" value={formatPct(stats.roi)} />
        </div>
      </div>

      <div style={toggleRowStyle}>
        <button
          type="button"
          onClick={() => setSavedCollapsed((prev) => !prev)}
          style={toggleButtonStyle}
        >
          {savedCollapsed ? "Show Saved Parlays" : "Hide Saved Parlays"}
        </button>

        <button
          type="button"
          onClick={() => setPerformanceCollapsed((prev) => !prev)}
          style={toggleButtonStyle}
        >
          {performanceCollapsed ? "Show Performance Summary" : "Hide Performance Summary"}
        </button>

        <button
          type="button"
          onClick={() => setManualCollapsed((prev) => !prev)}
          style={manualAddButtonStyle}
        >
          {manualCollapsed ? "Add Manual Placed Parlay" : "Hide Manual Entry"}
        </button>

        <button
          type="button"
          onClick={() => setDangerCollapsed((prev) => !prev)}
          style={dangerToggleButtonStyle}
        >
          {dangerCollapsed ? "Show Archive Tools" : "Hide Archive Tools"}
        </button>
      </div>

      {!dangerCollapsed ? (
        <div style={dangerZoneStyle}>
          <strong>Archive tools</strong>
          <span style={subtleStyle}>
            Archive hides parlays by default without deleting them from localStorage.
          </span>

          <button
            type="button"
            onClick={archiveAllVisibleParlays}
            disabled={!visibleParlays.length}
            style={{
              ...archiveAllButtonStyle,
              opacity: visibleParlays.length ? 1 : 0.55,
              cursor: visibleParlays.length ? "pointer" : "not-allowed",
            }}
          >
            Archive All Visible Parlays
          </button>
        </div>
      ) : null}

      {!manualCollapsed ? (
        <div style={manualFormStyle}>
          <div>
            <h4 style={miniHeaderStyle}>Add Manual Placed Parlay</h4>
            <div style={subtleStyle}>
              Use this for parlays placed outside the optimizer. One leg per line using:
              Event | Market | Player/Team | Side | Line | Odds
            </div>
          </div>

          <div style={manualGridStyle}>
            <label style={labelStyle}>
              Name / Label
              <input
                type="text"
                value={manualDraft.name}
                onChange={(event) => updateManualDraft("name", event.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Book
              <input
                type="text"
                value={manualDraft.bookmaker}
                onChange={(event) => updateManualDraft("bookmaker", event.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Sport
              <select
                value={manualDraft.sport}
                onChange={(event) => updateManualDraft("sport", event.target.value)}
                style={inputStyle}
              >
                <option value="NBA">NBA</option>
                <option value="NHL">NHL</option>
                <option value="MLB">MLB</option>
                <option value="NFL">NFL</option>
                <option value="NCAAF">NCAAF</option>
                <option value="Soccer">Soccer</option>
                <option value="Tennis">Tennis</option>
                <option value="Golf">Golf</option>
                <option value="UFC">UFC</option>
                <option value="Other">Other</option>
              </select>
            </label>

            <label style={labelStyle}>
              Stake
              <input
                type="number"
                value={manualDraft.placedStake}
                onChange={(event) => updateManualDraft("placedStake", event.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Placed Odds
              <input
                type="number"
                value={manualDraft.placedOddsAmerican}
                onChange={(event) => updateManualDraft("placedOddsAmerican", event.target.value)}
                style={inputStyle}
                placeholder="+264"
              />
            </label>

            <label style={labelStyle}>
              Placed Date
              <input
                type="date"
                value={manualDraft.placedDate}
                onChange={(event) => updateManualDraft("placedDate", event.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Boost Name / Promo
              <input
                type="text"
                value={manualDraft.boostName}
                onChange={(event) => updateManualDraft("boostName", event.target.value)}
                style={inputStyle}
                placeholder="NBA 20% SGP DraftKings"
              />
            </label>

            <label style={labelStyle}>
              Boost %
              <input
                type="number"
                value={manualDraft.boostPct}
                onChange={(event) => updateManualDraft("boostPct", event.target.value)}
                style={inputStyle}
                placeholder="20"
              />
            </label>
          </div>

          <label style={labelStyle}>
            Legs
            <textarea
              value={manualDraft.legsText}
              onChange={(event) => updateManualDraft("legsText", event.target.value)}
              style={manualTextareaStyle}
              rows={7}
            />
          </label>

          <label style={labelStyle}>
            Notes
            <input
              type="text"
              value={manualDraft.notes}
              onChange={(event) => updateManualDraft("notes", event.target.value)}
              style={inputStyle}
              placeholder="Optional notes"
            />
          </label>

          <div style={manualButtonRowStyle}>
            <button type="button" onClick={submitManualParlay} style={confirmButtonStyle}>
              Add as Placed
            </button>

            <button
              type="button"
              onClick={() => setManualDraft(makeDefaultManualParlayDraft())}
              style={neutralButtonStyle}
            >
              Reset Manual Form
            </button>
          </div>
        </div>
      ) : null}

      {!performanceCollapsed ? (
        <div style={performanceBoxStyle}>
          <h4 style={miniHeaderStyle}>Performance Summary</h4>

          <div style={summaryGridStyle}>
            <SummaryPill label="Saved Ideas" value={stats.savedIdeaCount} />
            <SummaryPill label="Confirmed Placed" value={stats.placedCount} />
            <SummaryPill label="Settled" value={stats.settledCount} />
            <SummaryPill label="Push/Void" value={stats.pushVoidCount} />
            <SummaryPill label="Manual Entries" value={stats.manualCount} />
            <SummaryPill label="Archived Showing" value={showArchived ? archivedCount : 0} />
          </div>

          <PerformanceGroup title="By Book" groups={stats.byBook} />
          <PerformanceGroup title="By League" groups={stats.byLeague} />
          <PerformanceGroup title="SGP vs Non-SGP" groups={stats.bySgp} />
        </div>
      ) : null}

      {!savedCollapsed ? (
        visibleParlays.length === 0 ? (
          <div style={emptyStyle}>
            {showArchived ? "No saved placed parlays yet." : "No active saved/placed parlays. Try Show Archived if you archived old ones."}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {visibleParlays.slice(0, 250).map((saved) => {
              const status = String(saved.status || "saved").toLowerCase();
              const archived = isArchivedParlay(saved);
              const isConfirmed = saved.confirmedPlaced === true || (status !== "saved" && status !== "archived");
              const isSettled = ["won", "lost", "push", "void"].includes(status);
              const isPending = status === "placed" || status === "pending";
              const profitLoss = Number(saved.profitLoss || 0);

              return (
                <div key={saved.id} style={cardStyle(status)}>
                  <div style={cardTopStyle}>
                    <div style={{ minWidth: 0 }}>
                      <div style={cardTitleStyle}>
                        <EditableText
                          value={saved.playLabel || "Placed Parlay"}
                          placeholder="Parlay label"
                          onSave={(nextValue) => patchParlay(saved.id, { playLabel: nextValue })}
                        />{" "}
                        <span style={statusPillStyle(status)}>{status}</span>
                        {saved.manualEntry ? <span style={manualPillStyle}>manual</span> : null}
                      </div>

                      <div style={largeSavedBookStyle}>
                        {getSavedParlayBook(saved) || "Unknown Book"}
                      </div>

                      <div style={subtleStyle}>
                        Saved {formatSavedDateTime ? formatSavedDateTime(saved.savedAt) : saved.savedAt}
                        {" - Book: "}
                        <EditableText
                          value={getSavedParlayBook(saved)}
                          placeholder="Book"
                          onSave={(nextValue) =>
                            patchParlay(saved.id, {
                              bookmaker: nextValue,
                              targetSportsbook: nextValue,
                            })
                          }
                        />
                        {saved.boostName ? (
                          <>
                            {" - Boost: "}
                            <EditableText
                              value={saved.boostName}
                              placeholder="Boost"
                              onSave={(nextValue) => patchParlay(saved.id, { boostName: nextValue })}
                            />
                          </>
                        ) : null}
                      </div>

                      {Array.isArray(saved.notes) && saved.notes.length ? (
                        <div style={notesStyle}>
                          <EditableText
                            value={saved.notes.join(" | ")}
                            placeholder="Notes"
                            onSave={(nextValue) =>
                              patchParlay(saved.id, {
                                notes: String(nextValue || "")
                                  .split("|")
                                  .map((note) => note.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        </div>
                      ) : null}
                    </div>

                    {archived ? (
                      <button
                        type="button"
                        onClick={() => restoreParlay(saved)}
                        style={neutralButtonStyle}
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => archiveParlay(saved)}
                        style={deleteButtonStyle}
                      >
                        Archive
                      </button>
                    )}
                  </div>

                  <div style={editGridStyle}>
                    <label style={labelStyle}>
                      Book
                      <input
                        type="text"
                        value={getSavedParlayBook(saved)}
                        onChange={(event) =>
                          patchParlay(saved.id, {
                            bookmaker: event.target.value,
                            targetSportsbook: event.target.value,
                          })
                        }
                        style={inputStyle}
                      />
                    </label>

                    <label style={labelStyle}>
                      Stake
                      <input
                        type="number"
                        value={saved.placedStake ?? ""}
                        onChange={(event) =>
                          patchParlay(saved.id, {
                            placedStake: Number(event.target.value),
                          })
                        }
                        style={inputStyle}
                      />
                    </label>

                    <label style={labelStyle}>
                      Placed Odds
                      <input
                        type="number"
                        value={saved.placedOddsAmerican ?? saved.boostedParlayAmerican ?? ""}
                        onChange={(event) =>
                          patchParlay(saved.id, {
                            placedOddsAmerican: Number(event.target.value),
                          })
                        }
                        style={inputStyle}
                      />
                    </label>

                    <label style={labelStyle}>
                      Placed Date
                      <input
                        type="date"
                        value={saved.placedDate || ""}
                        onChange={(event) => patchParlay(saved.id, { placedDate: event.target.value })}
                        style={inputStyle}
                      />
                    </label>

                    <div style={pnlCardStyle(profitLoss)}>
                      <span style={pnlCardLabelStyle}>P&L</span>
                      <strong style={pnlCardValueStyle}>{formatMoney(profitLoss)}</strong>
                    </div>
                  </div>

                  {!archived ? (
                    <div style={buttonRowStyle}>
                      {!isConfirmed ? (
                        <button
                          type="button"
                          onClick={() => onConfirmSavedParlayPlaced?.(saved.id)}
                          style={confirmButtonStyle}
                        >
                          Confirm Placed
                        </button>
                      ) : null}

                      {isConfirmed && !isSettled ? (
                        <>
                          <button type="button" onClick={() => onSetSavedParlayResult?.(saved.id, "won")} style={winButtonStyle}>
                            Won
                          </button>
                          <button type="button" onClick={() => onSetSavedParlayResult?.(saved.id, "lost")} style={lossButtonStyle}>
                            Lost
                          </button>
                          <button type="button" onClick={() => onSetSavedParlayResult?.(saved.id, "push")} style={neutralButtonStyle}>
                            Push
                          </button>
                          <button type="button" onClick={() => onSetSavedParlayResult?.(saved.id, "void")} style={neutralButtonStyle}>
                            Void
                          </button>
                        </>
                      ) : null}

                      {isConfirmed || isSettled || isPending ? (
                        <button type="button" onClick={() => onSetSavedParlayResult?.(saved.id, "placed")} style={neutralButtonStyle}>
                          Back to Pending
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <div style={legsWrapStyle}>
                    {(saved.legs || []).map((leg, idx) => (
                      <div key={`${saved.id}_${idx}`} style={legLineStyle}>
                        <EditableText
                          value={leg.eventName || "Event"}
                          placeholder="Event"
                          onSave={(nextValue) => patchLeg(saved, idx, { eventName: nextValue })}
                        />
                        {" - "}
                        <EditableText
                          value={leg.displayLabel || formatSavedLeg(leg)}
                          placeholder="Leg"
                          onSave={(nextValue) => patchLeg(saved, idx, { displayLabel: nextValue })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : null}
    </div>
  );
}

function EditableText({ value, onSave, placeholder = "Edit", style = {} }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  const displayValue = String(value || "").trim();

  function save() {
    const nextValue = String(draft || "").trim();
    onSave?.(nextValue);
    setIsEditing(false);
  }

  function cancel() {
    setDraft(value || "");
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
          if (event.key === "Escape") cancel();
        }}
        style={{ ...inlineEditInputStyle, ...style }}
      />
    );
  }

  return (
    <span
      onDoubleClick={() => {
        setDraft(value || "");
        setIsEditing(true);
      }}
      title="Double-click to edit"
      style={{ ...editableTextStyle, ...style }}
    >
      {displayValue || placeholder}
    </span>
  );
}

function PerformanceGroup({ title, groups = [] }) {
  if (!groups.length) {
    return (
      <div style={performanceBoxInnerStyle}>
        <strong>{title}</strong>
        <div style={emptyStyle}>No data yet.</div>
      </div>
    );
  }

  const maxAbsNet = Math.max(1, ...groups.map((group) => Math.abs(Number(group.net || 0))));

  return (
    <div style={performanceBoxInnerStyle}>
      <strong>{title}</strong>

      <div style={performanceTableStyle}>
        {groups.map((group) => {
          const width = `${Math.max(4, Math.round((Math.abs(group.net || 0) / maxAbsNet) * 100))}%`;

          return (
            <div key={group.key || group.label} style={performanceVisualRowStyle}>
              <div style={performanceVisualHeaderStyle}>
                <span>{group.label}</span>
                <span>
                  {group.count} placed • {formatMoney(group.net)} • ROI {formatPct(group.roi)}
                </span>
              </div>

              <div style={barTrackStyle}>
                <div
                  style={{
                    ...barFillStyle(group.net),
                    width,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getSavedParlayBook(parlay = {}) {
  return (
    parlay.bookmaker ||
    parlay.targetSportsbook ||
    parlay.boostSportsbookLabel ||
    parlay.boostSportsbook ||
    parlay.legs?.[0]?.sportsbook ||
    ""
  );
}

function getSavedParlayLeague(parlay = {}) {
  return (
    parlay.sport ||
    parlay.league ||
    parlay.legs?.find((leg) => leg?.sport)?.sport ||
    "UNKNOWN"
  ).toString().toUpperCase();
}

function isSgpParlay(parlay = {}) {
  if (parlay.isSgp === true) return true;
  if (/\bSGP\b/i.test(String(parlay.boostName || ""))) return true;
  if (/\bSame Game\b/i.test(String(parlay.boostName || ""))) return true;

  const events = new Set(
    (parlay.legs || [])
      .map((leg) => String(leg.eventName || "").trim())
      .filter(Boolean)
  );

  return events.size === 1 && (parlay.legs || []).length > 1;
}

function isArchivedParlay(parlay = {}) {
  return String(parlay.status || "").toLowerCase() === "archived" || !!parlay.archivedAt;
}

function SummaryPill({ label, value }) {
  return (
    <div style={summaryPillStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildLedgerStats(parlays = []) {
  const stats = {
    netProfitLoss: 0,
    totalStaked: 0,
    roi: null,
    placedCount: 0,
    pendingCount: 0,
    wonCount: 0,
    lostCount: 0,
    settledCount: 0,
    pushVoidCount: 0,
    savedIdeaCount: 0,
    manualCount: 0,
    byBook: [],
    byLeague: [],
    bySgp: [],
  };

  const byBook = new Map();
  const byLeague = new Map();
  const bySgp = new Map();

  function addGroup(map, key, label, stake, pnl) {
    if (!map.has(key)) {
      map.set(key, { key, label, count: 0, stake: 0, net: 0, roi: null });
    }

    const bucket = map.get(key);
    bucket.count += 1;
    bucket.stake += Number.isFinite(stake) ? stake : 0;
    bucket.net += Number.isFinite(pnl) ? pnl : 0;
  }

  for (const parlay of parlays || []) {
    if (isArchivedParlay(parlay)) continue;

    const status = String(parlay.status || "saved").toLowerCase();
    const confirmed = parlay.confirmedPlaced === true || status !== "saved";

    if (parlay.manualEntry) stats.manualCount += 1;

    if (!confirmed) {
      stats.savedIdeaCount += 1;
      continue;
    }

    stats.placedCount += 1;

    const stake = Number(parlay.placedStake || 0);
    const pnl = Number(parlay.profitLoss || 0);

    stats.totalStaked += Number.isFinite(stake) ? stake : 0;
    stats.netProfitLoss += Number.isFinite(pnl) ? pnl : 0;

    if (status === "placed" || status === "pending") stats.pendingCount += 1;
    if (status === "won") {
      stats.wonCount += 1;
      stats.settledCount += 1;
    }
    if (status === "lost") {
      stats.lostCount += 1;
      stats.settledCount += 1;
    }
    if (status === "push" || status === "void") {
      stats.pushVoidCount += 1;
      stats.settledCount += 1;
    }

    const book = getSavedParlayBook(parlay) || "Unknown";
    const league = getSavedParlayLeague(parlay);
    const sgpKey = isSgpParlay(parlay) ? "sgp" : "not_sgp";

    addGroup(byBook, book, book, stake, pnl);
    addGroup(byLeague, league, league, stake, pnl);
    addGroup(bySgp, sgpKey, sgpKey === "sgp" ? "SGP / same-game" : "Non-SGP / cross-game", stake, pnl);
  }

  function finishGroups(map) {
    return Array.from(map.values())
      .map((item) => ({ ...item, roi: item.stake > 0 ? item.net / item.stake : null }))
      .sort((a, b) => b.net - a.net);
  }

  stats.roi = stats.totalStaked > 0 ? stats.netProfitLoss / stats.totalStaked : null;
  stats.byBook = finishGroups(byBook);
  stats.byLeague = finishGroups(byLeague);
  stats.bySgp = finishGroups(bySgp);

  return stats;
}

function formatMoney(value) {
  const n = Number(value || 0);
  const sign = n > 0 ? "+" : "";
  return `${sign}$${n.toFixed(2)}`;
}

function formatPct(value) {
  if (!Number.isFinite(Number(value))) return "-";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatSavedLeg(leg = {}) {
  if (leg.displayLabel) return leg.displayLabel;

  const subject = String(leg.subjectName || "").trim();
  const selection = String(leg.selectionLabel || "").trim();
  const line =
    leg.lineValue !== null && leg.lineValue !== undefined && leg.lineValue !== ""
      ? String(leg.lineValue)
      : "";
  const market = formatMarketLabel(leg.marketType);

  if (subject) {
    return `${subject} ${selection}${line ? ` ${line}` : ""}${market ? ` ${market}` : ""}`.trim();
  }

  return `${selection || "Selection"}${line ? ` ${line}` : ""}${market ? ` ${market}` : ""}`.trim();
}

function formatMarketLabel(marketType = "") {
  const labels = {
    moneyline_2way: "Moneyline",
    moneyline_3way: "Moneyline",
    spread: "Spread",
    total: "Total",
    player_points: "Points",
    player_assists: "Assists",
    player_rebounds: "Rebounds",
    player_threes: "Threes",
    player_pra: "PRA",
    player_points_rebounds: "Points + Rebounds",
    player_points_assists: "Points + Assists",
    player_rebounds_assists: "Rebounds + Assists",
    double_double: "Double-Double",
    triple_double: "Triple-Double",
  };

  return labels[marketType] || String(marketType || "").replace(/_/g, " ");
}

const panelStyle = {
  marginTop: 14,
  padding: 12,
  borderRadius: 14,
  border: "1px solid #d6dbe3",
  background: "#ffffff",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const headerRightStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const subtleStyle = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 700,
};

const pnlSummaryStyle = (value) => ({
  marginTop: 12,
  padding: 14,
  borderRadius: 16,
  border: value >= 0 ? "2px solid #86efac" : "2px solid #fca5a5",
  background: value >= 0 ? "#f0fdf4" : "#fef2f2",
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1fr) 2fr",
  gap: 12,
  alignItems: "center",
});

const pnlLabelStyle = {
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
  color: "#475569",
};

const pnlMainStyle = (value) => ({
  fontSize: 42,
  lineHeight: 1,
  fontWeight: 1000,
  color: value >= 0 ? "#166534" : "#991b1b",
});

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 8,
};

const summaryPillStyle = {
  border: "1px solid #d1d5db",
  borderRadius: 12,
  padding: 9,
  background: "#fff",
  display: "grid",
  gap: 3,
  fontSize: 12,
  color: "#475569",
};

const toggleRowStyle = {
  marginTop: 12,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const toggleButtonStyle = {
  border: "1px solid #bfdbfe",
  borderRadius: 999,
  padding: "7px 11px",
  fontSize: 12,
  fontWeight: 900,
  background: "#eff6ff",
  color: "#1d4ed8",
  cursor: "pointer",
};

const dangerToggleButtonStyle = {
  ...toggleButtonStyle,
  borderColor: "#fed7aa",
  background: "#fff7ed",
  color: "#9a3412",
};

const dangerZoneStyle = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #fed7aa",
  background: "#fff7ed",
  borderRadius: 12,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const archiveAllButtonStyle = {
  border: "1px solid #fb923c",
  borderRadius: 999,
  padding: "7px 11px",
  fontSize: 12,
  fontWeight: 900,
  background: "#ffedd5",
  color: "#9a3412",
};

const archivePillStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 11,
  fontWeight: 900,
  background: "#f8fafc",
  color: "#475569",
};

const performanceBoxStyle = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  display: "grid",
  gap: 12,
};

const performanceBoxInnerStyle = {
  display: "grid",
  gap: 8,
};

const performanceTableStyle = {
  display: "grid",
  gap: 7,
};

const performanceVisualRowStyle = {
  display: "grid",
  gap: 4,
};

const performanceVisualHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
  fontSize: 12,
  fontWeight: 800,
};

const barTrackStyle = {
  height: 10,
  borderRadius: 999,
  background: "#e5e7eb",
  overflow: "hidden",
};

const barFillStyle = (value) => ({
  height: "100%",
  borderRadius: 999,
  background: Number(value) >= 0 ? "#22c55e" : "#ef4444",
});

const emptyStyle = {
  border: "1px dashed #d1d5db",
  borderRadius: 10,
  padding: 10,
  color: "#64748b",
  background: "#f8fafc",
  fontWeight: 700,
};

const miniHeaderStyle = {
  margin: 0,
  color: "#0f172a",
};

const cardStyle = (status) => {
  const key = String(status || "saved").toLowerCase();

  const base = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 12,
    background: "#fff",
  };

  if (key === "won") return { ...base, borderColor: "#86efac", background: "#f0fdf4" };
  if (key === "lost") return { ...base, borderColor: "#fca5a5", background: "#fef2f2" };
  if (key === "void") {
    return {
      ...base,
      borderColor: "#cbd5e1",
      background:
        "repeating-linear-gradient(45deg, #f8fafc, #f8fafc 8px, #e5e7eb 8px, #e5e7eb 16px)",
      opacity: 0.72,
    };
  }
  if (key === "archived") return { ...base, borderColor: "#cbd5e1", background: "#f1f5f9", opacity: 0.78 };

  return base;
};

const cardTopStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
  flexWrap: "wrap",
};

const cardTitleStyle = {
  fontWeight: 900,
  color: "#0f172a",
};

const statusPillStyle = (status) => {
  const key = String(status || "saved").toLowerCase();

  const colors = {
    won: ["#dcfce7", "#166534", "#86efac"],
    lost: ["#fee2e2", "#991b1b", "#fca5a5"],
    placed: ["#dbeafe", "#1d4ed8", "#93c5fd"],
    pending: ["#dbeafe", "#1d4ed8", "#93c5fd"],
    archived: ["#f1f5f9", "#475569", "#cbd5e1"],
    void: ["#f1f5f9", "#475569", "#cbd5e1"],
    push: ["#f1f5f9", "#475569", "#cbd5e1"],
  };

  const [bg, color, border] = colors[key] || ["#f8fafc", "#334155", "#cbd5e1"];

  return {
    marginLeft: 6,
    border: `1px solid ${border}`,
    background: bg,
    color,
    borderRadius: 999,
    padding: "2px 7px",
    fontSize: 10,
    fontWeight: 900,
  };
};

const manualPillStyle = {
  ...statusPillStyle("placed"),
  background: "#ecfdf5",
  color: "#166534",
  borderColor: "#86efac",
};

const editGridStyle = {
  marginTop: 10,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 8,
  alignItems: "end",
};

const labelStyle = {
  display: "grid",
  gap: 4,
  fontSize: 12,
  fontWeight: 800,
  color: "#334155",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "8px 9px",
  fontSize: 13,
};

const pnlCardStyle = (value) => ({
  border: value >= 0 ? "1px solid #86efac" : "1px solid #fca5a5",
  background: value >= 0 ? "#f0fdf4" : "#fef2f2",
  color: value >= 0 ? "#166534" : "#991b1b",
  borderRadius: 12,
  padding: 9,
  display: "grid",
  gap: 2,
});

const pnlCardLabelStyle = {
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  color: "#475569",
};

const pnlCardValueStyle = {
  fontSize: 22,
  lineHeight: 1.1,
  fontWeight: 1000,
};

const buttonRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 12,
};

const confirmButtonStyle = {
  border: "1px solid #86efac",
  background: "#dcfce7",
  color: "#166534",
  borderRadius: 999,
  padding: "6px 10px",
  fontWeight: 900,
  cursor: "pointer",
};

const winButtonStyle = {
  ...confirmButtonStyle,
};

const lossButtonStyle = {
  border: "1px solid #fca5a5",
  background: "#fee2e2",
  color: "#991b1b",
  borderRadius: 999,
  padding: "6px 10px",
  fontWeight: 900,
  cursor: "pointer",
};

const neutralButtonStyle = {
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#374151",
  borderRadius: 999,
  padding: "6px 10px",
  fontWeight: 900,
  cursor: "pointer",
};

const deleteButtonStyle = {
  border: "1px solid #fed7aa",
  background: "#fff7ed",
  color: "#9a3412",
  borderRadius: 999,
  padding: "6px 10px",
  fontWeight: 900,
  cursor: "pointer",
};

const legsWrapStyle = {
  marginTop: 10,
  display: "grid",
  gap: 4,
};

const legLineStyle = {
  color: "#374151",
  fontSize: 12,
  fontWeight: 700,
};

const notesStyle = {
  marginTop: 4,
  color: "#475569",
  fontSize: 12,
  fontWeight: 700,
};

const editableTextStyle = {
  cursor: "text",
  borderBottom: "1px dotted #94a3b8",
};

const inlineEditInputStyle = {
  border: "1px solid #93c5fd",
  borderRadius: 6,
  padding: "2px 6px",
  fontSize: "inherit",
  fontWeight: "inherit",
  color: "inherit",
  minWidth: 120,
  maxWidth: "100%",
};

const manualFormStyle = {
  marginTop: 12,
  marginBottom: 12,
  padding: 12,
  borderRadius: 14,
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  display: "grid",
  gap: 10,
};

const manualGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(150px, 1fr))",
  gap: 10,
};

const manualTextareaStyle = {
  ...inputStyle,
  minHeight: 130,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  resize: "vertical",
};

const manualButtonRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const manualAddButtonStyle = {
  ...toggleButtonStyle,
  background: "#dcfce7",
  color: "#166534",
  borderColor: "#86efac",
};

const largeSavedBookStyle = {
  marginTop: 6,
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  border: "1px solid #bfdbfe",
  borderRadius: 999,
  padding: "5px 12px",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: 22,
  lineHeight: 1.1,
  fontWeight: 1000,
  letterSpacing: "0.01em",
};