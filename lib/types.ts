export type MatchLevel = "Strong Match" | "Good Match" | "Possible Match";

export type KanbanStatus =
  | "read_jd"
  | "not_applied"
  | "applied"
  | "response"
  | "interviewing"
  | "offer"
  | "rejected"
  | "ignored";

export interface Job {
  id: string;
  company: string;
  role: string;
  level: string;
  aiFocus: string;
  location: string;
  postedOrUpdated: string;
  match: MatchLevel;
  url: string;
  whyMatch: string;
  dateSeen: string;
  isNew: boolean;
}

export interface DailyDigest {
  date: string;
  title: string;
  jobs: Job[];
}

export interface AppState {
  visited: string[];
  status: Record<string, KanbanStatus>;
}

export const KANBAN_COLUMNS: { id: KanbanStatus; label: string }[] = [
  { id: "read_jd", label: "Read JD" },
  { id: "not_applied", label: "Not applied" },
  { id: "applied", label: "Applied" },
  { id: "response", label: "Response" },
  { id: "interviewing", label: "Interviewing" },
  { id: "offer", label: "Offer" },
  { id: "rejected", label: "Rejected" },
  { id: "ignored", label: "Ignored" },
];
