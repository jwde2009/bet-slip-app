"use client";

import { useState } from "react";
import { importTextPreview, copyImportText, downloadImportText } from "../utils/importTextTools";

export default function ImportTextInput({ rawText, setRawText, sportsbook }) {
  const preview = importTextPreview(rawText);
  const [notice, setNotice] = useState("");
  const [replacement, setReplacement] = useState(null);
  const [copying, setCopying] = useState(false);

  async function copy() {
    setCopying(true);
    setNotice("");
    try {
      await copyImportText(rawText);
      setNotice("Full import text copied.");
    } catch {
      setNotice("Copy did not finish. Use Download TXT and attach that file instead.");
    } finally {
      setCopying(false);
    }
  }

  function download() {
    try {
      downloadImportText(rawText, sportsbook);
      setNotice("Full import downloaded. You can attach the TXT file without copying from this box.");
    } catch {
      setNotice("Download failed. Your import text is still retained.");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <button type="button" onClick={copy} disabled={!preview.length || copying} style={buttonStyle}>
          {copying ? "Copying…" : "Copy full text"}
        </button>
        <button type="button" onClick={download} disabled={!preview.length} style={buttonStyle}>Download TXT</button>
        {preview.truncated && replacement === null && (
          <button type="button" onClick={() => setReplacement("")} style={buttonStyle}>Replace input</button>
        )}
      </div>
      {preview.truncated && (
        <p style={{ fontSize: 13 }}>
          Showing the first {preview.text.length.toLocaleString()} of {preview.length.toLocaleString()} characters.
          The full text is retained for parsing, copying and downloading.
        </p>
      )}
      <textarea
        aria-label={preview.truncated ? "Import text preview" : "Import text"}
        value={preview.text}
        readOnly={preview.truncated}
        onChange={event => { if (!preview.truncated) setRawText(event.target.value); }}
        onPaste={event => {
          const text = event.clipboardData.getData("text/plain");
          if (preview.truncated && text) { event.preventDefault(); setRawText(text); setReplacement(null); }
        }}
        placeholder="Paste odds text here..."
        spellCheck={false}
        wrap="off"
        style={textStyle}
      />
      {replacement !== null && (
        <div>
          <textarea aria-label="Replacement import text" value={replacement}
            onChange={event => setReplacement(event.target.value)} spellCheck={false} wrap="off" style={textStyle}
            placeholder="Paste replacement text here. The current import is retained until you apply it." />
          <button type="button" style={buttonStyle} onClick={() => { setRawText(replacement); setReplacement(null); }}>Apply replacement</button>
          <button type="button" style={buttonStyle} onClick={() => setReplacement(null)}>Cancel replacement</button>
        </div>
      )}
      <div style={{ fontSize: 12, marginTop: 8 }}>Input chars: {preview.length.toLocaleString()}</div>
      <p role="status" style={{ fontSize: 13 }}>{notice}</p>
    </div>
  );
}

const textStyle = { width: "100%", minHeight: 220, padding: 12, borderRadius: 8, border: "1px solid #86efac", fontFamily: "monospace", fontSize: 14, resize: "vertical", background: "#fff", color: "#111" };
const buttonStyle = { padding: "8px 12px", border: "1px solid #166534", borderRadius: 6, background: "#fff", color: "#14532d", cursor: "pointer" };
