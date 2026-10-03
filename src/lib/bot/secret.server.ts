import { createHash } from "crypto";

export function webhookSecret(): string {
  return createHash("sha256").update(`tg-webhook:${process.env["TELEGRAM_BOT_TOKEN"] ?? ""}`).digest("hex");
}
