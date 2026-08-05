import React, { useState } from 'react';
import { X, Key, CreditCard, Check, Star, Zap, Crown, Shield, Loader2, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';
import { User } from '../types';

interface Props {
    user: User | null;
    onClose: () => void;
    onSaveApiKeys: (openai: string, gemini: string) => void;
    onUpgrade: (tier: string) => void;
}

type Tab = 'api-keys' | 'subscription';

const PLANS = [
    { id: 'free', icon: Star, label: 'Free', price: 'Free', grades: '10 grades/mo', color: 'text-gray-400', desc: 'Use your own API key' },
    { id: 'personal', icon: Zap, label: 'Personal', price: '5,000 MWK/mo', grades: '100 grades/mo', color: 'text-yellow-400', desc: 'Shared API access' },
    { id: 'corporate', icon: Crown, label: 'Corporate', price: '25,000 MWK/mo', grades: 'Unlimited', color: 'text-amber-400', desc: 'Priority + batch' },
];

export const SettingsModal = ({ user, onClose, onSaveApiKeys, onUpgrade }: Props) => {
    const [tab, setTab] = useState<Tab>('api-keys');
    const [openaiKey, setOpenaiKey] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [showOpenai, setShowOpenai] = useState(false);
    const [showGemini, setShowGemini] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleSaveKeys = async () => {
        setSaving(true);
        try {
            await onSaveApiKeys(openaiKey, geminiKey);
        } finally {
            setSaving(false);
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
                            onClick={() => setTab('subscription')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold rounded-lg transition-all ${tab === 'subscription'
                                ? 'bg-accent-blue text-white shadow-lg'
                                : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <CreditCard size={12} />
                            Subscription
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
                            {user?.apiProvider && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-accent-green/5 border border-accent-green/20 rounded-xl">
                                    <Check size={12} className="text-accent-green" />
                                    <span className="text-[10px] text-accent-green font-medium">
                                        Using {user.apiProvider === 'openai' ? 'OpenAI' : 'Gemini'} API
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
                            <p className="text-[10px] text-gray-500 leading-relaxed">
                                Choose a plan that fits your needs. Personal and Corporate plans include access to shared API keys.
                            </p>

                            {/* Current Usage */}
                            {user && (
                                <div className="bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-gray-400">Current Plan</span>
                                    <span className="text-[11px] font-bold text-white uppercase">{user.tier}</span>
                                </div>
                            )}

                            {/* Plan Cards */}
                            <div className="grid grid-cols-3 gap-2.5">
                                {PLANS.map((plan) => {
                                    const isCurrent = user?.tier === plan.id;
                                    const Icon = plan.icon;
                                    return (
                                        <div
                                            key={plan.id}
                                            className={`rounded-xl p-3 border flex flex-col items-center text-center gap-1.5 ${isCurrent
                                                ? 'border-accent-blue bg-accent-blue/5'
                                                : 'border-gray-800 bg-gray-900/30'
                                                }`}
                                        >
                                            <Icon size={18} className={plan.color} />
                                            <p className={`text-[10px] font-bold ${plan.color}`}>{plan.label}</p>
                                            <p className="text-[9px] text-gray-300 font-bold">{plan.price}</p>
                                            <p className="text-[8px] text-gray-600">{plan.grades}</p>
                                            {isCurrent ? (
                                                <span className="text-[8px] text-accent-blue font-bold uppercase tracking-wider">Active</span>
                                            ) : (
                                                <button
                                                    onClick={() => onUpgrade(plan.id)}
                                                    className="text-[8px] text-accent-blue hover:text-blue-400 font-bold uppercase tracking-wider transition-colors"
                                                >
                                                    {user?.tier === 'free' && plan.id === 'personal' ? 'Upgrade' :
                                                        user?.tier === 'personal' && plan.id === 'corporate' ? 'Upgrade' :
                                                            plan.id === 'free' ? 'Downgrade' : '—'}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Payment Placeholder */}
                            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3">
                                <p className="text-[10px] text-yellow-500/80 font-medium text-center">
                                    💳 Airtel Money & TNM Mpamba payment integration coming soon.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};
