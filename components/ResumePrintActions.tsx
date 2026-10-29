"use client";

/** Print / Word export buttons for the print-styled resume page. */
export function ResumePrintActions({ name }: { name: string }) {
  function downloadWord() {
    const el = document.getElementById("resume-doc");
    const styles = Array.from(document.querySelectorAll("style"))
      .map((s) => s.innerHTML)
      .join("\n");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>${styles}</style></head><body class="resume-print-root">${el?.outerHTML ?? ""}</body></html>`;
    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/[^\w\- ]+/g, "").trim() || "resume"}.doc`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <div className="rp-actions">
      <a href="/resumes">← Back</a>
      <button type="button" onClick={() => window.print()}>
        Print / Save as PDF
      </button>
      <button type="button" onClick={downloadWord}>
        Download Word (.doc)
      </button>
    </div>
  );
}
