import { useState, useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { AuthWizard } from "./components/AuthWizard";
import { Dashboard } from "./components/Dashboard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WindowControls } from "./components/WindowControls";
import { motion, AnimatePresence } from "framer-motion";
import { loadWorkspacePrefs, saveWorkspacePrefs } from "./components/dashboard/workspaceVisibility";
import "./App.css";

import { Toaster, toast } from "sonner";
import { ConfirmProvider } from "./context/ConfirmContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { DropZoneProvider } from "./contexts/DropZoneContext";
import { useInviteLink } from "./hooks/useInviteLink";
import { InviteJoinModal } from "./components/dashboard/InviteJoinModal";
import { NewGroupVisibilityPrompt } from "./components/dashboard/NewGroupVisibilityPrompt";
import { FirstRunSetup } from "./components/FirstRunSetup";
import { LockScreen } from "./components/LockScreen";

const queryClient = new QueryClient();

function LoadingScreen() {
  return (
    <div className="h-full w-full auth-gradient flex flex-col items-center justify-center relative overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 flex flex-col items-center"
      >
        <div className="w-24 h-24 mb-8 relative">
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 bg-blue-500/30 rounded-full blur-2xl"
          />
          <img src="/logo.png" alt="TgGuild" className="w-full h-full relative z-10 filter drop-shadow-2xl rounded-full" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">TgGuild</h1>
        <div className="flex items-center gap-2 text-blue-300/60 font-medium text-sm">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full"
          />
          Initializing Workspace...
        </div>
      </motion.div>
      <div className="fixed top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
    </div>
  );
}

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isCheckingLock, setIsCheckingLock] = useState(true);
  const [showFirstRun, setShowFirstRun] = useState(false);
  // Set after a successful join — tells Dashboard to open that group
  const [pendingGroupOpen, setPendingGroupOpen] = useState<{ id: number; name: string } | null>(null);
  // Set when performanceMode is on and user needs to decide visibility
  const [visibilityPrompt, setVisibilityPrompt] = useState<{ id: number; name: string } | null>(null);
  const { theme } = useTheme();
  const oauthHandled = useRef(false);

  const { pendingInvite, clearPendingInvite } = useInviteLink(isAuthenticated);

  // Handle Google OAuth redirect
  useEffect(() => {
    if (oauthHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      oauthHandled.current = true;
      (async () => {
        try {
          await invoke("cmd_google_exchange_code", { code });
          toast.success("Google account connected!");
          const clean = window.location.origin + window.location.pathname;
          window.history.replaceState({}, "", clean);
        } catch (e) {
          toast.error("Failed to connect Google: " + e);
        }
      })();
    }
  }, []);

  // Check auth on startup
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const store = await load("config.json");
        const apiIdStr = await store.get<string>("api_id");
        if (apiIdStr) {
          const apiId = parseInt(apiIdStr);
          if (!isNaN(apiId)) {
            await invoke("cmd_connect", { apiId });
            const isAuthorized = await invoke<boolean>("cmd_check_connection");
            if (isAuthorized) {
              setIsAuthenticated(true);
            }
          }
        }
      } catch (error) {
        console.error("Auth check failed:", error);
      } finally {
        setTimeout(() => setIsCheckingAuth(false), 800);
      }
    };
    checkAuth();
  }, []);

  // Check if app lock password is configured
  useEffect(() => {
    if (!isAuthenticated || isCheckingAuth) return;
    const checkLock = async () => {
      try {
        const store = await load("settings.json");
        const hash = await store.get<string>("password_hash");
        setIsLocked(!!hash);
      } catch {
        setIsLocked(false);
      } finally {
        setIsCheckingLock(false);
      }
    };
    checkLock();
  }, [isAuthenticated, isCheckingAuth]);

  // Show first-run setup after authentication if not yet completed
  useEffect(() => {
    if (isAuthenticated) {
      loadWorkspacePrefs().then(prefs => {
        if (!prefs.firstRunCompleted) {
          setShowFirstRun(true);
        }
      });
    }
  }, [isAuthenticated]);

  // Handle workspace visibility decision for a newly joined group
  const handleVisibilityShow = async () => {
    if (!visibilityPrompt) return;
    try {
      const prefs = await loadWorkspacePrefs();
      if (!prefs.visibleGroups.includes(visibilityPrompt.id)) {
        await saveWorkspacePrefs({
          ...prefs,
          visibleGroups: [...prefs.visibleGroups, visibilityPrompt.id],
        });
      }
    } catch { /* non-fatal */ }
    setPendingGroupOpen(visibilityPrompt);
    setVisibilityPrompt(null);
  };

  const handleVisibilityHide = async () => {
    if (!visibilityPrompt) return;
    try {
      const prefs = await loadWorkspacePrefs();
      // Remove from visible list if it was added optimistically
      await saveWorkspacePrefs({
        ...prefs,
        visibleGroups: prefs.visibleGroups.filter(id => id !== visibilityPrompt.id),
      });
    } catch { /* non-fatal */ }
    // Still open the group in this session (user can choose later in settings)
    setPendingGroupOpen(visibilityPrompt);
    setVisibilityPrompt(null);
  };

  return (
    <main className="h-screen w-screen text-telegram-text overflow-hidden selection:bg-telegram-primary/30 relative flex flex-col bg-telegram-bg">
      <div
        data-tauri-drag-region
        className="h-10 shrink-0 flex items-center border-b border-telegram-border bg-telegram-bg select-none relative z-[10000] transition-colors duration-300 gap-2 px-3"
      >
        <img src="/logo.png" className="w-6 h-6 rounded-full drop-shadow-lg" alt="TgGuild" draggable={false} />
        <span className="text-sm font-semibold text-telegram-text tracking-tight">TgGuild</span>
        <div data-tauri-drag-region className="min-w-0 flex-1 h-full" />
        <WindowControls />
      </div>

      <div className="min-h-0 flex-1 relative overflow-hidden">
        <Toaster theme={theme} position="bottom-center" />

        {/* Invite join modal */}
        {pendingInvite && isAuthenticated && (
          <InviteJoinModal
            inviteUrl={pendingInvite.url}
            groupInfo={pendingInvite.groupInfo}
            onClose={clearPendingInvite}
            onJoined={(groupId, groupName) => {
              clearPendingInvite();
              toast.success(`Successfully joined ${groupName}`);
              setPendingGroupOpen({ id: groupId, name: groupName });
            }}
            onNeedsVisibilityDecision={(groupId, groupName) => {
              clearPendingInvite();
              setVisibilityPrompt({ id: groupId, name: groupName });
            }}
          />
        )}

        {/* Workspace visibility prompt after join (only when performanceMode is on) */}
        {visibilityPrompt && (
          <NewGroupVisibilityPrompt
            groupName={visibilityPrompt.name}
            onShow={handleVisibilityShow}
            onHide={handleVisibilityHide}
          />
        )}

        <AnimatePresence mode="wait">
          {isCheckingAuth || isCheckingLock ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full w-full">
              <LoadingScreen />
            </motion.div>
          ) : showFirstRun ? (
            <motion.div key="firstrun" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full w-full">
              <FirstRunSetup onComplete={() => setShowFirstRun(false)} />
            </motion.div>
          ) : isAuthenticated && isLocked ? (
            <motion.div key="lock" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full w-full">
              <LockScreen onUnlock={() => setIsLocked(false)} />
            </motion.div>
          ) : isAuthenticated ? (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full w-full">
              <Dashboard
                onLogout={() => setIsAuthenticated(false)}
                pendingGroupOpen={pendingGroupOpen}
                onPendingGroupOpenConsumed={() => setPendingGroupOpen(null)}
              />
            </motion.div>
          ) : (
            <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full w-full">
              <AuthWizard onLogin={() => setIsAuthenticated(true)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ConfirmProvider>
            <DropZoneProvider>
              <AppContent />
            </DropZoneProvider>
          </ConfirmProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
