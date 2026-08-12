import crypto from 'node:crypto';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function generateSixDigitCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashCode(code, salt) {
  return crypto.createHash('sha256').update(`${salt}:${String(code).trim()}`).digest('hex');
}

export function createCodeRecord(code) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    hash: hashCode(code, salt),
    salt,
    createdAt: Date.now(),
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
  };
}

export function verifyCodeRecord(record, code) {
  if (!record || typeof record !== 'object') {
    return { ok: false, reason: 'Invalid or expired code' };
  }

  if (!record.hash || !record.salt || !record.expiresAt) {
    return { ok: false, reason: 'Invalid or expired code' };
  }

  if (Date.now() > Number(record.expiresAt)) {
    return { ok: false, reason: 'This code has expired. Please request a new one.' };
  }

  if (Number(record.attempts || 0) >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'Too many attempts. Please request a new code.' };
  }

  const supplied = String(code ?? '').trim();
  if (!/^\d{6}$/.test(supplied)) {
    return { ok: false, reason: 'Enter the 6-digit code.' };
  }

  const expected = Buffer.from(record.hash, 'hex');
  const actual = Buffer.from(hashCode(supplied, record.salt), 'hex');

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'Invalid verification code.' };
  }

  return { ok: true };
}
