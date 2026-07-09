/**
 * Transactional email HTML tuned for common clients (Gmail, Apple Mail, Outlook
 * desktop/web/mobile, Yahoo). Uses table layout, inline styles, web-safe fonts,
 * and VML bulletproof buttons for Outlook — no external font dependencies.
 */

const colors = {
  pageBg: '#f6f6f4',
  cardBg: '#ffffff',
  foreground: '#252522',
  muted: '#8c8880',
  border: '#ebeae8',
  primary: '#3a8f5c',
  primaryForeground: '#fafaf9',
} as const;

const fontBody = "Arial,Helvetica,'Helvetica Neue',sans-serif";
const fontWordmark = "Georgia,'Times New Roman',Times,serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function wordmarkRow(): string {
  return `<tr>
  <td align="center" style="padding:0 0 24px;font-family:${fontWordmark};font-size:36px;font-weight:700;line-height:1;letter-spacing:-0.5px;color:${colors.foreground};mso-line-height-rule:exactly">note</td>
</tr>`;
}

/** Hybrid VML + HTML button (Litmus / Email on Acid bulletproof pattern). */
function bulletproofButton(href: string, label: string): string {
  const safeHref = escapeAttr(href);
  const safeLabel = escapeHtml(label);
  const widthPx = Math.min(320, Math.max(168, label.length * 9 + 56));

  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin-top:24px">
  <tr>
    <td align="center">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:44px;v-text-anchor:middle;width:${widthPx}px;" arcsize="14%" stroke="f" fillcolor="${colors.primary}">
        <w:anchorlock/>
        <center style="color:${colors.primaryForeground};font-family:${fontBody};font-size:15px;font-weight:bold;mso-line-height-rule:exactly">${safeLabel}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="background-color:${colors.primary};border-radius:10px;color:${colors.primaryForeground};display:inline-block;font-family:${fontBody};font-size:15px;font-weight:bold;line-height:44px;text-align:center;text-decoration:none;padding:0 24px;-webkit-text-size-adjust:none">${safeLabel}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

function bodyCopyRow(html: string): string {
  return `<tr>
  <td align="center" style="padding:0;font-family:${fontBody};font-size:16px;line-height:24px;color:${colors.foreground};mso-line-height-rule:exactly">${html}</td>
</tr>`;
}

function finePrintRow(html: string): string {
  return `<tr>
  <td align="center" style="padding:20px 0 0;font-family:${fontBody};font-size:13px;line-height:20px;color:${colors.muted};mso-line-height-rule:exactly">${html}</td>
</tr>`;
}

function layout(rows: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>note</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    a { color: ${colors.primary}; }
    @media only screen and (max-width: 480px) {
      .email-card { width: 100% !important; }
      .email-shell { padding-left: 16px !important; padding-right: 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${colors.pageBg};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">&nbsp;</div>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${colors.pageBg}" style="background-color:${colors.pageBg};">
    <tr>
      <td align="center" class="email-shell" style="padding:40px 16px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="384" class="email-card" style="width:384px;max-width:384px;background-color:${colors.cardBg};border:1px solid ${colors.border};border-radius:12px;">
          <tr>
            <td style="padding:32px 24px 24px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                ${wordmarkRow()}
                ${rows}
              </table>
            </td>
          </tr>
        </table>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="384" style="width:384px;max-width:384px;">
          <tr>
            <td align="center" style="padding:24px 8px 0;font-family:${fontBody};font-size:13px;line-height:20px;color:${colors.muted};mso-line-height-rule:exactly">
              If you did not expect this email, you can ignore it.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function passwordResetEmail({ resetUrl, expiresIn }: { resetUrl: string; expiresIn: string }) {
  const text = `Reset your note password\n\nOpen this link to choose a new password (expires in ${expiresIn}):\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`;
  const html = layout(`
${bodyCopyRow('We received a request to reset your password.')}
<tr><td>${bulletproofButton(resetUrl, 'Reset password')}</td></tr>
${finePrintRow(`This link expires in ${escapeHtml(expiresIn)}.<br><br>If the button does not work, copy and paste this URL into your browser:<br><span style="word-break:break-all;color:${colors.foreground}">${escapeHtml(resetUrl)}</span>`)}
`);
  return { subject: 'Reset your password', text, html };
}

export function accountInviteEmail({
  setPasswordUrl,
  invitedBy,
  siteName,
  expiresIn,
}: {
  setPasswordUrl: string;
  invitedBy?: string;
  siteName?: string;
  expiresIn: string;
}) {
  const context = siteName ? ` to <strong>${escapeHtml(siteName)}</strong>` : '';
  const inviter = invitedBy
    ? `<strong>${escapeHtml(invitedBy)}</strong> invited you`
    : 'You have been invited';
  const text = `${inviter.replace(/<[^>]+>/g, '')}${siteName ? ` to ${siteName}` : ''} on note.\n\nSet your password here (expires in ${expiresIn}):\n${setPasswordUrl}\n\nIf you did not expect this, you can ignore this email.`;
  const html = layout(`
${bodyCopyRow(`${inviter}${context} on note.`)}
<tr><td>${bulletproofButton(setPasswordUrl, 'Set your password')}</td></tr>
${finePrintRow(`This link expires in ${escapeHtml(expiresIn)}.<br><br>If the button does not work, copy and paste this URL into your browser:<br><span style="word-break:break-all;color:${colors.foreground}">${escapeHtml(setPasswordUrl)}</span>`)}
`);
  return { subject: 'You have been invited to note', text, html };
}

export function accountWelcomeEmail({ loginUrl, siteName }: { loginUrl: string; siteName?: string }) {
  const context = siteName ? ` to <strong>${escapeHtml(siteName)}</strong>` : '';
  const text = `Your note account${siteName ? ` to ${siteName}` : ''} is ready.\n\nSign in here:\n${loginUrl}\n\nUse the password chosen when your account was created.`;
  const html = layout(`
${bodyCopyRow(`Your note account${context} is ready.`)}
<tr><td>${bulletproofButton(loginUrl, 'Sign in')}</td></tr>
${finePrintRow('Use the password chosen when your account was created.')}
`);
  return { subject: 'Welcome to note', text, html };
}
