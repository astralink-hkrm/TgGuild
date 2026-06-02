import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Film, Music, X, RotateCcw } from 'lucide-react';
import { OpeningProgress } from '../../types';
import { isVideoFile } from '../../utils';

interface OpeningOverlayProps {
    progress: OpeningProgress | null;
    onCancel: () => void;
    onRetry: (messageId: number, filename: string, folderId: number | null) => void;
}

function formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec === 0) return '';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s'];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    return `${(bytesPerSec / Math.pow(k, i)).toFixed(1)} ${sizes[Math.min(i, sizes.length - 1)]}`;
}

export const OpeningOverlay = memo(function OpeningOverlay({ progress, onCancel, onRetry }: OpeningOverlayProps) {
    return (
        <AnimatePresence>
            {progress && (
                <motion.div
                    className="w-80 bg-telegram-surface border border-telegram-border rounded-xl shadow-2xl overflow-hidden"
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                    {/* Row 1: icon + filename + percent + cancel */}
                    <div className="flex items-center gap-2 p-2 pb-1">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-telegram-secondary/10 flex items-center justify-center">
                            {progress.phase === 'error' ? (
                                <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
                                    <X className="w-3 h-3 text-red-400" />
                                </div>
                            ) : isVideoFile(progress.filename) ? (
                                <Film className="w-3.5 h-3.5 text-telegram-secondary" />
                            ) : (
                                <Music className="w-3.5 h-3.5 text-telegram-secondary" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-telegram-text truncate" title={progress.filename}>
                                {progress.filename}
                            </p>
                        </div>
                        {progress.phase === 'downloading' && (
                            <>
                                <span className="text-xs text-telegram-subtext flex-shrink-0">{progress.percent}%</span>
                                <button
                                    onClick={onCancel}
                                    className="flex-shrink-0 p-1 rounded-md text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                    title="Cancel"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </>
                        )}
                    </div>

                    {/* Progress bar + speed (only during downloading) */}
                    {progress.phase === 'downloading' && (
                        <div className="px-2 pb-2 flex flex-col gap-0.5">
                            <div className="w-full bg-telegram-border h-1 rounded-full overflow-hidden">
                                <motion.div
                                    className="bg-telegram-secondary h-full rounded-full"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress.percent}%` }}
                                    transition={{ duration: 0.3, ease: 'easeOut' }}
                                />
                            </div>
                            {progress.speedBytesPerSec > 0 && (
                                <span className="text-[10px] text-telegram-subtext">{formatSpeed(progress.speedBytesPerSec)}</span>
                            )}
                        </div>
                    )}

                    {/* Launching text */}
                    {progress.phase === 'launching' && (
                        <p className="px-2 pb-2 text-[10px] text-telegram-subtext">Opening with system app...</p>
                    )}

                    {/* Error state */}
                    {progress.phase === 'error' && (
                        <div className="px-2 pb-2 flex flex-col gap-1.5">
                            <p className="text-[10px] text-red-400">{progress.error || 'Failed to open file'}</p>
                            <div className="flex gap-1.5">
                                <button
                                    onClick={onCancel}
                                    className="flex-1 px-2 py-1 text-[10px] rounded-md border border-telegram-border text-telegram-subtext hover:bg-telegram-hover transition-colors"
                                >
                                    Dismiss
                                </button>
                                <button
                                    onClick={() => onRetry(progress.messageId, progress.filename, progress.folderId)}
                                    className="flex-1 px-2 py-1 text-[10px] rounded-md bg-telegram-secondary text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    Retry
                                </button>
                            </div>
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
});
