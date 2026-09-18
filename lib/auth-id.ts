import { randomBytes } from "crypto";

export function newUserId(): string {
  return randomBytes(12).toString("hex");
}
