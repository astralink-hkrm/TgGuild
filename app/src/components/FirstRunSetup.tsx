import { useState, useEffect, useRef } from 'react';
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
    const [teams, setTeams] = useState<TeamItem[]>([]);
    const [contacts, setContacts] = useState<ContactItem[]>([]);
    const [drives, setDrives] = useState<DriveItem[]>([]);
    const [isScanning, setIsScanning] = useState(true);
    const prefs: WorkspacePrefs = {
        firstRunCompleted: false,
        visibleDrives: [],
        visibleGroups: [],
        visibleDMs: [],
        performanceMode: true,
    };
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    useEffect(() => {
        const scan = async () => {
            try {
                const [driveResp, groupResp, contactResp] = await Promise.all([
                    invoke<DriveItem[]>('cmd_scan_folders', { selectiveIds: null }),
                    invoke<{ teams: TeamItem[] }>('cmd_get_teams'),
                    invoke<{ chats: ContactItem[] }>('cmd_get_direct_chats'),
                ]);
                if (!mounted.current) return;
                setDrives(driveResp);
                setTeams(groupResp.teams);
                setContacts(contactResp.chats);
            } catch {
                // Data will remain empty
            } finally {
                if (mounted.current) setIsScanning(false);
            }
        };
        scan();
    }, []);

    const hasData = drives.length > 0 || teams.length > 0 || contacts.length > 0;

    const handleSave = async (savedPrefs: WorkspacePrefs) => {
        await saveWorkspacePrefs(savedPrefs);
        onComplete();
    };

    return (
        <div className="h-full w-full flex items-center justify-center bg-telegram-bg">
            <WorkspaceVisibilityModal
                teams={teams}
                contacts={contacts}
                drives={drives}
                prefs={prefs}
                mode="setup"
                loading={isScanning}
                hasData={hasData}
                onClose={onComplete}
                onSave={handleSave}
            />
        </div>
    );
}
