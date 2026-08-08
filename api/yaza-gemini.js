import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { TOKEN_PRICING } from './payments.js';

const YAZA_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'update_student_info',
        description: "Update one or more fields of the current student's info form.",
        parameters: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            regNo: { type: 'STRING' },
            program: { type: 'STRING' },
            year: { type: 'STRING' },
            courseCode: { type: 'STRING' },
            examDate: { type: 'STRING' },
          },
        },
      },
      {
        name: 'trigger_grading',
        description: 'Run grading on the currently uploaded student paper.',
        parameters: {
          type: 'OBJECT',
          properties: { mode: { type: 'STRING', enum: ['ai', 'manual'] } },
          required: ['mode'],
        },
      },
      {
        name: 'navigate_view',
        description: 'Switch the app to a different view/screen.',
        parameters: {
          type: 'OBJECT',
          properties: { view: { type: 'STRING', enum: ['dashboard', 'grade', 'remark', 'history'] } },
          required: ['view'],
        },
      },
      {
        name: 'edit_result_feedback',
        description: "Change the overall feedback text of the current grading result.",
        parameters: {
          type: 'OBJECT',
          properties: { feedback: { type: 'STRING' } },
          required: ['feedback'],
        },
      },
      {
        name: 'edit_question_score',
        description: 'Edit the score and/or feedback for a specific question.',
        parameters: {
          type: 'OBJECT',
          properties: {
            questionNumber: { type: 'NUMBER' },
            score: { type: 'STRING' },
            feedback: { type: 'STRING' },
          },
          required: ['questionNumber'],
        },
      },
      { name: 'save_results', description: 'Save the current grading result to history.', parameters: { type: 'OBJECT', properties: {} } },
      { name: 'open_settings', description: "Open the app's settings panel.", parameters: { type: 'OBJECT', properties: {} } },
      { name: 'open_profile', description: "Open the user's profile panel.", parameters: { type: 'OBJECT', properties: {} } },
    ],
  },
];

const DEFAULT_SESSION_KEY = 'general';
const MAX_MESSAGES_PER_SESSION = 50;

export function createYazaRouter({ authMiddleware, getUserMeta, updateUserMeta }) {
  const router = Router();
  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  router.post('/api/yaza/chat', authMiddleware, async (req, res) => {
    try {
      const { message, appContext, conversationHistory, sessionKey } = req.body;
      const key = sessionKey || DEFAULT_SESSION_KEY;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ code: 'MISSING_MESSAGE', message: 'Message is required' });
      }
      if (!GEMINI_KEY) {
        return res.status(500).json({ code: 'NO_PROVIDER_CONFIGURED', message: 'AI provider not configured' });
      }

      // Check chat token balance (dedicated chat tokens first, then shared token balance)
      const preUsage = (await getUserMeta(req.user.id, 'redpen_usage')) || { tier: 'free', chatTokenBalance: 0, tokenBalance: 0 };
      const chatBalance = preUsage.chatTokenBalance || 0;
      const generalBalance = preUsage.tokenBalance || 0;
      const cost = TOKEN_PRICING.CHAT_TOKEN_COST;

      if (chatBalance + generalBalance < cost) {
        return res.status(403).json({
          code: 'LIMIT_REACHED',
          message: "You're out of chat tokens. Buy more tokens to keep chatting with Yaza AI.",
        });
      }

      const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

      const systemContext = `You are Yaza AI, an assistant embedded in RedPen, an exam-grading app.
You can chat normally, and you can take actions using the provided tools when the user asks you to do something.
Only call a tool when the user's message clearly asks for an action. Otherwise just respond conversationally.
Current app state:
${JSON.stringify(appContext || {}, null, 2)}`;

      const history = Array.isArray(conversationHistory) ? conversationHistory : [];
      const contents = [
        { role: 'user', parts: [{ text: systemContext }] },
        { role: 'model', parts: [{ text: 'Understood.' }] },
        ...history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
        { role: 'user', parts: [{ text: message }] },
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: { tools: YAZA_TOOLS },
      });

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      const functionCalls = parts
        .filter((p) => p.functionCall)
        .map((p) => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));

      const textReply = parts.filter((p) => p.text).map((p) => p.text).join('\n').trim();

      try {
        const latestUsage = (await getUserMeta(req.user.id, 'redpen_usage')) || { tier: 'free', gradingCount: 0, gradingLimit: 5 };
        latestUsage.chatCount = (latestUsage.chatCount || 0) + 1;

        // Deduct from chatTokenBalance first, then spill over into the shared tokenBalance
        let remainingCost = TOKEN_PRICING.CHAT_TOKEN_COST;
        const fromChatBalance = Math.min(latestUsage.chatTokenBalance || 0, remainingCost);
        latestUsage.chatTokenBalance = (latestUsage.chatTokenBalance || 0) - fromChatBalance;
        remainingCost -= fromChatBalance;
        if (remainingCost > 0) {
          latestUsage.tokenBalance = Math.max(0, (latestUsage.tokenBalance || 0) - remainingCost);
        }

        await updateUserMeta(req.user.id, 'redpen_usage', latestUsage);
      } catch (e) {
        console.error('Failed to update chat usage:', e.message);
      }

      try {
        const allSessions = (await getUserMeta(req.user.id, 'redpen_yaza_chat')) || {};
        const existing = Array.isArray(allSessions[key]) ? allSessions[key] : [];
        const updated = [
          ...existing,
          { role: 'user', text: message, timestamp: new Date().toISOString() },
          { role: 'assistant', text: textReply || '(action taken)', timestamp: new Date().toISOString() },
        ].slice(-MAX_MESSAGES_PER_SESSION);
        allSessions[key] = updated;
        await updateUserMeta(req.user.id, 'redpen_yaza_chat', allSessions);
      } catch (e) {
        console.error('Failed to save chat history:', e.message);
      }

      res.json({ reply: textReply, actions: functionCalls });
    } catch (error) {
      console.error('Yaza (Gemini) chat error:', error.message);
      res.status(500).json({ code: 'YAZA_CHAT_FAILED', message: `Yaza AI error: ${error.message}` });
    }
  });

  router.get('/api/yaza/history', authMiddleware, async (req, res) => {
    try {
      const key = req.query.sessionKey || DEFAULT_SESSION_KEY;
      const allSessions = (await getUserMeta(req.user.id, 'redpen_yaza_chat')) || {};
      const history = Array.isArray(allSessions[key]) ? allSessions[key] : [];
      res.json({ history });
    } catch (error) {
      res.status(500).json({ message: 'Failed to load chat history' });
    }
  });

  router.delete('/api/yaza/history', authMiddleware, async (req, res) => {
    try {
      const key = req.query.sessionKey || DEFAULT_SESSION_KEY;
      const allSessions = (await getUserMeta(req.user.id, 'redpen_yaza_chat')) || {};
      delete allSessions[key];
      await updateUserMeta(req.user.id, 'redpen_yaza_chat', allSessions);
      res.json({ message: 'History cleared' });
    } catch (error) {
      console.error('Failed to clear chat history:', error.message);
      res.status(500).json({ message: 'Failed to clear chat history' });
    }
  });

  return router;
}
