import { Router } from 'express';
import crypto from 'crypto';

const MWK_PER_TOKEN = 100;
const CHAT_MESSAGES_PER_TOKEN = 30;
const CHAT_TOKEN_COST = 1 / CHAT_MESSAGES_PER_TOKEN;
const MIN_PURCHASE_MWK = 100; // 1 token minimum

const PAYCHANGU_API_BASE = 'https://api.paychangu.com';

export function createPaymentsRouter({ authMiddleware, getUserMeta, updateUserMeta, appBaseUrl }) {
  const router = Router();
  const SECRET_KEY = process.env.PAYCHANGU_SECRET_KEY;
  const WEBHOOK_SECRET = process.env.PAYCHANGU_WEBHOOK_SECRET;

  // Generates a tx_ref that encodes the user ID, so the webhook (which has
  // no session/auth) can identify which user this payment belongs to.
  function generateTxRef(userId) {
    const random = crypto.randomBytes(6).toString('hex');
    return `rp-${userId}-${Date.now()}-${random}`;
  }

  function parseUserIdFromTxRef(txRef) {
    const match = /^rp-(\d+)-/.exec(txRef || '');
    return match ? match[1] : null;
  }

  async function verifyWithPayChangu(txRef) {
    const res = await fetch(`${PAYCHANGU_API_BASE}/verify-payment/${encodeURIComponent(txRef)}`, {
      headers: { Authorization: `Bearer ${SECRET_KEY}`, Accept: 'application/json' },
    });
    const data = await res.json();
    return data;
  }

  // Credits tokens for a given user + tx_ref, guarding against double-crediting.
  // Returns { credited: boolean, tokens, newBalance, message }
  async function creditTokensIfValid(userId, txRef) {
    const transactions = (await getUserMeta(userId, 'redpen_transactions')) || {};
    const record = transactions[txRef];

    if (!record) {
      return { credited: false, message: 'Unknown transaction' };
    }
    if (record.status === 'completed') {
      const usage = (await getUserMeta(userId, 'redpen_usage')) || {};
      return { credited: false, message: 'Already processed', tokens: record.tokens, newBalance: usage.tokenBalance ?? 0 };
    }

    const verification = await verifyWithPayChangu(txRef);
    const vdata = verification?.data;

    const isValid =
      verification?.status === 'success' &&
      vdata?.tx_ref === txRef &&
      vdata?.status === 'success' &&
      vdata?.currency === 'MWK' &&
      Number(vdata?.amount) >= record.amountMWK;

    if (!isValid) {
      return { credited: false, message: 'Payment not confirmed by PayChangu yet' };
    }

    const usage = (await getUserMeta(userId, 'redpen_usage')) || { tier: 'free', gradingCount: 0, gradingLimit: 5 };
    const newBalance = (usage.tokenBalance || 0) + record.tokens;
    usage.tokenBalance = newBalance;
    await updateUserMeta(userId, 'redpen_usage', usage);

    transactions[txRef] = { ...record, status: 'completed', completedAt: new Date().toISOString() };
    await updateUserMeta(userId, 'redpen_transactions', transactions);

    return { credited: true, tokens: record.tokens, newBalance };
  }

  // ========== Initiate a token purchase ==========
  router.post('/api/payments/initiate', authMiddleware, async (req, res) => {
    try {
      if (!SECRET_KEY) {
        return res.status(500).json({ message: 'Payments are not configured yet. Please try again later.' });
      }

      const { amountMWK } = req.body;
      const amount = Number(amountMWK);

      if (!amount || amount < MIN_PURCHASE_MWK) {
        return res.status(400).json({ message: `Minimum purchase is ${MIN_PURCHASE_MWK} MWK (1 token).` });
      }

      const tokens = Math.floor(amount / MWK_PER_TOKEN);
      const txRef = generateTxRef(req.user.id);

      const paychanguRes = await fetch(`${PAYCHANGU_API_BASE}/payment`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SECRET_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          amount: String(amount),
          currency: 'MWK',
          email: req.user.email,
          tx_ref: txRef,
          callback_url: `${appBaseUrl}/?payment_callback=1`,
          return_url: `${appBaseUrl}/?payment_callback=1`,
          customization: {
            title: 'RedPen Tokens',
            description: `${tokens} grading token(s)`,
          },
          meta: { userId: req.user.id, tokens },
        }),
      });

      const paychanguData = await paychanguRes.json();

      if (paychanguData.status !== 'success' || !paychanguData?.data?.checkout_url) {
        console.error('PayChangu initiate failed:', paychanguData);
        return res.status(502).json({ message: 'Failed to start payment. Please try again.' });
      }

      // Record the pending transaction so we know what to credit once confirmed
      const transactions = (await getUserMeta(req.user.id, 'redpen_transactions')) || {};
      transactions[txRef] = {
        amountMWK: amount,
        tokens,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      await updateUserMeta(req.user.id, 'redpen_transactions', transactions);

      res.json({ checkoutUrl: paychanguData.data.checkout_url, txRef, tokens });
    } catch (error) {
      console.error('Payment initiate error:', error.message);
      res.status(500).json({ message: 'Failed to start payment. Please try again.' });
    }
  });

  // ========== Verify after browser redirect back ==========
  router.post('/api/payments/verify', authMiddleware, async (req, res) => {
    try {
      const { txRef } = req.body;
      if (!txRef) {
        return res.status(400).json({ message: 'txRef is required' });
      }

      const ownerId = parseUserIdFromTxRef(txRef);
      if (String(ownerId) !== String(req.user.id)) {
        return res.status(403).json({ message: 'This transaction does not belong to your account' });
      }

      const result = await creditTokensIfValid(req.user.id, txRef);
      res.json(result);
    } catch (error) {
      console.error('Payment verify error:', error.message);
      res.status(500).json({ message: 'Failed to verify payment' });
    }
  });

  // ========== Webhook (server-to-server, no user session) ==========
  router.post('/api/payments/webhook', async (req, res) => {
    try {
      const signature = req.headers['signature'];
      const rawBody = JSON.stringify(req.body);

      if (WEBHOOK_SECRET && signature) {
        const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
        if (expected !== signature) {
          console.error('Webhook signature mismatch');
          return res.status(401).json({ message: 'Invalid signature' });
        }
      }

      const txRef = req.body?.tx_ref || req.body?.data?.tx_ref;
      if (!txRef) {
        return res.status(200).json({ message: 'No tx_ref, ignoring' });
      }

      const userId = parseUserIdFromTxRef(txRef);
      if (!userId) {
        console.error('Webhook: could not parse userId from tx_ref', txRef);
        return res.status(200).json({ message: 'Unrecognized tx_ref format' });
      }

      await creditTokensIfValid(userId, txRef);
      res.status(200).json({ message: 'Processed' });
    } catch (error) {
      console.error('Webhook processing error:', error.message);
      // Still return 200 so PayChangu doesn't endlessly retry a broken transaction;
      // errors here are logged for manual investigation.
      res.status(200).json({ message: 'Error logged' });
    }
  });

  // ========== Token balance ==========
  router.get('/api/payments/balance', authMiddleware, async (req, res) => {
    try {
      const usage = (await getUserMeta(req.user.id, 'redpen_usage')) || {};
      res.json({ tokenBalance: usage.tokenBalance || 0 });
    } catch (error) {
      res.status(500).json({ message: 'Failed to load token balance' });
    }
  });

  return router;
}

export const TOKEN_PRICING = {
  MWK_PER_TOKEN,
  CHAT_MESSAGES_PER_TOKEN,
  CHAT_TOKEN_COST,
  MIN_PURCHASE_MWK,
};
