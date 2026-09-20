"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Crosshair,
  LogOut,
  MapPin,
  Plus,
  Target,
  X,
} from "lucide-react";
import { EXPERIENCE_LEVELS } from "@/lib/types";

type Status = {
  completed: boolean;
  entitlements: { maxCompanies: number; companyPlan: string };
  existing: {
    targetRoles: { id: string; label: string }[];
    locations: string[];
    experienceLevel: string | null;
    companiesCount: number;
  };
};

type CompanyRow = { name: string; careersUrl: string };

const ROLE_SUGGESTIONS = [
  "AI Engineer",
  "GenAI Engineer",
  "ML Engineer",
  "Solutions Architect",
  "Data Scientist",
  "Applied Scientist",
  "Engineering Manager",
  "Product Manager",
];

const LOCATION_SUGGESTIONS = [
  "Bengaluru",
  "Hyderabad",
  "Pune",
  "Mumbai",
  "Delhi NCR",
  "Chennai",
  "Remote",
];

const STEPS = ["Roles", "Preferences", "Companies", "Review"] as const;

const inputClass =
  "w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

function Chip({
  label,
  onRemove,
}: {
  label: string;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] px-2.5 py-1 text-xs text-[var(--accent)]">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="rounded-full p-0.5 hover:bg-[rgba(45,212,191,0.2)]"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function ChipInput({
  values,
  onChange,
  suggestions,
  placeholder,
  max,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  placeholder: string;
  max: number;
}) {
  const [draft, setDraft] = useState("");
  const lower = useMemo(
    () => new Set(values.map((v) => v.toLowerCase())),
    [values],
  );

  function add(raw: string) {
    const v = raw.trim();
    if (!v || lower.has(v.toLowerCase()) || values.length >= max) return;
    onChange([...values, v]);
    setDraft("");
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder={placeholder}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={!draft.trim() || values.length >= max}
          className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 text-sm text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((v) => (
            <Chip
              key={v}
              label={v}
              onRemove={() => onChange(values.filter((x) => x !== v))}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {suggestions
          .filter((s) => !lower.has(s.toLowerCase()))
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              disabled={values.length >= max}
              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-dim)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:opacity-40"
            >
              + {s}
            </button>
          ))}
      </div>
    </div>
  );
}

export function OnboardingWizard({ userName }: { userName: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState(0);
  const [roles, setRoles] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [level, setLevel] = useState<string>("");
  const [resumeText, setResumeText] = useState("");
  const [companies, setCompanies] = useState<CompanyRow[]>([
    { name: "", careersUrl: "" },
    { name: "", careersUrl: "" },
    { name: "", careersUrl: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/onboarding")
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as Status;
      })
      .then((data) => {
        if (cancelled || !data) return;
        setStatus(data);
        if (data.existing.targetRoles.length > 0) {
          setRoles(data.existing.targetRoles.map((r) => r.label));
        }
        if (data.existing.locations.length > 0) {
          setLocations(data.existing.locations);
        }
        if (data.existing.experienceLevel) {
          setLevel(data.existing.experienceLevel);
        }
      })
      .catch(() => {
        /* status is optional; wizard still works with defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const maxCompanies = status?.entitlements.maxCompanies ?? 5;
  const unlimited = maxCompanies < 0;
  const filledCompanies = companies.filter((c) => c.name.trim());
  const overLimit = !unlimited && filledCompanies.length > maxCompanies;

  const stepValid = [
    roles.length > 0,
    true,
    filledCompanies.length > 0 && !overLimit,
    true,
  ][step];

  function updateCompany(i: number, patch: Partial<CompanyRow>) {
    setCompanies((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    );
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRoles: roles,
          locations,
          experienceLevel: level || undefined,
          resumeText: resumeText.trim() || undefined,
          companies: filledCompanies.map((c) => ({
            name: c.name.trim(),
            careersUrl: c.careersUrl.trim(),
          })),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        field?: string;
      };
      if (!res.ok) {
        setError(data.message || data.error || "Could not save onboarding.");
        if (data.field === "targetRoles") setStep(0);
        else if (data.field === "experienceLevel") setStep(1);
        else if (data.field === "companies") setStep(2);
        setSaving(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="glass fade-up w-full max-w-2xl p-8 sm:p-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{
              background: "var(--accent-soft)",
              border: "1px solid rgba(45,212,191,0.35)",
            }}
          >
            <Crosshair className="h-5 w-5" style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <div className="wordmark text-2xl">Hunter</div>
            <div className="eyebrow mt-1">Set up your hunt, {userName}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:text-[var(--text)]"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>

      <ol className="mb-8 flex items-center gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={clsx(
                "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] tabular-nums",
                i < step
                  ? "border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : i === step
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--text-dim)]",
              )}
            >
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span
              className={clsx(
                i === step ? "text-[var(--text)]" : "text-[var(--text-dim)]",
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="mx-1 h-px w-6 bg-[var(--border)]" />
            )}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-[var(--accent)]" />
            <h1 className="prose-title text-xl text-[var(--text)]">
              Which roles are you hunting?
            </h1>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            Your daily digest, board and fetch matching are filtered by these.
            Add at least one.
          </p>
          <ChipInput
            values={roles}
            onChange={setRoles}
            suggestions={ROLE_SUGGESTIONS}
            placeholder="e.g. Staff ML Engineer"
            max={10}
          />
        </section>
      )}

      {step === 1 && (
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[var(--accent)]" />
            <h1 className="prose-title text-xl text-[var(--text)]">
              Where, and at what level?
            </h1>
          </div>
          <div className="space-y-2">
            <span className="eyebrow">Preferred locations</span>
            <ChipInput
              values={locations}
              onChange={setLocations}
              suggestions={LOCATION_SUGGESTIONS}
              placeholder="City or Remote"
              max={10}
            />
          </div>
          <label className="block space-y-2">
            <span className="eyebrow">Experience level</span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className={inputClass}
            >
              <option value="">Prefer not to say</option>
              {EXPERIENCE_LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            <span className="eyebrow">Resume text (optional)</span>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              rows={6}
              placeholder="Paste plain text. Used only to extract keywords for matching. You can upload later from Profile."
              className={clsx(inputClass, "resize-y font-mono text-xs")}
            />
          </label>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[var(--accent)]" />
            <h1 className="prose-title text-xl text-[var(--text)]">
              Which companies should Hunter watch?
            </h1>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            Name is required; the careers URL helps the fetcher find the right
            portal. {unlimited ? "No limit on your plan." : `Your plan tracks up to ${maxCompanies} companies.`}{" "}
            You can add, import or edit these later.
          </p>
          <div className="space-y-2">
            {companies.map((c, i) => (
              <div key={i} className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={c.name}
                  onChange={(e) => updateCompany(i, { name: e.target.value })}
                  placeholder="Company name"
                  className={clsx(inputClass, "sm:w-2/5")}
                />
                <input
                  value={c.careersUrl}
                  onChange={(e) =>
                    updateCompany(i, { careersUrl: e.target.value })
                  }
                  placeholder="https://careers.example.com (optional)"
                  type="url"
                  className={inputClass}
                />
                <button
                  type="button"
                  aria-label="Remove row"
                  onClick={() =>
                    setCompanies((prev) =>
                      prev.length > 1
                        ? prev.filter((_, idx) => idx !== i)
                        : [{ name: "", careersUrl: "" }],
                    )
                  }
                  className="inline-flex items-center justify-center rounded-xl border border-[var(--border)] px-3 py-2 text-[var(--text-dim)] transition hover:text-[var(--text)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                setCompanies((prev) => [...prev, { name: "", careersUrl: "" }])
              }
              disabled={!unlimited && companies.length >= maxCompanies}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Add another
            </button>
            <span
              className={clsx(
                "text-xs tabular-nums",
                overLimit ? "text-[var(--danger)]" : "text-[var(--text-dim)]",
              )}
            >
              {filledCompanies.length}
              {unlimited ? "" : ` / ${maxCompanies}`} filled
            </span>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-5">
          <h1 className="prose-title text-xl text-[var(--text)]">
            Ready to start a blank workspace
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Only jobs fetched for your account will ever appear here. Your
            first digest arrives after the next morning run.
          </p>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <dt className="eyebrow mb-2">Roles</dt>
              <dd className="flex flex-wrap gap-1.5">
                {roles.map((r) => (
                  <Chip key={r} label={r} />
                ))}
              </dd>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <dt className="eyebrow mb-2">Preferences</dt>
              <dd className="space-y-1 text-sm text-[var(--text-muted)]">
                <div>
                  {locations.length > 0
                    ? locations.join(", ")
                    : "Any location"}
                </div>
                <div>
                  {EXPERIENCE_LEVELS.find((l) => l.id === level)?.label ??
                    "Level not specified"}
                </div>
                <div>
                  {resumeText.trim()
                    ? `${resumeText.trim().length.toLocaleString()} resume characters`
                    : "No resume yet"}
                </div>
              </dd>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 sm:col-span-2">
              <dt className="eyebrow mb-2">
                Companies ({filledCompanies.length})
              </dt>
              <dd className="flex flex-wrap gap-1.5">
                {filledCompanies.map((c) => (
                  <Chip key={c.name} label={c.name} />
                ))}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {error && (
        <p className="mt-5 rounded-lg border border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.08)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || saving}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!stepValid}
            className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-medium text-[#0d1117] transition disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void finish()}
            disabled={saving || roles.length === 0 || filledCompanies.length === 0 || overLimit}
            className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-medium text-[#0d1117] transition disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            <Check className="h-4 w-4" />
            {saving ? "Saving…" : "Finish setup"}
          </button>
        )}
      </div>
    </div>
  );
}
