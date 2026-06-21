"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { 
  ShieldAlert, 
  LogIn, 
  LogOut, 
  ChevronDown 
} from "lucide-react";
import { Settings } from "lucide-react";


import { useStrategyStore } from "../../store/useStrategyStore";
import BuildDropdown from "./BuildDropdown";
import AuthModal from "../Auth/AuthModal";

export default function Navbar() {
  const store = useStrategyStore();
  const router = useRouter();
  const pathname = usePathname();

  const [isBuildMenuOpen, setIsBuildMenuOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);


  const handleSelectPreset = (presetId: string) => {
    // Navigating to /build with preset query param will trigger the preset load
    router.push(`/build?preset=${presetId}`);
    setIsBuildMenuOpen(false);
  };

  return (
    <>
      <nav className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Logo / Brand Link */}
          <button 
            onClick={() => router.push("/")}
            className="flex items-center gap-2 outline-none group text-left"
          >
            <div className="p-2 bg-indigo-600/10 border border-indigo-500/20 rounded-xl text-indigo-400 group-hover:bg-indigo-600/20 transition duration-150">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <span className="font-black text-xl tracking-tight bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
              AlphaAegis
            </span>
          </button>

          {/* Center Navigation Links */}
          <div className="hidden md:flex items-center gap-6 text-sm font-bold text-slate-400">
            <button 
              onClick={() => setIsBuildMenuOpen(!isBuildMenuOpen)}
              className={`flex items-center gap-1 hover:text-white transition-all duration-150 ${isBuildMenuOpen ? "text-white" : ""}`}
            >
              Build <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isBuildMenuOpen ? "rotate-180" : ""}`} />
            </button>
            <button 
              onClick={() => router.push("/chain")} 
              className={`hover:text-white transition ${pathname === "/chain" ? "text-white animate-pulse-subtle" : ""}`}
            >
              Options Chain
            </button>
            <button 
              onClick={() => router.push("/portfolio")} 
              className={`hover:text-white transition ${pathname === "/portfolio" ? "text-white animate-pulse-subtle" : ""}`}
            >
              Portfolio
            </button>
            {mounted && store.isAuthenticated && (
              <button
                onClick={() => router.push('/settings')}
                className="flex items-center gap-1.5 p-2 hover:bg-slate-800 rounded-lg transition"
                title="Settings"
              >
                <Settings className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-400">Settings</span>
              </button>
            )}
          </div>

          {/* Right Section: Auth States */}
          <div className="flex items-center gap-3">
            {mounted && store.isAuthenticated ? (
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-xs text-text-sub font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
                  {store.user?.email}
                </span>
                <button
                  onClick={store.logout}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl transition"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsAuthOpen(true)}
                  className="text-slate-400 hover:text-white font-semibold text-sm transition"
                >
                  Log In
                </button>
                <button
                  onClick={() => setIsAuthOpen(true)}
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg shadow-lg shadow-amber-500/10 transition duration-150"
                >
                  Start Trial
                </button>
              </div>
            )}
          </div>

        </div>
      </nav>

      {/* Build Dropdown Overlay */}
      <BuildDropdown
        isOpen={isBuildMenuOpen}
        onClose={() => setIsBuildMenuOpen(false)}
        onSelectStrategy={handleSelectPreset}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />
    </>
  );
}
