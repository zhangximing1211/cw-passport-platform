// Outgoing email. No provider is configured yet, so messages are written to the Worker log
// (visible in the `npm run dev` terminal as "[mail] …"). To send real mail, implement send()
// with a provider's HTTP API (e.g. Resend, SendGrid, Amazon SES), keep its API key in a
// Worker secret (`wrangler secret put MAIL_API_KEY`), and keep the log fallback for local dev.

type Mail = { to: string; subject: string; text: string };

export async function send(_env: Env, mail: Mail): Promise<void> {
  console.log(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
}

export function passwordResetMail(to: string, link: string): Mail {
  return {
    to,
    subject: "CW Passport password reset",
    text: `Someone asked to reset the password for your CW Passport account.\n\nOpen this link within 30 minutes to choose a new password:\n${link}\n\nIf this wasn't you, ignore this email; your password stays unchanged.`,
  };
}
