export const EXTRACTION_GUIDES = {
  DraftKings: {
    bestMethod: "Browser console innerText from the main content area",
    fallbackMethod: "Copy visible page text if console is unavailable",
    avoid: "Copied HTML from the page source or giant page navigation blocks",
    command: 'copy(document.querySelector("main")?.innerText || document.body.innerText)',
    steps: [
      "Open the DraftKings odds page you want.",
      "Open browser DevTools, then go to the Console tab.",
      "Click Copy Command below, then paste it into the console.",
      "Paste the copied sportsbook text into EV Parlay Lab.",
    ],
  },

  FanDuel: {
    bestMethod: "Browser console innerText from the main odds area",
    fallbackMethod: "Copy visible odds text from a focused odds page",
    avoid: "Random highlighted copy that mixes nav, promos, and odds",
    command: 'copy(document.querySelector("main")?.innerText || document.body.innerText)',
    steps: [
      "Open the FanDuel odds page.",
      "Open browser DevTools, then go to the Console tab.",
      "Click Copy Command below, then paste it into the console.",
      "Paste the copied sportsbook text into EV Parlay Lab.",
    ],
  },

  BetMGM: {
    bestMethod: "Browser console innerText or focused visible copy",
    fallbackMethod: "Copy visible odds text",
    avoid: "Full-page HTML and promo-heavy copy",
    command: 'copy(document.querySelector("main")?.innerText || document.body.innerText)',
    steps: [
      "Open the BetMGM odds page.",
      "Open browser DevTools, then go to the Console tab.",
      "Click Copy Command below, then paste it into the console.",
      "Paste the copied sportsbook text into EV Parlay Lab.",
    ],
  },

  Caesars: {
    bestMethod: "Browser console innerText or focused container copy",
    fallbackMethod: "Visible odds list copy",
    avoid: "Huge page copy with unrelated navigation",
    command: 'copy(document.querySelector("main")?.innerText || document.body.innerText)',
    steps: [
      "Open the Caesars odds page.",
      "Open browser DevTools, then go to the Console tab.",
      "Click Copy Command below, then paste it into the console.",
      "Paste the copied sportsbook text into EV Parlay Lab.",
    ],
  },

  Pinnacle: {
    bestMethod: "Focused odds table text copy",
    fallbackMethod: "Console innerText from the main odds area",
    avoid: "General navigation copy instead of odds table copy",
    command: 'copy(document.querySelector("main")?.innerText || document.body.innerText)',
    steps: [
      "Open the Pinnacle market page.",
      "Open browser DevTools, then go to the Console tab.",
      "Click Copy Command below, then paste it into the console.",
      "Paste the copied sportsbook text into EV Parlay Lab as the sharp source.",
    ],
  },

  TheScore: {
    bestMethod: "Browser console innerText from the main odds area",
    fallbackMethod: "Copy visible page text from the odds list",
    avoid: "Full-page copy with promos, nav, and unrelated article text",
    command: 'copy(document.querySelector("main")?.innerText || document.body.innerText)',
    steps: [
      "Open the TheScore odds page.",
      "Open browser DevTools, then go to the Console tab.",
      "Click Copy Command below, then paste it into the console.",
      "Paste the copied sportsbook text into EV Parlay Lab.",
    ],
  },

  Manual: {
    bestMethod: "Paste text in a clean row-based format",
    fallbackMethod: "Use editable review table after paste",
    avoid: "Mixed text from multiple unrelated screens",
    command: "",
    steps: [
      "Paste your cleaned odds text into the box.",
      "Parse it.",
      "Fix any bad rows in the review table.",
    ],
  },

  Auto: {
    bestMethod: "Use Auto only when you are not sure which parser to choose",
    fallbackMethod: "Pick the sportsbook manually for better results",
    avoid: "Assuming Auto will always identify the right source",
    command: 'copy(document.querySelector("main")?.innerText || document.body.innerText)',
    steps: [
      "Paste text into the box.",
      "Try Parse Input.",
      "If results are poor, choose the sportsbook manually and parse again.",
    ],
  },
};