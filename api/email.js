const RESEND_API_URL = 'https://api.resend.com/emails';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export async function sendEmail({ to, subject, html, text }) {
  if (!to || !subject || !html) throw new Error('Email recipient, subject, and HTML are required.');

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured.');

  const from = process.env.RESEND_FROM || 'RedPen <onboarding@resend.dev>';

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text: text || undefined,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Resend API error (${response.status}): ${errorBody || 'Failed to send email'}`);
  }

  return response.json();
}

export function verificationEmailHtml(name, code) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#222"><h2>Verify your RedPen account</h2><p>Hello ${escapeHtml(name)},</p><p>Use this verification code to finish creating your RedPen account:</p><p style="font-size:30px;font-weight:700;letter-spacing:8px">${escapeHtml(code)}</p><p>This code expires in 10 minutes and can only be used a limited number of times.</p><p>If you did not create this account, you can ignore this email.</p></body></html>`;
}

export function resetEmailHtml(name, code) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#222"><h2>Reset your RedPen password</h2><p>Hello ${escapeHtml(name)},</p><p>Use this code to reset your RedPen password:</p><p style="font-size:30px;font-weight:700;letter-spacing:8px">${escapeHtml(code)}</p><p>This code expires in 10 minutes and can only be used a limited number of times.</p><p>If you did not request a password reset, you can ignore this email.</p></body></html>`;
}
