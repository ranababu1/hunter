"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  Copy,
  FileText,
  Lock,
  Plus,
  Printer,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { MAX_RESUME_UPLOAD_BYTES } from "@/lib/resume-limits";
import type { ResumeDoc, ResumeExperience } from "@/lib/types";

const chip =
  "rounded-full border px-3 py-1.5 text-xs transition inline-flex items-center gap-1.5";
const chipIdle =
  "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]";
const chipActive =
  "border-[rgba(45,212,191,0.45)] bg-[var(--accent-soft)] text-[var(--accent)]";
const input =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--text)] outline-none focus:border-[var(--border-strong)]";

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function UpgradePrompt() {
  return (
    <div className="glass mx-auto max-w-xl p-8 text-center">
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: "var(--accent-soft)", border: "1px solid rgba(45,212,191,0.35)" }}
      >
        <Lock className="h-5 w-5" style={{ color: "var(--accent)" }} />
      </div>
      <h2 className="prose-title mt-4 text-2xl">Resume Manager add-on</h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Keep every version of your resume in one place — base resumes per
        track and tailored copies per job. Edit sections inline, generate a
        tailored draft from a job description, and export to PDF or Word.
      </p>
      <div className="mt-5 text-3xl font-semibold text-[var(--text)]">
        $30<span className="text-base font-normal text-[var(--text-dim)]">/month</span>
      </div>
      <p className="mt-1 text-xs text-[var(--text-dim)]">
        Separate from your plan. Online checkout is coming soon.
      </p>
      <Link
        href="/contact"
        className="mt-5 inline-flex items-center gap-2 rounded-full border border-[rgba(45,212,191,0.45)] bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--accent)] transition hover:brightness-110"
      >
        <FileText className="h-3.5 w-3.5" /> Request access
      </Link>
    </div>
  );
}

function StatusBadge({ r }: { r: ResumeDoc }) {
  const map: Record<string, [string, string]> = {
    draft_requested: ["Draft requested", "#f59e0b"],
    draft_ready: ["Draft ready — review", "var(--accent)"],
  };
  const m = map[r.status];
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span
        className="rounded-full border px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase"
        style={{
          borderColor: r.kind === "base" ? "var(--border-strong)" : "rgba(45,212,191,0.35)",
          color: r.kind === "base" ? "var(--text-muted)" : "var(--accent)",
        }}
      >
        {r.kind}
      </span>
      {m ? (
        <span
          className="rounded-full border px-1.5 py-0.5 text-[0.65rem] font-semibold"
          style={{ borderColor: m[1], color: m[1] }}
        >
          {m[0]}
        </span>
      ) : null}
    </span>
  );
}

function linesToArr(s: string) {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function Editor({
  doc,
  bases,
  applyLabel,
  onChange,
}: {
  doc: ResumeDoc;
  bases: Map<string, string>;
  applyLabel?: string;
  onChange: (d: ResumeDoc) => void;
}) {
  const set = <K extends keyof ResumeDoc>(k: K, v: ResumeDoc[K]) => onChange({ ...doc, [k]: v });
  const setExp = (i: number, patch: Partial<ResumeExperience>) =>
    set(
      "experience",
      doc.experience.map((e, j) => (j === i ? { ...e, ...patch } : e)),
    );
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-[var(--text-dim)]">
          Name
          <input className={input} value={doc.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="text-xs text-[var(--text-dim)]">
          Target role / track
          <input className={input} value={doc.track} onChange={(e) => set("track", e.target.value)} />
        </label>
        <label className="text-xs text-[var(--text-dim)] sm:col-span-2">
          Tags (comma-separated)
          <input
            className={input}
            value={doc.tags.join(", ")}
            onChange={(e) =>
              set(
                "tags",
                e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
              )
            }
          />
        </label>
      </div>

      {doc.kind === "tailored" ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-xs text-[var(--text-muted)]">
          Tailored from <b>{doc.baseId ? bases.get(doc.baseId) ?? "a deleted base" : "—"}</b>
          {applyLabel ? (
            <>
              {" "}for <Link href="/apply" className="text-[var(--accent)] underline">{applyLabel}</Link>
            </>
          ) : null}
          {doc.status === "draft_requested" ? (
            <p className="mt-1 text-[#f59e0b]">
              Draft requested — your assistant will fill this version in from the base
              and the job description. You can still edit it meanwhile.
            </p>
          ) : null}
          {doc.jdText ? (
            <details className="mt-2">
              <summary className="cursor-pointer">Job description</summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap">{doc.jdText}</pre>
            </details>
          ) : null}
        </div>
      ) : null}

      <section>
        <div className="eyebrow mb-2">Contact</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["name", "headline", "phone", "email", "linkedin", "website", "location"] as const).map((k) => (
            <input
              key={k}
              className={input}
              placeholder={k}
              value={doc.contact[k] ?? ""}
              onChange={(e) => set("contact", { ...doc.contact, [k]: e.target.value })}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="eyebrow mb-2">Summary</div>
        <textarea
          className={`${input} min-h-28`}
          value={doc.summary}
          onChange={(e) => set("summary", e.target.value)}
        />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <span className="eyebrow">Experience</span>
          <button
            type="button"
            className={`${chip} ${chipIdle}`}
            onClick={() =>
              set("experience", [
                ...doc.experience,
                { id: crypto.randomUUID(), company: "", title: "", start: "", end: "", bullets: [] },
              ])
            }
          >
            <Plus className="h-3 w-3" /> Add role
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {doc.experience.map((e, i) => (
            <div key={e.id} className="rounded-xl border border-[var(--border)] p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={input} placeholder="Title" value={e.title} onChange={(ev) => setExp(i, { title: ev.target.value })} />
                <input className={input} placeholder="Company" value={e.company} onChange={(ev) => setExp(i, { company: ev.target.value })} />
                <input className={input} placeholder="Start" value={e.start} onChange={(ev) => setExp(i, { start: ev.target.value })} />
                <input className={input} placeholder="End" value={e.end} onChange={(ev) => setExp(i, { end: ev.target.value })} />
              </div>
              <textarea
                className={`${input} mt-2 min-h-28`}
                placeholder="One bullet per line"
                value={e.bullets.join("\n")}
                onChange={(ev) => setExp(i, { bullets: ev.target.value.split("\n") })}
                onBlur={(ev) => setExp(i, { bullets: linesToArr(ev.target.value) })}
              />
              <div className="mt-2 flex gap-2">
                <button type="button" className={`${chip} ${chipIdle}`} disabled={i === 0}
                  onClick={() => {
                    const x = [...doc.experience];
                    [x[i - 1], x[i]] = [x[i], x[i - 1]];
                    set("experience", x);
                  }}>↑</button>
                <button type="button" className={`${chip} ${chipIdle}`}
                  onClick={() => set("experience", doc.experience.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="eyebrow mb-2">Skills (one group per line: Group: a, b, c)</div>
        <textarea
          className={`${input} min-h-28`}
          defaultValue={doc.skills.map((g) => (g.group ? `${g.group}: ` : "") + g.items.join(", ")).join("\n")}
          key={`skills-${doc.id}`}
          onBlur={(e) =>
            set(
              "skills",
              linesToArr(e.target.value).map((line) => {
                const idx = line.indexOf(":");
                const group = idx > 0 ? line.slice(0, idx).trim() : "";
                const rest = idx > 0 ? line.slice(idx + 1) : line;
                return { group, items: rest.split(",").map((x) => x.trim()).filter(Boolean) };
              }),
            )
          }
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-[var(--text-dim)]">
          <span className="eyebrow">Certifications (one per line)</span>
          <textarea className={`${input} min-h-24`} key={`c-${doc.id}`}
            defaultValue={doc.certifications.join("\n")}
            onBlur={(e) => set("certifications", linesToArr(e.target.value))} />
        </label>
        <label className="text-xs text-[var(--text-dim)]">
          <span className="eyebrow">Education (one per line)</span>
          <textarea className={`${input} min-h-24`} key={`e-${doc.id}`}
            defaultValue={doc.education.join("\n")}
            onBlur={(e) => set("education", linesToArr(e.target.value))} />
        </label>
      </section>

      <section>
        <div className="eyebrow mb-2">Notes / tailoring log</div>
        <textarea className={`${input} min-h-20`} value={doc.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </section>

      {doc.rawText ? (
        <details className="text-xs text-[var(--text-muted)]">
          <summary className="cursor-pointer">Extracted text from {doc.sourceFileName ?? "upload"}</summary>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] p-3">{doc.rawText}</pre>
        </details>
      ) : null}
    </div>
  );
}

export function ResumesView({
  enabled,
  initialResumes,
  applyItems,
  initialId,
}: {
  enabled: boolean;
  initialResumes: ResumeDoc[];
  applyItems: { id: string; label: string }[];
  initialId?: string;
}) {
  const [resumes, setResumes] = useState(initialResumes);
  const [selId, setSelId] = useState<string | null>(
    initialId && initialResumes.some((r) => r.id === initialId)
      ? initialId
      : (initialResumes[0]?.id ?? null),
  );
  const [draft, setDraft] = useState<ResumeDoc | null>(
    initialResumes.find((r) => r.id === selId) ?? null,
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "base" | "tailored">("all");
  const [gen, setGen] = useState<{ baseId: string; name: string; jdText: string; applyItemId: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const bases = useMemo(
    () => new Map(resumes.filter((r) => r.kind === "base").map((r) => [r.id, r.name])),
    [resumes],
  );
  const applyMap = useMemo(() => new Map(applyItems.map((a) => [a.id, a.label])), [applyItems]);

  if (!enabled) {
    return (
      <div className="fade-up">
        <div className="mb-6">
          <div className="eyebrow">Add-on</div>
          <h1 className="prose-title text-3xl">Resumes</h1>
        </div>
        <UpgradePrompt />
      </div>
    );
  }

  function select(id: string) {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    setSelId(id);
    setDraft(resumes.find((r) => r.id === id) ?? null);
    setDirty(false);
  }

  function upsertLocal(doc: ResumeDoc) {
    setResumes((rs) => {
      const has = rs.some((r) => r.id === doc.id);
      return has ? rs.map((r) => (r.id === doc.id ? doc : r)) : [doc, ...rs];
    });
  }

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, init);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      return j;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    const j = await call(`/api/resumes/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        draft.status === "draft_ready" ? { ...draft, status: "ready" } : draft,
      ),
    });
    if (j?.resume) {
      upsertLocal(j.resume);
      setDraft(j.resume);
      setDirty(false);
      setMsg("Saved");
    }
  }

  async function create(body: unknown) {
    const j = await call("/api/resumes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (j?.resume) {
      upsertLocal(j.resume);
      setSelId(j.resume.id);
      setDraft(j.resume);
      setDirty(false);
    }
    return j;
  }

  async function remove(id: string) {
    if (!confirm("Delete this resume version?")) return;
    const j = await call(`/api/resumes/${id}`, { method: "DELETE" });
    if (j) {
      const rest = resumes.filter((r) => r.id !== id);
      setResumes(rest);
      setSelId(rest[0]?.id ?? null);
      setDraft(rest[0] ?? null);
      setDirty(false);
    }
  }

  async function upload(f: File) {
    if (f.size > MAX_RESUME_UPLOAD_BYTES) {
      setMsg(`File too large — max ${Math.round(MAX_RESUME_UPLOAD_BYTES / 1024)} KB`);
      return;
    }
    const fd = new FormData();
    fd.append("file", f);
    const j = await call("/api/resumes/upload", { method: "POST", body: fd });
    if (j?.resume) {
      upsertLocal(j.resume);
      setSelId(j.resume.id);
      setDraft(j.resume);
      setDirty(false);
    }
  }

  const shown = resumes.filter((r) => filter === "all" || r.kind === filter);

  return (
    <div className="fade-up">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Add-on</div>
          <h1 className="prose-title text-3xl">Resumes</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Base resumes per track and tailored versions per job.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${chip} ${chipIdle}`} disabled={busy}
            onClick={() => create({ action: "create", resume: { name: "New resume" } })}>
            <Plus className="h-3 w-3" /> New blank
          </button>
          <button type="button" className={`${chip} ${chipIdle}`} disabled={busy}
            onClick={() => fileRef.current?.click()}>
            <Upload className="h-3 w-3" /> Upload PDF/DOCX
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }} />
          <button type="button" className={`${chip} ${chipActive}`} disabled={busy || bases.size === 0}
            onClick={() =>
              setGen({
                baseId: (draft?.kind === "base" ? draft.id : [...bases.keys()][0]) ?? "",
                name: "",
                jdText: "",
                applyItemId: "",
              })
            }>
            <Sparkles className="h-3 w-3" /> Generate tailored
          </button>
        </div>
      </div>

      {msg ? <div className="mb-3 text-xs text-[var(--text-muted)]">{msg}</div> : null}

      {gen ? (
        <div className="glass mb-5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="eyebrow">Generate a tailored version</span>
            <button type="button" onClick={() => setGen(null)}><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-[var(--text-dim)]">Base resume
              <select className={input} value={gen.baseId} onChange={(e) => setGen({ ...gen, baseId: e.target.value })}>
                {[...bases].map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            </label>
            <label className="text-xs text-[var(--text-dim)]">Link to Apply item (optional)
              <select className={input} value={gen.applyItemId} onChange={(e) => setGen({ ...gen, applyItemId: e.target.value })}>
                <option value="">—</option>
                {applyItems.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-[var(--text-dim)] sm:col-span-2">Name (optional)
              <input className={input} value={gen.name} onChange={(e) => setGen({ ...gen, name: e.target.value })} placeholder="e.g. Acme — Head of AI" />
            </label>
            <label className="text-xs text-[var(--text-dim)] sm:col-span-2">Job description (optional, paste)
              <textarea className={`${input} min-h-32`} value={gen.jdText} onChange={(e) => setGen({ ...gen, jdText: e.target.value })} />
            </label>
          </div>
          <p className="mt-2 text-xs text-[var(--text-dim)]">
            Creates a copy of the base marked “Draft requested”. Your assistant rewrites
            it for the job (never adding skills you don&apos;t have) and marks it ready for review.
          </p>
          <button type="button" className={`${chip} ${chipActive} mt-3`} disabled={busy || !gen.baseId}
            onClick={async () => {
              const j = await create({ action: "generate", ...gen });
              if (j) setGen(null);
            }}>
            <Sparkles className="h-3 w-3" /> Request draft
          </button>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            {(["all", "base", "tailored"] as const).map((f) => (
              <button key={f} type="button" className={`${chip} ${filter === f ? chipActive : chipIdle}`} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <div className="glass p-4 text-sm text-[var(--text-muted)]">No resumes yet — upload one or start blank.</div>
          ) : null}
          {shown.map((r) => (
            <button key={r.id} type="button" onClick={() => select(r.id)}
              className={`glass p-3 text-left transition ${r.id === selId ? "ring-1 ring-[rgba(45,212,191,0.6)]" : "hover:brightness-110"}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-[var(--text)]">{r.name}</span>
                <StatusBadge r={r} />
              </div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">{r.track || "—"}</div>
              {r.applyItemId && applyMap.get(r.applyItemId) ? (
                <div className="mt-1 text-xs text-[var(--accent)]">↳ {applyMap.get(r.applyItemId)}</div>
              ) : r.kind === "tailored" && r.baseId ? (
                <div className="mt-1 text-xs text-[var(--text-dim)]">from {bases.get(r.baseId) ?? "base"}</div>
              ) : null}
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {r.tags.map((t) => (
                  <span key={t} className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[0.65rem] text-[var(--text-dim)]">{t}</span>
                ))}
                <span className="ml-auto text-[0.65rem] text-[var(--text-dim)]">{fmt(r.updatedAt)}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="glass p-4">
          {draft ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <StatusBadge r={draft} />
                <span className="ml-auto" />
                <button type="button" className={`${chip} ${dirty ? chipActive : chipIdle}`} disabled={busy} onClick={save}>
                  <Save className="h-3 w-3" /> {draft.status === "draft_ready" ? "Approve & save" : "Save"}
                </button>
                <button type="button" className={`${chip} ${chipIdle}`} disabled={busy}
                  onClick={() => create({ action: "duplicate", fromId: draft.id })}>
                  <Copy className="h-3 w-3" /> Duplicate
                </button>
                <a className={`${chip} ${chipIdle}`} href={`/print/resume/${draft.id}`} target="_blank" rel="noreferrer">
                  <Printer className="h-3 w-3" /> Export PDF / Word
                </a>
                <button type="button" className={`${chip} ${chipIdle}`} disabled={busy} onClick={() => remove(draft.id)}>
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
              <Editor
                key={draft.id}
                doc={draft}
                bases={bases}
                applyLabel={draft.applyItemId ? applyMap.get(draft.applyItemId) : undefined}
                onChange={(d) => {
                  setDraft(d);
                  setDirty(true);
                }}
              />
            </>
          ) : (
            <div className="text-sm text-[var(--text-muted)]">Select a resume.</div>
          )}
        </div>
      </div>
    </div>
  );
}
