import { useState, useEffect } from 'react';
import { PENDING_TX_KEY } from '../components/SettingsModal';

const AUTH_TOKEN_KEY = 'yaza_auth_token';

export function usePaymentCallback() {
    const [paymentStatusMessage, setPaymentStatusMessage] =
        useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);

        if (params.get('payment_callback') !== '1') {
            return;
        }

        const pendingTxRef = localStorage.getItem(PENDING_TX_KEY);

        window.history.replaceState({}, '', window.location.pathname);

        if (!pendingTxRef) {
            return;
        }

        const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);

        if (!storedToken) {
            localStorage.removeItem(PENDING_TX_KEY);
            return;
        }

        (async () => {
            try {
                const res = await fetch('/api/payments/verify', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${storedToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ txRef: pendingTxRef }),
                });

                const data = await res.json().catch(() => ({}));

                localStorage.removeItem(PENDING_TX_KEY);

                if (data.credited) {
                    setPaymentStatusMessage(
                        `Success! ${data.tokens} token(s) added. New balance: ${data.newBalance}.`
                    );
                } else {
                    setPaymentStatusMessage(
                        data.message ||
                        'We could not confirm your payment yet. If money was deducted, please contact support.'
                    );
                }
            } catch (err) {
                localStorage.removeItem(PENDING_TX_KEY);
                setPaymentStatusMessage(
                    'We could not confirm your payment. If money was deducted, please contact support.'
                );
            }
        })();
    }, []);

    return { paymentStatusMessage, setPaymentStatusMessage };
}
