import { notFound, redirect } from "next/navigation";
import { hasResumesAddon, requireUser } from "@/lib/auth";
import { getResume } from "@/lib/resumes";
import { ResumePrintActions } from "@/components/ResumePrintActions";

export const dynamic = "force-dynamic";

/** Print-styled resume (browser "Save as PDF") + Word download. */
export default async function ResumePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");
  if (!hasResumesAddon(user)) redirect("/resumes");
  const { id } = await params;
  const r = await getResume(user.id, id);
  if (!r) notFound();
  const c = r.contact;
  const contactLine = [c.phone, c.email, c.linkedin, c.website, c.location].filter(Boolean).join("  |  ");
  return (
    <div className="resume-print-root">
      <style>{`
        .resume-print-root{background:#fff;color:#111;min-height:100vh;font-family:Georgia,'Times New Roman',serif}
        .rp{max-width:800px;margin:0 auto;padding:40px 48px;font-size:13px;line-height:1.45}
        .rp h1{font-size:24px;margin:0;letter-spacing:.5px}
        .rp .hl{font-size:14px;color:#333;margin-top:2px}
        .rp .ct{font-size:12px;color:#444;margin-top:6px}
        .rp h2{font-size:13px;text-transform:uppercase;letter-spacing:1.5px;border-bottom:1px solid #999;margin:18px 0 6px;padding-bottom:2px}
        .rp .job{margin-top:10px;page-break-inside:avoid}
        .rp .jh{display:flex;justify-content:space-between;font-weight:bold}
        .rp .jc{font-style:italic;color:#333}
        .rp ul{margin:4px 0 0 18px;padding:0}
        .rp li{margin:2px 0}
        .rp-actions{max-width:800px;margin:0 auto;padding:16px 48px 0;display:flex;gap:8px;font-family:system-ui,sans-serif}
        .rp-actions a,.rp-actions button{border:1px solid #999;border-radius:999px;padding:6px 14px;font-size:13px;background:#f5f5f5;color:#111;cursor:pointer;text-decoration:none}
        @media print{.rp-actions{display:none}.rp{padding:0}@page{margin:14mm}}
      `}</style>
      <ResumePrintActions name={r.name} />
      <div className="rp" id="resume-doc">
        <h1>{c.name}</h1>
        {c.headline ? <div className="hl">{c.headline}</div> : null}
        {contactLine ? <div className="ct">{contactLine}</div> : null}
        {r.summary ? (
          <>
            <h2>Professional Summary</h2>
            <p style={{ margin: 0 }}>{r.summary}</p>
          </>
        ) : null}
        {r.skills.length ? (
          <>
            <h2>Core Skills</h2>
            {r.skills.map((g, i) => (
              <div key={i}>
                {g.group ? <b>{g.group}: </b> : null}
                {g.items.join(", ")}
              </div>
            ))}
          </>
        ) : null}
        {r.experience.length ? (
          <>
            <h2>Professional Experience</h2>
            {r.experience.map((e) => (
              <div className="job" key={e.id}>
                <div className="jh">
                  <span>{e.title}</span>
                  <span>{[e.start, e.end].filter(Boolean).join(" – ")}</span>
                </div>
                <div className="jc">{[e.company, e.location].filter(Boolean).join(", ")}</div>
                {e.bullets.length ? (
                  <ul>
                    {e.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </>
        ) : null}
        {r.certifications.length ? (
          <>
            <h2>Certifications</h2>
            <ul>
              {r.certifications.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </>
        ) : null}
        {r.education.length ? (
          <>
            <h2>Education</h2>
            <ul>
              {r.education.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}
