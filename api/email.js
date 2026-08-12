import nodemailer from 'nodemailer';

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP email service is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export async function sendEmail({ to, subject, html, text }) {
  if (!to || !subject || !html) throw new Error('Email recipient, subject, and HTML are required.');

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!from) throw new Error('SMTP_FROM or SMTP_USER must be configured.');

  return getTransporter().sendMail({
    from,
    to,
    subject,
    html,
    text: text || undefined,
  });
}

export function verificationEmailHtml(name, code) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#222"><h2>Verify your RedPen account</h2><p>Hello ${escapeHtml(name)},</p><p>Use this verification code to finish creating your RedPen account:</p><p style="font-size:30px;font-weight:700;letter-spacing:8px">${escapeHtml(code)}</p><p>This code expires in 10 minutes and can only be used a limited number of times.</p><p>If you did not create this account, you can ignore this email.</p></body></html>`;
}

export function resetEmailHtml(name, code) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#222"><h2>Reset your RedPen password</h2><p>Hello ${escapeHtml(name)},</p><p>Use this code to reset your RedPen password:</p><p style="font-size:30px;font-weight:700;letter-spacing:8px">${escapeHtml(code)}</p><p>This code expires in 10 minutes and can only be used a limited number of times.</p><p>If you did not request a password reset, you can ignore this email.</p></body></html>`;
}
