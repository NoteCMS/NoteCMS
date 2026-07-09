import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env.js';

let transport: Transporter | null = null;

export function getMailTransport(): Transporter {
  if (!transport) {
    if (!env.smtpHost) throw new Error('SMTP_HOST is not configured');
    transport = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth:
        env.smtpUser && env.smtpPass
          ? { user: env.smtpUser, pass: env.smtpPass }
          : undefined,
    });
  }
  return transport;
}

export function resetMailTransportForTests() {
  transport = null;
}
