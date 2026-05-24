import { useState, useMemo, useCallback, useRef, useEffect, type ComponentType } from 'react';
import { Plus, ArrowUpDown, ArrowUp, ArrowDown, CheckSquare, Download, FolderPlus, MoveRight, Send, Trash2, Upload, XSquare } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FileCard } from './FileCard';
import { EmptyState } from './EmptyState';
import { TelegramFile } from '../../types';
import { ContextMenu } from './ContextMenu';
import { FileListItem } from './FileListItem';
import { RenameModal } from './RenameModal';

type SortField = 'name' | 'size' | 'date';
type SortDirection = 'asc' | 'desc';

interface FileExplorerProps {
    files: TelegramFile[];
    loading: boolean;
    error: Error | null;
    viewMode: 'grid' | 'list';
    selectedIds: number[];
    activeFolderId: number | null;
    onFileClick: (e: React.MouseEvent, id: number) => void;
    onDelete: (id: number) => void;
    onRename: (id: number, currentName: string, newName: string) => void;
    onDownload: (id: number, name: string) => void;
    onOpen: (file: TelegramFile) => void;
    onManualUpload: () => void;
    onCreateFolder: () => void;
    onSelectionClear: () => void;
    onToggleSelection: (id: number) => void;
    onSelectAll: () => void;
    onShowMoveModal: () => void;
    onShowShareModal: () => void;
    onBulkDownload: () => void;
    onBulkDelete: () => void;
    onDrop?: (e: React.DragEvent, folderId: number) => void;
    onDragStart?: (fileId: number) => void;
    onDragEnd?: () => void;
}


function useGridColumns(containerRef: React.RefObject<HTMLDivElement | null>) {
    const [columns, setColumns] = useState(4);
    const [containerWidth, setContainerWidth] = useState(800);

    useEffect(() => {
        if (!containerRef.current) return;

        const updateColumns = () => {
            const width = containerRef.current?.clientWidth || 800;
            setContainerWidth(width);
            if (width < 640) setColumns(2);
            else if (width < 768) setColumns(3);
            else if (width < 1024) setColumns(4);
            else if (width < 1280) setColumns(5);
            else setColumns(6);
        };

        updateColumns();
        const observer = new ResizeObserver(updateColumns);
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [containerRef]);

    return { columns, containerWidth };
}

export function FileExplorer({
    files, loading, error, viewMode, selectedIds, activeFolderId,
    onFileClick, onDelete, onRename, onDownload, onOpen, onManualUpload, onCreateFolder, onSelectionClear, onToggleSelection,
    onSelectAll, onShowMoveModal, onShowShareModal, onBulkDownload, onBulkDelete, onDragStart, onDragEnd
}: FileExplorerProps) {
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: TelegramFile } | null>(null);
    const [renameFile, setRenameFile] = useState<TelegramFile | null>(null);

    const parentRef = useRef<HTMLDivElement>(null);
    const { columns, containerWidth } = useGridColumns(parentRef);

    const GAP = 6;
    const cardWidth = (containerWidth - (GAP * (columns - 1))) / columns;
    const cardHeight = cardWidth * 0.75; // aspect-[4/3]
    const rowHeight = Math.max(cardHeight + GAP, 150);

    const handleContextMenu = useCallback((e: React.MouseEvent, file: TelegramFile) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, file });
    }, []);

    const sortedFiles = useMemo(() => {
        return [...files].sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'name':
                    comparison = a.name.localeCompare(b.name);
                    break;
                case 'size':
                    comparison = (a.size || 0) - (b.size || 0);
                    break;
                case 'date':
                    comparison = (a.created_at || '').localeCompare(b.created_at || '');
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [files, sortField, sortDirection]);

    const handleOpenRequest = useCallback((file: TelegramFile) => {
        onOpen(file);
    }, [onOpen]);


    const gridRows = useMemo(() => {
        const rows: (TelegramFile | 'upload')[][] = [];
        const itemsWithUpload: (TelegramFile | 'upload')[] = [...sortedFiles, 'upload'];
        for (let i = 0; i < itemsWithUpload.length; i += columns) {
            rows.push(itemsWithUpload.slice(i, i + columns));
        }
        return rows;
    }, [sortedFiles, columns]);


    const listItems = useMemo(() => {
        return activeFolderId === null ? [...sortedFiles, 'upload' as const] : sortedFiles;
    }, [sortedFiles, activeFolderId]);


    const gridVirtualizer = useVirtualizer({
        count: gridRows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: useCallback(() => rowHeight, [rowHeight]),
        overscan: 2,
        gap: GAP,
    });


    useEffect(() => {
        gridVirtualizer.measure();
    }, [rowHeight, gridVirtualizer]);

    const listVirtualizer = useVirtualizer({
        count: listItems.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 48,
        overscan: 5,
    });

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
        return sortDirection === 'asc'
            ? <ArrowUp className="w-3 h-3 text-telegram-primary" />
            : <ArrowDown className="w-3 h-3 text-telegram-primary" />;
    };

    const allVisibleSelected = sortedFiles.length > 0 && sortedFiles.every(file => selectedIds.includes(file.current_id ?? file.id));

    const BulkActions = () => (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 animate-in fade-in slide-in-from-top-1">
            <button onClick={onCreateFolder} className="flex items-center gap-1 rounded-md bg-telegram-hover px-3 py-1.5 text-xs text-telegram-text transition hover:bg-telegram-border">
                <FolderPlus className="h-3.5 w-3.5" />
                Folder
            </button>
            <button onClick={onManualUpload} className="flex items-center gap-1 rounded-md bg-telegram-primary/20 px-3 py-1.5 text-xs font-medium text-telegram-primary transition hover:bg-telegram-primary/30">
                <Upload className="h-3.5 w-3.5" />
                Upload
            </button>
            {sortedFiles.length > 0 && (
                <button
                    onClick={allVisibleSelected ? onSelectionClear : onSelectAll}
                    className="flex items-center gap-1 rounded-md bg-telegram-hover px-3 py-1.5 text-xs text-telegram-text transition hover:bg-telegram-border"
                >
                    {allVisibleSelected ? <XSquare className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
                    {allVisibleSelected ? 'Deselect all' : 'Select all'}
                </button>
            )}
            {selectedIds.length > 0 && (
                <>
                    <span className="mr-1 text-xs text-telegram-subtext">{selectedIds.length} selected</span>
                    <button onClick={onShowShareModal} className="flex items-center gap-1 rounded-md bg-telegram-primary/20 px-3 py-1.5 text-xs font-medium text-telegram-primary transition hover:bg-telegram-primary/30">
                        <Send className="h-3.5 w-3.5" />
                        Share
                    </button>
                    <button onClick={onShowMoveModal} className="flex items-center gap-1 rounded-md bg-telegram-primary/20 px-3 py-1.5 text-xs font-medium text-telegram-primary transition hover:bg-telegram-primary/30">
                        <MoveRight className="h-3.5 w-3.5" />
                        Move
                    </button>
                    <button onClick={onBulkDownload} className="flex items-center gap-1 rounded-md bg-telegram-hover px-3 py-1.5 text-xs text-telegram-text transition hover:bg-telegram-border">
                        <Download className="h-3.5 w-3.5" />
                        Download
                    </button>
                    <button onClick={onBulkDelete} className="flex items-center gap-1 rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-500/20">
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                    </button>
                </>
            )}
        </div>
    );

    if (loading) {
        return (
            <div className="flex-1 p-6 flex justify-center items-center text-telegram-subtext flex-col gap-4">
                <div className="w-8 h-8 border-4 border-telegram-primary border-t-transparent rounded-full animate-spin"></div>
                Loading your files...
            </div>
        )
    }

    if (error) {
        return <div className="flex-1 p-6 flex justify-center items-center text-red-400">Error loading files</div>
    }

    if (files.length === 0) {
        return (
            <div
                ref={parentRef}
                className="flex-1 p-6 overflow-auto"
                onClick={(e) => {
                    e.stopPropagation();
                    if (e.target === e.currentTarget) onSelectionClear();
                }}
            >
                <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-telegram-subtext">
                    <BulkActions />
                </div>
                <EmptyState onUpload={onManualUpload} />
            </div>
        );
    }

    return (
        <div
            ref={parentRef}
            className="flex-1 p-6 overflow-auto custom-scrollbar"
            onClick={(e) => {
                e.stopPropagation();
                if (e.target === e.currentTarget) onSelectionClear();
            }}
        >
            {viewMode === 'grid' ? (
                <>

                    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-telegram-subtext">
                        <SortControls sortField={sortField} handleSort={handleSort} SortIcon={SortIcon} />
                        <BulkActions />
                    </div>


                    <div
                        className="relative w-full"
                        style={{ height: `${gridVirtualizer.getTotalSize()}px` }}
                    >
                        {gridVirtualizer.getVirtualItems().map((virtualRow) => {
                            const row = gridRows[virtualRow.index];
                            return (
                                <div
                                    key={virtualRow.key}
                                    className="absolute top-0 left-0 w-full grid"
                                    style={{
                                        height: `${cardHeight}px`,
                                        transform: `translateY(${virtualRow.start}px)`,
                                        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                                        gap: `${GAP}px`,
                                    }}
                                >
                                    {row.map((item) => {
                                        if (item === 'upload') {
                                            return (
                                                <button
                                                    key="upload"
                                                    onClick={(e) => { e.stopPropagation(); onManualUpload(); }}
                                                    className="border-2 border-dashed border-telegram-border rounded-xl flex flex-col items-center justify-center text-telegram-subtext hover:border-telegram-primary hover:text-telegram-primary transition-all group"
                                                    style={{ height: `${cardHeight}px` }}
                                                >
                                                    <Plus className="w-8 h-8 mb-2 group-hover:scale-110 transition-transform" />
                                                    <span className="text-sm font-medium">Upload File</span>
                                                </button>
                                            );
                                        }
                                        const file = item;
                                        const actualId = file.current_id ?? file.id;
                                        return (
                                            <FileCard
                                                key={file.id}
                                                file={file}
                                                isSelected={selectedIds.includes(actualId)}
                                                onClick={(e) => {
                                                    if (file.type === 'folder') {
                                                        e.stopPropagation();
                                                        handleOpenRequest(file);
                                                    } else {
                                                        onFileClick(e, file.id);
                                                    }
                                                }}
                                                onContextMenu={(e) => handleContextMenu(e, file)}
                                                onDelete={() => onDelete(file.id)}
                                                onDownload={() => onDownload(actualId, file.name)}
                                                onOpen={() => handleOpenRequest(file)}
                                                onDrop={undefined}
                                                onDragStart={onDragStart}
                                                onDragEnd={onDragEnd}
                                                activeFolderId={activeFolderId}
                                                height={cardHeight}
                                                onToggleSelection={() => onToggleSelection(file.id)}
                                            />
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </>
            ) : (
                <div className="flex flex-col w-full">
                    <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-telegram-border px-4 pb-2 text-xs font-semibold text-telegram-subtext">
                        <SortControls sortField={sortField} handleSort={handleSort} SortIcon={SortIcon} />
                        <BulkActions />
                    </div>


                    <div
                        className="relative w-full"
                        style={{ height: `${listVirtualizer.getTotalSize()}px` }}
                    >
                        {listVirtualizer.getVirtualItems().map((virtualItem) => {
                            const item = listItems[virtualItem.index];
                            if (item === 'upload') {
                                return (
                                    <div
                                        key="upload"
                                        className="absolute top-0 left-0 w-full"
                                        style={{ transform: `translateY(${virtualItem.start}px)` }}
                                    >
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onManualUpload(); }}
                                            className="flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer border border-dashed border-telegram-border text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover w-full"
                                        >
                                            <div className="w-5 h-5 flex items-center justify-center"><Plus className="w-4 h-4" /></div>
                                            <span className="text-sm font-medium">Upload File...</span>
                                        </button>
                                    </div>
                                );
                            }
                            const file = item;
                            const actualId = file.current_id ?? file.id;
                            return (
                                <div
                                    key={file.id}
                                    className="absolute top-0 left-0 w-full"
                                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                                >
                                    <FileListItem
                                        file={file}
                                        selectedIds={selectedIds}
                                        onFileClick={(e, id) => {
                                            if (file.type === 'folder') {
                                                e.stopPropagation();
                                                handleOpenRequest(file);
                                            } else {
                                                onFileClick(e, id);
                                            }
                                        }}
                                        handleContextMenu={handleContextMenu}
                                        onDragStart={onDragStart}
                                        onDragEnd={onDragEnd}
                                        onDrop={undefined}
                                        onOpen={handleOpenRequest}
                                        onDownload={() => onDownload(actualId, file.name)}
                                        onDelete={onDelete}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    file={contextMenu.file}
                    onClose={() => setContextMenu(null)}
                    onDownload={() => {
                        onDownload(contextMenu.file.current_id ?? contextMenu.file.id, contextMenu.file.name);
                        setContextMenu(null);
                    }}
                    onDelete={() => {
                        onDelete(contextMenu.file.id);
                        setContextMenu(null);
                    }}
                    onRename={() => {
                        setRenameFile(contextMenu.file);
                        setContextMenu(null);
                    }}
                    onOpen={() => {
                        if (contextMenu.file.type === 'folder') {
                            onFileClick({ preventDefault: () => { }, stopPropagation: () => { } } as React.MouseEvent, contextMenu.file.id);
                        } else {
                            handleOpenRequest(contextMenu.file);
                        }
                        setContextMenu(null);
                    }}
                />
            )}

            {renameFile && (
                <RenameModal
                    type={renameFile.type === 'folder' ? 'folder' : 'file'}
                    currentName={renameFile.name}
                    onClose={() => setRenameFile(null)}
                    onRename={(newName) => onRename(renameFile.id, renameFile.name, newName)}
                />
            )}
        </div>
    )
}

function SortControls({
    sortField,
    handleSort,
    SortIcon,
}: {
    sortField: SortField;
    handleSort: (field: SortField) => void;
    SortIcon: ComponentType<{ field: SortField }>;
}) {
    return (
        <>
            <span>Sort by:</span>
            {(['name', 'size', 'date'] as SortField[]).map(field => (
                <button
                    key={field}
                    onClick={() => handleSort(field)}
                    className={`flex items-center gap-1 rounded px-2 py-1 capitalize transition-colors hover:bg-white/5 ${sortField === field ? 'text-telegram-primary' : ''}`}
                >
                    {field} <SortIcon field={field} />
                </button>
            ))}
        </>
    );
}
