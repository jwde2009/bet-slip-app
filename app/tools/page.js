"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function ToolsPage() {
  const searchParams = useSearchParams();

  const [americanDecimalInput, setAmericanDecimalInput] = useState("");
  const [impliedOddsInput, setImpliedOddsInput] = useState("-110");

  const [novigA, setNovigA] = useState("-110");
  const [novigB, setNovigB] = useState("-110");

  const [singleBetOdds, setSingleBetOdds] = useState("+150");
  const [singleBetProb, setSingleBetProb] = useState("0.43");
  const [singleBetStake, setSingleBetStake] = useState("25");
  const [singleBetLabel, setSingleBetLabel] = useState("");

  const [singleBetBankroll, setSingleBetBankroll] = useState("6000");
  const [singleBetKellyFraction, setSingleBetKellyFraction] = useState("0.25");
  const [yourStake, setYourStake] = useState("25");

  const [boostOdds, setBoostOdds] = useState("+200");
  const [boostPct, setBoostPct] = useState("20");

  const [parlayLegsInput, setParlayLegsInput] = useState("+150, -110, +200");
  const [parlayBoostPct, setParlayBoostPct] = useState("0");
  const [parlayProbInput, setParlayProbInput] = useState("0.40, 0.52, 0.33");
  const [parlayLabelsInput, setParlayLabelsInput] = useState("Leg 1 || Leg 2 || Leg 3");

  const [boostFinderBoostPct, setBoostFinderBoostPct] = useState("30");
  const [boostFinderCandidates, setBoostFinderCandidates] = useState(
    "Orlando Magic | +100 | 0.4666\nPhiladelphia 76ers | -118 | 0.5334\nMiami Heat | +176 | 0.3362\nCharlotte Hornets | -210 | 0.6638"
  );

  const [edgeFinderRows, setEdgeFinderRows] = useState(
    "Miami Heat | +176 | +197\nCharlotte Hornets | -210 | -197\nOrlando Magic | +100 | +114\nPhiladelphia 76ers | -118 | -114\nGolden State Warriors | +150 | +166\nLos Angeles Clippers | -178 | -166"
  );
  const [edgeFinderMinPct, setEdgeFinderMinPct] = useState("0");

  const [hedgeOddsA, setHedgeOddsA] = useState("+150");
  const [hedgeStakeA, setHedgeStakeA] = useState("100");
  const [hedgeOddsB, setHedgeOddsB] = useState("-160");

  useEffect(() => {
    const legsFromUrl = searchParams.get("legs");
    const boostFromUrl = searchParams.get("boost");
    const probsFromUrl = searchParams.get("probs");
    const labelsFromUrl = searchParams.get("labels");
    const edgeRowsFromUrl = searchParams.get("edgeRows");
    const edgeMinPctFromUrl = searchParams.get("edgeMinPct");

    const singleOddsFromUrl = searchParams.get("singleOdds");
    const singleProbFromUrl = searchParams.get("singleProb");
    const singleStakeFromUrl = searchParams.get("singleStake");
    const singleBankrollFromUrl = searchParams.get("singleBankroll");
    const singleKellyFractionFromUrl = searchParams.get("singleKellyFraction");
    const singleLabelFromUrl = searchParams.get("singleLabel");

    const boostCandidatesFromUrl = searchParams.get("boostCandidates");
    const boostPctFromUrl = searchParams.get("boostPct");

    if (legsFromUrl) setParlayLegsInput(legsFromUrl);
    if (boostFromUrl) setParlayBoostPct(boostFromUrl);
    if (probsFromUrl) setParlayProbInput(probsFromUrl);
    if (labelsFromUrl) setParlayLabelsInput(labelsFromUrl);
    if (edgeRowsFromUrl) setEdgeFinderRows(edgeRowsFromUrl);
    if (edgeMinPctFromUrl) setEdgeFinderMinPct(edgeMinPctFromUrl);

    if (singleOddsFromUrl) setSingleBetOdds(singleOddsFromUrl);
    if (singleProbFromUrl) setSingleBetProb(singleProbFromUrl);
    if (singleStakeFromUrl) setSingleBetStake(singleStakeFromUrl);
    if (singleBankrollFromUrl) setSingleBetBankroll(singleBankrollFromUrl);
    if (singleKellyFractionFromUrl) setSingleBetKellyFraction(singleKellyFractionFromUrl);
    if (singleLabelFromUrl) setSingleBetLabel(singleLabelFromUrl);

    if (boostCandidatesFromUrl) setBoostFinderCandidates(boostCandidatesFromUrl);
    if (boostPctFromUrl) setBoostFinderBoostPct(boostPctFromUrl);
  }, [searchParams]);

  const convertedOdds = useMemo(
    () => convertOddsValue(americanDecimalInput),
    [americanDecimalInput]
  );

  const impliedResult = useMemo(() => {
    const decimal = parseOddsToDecimal(impliedOddsInput);
    if (!Number.isFinite(decimal) || decimal <= 1) return null;

    const impliedProb = 1 / decimal;

    return {
      decimal,
      american: decimalToAmerican(decimal),
      impliedProb,
      breakEvenProb: impliedProb,
    };
  }, [impliedOddsInput]);

  const noVigResult = useMemo(() => {
    const decA = parseOddsToDecimal(novigA);
    const decB = parseOddsToDecimal(novigB);
    if (!Number.isFinite(decA) || !Number.isFinite(decB)) return null;

    const impA = 1 / decA;
    const impB = 1 / decB;
    const total = impA + impB;
    if (!(total > 0)) return null;

    const fairProbA = impA / total;
    const fairProbB = impB / total;

    return {
      fairProbA,
      fairProbB,
      fairAmericanA: decimalToAmerican(1 / fairProbA),
      fairAmericanB: decimalToAmerican(1 / fairProbB),
      holdPct: (total - 1) * 100,
    };
  }, [novigA, novigB]);

  const singleBetResult = useMemo(() => {
    const decimal = parseOddsToDecimal(singleBetOdds);
    const fairProbability = Number(singleBetProb);
    const stake = Number(singleBetStake);

    if (
      !Number.isFinite(decimal) ||
      !Number.isFinite(fairProbability) ||
      !Number.isFinite(stake)
    ) {
      return null;
    }

    const evPct = fairProbability * (decimal - 1) - (1 - fairProbability);
    const expectedProfit = stake * evPct;

    return {
      decimal,
      evPct,
      expectedProfit,
    };
  }, [singleBetOdds, singleBetProb, singleBetStake]);

  const stakeComparisonResult = useMemo(() => {
    const decimal = parseOddsToDecimal(singleBetOdds);
    const fairProbability = Number(singleBetProb);
    const bankroll = Number(singleBetBankroll);
    const fraction = Number(singleBetKellyFraction);
    const stake = Number(yourStake);

    if (
      !Number.isFinite(decimal) ||
      !Number.isFinite(fairProbability) ||
      !Number.isFinite(bankroll) ||
      !Number.isFinite(fraction) ||
      !Number.isFinite(stake)
    ) {
      return null;
    }

    const b = decimal - 1;
    const q = 1 - fairProbability;
    const fullKelly = (b * fairProbability - q) / b;
    const suggestedStake = bankroll * Math.max(0, fullKelly) * fraction;
    const diff = stake - suggestedStake;
    const diffPct = suggestedStake > 0 ? diff / suggestedStake : null;

    let label = "Aligned";
    if (Number.isFinite(diffPct)) {
      if (diffPct > 0.2) label = "Overbetting";
      else if (diffPct < -0.2) label = "Underbetting";
    }

    return {
      suggestedStake,
      diff,
      diffPct,
      label,
    };
  }, [
    singleBetOdds,
    singleBetProb,
    singleBetBankroll,
    singleBetKellyFraction,
    yourStake,
  ]);

  const boostResult = useMemo(() => {
    const decimal = parseOddsToDecimal(boostOdds);
    const pct = Number(boostPct);

    if (!Number.isFinite(decimal) || !Number.isFinite(pct)) return null;

    const boostedDecimal = applyProfitBoostToDecimal(decimal, pct);
    const boostedAmerican = decimalToAmerican(boostedDecimal);

    return {
      baseDecimal: decimal,
      boostedDecimal,
      boostedAmerican,
    };
  }, [boostOdds, boostPct]);

  const parlayResult = useMemo(() => {
    const parts = String(parlayLegsInput || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!parts.length) return null;

    const decimals = parts.map(parseOddsToDecimal);
    if (decimals.some((d) => !Number.isFinite(d) || d <= 1)) return null;

    const rawDecimal = decimals.reduce((acc, d) => acc * d, 1);
    const rawAmerican = decimalToAmerican(rawDecimal);

    const boost = Number(parlayBoostPct);
    const boostedDecimal = Number.isFinite(boost)
      ? applyProfitBoostToDecimal(rawDecimal, boost)
      : rawDecimal;
    const boostedAmerican = decimalToAmerican(boostedDecimal);

    const impliedProb = 1 / rawDecimal;

    const probParts = String(parlayProbInput || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));

    const labelParts = String(parlayLabelsInput || "")
      .split("||")
      .map((s) => s.trim())
      .filter(Boolean);

    let fairHitProb = null;
    let evPct = null;

    if (
      probParts.length === decimals.length &&
      probParts.every((p) => p > 0 && p < 1)
    ) {
      fairHitProb = probParts.reduce((acc, p) => acc * p, 1);
      evPct = fairHitProb * (boostedDecimal - 1) - (1 - fairHitProb);
    }

    return {
      legCount: decimals.length,
      rawDecimal,
      rawAmerican,
      boostedDecimal,
      boostedAmerican,
      impliedProb,
      fairHitProb,
      evPct,
      labels:
        labelParts.length === decimals.length
          ? labelParts
          : decimals.map((_, idx) => `Leg ${idx + 1}`),
    };
  }, [parlayLegsInput, parlayBoostPct, parlayProbInput, parlayLabelsInput]);

  const boostFinderResult = useMemo(() => {
    const boost = Number(boostFinderBoostPct);

    return String(boostFinderCandidates || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, oddsRaw, fairProbRaw] = line.split("|").map((s) => s.trim());
        const decimal = parseOddsToDecimal(oddsRaw);
        const fairProbability = Number(fairProbRaw);

        if (!label || !Number.isFinite(decimal) || !Number.isFinite(fairProbability)) {
          return null;
        }

        const boostedDecimal = applyProfitBoostToDecimal(decimal, boost);
        const boostedAmerican = decimalToAmerican(boostedDecimal);
        const evPct = fairProbability * (boostedDecimal - 1) - (1 - fairProbability);

        return {
          label,
          boostedAmerican,
          evPct,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.evPct - a.evPct);
  }, [boostFinderBoostPct, boostFinderCandidates]);

  const edgeFinderResult = useMemo(() => {
    const minPct = Number(edgeFinderMinPct) / 100;

    return String(edgeFinderRows || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, targetOddsRaw, fairOddsRaw] = line.split("|").map((s) => s.trim());
        const targetDecimal = parseOddsToDecimal(targetOddsRaw);
        const fairDecimal = parseOddsToDecimal(fairOddsRaw);

        if (!label || !Number.isFinite(targetDecimal) || !Number.isFinite(fairDecimal)) {
          return null;
        }

        const fairProbability = 1 / fairDecimal;
        const edgePct = targetDecimal / fairDecimal - 1;
        const evPct = fairProbability * (targetDecimal - 1) - (1 - fairProbability);

        return {
          label,
          edgePct,
          evPct,
        };
      })
      .filter(Boolean)
      .filter((row) => row.edgePct >= minPct)
      .sort((a, b) => b.edgePct - a.edgePct);
  }, [edgeFinderRows, edgeFinderMinPct]);

  const hedgeResult = useMemo(() => {
    const decA = parseOddsToDecimal(hedgeOddsA);
    const decB = parseOddsToDecimal(hedgeOddsB);
    const stakeA = Number(hedgeStakeA);

    if (!Number.isFinite(decA) || !Number.isFinite(decB) || !Number.isFinite(stakeA)) {
      return null;
    }

    const payoutA = stakeA * decA;
    const hedgeStakeB = payoutA / decB;
    const totalStaked = stakeA + hedgeStakeB;
    const guaranteedProfit = payoutA - totalStaked;

    return {
      hedgeStakeB,
      guaranteedProfit,
    };
  }, [hedgeOddsA, hedgeStakeA, hedgeOddsB]);

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={{ marginTop: 0, marginBottom: 8 }}>Betting Tools</h1>
            <p style={{ marginTop: 0, marginBottom: 0, color: "#555" }}>
              Quick calculators for line conversion, no-vig pricing, EV, boosts, Kelly sizing, and hedging.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/ev-parlay-lab" style={primaryLinkStyle}>
              EV Parlay Lab
            </Link>
            <Link href="/" style={secondaryLinkStyle}>
              Bet Slip App
            </Link>
          </div>
        </div>

        <div style={gridStyle}>
          <ToolCard title="American ↔ Decimal" icon="🔄">
            <label style={labelStyle}>
              Odds
              <input
                value={americanDecimalInput}
                onChange={(e) => setAmericanDecimalInput(e.target.value)}
                placeholder="+150 or 2.50"
                style={inputStyle}
              />
            </label>

            <div style={resultBoxStyle}>
              {convertedOdds ? (
                convertedOdds.type === "american_to_decimal" ? (
                  <div>Decimal: <strong>{convertedOdds.decimal.toFixed(3)}</strong></div>
                ) : (
                  <div>American: <strong>{formatAmerican(convertedOdds.american)}</strong></div>
                )
              ) : (
                <div>Enter +150, -200, 2.50, etc.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard title="Implied Probability / Break-Even" icon="🎲">
            <label style={labelStyle}>
              Odds
              <input
                value={impliedOddsInput}
                onChange={(e) => setImpliedOddsInput(e.target.value)}
                placeholder="-110 or 1.91"
                style={inputStyle}
              />
            </label>

            <div style={resultBoxStyle}>
              {impliedResult ? (
                <>
                  <div>American: <strong>{formatAmerican(impliedResult.american)}</strong></div>
                  <div>Decimal: <strong>{impliedResult.decimal.toFixed(3)}</strong></div>
                  <div>Implied Win %: <strong>{(impliedResult.impliedProb * 100).toFixed(2)}%</strong></div>
                  <div>Break-Even %: <strong>{(impliedResult.breakEvenProb * 100).toFixed(2)}%</strong></div>
                </>
              ) : (
                <div>Enter valid odds like -110, +150, or 1.91.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard title="No-Vig Calculator (2-way)" icon="🧮">
            <label style={labelStyle}>
              Side A Odds
              <input value={novigA} onChange={(e) => setNovigA(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Side B Odds
              <input value={novigB} onChange={(e) => setNovigB(e.target.value)} style={inputStyle} />
            </label>

            <div style={resultBoxStyle}>
              {noVigResult ? (
                <>
                  <div>Fair Prob A: <strong>{(noVigResult.fairProbA * 100).toFixed(2)}%</strong></div>
                  <div>Fair Prob B: <strong>{(noVigResult.fairProbB * 100).toFixed(2)}%</strong></div>
                  <div>Fair A: <strong>{formatAmerican(noVigResult.fairAmericanA)}</strong></div>
                  <div>Fair B: <strong>{formatAmerican(noVigResult.fairAmericanB)}</strong></div>
                  <div>
                    Hold:{" "}
                    <ResultValue value={-Math.abs(noVigResult.holdPct)}>
                      {noVigResult.holdPct.toFixed(2)}%
                    </ResultValue>
                  </div>
                </>
              ) : (
                <div>Enter two valid prices.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard title="Single Bet EV Finder" icon="🎯">
            {singleBetLabel ? (
              <div style={selectedBetBannerStyle}>
                {singleBetLabel}
              </div>
            ) : null}
            
            <label style={labelStyle}>
              Odds
              <input value={singleBetOdds} onChange={(e) => setSingleBetOdds(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Fair Probability
              <input value={singleBetProb} onChange={(e) => setSingleBetProb(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Stake
              <input value={singleBetStake} onChange={(e) => setSingleBetStake(e.target.value)} style={inputStyle} />
            </label>

            <div style={resultBoxStyle}>
              {singleBetResult ? (
                <>
                  <div>
                    EV %:{" "}
                    <ResultValue value={singleBetResult.evPct}>
                      {(singleBetResult.evPct * 100).toFixed(2)}%
                    </ResultValue>
                  </div>
                  <div>
                    Expected $:{" "}
                    <ResultValue value={singleBetResult.expectedProfit}>
                      ${singleBetResult.expectedProfit.toFixed(2)}
                    </ResultValue>
                  </div>
                </>
              ) : (
                <div>Enter valid odds, fair probability, and stake.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard title="Stake Comparison" icon="⚖️" defaultCollapsed={true}>
            {singleBetLabel ? (
              <div style={selectedBetBannerStyle}>
                {singleBetLabel}
              </div>
            ) : null}

            <label style={labelStyle}>
              Odds
              <input value={singleBetOdds} onChange={(e) => setSingleBetOdds(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Fair Probability
              <input value={singleBetProb} onChange={(e) => setSingleBetProb(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Bankroll
              <input value={singleBetBankroll} onChange={(e) => setSingleBetBankroll(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Kelly Fraction
              <input value={singleBetKellyFraction} onChange={(e) => setSingleBetKellyFraction(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Your Stake
              <input value={yourStake} onChange={(e) => setYourStake(e.target.value)} style={inputStyle} />
            </label>

            <div style={resultBoxStyle}>
              {stakeComparisonResult ? (
                <>
                  <div>Model Label: <strong>{stakeComparisonResult.label}</strong></div>
                  <div>
                    Suggested Stake:{" "}
                    <ResultValue value={stakeComparisonResult.suggestedStake}>
                      ${stakeComparisonResult.suggestedStake.toFixed(2)}
                    </ResultValue>
                  </div>
                  <div>
                    Difference:{" "}
                    <ResultValue value={stakeComparisonResult.diff}>
                      ${stakeComparisonResult.diff.toFixed(2)}
                    </ResultValue>
                  </div>
                  <div>
                    Difference %:{" "}
                    {Number.isFinite(stakeComparisonResult.diffPct) ? (
                      <ResultValue value={stakeComparisonResult.diffPct}>
                        {(stakeComparisonResult.diffPct * 100).toFixed(2)}%
                      </ResultValue>
                    ) : (
                      "—"
                    )}
                  </div>
                </>
              ) : (
                <div>Enter valid odds, probability, bankroll, Kelly fraction, and stake.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard title="Boost Calculator" icon="⚡" defaultCollapsed={true}>
            <label style={labelStyle}>
              Base Odds
              <input value={boostOdds} onChange={(e) => setBoostOdds(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Boost %
              <input value={boostPct} onChange={(e) => setBoostPct(e.target.value)} style={inputStyle} />
            </label>

            <div style={resultBoxStyle}>
              {boostResult ? (
                <>
                  <div>Boosted Decimal: <strong>{boostResult.boostedDecimal.toFixed(3)}</strong></div>
                  <div>Boosted American: <strong>{formatAmerican(boostResult.boostedAmerican)}</strong></div>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(formatAmerican(boostResult.boostedAmerican))
                    }
                    style={copyButtonStyle}
                  >
                    Copy Boosted American
                  </button>
                </>
              ) : (
                <div>Enter valid base odds and boost %.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard title="Parlay EV Calculator" icon="🎯" defaultCollapsed={true}>
            <label style={labelStyle}>
              Legs (comma separated)
              <input
                value={parlayLegsInput}
                onChange={(e) => setParlayLegsInput(e.target.value)}
                placeholder="+150, -110, +200"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Fair Probabilities (comma separated)
              <input
                value={parlayProbInput}
                onChange={(e) => setParlayProbInput(e.target.value)}
                placeholder="0.40, 0.52, 0.33"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Leg Labels (separate with ||)
              <textarea
                value={parlayLabelsInput}
                onChange={(e) => setParlayLabelsInput(e.target.value)}
                placeholder="Game 1 — Team A ML || Game 2 — Team B ML"
                style={textareaStyle}
              />
            </label>

            <label style={labelStyle}>
              Boost %
              <input
                value={parlayBoostPct}
                onChange={(e) => setParlayBoostPct(e.target.value)}
                style={inputStyle}
              />
            </label>

            <div style={resultBoxStyle}>
              {parlayResult ? (
                <>
                  <div>Legs: <strong>{parlayResult.legCount}</strong></div>
                  <div>
                    Leg Labels:
                    <div style={parlayLabelListStyle}>
                      {parlayResult.labels.map((label) => (
                        <div key={label} style={parlayLabelItemStyle}>
                          • {label}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>Raw Decimal: <strong>{parlayResult.rawDecimal.toFixed(3)}</strong></div>
                  <div>Raw American: <strong>{formatAmerican(parlayResult.rawAmerican)}</strong></div>
                  <div>Implied Hit %: <strong>{(parlayResult.impliedProb * 100).toFixed(2)}%</strong></div>
                  <div>Boosted Decimal: <strong>{parlayResult.boostedDecimal.toFixed(3)}</strong></div>
                  <div>Boosted American: <strong>{formatAmerican(parlayResult.boostedAmerican)}</strong></div>
                  <div>
                    Fair Hit %:{" "}
                    {Number.isFinite(parlayResult.fairHitProb) ? (
                      <strong>{(parlayResult.fairHitProb * 100).toFixed(2)}%</strong>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div>
                    EV %:{" "}
                    {Number.isFinite(parlayResult.evPct) ? (
                      <ResultValue value={parlayResult.evPct}>
                        {(parlayResult.evPct * 100).toFixed(2)}%
                      </ResultValue>
                    ) : (
                      "—"
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(formatAmerican(parlayResult.boostedAmerican))
                    }
                    style={copyButtonStyle}
                  >
                    Copy Boosted American
                  </button>
                </>
              ) : (
                <div>Enter valid comma-separated odds like +150, -110, +200.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard title="Boost Targeting Tool" icon="🚀" defaultCollapsed={true}>
            <label style={labelStyle}>
              Boost %
              <input value={boostFinderBoostPct} onChange={(e) => setBoostFinderBoostPct(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Candidates (Selection | Odds | Fair Probability)
              <textarea
                value={boostFinderCandidates}
                onChange={(e) => setBoostFinderCandidates(e.target.value)}
                style={textareaStyle}
              />
            </label>

            <div style={resultBoxStyle}>
              {boostFinderResult.length ? (
                boostFinderResult.map((row) => (
                  <div key={row.label}>
                    <strong>{row.label}</strong> — Boosted {formatAmerican(row.boostedAmerican)} • EV{" "}
                    <ResultValue value={row.evPct}>
                      {(row.evPct * 100).toFixed(2)}%
                    </ResultValue>
                  </div>
                ))
              ) : (
                <div>No valid candidates.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard title="Edge Finder" icon="🔎" defaultCollapsed={true}>
            <label style={labelStyle}>
              Minimum Edge %
              <input value={edgeFinderMinPct} onChange={(e) => setEdgeFinderMinPct(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Rows (Selection | Target Odds | Fair Odds)
              <textarea
                value={edgeFinderRows}
                onChange={(e) => setEdgeFinderRows(e.target.value)}
                style={textareaStyle}
              />
            </label>

            <div style={resultBoxStyle}>
              {edgeFinderResult.length ? (
                edgeFinderResult.map((row) => (
                  <div key={row.label}>
                    <strong>{row.label}</strong> — Edge{" "}
                    <ResultValue value={row.edgePct}>
                      {(row.edgePct * 100).toFixed(2)}%
                    </ResultValue>
                    {" "}• EV{" "}
                    <ResultValue value={row.evPct}>
                      {(row.evPct * 100).toFixed(2)}%
                    </ResultValue>
                  </div>
                ))
              ) : (
                <div>No rows above threshold.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard title="Hedge Calculator" icon="🛡️" defaultCollapsed={true}>
            <label style={labelStyle}>
              Bet A Odds
              <input value={hedgeOddsA} onChange={(e) => setHedgeOddsA(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Bet A Stake
              <input value={hedgeStakeA} onChange={(e) => setHedgeStakeA(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Hedge Odds
              <input value={hedgeOddsB} onChange={(e) => setHedgeOddsB(e.target.value)} style={inputStyle} />
            </label>

            <div style={resultBoxStyle}>
              {hedgeResult ? (
                <>
                  <div>
                    Hedge Stake:{" "}
                    <ResultValue value={hedgeResult.hedgeStakeB}>
                      ${hedgeResult.hedgeStakeB.toFixed(2)}
                    </ResultValue>
                  </div>
                  <div>
                    Guaranteed Profit:{" "}
                    <ResultValue value={hedgeResult.guaranteedProfit}>
                      ${hedgeResult.guaranteedProfit.toFixed(2)}
                    </ResultValue>
                  </div>
                </>
              ) : (
                <div>Enter valid odds and stake.</div>
              )}
            </div>
          </ToolCard>
        </div>
              </div>
    </div>
  );
}

function ToolCard({ title, icon, children, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section
        style={{
            ...cardStyle,
            ...(collapsed ? collapsedCardStyle : {}),
        }}
        >
      <div style={toolCardHeaderStyle}>
        <h2 style={cardTitleStyle}>
          <span style={cardTitleIconStyle}>{icon}</span>
          <span>{title}</span>
        </h2>

        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          style={collapseButtonStyle}
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>

      {!collapsed ? (
        <div style={{ display: "grid", gap: 10 }}>{children}</div>
        ) : null}
    </section>
  );
}

function convertOddsValue(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  if (/^[+-]\d+(\.\d+)?$/.test(text)) {
    const american = Number(text);
    const decimal = americanToDecimal(american);
    if (!Number.isFinite(decimal)) return null;

    return {
      type: "american_to_decimal",
      american,
      decimal,
    };
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    const decimal = Number(text);
    if (!Number.isFinite(decimal) || decimal <= 1) return null;

    return {
      type: "decimal_to_american",
      decimal,
      american: decimalToAmerican(decimal),
    };
  }

  return null;
}

function parseOddsToDecimal(value) {
  const text = String(value || "").trim();

  if (/^[+-]\d+(\.\d+)?$/.test(text)) {
    return americanToDecimal(Number(text));
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    const decimal = Number(text);
    return Number.isFinite(decimal) && decimal > 1 ? decimal : NaN;
  }

  return NaN;
}

function americanToDecimal(american) {
  const value = Number(american);
  if (!Number.isFinite(value)) return NaN;
  if (value > 0) return 1 + value / 100;
  return 1 + 100 / Math.abs(value);
}

function decimalToAmerican(decimal) {
  const value = Number(decimal);
  if (!Number.isFinite(value) || value <= 1) return NaN;
  if (value >= 2) return (value - 1) * 100;
  return -100 / (value - 1);
}

function applyProfitBoostToDecimal(decimalOdds, boostPct) {
  const d = Number(decimalOdds);
  const pct = Number(boostPct);

  if (!Number.isFinite(d) || d <= 1) return NaN;
  if (!Number.isFinite(pct)) return d;

  const profit = d - 1;
  const boostedProfit = profit * (1 + pct / 100);
  return 1 + boostedProfit;
}

function getValueColor(value) {
  if (!Number.isFinite(value)) return "#111827";
  if (value > 0) return "#166534";
  if (value < 0) return "#991b1b";
  return "#111827";
}

function ResultValue({ value, children }) {
  const numeric = Number(value);

  return (
    <strong
      style={{
        color: getValueColor(numeric),
        fontWeight: 800,
      }}
    >
      {children}
    </strong>
  );
}

function formatAmerican(value) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

const pageStyle = {
  padding: 20,
  background: "#f7f7f8",
  minHeight: "100vh",
  color: "#111",
};

const containerStyle = {
  maxWidth: 1200,
  margin: "0 auto",
};

const headerRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 18,
};

const primaryLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 8,
  background: "#166534",
  color: "#f0fdf4",
  textDecoration: "none",
  fontWeight: 700,
};

const secondaryLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 8,
  background: "#fff",
  color: "#166534",
  border: "1px solid #86efac",
  textDecoration: "none",
  fontWeight: 700,
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 14,
};

const toolCardHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "nowrap",
};

const collapseButtonStyle = {
  background: "#166534",
  color: "#f0fdf4",
  border: "none",
  borderRadius: 6,
  padding: "4px 8px",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 12,
};

const collapsedCardStyle = {
  paddingBottom: 10,
};

const cardStyle = {
  background: "#f0fdf4",
  border: "2px solid #166534",
  borderRadius: 12,
  padding: 16,
};

const cardTitleIconStyle = {
  marginRight: 8,
  fontSize: 20,
};

const cardTitleStyle = {
  marginTop: 0,
  marginBottom: 0,
  lineHeight: 1.2,
  fontSize: 18,
  color: "#14532d",
};

const selectedBetBannerStyle = {
  background: "#ffffff",
  border: "1px solid #bbf7d0",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  fontWeight: 700,
  color: "#166534",
};

const labelStyle = {
  display: "grid",
  gap: 6,
  fontSize: 14,
  fontWeight: 700,
  color: "#374151",
};

const parlayLabelListStyle = {
  marginTop: 6,
  display: "grid",
  gap: 4,
};

const parlayLabelItemStyle = {
  fontSize: 13,
  color: "#374151",
};

const textareaStyle = {
  minHeight: 140,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  resize: "vertical",
  fontFamily: "inherit",
};

const inputStyle = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
};

const copyButtonStyle = {
  background: "#166534",
  color: "#f0fdf4",
  border: "none",
  borderRadius: 8,
  padding: "8px 10px",
  cursor: "pointer",
  fontWeight: 700,
};

const resultBoxStyle = {
  background: "#ffffff",
  border: "1px solid #bbf7d0",
  borderRadius: 10,
  padding: 12,
  display: "grid",
  gap: 6,
  color: "#111827",
  fontSize: 14,
};