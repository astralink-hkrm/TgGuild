import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import { Lock, Eye, EyeOff } from 'lucide-react';

interface LockScreenProps {
    onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setTimeout(() => inputRef.current?.focus(), 100);
    }, []);

    const handleUnlock = async () => {
        if (!password.trim()) {
            setError('Please enter your password');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const store = await load('settings.json');
            const storedHash = await store.get<string>('password_hash');
            if (!storedHash) {
                onUnlock();
                return;
            }

            const valid = await invoke<boolean>('cmd_verify_password', {
                password,
                hash: storedHash,
            });

            if (valid) {
                onUnlock();
            } else {
                setError('Incorrect password');
                setPassword('');
            }
        } catch {
            setError('Failed to verify password');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleUnlock();
    };

    return (
        <div className="h-full w-full auth-gradient flex flex-col items-center justify-center relative overflow-hidden">
            <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="relative z-10 flex flex-col items-center"
            >
                <div className="w-24 h-24 mb-6 relative">
                    <motion.div
                        animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                        className="absolute inset-0 bg-blue-500/30 rounded-full blur-2xl"
                    />
                    <img
                        src="/logo.png"
                        alt="TgGuild"
                        className="w-full h-full relative z-10 filter drop-shadow-2xl rounded-full"
                    />
                </div>

                <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">TgGuild</h1>
                <p className="text-sm text-blue-300/60 font-medium mb-8">App is locked</p>

                <div className="w-72 flex flex-col gap-3">
                    <div className="relative">
                        <input
                            ref={inputRef}
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                            onKeyDown={handleKeyDown}
                            placeholder="Enter password"
                            disabled={loading}
                            className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 pr-10 text-sm text-white placeholder-white/40 outline-none focus:border-blue-400/50 focus:bg-white/15 transition-all disabled:opacity-50"
                        />
                        <button
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
                            tabIndex={-1}
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    {error && (
                        <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-xs text-red-400 text-center"
                        >
                            {error}
                        </motion.p>
                    )}

                    <button
                        onClick={handleUnlock}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg px-4 py-3 text-sm transition-all disabled:opacity-50"
                    >
                        {loading ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Lock className="w-4 h-4" />
                        )}
                        {loading ? 'Unlocking...' : 'Unlock'}
                    </button>
                </div>
            </motion.div>

            <div className="fixed top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
        </div>
    );
}
