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
import { OAuth2Client } from 'google-auth-library';
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
} from './wordpress-auth.js';

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
  MODEL = 'gemini-2.0-flash';
  console.log('Provider: Google Gemini (gemini-2.0-flash)');
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
    const token = generateAppToken(user);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
      }
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

    const safeUsage = usage || { tier: 'free', gradingCount: 0, gradingLimit: 5 };
    const safeProfile = profile || { institution: '', role: '' };
    const safeApiKeys = apiKeys || {};

    res.json({
      user: {
        id: wpUser.id,
        email: wpUser.email,
        username: wpUser.username,
        name: wpUser.name,
        tier: safeUsage.tier || 'free',
        gradingCount: safeUsage.gradingCount || 0,
        gradingLimit: safeUsage.gradingLimit ?? 5,
        institution: safeProfile.institution || '',
        role: safeProfile.role || '',
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

// ========== Grading Endpoint ==========

app.post('/api/grade', authMiddleware, async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${requestId}] Starting grading request for ${req.user.email}`);

  try {
    // Check grading limit before doing any AI work
    const usage = (await getUserMeta(req.user.id, 'redpen_usage')) || { gradingCount: 0, tier: 'free', gradingLimit: 5 };
    const gradingLimit = usage.tier === 'corporate' ? Infinity : (usage.gradingLimit ?? 5);

    if (usage.tier !== 'corporate' && (usage.gradingCount || 0) >= gradingLimit) {
      return res.status(403).json({
        code: 'LIMIT_REACHED',
        error: true,
        message: `Grading limit reached (${usage.gradingCount}/${gradingLimit}). Add your own API key in Settings, or upgrade your plan to continue.`,
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

    // Increment usage count (best-effort — don't fail the response if this fails)
    // Note: this only tracks USAGE. The actual history record is saved separately
    // via POST /api/history when the user clicks "Save" in the frontend.
    try {
      const updatedUsage = {
        tier: usage.tier || 'free',
        gradingCount: (usage.gradingCount || 0) + 1,
        gradingLimit: usage.gradingLimit ?? 5,
      };
      await updateUserMeta(req.user.id, 'redpen_usage', updatedUsage);
    } catch (usageError) {
      console.error(`[${requestId}] Failed to update usage:`, usageError.message);
    }

    res.json(result);
  } catch (error) {
    console.error(`[${requestId}] Grading error:`, error);
    res.status(500).json({
      code: 'GRADING_FAILED',
      error: true,
      message: error.message || 'Failed to complete grading.'
    });
  }
});

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

  return JSON.parse(response.choices[0].me
