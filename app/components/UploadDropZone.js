"use client";

import { useRef, useState } from "react";

export default function UploadDropZone({ onFiles }) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

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
      style={{
        border: `2px dashed ${dragActive ? "#15803d" : "#16a34a"}`,
        borderRadius: 12,
        padding: 18,
        background: dragActive ? "#dcfce7" : "#f0fdf4",
        color: "#14532d",
        fontWeight: 700,
        textAlign: "center",
        transition: "all 0.15s ease",
        userSelect: "none",
      }}
    >
      <div style={{ fontSize: 16, marginBottom: 6 }}>
        Drop bet slip screenshots here
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.85, marginBottom: 12 }}>
        or choose images / a folder
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: "8px 12px",
            border: "1px solid #16a34a",
            borderRadius: 8,
            background: "#ffffff",
            color: "#14532d",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Choose Images
        </button>

        <button
          type="button"
          onClick={() => folderInputRef.current?.click()}
          style={{
            padding: "8px 12px",
            border: "1px solid #2563eb",
            borderRadius: 8,
            background: "#eff6ff",
            color: "#1d4ed8",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Choose Folder
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      <input
        ref={folderInputRef}
        type="file"
        accept="image/*"
        multiple
        webkitdirectory="true"
        directory=""
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
