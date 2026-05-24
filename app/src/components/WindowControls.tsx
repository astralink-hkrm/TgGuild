import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function WindowControls() {
    const [isMaximized, setIsMaximized] = useState(false);
    const appWindow = getCurrentWindow();

    useEffect(() => {
        const updateMaximized = async () => {
            setIsMaximized(await appWindow.isMaximized());
        };

        updateMaximized();
        const unlisten = appWindow.onResized(() => {
            updateMaximized();
        });

        return () => {
            unlisten.then(fn => fn());
        };
    }, [appWindow]);

    return (
        <div className="flex items-center gap-2 h-full no-drag">
            <button
                onClick={() => appWindow.close()}
                className="w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57]/80 transition-colors"
                title="Close"
            />
            <button
                onClick={() => appWindow.minimize()}
                className="w-3 h-3 rounded-full bg-[#febc2e] hover:bg-[#febc2e]/80 transition-colors"
                title="Minimize"
            />
            <button
                onClick={() => appWindow.toggleMaximize()}
                className="w-3 h-3 rounded-full bg-[#28c840] hover:bg-[#28c840]/80 transition-colors"
                title={isMaximized ? "Restore" : "Maximize"}
            />
        </div>
    );
}
