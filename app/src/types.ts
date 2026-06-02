export interface TelegramFile {
    id: number;
    folder_id?: number | null;
    virtual_folder_id?: number | null;
    parent_virtual_folder_id?: number | null;
    current_id?: number | null;
    name: string;
    size: number;
    sizeStr: string; // Formatted size
    created_at?: string;
    type?: 'folder' | 'file'; // implied icon_type
    // Add other fields if backend sends them
}

export interface TelegramFolder {
    id: number;
    name: string;
    parent_id?: number;
    current_id?: number;
    member_count?: number;
    top_members?: any[];
}

export interface QueueItem {
    id: string;
    path: string;
    folderId: number | null;
    virtualFolderId?: number | null;
    status: 'pending' | 'uploading' | 'success' | 'error' | 'cancelled';
    error?: string;
    progress?: number; // 0-100
    uploadedBytes?: number;
    totalBytes?: number;
    speedBytesPerSec?: number;
}

export interface BandwidthStats {
    up_bytes: number;
    down_bytes: number;
}

export interface DownloadItem {
    id: string;
    batchId?: string;
    targetPath?: string;
    messageId: number;
    filename: string;
    folderId: number | null;
    status: 'pending' | 'downloading' | 'success' | 'error' | 'cancelled';
    error?: string;
    progress?: number; // 0-100
    uploadedBytes?: number;
    totalBytes?: number;
    speedBytesPerSec?: number;
}

export interface BatchDownload {
    batchId: string;
    dirPath: string;
    folderName: string;
    items: DownloadItem[];
    status: 'downloading' | 'completed' | 'cancelled' | 'error';
    expanded: boolean;
    errorCount: number;
    startedAt: number;
}

export interface OpeningProgress {
    filename: string;
    messageId: number;
    folderId: number | null;
    transferId: string;
    phase: 'downloading' | 'launching' | 'error';
    percent: number;
    speedBytesPerSec: number;
    error?: string;
}

export interface FolderTreeNode {
    id: number;
    name: string;
    children: FolderTreeNode[];
}

