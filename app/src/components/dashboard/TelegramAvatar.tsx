import { useEffect, useState } from 'react';

export interface AvatarUser {
    user_id: string | number;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    photo_url?: string | null;
}

interface TelegramAvatarProps {
    user: AvatarUser;
    token?: string;
    baseUrl?: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
};

const colors = [
    'bg-[#ff516a]',
    'bg-[#ffa85c]',
    'bg-[#8e85ee]',
    'bg-[#70d05b]',
    'bg-[#64d9f3]',
    'bg-[#3ca5f0]',
    'bg-[#ff6c9a]',
];

function getInitial(user: AvatarUser) {
    const name = user.first_name || user.username || '?';
    return name.trim().charAt(0).toUpperCase() || '?';
}

function getBgColor(id: string | number) {
    const strId = String(id);
    const numId = parseInt(strId.slice(-4), 10) || 0;
    return colors[numId % colors.length];
}

export function TelegramAvatar({ user, token, baseUrl = 'http://localhost:14201', size = 'md', className = '' }: TelegramAvatarProps) {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);
    const userId = String(user.user_id);
    
    // Only attempt to load if we have a token AND the user actually has a photo
    const avatarUrl = token && !imageFailed && user.photo_url
        ? `${baseUrl}/avatar/${userId}?token=${token}`
        : null;

    useEffect(() => {
        setImageLoaded(false);
        setImageFailed(false);
    }, [userId, token]);

    return (
        <div
            className={`${sizeClasses[size]} rounded-full border-2 border-telegram-surface overflow-hidden relative flex-shrink-0 ${className}`}
            title={`${user.first_name || ''} ${user.last_name || ''}`.trim()}
        >
            <div className={`absolute inset-0 flex items-center justify-center text-white font-semibold ${getBgColor(user.user_id)}`}>
                {getInitial(user)}
            </div>
            {avatarUrl && (
                <img
                    src={avatarUrl}
                    alt=""
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                    onLoad={() => setImageLoaded(true)}
                    onError={() => setImageFailed(true)}
                />
            )}
        </div>
    );
}
