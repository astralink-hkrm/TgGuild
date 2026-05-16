import { useState, useRef, useEffect } from 'react';
import { Plus, Pencil, Check } from 'lucide-react';
import { MemberStack } from './MemberStack';

interface SidebarItemProps {
    icon: React.ElementType;
    label: string;
    active: boolean;
    onClick: () => void;
    onDrop: (e: React.DragEvent) => void;
    onDelete?: () => void;
    onRename?: (newName: string) => void;
    folderId: number | null;
    memberCount?: number;
    topMembers?: any[];
}

export function SidebarItem({ 
    icon: Icon, label, active = false, onClick, onDrop, onDelete, onRename, 
    folderId, memberCount, topMembers = [] 
}: SidebarItemProps) {
    const [isOver, setIsOver] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(label);
    const inputRef = useRef<HTMLInputElement>(null);

    console.log("[SidebarItem] Render - label='", label, "', isEditing='", isEditing, "', editValue='", editValue, "', onRename defined='", !!onRename, "'");

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    useEffect(() => {
        if (isEditing) {
            console.log("[SidebarItem] useEffect: label changed to='", label, "', resetting editValue");
            setEditValue(label);
        }
    }, [label]);

    const handleRenameSubmit = () => {
        console.log("[SidebarItem] handleRenameSubmit - editValue='", editValue, "', label='", label, "', isEditing='", isEditing, "'");
        if (!editValue.trim()) {
            console.log("[SidebarItem] editValue is empty, skipping rename");
        } else if (!onRename) {
            console.log("[SidebarItem] onRename is not defined, skipping");
        } else {
            console.log("[SidebarItem] Calling onRename with:", editValue.trim());
            onRename(editValue.trim());
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleRenameSubmit();
        }
        if (e.key === 'Escape') {
            setEditValue(label);
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <div 
                className="flex items-center gap-1 px-2 py-1"
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
            >
                <input
                    ref={inputRef}
                    type="text"
                    className="flex-1 bg-white/5 rounded px-2 py-1 text-sm text-white border border-telegram-primary focus:outline-none min-w-0"
                    value={editValue}
                    onChange={(e) => {
                        const newVal = e.target.value;
                        console.log("[SidebarItem] onChange fired, newVal='", newVal, "', editValue before='", editValue, "'");
                        setEditValue(newVal);
                    }}
                    onKeyDown={handleKeyDown}
                    onBlur={() => {
                        console.log("[SidebarItem] onBlur fired");
                    }}
                />
                <button
                    onClick={(e) => { e.stopPropagation(); console.log("[SidebarItem] Check clicked, current editValue='", editValue, "'"); handleRenameSubmit(); }}
                    className="p-1 hover:text-green-400 rounded hover:bg-white/5 shrink-0"
                    title="Confirm rename"
                >
                    <Check className="w-3 h-3" />
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={onClick}
            onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOver(true);
            }}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
            }}
            onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX;
                const y = e.clientY;
                if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                    setIsOver(false);
                }
            }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOver(false);
                if (onDrop) onDrop(e);
            }}
            className={`group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${active
                ? 'bg-telegram-primary/10 text-telegram-primary'
                : isOver
                    ? 'bg-telegram-primary/30 text-telegram-text ring-2 ring-telegram-primary scale-[1.02] shadow-lg'
                    : 'text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text'
                }`}
        >
            <Icon className={`w-4 h-4 ${isOver ? 'text-telegram-primary' : ''}`} />
            <span className="flex-1 text-left truncate">{label}</span>
            
            <div className="flex items-center gap-2">
                {topMembers && topMembers.length > 0 ? (
                    <div className={active ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity'}>
                        <MemberStack members={topMembers} size="sm" maxDisplay={2} />
                    </div>
                ) : memberCount !== undefined && memberCount > 0 ? (
                    <span className="text-[10px] text-telegram-subtext tabular-nums">{memberCount}</span>
                ) : null}
                
                {folderId !== null && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {onRename && (
                            <div 
                                onClick={(e) => { e.stopPropagation(); console.log("[SidebarItem] Pencil clicked, current label='", label, "', setting isEditing=true"); setIsEditing(true); }} 
                                className="p-1 hover:text-telegram-primary rounded hover:bg-white/5"
                                title="Rename"
                            >
                                <Pencil className="w-3 h-3" />
                            </div>
                        )}
                        {onDelete && (
                            <div 
                                onClick={(e) => { e.stopPropagation(); onDelete(); }} 
                                className="p-1 hover:text-red-400 rounded hover:bg-white/5"
                                title="Delete"
                            >
                                <Plus className="w-3 h-3 rotate-45" />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </button>
    )
}
