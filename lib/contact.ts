/** Public contact address shown on the marketing site. */
export function contactEmail(): string {
  return (
    process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    "imrn.dev@gmail.com"
  );
}

export const CONTACT_TOPICS = [
  "general",
  "pricing",
  "support",
  "feedback",
  "privacy",
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  createdAt: string;
  ip?: string;
  userId?: string;
}

/** Redis hash: id → ContactMessage JSON. */
export const CONTACT_MESSAGES_KEY = "hunter:contact:messages";
