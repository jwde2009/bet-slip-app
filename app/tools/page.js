"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const SETTINGS_STORAGE_KEY = "betting-tools-settings-v2";

function ToolsPageContent() {
  const searchParams = useSearchParams();

  const [americanDecimalInput, setAmericanDecimalInput] = useState("+150");
  const [impliedOddsInput, setImpliedOddsInput] = useState("-110");

  const [novigA, setNovigA] = useState("-110");
  const [novigB, setNovigB] = useState("-110");

  const [bankroll, setBankroll] = useState("6000");
  const [kellyFraction, setKellyFraction] = useState("0.25");
  const [defaultStake, setDefaultStake] = useState("25");
  const [defaultBoostPct, setDefaultBoostPct] = useState("25");

  const [quickBookOdds, setQuickBookOdds] = useState("+150");
  const [quickTrueValue, setQuickTrueValue] = useState("43%");
  const [quickStake, setQuickStake] = useState("25");

  const [singleBetOdds, setSingleBetOdds] = useState("+150");
  const [singleBetProb, setSingleBetProb] = useState("0.43");
  const [singleBetStake, setSingleBetStake] = useState("25");
  const [singleBetLabel, setSingleBetLabel] = useState("");

  const [yourStake, setYourStake] = useState("25");

  const [boostOdds, setBoostOdds] = useState("+200");
  const [boostPct, setBoostPct] = useState("20");

  const [promoBookOdds, setPromoBookOdds] = useState("+200");
  const [promoTrueValue, setPromoTrueValue] = useState("+180");
  const [promoBoostPct, setPromoBoostPct] = useState("25");
  const [promoMaxStake, setPromoMaxStake] = useState("100");

  const [parlayLegsInput, setParlayLegsInput] = useState("+150, -110, +200");
  const [parlayBoostPct, setParlayBoostPct] = useState("0");
  const [parlayFairInput, setParlayFairInput] = useState("40%, 52%, 33%");
  const [parlayStake, setParlayStake] = useState("25");
  const [parlayLabelsInput, setParlayLabelsInput] = useState("Leg 1 || Leg 2 || Leg 3");

  const [boostFinderBoostPct, setBoostFinderBoostPct] = useState("30");
  const [boostFinderMaxStake, setBoostFinderMaxStake] = useState("10");
  const [boostFinderCandidates, setBoostFinderCandidates] = useState(
    "Orlando Magic | +100 | +114\nPhiladelphia 76ers | -118 | -114\nMiami Heat | +176 | +197\nCharlotte Hornets | -210 | -197"
  );

  const [edgeFinderRows, setEdgeFinderRows] = useState(
    "Miami Heat | +176 | +197\nCharlotte Hornets | -210 | -197\nOrlando Magic | +100 | +114\nPhiladelphia 76ers | -118 | -114\nGolden State Warriors | +150 | +166\nLos Angeles Clippers | -178 | -166"
  );
  const [edgeFinderMinPct, setEdgeFinderMinPct] = useState("0");

  const [hedgeOddsA, setHedgeOddsA] = useState("+150");
  const [hedgeStakeA, setHedgeStakeA] = useState("100");
  const [hedgeOddsB, setHedgeOddsB] = useState("-160");

  const [toolCollapseAction, setToolCollapseAction] = useState({
    mode: "",
    version: 0,
  });

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");

      if (saved.bankroll) setBankroll(saved.bankroll);
      if (saved.kellyFraction) setKellyFraction(saved.kellyFraction);
      if (saved.defaultStake) {
        setDefaultStake(saved.defaultStake);
        setQuickStake(saved.defaultStake);
        setSingleBetStake(saved.defaultStake);
        setYourStake(saved.defaultStake);
        setParlayStake(saved.defaultStake);
      }
      if (saved.defaultBoostPct) {
        setDefaultBoostPct(saved.defaultBoostPct);
        setPromoBoostPct(saved.defaultBoostPct);
      }
    } catch {
      // Ignore bad localStorage data.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          bankroll,
          kellyFraction,
          defaultStake,
          defaultBoostPct,
        })
      );
    } catch {
      // Ignore localStorage write failures.
    }
  }, [bankroll, kellyFraction, defaultStake, defaultBoostPct]);

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
    if (probsFromUrl) setParlayFairInput(probsFromUrl);
    if (labelsFromUrl) setParlayLabelsInput(labelsFromUrl);
    if (edgeRowsFromUrl) setEdgeFinderRows(edgeRowsFromUrl);
    if (edgeMinPctFromUrl) setEdgeFinderMinPct(edgeMinPctFromUrl);

    if (singleOddsFromUrl) {
      setSingleBetOdds(singleOddsFromUrl);
      setQuickBookOdds(singleOddsFromUrl);
    }
    if (singleProbFromUrl) {
      setSingleBetProb(singleProbFromUrl);
      setQuickTrueValue(singleProbFromUrl);
    }
    if (singleStakeFromUrl) {
      setSingleBetStake(singleStakeFromUrl);
      setQuickStake(singleStakeFromUrl);
    }
    if (singleBankrollFromUrl) setBankroll(singleBankrollFromUrl);
    if (singleKellyFractionFromUrl) setKellyFraction(singleKellyFractionFromUrl);
    if (singleLabelFromUrl) setSingleBetLabel(singleLabelFromUrl);

    if (boostCandidatesFromUrl) setBoostFinderCandidates(boostCandidatesFromUrl);
    if (boostPctFromUrl) setBoostFinderBoostPct(boostPctFromUrl);
  }, [searchParams]);

  const activeBankroll = Number(bankroll);
  const activeKellyFraction = Number(kellyFraction);

  const convertedOdds = useMemo(
    () => convertAnyValue(americanDecimalInput),
    [americanDecimalInput]
  );

  const impliedResult = useMemo(() => {
    const parsed = parseAnyOddsOrProbability(impliedOddsInput);
    if (!parsed) return null;

    return {
      decimal: parsed.decimal,
      american: decimalToAmerican(parsed.decimal),
      impliedProb: 1 / parsed.decimal,
      inputType: parsed.type,
    };
  }, [impliedOddsInput]);

  const noVigResult = useMemo(() => {
    const parsedA = parseAnyOddsOrProbability(novigA);
    const parsedB = parseAnyOddsOrProbability(novigB);
    if (!parsedA || !parsedB) return null;

    const impA = 1 / parsedA.decimal;
    const impB = 1 / parsedB.decimal;
    const total = impA + impB;
    if (!(total > 0)) return null;

    const fairProbA = impA / total;
    const fairProbB = impB / total;

    return {
      fairProbA,
      fairProbB,
      fairDecimalA: 1 / fairProbA,
      fairDecimalB: 1 / fairProbB,
      fairAmericanA: decimalToAmerican(1 / fairProbA),
      fairAmericanB: decimalToAmerican(1 / fairProbB),
      holdPct: (total - 1) * 100,
      inputTypeA: parsedA.type,
      inputTypeB: parsedB.type,
    };
  }, [novigA, novigB]);

  const quickBetResult = useMemo(
    () =>
      buildBetEvaluation({
        bookInput: quickBookOdds,
        trueInput: quickTrueValue,
        stakeInput: quickStake,
        bankrollInput: bankroll,
        kellyFractionInput: kellyFraction,
      }),
    [quickBookOdds, quickTrueValue, quickStake, bankroll, kellyFraction]
  );

  const singleBetResult = useMemo(
    () =>
      buildBetEvaluation({
        bookInput: singleBetOdds,
        trueInput: singleBetProb,
        stakeInput: singleBetStake,
        bankrollInput: bankroll,
        kellyFractionInput: kellyFraction,
      }),
    [singleBetOdds, singleBetProb, singleBetStake, bankroll, kellyFraction]
  );

  const stakeComparisonResult = useMemo(() => {
    const result = buildBetEvaluation({
      bookInput: singleBetOdds,
      trueInput: singleBetProb,
      stakeInput: yourStake,
      bankrollInput: bankroll,
      kellyFractionInput: kellyFraction,
    });

    if (!result) return null;

    const stake = Number(yourStake);
    const suggestedStake = result.suggestedStake;
    const diff = stake - suggestedStake;
    const diffPct = suggestedStake > 0 ? diff / suggestedStake : null;

    let label = "Aligned";
    if (Number.isFinite(diffPct)) {
      if (diffPct > 0.2) label = "Overbetting";
      else if (diffPct < -0.2) label = "Underbetting";
    } else if (suggestedStake === 0 && stake > 0) {
      label = "No Kelly Bet";
    }

    return {
      ...result,
      stake,
      suggestedStake,
      diff,
      diffPct,
      label,
    };
  }, [singleBetOdds, singleBetProb, bankroll, kellyFraction, yourStake]);

  const boostResult = useMemo(() => {
    const parsed = parseAnyOddsOrProbability(boostOdds);
    const pct = Number(boostPct);

    if (!parsed || !Number.isFinite(pct)) return null;

    const boostedDecimal = applyProfitBoostToDecimal(parsed.decimal, pct);
    const boostedAmerican = decimalToAmerican(boostedDecimal);

    return {
      baseDecimal: parsed.decimal,
      baseAmerican: decimalToAmerican(parsed.decimal),
      baseImpliedProb: 1 / parsed.decimal,
      inputType: parsed.type,
      boostedDecimal,
      boostedAmerican,
      boostedImpliedProb: 1 / boostedDecimal,
    };
  }, [boostOdds, boostPct]);

  const promoBoostResult = useMemo(() => {
    const unboosted = buildBetEvaluation({
      bookInput: promoBookOdds,
      trueInput: promoTrueValue,
      stakeInput: promoMaxStake,
      bankrollInput: bankroll,
      kellyFractionInput: kellyFraction,
      boostPctInput: 0,
    });

    const boosted = buildBetEvaluation({
      bookInput: promoBookOdds,
      trueInput: promoTrueValue,
      stakeInput: promoMaxStake,
      bankrollInput: bankroll,
      kellyFractionInput: kellyFraction,
      boostPctInput: promoBoostPct,
    });

    if (!unboosted || !boosted) return null;

    const maxStake = Number(promoMaxStake);
    const suggested = Math.min(maxStake, boosted.suggestedStake);
    const useMax = boosted.suggestedStake >= maxStake && boosted.evPct > 0;

    return {
      unboosted,
      boosted,
      maxStake,
      suggested,
      useMax,
      expectedAtMax: boosted.expectedProfit,
    };
  }, [promoBookOdds, promoTrueValue, promoBoostPct, promoMaxStake, bankroll, kellyFraction]);

  const parlayResult = useMemo(() => {
    const parts = splitCommaValues(parlayLegsInput);
    if (!parts.length) return null;

    const parsedLegs = parts.map(parseAnyOddsOrProbability);
    if (parsedLegs.some((item) => !item || !Number.isFinite(item.decimal) || item.decimal <= 1)) {
      return null;
    }

    const decimals = parsedLegs.map((item) => item.decimal);
    const rawDecimal = decimals.reduce((acc, d) => acc * d, 1);
    const rawAmerican = decimalToAmerican(rawDecimal);

    const boost = Number(parlayBoostPct);
    const boostedDecimal = Number.isFinite(boost)
      ? applyProfitBoostToDecimal(rawDecimal, boost)
      : rawDecimal;
    const boostedAmerican = decimalToAmerican(boostedDecimal);

    const impliedProb = 1 / rawDecimal;

    const fairInputs = splitCommaValues(parlayFairInput);
    const fairParsed = fairInputs.map(parseTrueProbabilityInput).filter(Boolean);

    const labelParts = String(parlayLabelsInput || "")
      .split("||")
      .map((s) => s.trim())
      .filter(Boolean);

    const stake = Number(parlayStake);
    const bankrollNum = Number(bankroll);
    const fraction = Number(kellyFraction);

    let fairHitProb = null;
    let evPct = null;
    let expectedProfit = null;
    let fullKelly = null;
    let suggestedStake = null;
    let fairDecimal = null;
    let fairAmerican = null;

    if (fairParsed.length === decimals.length) {
      fairHitProb = fairParsed.reduce((acc, item) => acc * item.probability, 1);
      fairDecimal = 1 / fairHitProb;
      fairAmerican = decimalToAmerican(fairDecimal);
      evPct = calculateEvPct(boostedDecimal, fairHitProb);
      expectedProfit = Number.isFinite(stake) ? stake * evPct : null;
      fullKelly = calculateFullKelly(boostedDecimal, fairHitProb);
      suggestedStake =
        Number.isFinite(bankrollNum) && bankrollNum > 0 && Number.isFinite(fraction) && fraction >= 0
          ? bankrollNum * Math.max(0, fullKelly) * fraction
          : null;
    }

    return {
      legCount: decimals.length,
      rawDecimal,
      rawAmerican,
      boostedDecimal,
      boostedAmerican,
      impliedProb,
      fairHitProb,
      fairDecimal,
      fairAmerican,
      evPct,
      expectedProfit,
      fullKelly,
      suggestedStake,
      stake,
      labels:
        labelParts.length === decimals.length
          ? labelParts
          : decimals.map((_, idx) => `Leg ${idx + 1}`),
      legInputTypes: parsedLegs.map((item) => item.type),
      fairInputTypes: fairParsed.map((item) => item.type),
    };
  }, [parlayLegsInput, parlayBoostPct, parlayFairInput, parlayLabelsInput, parlayStake, bankroll, kellyFraction]);

  const boostFinderResult = useMemo(() => {
    const boost = Number(boostFinderBoostPct);
    const maxStake = Number(boostFinderMaxStake);
    const bankrollNum = Number(bankroll);
    const fraction = Number(kellyFraction);

    return String(boostFinderCandidates || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, oddsRaw, trueRaw, stakeRaw] = line.split("|").map((s) => s.trim());
        const stakeInput = stakeRaw || (Number.isFinite(maxStake) && maxStake > 0 ? String(maxStake) : defaultStake);

        const result = buildBetEvaluation({
          bookInput: oddsRaw,
          trueInput: trueRaw,
          stakeInput,
          bankrollInput: bankrollNum,
          kellyFractionInput: fraction,
          boostPctInput: Number.isFinite(boost) ? boost : 0,
        });

        if (!label || !result) return null;

        const resolvedMaxStake = Number(stakeInput);
        const recommendedStake =
          Number.isFinite(resolvedMaxStake) && resolvedMaxStake > 0
            ? Math.min(resolvedMaxStake, result.suggestedStake)
            : result.suggestedStake;

        return {
          label,
          ...result,
          maxStake: resolvedMaxStake,
          recommendedStake,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.evPct - a.evPct);
  }, [
    boostFinderBoostPct,
    boostFinderCandidates,
    boostFinderMaxStake,
    bankroll,
    kellyFraction,
    defaultStake,
  ]);

  const edgeFinderResult = useMemo(() => {
    const minPct = Number(edgeFinderMinPct) / 100;

    return String(edgeFinderRows || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, targetOddsRaw, fairRaw] = line.split("|").map((s) => s.trim());
        const target = parseAnyOddsOrProbability(targetOddsRaw);
        const fairInfo = parseTrueProbabilityInput(fairRaw);

        if (!label || !target || !fairInfo) return null;

        const fairDecimal = 1 / fairInfo.probability;
        const edgePct = target.decimal / fairDecimal - 1;
        const evPct = calculateEvPct(target.decimal, fairInfo.probability);

        return {
          label,
          targetDecimal: target.decimal,
          targetAmerican: decimalToAmerican(target.decimal),
          fairProbability: fairInfo.probability,
          fairDecimal,
          fairAmerican: decimalToAmerican(fairDecimal),
          edgePct,
          evPct,
          inputType: fairInfo.type,
        };
      })
      .filter(Boolean)
      .filter((row) => row.edgePct >= minPct)
      .sort((a, b) => b.edgePct - a.edgePct);
  }, [edgeFinderRows, edgeFinderMinPct]);

  const hedgeResult = useMemo(() => {
    const parsedA = parseAnyOddsOrProbability(hedgeOddsA);
    const parsedB = parseAnyOddsOrProbability(hedgeOddsB);
    const stakeA = Number(hedgeStakeA);

    if (!parsedA || !parsedB || !Number.isFinite(stakeA) || stakeA <= 0) {
      return null;
    }

    const payoutA = stakeA * parsedA.decimal;
    const hedgeStakeB = payoutA / parsedB.decimal;
    const totalStaked = stakeA + hedgeStakeB;
    const guaranteedProfit = payoutA - totalStaked;
    const profitIfA = payoutA - totalStaked;
    const profitIfB = hedgeStakeB * parsedB.decimal - totalStaked;

    return {
      hedgeStakeB,
      totalStaked,
      guaranteedProfit,
      profitIfA,
      profitIfB,
      betADecimal: parsedA.decimal,
      hedgeDecimal: parsedB.decimal,
      betAAmerican: decimalToAmerican(parsedA.decimal),
      hedgeAmerican: decimalToAmerican(parsedB.decimal),
    };
  }, [hedgeOddsA, hedgeStakeA, hedgeOddsB]);

  function showAllTools() {
    setToolCollapseAction((prev) => ({
      mode: "show",
      version: prev.version + 1,
    }));
  }

  function hideAllTools() {
    setToolCollapseAction((prev) => ({
      mode: "hide",
      version: prev.version + 1,
    }));
  }

  function applyDefaultStake(value) {
    setDefaultStake(value);
    setQuickStake(value);
    setSingleBetStake(value);
    setYourStake(value);
    setParlayStake(value);
  }

  function useQuickInSingleBet() {
    setSingleBetOdds(quickBookOdds);
    setSingleBetProb(quickTrueValue);
    setSingleBetStake(quickStake);
    setYourStake(quickStake);
  }

  function useBoostedOddsInSingleBet() {
    if (!boostResult) return;
    setSingleBetOdds(formatAmerican(boostResult.boostedAmerican));
  }

  function useNoVigAInSingleBet() {
    if (!noVigResult) return;
    setSingleBetProb(formatAmerican(noVigResult.fairAmericanA));
  }

  function useNoVigBInSingleBet() {
    if (!noVigResult) return;
    setSingleBetProb(formatAmerican(noVigResult.fairAmericanB));
  }

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

        <div style={dashboardStyle}>
          <div style={dashboardHeaderStyle}>
            <div>
              <div style={dashboardTitleStyle}>Betting Settings</div>
              <div style={dashboardSubtextStyle}>
                Saved on this browser. Used by EV, Kelly, boost, parlay, and stake tools.
              </div>
            </div>

            <div style={toolVisibilityButtonRowStyle}>
              <button type="button" onClick={showAllTools} style={smallSecondaryButtonStyle}>
                Show All
              </button>
              <button type="button" onClick={hideAllTools} style={smallSecondaryButtonStyle}>
                Hide All
              </button>
            </div>
          </div>

          <div style={dashboardGridStyle}>
            <label style={labelStyle}>
              Bankroll
              <input
                value={bankroll}
                onChange={(e) => setBankroll(e.target.value)}
                placeholder="6000"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Kelly Fraction
              <input
                value={kellyFraction}
                onChange={(e) => setKellyFraction(e.target.value)}
                placeholder="0.25"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Default Stake
              <input
                value={defaultStake}
                onChange={(e) => setDefaultStake(e.target.value)}
                placeholder="25"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Default Boost %
              <input
                value={defaultBoostPct}
                onChange={(e) => setDefaultBoostPct(e.target.value)}
                placeholder="25"
                style={inputStyle}
              />
            </label>
          </div>

          <div style={quickStakeRowStyle}>
            <span style={mutedTextStyle}>Quick stake buttons:</span>
            {["10", "25", "50", "100", "250"].map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => applyDefaultStake(amount)}
                style={tinyButtonStyle}
              >
                ${amount}
              </button>
            ))}
          </div>

          <div style={dashboardSummaryStyle}>
            <div>
              Bankroll: <strong>{formatCurrency(activeBankroll)}</strong>
            </div>
            <div>
              Kelly: <strong>{formatPercentValue(activeKellyFraction)}</strong>
            </div>
            <div>
              Default Stake: <strong>{formatCurrency(Number(defaultStake))}</strong>
            </div>
            <div>
              Default Boost: <strong>{Number(defaultBoostPct || 0).toFixed(1)}%</strong>
            </div>
          </div>
        </div>

        <div style={gridStyle}>
          <ToolCard collapseAction={toolCollapseAction} title="Quick Bet Check">
            <label style={labelStyle}>
              Book Odds / Price
              <input
                value={quickBookOdds}
                onChange={(e) => setQuickBookOdds(e.target.value)}
                placeholder="+195, 2.95, 33.9%, or 0.339"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              True Probability / True Odds
              <input
                value={quickTrueValue}
                onChange={(e) => setQuickTrueValue(e.target.value)}
                placeholder="43%, 0.43, +133, or 2.33"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Stake
              <input
                value={quickStake}
                onChange={(e) => setQuickStake(e.target.value)}
                style={inputStyle}
              />
            </label>

            <QuickStakeButtons onPick={setQuickStake} />

            <div style={helperTextStyle}>
              Any odds/probability field accepts American odds, decimal odds, 43%, or 0.43.
            </div>

            <div style={resultBoxStyle}>
              {quickBetResult ? (
                <>
                  <VerdictRow result={quickBetResult} />
                  <BetEvaluationResult result={quickBetResult} kellyFraction={kellyFraction} />
                  <div style={buttonRowStyle}>
                    <button type="button" onClick={useQuickInSingleBet} style={copyButtonStyle}>
                      Use in Single Bet EV
                    </button>
                    <CopyButton text={buildBetSummaryText("Quick Bet Check", quickBetResult)}>
                      Copy Summary
                    </CopyButton>
                  </div>
                </>
              ) : (
                <div>Enter valid book odds, true probability/odds, and stake.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard collapseAction={toolCollapseAction} title="Odds / Probability Converter">
            <label style={labelStyle}>
              Odds or Probability
              <input
                value={americanDecimalInput}
                onChange={(e) => setAmericanDecimalInput(e.target.value)}
                placeholder="+150, 2.50, 40%, or 0.40"
                style={inputStyle}
              />
            </label>

            <div style={resultBoxStyle}>
              {convertedOdds ? (
                <>
                  <div>Input Type: <strong>{convertedOdds.type}</strong></div>
                  <div>American: <strong>{formatAmerican(convertedOdds.american)}</strong></div>
                  <div>Decimal: <strong>{convertedOdds.decimal.toFixed(3)}</strong></div>
                  <div>Probability: <strong>{(convertedOdds.probability * 100).toFixed(2)}%</strong></div>
                  <CopyButton text={buildConverterSummaryText(convertedOdds)}>
                    Copy Summary
                  </CopyButton>
                </>
              ) : (
                <div>Enter +150, -200, 2.50, 40%, 0.40, etc.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard collapseAction={toolCollapseAction} title="Implied Probability / Break-Even">
            <label style={labelStyle}>
              Odds or Probability
              <input
                value={impliedOddsInput}
                onChange={(e) => setImpliedOddsInput(e.target.value)}
                placeholder="-110, 1.91, 52.38%, or 0.5238"
                style={inputStyle}
              />
            </label>

            <div style={resultBoxStyle}>
              {impliedResult ? (
                <>
                  <div>Input Type: <strong>{impliedResult.inputType}</strong></div>
                  <div>American: <strong>{formatAmerican(impliedResult.american)}</strong></div>
                  <div>Decimal: <strong>{impliedResult.decimal.toFixed(3)}</strong></div>
                  <div>Implied Win %: <strong>{(impliedResult.impliedProb * 100).toFixed(2)}%</strong></div>
                  <div>Break-Even %: <strong>{(impliedResult.impliedProb * 100).toFixed(2)}%</strong></div>
                  <CopyButton text={buildConverterSummaryText(impliedResult)}>
                    Copy Summary
                  </CopyButton>
                </>
              ) : (
                <div>Enter valid odds or probability.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard collapseAction={toolCollapseAction} title="No-Vig Calculator (2-way)">
            <label style={labelStyle}>
              Side A Odds / Probability
              <input
                value={novigA}
                onChange={(e) => setNovigA(e.target.value)}
                placeholder="-110, 1.91, 52.38%, or 0.5238"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Side B Odds / Probability
              <input
                value={novigB}
                onChange={(e) => setNovigB(e.target.value)}
                placeholder="-110, 1.91, 52.38%, or 0.5238"
                style={inputStyle}
              />
            </label>

            <div style={resultBoxStyle}>
              {noVigResult ? (
                <>
                  <div>Side A Fair Prob: <strong>{(noVigResult.fairProbA * 100).toFixed(2)}%</strong></div>
                  <div>Side B Fair Prob: <strong>{(noVigResult.fairProbB * 100).toFixed(2)}%</strong></div>
                  <div>Side A Fair Odds: <strong>{formatAmerican(noVigResult.fairAmericanA)}</strong> / <strong>{noVigResult.fairDecimalA.toFixed(3)}</strong></div>
                  <div>Side B Fair Odds: <strong>{formatAmerican(noVigResult.fairAmericanB)}</strong> / <strong>{noVigResult.fairDecimalB.toFixed(3)}</strong></div>
                  <div>
                    Hold:{" "}
                    <ResultValue value={-Math.abs(noVigResult.holdPct)}>
                      {noVigResult.holdPct.toFixed(2)}%
                    </ResultValue>
                  </div>
                  <div style={buttonRowStyle}>
                    <button type="button" onClick={useNoVigAInSingleBet} style={copyButtonStyle}>
                      Use Side A as True Odds
                    </button>
                    <button type="button" onClick={useNoVigBInSingleBet} style={copyButtonStyle}>
                      Use Side B as True Odds
                    </button>
                    <CopyButton text={buildNoVigSummaryText(noVigResult)}>
                      Copy Summary
                    </CopyButton>
                  </div>
                </>
              ) : (
                <div>Enter two valid prices or probabilities.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard collapseAction={toolCollapseAction} title="Single Bet EV / Kelly Finder">
            {singleBetLabel ? (
              <div style={selectedBetBannerStyle}>{singleBetLabel}</div>
            ) : null}

            <label style={labelStyle}>
              Book Odds / Price
              <input
                value={singleBetOdds}
                onChange={(e) => setSingleBetOdds(e.target.value)}
                placeholder="+195, 2.95, 33.9%, or 0.339"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              True Probability / True Odds
              <input
                value={singleBetProb}
                onChange={(e) => setSingleBetProb(e.target.value)}
                placeholder="43%, 0.43, +133, or 2.33"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Stake
              <input
                value={singleBetStake}
                onChange={(e) => setSingleBetStake(e.target.value)}
                style={inputStyle}
              />
            </label>

            <QuickStakeButtons onPick={setSingleBetStake} />

            <div style={helperTextStyle}>
              Uses top settings: {formatCurrency(activeBankroll)} bankroll x {kellyFraction} Kelly.
            </div>

            <div style={resultBoxStyle}>
              {singleBetResult ? (
                <>
                  <VerdictRow result={singleBetResult} />
                  <BetEvaluationResult result={singleBetResult} kellyFraction={kellyFraction} />
                  <CopyButton text={buildBetSummaryText("Single Bet EV / Kelly Finder", singleBetResult)}>
                    Copy Summary
                  </CopyButton>
                </>
              ) : (
                <div>Enter valid book odds, true probability/odds, and stake.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard collapseAction={toolCollapseAction} title="Stake Comparison" defaultCollapsed={true}>
            {singleBetLabel ? (
              <div style={selectedBetBannerStyle}>{singleBetLabel}</div>
            ) : null}

            <label style={labelStyle}>
              Book Odds / Price
              <input
                value={singleBetOdds}
                onChange={(e) => setSingleBetOdds(e.target.value)}
                placeholder="+195, 2.95, 33.9%, or 0.339"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              True Probability / True Odds
              <input
                value={singleBetProb}
                onChange={(e) => setSingleBetProb(e.target.value)}
                placeholder="43%, 0.43, +133, or 2.33"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Your Stake
              <input
                value={yourStake}
                onChange={(e) => setYourStake(e.target.value)}
                style={inputStyle}
              />
            </label>

            <QuickStakeButtons onPick={setYourStake} />

            <div style={helperTextStyle}>
              Active Kelly settings: {formatCurrency(activeBankroll)} bankroll x {kellyFraction} Kelly.
            </div>

            <div style={resultBoxStyle}>
              {stakeComparisonResult ? (
                <>
                  <div>
                    Model Label: <strong>{stakeComparisonResult.label}</strong>
                  </div>
                  <VerdictRow result={stakeComparisonResult} />
                  <BetEvaluationResult result={stakeComparisonResult} kellyFraction={kellyFraction} />
                  <div>
                    Difference vs Suggested:{" "}
                    <ResultValue value={-Math.abs(stakeComparisonResult.diff)}>
                      {stakeComparisonResult.diff >= 0 ? "+" : ""}
                      {formatCurrency(stakeComparisonResult.diff)}
                    </ResultValue>
                  </div>
                  <div>
                    Difference %:{" "}
                    {Number.isFinite(stakeComparisonResult.diffPct) ? (
                      <ResultValue value={-Math.abs(stakeComparisonResult.diffPct)}>
                        {(stakeComparisonResult.diffPct * 100).toFixed(2)}%
                      </ResultValue>
                    ) : (
                      "-"
                    )}
                  </div>
                  <CopyButton text={buildStakeComparisonSummaryText(stakeComparisonResult)}>
                    Copy Summary
                  </CopyButton>
                </>
              ) : (
                <div>Enter valid book odds, true probability/odds, and stake.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard collapseAction={toolCollapseAction} title="Boost Calculator" defaultCollapsed={true}>
            <label style={labelStyle}>
              Base Odds / Price
              <input
                value={boostOdds}
                onChange={(e) => setBoostOdds(e.target.value)}
                placeholder="+200, 3.00, 33.33%, or 0.333"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Boost %
              <input
                value={boostPct}
                onChange={(e) => setBoostPct(e.target.value)}
                style={inputStyle}
              />
            </label>

            <div style={resultBoxStyle}>
              {boostResult ? (
                <>
                  <div>Input Type: <strong>{boostResult.inputType}</strong></div>
                  <div>Base American: <strong>{formatAmerican(boostResult.baseAmerican)}</strong></div>
                  <div>Base Decimal: <strong>{boostResult.baseDecimal.toFixed(3)}</strong></div>
                  <div>Base Break-Even: <strong>{(boostResult.baseImpliedProb * 100).toFixed(2)}%</strong></div>
                  <div>Boosted American: <strong>{formatAmerican(boostResult.boostedAmerican)}</strong></div>
                  <div>Boosted Decimal: <strong>{boostResult.boostedDecimal.toFixed(3)}</strong></div>
                  <div>Boosted Break-Even: <strong>{(boostResult.boostedImpliedProb * 100).toFixed(2)}%</strong></div>
                  <div style={buttonRowStyle}>
                    <button type="button" onClick={useBoostedOddsInSingleBet} style={copyButtonStyle}>
                      Use Boosted Odds in Single Bet EV
                    </button>
                    <CopyButton text={formatAmerican(boostResult.boostedAmerican)}>
                      Copy Boosted American
                    </CopyButton>
                    <CopyButton text={buildBoostSummaryText(boostResult, boostPct)}>
                      Copy Summary
                    </CopyButton>
                  </div>
                </>
              ) : (
                <div>Enter valid base odds/probability and boost %.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard collapseAction={toolCollapseAction} title="Promo / Boost EV Check" defaultCollapsed={true}>
            <label style={labelStyle}>
              Book Odds / Price
              <input
                value={promoBookOdds}
                onChange={(e) => setPromoBookOdds(e.target.value)}
                placeholder="+200, 3.00, 33.33%, or 0.333"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              True Probability / True Odds
              <input
                value={promoTrueValue}
                onChange={(e) => setPromoTrueValue(e.target.value)}
                placeholder="35%, 0.35, +180, or 2.80"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Boost %
              <input
                value={promoBoostPct}
                onChange={(e) => setPromoBoostPct(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Max Stake
              <input
                value={promoMaxStake}
                onChange={(e) => setPromoMaxStake(e.target.value)}
                style={inputStyle}
              />
            </label>

            <div style={resultBoxStyle}>
              {promoBoostResult ? (
                <>
                  <div>
                    Unboosted EV:{" "}
                    <ResultValue value={promoBoostResult.unboosted.evPct}>
                      {(promoBoostResult.unboosted.evPct * 100).toFixed(2)}%
                    </ResultValue>
                  </div>
                  <div>
                    Boosted EV:{" "}
                    <ResultValue value={promoBoostResult.boosted.evPct}>
                      {(promoBoostResult.boosted.evPct * 100).toFixed(2)}%
                    </ResultValue>
                  </div>
                  <div>Boosted Odds: <strong>{formatAmerican(promoBoostResult.boosted.boostedAmerican)}</strong> / <strong>{promoBoostResult.boosted.boostedDecimal.toFixed(3)}</strong></div>
                  <div>
                    Expected Value at Max Stake:{" "}
                    <ResultValue value={promoBoostResult.expectedAtMax}>
                      {formatCurrency(promoBoostResult.expectedAtMax)}
                    </ResultValue>
                  </div>
                  <div>
                    Suggested Stake:{" "}
                    <ResultValue value={promoBoostResult.suggested}>
                      {formatCurrency(promoBoostResult.suggested)}
                    </ResultValue>
                  </div>
                  <div>
                    Use Full Max? <strong>{promoBoostResult.useMax ? "Yes" : "No"}</strong>
                  </div>
                  <CopyButton text={buildPromoSummaryText(promoBoostResult)}>
                    Copy Summary
                  </CopyButton>
                </>
              ) : (
                <div>Enter valid book odds, true probability/odds, boost %, and max stake.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard collapseAction={toolCollapseAction} title="Parlay EV Calculator" defaultCollapsed={true}>
            <label style={labelStyle}>
              Legs - Book Odds / Prices (comma separated)
              <input
                value={parlayLegsInput}
                onChange={(e) => setParlayLegsInput(e.target.value)}
                placeholder="+150, -110, +200 or 2.50, 1.91, 3.00"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Fair Values - Probabilities or True Odds (comma separated)
              <input
                value={parlayFairInput}
                onChange={(e) => setParlayFairInput(e.target.value)}
                placeholder="40%, 52%, 33% or +150, -108, +200"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Stake
              <input
                value={parlayStake}
                onChange={(e) => setParlayStake(e.target.value)}
                style={inputStyle}
              />
            </label>

            <QuickStakeButtons onPick={setParlayStake} />

            <label style={labelStyle}>
              Leg Labels (separate with ||)
              <textarea
                value={parlayLabelsInput}
                onChange={(e) => setParlayLabelsInput(e.target.value)}
                placeholder="Game 1 - Team A ML || Game 2 - Team B ML"
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

            <div style={warningBoxStyle}>
              Quick parlay EV assumes independent legs. Same-game correlation is not modeled here.
            </div>

            <div style={resultBoxStyle}>
              {parlayResult ? (
                <>
                  <div>Legs: <strong>{parlayResult.legCount}</strong></div>
                  <div>
                    Leg Labels:
                    <div style={parlayLabelListStyle}>
                      {parlayResult.labels.map((label) => (
                        <div key={label} style={parlayLabelItemStyle}>
                          - {label}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>Raw American: <strong>{formatAmerican(parlayResult.rawAmerican)}</strong></div>
                  <div>Raw Decimal: <strong>{parlayResult.rawDecimal.toFixed(3)}</strong></div>
                  <div>Implied Hit %: <strong>{(parlayResult.impliedProb * 100).toFixed(2)}%</strong></div>
                  <div>Boosted American: <strong>{formatAmerican(parlayResult.boostedAmerican)}</strong></div>
                  <div>Boosted Decimal: <strong>{parlayResult.boostedDecimal.toFixed(3)}</strong></div>
                  <div>
                    Fair Hit %:{" "}
                    {Number.isFinite(parlayResult.fairHitProb) ? (
                      <strong>{(parlayResult.fairHitProb * 100).toFixed(2)}%</strong>
                    ) : (
                      "-"
                    )}
                  </div>
                  <div>
                    Fair Parlay Odds:{" "}
                    {Number.isFinite(parlayResult.fairAmerican) ? (
                      <strong>{formatAmerican(parlayResult.fairAmerican)} / {parlayResult.fairDecimal.toFixed(3)}</strong>
                    ) : (
                      "-"
                    )}
                  </div>
                  <div>
                    EV %:{" "}
                    {Number.isFinite(parlayResult.evPct) ? (
                      <ResultValue value={parlayResult.evPct}>
                        {(parlayResult.evPct * 100).toFixed(2)}%
                      </ResultValue>
                    ) : (
                      "-"
                    )}
                  </div>
                  <div>
                    Expected $:{" "}
                    {Number.isFinite(parlayResult.expectedProfit) ? (
                      <ResultValue value={parlayResult.expectedProfit}>
                        {formatCurrency(parlayResult.expectedProfit)}
                      </ResultValue>
                    ) : (
                      "-"
                    )}
                  </div>
                  <div>
                    Full Kelly %:{" "}
                    {Number.isFinite(parlayResult.fullKelly) ? (
                      <ResultValue value={parlayResult.fullKelly}>
                        {(Math.max(0, parlayResult.fullKelly) * 100).toFixed(2)}%
                      </ResultValue>
                    ) : (
                      "-"
                    )}
                  </div>
                  <div>
                    Suggested Stake:{" "}
                    {Number.isFinite(parlayResult.suggestedStake) ? (
                      <ResultValue value={parlayResult.suggestedStake}>
                        {formatCurrency(parlayResult.suggestedStake)}
                      </ResultValue>
                    ) : (
                      "-"
                    )}
                  </div>
                  <div style={buttonRowStyle}>
                    <CopyButton text={formatAmerican(parlayResult.boostedAmerican)}>
                      Copy Boosted American
                    </CopyButton>
                    <CopyButton text={buildParlaySummaryText(parlayResult)}>
                      Copy Summary
                    </CopyButton>
                  </div>
                </>
              ) : (
                <div>Enter valid comma-separated odds/probabilities.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard collapseAction={toolCollapseAction} title="Boost Targeting Tool" defaultCollapsed={true}>
            <label style={labelStyle}>
              Boost %
              <input
                value={boostFinderBoostPct}
                onChange={(e) => setBoostFinderBoostPct(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Max Stake
              <input
                value={boostFinderMaxStake}
                onChange={(e) => setBoostFinderMaxStake(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Candidates (Selection | Book Odds/Price | True Value | Optional Max Stake)
              <textarea
                value={boostFinderCandidates}
                onChange={(e) => setBoostFinderCandidates(e.target.value)}
                placeholder={"Team A | +150 | +140\nTeam B | 2.10 | 48%\nTeam C | 40% | 45% | 25"}
                style={textareaStyle}
              />
            </label>

            <div style={resultBoxStyle}>
              {boostFinderResult.length ? (
                <>
                  {boostFinderResult.map((row) => (
                    <div key={row.label} style={candidateRowStyle}>
                      <strong>{row.label}</strong>
                      <div>
                        Boosted {formatAmerican(row.boostedAmerican)} / {row.boostedDecimal.toFixed(3)}
                      </div>
                      <div>
                        EV{" "}
                        <ResultValue value={row.evPct}>
                          {(row.evPct * 100).toFixed(2)}%
                        </ResultValue>
                        {" "} - Stake{" "}
                        <ResultValue value={row.recommendedStake}>
                          {formatCurrency(row.recommendedStake)}
                        </ResultValue>
                      </div>
                    </div>
                  ))}
                  <CopyButton text={buildBoostFinderSummaryText(boostFinderResult)}>
                    Copy Results
                  </CopyButton>
                </>
              ) : (
                <div>No valid candidates.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard collapseAction={toolCollapseAction} title="Edge Finder" defaultCollapsed={true}>
            <label style={labelStyle}>
              Minimum Edge %
              <input
                value={edgeFinderMinPct}
                onChange={(e) => setEdgeFinderMinPct(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Rows (Selection | Target Odds/Price | Fair Value)
              <textarea
                value={edgeFinderRows}
                onChange={(e) => setEdgeFinderRows(e.target.value)}
                placeholder={"Team A | +150 | +140\nTeam B | 2.10 | 48%\nTeam C | 40% | 45%"}
                style={textareaStyle}
              />
            </label>

            <div style={resultBoxStyle}>
              {edgeFinderResult.length ? (
                <>
                  {edgeFinderResult.map((row) => (
                    <div key={row.label} style={candidateRowStyle}>
                      <strong>{row.label}</strong>
                      <div>
                        Target {formatAmerican(row.targetAmerican)} / {row.targetDecimal.toFixed(3)}
                      </div>
                      <div>
                        Fair {formatAmerican(row.fairAmerican)} / {row.fairDecimal.toFixed(3)} ({(row.fairProbability * 100).toFixed(2)}%)
                      </div>
                      <div>
                        Edge{" "}
                        <ResultValue value={row.edgePct}>
                          {(row.edgePct * 100).toFixed(2)}%
                        </ResultValue>
                        {" "} - EV{" "}
                        <ResultValue value={row.evPct}>
                          {(row.evPct * 100).toFixed(2)}%
                        </ResultValue>
                      </div>
                    </div>
                  ))}
                  <CopyButton text={buildEdgeFinderSummaryText(edgeFinderResult)}>
                    Copy Results
                  </CopyButton>
                </>
              ) : (
                <div>No rows above threshold.</div>
              )}
            </div>
          </ToolCard>

          <ToolCard collapseAction={toolCollapseAction} title="Hedge Calculator" defaultCollapsed={true}>
            <label style={labelStyle}>
              Bet A Odds / Price
              <input
                value={hedgeOddsA}
                onChange={(e) => setHedgeOddsA(e.target.value)}
                placeholder="+150, 2.50, 40%, or 0.40"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Bet A Stake
              <input
                value={hedgeStakeA}
                onChange={(e) => setHedgeStakeA(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Hedge Odds / Price
              <input
                value={hedgeOddsB}
                onChange={(e) => setHedgeOddsB(e.target.value)}
                placeholder="-160, 1.625, 61.54%, or 0.6154"
                style={inputStyle}
              />
            </label>

            <div style={resultBoxStyle}>
              {hedgeResult ? (
                <>
                  <div>Bet A Price: <strong>{formatAmerican(hedgeResult.betAAmerican)}</strong> / <strong>{hedgeResult.betADecimal.toFixed(3)}</strong></div>
                  <div>Hedge Price: <strong>{formatAmerican(hedgeResult.hedgeAmerican)}</strong> / <strong>{hedgeResult.hedgeDecimal.toFixed(3)}</strong></div>
                  <div>
                    Hedge Stake:{" "}
                    <ResultValue value={hedgeResult.hedgeStakeB}>
                      {formatCurrency(hedgeResult.hedgeStakeB)}
                    </ResultValue>
                  </div>
                  <div>Total Staked: <strong>{formatCurrency(hedgeResult.totalStaked)}</strong></div>
                  <div>
                    Profit if Bet A Wins:{" "}
                    <ResultValue value={hedgeResult.profitIfA}>
                      {formatCurrency(hedgeResult.profitIfA)}
                    </ResultValue>
                  </div>
                  <div>
                    Profit if Hedge Wins:{" "}
                    <ResultValue value={hedgeResult.profitIfB}>
                      {formatCurrency(hedgeResult.profitIfB)}
                    </ResultValue>
                  </div>
                  <div>
                    Guaranteed Profit:{" "}
                    <ResultValue value={hedgeResult.guaranteedProfit}>
                      {formatCurrency(hedgeResult.guaranteedProfit)}
                    </ResultValue>
                  </div>
                  <CopyButton text={buildHedgeSummaryText(hedgeResult)}>
                    Copy Summary
                  </CopyButton>
                </>
              ) : (
                <div>Enter valid odds/probabilities and stake.</div>
              )}
            </div>
          </ToolCard>
        </div>
      </div>
    </div>
  );
}

function ToolCard({ title, children, defaultCollapsed = false, collapseAction }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    if (!collapseAction?.version) return;
    if (collapseAction.mode === "show") setCollapsed(false);
    if (collapseAction.mode === "hide") setCollapsed(true);
  }, [collapseAction]);

  return (
    <section
      style={{
        ...cardStyle,
        ...(collapsed ? collapsedCardStyle : {}),
      }}
    >
      <div style={toolCardHeaderStyle}>
        <h2 style={cardTitleStyle}>{title}</h2>

        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          style={collapseButtonStyle}
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>

      {!collapsed ? <div style={{ display: "grid", gap: 10 }}>{children}</div> : null}
    </section>
  );
}

function QuickStakeButtons({ onPick }) {
  return (
    <div style={quickStakeRowStyle}>
      <span style={mutedTextStyle}>Stake:</span>
      {["10", "25", "50", "100", "250"].map((amount) => (
        <button
          key={amount}
          type="button"
          onClick={() => onPick(amount)}
          style={tinyButtonStyle}
        >
          ${amount}
        </button>
      ))}
    </div>
  );
}

function BetEvaluationResult({ result, kellyFraction }) {
  if (!result) return null;

  return (
    <>
      <div>Book Odds: <strong>{formatAmerican(result.bookAmerican)}</strong> / <strong>{result.bookDecimal.toFixed(3)}</strong></div>
      {Number.isFinite(result.boostedDecimal) && result.boostPct !== 0 ? (
        <div>Boosted Odds: <strong>{formatAmerican(result.boostedAmerican)}</strong> / <strong>{result.boostedDecimal.toFixed(3)}</strong></div>
      ) : null}
      <div>True Win %: <strong>{(result.trueProbability * 100).toFixed(2)}%</strong> <span style={mutedTextStyle}>({result.trueInputType})</span></div>
      <div>True Odds: <strong>{formatAmerican(result.trueAmerican)}</strong> / <strong>{result.trueDecimal.toFixed(3)}</strong></div>
      <div>Break-Even %: <strong>{(result.breakEvenProbability * 100).toFixed(2)}%</strong></div>
      <div>
        EV %:{" "}
        <ResultValue value={result.evPct}>
          {(result.evPct * 100).toFixed(2)}%
        </ResultValue>
      </div>
      <div>
        Expected $:{" "}
        <ResultValue value={result.expectedProfit}>
          {formatCurrency(result.expectedProfit)}
        </ResultValue>
      </div>
      <div>
        Full Kelly %:{" "}
        <ResultValue value={result.fullKelly}>
          {(Math.max(0, result.fullKelly) * 100).toFixed(2)}%
        </ResultValue>
      </div>
      <div>
        Suggested Stake ({kellyFraction} Kelly):{" "}
        <ResultValue value={result.suggestedStake}>
          {formatCurrency(result.suggestedStake)}
        </ResultValue>
      </div>
    </>
  );
}

function VerdictRow({ result }) {
  const verdict = getBetVerdict(result);

  return (
    <div
      style={{
        ...verdictBoxStyle,
        background: verdict.background,
        borderColor: verdict.border,
        color: verdict.color,
      }}
    >
      <strong>{verdict.label}</strong>
      <span>{verdict.detail}</span>
    </div>
  );
}

function CopyButton({ text, children }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" onClick={handleCopy} style={copyButtonStyle}>
      {copied ? "Copied" : children}
    </button>
  );
}

function convertAnyValue(value) {
  const parsed = parseAnyOddsOrProbability(value);
  if (!parsed) return null;

  return {
    type: parsed.type,
    decimal: parsed.decimal,
    american: decimalToAmerican(parsed.decimal),
    probability: 1 / parsed.decimal,
  };
}

function parseAnyOddsOrProbability(value) {
  const parsed = parseFlexiblePrice(value);
  if (!parsed) return null;

  return {
    decimal: parsed.decimal,
    type: parsed.type,
    probability: 1 / parsed.decimal,
  };
}

function parseTrueProbabilityInput(value) {
  const parsed = parseFlexiblePrice(value);
  if (!parsed) return null;

  if (parsed.type === "probability") {
    return {
      probability: parsed.probability,
      type: "probability",
    };
  }

  return {
    probability: 1 / parsed.decimal,
    type: parsed.type === "American odds" ? "American true odds" : "decimal true odds",
  };
}

function parseFlexiblePrice(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const cleaned = text.replace(/,/g, "").trim();

  const percentMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (percentMatch) {
    const probability = Number(percentMatch[1]) / 100;
    return probability > 0 && probability < 1
      ? {
          decimal: 1 / probability,
          probability,
          type: "probability",
        }
      : null;
  }

  if (/^[+-]\d+(\.\d+)?$/.test(cleaned)) {
    const american = Number(cleaned);
    const decimal = americanToDecimal(american);
    return Number.isFinite(decimal) && decimal > 1
      ? {
          decimal,
          probability: 1 / decimal,
          type: "American odds",
        }
      : null;
  }

  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;

  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) return null;

  // 0.40 means 40% probability.
  if (numeric > 0 && numeric < 1) {
    return {
      decimal: 1 / numeric,
      probability: numeric,
      type: "probability",
    };
  }

  // 2.50, 1.91, etc. are decimal odds.
  // Keep this ahead of the percent shortcut so decimal odds work reliably.
  if (numeric > 1 && numeric <= 10) {
    return {
      decimal: numeric,
      probability: 1 / numeric,
      type: "decimal odds",
    };
  }

  // 40 means 40% probability. This is intentionally allowed for speed.
  if (numeric > 10 && numeric < 100) {
    const probability = numeric / 100;
    return {
      decimal: 1 / probability,
      probability,
      type: "probability",
    };
  }

  // 100, 110, 150, 250, etc. mean positive American odds when no plus sign is typed.
  // This lets you enter 150 instead of +150.
  if (numeric >= 100) {
    const decimal = americanToDecimal(numeric);
    return {
      decimal,
      probability: 1 / decimal,
      type: "American odds",
    };
  }

  return null;
}

function splitCommaValues(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildBetEvaluation({
  bookInput,
  trueInput,
  stakeInput,
  bankrollInput,
  kellyFractionInput,
  boostPctInput = 0,
}) {
  const book = parseAnyOddsOrProbability(bookInput);
  const trueInfo = parseTrueProbabilityInput(trueInput);
  const stake = Number(stakeInput);
  const bankroll = Number(bankrollInput);
  const fraction = Number(kellyFractionInput);
  const boostPct = Number(boostPctInput);

  if (
    !book ||
    !trueInfo ||
    !Number.isFinite(stake) ||
    stake < 0 ||
    !(trueInfo.probability > 0 && trueInfo.probability < 1)
  ) {
    return null;
  }

  const bookDecimal = book.decimal;
  const boostedDecimal = Number.isFinite(boostPct)
    ? applyProfitBoostToDecimal(bookDecimal, boostPct)
    : bookDecimal;

  const trueProbability = trueInfo.probability;
  const trueDecimal = 1 / trueProbability;
  const trueAmerican = decimalToAmerican(trueDecimal);
  const evPct = calculateEvPct(boostedDecimal, trueProbability);
  const expectedProfit = stake * evPct;
  const fullKelly = calculateFullKelly(boostedDecimal, trueProbability);
  const suggestedStake =
    Number.isFinite(bankroll) && bankroll > 0 && Number.isFinite(fraction) && fraction >= 0
      ? bankroll * Math.max(0, fullKelly) * fraction
      : 0;

  return {
    bookDecimal,
    bookAmerican: decimalToAmerican(bookDecimal),
    bookInputType: book.type,
    boostedDecimal,
    boostedAmerican: decimalToAmerican(boostedDecimal),
    boostPct: Number.isFinite(boostPct) ? boostPct : 0,
    breakEvenProbability: 1 / boostedDecimal,
    trueProbability,
    trueDecimal,
    trueAmerican,
    trueInputType: trueInfo.type,
    stake,
    evPct,
    expectedProfit,
    fullKelly,
    suggestedStake,
  };
}

function calculateEvPct(decimalOdds, trueProbability) {
  return trueProbability * (decimalOdds - 1) - (1 - trueProbability);
}

function calculateFullKelly(decimalOdds, trueProbability) {
  const b = decimalOdds - 1;
  const q = 1 - trueProbability;
  return b > 0 ? (b * trueProbability - q) / b : NaN;
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

function getBetVerdict(result) {
  if (!result || !Number.isFinite(result.evPct)) {
    return {
      label: "No Result",
      detail: "Enter valid inputs.",
      background: "#f9fafb",
      border: "#d1d5db",
      color: "#374151",
    };
  }

  if (result.evPct <= 0) {
    return {
      label: "Negative EV / No Bet",
      detail: `${(result.evPct * 100).toFixed(2)}% EV`,
      background: "#fef2f2",
      border: "#fecaca",
      color: "#991b1b",
    };
  }

  if (result.evPct >= 0.05) {
    return {
      label: "Great Bet",
      detail: `${(result.evPct * 100).toFixed(2)}% EV`,
      background: "#dcfce7",
      border: "#86efac",
      color: "#14532d",
    };
  }

  if (result.evPct >= 0.015) {
    return {
      label: "Good Edge",
      detail: `${(result.evPct * 100).toFixed(2)}% EV`,
      background: "#ecfdf5",
      border: "#a7f3d0",
      color: "#166534",
    };
  }

  return {
    label: "Small Edge",
    detail: `${(result.evPct * 100).toFixed(2)}% EV`,
    background: "#fffbeb",
    border: "#fde68a",
    color: "#92400e",
  };
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
  if (!Number.isFinite(value)) return "-";
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  const sign = number < 0 ? "-" : "";
  return `${sign}$${Math.abs(number).toFixed(2)}`;
}

function formatPercentValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${(number * 100).toFixed(1)}%`;
}

function buildConverterSummaryText(result) {
  if (!result) return "";
  return [
    `American: ${formatAmerican(result.american)}`,
    `Decimal: ${Number(result.decimal).toFixed(3)}`,
    `Probability: ${(Number(result.probability || result.impliedProb) * 100).toFixed(2)}%`,
  ].join("\n");
}

function buildBetSummaryText(title, result) {
  if (!result) return "";
  return [
    title,
    `Book odds: ${formatAmerican(result.bookAmerican)} / ${result.bookDecimal.toFixed(3)}`,
    result.boostPct ? `Boosted odds: ${formatAmerican(result.boostedAmerican)} / ${result.boostedDecimal.toFixed(3)}` : null,
    `True odds: ${formatAmerican(result.trueAmerican)} / ${result.trueDecimal.toFixed(3)}`,
    `True probability: ${(result.trueProbability * 100).toFixed(2)}%`,
    `EV: ${(result.evPct * 100).toFixed(2)}%`,
    `Expected value at ${formatCurrency(result.stake)} stake: ${formatCurrency(result.expectedProfit)}`,
    `Full Kelly: ${(Math.max(0, result.fullKelly) * 100).toFixed(2)}%`,
    `Suggested stake: ${formatCurrency(result.suggestedStake)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildStakeComparisonSummaryText(result) {
  if (!result) return "";
  return [
    "Stake Comparison",
    `Label: ${result.label}`,
    buildBetSummaryText("Bet", result),
    `Your stake: ${formatCurrency(result.stake)}`,
    `Difference: ${formatCurrency(result.diff)}`,
    `Difference %: ${Number.isFinite(result.diffPct) ? (result.diffPct * 100).toFixed(2) + "%" : "-"}`,
  ].join("\n");
}

function buildNoVigSummaryText(result) {
  if (!result) return "";
  return [
    "No-Vig 2-Way",
    `Side A fair probability: ${(result.fairProbA * 100).toFixed(2)}%`,
    `Side A fair odds: ${formatAmerican(result.fairAmericanA)} / ${result.fairDecimalA.toFixed(3)}`,
    `Side B fair probability: ${(result.fairProbB * 100).toFixed(2)}%`,
    `Side B fair odds: ${formatAmerican(result.fairAmericanB)} / ${result.fairDecimalB.toFixed(3)}`,
    `Hold: ${result.holdPct.toFixed(2)}%`,
  ].join("\n");
}

function buildBoostSummaryText(result, boostPct) {
  if (!result) return "";
  return [
    "Boost Calculator",
    `Boost: ${boostPct}%`,
    `Base odds: ${formatAmerican(result.baseAmerican)} / ${result.baseDecimal.toFixed(3)}`,
    `Boosted odds: ${formatAmerican(result.boostedAmerican)} / ${result.boostedDecimal.toFixed(3)}`,
    `Boosted break-even: ${(result.boostedImpliedProb * 100).toFixed(2)}%`,
  ].join("\n");
}

function buildPromoSummaryText(result) {
  if (!result) return "";
  return [
    "Promo / Boost EV Check",
    `Unboosted EV: ${(result.unboosted.evPct * 100).toFixed(2)}%`,
    `Boosted EV: ${(result.boosted.evPct * 100).toFixed(2)}%`,
    `Boosted odds: ${formatAmerican(result.boosted.boostedAmerican)} / ${result.boosted.boostedDecimal.toFixed(3)}`,
    `Max stake: ${formatCurrency(result.maxStake)}`,
    `Expected value at max: ${formatCurrency(result.expectedAtMax)}`,
    `Suggested stake: ${formatCurrency(result.suggested)}`,
    `Use full max: ${result.useMax ? "Yes" : "No"}`,
  ].join("\n");
}

function buildParlaySummaryText(result) {
  if (!result) return "";
  return [
    "Parlay EV Calculator",
    `Legs: ${result.legCount}`,
    `Raw odds: ${formatAmerican(result.rawAmerican)} / ${result.rawDecimal.toFixed(3)}`,
    `Boosted odds: ${formatAmerican(result.boostedAmerican)} / ${result.boostedDecimal.toFixed(3)}`,
    `Implied hit probability: ${(result.impliedProb * 100).toFixed(2)}%`,
    Number.isFinite(result.fairHitProb) ? `Fair hit probability: ${(result.fairHitProb * 100).toFixed(2)}%` : null,
    Number.isFinite(result.evPct) ? `EV: ${(result.evPct * 100).toFixed(2)}%` : null,
    Number.isFinite(result.expectedProfit) ? `Expected value: ${formatCurrency(result.expectedProfit)}` : null,
    Number.isFinite(result.suggestedStake) ? `Suggested stake: ${formatCurrency(result.suggestedStake)}` : null,
    "Note: assumes independent legs.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildBoostFinderSummaryText(rows) {
  return (rows || [])
    .map(
      (row) =>
        `${row.label}: Boosted ${formatAmerican(row.boostedAmerican)}, EV ${(row.evPct * 100).toFixed(2)}%, stake ${formatCurrency(row.recommendedStake)}`
    )
    .join("\n");
}

function buildEdgeFinderSummaryText(rows) {
  return (rows || [])
    .map(
      (row) =>
        `${row.label}: target ${formatAmerican(row.targetAmerican)}, fair ${formatAmerican(row.fairAmerican)}, edge ${(row.edgePct * 100).toFixed(2)}%, EV ${(row.evPct * 100).toFixed(2)}%`
    )
    .join("\n");
}

function buildHedgeSummaryText(result) {
  if (!result) return "";
  return [
    "Hedge Calculator",
    `Bet A odds: ${formatAmerican(result.betAAmerican)} / ${result.betADecimal.toFixed(3)}`,
    `Hedge odds: ${formatAmerican(result.hedgeAmerican)} / ${result.hedgeDecimal.toFixed(3)}`,
    `Hedge stake: ${formatCurrency(result.hedgeStakeB)}`,
    `Total staked: ${formatCurrency(result.totalStaked)}`,
    `Profit if Bet A wins: ${formatCurrency(result.profitIfA)}`,
    `Profit if Hedge wins: ${formatCurrency(result.profitIfB)}`,
    `Guaranteed profit: ${formatCurrency(result.guaranteedProfit)}`,
  ].join("\n");
}

export default function ToolsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20 }}>Loading tools...</div>}>
      <ToolsPageContent />
    </Suspense>
  );
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

const dashboardStyle = {
  background: "#ffffff",
  border: "1px solid #bbf7d0",
  borderRadius: 12,
  padding: 14,
  marginBottom: 14,
  display: "grid",
  gap: 12,
};

const dashboardHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const dashboardTitleStyle = {
  fontWeight: 900,
  color: "#14532d",
  fontSize: 16,
};

const dashboardSubtextStyle = {
  marginTop: 4,
  color: "#4b5563",
  fontSize: 13,
};

const dashboardGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};

const dashboardSummaryStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  fontSize: 13,
  color: "#374151",
};

const toolVisibilityButtonRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const smallSecondaryButtonStyle = {
  background: "#ffffff",
  color: "#166534",
  border: "1px solid #86efac",
  borderRadius: 8,
  padding: "8px 10px",
  cursor: "pointer",
  fontWeight: 800,
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
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
  paddingTop: 16,
  paddingRight: 16,
  paddingBottom: 10,
  paddingLeft: 16,
};

const cardStyle = {
  background: "#f0fdf4",
  border: "2px solid #166534",
  borderRadius: 12,
  paddingTop: 16,
  paddingRight: 16,
  paddingBottom: 16,
  paddingLeft: 16,
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

const helperTextStyle = {
  color: "#4b5563",
  fontSize: 12,
  lineHeight: 1.35,
};

const mutedTextStyle = {
  color: "#6b7280",
  fontSize: 12,
};

const quickStakeRowStyle = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  alignItems: "center",
};

const tinyButtonStyle = {
  background: "#ffffff",
  color: "#166534",
  border: "1px solid #86efac",
  borderRadius: 999,
  padding: "4px 9px",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 12,
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

const buttonRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
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

const verdictBoxStyle = {
  border: "1px solid",
  borderRadius: 10,
  padding: "8px 10px",
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
};

const warningBoxStyle = {
  background: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: 10,
  padding: "8px 10px",
  color: "#92400e",
  fontSize: 13,
  lineHeight: 1.35,
};

const candidateRowStyle = {
  borderBottom: "1px solid #dcfce7",
  paddingBottom: 8,
  marginBottom: 4,
  display: "grid",
  gap: 3,
};
