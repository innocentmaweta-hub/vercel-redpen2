/**
 * Express Server with WordPress Database Integration
 * Direct backend authentication without CORS proxy
 */

import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import { createPaymentsRouter, TOKEN_PRICING } from './payments.js';
import { OAuth2Client } from 'google-auth-library';
// import { createYazaRouter } from './yaza-gemini.js';
import { createYazaRouter } from './yaza-openrouter.js';
import {
  authenticateWithWordPress,
  createWordPressUser,
  generateAppToken,
  getWordPressUserByEmail,
  getWordPressUserByUsername,
  getUserMeta,
  updateUserMeta,
  updateWordPressUserPassword,
  deleteWordPressUser,
  uploadProfilePicture,
} from './wordpress-auth.js';
import { validateAndNormalizeGradingResult, compareModelTotal } from './grading-validation.js';
import { GRADING_IDEMPOTENCY_HEADER, normalizeGradingIdempotencyKey, getCompletedGrading, rememberCompletedGrading } from './grading-idempotency.js';
import { generateSixDigitCode, createCodeRecord, verifyCodeRecord } from './auth-tokens.js';
import { sendEmail, verificationEmailHtml, resetEmailHtml } from './email.js';

const app = express();

// Enable CORS for all origins
app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));

// JWT_SECRET must be set in production
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET environment variable is not set.');
  console.warn('Using development fallback secret. Set a strong random secret in your .env file.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';

if (!process.env.GOOGLE_CLIENT_ID) {
  console.warn('WARNING: GOOGLE_CLIENT_ID is missing.');
}

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Global request timeout middleware (5 minutes for grading)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    req.setTimeout(300000);
    res.setTimeout(300000);
  }
  next();
});

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

let provider = null;
let openaiClient = null;
let MODEL = null;

if (GEMINI_KEY) {
  provider = 'gemini';
  MODEL = 'gemini-2.5-flash';
  console.log('Provider: Google Gemini (gemini-2.5-flash)');
} else if (OPENAI_KEY?.startsWith('sk-or-')) {
  provider = 'openrouter';
  openaiClient = new OpenAI({ apiKey: OPENAI_KEY, baseURL: 'https://openrouter.ai/api/v1' });
  MODEL = 'openai/gpt-4o';
  console.log('Provider: OpenRouter (openai/gpt-4o)');
} else if (OPENAI_KEY) {
  provider = 'openai';
  openaiClient = new OpenAI({ apiKey: OPENAI_KEY });
  MODEL = 'gpt-4o';
  console.log('Provider: OpenAI (gpt-4o)');
} else {
  console.warn('WARNING: No API key found. Set GEMINI_API_KEY or OPENAI_API_KEY in .env file.');
}

// ========== Authentication Middleware ==========

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Authentication required' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Invalid or expired token' });
  }
}

// ========== Auth Endpoints ==========

/**
 * Email/Password Login against WordPress
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        code: 'MISSING_CREDENTIALS',
        message: 'Email and password are required'
      });
    }

    const wpUser = await getWordPressUserByEmail(email);
    if (!wpUser) {
      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password'
      });
    }

    const authResult = await authenticateWithWordPress(wpUser.username, password);
    if (!authResult.success) {
      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password'
      });
    }

    const user = {
      id: wpUser.id,
      email: wpUser.email,
      username: wpUser.username,
      name: wpUser.name || wpUser.email.split('@')[0],
      wordPressId: wpUser.id,
    };

    // Accounts with no verification record are pre-existing users from before
    // this feature — treat them as already verified so nobody gets locked out.
    const verificationMeta = await getUserMeta(wpUser.id, 'redpen_email_verification');
    if (verificationMeta && verificationMeta.verified === false) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before signing in.',
        email: wpUser.email,
      });
    }

    const token = generateAppToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
      }
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ code: 'LOGIN_FAILED', message: 'Login failed: ' + error.message });
  }
});

/**
 * Email/Password Registration - Create WordPress User
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        code: 'MISSING_FIELDS',
        message: 'Name, email, and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 6 characters'
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        code: 'INVALID_EMAIL',
        message: 'Please provide a valid email address'
      });
    }

    const existingUser = await getWordPressUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        code: 'EMAIL_EXISTS',
        message: 'Email already registered'
      });
    }

    const createResult = await createWordPressUser({ name, email, password });
    if (!createResult.success) {
      return res.status(400).json({
        code: 'REGISTRATION_FAILED',
        message: createResult.error || 'Failed to create user'
      });
    }

    const user = createResult.user;

    // Grant 5 free grading tokens at signup
    try {
      await updateUserMeta(user.id, 'redpen_usage', {
        tokenBalance: 5,
        chatTokenBalance: 1,
      });
    } catch (bonusError) {
      console.error('Failed to grant welcome bonus:', bonusError.message);
    }

    // Require email verification before this account can log in.
    try {
      const verificationCode = generateSixDigitCode();
      await updateUserMeta(user.id, 'redpen_email_verification', {
        verified: false,
        pending: createCodeRecord(verificationCode),
      });
      await sendEmail({
        to: user.email,
        subject: 'Verify your RedPen account',
        html: verificationEmailHtml(user.name, verificationCode),
      });
    } catch (verificationError) {
      console.error('Failed to set up email verification:', verificationError.message);
    }

    res.status(201).json({
      requiresVerification: true,
      email: user.email,
      message: 'Account created. Enter the code we emailed you to finish signing in.',
    });
  } catch (error) {
    console.error('Register error:', error.message);
    res.status(500).json({
      code: 'REGISTRATION_FAILED',
      message: 'Registration failed: ' + error.message
    });
  }
});

/**
 * Google OAuth Callback Handler
 */
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        code: 'MISSING_TOKEN',
        message: 'ID token is required'
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, sub: googleId } = payload;

    if (!email) {
      return res.status(400).json({
        code: 'INVALID_EMAIL',
        message: 'Email not provided by Google'
      });
    }

    let wpUser = await getWordPressUserByEmail(email);

    if (!wpUser) {
      const createResult = await createWordPressUser({
        name: name || email.split('@')[0],
        email,
        password: googleId,
      });

      if (!createResult.success) {
        return res.status(400).json({
          code: 'REGISTRATION_FAILED',
          message: createResult.error
        });
      }

      wpUser = createResult.user;

      // Grant 5 free grading tokens at signup
      try {
        await updateUserMeta(wpUser.id, 'redpen_usage', {
          tokenBalance: 5,
          chatTokenBalance: 1,
        });
      } catch (bonusError) {
        console.error('Failed to grant welcome bonus:', bonusError.message);
      }

      // Google has already confirmed this email belongs to the user.
      try {
        await updateUserMeta(wpUser.id, 'redpen_email_verification', { verified: true, pending: null });
      } catch (verifiedMetaError) {
        console.error('Failed to mark Google account as verified:', verifiedMetaError.message);
      }
    }
    const user = {
      id: wpUser.id,
      email: wpUser.email,
      username: wpUser.username,
      name: wpUser.name || name,
      wordPressId: wpUser.id,
    };

    const token = generateAppToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
      }
    });
  } catch (error) {
    console.error('Google auth error:', error.message);
    res.status(401).json({
      code: 'GOOGLE_AUTH_FAILED',
      message: error.message
    });
  }
});

/**
 * Get Current User — now returns tier/usage/profile/AI-provider info
 */
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const wpUser = await getWordPressUserByUsername(req.user.username);
    if (!wpUser) {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }

    const [usage, profile, apiKeys, history] = await Promise.all([
      getUserMeta(wpUser.id, 'redpen_usage'),
      getUserMeta(wpUser.id, 'redpen_profile'),
      getUserMeta(wpUser.id, 'redpen_api_keys'),
      getUserMeta(wpUser.id, 'redpen_grading_history'),
    ]);

    const safeUsage = usage || { tokenBalance: 0, chatTokenBalance: 0 };
    const safeProfile = profile || { institution: '', role: '', avatarUrl: '' };
    const safeApiKeys = apiKeys || {};

    res.json({
      user: {
        id: wpUser.id,
        email: wpUser.email,
        username: wpUser.username,
        name: wpUser.name,
        tokenBalance: safeUsage.tokenBalance || 0,
        chatTokenBalance: safeUsage.chatTokenBalance || 0,
        institution: safeProfile.institution || '',
        role: safeProfile.role || '',
        avatarUrl: safeProfile.avatarUrl || '',
        activeProvider: safeApiKeys.geminiApiKey ? 'gemini' : safeApiKeys.openaiApiKey ? 'openai' : 'server',
        totalGraded: Array.isArray(history) ? history.length : 0,
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Failed to get user' });
  }
});

/**
 * Change Password
 */
app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ code: 'MISSING_FIELDS', message: 'Current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ code: 'WEAK_PASSWORD', message: 'New password must be at least 6 characters' });
    }

    const authResult = await authenticateWithWordPress(req.user.username, currentPassword);
    if (!authResult.success) {
      return res.status(401).json({ code: 'INVALID_PASSWORD', message: 'Current password is incorrect' });
    }

    const updateResult = await updateWordPressUserPassword(req.user.id, newPassword);
    if (!updateResult.success) {
      return res.status(500).json({ code: 'PASSWORD_UPDATE_FAILED', message: updateResult.error || 'Failed to update password' });
    }

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error.message);
    res.status(500).json({ message: 'Failed to change password' });
  }
});

/**
 * Delete Account
 */
app.post('/api/auth/delete-account', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ code: 'MISSING_PASSWORD', message: 'Password confirmation is required' });
    }

    const authResult = await authenticateWithWordPress(req.user.username, password);
    if (!authResult.success) {
      return res.status(401).json({ code: 'INVALID_PASSWORD', message: 'Password is incorrect' });
    }

    const deleteResult = await deleteWordPressUser(req.user.id);
    if (!deleteResult.success) {
      return res.status(500).json({ code: 'DELETE_FAILED', message: deleteResult.error || 'Failed to delete account' });
    }

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error.message);
    res.status(500).json({ message: 'Failed to delete account' });
  }
});

/**
 * Logout
 */
app.post('/api/auth/logout', (_req, res) => {
  res.json({ message: 'Logged out successfully' });
});

/**
 * Verify an account's email with the code sent at registration.
 * Succeeds by returning a normal login token, same shape as /api/auth/login.
 */
app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ code: 'MISSING_FIELDS', message: 'Email and code are required' });
    }

    const wpUser = await getWordPressUserByEmail(email);
    if (!wpUser) {
      return res.status(400).json({ code: 'INVALID_CODE', message: 'Invalid or expired code' });
    }

    const verificationMeta = (await getUserMeta(wpUser.id, 'redpen_email_verification')) || {};
    const check = verifyCodeRecord(verificationMeta.pending, code);

    if (!check.ok) {
      if (verificationMeta.pending) {
        verificationMeta.pending.attempts = (verificationMeta.pending.attempts || 0) + 1;
        await updateUserMeta(wpUser.id, 'redpen_email_verification', verificationMeta);
      }
      return res.status(400).json({ code: 'INVALID_CODE', message: check.reason });
    }

    await updateUserMeta(wpUser.id, 'redpen_email_verification', { verified: true, pending: null });

    const user = {
      id: wpUser.id,
      email: wpUser.email,
      username: wpUser.username,
      name: wpUser.name || wpUser.email.split('@')[0],
      wordPressId: wpUser.id,
    };
    const token = generateAppToken(user);

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, username: user.username },
    });
  } catch (error) {
    console.error('Verify email error:', error.message);
    res.status(500).json({ message: 'Failed to verify email' });
  }
});

/**
 * Resend a fresh verification code for an unverified account.
 */
app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ code: 'MISSING_EMAIL', message: 'Email is required' });
    }

    const wpUser = await getWordPressUserByEmail(email);
    if (!wpUser) {
      // Don't reveal whether the account exists.
      return res.json({ message: 'If that account exists and is unverified, a new code has been sent.' });
    }

    const existingMeta = (await getUserMeta(wpUser.id, 'redpen_email_verification')) || {};
    if (existingMeta.verified) {
      return res.json({ message: 'This account is already verified. Please sign in.' });
    }

    const code = generateSixDigitCode();
    await updateUserMeta(wpUser.id, 'redpen_email_verification', {
      verified: false,
      pending: createCodeRecord(code),
    });

    await sendEmail({
      to: email,
      subject: 'Your RedPen verification code',
      html: verificationEmailHtml(wpUser.name || email, code),
    });

    res.json({ message: 'If that account exists and is unverified, a new code has been sent.' });
  } catch (error) {
    console.error('Resend verification error:', error.message);
    res.status(500).json({ message: 'Failed to resend verification code' });
  }
});

/**
 * Request a password reset code. Always responds the same way regardless
 * of whether the email is registered, to avoid leaking which emails exist.
 */
app.post('/api/auth/forgot-password', async (req, res) => {
  const genericResponse = { message: 'If that email is registered, a reset code has been sent.' };
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ code: 'MISSING_EMAIL', message: 'Email is required' });
    }

    const wpUser = await getWordPressUserByEmail(email);
    if (!wpUser) {
      return res.json(genericResponse);
    }

    const code = generateSixDigitCode();
    await updateUserMeta(wpUser.id, 'redpen_password_reset', createCodeRecord(code));

    await sendEmail({
      to: email,
      subject: 'Reset your RedPen password',
      html: resetEmailHtml(wpUser.name || email, code),
    });

    res.json(genericResponse);
  } catch (error) {
    console.error('Forgot password error:', error.message);
    res.status(500).json(genericResponse);
  }
});

/**
 * Consume a reset code and set a new password.
 */
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ code: 'MISSING_FIELDS', message: 'Email, code, and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ code: 'WEAK_PASSWORD', message: 'New password must be at least 6 characters' });
    }

    const wpUser = await getWordPressUserByEmail(email);
    if (!wpUser) {
      return res.status(400).json({ code: 'INVALID_CODE', message: 'Invalid or expired code' });
    }

    const resetMeta = await getUserMeta(wpUser.id, 'redpen_password_reset');
    const check = verifyCodeRecord(resetMeta, code);

    if (!check.ok) {
      if (resetMeta) {
        resetMeta.attempts = (resetMeta.attempts || 0) + 1;
        await updateUserMeta(wpUser.id, 'redpen_password_reset', resetMeta);
      }
      return res.status(400).json({ code: 'INVALID_CODE', message: check.reason });
    }

    const updateResult = await updateWordPressUserPassword(wpUser.id, newPassword);
    if (!updateResult.success) {
      return res.status(500).json({ message: updateResult.error || 'Failed to reset password' });
    }

    await updateUserMeta(wpUser.id, 'redpen_password_reset', null);

    res.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (error) {
    console.error('Reset password error:', error.message);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

// ========== Grading Endpoint ==========

app.post('/api/grade', authMiddleware, async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${requestId}] Starting grading request for ${req.user.email}`);

  const idempotencyKey = normalizeGradingIdempotencyKey(req.headers[GRADING_IDEMPOTENCY_HEADER]);

  if (idempotencyKey) {
    const cached = getCompletedGrading(idempotencyKey);
    if (cached) {
      console.log(`[${requestId}] Returning cached result for idempotency key ${idempotencyKey} (no token charged, no AI call made)`);
      return res.json(cached);
    }
  }

  try {
    // Check token balance before doing any AI work.
    const usage = (await getUserMeta(req.user.id, 'redpen_usage')) || { tokenBalance: 0 };
    const hasTokens = (usage.tokenBalance || 0) >= 1;

    if (!hasTokens) {
      return res.status(403).json({
        code: 'LIMIT_REACHED',
        error: true,
        message: `You're out of tokens. Buy more tokens or add your own API key in Settings to continue grading.`,
      });
    }

    const { studentInfo, markingScheme, studentPaper } = req.body;

    if (!studentPaper || typeof studentPaper !== 'string') {
      return res.status(400).json({
        code: 'MISSING_PAPER',
        error: true,
        message: 'Student paper is required.'
      });
    }

    if (!provider) {
      return res.status(500).json({
        code: 'NO_PROVIDER_CONFIGURED',
        error: true,
        message: 'No AI provider configured. Contact administrator.',
      });
    }

    const hasScheme = !!markingScheme;
    const cleanPaper = studentPaper.includes(',') ? studentPaper.split(',')[1] : studentPaper;
    const paperMime = studentPaper.startsWith('data:') ? studentPaper.split(';')[0].replace('data:', '') : 'image/jpeg';

    let cleanScheme = null;
    let schemeMime = null;
    if (hasScheme) {
      cleanScheme = markingScheme.includes(',') ? markingScheme.split(',')[1] : markingScheme;
      schemeMime = markingScheme.startsWith('data:') ? markingScheme.split(';')[0].replace('data:', '') : 'image/jpeg';
    }

    const prompt = buildPrompt(studentInfo, hasScheme);

    let result;
    try {
      if (provider === 'gemini') {
        result = await gradeWithGemini(prompt, cleanScheme, schemeMime, cleanPaper, paperMime, hasScheme, GEMINI_KEY, MODEL);
      } else {
        result = await gradeWithOpenAI(prompt, cleanScheme, schemeMime, cleanPaper, paperMime, hasScheme, openaiClient, MODEL);
      }
    } catch (apiError) {
      console.error(`[${requestId}] AI API error:`, apiError);
      return res.status(502).json({
        code: 'AI_SERVICE_ERROR',
        error: true,
        message: 'AI grading service failed. Please try again later.',
      });
    }

    console.log(`[${requestId}] Grading completed via ${provider}. User: ${req.user.email}`);

    // Never trust the AI's own arithmetic. Recompute total/percentage/grade
    // deterministically from the per-question scores before this result can
    // ever be saved, displayed, or exported.
    const validation = validateAndNormalizeGradingResult(result);

    if (!validation.ok) {
      console.error(`[${requestId}] AI grading result failed validation: ${validation.error}`);
      // Don't charge a token for a result we're refusing to use.
      return res.status(502).json({
        code: 'INVALID_GRADING_RESULT',
        error: true,
        message: `AI returned an invalid grading result: ${validation.error}. Please try again.`,
      });
    }

    const normalizedResult = validation.result;

    // Log (don't act on) any mismatch between what the AI claimed and what we computed —
    // useful signal for grading-quality monitoring, never used to decide the actual result.
    const totalComparison = compareModelTotal(result, normalizedResult);
    if (totalComparison.supplied && !totalComparison.matches) {
      console.warn(
        `[${requestId}] AI-claimed total (${totalComparison.supplied.score}/${totalComparison.supplied.maximum}) ` +
        `did not match computed total (${normalizedResult.total_score}). Using computed value.`
      );
    }

    // Increment usage count / deduct a token (best-effort — don't fail the response if this fails)
    // Note: this only tracks USAGE. The actual history record is saved separately
    // via POST /api/history when the user clicks "Save" in the frontend.
    try {
      const updatedUsage = {
        ...usage,
        tokenBalance: Math.max(0, (usage.tokenBalance || 0) - 1),
      };
      await updateUserMeta(req.user.id, 'redpen_usage', updatedUsage);
    } catch (usageError) {
      console.error(`[${requestId}] Failed to update usage:`, usageError.message);
    }

    if (idempotencyKey) {
      rememberCompletedGrading(idempotencyKey, normalizedResult);
    }

    res.json(normalizedResult);
  } catch (error) {
    console.error(`[${requestId}] Grading error:`, error);
    res.status(500).json({
      code: 'GRADING_FAILED',
      error: true,
      message: error.message || 'Failed to complete grading.'
    });
  }
});
app.use(createYazaRouter({ authMiddleware, getUserMeta, updateUserMeta }));

app.use(createPaymentsRouter({
  authMiddleware,
  getUserMeta,
  updateUserMeta,
  appBaseUrl: process.env.APP_BASE_URL || 'https://your-app.vercel.app', // ⚠️ set APP_BASE_URL in Vercel tomorrow
}));

// ========== History Endpoints ==========

app.get('/api/history', authMiddleware, async (req, res) => {
  try {
    const history = (await getUserMeta(req.user.id, 'redpen_grading_history')) || [];
    res.json({ history });
  } catch (error) {
    console.error('History fetch error:', error.message);
    res.status(500).json({ message: 'Failed to load grading history' });
  }
});

app.post('/api/history', authMiddleware, async (req, res) => {
  try {
    const { studentInfo, result } = req.body;
    if (!result) {
      return res.status(400).json({ message: 'result is required' });
    }

    const existingHistory = (await getUserMeta(req.user.id, 'redpen_grading_history')) || [];
    const entry = {
      id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      date: new Date().toISOString(),
      studentInfo: studentInfo || {},
      result,
    };
    const updatedHistory = [entry, ...existingHistory].slice(0, 50); // cap at 50 entries

    const ok = await updateUserMeta(req.user.id, 'redpen_grading_history', updatedHistory);
    if (!ok) {
      return res.status(500).json({ message: 'Failed to save history record' });
    }

    res.status(201).json({ message: 'History record saved', entry });
  } catch (error) {
    console.error('History save error:', error.message);
    res.status(500).json({ message: 'Failed to save history record' });
  }
});

// ========== Settings / API Keys / Profile Endpoints ==========

app.get('/api/settings/api-keys', authMiddleware, async (req, res) => {
  try {
    const keys = (await getUserMeta(req.user.id, 'redpen_api_keys')) || {};
    const mask = (key) => (key ? `••••${key.slice(-4)}` : null);
    res.json({
      geminiKeySet: !!keys.geminiApiKey,
      geminiKeyPreview: mask(keys.geminiApiKey),
      openaiKeySet: !!keys.openaiApiKey,
      openaiKeyPreview: mask(keys.openaiApiKey),
    });
  } catch (error) {
    console.error('API key fetch error:', error.message);
    res.status(500).json({ message: 'Failed to load API key settings' });
  }
});

app.post('/api/settings/api-keys', authMiddleware, async (req, res) => {
  try {
    const { geminiApiKey, openaiApiKey } = req.body;
    const existing = (await getUserMeta(req.user.id, 'redpen_api_keys')) || {};

    const updated = {
      ...existing,
      ...(geminiApiKey !== undefined && { geminiApiKey }),
      ...(openaiApiKey !== undefined && { openaiApiKey }),
    };

    const ok = await updateUserMeta(req.user.id, 'redpen_api_keys', updated);
    if (!ok) {
      return res.status(500).json({ message: 'Failed to save API keys' });
    }

    res.json({ message: 'API keys updated successfully' });
  } catch (error) {
    console.error('API key save error:', error.message);
    res.status(500).json({ message: 'Failed to save API key settings' });
  }
});

app.post('/api/settings/profile', authMiddleware, async (req, res) => {
  try {
    const { institution, role } = req.body;
    const existing = (await getUserMeta(req.user.id, 'redpen_profile')) || {};

    const updated = {
      ...existing,
      ...(institution !== undefined && { institution }),
      ...(role !== undefined && { role }),
    };

    const ok = await updateUserMeta(req.user.id, 'redpen_profile', updated);
    if (!ok) {
      return res.status(500).json({ message: 'Failed to save profile' });
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile save error:', error.message);
    res.status(500).json({ message: 'Failed to save profile' });
  }
});
app.post('/api/settings/avatar', authMiddleware, async (req, res) => {
  try {
    const { imageBase64, filename, mimeType } = req.body;

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ message: 'Image data and mimeType are required' });
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      return res.status(400).json({ message: 'Only JPEG, PNG, or WebP images are allowed' });
    }

    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ message: 'Image must be under 5MB' });
    }

    const safeFilename = (filename || `avatar-${req.user.id}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const uploadResult = await uploadProfilePicture(req.user.id, buffer, safeFilename, mimeType);

    if (!uploadResult.success) {
      return res.status(500).json({ message: uploadResult.error || 'Failed to upload image' });
    }

    const existingProfile = (await getUserMeta(req.user.id, 'redpen_profile')) || {};
    const updatedProfile = { ...existingProfile, avatarUrl: uploadResult.url };
    await updateUserMeta(req.user.id, 'redpen_profile', updatedProfile);

    res.json({ message: 'Profile picture updated', avatarUrl: uploadResult.url });
  } catch (error) {
    console.error('Avatar upload error:', error.message);
    res.status(500).json({ message: 'Failed to upload profile picture' });
  }
});

/**
 * Status Endpoint
 */
app.get('/api/status', (_req, res) => {
  res.json({
    status: 'ok',
    provider,
    model: MODEL,
    database: 'wordpress',
    timestamp: new Date().toISOString()
  });
});

// ========== Health Check ==========

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy' });
});

// ========== Helper Functions ==========

function buildPrompt(studentInfo, hasScheme) {
  const gradeInstructions = hasScheme
    ? `Grade the student's answers strictly against the attached marking scheme. Use the scheme's allocation of marks per question exactly.`
    : `No marking scheme was provided. Grade the student's answers using standard academic criteria:
- Completeness and accuracy of answers
- Depth of understanding demonstrated
- Logical structure and coherence
- Clarity of expression
Estimate reasonable marks out of 100 total, distributing across questions as appropriate for a university-level exam.`;

  return `
You are an expert academic evaluator. ${gradeInstructions}

Student Metadata (may be incomplete — extract from the paper if missing):
- Name: ${studentInfo?.name || 'Unknown'}
- Reg No: ${studentInfo?.regNo || 'Unknown'}
- Course Code: ${studentInfo?.courseCode || 'Unknown'}
- Program: ${studentInfo?.program || 'Unknown'}
- Year: ${studentInfo?.year || 'Unknown'}
- Exam Date: ${studentInfo?.examDate || 'Unknown'}

Instructions:
1. ${hasScheme ? 'Study the marking scheme carefully to understand all questions and their maximum marks.' : 'Identify all questions from the student paper and estimate appropriate marks for each.'}
2. Examine the student paper and evaluate each answer.
3. Assign a score per question and provide brief, constructive feedback for each.
4. Compute the total score and assign a letter grade (A+, A, B+, B, C+, C, D, or F).
5. Also attempt to extract the student's identity from the paper itself if visible.
${!hasScheme ? '6. Note in the overall feedback that no marking scheme was provided and general criteria were used.' : ''}

Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):
{
  "total_score": "X/Y",
  "grade": "A",
  "questions": [
    { "q": 1, "score": "X/Y", "feedback": "Brief feedback for this question" }
  ],
  "feedback": "Overall summary of the student's performance.",
  "extracted_info": {
    "name": "",
    "regNo": "",
    "program": "",
    "year": "",
    "courseCode": "",
    "examDate": ""
  }
}
`;
}

async function gradeWithOpenAI(prompt, cleanScheme, schemeMime, cleanPaper, paperMime, hasScheme, client, model) {
  const content = [{ type: 'text', text: prompt }];
  if (hasScheme) {
    content.push({ type: 'image_url', image_url: { url: `data:${schemeMime};base64,${cleanScheme}` } });
  }
  content.push({ type: 'image_url', image_url: { url: `data:${paperMime};base64,${cleanPaper}` } });

  const response = await client.chat.completions.create({
    model: model,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content }],
  });

  return JSON.parse(response.choices[0].message.content);
}

async function gradeWithGemini(prompt, cleanScheme, schemeMime, cleanPaper, paperMime, hasScheme, apiKey, model) {
  const ai = new GoogleGenAI({ apiKey });
  const parts = [{ text: prompt }];
  if (hasScheme) {
    parts.push({ inlineData: { mimeType: schemeMime, data: cleanScheme } });
  }
  parts.push({ inlineData: { mimeType: paperMime, data: cleanPaper } });

  const response = await ai.models.generateContent({
    model: model,
    contents: [{ role: 'user', parts }],
    config: { responseMimeType: 'application/json' },
  });

  return JSON.parse(response.text);
}

export default app;
