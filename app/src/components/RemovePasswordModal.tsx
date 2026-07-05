import { useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import { Lock, Eye, EyeOff, X, Loader2 } from 'lucide-react';

interface RemovePasswordModalProps {
    onClose: () => void;
    onRemoved: () => void;
}

export function RemovePasswordModal({ onClose, onRemoved }: RemovePasswordModalProps) {
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleRemove = async () => {
        if (!password.trim()) {
            setError('Please enter your current password');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const store = await load('settings.json');
            const storedHash = await store.get<string>('password_hash');

            if (!storedHash) {
                setError('No password set');
                setLoading(false);
                return;
            }

            const valid = await invoke<boolean>('cmd_verify_password', {
                password,
                hash: storedHash,
            });

            if (!valid) {
                setError('Incorrect password');
                setLoading(false);
                return;
            }

            await store.delete('password_hash');
            await store.save();
            onRemoved();
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-telegram-surface border border-telegram-border rounded-xl w-[360px] shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-4 border-b border-telegram-border flex items-center justify-between">
                    <h3 className="text-telegram-text font-medium">Remove Password</h3>
                    <button onClick={onClose} className="text-telegram-subtext hover:text-telegram-text">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 flex flex-col gap-3">
                    <p className="text-xs text-telegram-subtext">
                        Enter your current password to remove the app lock.
                    </p>

                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !loading) handleRemove(); }}
                            placeholder="Current password"
                            className="w-full bg-telegram-bg border border-telegram-border rounded-lg px-3 py-2.5 pr-10 text-sm text-telegram-text placeholder-telegram-subtext/40 outline-none focus:border-telegram-primary/50 transition-all"
                        />
                        <button
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-telegram-subtext hover:text-telegram-text"
                            tabIndex={-1}
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    {error && (
                        <p className="text-xs text-red-400 text-center">{error}</p>
                    )}

                    <button
                        onClick={handleRemove}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 bg-red-500/20 text-red-400 rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-red-500/30 transition-all disabled:opacity-50"
                    >
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Lock className="w-4 h-4" />
                        )}
                        {loading ? 'Removing...' : 'Remove Password'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
