import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { AuthWizard } from "./components/AuthWizard";
import { Dashboard } from "./components/Dashboard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { motion, AnimatePresence } from "framer-motion";
import "./App.css";

import { Toaster } from "sonner";
import { ConfirmProvider } from "./context/ConfirmContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { DropZoneProvider } from "./contexts/DropZoneContext";

const queryClient = new QueryClient();

function LoadingScreen() {
  return (
    <div className="h-screen w-screen auth-gradient flex flex-col items-center justify-center relative overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 flex flex-col items-center"
      >
        <div className="w-24 h-24 mb-8 relative">
          <motion.div
            animate={{ 
              scale: [1, 1.1, 1],
              opacity: [0.5, 1, 0.5]
            }}
            transition={{ 
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
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

      {/* Background blobs */}
      <div className="fixed top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
    </div>
  );
}

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const { theme } = useTheme();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const store = await load("config.json");
        const apiIdStr = await store.get<string>("api_id");
        
        if (apiIdStr) {
          const apiId = parseInt(apiIdStr);
          if (!isNaN(apiId)) {
            // First connect with the saved ID
            await invoke("cmd_connect", { apiId });
            // Then check if we are actually authorized (session is valid)
            const isAuthorized = await invoke<boolean>("cmd_check_connection");
            if (isAuthorized) {
              setIsAuthenticated(true);
            }
          }
        }
      } catch (error) {
        console.error("Auth check failed:", error);
      } finally {
        // Short delay to ensure a smooth transition even on fast connections
        setTimeout(() => setIsCheckingAuth(false), 800);
      }
    };

    checkAuth();
  }, []);

  if (isCheckingAuth) {
    return <LoadingScreen />;
  }

  return (
    <main className="h-screen w-screen text-telegram-text overflow-hidden selection:bg-telegram-primary/30 relative">
      <Toaster theme={theme} position="bottom-center" />
      <AnimatePresence mode="wait">
        {isAuthenticated ? (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full w-full"
          >
            <Dashboard onLogout={() => setIsAuthenticated(false)} />
          </motion.div>
        ) : (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full w-full"
          >
            <AuthWizard onLogin={() => setIsAuthenticated(true)} />
          </motion.div>
        )}
      </AnimatePresence>
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
