/**
 * Server-only resume text extraction. Do NOT import this from a client
 * component — pdf-parse/mammoth/word-extractor pull in Node built-ins
 * (fs, zlib) that cannot be bundled for the browser. Client code should
 * import the shared constants from lib/resume-limits.ts instead.
 */
// Must be imported before "pdf-parse" — see docs/troubleshooting.md upstream
// ("Setting up fake worker failed"). Next.js relocates/transforms bundled
// code, which breaks pdf.js's own relative worker lookup; pointing it at
// the real on-disk worker file (kept external via next.config.ts
// serverExternalPackages) fixes it.
import { getPath } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { detectResumeKind } from "./resume-limits";

PDFParse.setWorker(getPath());

export type ExtractResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * Extract plain text from an uploaded resume file. Never throws — parsing
 * failures (corrupt/mislabeled files) come back as `{ ok: false, error }`.
 */
export async function extractResumeText(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<ExtractResult> {
  const kind = detectResumeKind(fileName, mimeType);
  if (!kind) {
    return {
      ok: false,
      error: "Unsupported file type. Upload a PDF, DOC, DOCX, or TXT file.",
    };
  }

  try {
    switch (kind) {
      case "txt": {
        const text = buffer.toString("utf8");
        return { ok: true, text };
      }
      case "pdf": {
        const parser = new PDFParse({ data: buffer });
        try {
          const result = await parser.getText();
          return { ok: true, text: result.text };
        } finally {
          await parser.destroy();
        }
      }
      case "docx": {
        const result = await mammoth.extractRawText({ buffer });
        return { ok: true, text: result.value };
      }
      case "doc": {
        const doc = await new WordExtractor().extract(buffer);
        return { ok: true, text: doc.getBody() };
      }
    }
  } catch (err) {
    const label = { pdf: "PDF", doc: "DOC", docx: "DOCX", txt: "text" }[kind];
    console.warn(`[hunter] resume extraction (${kind}) failed:`, err);
    return {
      ok: false,
      error: `Could not read this ${label} file — it may be corrupt, password-protected, or scanned images without text.`,
    };
  }
}
