/**
 * Resend dispatch for the transactional email family.
 *
 * Mirrors the error-surfacing behaviour of src/lib/email.ts: the Resend SDK
 * resolves (does NOT throw) on API errors, tucking the failure into `error`, so
 * we check it and turn a failed send into a real exception.
 *
 * Kept separate from the legacy src/lib/email.ts on purpose — that module hosts
 * the older, pre-redesign templates. See README note in index.ts about folding
 * the two together once the legacy templates are migrated.
 */

import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM ?? "Sentire <no-reply@sentire.app>";

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("[emails] RESEND_API_KEY is not set — cannot send email.");
  return new Resend(key);
}

export type Attachment = { filename: string; content: Buffer | string };

export async function dispatch(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: Attachment[];
}): Promise<void> {
  const { error } = await getResend().emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
  });
  if (error) {
    throw new Error(`Resend rejected "${opts.subject}" to ${opts.to} [${error.name}]: ${error.message}`);
  }
}
