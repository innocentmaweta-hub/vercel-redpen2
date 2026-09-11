import { Router } from 'express';
import crypto from 'crypto';

const MWK_PER_TOKEN = 100;
const CHAT_MESSAGES_PER_TOKEN = 30;
const CHAT_TOKEN_COST = 1 / CHAT_MESSAGES_PER_TOKEN;
const MIN_PURCHASE_MWK = 100;

export function createPaymentsRouter({ authMiddleware, getUserMeta, updateUserMeta }) {
  const router = Router();
  const MERCHANT_ACCOUNT = process.env.MALIPO_MERCHANT_ACCOUNT;

  function isConfigured() {
    return Boolean(MERCHANT_ACCOUNT);
  }

  function generateMerchantTrxId(userId) {
    const random = crypto.randomBytes(6).toString('hex');
    return `rp-${userId}-${Date.now()}-${random}`;
  }

  function parseUserIdFromMerchantTrxId(merchantTrxId) {
    const match = /^rp-(\d+)-/.exec(String(merchantTrxId || ''));
    return match ? match[1] : null;
  }

  async function creditTokens(userId, merchantTrxId, providerData = {}) {
    const transactions = (await getUserMeta(userId, 'redpen_transactions')) || {};
    const record = transactions[merchantTrxId];

    if (!record) return { credited: false, message: 'Unknown transaction' };

    if (record.status === 'completed') {
      const usage = (await getUserMeta(userId, 'redpen_usage')) || {};
      return { credited: false, completed: true, tokens: record.tokens, newBalance: usage.tokenBalance || 0 };
    }

    const status = String(providerData.status || '').trim().toLowerCase();
    const amountRaw = providerData.amount ?? providerData.transaction_amount;
    const amount = amountRaw === undefined || amountRaw === null || amountRaw === '' ? null : Number(amountRaw);
    const currency = String(providerData.currency || 'MWK').trim().toUpperCase();

    if (status === 'failed' || status === 'failure') {
      transactions[merchantTrxId] = {
        ...record,
        status: 'failed',
        failedAt: new Date().toISOString(),
        malipoTransactionId: providerData.transaction_id || providerData.transId || null,
        customerReference: providerData.customer_reference || providerData.customer_ref || null,
      };
      await updateUserMeta(userId, 'redpen_transactions', transactions);
      return { credited: false, failed: true, message: 'Malipo reported that the payment failed.' };
    }

    if (status && status !== 'completed' && status !== 'success' && status !== 'successful') {
      return { credited: false, pending: true, message: 'Payment not confirmed by Malipo yet.' };
    }

    // Malipo's documented IPN payload does not require amount/currency fields.
    // Validate them when they are supplied, but do not reject a valid Completed
    // callback merely because those optional fields are absent.
    if (Number.isFinite(amount) && amount !== Number(record.amountMWK)) {
      return { credited: false, failed: true, message: 'Payment amount does not match the RedPen purchase.' };
    }

    if (currency !== 'MWK') {
      return { credited: false, failed: true, message: 'Payment currency does not match the RedPen purchase.' };
    }

    const usage = (await getUserMeta(userId, 'redpen_usage')) || {
      tier: 'free',
      gradingCount: 0,
      gradingLimit: 5,
    };
    const newBalance = (usage.tokenBalance || 0) + record.tokens;
    usage.tokenBalance = newBalance;
    await updateUserMeta(userId, 'redpen_usage', usage);

    transactions[merchantTrxId] = {
      ...record,
      status: 'completed',
      completedAt: new Date().toISOString(),
      malipoTransactionId: providerData.transaction_id || providerData.transId || null,
      customerReference: providerData.customer_reference || providerData.customer_ref || null,
    };
    await updateUserMeta(userId, 'redpen_transactions', transactions);

    return { credited: true, completed: true, tokens: record.tokens, newBalance };
  }

  router.post('/api/payments/initiate', authMiddleware, async (req, res) => {
    try {
      if (!isConfigured()) {
        return res.status(500).json({ message: 'Malipo Hosted Checkout is not configured. Set MALIPO_MERCHANT_ACCOUNT to the merchant account number from your Malipo project.' });
      }

      const amount = Number(req.body?.amountMWK);
      if (!Number.isInteger(amount) || amount < MIN_PURCHASE_MWK) {
        return res.status(400).json({ message: `Minimum purchase is ${MIN_PURCHASE_MWK} MWK (1 token).` });
      }

      const tokens = Math.floor(amount / MWK_PER_TOKEN);
      const merchantTrxId = generateMerchantTrxId(req.user.id);
      const transactions = (await getUserMeta(req.user.id, 'redpen_transactions')) || {};

      transactions[merchantTrxId] = {
        amountMWK: amount,
        tokens,
        status: 'pending',
        provider: 'malipo',
        createdAt: new Date().toISOString(),
      };
      await updateUserMeta(req.user.id, 'redpen_transactions', transactions);

      res.json({
        txRef: merchantTrxId,
        tokens,
        provider: 'malipo',
        checkout: {
          merchantAccount: MERCHANT_ACCOUNT,
          currency: 'MWK',
          amount,
          order_id: merchantTrxId,
          description: `RedPen Token Purchase - ${tokens} token${tokens === 1 ? '' : 's'}`,
        },
      });
    } catch (error) {
      console.error('Malipo hosted checkout initiate error:', error.message);
      res.status(500).json({ message: 'Failed to start payment. Please try again.' });
    }
  });

  router.post('/api/payments/verify', authMiddleware, async (req, res) => {
    try {
      const { txRef } = req.body || {};
      if (!txRef) return res.status(400).json({ message: 'txRef is required' });

      const ownerId = parseUserIdFromMerchantTrxId(txRef);
      if (String(ownerId) !== String(req.user.id)) {
        return res.status(403).json({ message: 'This transaction does not belong to your account' });
      }

      const transactions = (await getUserMeta(req.user.id, 'redpen_transactions')) || {};
      const record = transactions[txRef];
      if (!record) return res.status(404).json({ message: 'Unknown transaction' });

      const usage = (await getUserMeta(req.user.id, 'redpen_usage')) || {};

      if (record.status === 'completed') {
        return res.json({
          credited: false,
          completed: true,
          pending: false,
          tokens: record.tokens,
          newBalance: usage.tokenBalance || 0,
        });
      }

      if (record.status === 'failed') {
        return res.json({
          credited: false,
          completed: false,
          pending: false,
          failed: true,
          message: 'Malipo reported that this payment failed.',
        });
      }

      return res.json({
        credited: false,
        completed: false,
        pending: true,
        message: 'Payment is being confirmed by Malipo.',
      });
    } catch (error) {
      console.error('Malipo hosted checkout verify error:', error.message);
      res.status(500).json({ message: 'Failed to check payment status' });
    }
  });

  async function handleMalipoCallback(req, res) {
    try {
      // Accept both the documented top-level payload and common wrapped payloads.
      const raw = req.body || {};
      const body = raw.data && typeof raw.data === 'object' ? { ...raw, ...raw.data } : raw;
      const merchantTrxId = body.merchant_trx_id || body.order_id || body.merchantTrxId;
      const userId = parseUserIdFromMerchantTrxId(merchantTrxId);

      console.log('Malipo callback received:', {
        status: body.status || body.payment_status,
        merchant_trx_id: merchantTrxId,
        transaction_id: body.transaction_id || body.transId,
        customer_reference: body.customer_reference || body.customer_ref,
      });

      if (!merchantTrxId || !userId) {
        return res.status(204).end();
      }

      const result = await creditTokens(userId, merchantTrxId, {
        status: body.status || body.payment_status,
        amount: body.amount ?? body.transaction_amount,
        currency: body.currency,
        transaction_id: body.transaction_id || body.transId,
        customer_reference: body.customer_reference || body.customer_ref,
      });

      // Malipo documents that the callback does not depend on a response body.
      return res.status(204).end();
    } catch (error) {
      console.error('Malipo callback processing error:', error.message);
      // Acknowledge the callback without exposing internal details.
      return res.status(204).end();
    }
  }

  // Support the endpoint used in Malipo's documentation as well as the
  // RedPen-specific webhook URL. This prevents a callback-path mismatch from
  // silently causing Hosted Checkout verification timeouts.
  router.post('/api/payments/webhook', handleMalipoCallback);
  router.post('/api/payments/callback', handleMalipoCallback);
  router.post('/api/callback_url', handleMalipoCallback);

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
