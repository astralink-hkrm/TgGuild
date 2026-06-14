export function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function parseDate(dateStr: string): Date {
    const trimmed = dateStr.trim();
    const hasTimezone = /Z$|[+-]\d{2}:\d{2}$|\sUTC$/i.test(trimmed);
    const normalized = trimmed.replace(/\sUTC$/, 'Z');
    const iso = normalized.includes('T') ? normalized : normalized.replace(' ', 'T');
    const parsed = new Date(hasTimezone ? iso : iso + 'Z');
    return parsed;
}

export function formatTime(dateStr: string): string {
    const parsed = parseDate(dateStr);
    if (Number.isNaN(parsed.getTime())) {
        return dateStr.split(' ')[1]?.slice(0, 5) || dateStr;
    }
    return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateSeparator(dateStr: string): string {
    const parsed = parseDate(dateStr);
    if (Number.isNaN(parsed.getTime())) {
        const key = dateStr.split(' ')[0] || dateStr;
        return key;
    }

    const sameDayKey = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const key = sameDayKey(parsed);

    if (key === sameDayKey(today)) return 'Today';
    if (key === sameDayKey(yesterday)) return 'Yesterday';

    return parsed.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: parsed.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    });
}

export function dateKey(dateStr: string): string {
    const parsed = parseDate(dateStr);
    if (Number.isNaN(parsed.getTime())) {
        return dateStr.split(' ')[0] || dateStr;
    }
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatDateOnly(dateStr: string): string {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    if (!y || !m || !d) return dateStr;
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    });
}

export function formatDisplayDate(value?: string | null) {
    if (!value) return '-';

    const parsed = parseDate(value);
    if (Number.isNaN(parsed.getTime())) return value;

    const sameDayKey = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const time = parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (sameDayKey(parsed) === sameDayKey(today)) return `Today, ${time}`;
    if (sameDayKey(parsed) === sameDayKey(yesterday)) return `Yesterday, ${time}`;

    return parsed.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: parsed.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    });
}

// ── File type classification ────────────────────────────────────────────

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'] as const;
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'aac', 'flac', 'm4a', 'opus'] as const;
const MEDIA_EXTENSIONS: readonly string[] = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'] as const;

const endsWithAny = (name: string, exts: readonly string[]) => {
    const lower = name.toLowerCase();
    return exts.some(ext => lower.endsWith(ext));
};

export const isMediaFile   = (name: string) => endsWithAny(name, MEDIA_EXTENSIONS);
export const isVideoFile   = (name: string) => endsWithAny(name, VIDEO_EXTENSIONS);
export const isAudioFile   = (name: string) => endsWithAny(name, AUDIO_EXTENSIONS);
export const isImageFile   = (name: string) => endsWithAny(name, IMAGE_EXTENSIONS);
export const isPdfFile     = (name: string) => name.toLowerCase().endsWith('.pdf');
