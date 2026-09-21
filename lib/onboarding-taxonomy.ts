/**
 * Onboarding role taxonomy. Hunter is not AI-only, so the wizard starts
 * with a cross-functional default and narrows to a family's related roles
 * (and a family-flavored "leadership" wording) once the user names their
 * first desired role — e.g. "Project Manager" swaps the suggestion rail to
 * program/product/ops-management roles instead of engineering ones.
 */
import { EXPERIENCE_LEVELS, type ExperienceLevel } from "./types";

export interface RoleFamily {
  key: string;
  /** Matched against the lowercased first role the user typed/picked. */
  test: (roleLower: string) => boolean;
  suggestions: string[];
  /** Overrides only the top-tier label; ids stay the canonical EXPERIENCE_LEVELS ids. */
  leadershipLabel: string;
}

export const DEFAULT_ROLE_SUGGESTIONS = [
  "Software Engineer",
  "Product Manager",
  "Data Analyst",
  "Project Manager",
  "UX Designer",
  "Sales Manager",
  "Marketing Manager",
  "Management Consultant",
];

const FAMILIES: RoleFamily[] = [
  {
    key: "project-program",
    test: (r) => /\b(project|program)\s*manager\b|\bpmo\b|\bscrum master\b/.test(r),
    suggestions: [
      "Program Manager",
      "Product Manager",
      "Operations Manager",
      "Scrum Master",
      "Delivery Manager",
      "Chief of Staff",
      "Business Analyst",
      "Project Coordinator",
    ],
    leadershipLabel: "Leadership (Director of PMO / VP Delivery)",
  },
  {
    key: "product",
    test: (r) => /\bproduct\s*(manager|owner)\b/.test(r),
    suggestions: [
      "Senior Product Manager",
      "Product Owner",
      "Group Product Manager",
      "Product Analyst",
      "Program Manager",
      "Product Marketing Manager",
      "UX Researcher",
      "Product Designer",
    ],
    leadershipLabel: "Leadership (Director / VP Product)",
  },
  {
    key: "design",
    test: (r) => /\b(designer|ux|ui)\b/.test(r),
    suggestions: [
      "Product Designer",
      "UX Designer",
      "UI Designer",
      "UX Researcher",
      "Design Lead",
      "Visual Designer",
      "Design Systems Engineer",
      "Creative Director",
    ],
    leadershipLabel: "Leadership (Design Director / VP Design)",
  },
  {
    key: "sales",
    test: (r) => /\b(sales|account executive|business development|bdr|sdr)\b/.test(r),
    suggestions: [
      "Account Executive",
      "Sales Manager",
      "Business Development Manager",
      "Sales Engineer",
      "Customer Success Manager",
      "Regional Sales Director",
      "Enterprise Account Executive",
      "Partnerships Manager",
    ],
    leadershipLabel: "Leadership (VP Sales / CRO)",
  },
  {
    key: "marketing",
    test: (r) => /\b(marketing|growth|brand|seo|demand gen)\b/.test(r),
    suggestions: [
      "Growth Marketing Manager",
      "Content Marketing Manager",
      "Product Marketing Manager",
      "Brand Manager",
      "Performance Marketing Manager",
      "SEO Manager",
      "Marketing Analyst",
      "Demand Generation Manager",
    ],
    leadershipLabel: "Leadership (VP Marketing / CMO track)",
  },
  {
    key: "finance",
    test: (r) => /\b(finance|financial|accountant|accounting|fp&a|treasury|audit)\b/.test(r),
    suggestions: [
      "Financial Analyst",
      "FP&A Manager",
      "Controller",
      "Finance Manager",
      "Investment Analyst",
      "Accounting Manager",
      "Treasury Analyst",
      "Risk Analyst",
    ],
    leadershipLabel: "Leadership (VP Finance / CFO track)",
  },
  {
    key: "hr",
    test: (r) => /\b(hr\b|human resources|people (partner|operations)|recruit|talent)\b/.test(r),
    suggestions: [
      "HR Business Partner",
      "Talent Acquisition Manager",
      "People Operations Manager",
      "Recruiter",
      "Compensation Analyst",
      "L&D Manager",
      "HR Generalist",
      "People Partner",
    ],
    leadershipLabel: "Leadership (VP People / CHRO track)",
  },
  {
    key: "consulting",
    test: (r) => /\b(consultant|consulting|strategy|advisory)\b/.test(r),
    suggestions: [
      "Management Consultant",
      "Strategy Consultant",
      "Business Analyst",
      "Associate Consultant",
      "Engagement Manager",
      "Principal Consultant",
      "Transformation Lead",
      "Advisory Consultant",
    ],
    leadershipLabel: "Leadership (Principal / Partner track)",
  },
  {
    key: "operations",
    test: (r) => /\b(operations|ops manager|supply chain|logistics)\b/.test(r),
    suggestions: [
      "Operations Manager",
      "Supply Chain Manager",
      "Process Improvement Manager",
      "Logistics Manager",
      "Business Operations Analyst",
      "Continuous Improvement Lead",
      "Vendor Manager",
      "Facilities Manager",
    ],
    leadershipLabel: "Leadership (Director of Operations+)",
  },
  {
    key: "data",
    test: (r) => /\b(data analyst|business intelligence|\bbi\b|analytics|reporting)\b/.test(r),
    suggestions: [
      "Data Analyst",
      "Business Intelligence Analyst",
      "Data Engineer",
      "Analytics Manager",
      "Data Scientist",
      "Reporting Analyst",
      "Data Strategy Lead",
      "Insights Manager",
    ],
    leadershipLabel: "Leadership (Head of Data / VP Analytics)",
  },
  {
    key: "tech",
    test: (r) =>
      /\b(engineer|developer|architect|devops|sre|qa|ai|ml|machine learning)\b/.test(r),
    suggestions: [
      "Software Engineer",
      "Engineering Manager",
      "Solutions Architect",
      "DevOps Engineer",
      "QA Engineer",
      "Technical Program Manager",
      "Site Reliability Engineer",
      "Full Stack Developer",
    ],
    leadershipLabel: "Leadership (EM / Director of Engineering+)",
  },
];

const DEFAULT_LEADERSHIP_LABEL =
  EXPERIENCE_LEVELS.find((l) => l.id === "leadership")?.label ?? "Leadership";

function detectFamily(firstRole: string | undefined): RoleFamily | null {
  if (!firstRole) return null;
  const lower = firstRole.trim().toLowerCase();
  if (!lower) return null;
  return FAMILIES.find((f) => f.test(lower)) ?? null;
}

/** Suggestion rail for the Roles step, keyed off the first role chosen. */
export function roleSuggestionsFor(roles: string[]): string[] {
  const family = detectFamily(roles[0]);
  return family ? family.suggestions : DEFAULT_ROLE_SUGGESTIONS;
}

/**
 * Experience-level options for the wizard: same ids/order as
 * EXPERIENCE_LEVELS (so saved values stay canonical) with only the
 * top-tier label reworded to match the detected role family.
 */
export function experienceLevelsFor(
  roles: string[],
): { id: ExperienceLevel; label: string }[] {
  const family = detectFamily(roles[0]);
  if (!family) return EXPERIENCE_LEVELS.map((l) => ({ ...l }));
  return EXPERIENCE_LEVELS.map((l) =>
    l.id === "leadership" && family.leadershipLabel !== DEFAULT_LEADERSHIP_LABEL
      ? { id: l.id, label: family.leadershipLabel }
      : { ...l },
  );
}

export interface CompanyPreset {
  name: string;
  careersUrl: string;
}

/** Top consulting firms — one-click add during onboarding's Companies step. */
export const CONSULTING_PRESETS: CompanyPreset[] = [
  { name: "McKinsey & Company", careersUrl: "https://www.mckinsey.com/careers" },
  { name: "Boston Consulting Group", careersUrl: "https://careers.bcg.com/" },
  { name: "Bain & Company", careersUrl: "https://www.bain.com/careers/" },
  { name: "Deloitte", careersUrl: "https://www2.deloitte.com/global/en/careers.html" },
  { name: "Accenture", careersUrl: "https://www.accenture.com/us-en/careers" },
  { name: "PwC", careersUrl: "https://www.pwc.com/gx/en/careers.html" },
  { name: "EY", careersUrl: "https://www.ey.com/en_gl/careers" },
  { name: "KPMG", careersUrl: "https://kpmg.com/xx/en/home/careers.html" },
  { name: "Capgemini", careersUrl: "https://www.capgemini.com/careers/" },
  { name: "IBM Consulting", careersUrl: "https://www.ibm.com/careers/" },
];
