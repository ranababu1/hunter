/**
 * Pure constants/types shared by the client upload UI and the server
 * extraction route. No Node-only imports here — this file is safe to bundle
 * into client components. Server-side text extraction (which pulls in
 * pdf-parse/mammoth/word-extractor) lives in lib/resume-extract.ts instead.
 */

/** Hard cap on an uploaded resume file, enforced client- and server-side. */
export const MAX_RESUME_UPLOAD_BYTES = 500 * 1024; // 500 KB

export const ACCEPTED_RESUME_EXTENSIONS = [".pdf", ".doc", ".docx", ".txt"] as const;
export type ResumeKind = "pdf" | "doc" | "docx" | "txt";

const EXTENSION_BY_MIME: Record<string, ResumeKind> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

/** Prefer the file extension (mime types from browsers are inconsistent), fall back to mime type. */
export function detectResumeKind(fileName: string, mimeType: string): ResumeKind | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".doc")) return "doc";
  if (lower.endsWith(".txt")) return "txt";
  return EXTENSION_BY_MIME[mimeType] ?? null;
}
