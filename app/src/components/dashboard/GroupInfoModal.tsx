import { useState, useEffect } from 'react';
import { X, Copy, Check, Hash, CalendarDays, Users, Info, Edit3, Save, Loader2, Link } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { formatDateOnly } from '../../utils';

interface TeamFullInfo {
    id: number;
    name: string;
    description: string;
    creation_date: string;
    member_count: number;
    invite_link: string | null;
    is_channel: boolean;
    is_supergroup: boolean;
    can_edit_info: boolean;
}

interface GroupInfoModalProps {
    groupId: number;
    groupName: string;
    onClose: () => void;
}

export function GroupInfoModal({ groupId, groupName, onClose }: GroupInfoModalProps) {
    const [info, setInfo] = useState<TeamFullInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [copiedTgguild, setCopiedTgguild] = useState(false);
    const [editingDesc, setEditingDesc] = useState(false);
    const [editDescription, setEditDescription] = useState('');
    const [saving, setSaving] = useState(false);
    const [tgguildLink, setTgguildLink] = useState<string | null>(null);

    useEffect(() => {
        invoke<TeamFullInfo>('cmd_get_team_full_info', { teamId: groupId })
            .then(data => {
                setInfo(data);
                // Convert Telegram link to TGGuild deep link
                if (data.invite_link) {
                    invoke<string>('cmd_to_tgguild_invite_link', { telegramLink: data.invite_link })
                        .then(setTgguildLink)
                        .catch(() => setTgguildLink(null));
                }
            })
            .catch((e) => toast.error(`Failed to load group info: ${e}`))
            .finally(() => setLoading(false));
    }, [groupId]);

    const handleCopyLink = async () => {
        const linkToCopy = tgguildLink || info?.invite_link;
        if (!linkToCopy) return;
        try {
            await navigator.clipboard.writeText(linkToCopy);
            setCopied(true);
            toast.success('Invite link copied');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy');
        }
    };

    const handleCopyTgguildLink = async () => {
        if (!tgguildLink) return;
        try {
            await navigator.clipboard.writeText(tgguildLink);
            setCopiedTgguild(true);
            toast.success('TGGuild invite link copied');
            setTimeout(() => setCopiedTgguild(false), 2000);
        } catch {
            toast.error('Failed to copy');
        }
    };

    const startEditing = () => {
        setEditDescription(info?.description || '');
        setEditingDesc(true);
    };

    const cancelEditing = () => {
        setEditingDesc(false);
        setEditDescription('');
    };

    const saveDescription = async () => {
        if (!info) return;
        setSaving(true);
        try {
            await invoke('cmd_edit_team', {
                teamId: groupId,
                newName: null,
                newDescription: editDescription,
            });
            toast.success('Description updated');
            setInfo({ ...info, description: editDescription });
            setEditingDesc(false);
        } catch (e) {
            toast.error(`Failed to update description: ${e}`);
        } finally {
            setSaving(false);
        }
    };

    const groupType = info?.is_channel
        ? info?.is_supergroup ? 'Supergroup (Broadcast)' : 'Channel'
        : info?.is_supergroup ? 'Supergroup' : 'Group';

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="w-full max-w-lg overflow-hidden rounded-xl border border-telegram-border bg-telegram-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-telegram-border p-4">
                    <div>
                        <h3 className="text-base font-semibold text-telegram-text">Group Info</h3>
                        <p className="text-xs text-telegram-subtext">{info?.name || groupName}</p>
                    </div>
                    <button onClick={onClose} className="rounded-full p-2 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16 text-sm text-telegram-subtext">Loading group info...</div>
                ) : info ? (
                    <div className="max-h-[480px] overflow-y-auto p-4 custom-scrollbar space-y-4">
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-telegram-hover/50">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-telegram-primary/10 text-telegram-primary">
                                <Info className="h-6 w-6" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-telegram-text">{info.name}</p>
                                <p className="text-xs text-telegram-subtext">{groupType}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-3 rounded-xl bg-telegram-hover/30 p-3">
                                <Users className="h-5 w-5 text-telegram-primary" />
                                <div>
                                    <p className="text-xs text-telegram-subtext">Members</p>
                                    <p className="text-sm font-medium text-telegram-text">{info.member_count}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 rounded-xl bg-telegram-hover/30 p-3">
                                <CalendarDays className="h-5 w-5 text-telegram-primary" />
                                <div>
                                    <p className="text-xs text-telegram-subtext">Created</p>
                                    <p className="text-sm font-medium text-telegram-text">{formatDateOnly(info.creation_date)}</p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl bg-telegram-hover/30 p-3">
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-xs text-telegram-subtext">Description</p>
                                {info.can_edit_info && !editingDesc && (
                                    <button onClick={startEditing} className="flex items-center gap-1 text-xs text-telegram-primary hover:underline">
                                        <Edit3 className="w-3 h-3" />
                                        Edit
                                    </button>
                                )}
                            </div>
                            {editingDesc ? (
                                <div className="space-y-2">
                                    <textarea
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                        className="w-full rounded-lg bg-telegram-surface border border-telegram-border px-3 py-2 text-sm text-telegram-text outline-none resize-none min-h-[80px] focus:border-telegram-primary/50 transition-colors"
                                        placeholder="Add a description..."
                                        rows={3}
                                        autoFocus
                                    />
                                    <div className="flex items-center justify-end gap-2">
                                        <button onClick={cancelEditing} className="rounded-lg px-3 py-1.5 text-xs text-telegram-subtext hover:bg-telegram-hover transition-colors" disabled={saving}>
                                            Cancel
                                        </button>
                                        <button onClick={saveDescription} className="rounded-lg bg-telegram-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-telegram-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1" disabled={saving}>
                                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                            Save
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-telegram-text whitespace-pre-wrap break-words">
                                    {info.description || (info.can_edit_info ? 'No description set. Click Edit to add one.' : 'No description')}
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-3 rounded-xl bg-telegram-hover/30 p-3">
                            <Hash className="h-5 w-5 text-telegram-subtext" />
                            <div className="min-w-0 flex-1">
                                <p className="text-xs text-telegram-subtext">ID</p>
                                <p className="text-sm font-mono text-telegram-text truncate">{info.id}</p>
                            </div>
                        </div>

                        {info.invite_link && (
                            <div className="rounded-xl bg-telegram-hover/50 p-3 space-y-3">
                                <p className="text-xs text-telegram-subtext">Invite Links</p>
                                {/* TGGuild deep link — primary */}
                                {tgguildLink && (
                                    <div>
                                        <p className="text-[10px] text-telegram-primary mb-1 flex items-center gap-1">
                                            <Link className="w-3 h-3" /> TGGuild Link
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                readOnly
                                                value={tgguildLink}
                                                className="flex-1 rounded-lg bg-telegram-surface border border-telegram-border px-3 py-2 text-sm text-telegram-text outline-none font-mono text-xs"
                                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                            />
                                            <button
                                                onClick={handleCopyTgguildLink}
                                                className="rounded-lg bg-telegram-primary/10 p-2 text-telegram-primary hover:bg-telegram-primary/20 transition-colors"
                                                title="Copy TGGuild link"
                                            >
                                                {copiedTgguild ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {/* Telegram link */}
                                <div>
                                    <p className="text-[10px] text-telegram-subtext mb-1">Telegram Link</p>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={info.invite_link}
                                            className="flex-1 rounded-lg bg-telegram-surface border border-telegram-border px-3 py-2 text-sm text-telegram-text outline-none"
                                            onClick={(e) => (e.target as HTMLInputElement).select()}
                                        />
                                        <button
                                            onClick={handleCopyLink}
                                            className="rounded-lg bg-telegram-primary/10 p-2 text-telegram-primary hover:bg-telegram-primary/20 transition-colors"
                                            title="Copy link"
                                        >
                                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center justify-center py-16 text-sm text-red-400">Failed to load group info</div>
                )}
            </div>
        </div>
    );
}
