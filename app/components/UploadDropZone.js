"use client";

import { useState } from "react";

export default function UploadDropZone({ onFiles }) {
  const [dragActive, setDragActive] = useState(false);

  function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) =>
      String(file.type || "").startsWith("image/")
    );
    if (files.length > 0) {
      onFiles(files);
    }
  }

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => {
        const input = document.getElementById("bet-slip-dropzone-input");
        if (input) input.click();
      }}
      style={{
        border: `2px dashed ${dragActive ? "#15803d" : "#16a34a"}`,
        borderRadius: 12,
        padding: 18,
        background: dragActive ? "#dcfce7" : "#f0fdf4",
        color: "#14532d",
        fontWeight: 700,
        textAlign: "center",
        cursor: "pointer",
        transition: "all 0.15s ease",
        userSelect: "none",
      }}
    >
      <div style={{ fontSize: 16, marginBottom: 6 }}>
        Drop bet slip screenshots here
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.85 }}>
        or click to choose images
      </div>

      <input
        id="bet-slip-dropzone-input"
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}