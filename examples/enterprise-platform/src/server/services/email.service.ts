import { Resend } from "resend";
import { emailEnv } from "../../capabilities/email/env.schema.js";

export interface NotificationEmail {
  to: string;
  subject: string;
  body: string;
}

/**
 * Sends via Resend when RESEND_API_KEY is set; otherwise logs to console --
 * "declared, gracefully degraded," genuinely exercised (not merely
 * documented) by both branches in the service's own test.
 */
export async function sendNotification(email: NotificationEmail): Promise<{ sent: boolean }> {
  if (!emailEnv.RESEND_API_KEY) {
    console.log(`[email:console-fallback] to=${email.to} subject="${email.subject}"`);
    return { sent: false };
  }

  const resend = new Resend(emailEnv.RESEND_API_KEY);
  await resend.emails.send({
    from: emailEnv.EMAIL_FROM_ADDRESS,
    to: email.to,
    subject: email.subject,
    text: email.body,
  });
  return { sent: true };
}
