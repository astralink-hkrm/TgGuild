import { memo, useMemo } from 'react';
import { DownloadItem, BatchDownload } from '../../types';
import { Check, X, AlertCircle, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
}

interface BatchDownloadCardProps {
    batch: BatchDownload;
    aggregate: {
        percent: number;
        completed: number;
        failed: number;
        active: number;
        totalBytes: number;
        uploadedBytes: number;
        speedBytesPerSec: number;
        total: number;
    };
    onCancelBatch: (batchId: string) => void;
    onToggleExpand: (batchId: string) => void;
    onCancelItem: (id: string) => void;
    onRetryItem: (id: string) => void;
}

export const BatchDownloadCard = memo(function BatchDownloadCard({
    batch,
    aggregate,
    onCancelBatch,
    onToggleExpand,
    onCancelItem,
    onRetryItem,
}: BatchDownloadCardProps) {
    const isCancelling = batch.status === 'cancelled';
    const isActive = batch.status === 'downloading';
    const isCompleted = batch.status === 'completed';

    // Compute folder groups from items' targetPath
    const fileGroups = useMemo(() => {
        const map = new Map<string, DownloadItem[]>();
        for (const item of batch.items) {
            if (!item.targetPath) {
                const key = '';
                if (!map.has(key)) map.set(key, []);
                map.get(key)!.push(item);
                continue;
            }
            const rel = item.targetPath.substring(batch.dirPath.length).replace(/^[/\\]/, '');
            const lastSep = Math.max(rel.lastIndexOf('/'), rel.lastIndexOf('\\'));
            const folder = lastSep >= 0 ? rel.substring(0, lastSep) : '';
            if (!map.has(folder)) map.set(folder, []);
            map.get(folder)!.push(item);
        }
        return Array.from(map.entries())
            .map(([folder, fileItems]) => ({ folder, items: fileItems }))
            .sort((a, b) => a.folder.localeCompare(b.folder));
    }, [batch.items, batch.dirPath]);

    const folderCount = fileGroups.filter(g => g.folder).length;

    return (
        <div className="flex flex-col p-2 bg-telegram-hover rounded">
            {/* Summary row */}
            <div className="flex items-center gap-3 text-sm">
                <div className="flex-shrink-0">
                    {isActive && (
                        <div className="w-4 h-4 rounded-full border-2 border-telegram-secondary border-t-transparent animate-spin" />
                    )}
                    {isCompleted && (
                        <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center">
                            <Check className="w-3 h-3 text-green-500" />
                        </div>
                    )}
                    {isCancelling && (
                        <div className="w-4 h-4 rounded-full bg-gray-500/20 flex items-center justify-center">
                            <X className="w-3 h-3 text-gray-400" />
                        </div>
                    )}
                </div>
                <div className="flex-1 truncate text-telegram-subtext text-xs">
                    <span className="font-medium text-telegram-text">
                        Downloading Folder: {batch.folderName}
                    </span>
                </div>
                <span className="text-xs font-bold text-telegram-primary">
                    {aggregate.percent}%
                </span>
            </div>

            {/* Progress bar (byte-weighted) */}
            <div className="w-full bg-telegram-border h-1 mt-2 rounded-full overflow-hidden">
                <div
                    className="bg-telegram-secondary h-full rounded-full transition-all duration-300"
                    style={{ width: `${aggregate.percent}%` }}
                />
            </div>

            {/* Stats row */}
            <div className="flex justify-between text-[10px] text-telegram-subtext mt-1">
                <div className="flex gap-2">
                    <span>{aggregate.completed} / {aggregate.total} files</span>
                    {folderCount > 0 && (
                        <span className="text-telegram-subtext">{folderCount} folders</span>
                    )}
                    {aggregate.failed > 0 && (
                        <span className="text-red-400">{aggregate.failed} failed</span>
                    )}
                </div>
                <span>
                    {aggregate.totalBytes > 0
                        ? `${formatBytes(aggregate.uploadedBytes)} / ${formatBytes(aggregate.totalBytes)}`
                        : ''}
                    {aggregate.speedBytesPerSec > 0 && ` · ${formatBytes(aggregate.speedBytesPerSec)}/s`}
                </span>
            </div>

            {/* Duration for completed */}
            {isCompleted && (
                <div className="text-[10px] text-telegram-subtext mt-0.5">
                    Completed in {formatDuration(Date.now() - batch.startedAt)}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-1.5">
                {isActive && (
                    <button
                        onClick={() => onCancelBatch(batch.batchId)}
                        className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                    >
                        Cancel All
                    </button>
                )}
                <button
                    onClick={() => onToggleExpand(batch.batchId)}
                    className="text-[10px] text-telegram-primary hover:text-telegram-text transition-colors flex items-center gap-0.5"
                >
                    {batch.expanded ? (
                        <>Hide Details <ChevronUp className="w-2.5 h-2.5" /></>
                    ) : (
                        <>Show Details <ChevronDown className="w-2.5 h-2.5" /></>
                    )}
                </button>
            </div>

            {/* Expanded: per-file progress grouped by folder */}
            {batch.expanded && (
                <div className="mt-2 pt-2 border-t border-telegram-border space-y-1.5">
                    {fileGroups.map(group => (
                        <div key={group.folder}>
                            {group.folder && (
                                <div className="text-[10px] font-medium text-telegram-subtext/70 pb-0.5">
                                    {group.folder}/
                                </div>
                            )}
                            <div className={group.folder ? 'ml-3 space-y-1.5' : 'space-y-1.5'}>
                                {group.items.map(item => (
                                    <PerFileRow
                                        key={item.id}
                                        item={item}
                                        onCancel={onCancelItem}
                                        onRetry={onRetryItem}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
});

interface PerFileRowProps {
    item: DownloadItem;
    onCancel: (id: string) => void;
    onRetry: (id: string) => void;
}

const PerFileRow = memo(function PerFileRow({ item, onCancel, onRetry }: PerFileRowProps) {
    return (
        <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 text-xs">
                <div className="flex-shrink-0">
                    {item.status === 'pending' && (
                        <div className="w-3 h-3 rounded-full bg-yellow-500/20 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
                        </div>
                    )}
                    {item.status === 'downloading' && (
                        <div className="w-3 h-3 rounded-full border-2 border-telegram-secondary border-t-transparent animate-spin" />
                    )}
                    {item.status === 'success' && (
                        <div className="w-3 h-3 rounded-full bg-green-500/20 flex items-center justify-center">
                            <Check className="w-2 h-2 text-green-500" />
                        </div>
                    )}
                    {item.status === 'error' && (
                        <div className="w-3 h-3 rounded-full bg-red-500/20 flex items-center justify-center">
                            <AlertCircle className="w-2 h-2 text-red-500" />
                        </div>
                    )}
                    {item.status === 'cancelled' && (
                        <div className="w-3 h-3 rounded-full bg-gray-500/20 flex items-center justify-center">
                            <X className="w-2 h-2 text-gray-400" />
                        </div>
                    )}
                </div>
                <div className="flex-1 truncate text-telegram-subtext" title={item.filename}>
                    {item.filename}
                </div>
                {(item.status === 'downloading' || item.status === 'pending') && (
                    <button
                        onClick={() => onCancel(item.id)}
                        className="text-gray-400 hover:text-red-400 transition-colors flex-shrink-0"
                        title="Cancel"
                    >
                        <X className="w-3 h-3" />
                    </button>
                )}
                {(item.status === 'error' || item.status === 'cancelled') && (
                    <button
                        onClick={() => onRetry(item.id)}
                        className="text-gray-400 hover:text-blue-400 transition-colors flex-shrink-0"
                        title="Retry"
                    >
                        <RotateCcw className="w-3 h-3" />
                    </button>
                )}
            </div>
            {item.status === 'downloading' && (
                <div className="flex items-center gap-2 ml-5">
                    <div className="flex-1 bg-telegram-border h-1 rounded-full overflow-hidden">
                        {item.progress !== undefined ? (
                            <div
                                className="bg-telegram-secondary h-full rounded-full transition-all duration-300"
                                style={{ width: `${item.progress}%` }}
                            />
                        ) : (
                            <div className="bg-telegram-secondary h-full w-full animate-progress-indeterminate" />
                        )}
                    </div>
                    <span className="text-[9px] text-telegram-subtext whitespace-nowrap">
                        {item.progress !== undefined ? `${item.progress}%` : ''}
                    </span>
                </div>
            )}
            {item.status === 'pending' && (
                <div className="text-[9px] text-yellow-500/60 ml-5">Pending</div>
            )}
            {item.status === 'error' && item.error && (
                <div className="flex items-center gap-1 text-[9px] text-red-400 ml-5">
                    <AlertCircle className="w-2 h-2 flex-shrink-0" />
                    <span className="truncate">{item.error}</span>
                </div>
            )}
            {item.status === 'cancelled' && (
                <div className="text-[9px] text-gray-400 ml-5">Cancelled</div>
            )}
            {item.status === 'success' && (
                <div className="text-[9px] text-green-500/60 ml-5">Completed</div>
            )}
        </div>
    );
});
