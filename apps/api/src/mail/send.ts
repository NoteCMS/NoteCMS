import { env } from '../config/env.js';
import { isMailConfigured } from '../config/mail.js';
import { getMailTransport } from './transport.js';

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendMail(input: SendMailInput): Promise<void> {
  if (!isMailConfigured()) {
    throw new Error('Email is not configured on this server');
  }
  const from = env.mailFrom;
  if (!from) throw new Error('MAIL_FROM is not configured');

  try {
    await getMailTransport().sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  } catch (error) {
    console.error('[mail] Failed to send email:', error instanceof Error ? error.message : error);
    throw new Error('Failed to send email');
  }
}
