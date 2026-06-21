import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';

interface VoiceMessageProps {
    streamUrl: string | null;
    duration?: number | null;
    pending?: boolean;
}

function formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceMessage({ streamUrl, duration, pending }: VoiceMessageProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [audioDuration, setAudioDuration] = useState(duration || 0);
    const [error, setError] = useState(false);
    const progressRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number>(0);

    const updateTime = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || audio.paused) return;
        setCurrentTime(audio.currentTime);
        rafRef.current = requestAnimationFrame(updateTime);
    }, []);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || pending || !streamUrl) return;

        const onPlay = () => {
            setPlaying(true);
            rafRef.current = requestAnimationFrame(updateTime);
        };
        const onPause = () => {
            setPlaying(false);
            cancelAnimationFrame(rafRef.current);
        };
        const onEnded = () => {
            setPlaying(false);
            setCurrentTime(0);
            cancelAnimationFrame(rafRef.current);
        };
        const onLoadedMetadata = () => {
            if (audio.duration && isFinite(audio.duration)) {
                setAudioDuration(audio.duration);
            }
        };
        const onError = () => {
            setError(true);
            setPlaying(false);
            cancelAnimationFrame(rafRef.current);
        };

        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('error', onError);

        return () => {
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            audio.removeEventListener('error', onError);
            cancelAnimationFrame(rafRef.current);
        };
    }, [streamUrl, pending, updateTime]);

    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || error) return;
        if (playing) {
            audio.pause();
        } else {
            audio.play().catch(() => setError(true));
        }
    }, [playing, error]);

    const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const audio = audioRef.current;
        if (!audio || !audio.readyState) return;
        const rect = progressRef.current?.getBoundingClientRect();
        if (!rect) return;
        const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const seekTime = fraction * (audio.duration || audioDuration || 1);
        audio.currentTime = seekTime;
        setCurrentTime(seekTime);
    }, [audioDuration]);

    const totalDuration = audioDuration || duration || 0;
    const displayDuration = totalDuration > 0 ? totalDuration : 0;
    const progress = displayDuration > 0 ? (currentTime / displayDuration) * 100 : 0;

    if (error) {
        return (
            <div className="flex items-center gap-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-400 min-w-56">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
                    <Play className="w-4 h-4 ml-0.5" />
                </span>
                <span>Playback unavailable</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3 min-w-56 max-w-full">
            <audio
                ref={audioRef}
                src={streamUrl || undefined}
                preload="auto"
                crossOrigin="anonymous"
                className="hidden"
            />
            <button
                onClick={togglePlay}
                disabled={pending || !streamUrl}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-telegram-primary text-white hover:bg-telegram-primary/90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
                {playing ? (
                    <Pause className="w-4 h-4" />
                ) : (
                    <Play className="w-4 h-4 ml-0.5" />
                )}
            </button>

            <div className="flex-1 min-w-0">
                <div
                    ref={progressRef}
                    onClick={handleSeek}
                    className="relative h-10 flex items-center cursor-pointer group"
                >
                    <div className="relative w-full h-1 rounded-full bg-telegram-hover overflow-hidden">
                        <div
                            className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-telegram-primary to-amber-500"
                            style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                        <div
                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-telegram-primary opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                            style={{ left: `calc(${Math.min(progress, 100)}% - 6px)` }}
                        />
                    </div>
                </div>
                <div className="flex justify-between text-[11px] text-telegram-subtext mt-0.5">
                    <span>{formatTime(currentTime)}</span>
                    <span>{displayDuration > 0 ? formatTime(displayDuration) : ''}</span>
                </div>
            </div>
        </div>
    );
}
