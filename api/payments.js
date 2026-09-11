import { Router } from 'express';
import crypto from 'crypto';

const MWK_PER_TOKEN = 100;
const CHAT_MESSAGES_PER_TOKEN = 30;
const CHAT_TOKEN_COST = 1 / CHAT_MESSAGES_PER_TOKEN;
const MIN_PURCHASE_MWK = 100;

export function createPaymentsRouter({ authMiddleware, getUserMeta, updateUserMeta }) {
  const router = Router();
  const APP_ID = process.env.MALIPO_APP_ID;

  // Malipo Hosted Checkout requires the project App ID (merchantAccount).
  // The API key is only needed for Malipo's server REST endpoints; this flow
  // does not call those endpoints to open the browser checkout.
  function isConfigured() {
    return Boolean(APP_ID);
  }

  function generateMerchantTrxId(userId) {
    const random = crypto.randomBytes(6).toString('hex');
    return `rp-${userId}-${Date.now()}-${random}`;
  }

  function parseUserIdFromMerchantTrxId(merchantTrxId) {
    const match = /^rp-(\d+)-/.exec(merchantTrxId || '');
    return match ? match[1] : null;
  }

  async function creditTokens(userId, merchantTrxId, providerData = {}) {
    const transactions = (await getUserMeta(userId, 'redpen_transactions')) || {};
    const record = transactions[merchantTrxId];

    if (!record) return { credited: false, message: 'Unknown transaction' };

    if (record.status === 'completed') {
      const usage = (await getUserMeta(userId, 'redpen_usage')) || {};
      return { credited: false, message: 'Already processed', tokens: record.tokens, newBalance: usage.tokenBalance || 0 };
    }

    const status = String(providerData.status || '').toLowerCase();
    const amount = Number(providerData.amount ?? providerData.transaction_amount);
    const currency = String(providerData.currency || 'MWK').toUpperCase();

    if (status && status !== 'completed' && status !== 'success' && status !== 'successful') {
      if (status === 'failed') {
        transactions[merchantTrxId] = { ...record, status: 'failed', failedAt: new Date().toISOString() };
        await updateUserMeta(userId, 'redpen_transactions', transactions);
        return { credited: false, message: 'The Malipo payment failed.' };
      }
      return { credited: false, message: 'Payment not confirmed by Malipo yet.' };
    }

    if (Number.isFinite(amount) && amount !== Number(record.amountMWK)) {
      return { credited: false, message: 'Payment amount does not match the RedPen purchase.' };
    }

    if (currency !== 'MWK') {
      return { credited: false, message: 'Payment currency does not match the RedPen purchase.' };
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

    return { credited: true, tokens: record.tokens, newBalance };
  }

  router.post('/api/payments/initiate', authMiddleware, async (req, res) => {
    try {
      if (!isConfigured()) {
        return res.status(500).json({ message: 'Malipo payments are not configured yet. Please add MALIPO_APP_ID in Vercel.' });
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

      // Current Malipo Hosted Checkout flow from the merchant documentation.
      // merchantAccount is the Project ID / App ID.
      res.json({
        txRef: merchantTrxId,
        tokens,
        provider: 'malipo',
        checkout: {
          merchantAccount: APP_ID,
          currency: 'MWK',
          amount,
          order_id: merchantTrxId,
          description: `RedPen Token Purchase - ${tokens} token${tokens === 1 ? '' : 's'}`,
        },
      });
    } catch (error) {
      console.error('Malipo Hosted Checkout initiate error:', error.message);
      res.status(500).json({ message: 'Failed to start payment. Please try again.' });
    }
  });

  // Browser success does not itself credit tokens. The Malipo IPN callback is
  // used to mark the transaction completed and credit the token balance.
  router.post('/api/payments/verify', authMiddleware, async (req, res) => {
    try {
      const { txRef } = req.body;
      const ownerId = parseUserIdFromMerchantTrxId(txRef);
      if (!txRef) return res.status(400).json({ message: 'txRef is required' });
      if (String(ownerId) !== String(req.user.id)) return res.status(403).json({ message: 'This transaction does not belong to your account' });

      const transactions = (await getUserMeta(req.user.id, 'redpen_transactions')) || {};
      const record = transactions[txRef];
      if (!record) return res.status(404).json({ message: 'Unknown transaction' });

      const usage = (await getUserMeta(req.user.id, 'redpen_usage')) || {};
      if (record.status === 'completed') {
        return res.json({ credited: false, message: 'Already processed', tokens: record.tokens, newBalance: usage.tokenBalance || 0 });
      }
      return res.json({ credited: false, pending: true, message: 'Payment is being confirmed by Malipo.' });
    } catch (error) {
      console.error('Malipo payment verify error:', error.message);
      res.status(500).json({ message: 'Failed to check payment status' });
    }
  });

  // Malipo IPN/Callback URL configured in the Malipo project:
  // https://YOUR-REDPEN-DOMAIN/api/payments/webhook
  // Malipo documents these callback fields: status, merchant_trx_id,
  // transaction_id and customer_reference.
  router.post('/api/payments/webhook', async (req, res) => {
    try {
      const body = req.body || {};
      const merchantTrxId = body.merchant_trx_id || body.order_id || body.merchantTrxId;
      const userId = parseUserIdFromMerchantTrxId(merchantTrxId);
      if (!merchantTrxId || !userId) return res.status(200).json({ message: 'Ignored' });

      const result = await creditTokens(userId, merchantTrxId, {
        status: body.status || body.payment_status,
        amount: body.amount ?? body.transaction_amount,
        currency: body.currency,
        transaction_id: body.transaction_id || body.transId,
        customer_reference: body.customer_reference || body.customer_ref,
      });

      return res.status(200).json({ message: result.credited ? 'Payment credited' : result.message });
    } catch (error) {
      console.error('Malipo callback processing error:', error.message);
      return res.status(200).json({ message: 'Callback received' });
    }
  });

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
