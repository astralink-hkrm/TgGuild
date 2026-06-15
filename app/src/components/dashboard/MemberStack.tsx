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

    const memberName = (member: Member) => `${member.first_name} ${member.last_name || ''}`.trim();

    return (
        <div className="flex items-center">
            {displayMembers.map((member, index) => (
                <div key={member.user_id} className="relative group/avatar">
                    <TelegramAvatar
                        user={member}
                        token={streamToken}
                        size={size}
                        className={`${index > 0 ? overlapClasses[size] : ''}`}
                    />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-lg bg-telegram-text text-telegram-surface text-[11px] font-medium whitespace-nowrap opacity-0 group-hover/avatar:opacity-100 transition-opacity pointer-events-none shadow-lg z-50">
                        {memberName(member)}
                    </div>
                </div>
            ))}
            {extraCount > 0 && (
                <div
                    className={`${sizeClasses[size]} rounded-full border-2 border-telegram-surface bg-telegram-hover flex items-center justify-center text-telegram-subtext font-medium ${overlapClasses[size]} z-0`}
                    title={`${extraCount} more members`}
                >
                    +{extraCount}
                </div>
            )}
        </div>
    );
}
