import { Router } from 'express';
import crypto from 'crypto';

const MWK_PER_TOKEN = 100;
const CHAT_MESSAGES_PER_TOKEN = 30;
const CHAT_TOKEN_COST = 1 / CHAT_MESSAGES_PER_TOKEN;
const MIN_PURCHASE_MWK = 100; // 1 token minimum

const MALIPO_API_BASE = 'https://app.malipo.mw/api/v1';

export function createPaymentsRouter({ authMiddleware, getUserMeta, updateUserMeta, appBaseUrl }) {
  const router = Router();
  const API_KEY = process.env.MALIPO_API_KEY;
  const APP_ID = process.env.MALIPO_APP_ID;

  function isConfigured() {
    return Boolean(API_KEY && APP_ID);
  }

  function malipoHeaders() {
    return {
      'x-api-key': API_KEY,
      'x-app-id': APP_ID,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  // The merchant transaction ID is the stable RedPen reference used to
  // reconcile Malipo payments with the logged-in RedPen user.
  function generateMerchantTrxId(userId) {
    const random = crypto.randomBytes(6).toString('hex');
    return `rp-${userId}-${Date.now()}-${random}`;
  }

  function parseUserIdFromMerchantTrxId(merchantTrxId) {
    const match = /^rp-(\d+)-/.exec(merchantTrxId || '');
    return match ? match[1] : null;
  }

  async function prepareMalipoInvoice(merchantTrxId, amount) {
    const response = await fetch(`${MALIPO_API_BASE}/invoice/prepare`, {
      method: 'POST',
      headers: malipoHeaders(),
      body: JSON.stringify({
        merchantTrxId,
        amount,
        redirect_url: `${appBaseUrl}/?payment_callback=1`,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.payment_link) {
      console.error('Malipo invoice preparation failed:', data);
      throw new Error(data?.message || 'Failed to prepare Malipo invoice');
    }

    return data;
  }

  async function enquireMalipoTransaction(merchantTrxId) {
    const response = await fetch(
      `${MALIPO_API_BASE}/payment/enquire/${encodeURIComponent(merchantTrxId)}`,
      { headers: { 'x-api-key': API_KEY, 'x-app-id': APP_ID, Accept: 'application/json' } },
    );

    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  // Credits tokens only after Malipo confirms the transaction. The transaction
  // record is marked completed so repeated redirects/callbacks cannot credit twice.
  async function creditTokensIfValid(userId, merchantTrxId) {
    const transactions = (await getUserMeta(userId, 'redpen_transactions')) || {};
    const record = transactions[merchantTrxId];

    if (!record) {
      return { credited: false, message: 'Unknown transaction' };
    }

    if (record.status === 'completed') {
      const usage = (await getUserMeta(userId, 'redpen_usage')) || {};
      return {
        credited: false,
        message: 'Already processed',
        tokens: record.tokens,
        newBalance: usage.tokenBalance ?? 0,
      };
    }

    if (!isConfigured()) {
      return { credited: false, message: 'Payments are not configured yet.' };
    }

    const { response, data } = await enquireMalipoTransaction(merchantTrxId);
    const tx = data?.data;

    const status = String(tx?.status || '').toLowerCase();
    const currency = String(tx?.currency || '').toUpperCase();
    const amount = Number(tx?.amount);
    const returnedMerchantTrxId = tx?.merchant_trx_id;

    const isValid =
      response.ok &&
      returnedMerchantTrxId === merchantTrxId &&
      status === 'completed' &&
      currency === 'MWK' &&
      Number.isFinite(amount) &&
      amount === Number(record.amountMWK);

    if (!isValid) {
      return {
        credited: false,
        message: status === 'failed'
          ? 'The Malipo payment failed.'
          : 'Payment not confirmed by Malipo yet.',
      };
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
      malipoTransactionId: tx?.transId || null,
      customerReference: tx?.customer_ref || null,
      paymentProvider: tx?.payment_provider || null,
    };
    await updateUserMeta(userId, 'redpen_transactions', transactions);

    return {
      credited: true,
      tokens: record.tokens,
      newBalance,
    };
  }

  // ========== Initiate a token purchase through Malipo ==========
  router.post('/api/payments/initiate', authMiddleware, async (req, res) => {
    try {
      if (!isConfigured()) {
        return res.status(500).json({
          message: 'Malipo payments are not configured yet. Please try again later.',
        });
      }

      const { amountMWK } = req.body;
      const amount = Number(amountMWK);

      if (!Number.isInteger(amount) || amount < MIN_PURCHASE_MWK) {
        return res.status(400).json({
          message: `Minimum purchase is ${MIN_PURCHASE_MWK} MWK (1 token).`,
        });
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

      let invoice;
      try {
        invoice = await prepareMalipoInvoice(merchantTrxId, amount);
      } catch (error) {
        delete transactions[merchantTrxId];
        await updateUserMeta(req.user.id, 'redpen_transactions', transactions);
        throw error;
      }

      res.json({
        checkoutUrl: invoice.payment_link,
        txRef: merchantTrxId,
        tokens,
        provider: 'malipo',
      });
    } catch (error) {
      console.error('Malipo payment initiate error:', error.message);
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

      const ownerId = parseUserIdFromMerchantTrxId(txRef);
      if (String(ownerId) !== String(req.user.id)) {
        return res.status(403).json({ message: 'This transaction does not belong to your account' });
      }

      const result = await creditTokensIfValid(req.user.id, txRef);
      res.json(result);
    } catch (error) {
      console.error('Malipo payment verify error:', error.message);
      res.status(500).json({ message: 'Failed to verify payment' });
    }
  });

  // ========== Malipo IPN/callback ==========
  // Configure this URL in the Malipo merchant/developer portal as the
  // transaction callback URL. Malipo's documented callback contains status,
  // merchant_trx_id, transaction_id and customer_reference. We still perform
  // a server-side transaction enquiry before crediting tokens.
  router.post('/api/payments/webhook', async (req, res) => {
    try {
      const merchantTrxId = req.body?.merchant_trx_id;
      const status = String(req.body?.status || '').toLowerCase();

      if (!merchantTrxId) {
        return res.status(200).json({ message: 'No merchant_trx_id, ignoring' });
      }

      const userId = parseUserIdFromMerchantTrxId(merchantTrxId);
      if (!userId) {
        return res.status(200).json({ message: 'Unrecognized merchant transaction ID' });
      }

      if (status === 'failed') {
        const transactions = (await getUserMeta(userId, 'redpen_transactions')) || {};
        if (transactions[merchantTrxId]) {
          transactions[merchantTrxId] = {
            ...transactions[merchantTrxId],
            status: 'failed',
            failedAt: new Date().toISOString(),
          };
          await updateUserMeta(userId, 'redpen_transactions', transactions);
        }
        return res.status(200).json({ message: 'Failed payment recorded' });
      }

      await creditTokensIfValid(userId, merchantTrxId);
      return res.status(200).json({ message: 'Processed' });
    } catch (error) {
      console.error('Malipo callback processing error:', error.message);
      return res.status(200).json({ message: 'Error logged' });
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
