import React, { useState } from 'react';
import { X, User as UserIcon, Star, Zap, Crown, Shield, BarChart3, LogOut, Building2, Briefcase, Key, Lock, Trash2, ChevronDown, ChevronUp, AlertTriangle, Loader2, Camera, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '../types';

interface Props {
    user: User;
    onClose: () => void;
    onLogout: () => void;
    onOpenSettings: () => void;
    onSaveProfile: (institution: string, role: string) => Promise<void>;
    onChangePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message?: string }>;
    onDeleteAccount: (password: string) => Promise<{ success: boolean; message?: string }>;
    onUploadAvatar: (file: File) => Promise<{ success: boolean; message?: string }>;
    authHeaders: () => Record<string, string>;
}

const TIER_CONFIG: Record<string, { icon: any; color: string; label: string; price: string }> = {
    free: { icon: Star, color: 'text-gray-400', label: 'Free', price: 'Free' },
    personal: { icon: Zap, color: 'text-yellow-400', label: 'Personal', price: '5,000 MWK/mo' },
    corporate: { icon: Crown, color: 'text-amber-400', label: 'Corporate', price: '25,000 MWK/mo' },
};

const PROVIDER_LABEL: Record<string, string> = {
    gemini: 'Your Gemini API Key',
    openai: 'Your OpenAI API Key',
    server: 'Shared Server Key',
};

export const ProfileModal = ({ user, onClose, onLogout, onOpenSettings, onSaveProfile, onChangePassword, onDeleteAccount, onUploadAvatar, authHeaders }: Props) => {
    const tierConfig = TIER_CONFIG[user.tier] || TIER_CONFIG.free;

    // Token balance
    const [tokenBalance, setTokenBalance] = useState<number | null>(null);
    const [loadingBalance, setLoadingBalance] = useState(true);

    React.useEffect(() => {
        (async () => {
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
    }, []);

    // Avatar upload
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [avatarError, setAvatarError] = useState('');
    const avatarInputRef = React.useRef<HTMLInputElement>(null);

    // Crop modal state
    const [cropSrc, setCropSrc] = useState<string | null>(null);
    const [cropZoom, setCropZoom] = useState(1);
    const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
    const [isDraggingCrop, setIsDraggingCrop] = useState(false);
    const dragStartRef = React.useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
    const cropImgRef = React.useRef<HTMLImageElement>(null);
    const CROP_SIZE = 240; // px, size of the visible crop circle/canvas

    const handleAvatarPick = () => avatarInputRef.current?.click();

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow re-selecting the same file later
        if (!file) return;

        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            setAvatarError('Please choose a JPEG, PNG, or WebP image');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setAvatarError('Image must be under 5MB');
            return;
        }

        setAvatarError('');
        const reader = new FileReader();
        reader.onload = () => {
            setCropSrc(reader.result as string);
            setCropZoom(1);
            setCropOffset({ x: 0, y: 0 });
        };
        reader.readAsDataURL(file);
    };

    const handleCropPointerDown = (e: React.PointerEvent) => {
        setIsDraggingCrop(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY, offsetX: cropOffset.x, offsetY: cropOffset.y };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
    const handleCropPointerMove = (e: React.PointerEvent) => {
        if (!isDraggingCrop) return;
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        setCropOffset({ x: dragStartRef.current.offsetX + dx, y: dragStartRef.current.offsetY + dy });
    };
    const handleCropPointerUp = () => setIsDraggingCrop(false);

    const handleCropCancel = () => {
        setCropSrc(null);
        setCropZoom(1);
        setCropOffset({ x: 0, y: 0 });
    };

    const handleCropConfirm = async () => {
        const imgEl = cropImgRef.current;
        if (!imgEl) return;

        const OUTPUT_SIZE = 400; // final exported square avatar size, px
        const canvas = document.createElement('canvas');
        canvas.width = OUTPUT_SIZE;
        canvas.height = OUTPUT_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Compute how the image is currently displayed inside the CROP_SIZE viewport,
        // matching the CSS transform used in the preview (object-fit: cover, then zoom + drag offset).
        const naturalW = imgEl.naturalWidth;
        const naturalH = imgEl.naturalHeight;
        const baseScale = Math.max(CROP_SIZE / naturalW, CROP_SIZE / naturalH); // "cover" scale
        const scale = baseScale * cropZoom;

        const displayedW = naturalW * scale;
        const displayedH = naturalH * scale;

        // Top-left of the displayed image relative to the CROP_SIZE viewport's top-left
        const imgLeft = (CROP_SIZE - displayedW) / 2 + cropOffset.x;
        const imgTop = (CROP_SIZE - displayedH) / 2 + cropOffset.y;

        // Map viewport (0,0)-(CROP_SIZE,CROP_SIZE) back to source image pixel coordinates
        const sx = (0 - imgLeft) / scale;
        const sy = (0 - imgTop) / scale;
        const sSize = CROP_SIZE / scale;

        ctx.drawImage(imgEl, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const croppedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });

            setAvatarUploading(true);
            try {
                const result = await onUploadAvatar(croppedFile);
                if (!result.success) {
                    setAvatarError(result.message || 'Failed to upload image');
                }
            } finally {
                setAvatarUploading(false);
                handleCropCancel();
            }
        }, 'image/jpeg', 0.9);
    };

    // Institution / role editing
    const [editingProfile, setEditingProfile] = useState(false);
    const [institution, setInstitution] = useState(user.institution || '');
    const [role, setRole] = useState(user.role || '');
    const [savingProfile, setSavingProfile] = useState(false);

    // Change password
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');
    const [changingPassword, setChangingPassword] = useState(false);

    // Delete account
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const [deleting, setDeleting] = useState(false);

    const handleSaveProfile = async () => {
        setSavingProfile(true);
        try {
            await onSaveProfile(institution.trim(), role.trim());
            setEditingProfile(false);
        } finally {
            setSavingProfile(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        if (newPassword.length < 6) {
            setPasswordError('New password must be at least 6 characters');
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError('New passwords do not match');
            return;
        }

        setChangingPassword(true);
        try {
            const result = await onChangePassword(currentPassword, newPassword);
            if (result.success) {
                setPasswordSuccess('Password updated successfully');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setTimeout(() => setShowPasswordForm(false), 1500);
            } else {
                setPasswordError(result.message || 'Failed to change password');
            }
        } finally {
            setChangingPassword(false);
        }
    };

    const handleDeleteAccount = async () => {
        setDeleteError('');
        if (deleteConfirmText !== 'DELETE') {
            setDeleteError('Type DELETE to confirm');
            return;
        }
        if (!deletePassword) {
            setDeleteError('Password is required');
            return;
        }

        setDeleting(true);
        try {
            const result = await onDeleteAccount(deletePassword);
            if (!result.success) {
                setDeleteError(result.message || 'Failed to delete account');
                setDeleting(false);
            }
            // On success, parent handles logout/redirect — no need to reset state here
        } catch {
            setDeleteError('Failed to delete account');
            setDeleting(false);
        }
    };

    return (
        <>
        {cropSrc && (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6"
            >
                <div className="bg-card border border-gray-800 rounded-3xl shadow-2xl w-full max-w-xs p-6 space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-gray-300 text-center">Crop Photo</h3>

                    <div
                        className="relative mx-auto rounded-full overflow-hidden border-2 border-accent-blue/40 cursor-grab active:cursor-grabbing touch-none select-none"
                        style={{ width: CROP_SIZE, height: CROP_SIZE }}
                        onPointerDown={handleCropPointerDown}
                        onPointerMove={handleCropPointerMove}
                        onPointerUp={handleCropPointerUp}
                        onPointerLeave={handleCropPointerUp}
                    >
                        <img
                            ref={cropImgRef}
                            src={cropSrc}
                            alt="Crop preview"
                            draggable={false}
                            className="absolute top-1/2 left-1/2 max-w-none"
                            style={{
                                transform: `translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropZoom})`,
                                width: CROP_SIZE,
                                height: CROP_SIZE,
                                objectFit: 'cover',
                            }}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 shrink-0">Zoom</span>
                        <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.05}
                            value={cropZoom}
                            onChange={(e) => setCropZoom(Number(e.target.value))}
                            className="flex-1 accent-accent-blue"
                        />
                    </div>

                    {avatarError && <p className="text-[10px] text-red-400 text-center">{avatarError}</p>}

                    <div className="flex gap-2">
                        <button
                            onClick={handleCropCancel}
                            disabled={avatarUploading}
                            className="flex-1 py-2 bg-gray-800 text-gray-300 text-[11px] font-bold rounded-lg hover:bg-gray-700 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleCropConfirm}
                            disabled={avatarUploading}
                            className="flex-1 py-2 bg-accent-blue text-white text-[11px] font-bold rounded-lg hover:bg-blue-600 transition-all flex items-center justify-center gap-1.5"
                        >
                            {avatarUploading ? <Loader2 size={12} className="animate-spin" /> : 'Save Photo'}
                        </button>
                    </div>
                </div>
            </motion.div>
        )}
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
                className="bg-card border border-gray-800 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto"
            >
                <div className="flex items-center justify-between p-6 border-b border-gray-800 sticky top-0 bg-card z-10">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-4 bg-accent-blue rounded-full" />
                        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-300">Profile</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-all"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 items-start">
                    {/* User Avatar & Name */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleAvatarPick}
                            disabled={avatarUploading}
                            className="relative w-14 h-14 rounded-2xl overflow-hidden group shrink-0 border border-accent-blue/20"
                            title="Change profile picture"
                        >
                            {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-accent-blue/10 flex items-center justify-center">
                                    <UserIcon size={28} className="text-accent-blue" />
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                {avatarUploading ? (
                                    <Loader2 size={16} className="text-white animate-spin" />
                                ) : (
                                    <Camera size={16} className="text-white" />
                                )}
                            </div>
                        </button>
                        <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleAvatarChange}
                            className="hidden"
                        />
                        <div>
                            <p className="text-sm font-bold text-white">{user.name}</p>
                            <p className="text-[11px] text-gray-500">{user.email}</p>
                            <div className={`flex items-center gap-1 mt-1.5 ${tierConfig.color}`}>
                                <tierConfig.icon size={12} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">{tierConfig.label} Plan</span>
                            </div>
                            {avatarError && <p className="text-[9px] text-red-400 mt-1">{avatarError}</p>}
                        </div>
                    </div>

                    {/* Institution & Role */}
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Institution & Role</span>
                            {!editingProfile && (
                                <button
                                    onClick={() => setEditingProfile(true)}
                                    className="text-[10px] text-accent-blue hover:text-accent-blue/80 font-bold"
                                >
                                    Edit
                                </button>
                            )}
                        </div>

                        {editingProfile ? (
                            <div className="space-y-2">
                                <div className="relative">
                                    <Building2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type="text"
                                        value={institution}
                                        onChange={(e) => setInstitution(e.target.value)}
                                        placeholder="Institution (e.g. University of Malawi)"
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-7 pr-2 py-1.5 text-[11px] text-white focus:border-accent-blue focus:outline-none placeholder:text-gray-600"
                                    />
                                </div>
                                <div className="relative">
                                    <Briefcase size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type="text"
                                        value={role}
                                        onChange={(e) => setRole(e.target.value)}
                                        placeholder="Role (e.g. Lecturer, TA)"
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-7 pr-2 py-1.5 text-[11px] text-white focus:border-accent-blue focus:outline-none placeholder:text-gray-600"
                                    />
                                </div>
                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={handleSaveProfile}
                                        disabled={savingProfile}
                                        className="flex-1 py-1.5 bg-accent-blue text-white text-[10px] font-bold rounded-lg hover:bg-blue-600 transition-all flex items-center justify-center gap-1.5"
                                    >
                                        {savingProfile ? <Loader2 size={11} className="animate-spin" /> : 'Save'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setInstitution(user.institution || '');
                                            setRole(user.role || '');
                                            setEditingProfile(false);
                                        }}
                                        className="flex-1 py-1.5 bg-gray-800 text-gray-400 text-[10px] font-bold rounded-lg hover:bg-gray-700 transition-all"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <p className="text-[11px] text-gray-300">
                                    {user.institution || <span className="text-gray-600 italic">No institution set</span>}
                                </p>
                                <p className="text-[11px] text-gray-500">
                                    {user.role || <span className="text-gray-600 italic">No role set</span>}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Token Balance */}
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Coins size={14} className="text-yellow-400" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Token Balance</span>
                            </div>
                            <button
                                onClick={onOpenSettings}
                                className="text-[10px] text-accent-blue hover:text-accent-blue/80 font-bold"
                            >
                                Buy More
                            </button>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                            {loadingBalance ? (
                                <Loader2 size={16} className="animate-spin text-gray-500" />
                            ) : (
                                <span className="text-2xl font-bold text-white">{tokenBalance ?? 0}</span>
                            )}
                            <span className="text-[10px] text-gray-500 font-medium">tokens</span>
                        </div>
                        <p className="text-[9px] text-gray-600">1 token = 1 grading. Buy more anytime in Settings.</p>
                    </div>

                    {/* Total papers graded (all-time stat, no limit implied) */}
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <BarChart3 size={14} className="text-gray-500" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total Papers Graded</span>
                            </div>
                            <span className="text-[11px] font-bold text-gray-300">{user.totalGraded ?? 0}</span>
                        </div>
                    </div>

                    {/* AI Provider */}
                    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Key size={14} className="text-gray-500" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">AI Provider</span>
                            </div>
                            <button
                                onClick={onOpenSettings}
                                className="text-[10px] text-accent-blue hover:text-accent-blue/80 font-bold"
                            >
                                Manage
                            </button>
                        </div>
                        <p className="text-[11px] text-gray-300 mt-2">
                            {PROVIDER_LABEL[user.activeProvider || 'server']}
                        </p>
                    </div>

                    {/* Account Created */}
                    <p className="text-[9px] text-gray-700 text-center">
                        Member since {new Date(user.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                    </p>

                    {/* Actions */}
                    <div className="flex gap-2.5">
                        <button
                            onClick={onOpenSettings}
                            className="flex-1 py-2.5 bg-yellow-600 hover:bg-yellow-500 text-white text-[11px] font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg"
                        >
                            <Coins size={12} />
                            Buy Tokens
                        </button>
                        <button
                            onClick={onLogout}
                            className="flex-1 py-2.5 bg-gray-800 hover:bg-red-500/20 text-gray-400 hover:text-red-400 text-[11px] font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                        >
                            <LogOut size={12} />
                            Logout
                        </button>
                    </div>

                    {/* Account Security */}
                    <div className="border-t border-gray-800 pt-4 space-y-2">
                        <button
                            onClick={() => { setShowPasswordForm(!showPasswordForm); setPasswordError(''); setPasswordSuccess(''); }}
                            className="w-full flex items-center justify-between py-2 text-[11px] font-bold text-gray-400 hover:text-white transition-colors"
                        >
                            <span className="flex items-center gap-2"><Lock size={13} /> Change Password</span>
                            {showPasswordForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        <AnimatePresence>
                            {showPasswordForm && (
                                <motion.form
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    onSubmit={handleChangePassword}
                                    className="overflow-hidden space-y-2"
                                >
                                    <input
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        placeholder="Current password"
                                        required
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-[11px] text-white focus:border-accent-blue focus:outline-none placeholder:text-gray-600"
                                    />
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="New password (min 6 characters)"
                                        required
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-[11px] text-white focus:border-accent-blue focus:outline-none placeholder:text-gray-600"
                                    />
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Confirm new password"
                                        required
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-[11px] text-white focus:border-accent-blue focus:outline-none placeholder:text-gray-600"
                                    />
                                    {passwordError && <p className="text-[10px] text-red-400">{passwordError}</p>}
                                    {passwordSuccess && <p className="text-[10px] text-accent-green">{passwordSuccess}</p>}
                                    <button
                                        type="submit"
                                        disabled={changingPassword}
                                        className="w-full py-2 bg-accent-blue text-white text-[11px] font-bold rounded-lg hover:bg-blue-600 transition-all flex items-center justify-center gap-1.5"
                                    >
                                        {changingPassword ? <Loader2 size={12} className="animate-spin" /> : 'Update Password'}
                                    </button>
                                </motion.form>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Danger Zone */}
                    <div className="border-t border-gray-800 pt-4">
                        <button
                            onClick={() => { setShowDeleteConfirm(!showDeleteConfirm); setDeleteError(''); }}
                            className="w-full flex items-center justify-between py-2 text-[11px] font-bold text-red-500/70 hover:text-red-400 transition-colors"
                        >
                            <span className="flex items-center gap-2"><Trash2 size={13} /> Delete Account</span>
                            {showDeleteConfirm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        <AnimatePresence>
                            {showDeleteConfirm && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden space-y-2"
                                >
                                    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                        <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
                                        <p className="text-[10px] text-red-300">
                                            This permanently deletes your account and all grading history. This cannot be undone.
                                        </p>
                                    </div>
                                    <input
                                        type="text"
                                        value={deleteConfirmText}
                                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                                        placeholder='Type "DELETE" to confirm'
                                        className="w-full bg-gray-900 border border-red-900/50 rounded-lg px-3 py-2 text-[11px] text-white focus:border-red-500 focus:outline-none placeholder:text-gray-600"
                                    />
                                    <input
                                        type="password"
                                        value={deletePassword}
                                        onChange={(e) => setDeletePassword(e.target.value)}
                                        placeholder="Enter your password"
                                        className="w-full bg-gray-900 border border-red-900/50 rounded-lg px-3 py-2 text-[11px] text-white focus:border-red-500 focus:outline-none placeholder:text-gray-600"
                                    />
                                    {deleteError && <p className="text-[10px] text-red-400">{deleteError}</p>}
                                    <button
                                        onClick={handleDeleteAccount}
                                        disabled={deleting}
                                        className="w-full py-2 bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5"
                                    >
                                        {deleting ? <Loader2 size={12} className="animate-spin" /> : 'Permanently Delete My Account'}
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
        </>
    );
};
