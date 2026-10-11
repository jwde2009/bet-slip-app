"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_DHO_LAYOUTS,
  DHO_COLUMN_COUNT,
  DHO_KNOWN_BOOKS,
  makeDhoSlots,
  dhoCellCrop,
  dhoColumnCenter,
  dhoSelectionNames,
  readDhoAmerican,
  buildReviewedDhoRows,
} from "../utils/darkHorseScreenshot";

const PROFILE_KEY = "EV_DHO_SCREENSHOT_PROFILE_V1";
const panel = { border: "1px solid #cbd5e1", borderRadius: 10, padding: 12, display: "grid", gap: 10, background: "#fff" };
const input = { width: "100%", minWidth: 0, boxSizing: "border-box", padding: "8px 10px",
  border: "1px solid #94a3b8", borderRadius: 7, fontSize: 13, background: "#fff", color: "#0f172a" };
const button = { padding: "8px 12px", border: "1px solid #94a3b8", borderRadius: 7,
  cursor: "pointer", background: "#fff", color: "#0f172a", fontWeight: 650, fontSize: 13 };
const muted = { fontSize: 13, color: "#475569", lineHeight: 1.45, margin: 0 };
const field = { display: "grid", gap: 4, minWidth: 0, fontSize: 13, fontWeight: 650 };
const columns = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 10 };
const copyLayout = () => JSON.parse(JSON.stringify(DEFAULT_DHO_LAYOUTS));

function toOcrCanvas(image, crop) {
  const source = document.createElement("canvas");
  source.width = Math.max(1, Math.floor(crop.width * 3));
  source.height = Math.max(1, Math.floor(crop.height * 3));
  const ctx = source.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Your browser could not create the OCR canvas.");
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height,
    0, 0, source.width, source.height);
  const data = ctx.getImageData(0, 0, source.width, source.height);
  for (let p = 0; p < data.data.length; p += 4) {
    // DHO's odds text is bright on dark cells. Convert to black text on white.
    const brightness = Math.max(data.data[p], data.data[p + 1], data.data[p + 2]);
    const shade = brightness > 123 ? 0 : 255;
    data.data[p] = shade;
    data.data[p + 1] = shade;
    data.data[p + 2] = shade;
    data.data[p + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return source;
}

export default function DarkHorseScreenshotImport({ eventNames = [], existingCount = 0, onImport, onClear }) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState(makeDhoSlots);
  const [layouts, setLayouts] = useState(copyLayout);
  const [profileReady, setProfileReady] = useState(false);
  const [market, setMarket] = useState("moneyline");
  const [sport, setSport] = useState("NFL");
  const [event, setEvent] = useState("");
  const [totalLine, setTotalLine] = useState("54.5");
  const [screenshot, setScreenshot] = useState(null);
  const [values, setValues] = useState(() => Array.from({ length: DHO_COLUMN_COUNT }, () => ["", ""]));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);
  const [notice, setNotice] = useState("");
  const fileRef = useRef(null);
  const workerRef = useRef(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
      if (stored && Array.isArray(stored.slots) && stored.slots.length === DHO_COLUMN_COUNT) {
        setSlots(stored.slots.map((x, i) => ({
          id: i + 1, enabled: x.enabled !== false, name: String(x.name || "").slice(0, 75),
        })));
      }
      if (stored?.layouts?.moneyline && stored?.layouts?.total) {
        setLayouts(stored.layouts);
      }
    } catch { /* invalid profile should never prevent an upload */ }
    setProfileReady(true);
  }, []);
  useEffect(() => {
    if (!profileReady) return;
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ slots, layouts })); } catch { /* private mode */ }
  }, [slots, layouts, profileReady]);
  useEffect(() => () => { workerRef.current?.terminate?.(); workerRef.current = null; }, []);
  const names = useMemo(() => dhoSelectionNames({ market, event, totalLine }), [market, event, totalLine]);
  const layout = layouts[market];
  const enabled = slots.filter(slot => slot.enabled);
  const mapped = enabled.filter(slot => slot.name.trim());
  const recognizedCount = values.flat().filter(x => readDhoAmerican(x) != null).length;
  const review = useMemo(() => buildReviewedDhoRows({
    slots, values, market, event, totalLine, sport,
  }), [slots, values, market, event, totalLine, sport]);
  const hasReviewedPrices = !review.error && review.rows.length > 0;

  function updateSlot(index, patch) {
    setSlots(old => old.map((slot, i) => i === index ? { ...slot, ...patch } : slot));
    setApproved(false);
    setNotice("");
  }
  function updateLayout(key, raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setLayouts(old => ({ ...old, [market]: { ...old[market], [key]: n } }));
    setApproved(false);
    setNotice("");
  }
  function resetValues() {
    setValues(Array.from({ length: DHO_COLUMN_COUNT }, () => ["", ""]));
    setApproved(false);
    setNotice("");
    setError("");
  }
  function setCell(index, side, next) {
    setValues(old => old.map((row, i) =>
      i === index ? row.map((value, j) => j === side ? next : value) : row));
    setApproved(false);
    setNotice("");
  }
  function upload(file) {
    resetValues();
    setScreenshot(null);
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type) || file.size > 12 * 1024 * 1024) {
      setError("Choose a PNG, JPG or WebP screenshot smaller than 12 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError("Could not load this screenshot.");
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => setError("Could not read screenshot dimensions.");
      img.onload = () => {
        if (img.naturalWidth < 500 || img.naturalHeight < 180) {
          setError("Screenshot is too small to resolve sportsbook prices reliably.");
          return;
        }
        setScreenshot({ src: String(reader.result), width: img.naturalWidth, height: img.naturalHeight, fileName: file.name });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function scan() {
    if (!screenshot || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    setApproved(false);
    const next = Array.from({ length: DHO_COLUMN_COUNT }, () => ["", ""]);
    let worker;
    try {
      setProgress("Loading OCR language data…");
      const ocr = await import("tesseract.js");
      worker = await ocr.createWorker("eng", 1);
      workerRef.current = worker;
      // OCR scans local canvas cells. Screenshot is not sent to our server.
      const image = new Image();
      image.src = screenshot.src;
      await image.decode();
      const tasks = [];
      for (let i = 0; i < slots.length; i++) {
        if (!slots[i].enabled) continue;
        for (let side = 0; side < 2; side++) tasks.push([i, side]);
      }
      for (let z = 0; z < tasks.length; z++) {
        const [index, side] = tasks[z];
        setProgress("Reading sportsbook cells " + (z + 1) + " of " + tasks.length + "…");
        const crop = dhoCellCrop(screenshot.width, screenshot.height, index, side, layout);
        if (!crop) continue;
        const cell = toOcrCanvas(image, crop);
        const output = await worker.recognize(cell);
        // Preserve the raw OCR value if it cannot be parsed; do not invent signs.
        let raw = String(output?.data?.text || "").trim().split(/\r?\n/)[0].trim();
        if (raw) {
          const normalized = readDhoAmerican(raw);
          next[index][side] = normalized == null ? raw.slice(0, 35) : (normalized > 0 ? "+" : "") + normalized;
        }
      }
      setValues(next);
      setProgress("Finished. Review and correct the prices before importing.");
    } catch (e) {
      setValues(next);
      setError("OCR could not finish: " + String(e?.message || e) +
        ". You can enter or correct the prices manually below.");
      setProgress("");
    } finally {
      try { await worker?.terminate(); } catch {}
      workerRef.current = null;
      setBusy(false);
    }
  }

  function accept() {
    setNotice("");
    if (!approved) { setError("Check the review confirmation after inspecting the prices."); return; }
    if (review.error) { setError(review.error); return; }
    const imported = onImport?.(review.rows);
    setNotice((Number(imported) || review.rows.length) + " reviewed prices added to the Hedge Finder. Reconfirm these at the sportsbook.");
    setError("");
    setApproved(false);
  }
  return (
    <section style={{ ...panel, background: "#f8fafc", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18 }}>DarkHorseOdds Screenshot Import</h3>
          <p style={muted}>Keep a reusable sportsbook column order, review captured odds, then use them to suggest hedge books.</p>
        </div>
        <button type="button" style={button} onClick={() => setOpen(!open)}>{open ? "Collapse" : "Open screenshot import"}</button>
      </div>
      <p style={muted}><strong>{existingCount} screenshot quotes</strong> currently available to the Hedge Finder.
        Screenshot values are never treated as verified live offers.</p>
      {existingCount > 0 && <button type="button" style={{ ...button, justifySelf: "start" }}
        onClick={() => { if (window.confirm("Clear reviewed DarkHorseOdds prices from the Hedge Finder?")) onClear?.(); }}>
        Clear imported screenshot quotes</button>}
      {open && <>
        <details style={panel}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Sportsbook column order: {mapped.length} of {DHO_COLUMN_COUNT} named / {enabled.length} enabled (edit once)</summary>
          <p style={muted}>Column 1 is the first sportsbook <em>after</em> Best and Fair. Columns are always read left to right.
            Label only the columns you want, and uncheck the rest. The order and settings are saved on this browser.
            Logos are not used to guess sportsbook identity.</p>
          <datalist id="dho-book-names">{DHO_KNOWN_BOOKS.map(name => <option key={name} value={name} />)}</datalist>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(215px,1fr))", gap: 7 }}>
            {slots.map((slot, i) => <label key={slot.id} style={{ display: "flex", alignItems: "center",
              gap: 7, fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 7, padding: 7,
              background: "#fff" }}>
              <input type="checkbox" checked={slot.enabled}
                onChange={e => updateSlot(i, { enabled: e.target.checked })} />
              <span style={{ width: 24, fontWeight: 700 }}>{i + 1}</span>
              <input list="dho-book-names" style={input} value={slot.name}
                placeholder="Sportsbook (editable)" aria-label={"Book column " + (i + 1)}
                onChange={e => updateSlot(i, { name: e.target.value })} />
            </label>)}
          </div>
          <p style={muted}>Use the precise sportsbook names. The list is visually ordered, not automatically alphabetized.
            If the site moves columns, update these positions before importing a new screenshot.</p>
        </details>
        <div style={columns}>
          <label style={field}>Market in screenshot
            <select style={input} value={market} disabled={busy}
              onChange={e => { setMarket(e.target.value); resetValues(); }}>
              <option value="moneyline">Moneyline (two team rows)</option>
              <option value="total">Game total (Over / Under rows)</option>
            </select>
          </label>
          <label style={field}>Sport / league
            <select style={input} value={sport} onChange={e => { setSport(e.target.value); setApproved(false); }}>
              {["NFL","NBA","NCAAF","NCAAM","WNBA","MLB","NHL"].map(x => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label style={field}>Exact event / matchup
            <input list="dho-event-list" style={input} value={event} placeholder="Buffalo Bills @ Los Angeles Rams"
              onChange={e => { setEvent(e.target.value); setApproved(false); }} />
            <datalist id="dho-event-list">{eventNames.map(n => <option key={n} value={n} />)}</datalist>
          </label>
          {market === "total" && <label style={field}>Total points / goals (half-point line)
            <input style={input} value={totalLine} placeholder="54.5"
              onChange={e => { setTotalLine(e.target.value); setApproved(false); }} />
          </label>}
        </div>
        <label style={field}>Add DarkHorseOdds screenshot (PNG / JPG / WebP)
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp"
            disabled={busy} onChange={e => upload(e.target.files?.[0])} />
        </label>
        {screenshot && <>
          <p style={muted}>{screenshot.fileName} ({screenshot.width} × {screenshot.height}). The blue markers show
            sportsbook column centers; green horizontal markers show the two price rows.</p>
          <div style={{ overflowX: "auto", border: "1px solid #cbd5e1", background: "#15202b", borderRadius: 7 }}>
            <div style={{ position: "relative", width: "100%", minWidth: 850 }}>
              <img src={screenshot.src} alt="Imported DarkHorseOdds screenshot to align sportsbook price cells"
                style={{ width: "100%", height: "auto", display: "block" }} />
              {slots.map((slot, i) => <div key={slot.id} title={"Column " + slot.id + (slot.name ? ": " + slot.name : "")}
                style={{ position: "absolute", pointerEvents: "none", top: 0, bottom: 0,
                  left: (100 * dhoColumnCenter(i, layout.first, layout.last)) + "%",
                  borderLeft: "1px solid " + (slot.enabled ? "#38bdf8" : "#64748b"),
                  opacity: slot.enabled ? 0.85 : 0.3 }} />)}
              {[layout.top,layout.bottom].map((position,i) => <div key={i}
                style={{ position: "absolute", left: 0, right: 0, pointerEvents: "none",
                  top: position + "%", borderTop: "1px dashed #4ade80" }} />)}
            </div>
          </div>
        </>}
        <details style={panel}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Adjust screenshot alignment (separate Moneyline and Totals settings)</summary>
          <p style={muted}>These percentages are of the screenshot width or height. Align column 1 with the first
            sportsbook cell after Best/Fair and column 14 with the final book. Row 1 and Row 2
            should run through the center of each odds row.</p>
          <div style={columns}>
            {[["first","First column center (width %)"],["last","Last column center (width %)"],
              ["top","Row 1 center (height %)"],["bottom","Row 2 center (height %)"],
              ["band","Price row crop height (%)"]].map(([key,label]) => <label key={key} style={field}>
                {label} — {Number(layout[key]).toFixed(1)}
                <input type="range" min={key === "band" ? 6 : 0} max={key === "band" ? 30 : 100}
                  step="0.1" value={layout[key]} onChange={e => updateLayout(key, e.target.value)} />
              </label>)}
          </div>
          <button type="button" style={button}
            onClick={() => setLayouts(old => ({ ...old, [market]: { ...DEFAULT_DHO_LAYOUTS[market] } }))}>
            Reset {market} alignment</button>
        </details>
        <button type="button" style={{ ...button, justifySelf: "start" }} disabled={!screenshot || busy || !enabled.length}
          onClick={scan}>{busy ? "Reading prices…" : "Read price cells with OCR"}</button>
        {progress && <p role="status" style={muted}>{progress}</p>}
        <div style={panel}>
          <strong>Review extracted prices (or enter them manually)</strong>
          <p style={muted}>Use American odds with an explicit plus or minus sign (e.g., +159.7 or -110).
            Blank cells are skipped. If OCR loses the sign or inserts a price from an exchange-liquidity line, correct it.
            Select each appropriate sportsbook by its saved column position above.</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 510 }}>
              <thead><tr><th align="left">Column / sportsbook</th><th align="left">{names?.[0]?.label || "Row 1"}</th>
                <th align="left">{names?.[1]?.label || "Row 2"}</th><th align="left">Validation</th></tr></thead>
              <tbody>{slots.map((slot, i) => slot.enabled ? <tr key={slot.id}>
                <td style={{ padding: 5, whiteSpace: "nowrap" }}>{i + 1}. {slot.name || "Unlabeled"}</td>
                {[0,1].map(side => <td key={side} style={{ padding: 5 }}>
                  <input style={input} value={values[i][side]} placeholder="+150"
                    onChange={e => setCell(i, side, e.target.value)}
                    aria-label={"Column " + (i + 1) + " " + (names?.[side]?.label || "row " + (side+1))} />
                </td>)}
                <td style={{ padding: 5, fontWeight: 650, color: values[i].some(x => x && readDhoAmerican(x) == null)
                  ? "#991b1b" : "#166534" }}>
                  {values[i].some(x => x && readDhoAmerican(x) == null) ? "Check" :
                    values[i].some(Boolean) ? "OK" : "Empty"}</td>
              </tr> : null)}</tbody>
            </table>
          </div>
          <p style={muted}>{recognizedCount} valid signed prices across enabled and disabled columns.
            Unknown sportsbook columns must be named or unchecked before importing.</p>
          {review.error && <p style={{ ...muted, color: "#991b1b" }}>{review.error}</p>}
          <label style={{ display: "flex", gap: 8, alignItems: "start", fontSize: 13 }}>
            <input type="checkbox" checked={approved} disabled={!hasReviewedPrices || busy}
              onChange={e => setApproved(e.target.checked)} />
            I've compared the extracted rows and sportsbook columns with the image, and corrected or cleared any uncertain values.
          </label>
          <button type="button" style={{ ...button, justifySelf: "start",
            background: approved && hasReviewedPrices ? "#1d4ed8" : "#f8fafc",
            color: approved && hasReviewedPrices ? "#fff" : "#0f172a" }}
            onClick={accept} disabled={!approved || !hasReviewedPrices || busy}>
            Add {review.rows.length} reviewed quote{review.rows.length === 1 ? "" : "s"} to Hedge Finder</button>
          {error && <p role="alert" style={{ ...muted, color: "#991b1b" }}>{error}</p>}
          {notice && <p role="status" style={{ ...muted, color: "#166534" }}>{notice}</p>}
        </div>
      </>}
    </section>
  );
}
