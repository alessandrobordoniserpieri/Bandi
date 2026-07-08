// app/src/lib/alerts/run-batch.ts
// The weekly-digest batch, with all I/O injected so it runs offline against fakes. A failure
// for one recipient is logged and skipped — it never blocks the rest of the batch.
import { rowToEntityProfile, type ProfileRow } from "@/lib/profile/schema";
import type { GrantView } from "@/lib/grants/mapping";
import { buildDigest } from "./build-digest";
import { renderDigestEmail } from "./render-email";
import type { EmailSender } from "./send";

export interface Recipient {
  userId: string;
  threshold: number;
}

export interface DigestBatchDeps {
  listRecipients(): Promise<Recipient[]>; // users with alert_frequency = 'weekly'
  getProfileRow(userId: string): Promise<ProfileRow | null>;
  getEmail(userId: string): Promise<string | null>;
  getNewGrantViews(): Promise<GrantView[]>; // the week's new grants (shared across users)
  sender: EmailSender;
  appUrl: string;
}

export interface DigestBatchResult {
  sent: number;
  skipped: number;
  errors: number;
}

export async function runDigestBatch(deps: DigestBatchDeps): Promise<DigestBatchResult> {
  const result: DigestBatchResult = { sent: 0, skipped: 0, errors: 0 };
  const recipients = await deps.listRecipients();
  if (recipients.length === 0) return result;

  const views = await deps.getNewGrantViews(); // fetched once for the whole batch

  for (const recipient of recipients) {
    try {
      const profileRow = await deps.getProfileRow(recipient.userId);
      if (!profileRow) {
        result.skipped += 1;
        continue;
      }
      const digest = buildDigest(rowToEntityProfile(profileRow), recipient.threshold, views);
      if (!digest) {
        result.skipped += 1; // nothing above threshold → no email
        continue;
      }
      const email = await deps.getEmail(recipient.userId);
      if (!email) {
        result.skipped += 1;
        continue;
      }
      const { subject, html } = renderDigestEmail(digest, deps.appUrl);
      await deps.sender.send({ to: email, subject, html });
      result.sent += 1;
    } catch (err) {
      result.errors += 1;
      console.error(`[cron/digest] recipient ${recipient.userId} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return result;
}
