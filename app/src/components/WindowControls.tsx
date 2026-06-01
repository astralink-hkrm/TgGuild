import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { X, Minus, Square, Copy } from 'lucide-react';

export function WindowControls() {
    const [isMaximized, setIsMaximized] = useState(false);
    const appWindow = getCurrentWindow();

    useEffect(() => {
        const updateMaximized = async () => {
            try {
                const maximized = await appWindow.isMaximized();
                setIsMaximized(maximized);
            } catch (e) {
                console.error(e);
            }
        };

        updateMaximized();
        
        const unlisten = appWindow.onResized(() => {
            updateMaximized();
        });

        return () => {
            unlisten.then(fn => fn());
        };
    }, [appWindow]);

    const handleMinimize = async () => {
        await appWindow.minimize();
    };

    const handleMaximize = async () => {
        await appWindow.toggleMaximize();
    };

    const handleClose = async () => {
        await appWindow.close();
    };

    return (
        <div className="flex items-center h-full relative z-[10001]">
            <button
                type="button"
                onClick={handleMinimize}
                className="w-10 h-8 flex items-center justify-center hover:bg-telegram-hover text-telegram-text transition-colors cursor-pointer"
                title="Minimize"
            >
                <Minus className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={handleMaximize}
                className="w-10 h-8 flex items-center justify-center hover:bg-telegram-hover text-telegram-text transition-colors cursor-pointer"
                title={isMaximized ? "Restore" : "Maximize"}
            >
                {isMaximized ? (
                    <Copy className="w-3 h-3" />
                ) : (
                    <Square className="w-3 h-3" />
                )}
            </button>
            <button
                type="button"
                onClick={handleClose}
                className="w-10 h-8 flex items-center justify-center hover:bg-red-500 hover:text-white text-telegram-text transition-colors cursor-pointer"
                title="Close"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
