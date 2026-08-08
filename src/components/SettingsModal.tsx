import React, { useState, useEffect } from 'react';
import { X, Key, CreditCard, Check, Coins, Loader2, Eye, EyeOff, FolderOpen, FolderCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { User } from '../types';
import { isFileSystemAccessSupported, pickSaveFolder, getSavedFolder, clearSaveFolder } from '../lib/fileStorage';

interface Props {
    user: User | null;
    onClose: () => void;
    onSaveApiKeys: (openai: string, gemini: string) => void;
    authHeaders: () => Record<string, string>;
}

type Tab = 'api-keys' | 'tokens' | 'save-location';

const MWK_PER_TOKEN = 100;
const MIN_PURCHASE_MWK = 100;
const QUICK_AMOUNTS = [100, 500, 1000, 5000];
export const PENDING_TX_KEY = 'redpen_pending_tx_ref';

export const SettingsModal = ({ user, onClose, onSaveApiKeys, authHeaders }: Props) => {
    const [tab, setTab] = useState<Tab>('api-keys');
    const [openaiKey, setOpenaiKey] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [showOpenai, setShowOpenai] = useState(false);
    const [showGemini, setShowGemini] = useState(false);
    const [saving, setSaving] = useState(false);

    // Save location state
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
    }, []);

    const handlePickFolder = async () => {
        const folder = await pickSaveFolder();
        if (folder) setFolderName((folder as any).name);
    };

    const handleClearFolder = async () => {
        await clearSaveFolder();
        setFolderName(null);
    };

    // Token purchase state
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
    }, [tab, user]);

    const handleSaveKeys = async () => {
        setSaving(true);
        try {
            await onSaveApiKeys(openaiKey, geminiKey);
        } finally {
            setSaving(false);
        }
    };

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
                setBuying(false);
                return;
            }

            // Store the tx_ref so we can verify it once PayChangu redirects back
            localStorage.setItem(PENDING_TX_KEY, data.txRef);

            // Send the user to PayChangu's checkout page
            window.location.href = data.checkoutUrl;
        } catch (err) {
            setBuyError('Failed to start payment. Please try again.');
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
                    {/* Tab Switcher */}
                    <div className="flex bg-gray-900 rounded-xl p-1">
                        <button
                            onClick={() => setTab('api-keys')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold rounded-lg transition-all ${tab === 'api-keys'
                                ? 'bg-accent-blue text-white shadow-lg'
                                : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <Key size={12} />
                            API Keys
                        </button>
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

                    {tab === 'api-keys' ? (
                        <div className="space-y-4">
                            <p className="text-[10px] text-gray-500 leading-relaxed">
                                Provide your own API keys for grading. Your keys are stored securely and used only for your grading requests.
                            </p>

                            {/* OpenAI Key */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">OpenAI API Key</label>
                                <div className="relative">
                                    <input
                                        type={showOpenai ? 'text' : 'password'}
                                        placeholder="sk-..."
                                        value={openaiKey}
                                        onChange={(e) => setOpenaiKey(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-xl py-2.5 pl-4 pr-10 text-[11px] text-gray-200 placeholder:text-gray-600 focus:border-accent-blue focus:outline-none transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowOpenai(!showOpenai)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-400"
                                    >
                                        {showOpenai ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                            </div>

                            {/* Gemini Key */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Gemini API Key</label>
                                <div className="relative">
                                    <input
                                        type={showGemini ? 'text' : 'password'}
                                        placeholder="AIza..."
                                        value={geminiKey}
                                        onChange={(e) => setGeminiKey(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-xl py-2.5 pl-4 pr-10 text-[11px] text-gray-200 placeholder:text-gray-600 focus:border-accent-blue focus:outline-none transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowGemini(!showGemini)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-400"
                                    >
                                        {showGemini ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                            </div>

                            {/* Current Provider Status */}
                            {user?.activeProvider && user.activeProvider !== 'server' && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-accent-green/5 border border-accent-green/20 rounded-xl">
                                    <Check size={12} className="text-accent-green" />
                                    <span className="text-[10px] text-accent-green font-medium">
                                        Using {user.activeProvider === 'openai' ? 'OpenAI' : 'Gemini'} API
                                    </span>
                                </div>
                            )}

                            <button
                                onClick={handleSaveKeys}
                                disabled={saving || (!openaiKey && !geminiKey)}
                                className="w-full py-2.5 bg-accent-blue text-white text-[11px] font-bold rounded-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                            >
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Key size={12} />}
                                Save API Keys
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Current Balance */}
                            <div className="bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Coins size={16} className="text-yellow-400" />
                                    <span className="text-[11px] font-bold text-gray-400">Token Balance</span>
                                </div>
                                <span className="text-xl font-bold text-white">
                                    {loadingBalance ? <Loader2 size={16} className="animate-spin text-gray-500" /> : tokenBalance ?? 0}
                                </span>
                            </div>

                            <p className="text-[10px] text-gray-500 leading-relaxed">
                                1 token = 1 grading. {MWK_PER_TOKEN} MWK per token. Buy tokens using Airtel Money, TNM Mpamba, or card via PayChangu.
                            </p>

                            {/* Quick amounts */}
                            <div className="grid grid-cols-4 gap-2">
                                {QUICK_AMOUNTS.map((amt) => (
                                    <button
                                        key={amt}
                                        onClick={() => setAmountMWK(String(amt))}
                                        className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${amountMWK === String(amt)
                                            ? 'bg-accent-blue/10 border-accent-blue text-accent-blue'
                                            : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
                                            }`}
                                    >
                                        {amt}
                                    </button>
                                ))}
                            </div>

                            {/* Custom amount */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Amount (MWK)</label>
                                <input
                                    type="number"
                                    min={MIN_PURCHASE_MWK}
                                    step={MWK_PER_TOKEN}
                                    placeholder={`Minimum ${MIN_PURCHASE_MWK}`}
                                    value={amountMWK}
                                    onChange={(e) => setAmountMWK(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl py-2.5 px-4 text-[13px] text-gray-200 placeholder:text-gray-600 focus:border-accent-blue focus:outline-none transition-all"
                                />
                                {amountMWK && Number(amountMWK) >= MIN_PURCHASE_MWK && (
                                    <p className="text-[10px] text-gray-500">≈ {estimatedTokens} token{estimatedTokens !== 1 ? 's' : ''}</p>
                                )}
                            </div>

                            {buyError && (
                                <p className="text-[10px] text-red-400">{buyError}</p>
                            )}

                            <button
                                onClick={handleBuyTokens}
                                disabled={buying || !amountMWK || Number(amountMWK) < MIN_PURCHASE_MWK}
                                className="w-full py-2.5 bg-yellow-600 hover:bg-yellow-500 text-white text-[11px] font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                            >
                                {buying ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={12} />}
                                {buying ? 'Redirecting to PayChangu...' : 'Buy Tokens'}
                            </button>
                        </div>
                    ) : tab === 'save-location' ? (
                        <div className="space-y-4">
                            {!fsSupported ? (
                                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 space-y-2">
                                    <p className="text-[11px] text-yellow-500/90 font-bold">Not supported in this browser</p>
                                    <p className="text-[10px] text-gray-500 leading-relaxed">
                                        Automatic folder saving works in Chrome and Edge only. In this browser, saved PDFs and the session spreadsheet will download normally instead — you can find them in your browser's Downloads folder.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <p className="text-[10px] text-gray-500 leading-relaxed">
                                        Choose a folder where graded papers (PDF) and the session spreadsheet (Excel) will be saved automatically every time you click Save.
                                    </p>

                                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-4 flex items-center gap-3">
                                        {checkingFolder ? (
                                            <Loader2 size={16} className="animate-spin text-gray-500" />
                                        ) : folderName ? (
                                            <>
                                                <FolderCheck size={18} className="text-accent-green shrink-0" />
                                                <div className="min-w-0">
                                                    <p className="text-[11px] font-bold text-white truncate">{folderName}</p>
                                                    <p className="text-[9px] text-gray-500">Selected save folder</p>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <FolderOpen size={18} className="text-gray-600 shrink-0" />
                                                <p className="text-[11px] text-gray-500">No folder selected yet</p>
                                            </>
                                        )}
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={handlePickFolder}
                                            className="flex-1 py-2.5 bg-accent-blue text-white text-[11px] font-bold rounded-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-2 shadow-lg"
                                        >
                                            <FolderOpen size={12} />
                                            {folderName ? 'Change Folder' : 'Choose Folder'}
                                        </button>
                                        {folderName && (
                                            <button
                                                onClick={handleClearFolder}
                                                className="py-2.5 px-4 bg-gray-800 text-gray-400 text-[11px] font-bold rounded-xl hover:bg-gray-700 transition-all"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    ) : null}
                </div>
            </motion.div>
        </motion.div>
    );
};
