import { useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import { Lock, KeyRound, Eye, EyeOff, X, Loader2 } from 'lucide-react';

interface PasswordSetupModalProps {
    hasPassword: boolean;
    onClose: () => void;
    onSaved: () => void;
}

export function PasswordSetupModal({ hasPassword, onClose, onSaved }: PasswordSetupModalProps) {
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        setError('');

        if (hasPassword && !currentPassword) {
            setError('Current password is required');
            return;
        }

        if (!newPassword) {
            setError('New password is required');
            return;
        }

        if (newPassword.length < 4) {
            setError('Password must be at least 4 characters');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            const store = await load('settings.json');

            if (hasPassword) {
                const storedHash = await store.get<string>('password_hash');
                if (!storedHash) {
                    setError('No existing password found');
                    setLoading(false);
                    return;
                }

                const valid = await invoke<boolean>('cmd_verify_password', {
                    password: currentPassword,
                    hash: storedHash,
                });

                if (!valid) {
                    setError('Current password is incorrect');
                    setLoading(false);
                    return;
                }
            }

            const newHash = await invoke<string>('cmd_set_password', { password: newPassword });
            await store.set('password_hash', newHash);
            await store.save();

            setStep('success');
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !loading) handleSave();
    };

    if (step === 'success') {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onSaved}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-telegram-surface border border-telegram-border rounded-xl w-[380px] shadow-2xl"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-6 text-center">
                        <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Lock className="w-6 h-6 text-green-400" />
                        </div>
                        <h3 className="text-telegram-text font-medium mb-2">
                            {hasPassword ? 'Password Changed' : 'Password Set'}
                        </h3>
                        <p className="text-sm text-telegram-subtext mb-6">
                            {hasPassword
                                ? 'Your app lock password has been updated.'
                                : 'Your app lock password has been saved.'}
                        </p>
                        <button
                            onClick={onSaved}
                            className="px-6 py-2 bg-telegram-primary/20 text-telegram-primary rounded-lg text-sm font-semibold hover:bg-telegram-primary/30 transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-telegram-surface border border-telegram-border rounded-xl w-[380px] shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-4 border-b border-telegram-border flex items-center justify-between">
                    <h3 className="text-telegram-text font-medium">
                        {hasPassword ? 'Change Password' : 'Set Password'}
                    </h3>
                    <button onClick={onClose} className="text-telegram-subtext hover:text-telegram-text">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 flex flex-col gap-3">
                    {hasPassword && (
                        <div className="relative">
                            <label className="block text-xs text-telegram-subtext mb-1">Current Password</label>
                            <input
                                type={showCurrent ? 'text' : 'password'}
                                value={currentPassword}
                                onChange={(e) => { setCurrentPassword(e.target.value); setError(''); }}
                                onKeyDown={handleKeyDown}
                                placeholder="Enter current password"
                                className="w-full bg-telegram-bg border border-telegram-border rounded-lg px-3 py-2.5 pr-10 text-sm text-telegram-text placeholder-telegram-subtext/40 outline-none focus:border-telegram-primary/50 transition-all"
                            />
                            <button
                                onClick={() => setShowCurrent(!showCurrent)}
                                className="absolute right-3 bottom-2.5 text-telegram-subtext hover:text-telegram-text"
                                tabIndex={-1}
                            >
                                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    )}

                    <div className="relative">
                        <label className="block text-xs text-telegram-subtext mb-1">New Password</label>
                        <input
                            type={showNew ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                            onKeyDown={handleKeyDown}
                            placeholder="Enter new password"
                            className="w-full bg-telegram-bg border border-telegram-border rounded-lg px-3 py-2.5 pr-10 text-sm text-telegram-text placeholder-telegram-subtext/40 outline-none focus:border-telegram-primary/50 transition-all"
                        />
                        <button
                            onClick={() => setShowNew(!showNew)}
                            className="absolute right-3 bottom-2.5 text-telegram-subtext hover:text-telegram-text"
                            tabIndex={-1}
                        >
                            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    <div className="relative">
                        <label className="block text-xs text-telegram-subtext mb-1">Confirm Password</label>
                        <input
                            type={showConfirm ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                            onKeyDown={handleKeyDown}
                            placeholder="Confirm new password"
                            className="w-full bg-telegram-bg border border-telegram-border rounded-lg px-3 py-2.5 pr-10 text-sm text-telegram-text placeholder-telegram-subtext/40 outline-none focus:border-telegram-primary/50 transition-all"
                        />
                        <button
                            onClick={() => setShowConfirm(!showConfirm)}
                            className="absolute right-3 bottom-2.5 text-telegram-subtext hover:text-telegram-text"
                            tabIndex={-1}
                        >
                            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    {error && (
                        <p className="text-xs text-red-400 text-center">{error}</p>
                    )}

                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 bg-telegram-primary/20 text-telegram-primary rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-telegram-primary/30 transition-all disabled:opacity-50"
                    >
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <KeyRound className="w-4 h-4" />
                        )}
                        {hasPassword ? 'Change Password' : 'Set Password'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
