"use client";

import Link from "next/link";
import SavedPlacedParlaysLedgerPanel from "./SavedPlacedParlaysLedgerPanel";
import { useState } from "react";

export default function ParlayResults({
  parlays,
  counts,
  savedPlacedParlays = [],
  savedLegUsageMap,
  onSavePlacedParlay,
  onClearSavedParlays,
  onDeleteSavedParlay,
  onUpdateSavedParlay,
  onConfirmSavedParlayPlaced,
  onSetSavedParlayResult,
  formatSavedDateTime,
  boostWallet = [],
  blockedParlayLegs = [],
  onBlockParlayLeg,
  onUnblockParlayLeg,
  selectedDevigMethod = "power",
}) {
  const [sectionCollapsed, setSectionCollapsed] = useState(false);
  const [converterInput, setConverterInput] = useState("");
  const [converterResult, setConverterResult] = useState(null);
  const [collapsedMap, setCollapsedMap] = useState({});
  const [selectedBoostByParlayId, setSelectedBoostByParlayId] = useState({});
  const [stakeByParlayId, setStakeByParlayId] = useState({});
  const [showRecommendedDevigByParlayId, setShowRecommendedDevigByParlayId] = useState({});
  const [actualSgpOddsByParlayId, setActualSgpOddsByParlayId] = useState({});
  const [placeabilityByParlayId, setPlaceabilityByParlayId] = useState({});
  const [placeabilityNotesByParlayId, setPlaceabilityNotesByParlayId] = useState({});

  const safeParlays = Array.isArray(parlays) ? parlays : [];
  const safeSavedPlacedParlays = repairMojibakeDeep(savedPlacedParlays);
  function toggleParlay(id) {
    setCollapsedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function toggleRecommendedDevig(id) {
    setShowRecommendedDevigByParlayId((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function handleBoostSelect(parlay, boostId) {
    setSelectedBoostByParlayId((prev) => ({
      ...prev,
      [parlay.id]: boostId,
    }));

    const selectedBoost = (boostWallet || []).find((boost) => boost.id === boostId);
    const currentStake = stakeByParlayId[parlay.id];

    if (
      selectedBoost &&
      (currentStake === undefined || currentStake === null || currentStake === "") &&
      Number.isFinite(Number(selectedBoost.maxStake))
    ) {
      setStakeByParlayId((prev) => ({
        ...prev,
        [parlay.id]: Number(selectedBoost.maxStake),
      }));
    }
  }

  return (
    <section style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <h2 style={h2Style}>8. Parlay Results</h2>
          <div style={subtleStyle}>
            Current devig method: <strong>{formatDevigMethodLabel(selectedDevigMethod)}</strong>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSectionCollapsed((prev) => !prev)}
          style={toggleButtonStyle}
        >
          {sectionCollapsed ? "Show Parlay Results" : "Collapse Parlay Results"}
        </button>
      </div>

      <div style={countsRowStyle}>
        <span style={countPillStyle}>Eligible Markets: {counts?.eligibleMarkets ?? 0}</span>
        <span style={countPillStyle}>Eligible Legs: {counts?.eligibleLegs ?? 0}</span>
        <span style={countPillStyle}>Generated Combos: {counts?.generatedCombos ?? 0}</span>
      </div>

      {sectionCollapsed ? (
        <div style={collapsedNoticeStyle}>
          Results are hidden. Counts above still update when filters change.
        </div>
      ) : (
        <>
          {blockedParlayLegs.length ? (
            <div style={blockedLegsPanelStyle}>
              <div style={blockedLegsTitleStyle}>Blocked Legs</div>
              <div style={blockedLegsSubtleStyle}>
                These legs are manually excluded from suggested parlay calculations.
              </div>

              <div style={blockedLegsListStyle}>
                {blockedParlayLegs.map((blocked) => (
                  <div key={blocked.id} style={blockedLegPillStyle}>
                    <span>{blocked.displayLabel || formatBlockedLegLabel(blocked)}</span>
                    <button
                      type="button"
                      onClick={() => onUnblockParlayLeg?.(blocked.id)}
                      style={removeBlockedLegButtonStyle}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {counts?.rejections ? (
            <div style={rejectionsRowStyle}>
              <span style={rejectionPillStyle}>No Fair Odds: {counts.rejections.noFairOdds ?? 0}</span>
              <span style={rejectionPillStyle}>No Target Quote: {counts.rejections.noTargetQuote ?? 0}</span>
              <span style={rejectionPillStyle}>Below Leg Threshold: {counts.rejections.belowLegThreshold ?? 0}</span>
              <span style={rejectionPillStyle}>Same-Sport Blocked: {counts.rejections.sameSportBlocked ?? 0}</span>
              <span style={rejectionPillStyle}>Same-Game Blocked: {counts.rejections.sameGameBlocked ?? 0}</span>
              <span style={rejectionPillStyle}>Repeats Blocked: {counts.rejections.repeatsBlocked ?? 0}</span>
              <span style={rejectionPillStyle}>Manual Blocks: {counts.rejections.manualBlocked ?? 0}</span>
              <span style={rejectionPillStyle}>Non-Positive EV: {counts.rejections.nonPositiveParlayEv ?? 0}</span>
              <span style={rejectionPillStyle}>Market Mode Filtered: {counts.rejections.filteredByMarketMode ?? 0}</span>
              <span style={rejectionPillStyle}>Extreme Odds Filtered: {counts.rejections.filteredByExtremeOdds ?? 0}</span>
            </div>
          ) : null}

          <div style={converterBlockStyle}>
            <div style={converterLabelStyle}>Odds Converter</div>
            <div style={converterWrapStyle}>
              <input
                value={converterInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setConverterInput(val);
                  setConverterResult(convertOdds(val));
                }}
                placeholder="+150 or 2.50"
                style={converterInputStyle}
              />

              <div style={converterResultStyle}>
                {converterResult ? (
                  converterResult.type === "american_to_decimal" ? (
                    <>Decimal: {converterResult.decimal.toFixed(3)}</>
                  ) : (
                    <>American: {formatAmerican(converterResult.american)}</>
                  )
                ) : (
                  "—"
                )}
              </div>
            </div>
          </div>

          {safeParlays.length === 0 ? (
            <div style={emptyWarningStyle}>No positive EV parlays found with available odds.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {safeParlays.map((parlay, idx) => {
                const isCollapsed = !!collapsedMap[parlay.id];
                const showRecommended = !!showRecommendedDevigByParlayId[parlay.id];
                const selectedBoostId = selectedBoostByParlayId[parlay.id] || "";
                const stakeValue = stakeByParlayId[parlay.id] ?? "";
                const actualSgpOddsText = actualSgpOddsByParlayId[parlay.id] ?? "";
                const actualSgpRegrade = buildActualSgpRegrade(parlay, actualSgpOddsText, stakeValue);
                const placeabilityStatus = placeabilityByParlayId[parlay.id] || "not_checked";
                const placeabilityNotes = placeabilityNotesByParlayId[parlay.id] || "";
                const uniqueEventNames = Array.from(
                  new Set((parlay.legs || []).map((leg) => String(leg.eventName || "").trim()).filter(Boolean))
                );
                const isSameGameCandidate = (parlay.legs || []).length > 1 && uniqueEventNames.length === 1;

                return (
                  <div key={parlay.id} style={cardStyle}>
                    <div style={cardHeaderStyle}>
                      <div>
                        <div style={{ fontWeight: 800 }}>
                          Candidate #{idx + 1} — {parlay.gradeTier} / {parlay.playLabel}
                        </div>
                        <div style={subtleStyle}>
                          EV {formatPct(parlay.expectedValuePct)} • Boosted {formatAmerican(parlay.boostedParlayAmerican)} • Devig {parlay.devigMethodLabel || formatDevigMethodLabel(selectedDevigMethod)}
                        </div>
                      </div>

                      <div style={saveControlWrapStyle}>
                        <label style={miniLabelStyle}>
                          Attach Boost
                          <select
                            value={selectedBoostId}
                            onChange={(event) => handleBoostSelect(parlay, event.target.value)}
                            style={boostSelectStyle}
                          >
                            <option value="">No boost attached</option>
                            {boostWallet
                              .filter((boost) => boost.status !== "used" && boost.status !== "expired")
                              .map((boost) => (
                                <option key={boost.id} value={boost.id}>
                                  {boost.sportsbook} — {boost.name} ({boost.boostPct}%)
                                </option>
                              ))}
                          </select>
                        </label>

                        <label style={miniLabelStyle}>
                          Stake to Save
                          <input
                            type="number"
                            value={stakeValue}
                            placeholder={String(parlay.stake ?? "Stake")}
                            onChange={(event) =>
                              setStakeByParlayId((prev) => ({
                                ...prev,
                                [parlay.id]: event.target.value,
                              }))
                            }
                            style={stakeInputStyle}
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() =>
                            onSavePlacedParlay?.(parlay, {
                              boostId: selectedBoostId,
                              placedStake: Number(stakeValue || parlay.stake || 0),
                              placedOddsAmerican:
                                actualSgpRegrade?.actualBoostedAmerican ??
                                parlay.boostedParlayAmerican ??
                                parlay.rawParlayAmerican,
                              actualBookSgpOddsAmerican: actualSgpRegrade?.actualRawAmerican ?? null,
                              actualBoostedSgpOddsAmerican: actualSgpRegrade?.actualBoostedAmerican ?? null,
                              placeabilityStatus,
                              placeabilityNotes,
                            })
                          }
                          style={savePlacedButtonStyle}
                        >
                          Save Candidate
                        </button>

                        <button type="button" onClick={() => toggleParlay(parlay.id)} style={toggleButtonStyle}>
                          {isCollapsed ? "Show" : "Hide"}
                        </button>

                        <span style={subtleStyle}>Saved candidates do not count in P&L until Confirm Placed.</span>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <>
                        <div style={parlayActionRowStyle}>
                          <Link href={buildToolsLink(parlay)} style={toolsLinkStyle}>
                            Open in Tools
                          </Link>
                        </div>

                        {isSameGameCandidate ? (
                          <div style={sgpOverrideBoxStyle}>
                            <div style={sgpWarningStyle}>
                              SGP odds are estimated by multiplying leg odds. Same-game parlays are book-priced and correlated.
                              Enter the actual book SGP odds before placing.
                            </div>

                            <div style={sgpGridStyle}>
                              <label style={miniLabelStyle}>
                                Actual Book SGP Odds
                                <input
                                  value={actualSgpOddsText}
                                  placeholder="+425"
                                  onChange={(event) =>
                                    setActualSgpOddsByParlayId((prev) => ({
                                      ...prev,
                                      [parlay.id]: event.target.value,
                                    }))
                                  }
                                  style={stakeInputStyle}
                                />
                              </label>

                              <label style={miniLabelStyle}>
                                Placeability
                                <select
                                  value={placeabilityStatus}
                                  onChange={(event) =>
                                    setPlaceabilityByParlayId((prev) => ({
                                      ...prev,
                                      [parlay.id]: event.target.value,
                                    }))
                                  }
                                  style={boostSelectStyle}
                                >
                                  <option value="not_checked">Not checked</option>
                                  <option value="accepted">Accepted by book</option>
                                  <option value="rejected">Rejected by book</option>
                                  <option value="could_not_build">Could not build</option>
                                </select>
                              </label>

                              <label style={miniLabelStyle}>
                                Placeability Notes
                                <input
                                  value={placeabilityNotes}
                                  placeholder="Rejected two props / accepted at +425 / etc."
                                  onChange={(event) =>
                                    setPlaceabilityNotesByParlayId((prev) => ({
                                      ...prev,
                                      [parlay.id]: event.target.value,
                                    }))
                                  }
                                  style={{ ...stakeInputStyle, width: 260 }}
                                />
                              </label>
                            </div>

                            {actualSgpRegrade ? (
                              <div style={actualSgpRegradeGridStyle}>
                                <MetricRow label="Actual Raw SGP Odds" value={formatAmerican(actualSgpRegrade.actualRawAmerican)} />
                                <MetricRow label="Actual Boosted SGP Odds" value={formatAmerican(actualSgpRegrade.actualBoostedAmerican)} />
                                <MetricRow label="Actual Raw EV %" value={formatPct(actualSgpRegrade.actualRawEvPct)} />
                                <MetricRow label="Actual Boosted EV %" value={formatPct(actualSgpRegrade.actualBoostedEvPct)} />
                                <MetricRow label="Actual Stake Used" value={`$${Number(actualSgpRegrade.actualStakeUsed || 0).toFixed(2)}`} />
                                <MetricRow label="Actual Expected $" value={`$${Number(actualSgpRegrade.actualExpectedProfitAtStake || 0).toFixed(2)}`} />
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {parlay.devigWarning ? (
                          <div style={devigWarningStyle}>
                            <div style={{ fontWeight: 900 }}>Devig method warning</div>
                            <div>{parlay.devigWarning}</div>
                            {parlay.recommendedDevigMethod ? (
                              <div style={devigButtonRowStyle}>
                                <button
                                  type="button"
                                  onClick={() => toggleRecommendedDevig(parlay.id)}
                                  style={devigCalcButtonStyle}
                                >
                                  {showRecommended ? "Hide" : "Calculate"} one-off view with {parlay.recommendedDevigMethodLabel}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {showRecommended && parlay.recommendedDevigSnapshot ? (
                          <div style={recommendedBoxStyle}>
                            <div style={{ fontWeight: 900, marginBottom: 6 }}>
                              One-off {parlay.recommendedDevigSnapshot.methodLabel} reference
                            </div>
                            <div style={metricsGridStyle}>
                              <MetricRow label="Fair Hit %" value={formatPct(parlay.recommendedDevigSnapshot.fairHitProbability)} />
                              <MetricRow label="Boosted EV %" value={formatPct(parlay.recommendedDevigSnapshot.expectedValuePct)} />
                              <MetricRow label="Raw EV %" value={formatPct(parlay.recommendedDevigSnapshot.rawExpectedValuePct)} />
                              <MetricRow label="Boosted Kelly" value={`$${Number(parlay.recommendedDevigSnapshot.boostedSuggestedKellyStake ?? 0).toFixed(2)}`} />
                            </div>
                            <div style={subtleStyle}>Reference only. This does not save or change the parlay.</div>
                          </div>
                        ) : null}

                        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                          {parlay.legs?.map((leg, legIdx) => (
                            <div key={`${parlay.id}_${legIdx}`} style={legBreakdownRowStyle}>
                              <div style={legTitleRowStyle}>
                                <span>
                                  • {leg.eventName} — {formatLegSelection(leg)}
                                  {getSavedLegUsage(leg, savedLegUsageMap)?.count ? (
                                    <span style={usedLegBadgeStyle}>
                                      Used {getSavedLegUsage(leg, savedLegUsageMap).count}x
                                    </span>
                                  ) : null}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => onBlockParlayLeg?.(leg)}
                                  style={blockLegButtonStyle}
                                >
                                  Block Leg
                                </button>
                              </div>
                              <div style={legBreakdownMetaStyle}>
                                Target {formatAmerican(leg.oddsAmerican)} at {leg.sportsbook}
                                {" "}• Sharp {formatAmerican(leg.sharpOddsAmerican)} at {leg.sharpSportsbook || "sharp source"}
                                {" "}• Fair {formatAmerican(leg.fairAmerican)}
                                {" "}• Leg EV{" "}
                                <span style={Number(leg.legEvPct) >= 0 ? legBreakdownEvStyle : legBreakdownEvNegativeStyle}>
                                  {formatPct(leg.legEvPct)}
                                </span>
                              </div>
                            </div>
                          )) || null}
                        </div>

                        <div style={metricsGridStyle}>
                          <MetricRow label="Raw Odds" value={formatAmerican(parlay.rawParlayAmerican)} />
                          <MetricRow label="Boosted Odds" value={formatAmerican(parlay.boostedParlayAmerican)} />
                          <MetricRow label="Fair Hit %" value={formatPct(parlay.fairHitProbability)} />
                          <MetricRow label="Boosted EV %" value={formatPct(parlay.expectedValuePct)} />
                          <MetricRow label="Raw EV %" value={formatPct(parlay.rawExpectedValuePct)} />
                          <MetricRow label="Avg Leg EV %" value={formatPct(parlay.averageLegEvPct)} />
                          <MetricRow label="Expected $" value={`$${(parlay.expectedProfitAtStake ?? 0).toFixed(2)}`} />
                          <MetricRow label="Grade" value={`${parlay.gradeTier} / ${parlay.playLabel}`} />
                          <MetricRow label="Boosted Kelly" value={`$${Number(parlay.boostedSuggestedKellyStake ?? parlay.suggestedKellyStake ?? 0).toFixed(2)}`} />
                          <MetricRow label="Raw Kelly" value={`$${Number(parlay.rawSuggestedKellyStake ?? 0).toFixed(2)}`} />
                        </div>

                        {parlay.notes?.length ? (
                          <div style={notesWrapStyle}>
                            {parlay.notes.map((note) => (
                              <span key={note} style={notePillStyle}>
                                {note}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <SavedPlacedParlaysLedgerPanel
        savedPlacedParlays={safeSavedPlacedParlays}
        savedLegUsageMap={savedLegUsageMap}
        onClearSavedParlays={onClearSavedParlays}
        onDeleteSavedParlay={onDeleteSavedParlay}
        onUpdateSavedParlay={onUpdateSavedParlay}
        onConfirmSavedParlayPlaced={onConfirmSavedParlayPlaced}
        onSetSavedParlayResult={onSetSavedParlayResult}
        formatSavedDateTime={formatSavedDateTime}
      />
    </section>
  );
}

function repairMojibakeText(value) {
  if (typeof value !== "string") return value;

  return value
    .replace(/Ã¢â‚¬Â¢/g, "•")
    .replace(/Ã¢â‚¬â€/g, "—")
    .replace(/Ã¢â‚¬â€œ/g, "–")
    .replace(/Ã¢â‚¬Ëœ/g, "‘")
    .replace(/Ã¢â‚¬â„¢/g, "’")
    .replace(/Ã¢â‚¬Å“/g, "“")
    .replace(/Ã¢â‚¬Â/g, "”")
    .replace(/Ã¢â‚¬Â¦/g, "…")
    .replace(/Ã¢â€°Ë†/g, "≈")
    .replace(/Ã¢â€ Â/g, "←")
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢/g, "•")
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â/g, "—")
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“/g, "–")
    .replace(/ÃƒÂ¢Ã¢â‚¬Â°Ã‹â€ /g, "≈")
    .replace(/â†/g, "←")
    .replace(/â€¢/g, "•")
    .replace(/â€”/g, "—")
    .replace(/â€“/g, "–")
    .replace(/â€¦/g, "…")
    .replace(/â‰ˆ/g, "≈")
    .replace(/âœ…/g, "✅")
    .replace(/âž¡ï¸/g, "➡️")
    .replace(/Ã—/g, "×");
}


function repairMojibakeDeep(value) {
  if (typeof value === "string") return repairMojibakeText(value);

  if (Array.isArray(value)) {
    return value.map((item) => repairMojibakeDeep(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, repairMojibakeDeep(item)])
    );
  }

  return value;
}

function americanToDecimalLocal(value) {
  const odds = Number(value);

  if (!Number.isFinite(odds) || odds === 0) return null;
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

function decimalToAmericanLocal(decimal) {
  const value = Number(decimal);

  if (!Number.isFinite(value) || value <= 1) return null;
  if (value >= 2) return Math.round((value - 1) * 100);
  return Math.round(-100 / (value - 1));
}

function applyProfitBoostToDecimalLocal(decimal, boostPct) {
  const value = Number(decimal);
  const boost = Number(boostPct || 0) / 100;

  if (!Number.isFinite(value) || value <= 1) return null;
  return 1 + (value - 1) * (1 + boost);
}

function buildActualSgpRegrade(parlay, rawActualAmerican, stakeOverride) {
  const actualRawDecimal = americanToDecimalLocal(rawActualAmerican);
  const fairHitProbability = Number(parlay?.fairHitProbability);
  const boostPct = Number(parlay?.boostPctUsed || 0);
  const enteredStakeText = String(stakeOverride ?? "").trim();
  const enteredStake = Number(enteredStakeText);
  const originalExpectedProfit = Number(parlay?.expectedProfitAtStake);
  const originalExpectedValuePct = Number(parlay?.expectedValuePct);
  const impliedOriginalStake =
    Number.isFinite(originalExpectedProfit) &&
    Number.isFinite(originalExpectedValuePct) &&
    Math.abs(originalExpectedValuePct) > 0.000001
      ? originalExpectedProfit / originalExpectedValuePct
      : 0;
  const stake =
    enteredStakeText !== "" && Number.isFinite(enteredStake)
      ? enteredStake
      : Number(parlay?.stake || impliedOriginalStake || 0);

  if (
    !Number.isFinite(actualRawDecimal) ||
    !Number.isFinite(fairHitProbability) ||
    fairHitProbability <= 0 ||
    fairHitProbability >= 1
  ) {
    return null;
  }

  const actualBoostedDecimal = applyProfitBoostToDecimalLocal(actualRawDecimal, boostPct);
  const actualRawAmerican = decimalToAmericanLocal(actualRawDecimal);
  const actualBoostedAmerican = decimalToAmericanLocal(actualBoostedDecimal);

  const actualRawEvPct =
    fairHitProbability * (actualRawDecimal - 1) - (1 - fairHitProbability);

  const actualBoostedEvPct =
    fairHitProbability * (actualBoostedDecimal - 1) - (1 - fairHitProbability);

  return {
    actualRawDecimal,
    actualBoostedDecimal,
    actualRawAmerican,
    actualBoostedAmerican,
    actualRawEvPct,
    actualBoostedEvPct,
    actualStakeUsed: stake,
    actualExpectedProfitAtStake: stake * actualBoostedEvPct,
  };
}
function normalizeLegKeyPart(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildSavedLegKeyFromLeg(leg = {}) {
  return [
    normalizeLegKeyPart(leg.sport),
    normalizeLegKeyPart(leg.eventName),
    normalizeLegKeyPart(leg.marketType),
    normalizeLegKeyPart(leg.subjectName),
    normalizeLegKeyPart(leg.selectionLabel),
    normalizeLegKeyPart(leg.lineValue),
  ].join("::");
}

function getSavedLegUsage(leg, usageMap) {
  if (!usageMap) return null;

  const key = leg.savedLegKey || buildSavedLegKeyFromLeg(leg);
  if (typeof usageMap.get === "function") return usageMap.get(key) || null;
  return usageMap[key] || null;
}

function formatBlockedLegLabel(leg = {}) {
  if (leg.displayLabel) return leg.displayLabel;
  return formatLegSelection(leg);
}

function buildToolsLink(parlay) {
  const params = new URLSearchParams();
  params.set("rawOdds", formatAmerican(parlay.rawParlayAmerican));
  params.set("boostedOdds", formatAmerican(parlay.boostedParlayAmerican));
  params.set("fairHit", String(parlay.fairHitProbability || ""));
  params.set("stake", "10");
  return `/tools?${params.toString()}`;
}

function formatLegSelection(leg) {
  if (leg?.displayLabel) return leg.displayLabel;
  const marketLabel = formatMarketLabel(leg.marketType, leg.sport);
  const selection = String(leg.selectionLabel || "Selection");
  const subjectName = String(leg.subjectName || "").trim();
  const lineText = formatLineValue(leg.lineValue, { signed: leg.marketType === "spread" });

  if (subjectName) {
    return `${subjectName} ${selection}${lineText ? ` ${lineText}` : ""} ${marketLabel}`.trim();
  }

  if (leg.marketType === "spread") return `${selection}${lineText ? ` ${lineText}` : ""}`;
  if (leg.marketType === "total") return `${selection}${lineText ? ` ${lineText}` : ""}`;

  return `${selection}${lineText ? ` ${lineText}` : ""}`;
}

function formatLineValue(value, { signed = false } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "";
  const n = Number(value);
  return signed && n > 0 ? `+${n}` : `${n}`;
}

function formatMarketLabel(value, sport = "") {
  const text = String(value || "");
  const sportKey = String(sport || "").trim().toUpperCase();

  if (text === "spread" && sportKey === "MLB") return "Run Line";
  if (text === "spread") return "Spread";
  if (text === "total" && sportKey === "MLB") return "Total Runs";
  if (text === "total") return "Total";

  const labels = {
    moneyline_2way: "Moneyline",
    moneyline_3way: "3-Way Moneyline",
    player_points: "Points",
    player_assists: "Assists",
    player_rebounds: "Rebounds",
    player_threes: "Threes",
    player_pra: "PRA",
    player_goals: "Goals",
    player_shots_on_goal: "Shots On Goal",
    player_saves: "Saves",
    player_power_play_points: "Power Play Points",
    player_blocked_shots: "Blocked Shots",
  };

  return labels[text] || text.replace(/_/g, " ");
}

function MetricRow({ label, value }) {
  return (
    <div style={metricCardStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
    </div>
  );
}

function convertOdds(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  if (/^[+-]\d+/.test(text)) {
    const american = Number(text);
    if (!Number.isFinite(american)) return null;
    const decimal = american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
    return { type: "american_to_decimal", american, decimal };
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    const decimal = Number(text);
    if (!Number.isFinite(decimal) || decimal <= 1) return null;
    const american = decimal >= 2 ? (decimal - 1) * 100 : -100 / (decimal - 1);
    return { type: "decimal_to_american", decimal, american };
  }

  return null;
}

function formatAmerican(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`;
}

function formatPct(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "â€”";
  return `${(value * 100).toFixed(2)}%`;
}

function formatDevigMethodLabel(value) {
  const key = String(value || "power").toLowerCase();
  if (key === "additive") return "Additive";
  if (key === "multiplicative") return "Multiplicative";
  if (key === "shin") return "Shin-style";
  return "Power";
}

const sectionStyle = { background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 16, marginBottom: 16 };
const sectionHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" };
const h2Style = { marginTop: 0, marginBottom: 8 };
const subtleStyle = { color: "#666", fontSize: 13 };
const collapsedNoticeStyle = { border: "1px dashed #d1d5db", background: "#f9fafb", borderRadius: 10, padding: 10, color: "#6b7280", fontWeight: 700, marginBottom: 12 };
const cardStyle = { border: "1px solid #e6e6e6", borderRadius: 10, padding: 12, background: "#fafafa" };
const cardHeaderStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" };
const toggleButtonStyle = { background: "#166534", color: "#f0fdf4", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: 700 };
const parlayActionRowStyle = { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 };
const toolsLinkStyle = { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "8px 12px", borderRadius: 8, background: "#fff", color: "#166534", border: "1px solid #86efac", textDecoration: "none", fontWeight: 700 };
const metricsGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 12 };
const metricCardStyle = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 };
const metricLabelStyle = { fontSize: 12, color: "#6b7280", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" };
const metricValueStyle = { fontSize: 15, color: "#111827", fontWeight: 800 };
const legBreakdownRowStyle = { background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" };
const legBreakdownMetaStyle = { marginTop: 4, fontSize: 13, color: "#4b5563" };
const legBreakdownEvStyle = { fontWeight: 800, color: "#166534" };
const legBreakdownEvNegativeStyle = { fontWeight: 800, color: "#b45309" };
const notesWrapStyle = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 };
const notePillStyle = { background: "#ecfdf5", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 700 };
const converterBlockStyle = { marginBottom: 12 };
const converterLabelStyle = { fontSize: 12, fontWeight: 800, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" };
const converterWrapStyle = { display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" };
const converterInputStyle = { padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", minWidth: 140, fontWeight: 700 };
const converterResultStyle = { fontWeight: 800, fontSize: 14, color: "#111827" };
const emptyWarningStyle = { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 10, padding: 12, fontWeight: 800 };
const countsRowStyle = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 };
const countPillStyle = { background: "#f3f4f6", color: "#374151", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700 };
const rejectionsRowStyle = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 };
const rejectionPillStyle = { background: "#fff7ed", color: "#9a3412", border: "1px solid #fdba74", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700 };
const saveControlWrapStyle = { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "flex-end" };
const miniLabelStyle = { display: "grid", gap: 4, fontSize: 11, color: "#374151", fontWeight: 900 };
const boostSelectStyle = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 9px", fontSize: 12, fontWeight: 700, background: "#fff", minWidth: 220 };
const stakeInputStyle = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 9px", fontSize: 12, fontWeight: 700, background: "#fff", width: 100 };
const savePlacedButtonStyle = { border: "1px solid #86efac", background: "#166534", color: "#f0fdf4", borderRadius: 8, padding: "8px 10px", fontWeight: 800, cursor: "pointer" };
const usedLegBadgeStyle = { display: "inline-block", marginLeft: 8, padding: "2px 7px", borderRadius: 999, background: "#fef3c7", border: "1px solid #f59e0b", color: "#92400e", fontSize: 11, fontWeight: 900 };
const blockedLegsPanelStyle = { border: "1px solid #fbbf24", background: "#fffbeb", borderRadius: 12, padding: 12, marginBottom: 12 };
const blockedLegsTitleStyle = { fontWeight: 900, color: "#92400e", marginBottom: 3 };
const blockedLegsSubtleStyle = { color: "#92400e", fontSize: 12, fontWeight: 700, marginBottom: 8 };
const blockedLegsListStyle = { display: "flex", flexWrap: "wrap", gap: 8 };
const blockedLegPillStyle = { display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid #fbbf24", background: "#fff", color: "#78350f", borderRadius: 999, padding: "5px 8px", fontSize: 12, fontWeight: 800 };
const removeBlockedLegButtonStyle = { border: "1px solid #fca5a5", background: "#fff", color: "#991b1b", borderRadius: 999, padding: "2px 6px", fontSize: 11, fontWeight: 900, cursor: "pointer" };
const legTitleRowStyle = { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" };
const blockLegButtonStyle = { border: "1px solid #fca5a5", background: "#fff", color: "#991b1b", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 900, cursor: "pointer" };
const devigWarningStyle = { marginTop: 10, border: "1px solid #f59e0b", background: "#fffbeb", color: "#92400e", borderRadius: 10, padding: 10, fontSize: 13, display: "grid", gap: 4 };
const devigButtonRowStyle = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 };
const devigCalcButtonStyle = { border: "1px solid #f59e0b", background: "#fff", color: "#92400e", borderRadius: 8, padding: "6px 9px", fontWeight: 900, cursor: "pointer" };
const recommendedBoxStyle = { marginTop: 10, border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 10, padding: 10, color: "#1e3a8a" };


const sgpOverrideBoxStyle = {
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #fbbf24",
  background: "#fffbeb",
};
const sgpWarningStyle = {
  fontSize: 12,
  fontWeight: 800,
  color: "#92400e",
  marginBottom: 8,
};
const sgpGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 8,
};
const actualSgpRegradeGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 8,
  marginTop: 8,
};
