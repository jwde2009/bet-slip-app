"use client";

import { useMemo, useState } from "react";

export default function ManualMatchPanel({
  candidates,
  manualMatches,
  onApplyMatch,
  onRemoveMatch,
}) {
  const [draftSelections, setDraftSelections] = useState({});

  const manualMatchMap = useMemo(() => {
    const map = new Map();
    for (const match of manualMatches || []) {
      map.set(match.sourceRowId, match);
    }
    return map;
  }, [manualMatches]);

  if (!candidates?.length) {
    return (
      <section style={sectionStyle}>
        <h2 style={h2Style}>3. Manual Match Review</h2>
        <p style={mutedStyle}>No manual review candidates right now.</p>
      </section>
    );
  }

  return (
    <section style={sectionStyle}>
      <h2 style={h2Style}>3. Manual Match Review</h2>
      <p style={mutedStyle}>
        Same market, different selections. Choose the matching target selection to use in final calculations.
      </p>

      <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
        {candidates.map((candidate) => {
          const existing = manualMatchMap.get(candidate.sourceRowId) || null;

          const selectedBook =
            draftSelections[candidate.sourceRowId]?.sportsbook ||
            existing?.targetSportsbook ||
            candidate.targetBooks[0]?.sportsbook ||
            "";

          const bookOptions = candidate.targetBooks;
          const selectedBookGroup =
            bookOptions.find((book) => book.sportsbook === selectedBook) || bookOptions[0] || null;

          const selectedTargetRowId =
            draftSelections[candidate.sourceRowId]?.targetRowId ||
            existing?.targetRowId ||
            selectedBookGroup?.options?.[0]?.rowId ||
            "";

          return (
            <div key={candidate.sourceRowId} style={cardStyle}>
              <div style={cardHeaderStyle}>
                <div>
                  <div style={eventStyle}>{candidate.eventName}</div>
                  <div style={subtleStyle}>
                    {candidate.marketType} • sharp source: {candidate.sourceSportsbook}
                  </div>
                </div>

                {existing ? <span style={appliedBadgeStyle}>Applied</span> : null}
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={labelStyle}>Sharp selection</div>
                <div style={sharpSelectionStyle}>
                  {candidate.sourceSelectionLabel}
                </div>
              </div>

              <div style={controlsWrapStyle}>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Book</span>
                  <select
                    value={selectedBook}
                    onChange={(e) => {
                      const nextBook = e.target.value;
                      const nextBookGroup =
                        bookOptions.find((book) => book.sportsbook === nextBook) || null;

                      setDraftSelections((prev) => ({
                        ...prev,
                        [candidate.sourceRowId]: {
                          sportsbook: nextBook,
                          targetRowId: nextBookGroup?.options?.[0]?.rowId || "",
                        },
                      }));
                    }}
                    style={selectStyle}
                  >
                    {bookOptions.map((book) => (
                      <option key={book.sportsbook} value={book.sportsbook}>
                        {book.sportsbook}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={fieldStyleWide}>
                  <span style={labelStyle}>Selection</span>
                  <select
                    value={selectedTargetRowId}
                    onChange={(e) => {
                      const nextTargetRowId = e.target.value;

                      setDraftSelections((prev) => ({
                        ...prev,
                        [candidate.sourceRowId]: {
                          sportsbook: selectedBook,
                          targetRowId: nextTargetRowId,
                        },
                      }));
                    }}
                    style={selectStyle}
                  >
                    {(selectedBookGroup?.options || []).map((option) => (
                      <option key={option.rowId} value={option.rowId}>
                        {option.selectionLabel}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={buttonRowStyle}>
                <button
                  type="button"
                  style={primaryButtonStyle}
                  onClick={() => {
                    if (!selectedBookGroup || !selectedTargetRowId) return;

                    const selectedOption =
                      selectedBookGroup.options.find((option) => option.rowId === selectedTargetRowId) ||
                      null;

                    if (!selectedOption) return;

                    onApplyMatch({
                      sourceRowId: candidate.sourceRowId,
                      sourceSportsbook: candidate.sourceSportsbook,
                      sourceSelectionLabel: candidate.sourceSelectionLabel,
                      targetRowId: selectedOption.rowId,
                      targetSportsbook: selectedBookGroup.sportsbook,
                      targetSelectionLabel: selectedOption.selectionLabel,
                    });
                  }}
                >
                  Apply Match
                </button>

                {existing ? (
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={() => onRemoveMatch(candidate.sourceRowId)}
                  >
                    Remove Match
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const sectionStyle = {
  background: "#fff",
  border: "2px solid #166534",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};

const h2Style = {
  marginTop: 0,
  marginBottom: 8,
  color: "#14532d",
};

const mutedStyle = {
  color: "#166534",
  fontSize: 14,
  margin: 0,
};

const cardStyle = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: 14,
  background: "#fafafa",
};

const cardHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const eventStyle = {
  fontWeight: 800,
  color: "#111827",
};

const subtleStyle = {
  color: "#4b5563",
  fontSize: 13,
  marginTop: 4,
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "#166534",
};

const sharpSelectionStyle = {
  marginTop: 4,
  fontWeight: 700,
  color: "#111827",
};

const controlsWrapStyle = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 14,
};

const fieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 180,
};

const fieldStyleWide = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 280,
  flex: 1,
};

const selectStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#fff",
};

const buttonRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 14,
};

const primaryButtonStyle = {
  background: "#166534",
  color: "#f0fdf4",
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const secondaryButtonStyle = {
  background: "#fff",
  color: "#14532d",
  border: "1px solid #86efac",
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const appliedBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#166534",
  color: "#f0fdf4",
  fontWeight: 800,
  fontSize: 12,
};