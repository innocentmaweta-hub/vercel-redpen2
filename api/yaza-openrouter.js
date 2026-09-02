import { Router } from 'express';
import OpenAI from 'openai';
import { TOKEN_PRICING } from './payments.js';

const UI_ACTIONS = ['click', 'type', 'set_value', 'select', 'check', 'uncheck', 'set_range', 'upload', 'scroll', 'wait'];
const UI_STEP_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: UI_ACTIONS },
    target: { type: 'string' },
    value: { type: 'string' },
    option: { type: 'string' },
  },
  required: ['action', 'target'],
};

const YAZA_TOOLS_OPENAI = [
  { type: 'function', function: { name: 'create_workbook', description: 'Create a new RedPen workbook immediately using supplied course/session details. If the user explicitly asks to create a workbook and provides the details, call this tool instead of merely saying it is done.', parameters: { type: 'object', properties: { workbookName: { type: 'string' }, courseCode: { type: 'string' }, courseName: { type: 'string' }, program: { type: 'string' }, year: { type: 'string' }, semester: { type: 'string' }, academicYear: { type: 'string' }, sessionLabel: { type: 'string' }, studentName: { type: 'string' }, regNo: { type: 'string' }, examDate: { type: 'string' } }, required: ['courseCode', 'courseName', 'program', 'year', 'semester', 'academicYear'] } } },
  { type: 'function', function: { name: 'ui_action', description: 'Operate any currently visible RedPen UI control like a human. Use the UI map in the current app state. click, type/set_value, select, check/uncheck, set_range, upload, scroll, and wait are supported. For scroll use target="window" and value="up", "down", "top", or "bottom". For wait use target="window" and value milliseconds. Never invent a target.', parameters: { type: 'object', properties: { action: { type: 'string', enum: UI_ACTIONS }, target: { type: 'string' }, value: { type: 'string' }, option: { type: 'string' } }, required: ['action', 'target'] } } },
  { type: 'function', function: { name: 'ui_sequence', description: 'Perform a short ordered sequence of RedPen UI operations. Use only targets present in the current UI map. Do not plan later steps against controls that only appear after an earlier action.', parameters: { type: 'object', properties: { steps: { type: 'array', items: UI_STEP_SCHEMA, minItems: 1, maxItems: 12 } }, required: ['steps'] } } },
  { type: 'function', function: { name: 'update_student_info', description: "Update one or more fields of the current student's info form.", parameters: { type: 'object', properties: { name: { type: 'string' }, regNo: { type: 'string' }, program: { type: 'string' }, year: { type: 'string' }, courseCode: { type: 'string' }, examDate: { type: 'string' } } } } },
  { type: 'function', function: { name: 'trigger_grading', description: 'Run grading on the currently uploaded student paper.', parameters: { type: 'object', properties: { mode: { type: 'string', enum: ['ai', 'manual'] } }, required: ['mode'] } } },
  { type: 'function', function: { name: 'navigate_view', description: 'Switch the app to a different view/screen.', parameters: { type: 'object', properties: { view: { type: 'string', enum: ['dashboard', 'grade', 'remark', 'history'] } }, required: ['view'] } } },
  { type: 'function', function: { name: 'edit_result_feedback', description: "Change the overall feedback text of the current grading result.", parameters: { type: 'object', properties: { feedback: { type: 'string' } }, required: ['feedback'] } } },
  { type: 'function', function: { name: 'edit_question_score', description: 'Edit the score and/or feedback for a specific question.', parameters: { type: 'object', properties: { questionNumber: { type: 'number' }, score: { type: 'string' }, feedback: { type: 'string' } }, required: ['questionNumber'] } } },
  { type: 'function', function: { name: 'save_results', description: 'Save the current grading result to history.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'open_settings', description: "Open the app's settings panel.", parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'open_profile', description: "Open the user's profile panel.", parameters: { type: 'object', properties: {} } } },
];

const DEFAULT_SESSION_KEY = 'general';
const MAX_MESSAGES_PER_SESSION = 50;

export function createYazaRouter({ authMiddleware, getUserMeta, updateUserMeta }) {
  const router = Router();
  const OPENROUTER_KEY = process.env.OPENAI_API_KEY;
  const client = OPENROUTER_KEY ? new OpenAI({ apiKey: OPENROUTER_KEY, baseURL: 'https://openrouter.ai/api/v1' }) : null;

  router.post('/api/yaza/chat', authMiddleware, async (req, res) => {
    try {
      const { message, appContext, conversationHistory, sessionKey } = req.body;
      const key = sessionKey || DEFAULT_SESSION_KEY;
      if (!message || typeof message !== 'string') return res.status(400).json({ code: 'MISSING_MESSAGE', message: 'Message is required' });
      if (!client) return res.status(500).json({ code: 'NO_PROVIDER_CONFIGURED', message: 'OpenRouter API key not configured' });
      const preUsage = (await getUserMeta(req.user.id, 'redpen_usage')) || { tier: 'free', chatTokenBalance: 0, tokenBalance: 0 };
      const chatBalance = preUsage.chatTokenBalance || 0;
      const generalBalance = preUsage.tokenBalance || 0;
      const cost = TOKEN_PRICING.CHAT_TOKEN_COST;
      if (chatBalance + generalBalance < cost) return res.status(403).json({ code: 'LIMIT_REACHED', message: "You're out of chat tokens. Buy more tokens to keep chatting with Yaza AI." });

      const systemPrompt = `You are Yaza AI, an assistant embedded in RedPen, an exam-grading app.\nWhen the user gives an imperative request that requires changing the app, you MUST take the action with a tool rather than replying as if you did it. If the user asks to create a workbook and has supplied the needed details, call create_workbook immediately. Do not respond with "done" or "action taken" without a tool call.\nYou can operate visible RedPen UI using ui_action or ui_sequence. Prefer UI tools when the user asks you to click, open, close, fill, select, change, scroll, or otherwise operate something in the app. Use specialized tools when they are safer or more direct.\nTreat the UI map as authoritative: never invent a target. Never bypass application restrictions such as an inactive grading session. Do not perform destructive or irreversible actions unless explicitly requested.\nCurrent app state and visible UI map:\n${JSON.stringify(appContext || {}, null, 2)}`;

      const history = Array.isArray(conversationHistory) ? conversationHistory : [];
      const messages = [{ role: 'system', content: systemPrompt }, ...history.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text })), { role: 'user', content: message }];
      const completion = await client.chat.completions.create({ model: 'openrouter/free', messages, tools: YAZA_TOOLS_OPENAI, tool_choice: 'auto' });
      const choice = completion.choices[0];
      const actions = (choice.message.tool_calls || []).map((tc) => ({ name: tc.function.name, args: JSON.parse(tc.function.arguments || '{}') }));
      const textReply = (choice.message.content || '').trim();

      try {
        const latestUsage = (await getUserMeta(req.user.id, 'redpen_usage')) || { tier: 'free', gradingCount: 0, gradingLimit: 5 };
        latestUsage.chatCount = (latestUsage.chatCount || 0) + 1;
        let remainingCost = TOKEN_PRICING.CHAT_TOKEN_COST;
        const fromChatBalance = Math.min(latestUsage.chatTokenBalance || 0, remainingCost);
        latestUsage.chatTokenBalance = (latestUsage.chatTokenBalance || 0) - fromChatBalance;
        remainingCost -= fromChatBalance;
        if (remainingCost > 0) latestUsage.tokenBalance = Math.max(0, (latestUsage.tokenBalance || 0) - remainingCost);
        await updateUserMeta(req.user.id, 'redpen_usage', latestUsage);
      } catch (e) { console.error('Failed to update chat usage:', e.message); }

      try {
        const allSessions = (await getUserMeta(req.user.id, 'redpen_yaza_chat')) || {};
        const existing = Array.isArray(allSessions[key]) ? allSessions[key] : [];
        allSessions[key] = [...existing, { role: 'user', text: message, timestamp: new Date().toISOString() }, { role: 'assistant', text: textReply || '(action taken)', timestamp: new Date().toISOString() }].slice(-MAX_MESSAGES_PER_SESSION);
        await updateUserMeta(req.user.id, 'redpen_yaza_chat', allSessions);
      } catch (e) { console.error('Failed to save chat history:', e.message); }

      res.json({ reply: textReply, actions });
    } catch (error) {
      console.error('Yaza (OpenRouter) chat error:', error.message);
      res.status(500).json({ code: 'YAZA_CHAT_FAILED', message: `Yaza AI error: ${error.message}` });
    }
  });

  router.get('/api/yaza/history', authMiddleware, async (req, res) => {
    try {
      const key = req.query.sessionKey || DEFAULT_SESSION_KEY;
      const allSessions = (await getUserMeta(req.user.id, 'redpen_yaza_chat')) || {};
      const history = Array.isArray(allSessions[key]) ? allSessions[key] : [];
      res.json({ history });
    } catch (error) { res.status(500).json({ message: 'Failed to load chat history' }); }
  });

  router.delete('/api/yaza/history', authMiddleware, async (req, res) => {
    try {
      const key = req.query.sessionKey || DEFAULT_SESSION_KEY;
      const allSessions = (await getUserMeta(req.user.id, 'redpen_yaza_chat')) || {};
      delete allSessions[key];
      await updateUserMeta(req.user.id, 'redpen_yaza_chat', allSessions);
      res.json({ message: 'History cleared' });
    } catch (error) { console.error('Failed to clear Yaza history:', error.message); res.status(500).json({ message: 'Failed to clear Yaza history' }); }
  });

  return router;
}