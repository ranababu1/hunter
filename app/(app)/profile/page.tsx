"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, X, Upload } from "lucide-react";
import type { TargetRole, UserProfile } from "@/lib/types";
import {
  ACCEPTED_RESUME_EXTENSIONS,
  MAX_RESUME_UPLOAD_BYTES,
} from "@/lib/resume-limits";
import { EXPERIENCE_LEVELS } from "@/lib/types";
import { QuotaBanner } from "@/components/QuotaBanner";
import { useMe } from "@/components/MeProvider";

export default function ProfilePage() {
  const { me, refreshMe } = useMe();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [locations, setLocations] = useState<string[]>([]);
  const [locationInput, setLocationInput] = useState("");
  const [level, setLevel] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [roles, setRoles] = useState<TargetRole[]>([]);
  const [roleInput, setRoleInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const pRes = await fetch("/api/profile");
      if (pRes.ok) {
        const data = (await pRes.json()) as {
          profile: UserProfile;
          user?: { phone?: string; name?: string };
        };
        setProfile(data.profile);
        setDisplayName(data.profile.displayName || data.user?.name || "");
        setPhone(data.profile.phone || data.user?.phone || "");
        setResumeText(data.profile.resumeText ?? "");
        setRoles(data.profile.targetRoles ?? []);
        setLocations(data.profile.locations ?? []);
        setLevel(data.profile.experienceLevel ?? "");
      }
      setError(null);
    } catch {
      setError("Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function addRole() {
    const label = roleInput.trim();
    if (!label) return;
    if (roles.some((r) => r.label.toLowerCase() === label.toLowerCase())) {
      setRoleInput("");
      return;
    }
    setRoles([
      ...roles,
      {
        id: `role-${Date.now()}-${label.toLowerCase().replace(/\s+/g, "-")}`,
        label,
      },
    ]);
    setRoleInput("");
  }

  function removeRole(id: string) {
    setRoles(roles.filter((r) => r.id !== id));
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setError(null);
    setMessage(null);

    const lower = file.name.toLowerCase();
    const looksSupported = ACCEPTED_RESUME_EXTENSIONS.some((ext) =>
      lower.endsWith(ext),
    );
    if (!looksSupported) {
      setError(
        `Unsupported file type. Upload one of: ${ACCEPTED_RESUME_EXTENSIONS.join(", ")}.`,
      );
      return;
    }
    if (file.size > MAX_RESUME_UPLOAD_BYTES) {
      setError(
        `File is too large — resumes are capped at ${Math.round(
          MAX_RESUME_UPLOAD_BYTES / 1024,
        )} KB. This one is ${Math.ceil(file.size / 1024)} KB.`,
      );
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      // No Content-Type header — the browser sets the multipart boundary itself.
      const res = await fetch("/api/profile/resume", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        profile?: UserProfile;
      };
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Upload failed");
        return;
      }
      if (data.profile) {
        setProfile(data.profile);
        setResumeText(data.profile.resumeText);
      }
      setMessage(
        `Loaded ${file.name} (${data.profile?.resumeText.length ?? 0} chars)`,
      );
      await refreshMe();
    } catch {
      setError("Network error uploading resume");
    } finally {
      setUploading(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          phone,
          resumeText,
          targetRoles: roles,
          locations,
          experienceLevel: level || null,
          resumeMeta: profile?.resumeMeta?.fileName
            ? profile.resumeMeta
            : {
                charCount: resumeText.length,
                uploadedAt: new Date().toISOString(),
              },
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        kind?: string;
        message?: string;
        profile?: UserProfile;
      };
      if (!res.ok) {
        if (data.error === "QUOTA_EXCEEDED") {
          setError(
            data.message ??
              "Free tier maxxed out. Continue for $10/mo",
          );
        } else {
          setError(data.error ?? "Save failed");
        }
        return;
      }
      if (data.profile) {
        setProfile(data.profile);
      }
      setMessage("Profile saved");
      await refreshMe();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="glass px-6 py-16 text-center text-sm text-[var(--text-muted)]">
        Loading profile…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 fade-up">
      <div>
        <div className="eyebrow mb-2">You</div>
        <h1 className="prose-title text-3xl sm:text-4xl">Profile</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Resume text and target roles for matching. Stored per-user in Redis.
        </p>
      </div>

      {me && (
        <QuotaBanner
          bytesUsed={me.usage.bytesUsed}
          maxStorageBytes={me.entitlements.maxStorageBytes}
        />
      )}

      <form onSubmit={onSave} className="glass space-y-5 p-6">
        <label className="block space-y-1.5">
          <span className="eyebrow">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="eyebrow">Phone</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 …"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Resume</span>
            <label
              className={
                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]" +
                (uploading ? " pointer-events-none opacity-50" : "")
              }
            >
              <Upload className="h-3 w-3" />
              {uploading ? "Uploading…" : "Upload PDF/DOC/DOCX/TXT"}
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                disabled={uploading}
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            rows={12}
            placeholder="Paste resume text here…"
            className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--accent)]"
          />
          <p className="text-xs text-[var(--text-dim)]">
            {resumeText.length.toLocaleString()} characters
            {profile?.resumeMeta?.fileName
              ? ` · ${profile.resumeMeta.fileName}`
              : ""}
            {" · "}max {Math.round(MAX_RESUME_UPLOAD_BYTES / 1024)} KB per upload
          </p>
        </div>

        <div className="space-y-2">
          <span className="eyebrow">Target roles</span>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 rounded-full border border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] px-2.5 py-1 text-xs text-[var(--accent)]"
              >
                {r.label}
                <button
                  type="button"
                  onClick={() => removeRole(r.id)}
                  className="opacity-70 hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRole();
                }
              }}
              placeholder="e.g. Staff ML Engineer"
              className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={addRole}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <span className="eyebrow">Preferred locations</span>
          <div className="flex flex-wrap gap-2">
            {locations.map((loc) => (
              <span
                key={loc}
                className="inline-flex items-center gap-1 rounded-full border border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] px-2.5 py-1 text-xs text-[var(--accent)]"
              >
                {loc}
                <button
                  type="button"
                  onClick={() =>
                    setLocations(locations.filter((l) => l !== loc))
                  }
                  className="opacity-70 hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = locationInput.trim();
                  if (
                    v &&
                    !locations.some((l) => l.toLowerCase() === v.toLowerCase())
                  ) {
                    setLocations([...locations, v].slice(0, 10));
                  }
                  setLocationInput("");
                }
              }}
              placeholder="e.g. Bengaluru, Remote"
              className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={() => {
                const v = locationInput.trim();
                if (
                  v &&
                  !locations.some((l) => l.toLowerCase() === v.toLowerCase())
                ) {
                  setLocations([...locations, v].slice(0, 10));
                }
                setLocationInput("");
              }}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="eyebrow">Experience level</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          >
            <option value="">Prefer not to say</option>
            {EXPERIENCE_LEVELS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        {message && <p className="text-sm text-[var(--strong)]">{message}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full border border-[rgba(45,212,191,0.35)] bg-[var(--accent-soft)] px-5 py-2 text-sm font-medium text-[var(--accent)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
    </div>
  );
}
