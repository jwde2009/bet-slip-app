// app/utils/parserRegistry.js

import { parseBetMgmSlip } from "./parseBetMgm";
import { parseDraftKingsLikeSlip } from "./parseDraftKings";
import { parseFanDuelSlip } from "./parseFanDuel";
import { parseCaesarsSlip } from "./parseCaesars";
import { parseKalshiSlip } from "./parseKalshi";
import { parseCircaSlip } from "./parseCirca";
import { parseBet365Slip } from "./parseBet365";
import { parseTheScoreSlip } from "./parseTheScore";

export const PARSER_REGISTRY = [
  {
    name: "FanDuel",
    run: ({ cleaned, originalText, sourceFileName, shared }) =>
      parseFanDuelSlip({
        cleaned,
        originalText,
        sourceFileName,
        sportsbook: "FanDuel",
        shared,
        debug: true,
      }),
  },
  {
    name: "Kalshi",
    run: ({ cleaned, shared }) => parseKalshiSlip(cleaned, shared),
  },
  {
    name: "Circa",
    run: ({ cleaned, shared }) => parseCircaSlip(cleaned, shared),
  },
  {
    name: "bet365",
    run: ({ cleaned, shared, sourceFileName }) =>
      parseBet365Slip(cleaned, shared, sourceFileName),
  },
  {
    name: "theScore",
    run: ({ cleaned, originalText, sourceFileName, shared }) =>
      parseTheScoreSlip({
        cleaned,
        originalText,
        sourceFileName,
        shared,
        debug: true,
      }),
  },
  {
    name: "Caesars",
    run: ({ cleaned, originalText, sourceFileName, shared }) =>
      parseCaesarsSlip({
        cleaned,
        originalText,
        sourceFileName,
        sportsbook: "Caesars",
        shared,
        debug: true,
      }),
  },
  {
    name: "BetMGM",
    run: ({ cleaned, originalText, sourceFileName, sportsbook, shared }) =>
      parseBetMgmSlip({
        cleaned,
        originalText,
        sourceFileName,
        sportsbook: sportsbook || "BetMGM",
        shared,
      }),
  },
  {
    name: "DraftKingsLike",
    run: ({ cleaned, originalText, sourceFileName, sportsbook, shared }) =>
      parseDraftKingsLikeSlip({
        cleaned,
        originalText,
        sourceFileName,
        forcedSportsbook: sportsbook,
        shared,
      }),
  },
];