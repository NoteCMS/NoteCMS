import { issueEmailToken } from '../auth/email-tokens.js';
import { env } from '../config/env.js';
import { isMailConfigured } from '../config/mail.js';
import { assertMailRateLimit } from './rate-limit.js';
import { buildWebUrl } from './links.js';
import { sendMail } from './send.js';
import { accountInviteEmail, accountWelcomeEmail, passwordResetEmail } from './templates.js';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function formatHours(hours: number): string {
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

export async function sendPasswordResetEmail(userId: string, email: string): Promise<void> {
  if (!isMailConfigured()) return;
  assertMailRateLimit(`reset:${email}`);
  const { token } = await issueEmailToken(userId, 'password_reset');
  const resetUrl = buildWebUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  const template = passwordResetEmail({
    resetUrl,
    expiresIn: formatDuration(env.mailTokenTtlResetMinutes),
  });
  await sendMail({ to: email, ...template });
}

export async function sendAccountInviteEmail(
  userId: string,
  email: string,
  options?: { invitedBy?: string; siteName?: string },
): Promise<void> {
  if (!isMailConfigured()) return;
  assertMailRateLimit(`invite:${email}`);
  const { token } = await issueEmailToken(userId, 'account_invite');
  const setPasswordUrl = buildWebUrl(`/invite?token=${encodeURIComponent(token)}`);
  const template = accountInviteEmail({
    setPasswordUrl,
    invitedBy: options?.invitedBy,
    siteName: options?.siteName,
    expiresIn: formatHours(env.mailTokenTtlInviteHours),
  });
  await sendMail({ to: email, ...template });
}

export async function sendAccountWelcomeEmail(
  email: string,
  options?: { siteName?: string },
): Promise<void> {
  if (!isMailConfigured()) return;
  const loginUrl = buildWebUrl('/');
  const template = accountWelcomeEmail({ loginUrl, siteName: options?.siteName });
  await sendMail({ to: email, ...template });
}
