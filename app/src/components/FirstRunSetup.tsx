import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { WorkspaceVisibilityModal } from './dashboard/WorkspaceVisibilityModal';
import { saveWorkspacePrefs, WorkspacePrefs } from './dashboard/workspaceVisibility';

interface TeamItem {
    id: number;
    name: string;
    username: string | null;
    member_count: number;
}

interface ContactItem {
    user_id: string;
    first_name: string;
    last_name?: string | null;
    username?: string | null;
    phone?: string | null;
}

interface DriveItem {
    id: number;
    name: string;
    username: string | null;
    member_count: number;
}

interface FirstRunSetupProps {
    onComplete: () => void;
}

export function FirstRunSetup({ onComplete }: FirstRunSetupProps) {
    const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
    const [statusText, setStatusText] = useState('Scanning your workspace...');
    const [teams, setTeams] = useState<TeamItem[]>([]);
    const [contacts, setContacts] = useState<ContactItem[]>([]);
    const [drives, setDrives] = useState<DriveItem[]>([]);
    const [prefs, setPrefs] = useState<WorkspacePrefs | null>(null);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    useEffect(() => {
        const scan = async () => {
            try {
                setStatusText('Discovering drives...');
                const driveResp = await invoke<DriveItem[]>('cmd_scan_folders', { selectiveIds: null });
                if (!mounted.current) return;

                setStatusText('Loading groups...');
                const groupResp = await invoke<{ teams: TeamItem[] }>('cmd_get_teams');
                if (!mounted.current) return;

                setStatusText('Loading contacts...');
                const contactResp = await invoke<{ chats: ContactItem[] }>('cmd_get_direct_chats');
                if (!mounted.current) return;

                const initialPrefs: WorkspacePrefs = {
                    firstRunCompleted: false,
                    visibleDrives: [],
                    visibleGroups: [],
                    visibleDMs: [],
                    performanceMode: false,
                };

                setDrives(driveResp);
                setTeams(groupResp.teams);
                setContacts(contactResp.chats);
                setPrefs(initialPrefs);
                setPhase('ready');
            } catch (e) {
                if (!mounted.current) return;
                setStatusText(`Setup failed: ${e}`);
            }
        };
        scan();
    }, []);

    const handleSave = async (savedPrefs: WorkspacePrefs) => {
        await saveWorkspacePrefs(savedPrefs);
        onComplete();
    };

    if (phase === 'loading') {
        return (
            <div className="h-full w-full auth-gradient flex flex-col items-center justify-center relative overflow-hidden">
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="relative z-10 flex flex-col items-center"
                >
                    <div className="w-24 h-24 mb-8 relative">
                        <motion.div
                            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                            className="absolute inset-0 bg-blue-500/30 rounded-full blur-2xl"
                        />
                        <img
                            src="/logo.png"
                            alt="TgGuild"
                            className="w-full h-full relative z-10 filter drop-shadow-2xl rounded-full"
                        />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">TgGuild</h1>
                    <div className="flex items-center gap-2 text-blue-300/60 font-medium text-sm">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                            className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full"
                        />
                        {statusText}
                    </div>
                </motion.div>
                <div className="fixed top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
                <div className="fixed bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
            </div>
        );
    }

    return (
        <div className="h-full w-full flex items-center justify-center bg-telegram-bg">
            <WorkspaceVisibilityModal
                teams={teams}
                contacts={contacts}
                drives={drives}
                prefs={prefs!}
                mode="setup"
                onClose={onComplete}
                onSave={handleSave}
            />
        </div>
    );
}
