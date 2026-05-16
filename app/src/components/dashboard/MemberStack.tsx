import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TelegramAvatar } from './TelegramAvatar';

interface Member {
    user_id: string;
    first_name: string;
    last_name?: string | null;
    photo_url?: string | null;
}

interface MemberStackProps {
    members: Member[];
    maxDisplay?: number;
    size?: 'sm' | 'md' | 'lg';
}

export function MemberStack({ members, maxDisplay = 3, size = 'md' }: MemberStackProps) {
    const [streamToken, setStreamToken] = useState<string>('');
    const displayMembers = members.slice(0, maxDisplay);
    const extraCount = members.length - maxDisplay;

    useEffect(() => {
        invoke<string>('cmd_get_stream_token').then(setStreamToken).catch(console.error);
    }, []);

    const sizeClasses = {
        sm: 'w-6 h-6 text-[10px]',
        md: 'w-8 h-8 text-xs',
        lg: 'w-10 h-10 text-sm'
    };

    const overlapClasses = {
        sm: '-ml-2',
        md: '-ml-3',
        lg: '-ml-4'
    };

    return (
        <div className="flex items-center">
            {displayMembers.map((member, index) => (
                <TelegramAvatar
                    key={member.user_id}
                    user={member}
                    token={streamToken}
                    size={size}
                    className={`${index > 0 ? overlapClasses[size] : ''}`}
                />
            ))}
            {extraCount > 0 && (
                <div
                    className={`${sizeClasses[size]} rounded-full border-2 border-telegram-surface bg-telegram-hover flex items-center justify-center text-telegram-subtext font-medium ${overlapClasses[size]} z-0`}
                >
                    +{extraCount}
                </div>
            )}
        </div>
    );
}
