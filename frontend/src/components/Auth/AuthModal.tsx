"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Lock, Mail, User } from "lucide-react";
import { authApi } from "@/services/api";
import { useStrategyStore } from "@/store/useStrategyStore";

// Load Google Identity Services script once
let googleScriptLoaded = false;
function loadGoogleScript(callback: () => void) {
  if (googleScriptLoaded) return callback();
  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.onload = () => {
    googleScriptLoaded = true;
    callback();
  };
  document.head.appendChild(script);
}

export default function AuthModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handlers declared before useEffect to prevent ReferenceError
  const handleCredentialResponse = async (response: any) => {
    setLoading(true);
    setError(null);
    try {
      console.log("Google credential received:", response.credential?.slice(0, 20));
      const result = await authApi.googleLogin(response.credential);
      
      if (result?.access_token) {
        const userDetails = await authApi.getMe(result.access_token);
        const store = useStrategyStore.getState();
        store.login(result.access_token, userDetails);
      }
      onClose();
      router.push("/");
    } catch (e: any) {
      console.error("Google sign‑in error:", e);
      setError(e.message || "Google authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        // Login flow
        const authData = await authApi.login(email, password);
        // Fetch current user details
        const userDetails = await authApi.getMe(authData.access_token);
        
        const store = useStrategyStore.getState();
        store.login(authData.access_token, userDetails);
        onClose();
        router.push("/");
      } else {
        // Register flow
        await authApi.register(email, password, fullName);
        // Auto-login after registration
        const authData = await authApi.login(email, password);
        const userDetails = await authApi.getMe(authData.access_token);
        
        const store = useStrategyStore.getState();
        store.login(authData.access_token, userDetails);
        onClose();
        router.push("/");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    loadGoogleScript(() => {
      const gWindow = window as any;
      if (gWindow.google && gWindow.google.accounts && gWindow.google.accounts.id) {
        gWindow.google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID as string,
          callback: handleCredentialResponse,
          auto_select: false,
        });
        gWindow.google.accounts.id.renderButton(
          document.getElementById("google-signin-button"),
          { theme: "outline", size: "large", width: 280 }
        );
      } else {
        console.error("Google Identity Services script failed to load.");
        setError("Unable to load Google Sign‑In. Please try again later.");
      }
    });
    return () => {
      (window as any).google?.accounts?.id?.cancel();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-slate-950/95 border border-slate-800 rounded-2xl p-8 shadow-2xl text-white">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors hover:bg-slate-900"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Title & Description */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-black bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
            {isLogin ? "Welcome Back" : "Create Account"}
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            {isLogin ? "Sign in to simulate your strategies" : "Start your options strategic trial"}
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Full Name field (only for sign up) */}
          {!isLogin && (
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Full Name
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                  <User className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-600 transition"
                />
              </div>
            </div>
          )}

          {/* Email field */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                <Mail className="h-4 w-4" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-600 transition"
              />
            </div>
          </div>

          {/* Password field */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                <Lock className="h-4 w-4" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-600 transition"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-500/20 transition duration-150 relative overflow-hidden"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : isLogin ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        {/* Toggle between Login and Signup */}
        <div className="mt-4 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-xs text-indigo-400 hover:underline hover:text-indigo-300"
          >
            {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
          </button>
        </div>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800/80"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-slate-950 px-2 text-slate-500 font-bold">Or continue with</span>
          </div>
        </div>

        {/* Google Sign-In Button */}
        <div className="flex justify-center">
          <div id="google-signin-button" className="min-h-[40px] flex justify-center items-center" />
        </div>

      </div>
    </div>
  );
}
