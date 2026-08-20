import React, { useState, useEffect } from 'react';
import { X, CreditCard, Loader2, Coins, FolderOpen, FolderCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { User } from '../types';
import { isFileSystemAccessSupported, pickSaveFolder, getSavedFolder, clearSaveFolder } from '../lib/fileStorage';

interface Props {
    user: User | null;
    // Kept optional for compatibility with existing App.tsx until its unused
    // API-key handler is removed from the parent.
    onSaveApiKeys?: (openai: string, gemini: string) => void;
    onClose: () => void;
    authHeaders: () => Record<string, string>;
}

type Tab = 'tokens' | 'save-location';

const MWK_PER_TOKEN = 100;
const MIN_PURCHASE_MWK = 100;

export const PENDING_TX_KEY = 'redpen_pending_tx_ref';

export const SettingsModal = ({ user, onClose, authHeaders }: Props) => {
    const [tab, setTab] = useState<Tab>('tokens');

    const [folderName, setFolderName] = useState<string | null>(null);
    const [checkingFolder, setCheckingFolder] = useState(true);
    const fsSupported = isFileSystemAccessSupported();

    useEffect(() => {
        if (!fsSupported) {
            setCheckingFolder(false);
            return;
        }
        (async () => {
            const folder = await getSavedFolder();
            setFolderName(folder ? (folder as any).name : null);
            setCheckingFolder(false);
        })();
    }, [fsSupported]);

    const handlePickFolder = async () => {
        const folder = await pickSaveFolder();
        if (folder) setFolderName((folder as any).name);
    };

    const handleClearFolder = async () => {
        await clearSaveFolder();
        setFolderName(null);
    };

    const [tokenBalance, setTokenBalance] = useState<number | null>(null);
    const [loadingBalance, setLoadingBalance] = useState(true);
    const [amountMWK, setAmountMWK] = useState('');
    const [buying, setBuying] = useState(false);
    const [buyError, setBuyError] = useState('');

    useEffect(() => {
        if (tab !== 'tokens' || !user) return;
        (async () => {
            setLoadingBalance(true);
            try {
                const res = await fetch('/api/payments/balance', { headers: authHeaders() });
                const data = await res.json().catch(() => ({}));
                setTokenBalance(data.tokenBalance ?? 0);
            } catch {
                setTokenBalance(null);
            } finally {
                setLoadingBalance(false);
            }
        })();
    }, [tab, user, authHeaders]);

    const estimatedTokens = amountMWK ? Math.floor(Number(amountMWK) / MWK_PER_TOKEN) : 0;

    const handleBuyTokens = async () => {
        if (!user) return;
        setBuyError('');
        const amount = Number(amountMWK);

        if (!amount || amount < MIN_PURCHASE_MWK) {
            setBuyError(`Minimum purchase is ${MIN_PURCHASE_MWK} MWK (1 token).`);
            return;
        }

        setBuying(true);
        try {
            const res = await fetch('/api/payments/initiate', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ amountMWK: amount }),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data.checkoutUrl) {
                setBuyError(data.message || 'Failed to start payment. Please try again.');
                return;
            }

            localStorage.setItem(PENDING_TX_KEY, data.txRef);
            window.location.href = data.checkoutUrl;
        } catch {
            setBuyError('Failed to start payment. Please try again.');
        } finally {
            setBuying(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-card border border-gray-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
                <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-4 bg-accent-blue rounded-full" />
                        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-300">Settings</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-all"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div className="flex bg-gray-900 rounded-xl p-1">
                        <button
                            onClick={() => setTab('tokens')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold rounded-lg transition-all ${tab === 'tokens'
                                ? 'bg-accent-blue text-white shadow-lg'
                                : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <Coins size={12} />
                            Tokens
                        </button>
                        <button
                            onClick={() => setTab('save-location')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold rounded-lg transition-all ${tab === 'save-location'
                                ? 'bg-accent-blue text-white shadow-lg'
                                : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <FolderOpen size={12} />
                            Save To
                        </button>
                    </div>

                    {tab === 'tokens' ? (
                        <div className="space-y-4">
                            <div className="bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Coins size={16} className="text-yellow-400" />
                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Token Balance</span>
                                </div>
                                {loadingBalance ? (
                                    <Loader2 size={14} className="text-gray-500 animate-spin" />
                                ) : (
                                    <span className="text-lg font-black text-white">{tokenBalance ?? '—'}</span>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Purchase Tokens</label>
                                <input
                                    type="number"
                                    min={MIN_PURCHASE_MWK}
                                    step={100}
                                    value={amountMWK}
                                    onChange={(e) => setAmountMWK(e.target.value)}
                                    placeholder="Amount in MWK"
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl py-2.5 px-4 text-[11px] text-gray-200 placeholder:text-gray-600 focus:border-accent-blue focus:outline-none transition-all"
                                />
                                <p className="text-[9px] text-gray-600">
                                    {estimatedTokens > 0 ? `You will receive approximately ${estimatedTokens} token${estimatedTokens === 1 ? '' : 's'}.` : '1 token = 100 MWK.'}
                                </p>
                            </div>

                            {buyError && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[10px] text-red-400">
                                    {buyError}
                                </div>
                            )}

                            <button
                                onClick={handleBuyTokens}
                                disabled={buying}
                                className="w-full py-2.5 bg-accent-blue text-white text-[11px] font-bold rounded-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                            >
                                {buying ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={12} />}
                                {buying ? 'Opening Checkout...' : 'Buy Tokens'}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <p className="text-[10px] text-gray-500 leading-relaxed">
                                    Choose where RedPen stores generated PDFs and Excel workbooks.
                                </p>
                            </div>

                            {!fsSupported ? (
                                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-[10px] text-gray-500">
                                    Folder selection is not supported in this browser. Files will use the browser download location.
                                </div>
                            ) : (
                                <>
                                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            {folderName ? <FolderCheck size={14} className="text-accent-green" /> : <FolderOpen size={14} className="text-gray-500" />}
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Current Folder</span>
                                        </div>
                                        <p className="text-[11px] text-gray-300 truncate">
                                            {checkingFolder ? 'Checking...' : folderName || 'Browser downloads'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={handlePickFolder}
                                        className="w-full py-2.5 bg-accent-blue text-white text-[11px] font-bold rounded-xl hover:bg-blue-600 transition-all"
                                    >
                                        Choose Save Folder
                                    </button>
                                    {folderName && (
                                        <button
                                            onClick={handleClearFolder}
                                            className="w-full py-2.5 bg-gray-800 text-gray-300 text-[11px] font-bold rounded-xl hover:bg-gray-700 transition-all"
                                        >
                                            Use Browser Downloads Instead
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};