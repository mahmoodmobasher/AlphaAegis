"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStrategyStore } from "@/store/useStrategyStore";
import { ibApi, llmApi } from "@/services/api";
import { 
  X, Lock, Mail, User, Server, Trash2, 
  Play, CheckCircle2, AlertCircle, RefreshCw, ArrowLeft,
  Settings, HelpCircle, ShieldAlert, Check, Cpu, Eye, EyeOff, Brain
} from "lucide-react";

export default function SettingsPage() {
  const store = useStrategyStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Connection form inputs
  const [activeTab, setActiveTab] = useState<"ib" | "llm">("ib");

  // LLM Config state
  const [llmConfigs, setLlmConfigs] = useState<any[]>([]);
  const [llmProvider, setLlmProvider] = useState<string>("ollama"); // 'ollama', 'openai', 'anthropic'
  const [llmDisplayName, setLlmDisplayName] = useState<string>("Local Ollama");
  const [llmBaseUrl, setLlmBaseUrl] = useState<string>("http://127.0.0.1:11434");
  const [llmApiKey, setLlmApiKey] = useState<string>("");
  const [llmTargetModel, setLlmTargetModel] = useState<string>("qwen3:latest");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [llmIsActive, setLlmIsActive] = useState<boolean>(true);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [llmTestStatus, setLlmTestStatus] = useState<string | null>(null);
  const [llmTestError, setLlmTestError] = useState<string | null>(null);
  const [testingLlm, setTestingLlm] = useState<boolean>(false);
  const [savingLlm, setSavingLlm] = useState<boolean>(false);

  const [host, setHost] = useState<string>("127.0.0.1");
  const [port, setPort] = useState<string>("7497");
  const [clientId, setClientId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [apiSecret, setApiSecret] = useState<string>("");
  const [useSSL, setUseSSL] = useState<boolean>(true);
  const [mode, setMode] = useState<string>("paper");

  // Configurations list and state
  const [configs, setConfigs] = useState<any[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Specific connection testing states
  const [testResult, setTestResult] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{ [key: number]: string }>({});

  // Load saved IB configs on mount
  useEffect(() => {
    if (!store.isAuthenticated) {
      router.push("/");
      return;
    }
    const fetchConfigs = async () => {
      try {
        setLoading(true);
        const list = await ibApi.listConfigs(store.token);
        setConfigs(list || []);
        
        // Load selected active config
        const storedActiveId = localStorage.getItem("active_ib_config_id");
        if (storedActiveId) {
          setActiveConfigId(Number(storedActiveId));
        }
      } catch (e: any) {
        console.error("Failed to load IB configs", e);
        setError("Failed to fetch saved connections.");
      } finally {
        setLoading(false);
      }
    };
    fetchConfigs();
  }, [store.isAuthenticated, store.token, router]);

  // Load LLM configs on mount
  useEffect(() => {
    if (!store.isAuthenticated) return;
    const fetchLlmConfigs = async () => {
      try {
        const list = await llmApi.listConfigs(store.token);
        setLlmConfigs(list || []);
        
        // Find active provider config and pre-populate if it exists
        const active = list?.find((c: any) => c.is_active);
        if (active) {
          setLlmProvider(active.provider_id);
          setLlmDisplayName(active.display_name);
          setLlmBaseUrl(active.api_base_url || "");
          setLlmTargetModel(active.default_model);
          setLlmIsActive(true);
        }
      } catch (e) {
        console.error("Failed to load LLM configs", e);
      }
    };
    fetchLlmConfigs();
  }, [store.isAuthenticated, store.token]);

  const fetchOllamaModels = async () => {
    try {
      const models = await llmApi.getAvailableOllamaModels(store.token);
      setAvailableModels(models || []);
      if (models && models.length > 0) {
        setLlmTargetModel(prev => {
          if (!prev || !models.includes(prev)) {
            return models[0];
          }
          return prev;
        });
      }
    } catch (err) {
      console.error("Failed to fetch available Ollama models", err);
      setAvailableModels(["qwen3:latest", "mistral:latest", "llama3.2:latest"]);
    }
  };

  useEffect(() => {
    if (llmProvider === "ollama") {
      fetchOllamaModels();
    }
  }, [llmProvider]);

  const handleLlmProviderChange = (provider: string) => {
    setLlmProvider(provider);
    if (provider === "ollama") {
      setLlmDisplayName("Local Ollama");
      setLlmBaseUrl("http://127.0.0.1:11434");
      setLlmTargetModel("qwen3:latest");
    } else if (provider === "openai") {
      setLlmDisplayName("OpenAI Production");
      setLlmBaseUrl("https://api.openai.com/v1");
      setLlmTargetModel("gpt-4o");
    } else if (provider === "anthropic") {
      setLlmDisplayName("Anthropic Claude");
      setLlmBaseUrl("https://api.anthropic.com/v1");
      setLlmTargetModel("claude-3-5-sonnet");
    }
    
    // Look up existing config for this provider if it exists in llmConfigs
    const existing = llmConfigs.find((c) => c.provider_id === provider);
    if (existing) {
      setLlmDisplayName(existing.display_name);
      setLlmBaseUrl(existing.api_base_url || "");
      setLlmTargetModel(existing.default_model);
      setLlmIsActive(existing.is_active);
    }
  };

  const handleTestLlm = async (e: React.MouseEvent) => {
    e.preventDefault();
    setTestingLlm(true);
    setLlmTestStatus(null);
    setLlmTestError(null);
    try {
      const payload = {
        provider_id: llmProvider,
        model_name: llmTargetModel,
        temperature: 0.0
      };
      const response = await llmApi.testConfig(payload, store.token);
      if (response && response.status === "success") {
        setLlmTestStatus("Connection Validated Successfully");
        setTimeout(() => setLlmTestStatus(null), 4000);
      } else {
        setLlmTestError(response?.detail || "Connection test failed");
      }
    } catch (err: any) {
      setLlmTestError(err.message || "Connection test failed with error");
    } finally {
      setTestingLlm(false);
    }
  };

  const handleSaveLlm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLlm(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload = {
        provider_id: llmProvider,
        display_name: llmDisplayName,
        api_base_url: llmBaseUrl || null,
        api_key: llmApiKey || null,
        default_model: llmTargetModel,
        is_active: llmIsActive
      };
      await llmApi.saveConfig(payload, store.token);
      setSuccessMessage("Language Model Orchestration settings saved successfully!");
      
      // Refresh list
      const list = await llmApi.listConfigs(store.token);
      setLlmConfigs(list || []);
    } catch (err: any) {
      setError(err.message || "Failed to save LLM settings");
    } finally {
      setSavingLlm(false);
    }
  };


  // Handle Save
  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const config = {
        host,
        port: Number(port),
        client_id: Number(clientId),
        account_id: accountId || undefined,
        api_key: apiKey || undefined,
        api_secret: apiSecret || undefined,
        use_ssl: useSSL,
        mode,
      };

      await ibApi.setConfig(config, store.token);
      setSuccessMessage("IB Connection saved successfully!");
      
      // Clear clientId for next entries but keep others as defaults
      setClientId("");
      
      // Reload list
      const list = await ibApi.listConfigs(store.token);
      setConfigs(list || []);
    } catch (err: any) {
      setError(err.message || "Failed to save IB connection.");
    } finally {
      setLoading(false);
    }
  };

  // Handle Select Connection
  const handleSelectConnection = (configId: number) => {
    setActiveConfigId(configId);
    localStorage.setItem("active_ib_config_id", configId.toString());
    setSuccessMessage("Active IB connection selected!");
  };

  // Handle Test Connection for specific saved item
  const handleTestSpecificConnection = async (configId: number) => {
    setConnectionStatus(prev => ({ ...prev, [configId]: "Connecting..." }));
    setTestResult(`Testing Connection ID #${configId}... Connecting to Interactive Brokers API...`);
    try {
      const testResp = await ibApi.testConnection(configId, store.token);
      if (testResp?.connected) {
        setConnectionStatus(prev => ({ ...prev, [configId]: "Connected" }));
        setTestResult(`Connection ID #${configId}: Successfully connected to IB on ${testResp.host}:${testResp.port}`);
      } else {
        setConnectionStatus(prev => ({ ...prev, [configId]: "Failed" }));
        setTestResult(`Connection ID #${configId}: Connection failed. Check if TWS or IB Gateway is running.`);
      }
    } catch (err: any) {
      console.error(err);
      setConnectionStatus(prev => ({ ...prev, [configId]: "Failed" }));
      setTestResult(`Connection ID #${configId} Error: Connection failed: ${err.message || err}`);
    }
  };

  // Handle Delete Connection
  const handleDeleteConnection = async (configId: number) => {
    try {
      await ibApi.deleteConfig(configId, store.token);
      setConfigs(prev => prev.filter(c => c.id !== configId));
      setConnectionStatus(prev => {
        const next = { ...prev };
        delete next[configId];
        return next;
      });
      
      // If we deleted the active config, clear it
      if (activeConfigId === configId) {
        setActiveConfigId(null);
        localStorage.removeItem("active_ib_config_id");
      }
    } catch (err: any) {
      setError(err.message || "Failed to delete connection.");
    }
  };

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col relative overflow-hidden font-sans">
      
      {/* Background waves & glow overlays */}
      <div className="absolute top-0 left-0 right-0 h-[450px] pointer-events-none opacity-40 z-0">
        <div className="absolute top-[-20%] left-[50%] -translate-x-[50%] w-[1000px] h-[400px] bg-indigo-500/10 blur-[150px] rounded-full"></div>
        <svg className="w-full h-full text-indigo-500/30" viewBox="0 0 1440 400" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 120 C 300 240, 700 80, 1000 180 C 1200 240, 1350 150, 1440 100" stroke="currentColor" strokeWidth="1.5" />
          <path d="M0 140 C 320 270, 680 100, 980 200 C 1180 260, 1360 180, 1440 130" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
        </svg>
      </div>

      <div className="max-w-4xl w-full mx-auto px-4 py-8 relative z-10 flex-1 flex flex-col justify-start">
        
        {/* Navigation & Header */}
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition duration-150 group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Home
          </button>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg font-mono">
              {mounted ? store.user?.email : ""}
            </span>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-900 border border-slate-800 p-1.5 rounded-xl gap-1 mb-6 relative z-10 max-w-md">
          <button
            onClick={() => setActiveTab("ib")}
            type="button"
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition duration-150 flex items-center justify-center gap-2 ${
              activeTab === "ib"
                ? "bg-indigo-650 text-white shadow-lg shadow-indigo-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            Interactive Brokers
          </button>
          <button
            onClick={() => setActiveTab("llm")}
            type="button"
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition duration-150 flex items-center justify-center gap-2 ${
              activeTab === "llm"
                ? "bg-indigo-650 text-white shadow-lg shadow-indigo-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Brain className="h-3.5 w-3.5" />
            LLM Orchestration
          </button>
        </div>

        {activeTab === "ib" ? (
          <>
            {/* Main Settings Card */}
            <div className="bg-slate-950/95 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-md mb-8">
              
              {/* Card Title */}
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-900">
                <div className="p-2 bg-indigo-600/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-black bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
                    Interactive Brokers Settings
                  </h1>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Add your API connection configurations for TWS, Gateway, or Option Trading
                  </p>
                </div>
              </div>

              {/* Success/Error Alerts */}
              {error && (
                <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-xs font-semibold flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-400 flex-shrink-0" />
                  {error}
                </div>
              )}
              {successMessage && (
                <div className="mb-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                  {successMessage}
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSaveConnection} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Host Input */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Host Address
                    </label>
                    <input
                      type="text"
                      required
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="127.0.0.1"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-4 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-600 transition"
                    />
                  </div>

                  {/* Port Input */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Port
                    </label>
                    <input
                      type="number"
                      required
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder="7497"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-4 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-600 transition"
                    />
                  </div>

                  {/* Client ID Input */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Client ID
                    </label>
                    <input
                      type="number"
                      required
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="1"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-4 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-600 transition"
                    />
                  </div>

                  {/* Account ID Input */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Account ID (optional)
                    </label>
                    <input
                      type="text"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      placeholder="U1234567"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-4 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-600 transition"
                    />
                  </div>

                  {/* API Key Input */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      API Key (optional)
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-4 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-600 transition"
                    />
                  </div>

                  {/* API Secret Input */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      API Secret (optional)
                    </label>
                    <input
                      type="password"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-4 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-600 transition"
                    />
                  </div>

                  {/* Mode Select */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Trading Mode
                    </label>
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:border-indigo-500 text-white transition cursor-pointer"
                    >
                      <option value="paper">Paper Trading</option>
                      <option value="live">Live Trading</option>
                    </select>
                  </div>

                  {/* SSL toggle check */}
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-3 cursor-pointer text-slate-350 hover:text-white transition">
                      <input
                        type="checkbox"
                        checked={useSSL}
                        onChange={(e) => setUseSSL(e.target.checked)}
                        className="h-4.5 w-4.5 rounded bg-slate-900 border-slate-800 text-indigo-650 focus:ring-indigo-500 transition cursor-pointer"
                      />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Use SSL Security</span>
                    </label>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex pt-4 border-t border-slate-900/60">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-500/20 transition duration-150"
                  >
                    Save Connection
                  </button>
                </div>
              </form>

            </div>

            {/* Bottom Screen Connections List */}
            <div className="bg-slate-950/95 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-md mb-8">
              
              <div className="flex items-center gap-2 mb-6">
                <Server className="h-4 w-4 text-emerald-400" />
                <h2 className="text-lg font-bold text-slate-200">
                  Saved Connections List
                </h2>
              </div>

              {configs.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-slate-900 rounded-xl">
                  <HelpCircle className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-500 text-xs font-semibold">
                    No connections configured yet. Create one above to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {configs.map((config) => {
                    const status = connectionStatus[config.id] || "Idle";
                    const isSelected = activeConfigId === config.id;
                    
                    return (
                      <div 
                        key={config.id}
                        className={`p-4 bg-slate-900/60 border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition duration-150 ${
                          isSelected ? 'border-indigo-500/70 shadow-lg shadow-indigo-500/5' : 'border-slate-850 hover:border-slate-800'
                        }`}
                      >
                        {/* Connection Info */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono bg-slate-950 px-2 py-0.5 rounded text-indigo-400 border border-slate-900 font-bold">
                              Connection ID: {config.id}
                            </span>
                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${
                              config.mode === 'live' ? 'bg-red-500/10 text-red-405 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-405 border border-emerald-500/20'
                            }`}>
                              {config.mode}
                            </span>
                            {isSelected && (
                              <span className="flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
                                <Check className="h-2.5 w-2.5" /> Selected Active
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm font-semibold text-slate-200">
                            {config.host}:{config.port}
                          </p>
                          
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-500 text-[11px]">
                            <span>Client ID: <strong className="text-slate-400">{config.client_id}</strong></span>
                            {config.account_id && <span>Account: <strong className="text-slate-400">{config.account_id}</strong></span>}
                            <span>SSL: <strong className="text-slate-400">{config.use_ssl ? "Yes" : "No"}</strong></span>
                          </div>
                        </div>

                        {/* Connection Actions / Status */}
                        <div className="flex items-center gap-3 self-end md:self-center">
                          {/* Connection status badge */}
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
                            status === "Connected" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" :
                            status === "Failed" ? "bg-red-500/10 text-red-400 border-red-500/25" :
                            status === "Connecting..." ? "bg-amber-500/10 text-amber-400 border-amber-500/25 animate-pulse" :
                            "bg-slate-950 text-slate-500 border-slate-900"
                          }`}>
                            {status}
                          </span>

                          {/* Select active button */}
                          {!isSelected ? (
                            <button
                              onClick={() => handleSelectConnection(config.id)}
                              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold rounded-lg text-slate-300 transition duration-150"
                            >
                              Select Connection
                            </button>
                          ) : (
                            <div className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/25 text-xs font-semibold rounded-lg text-indigo-400 flex items-center gap-1">
                              <Check className="h-3 w-3" /> Active
                            </div>
                          )}

                          {/* Connect / Test button */}
                          <button
                            onClick={() => handleTestSpecificConnection(config.id)}
                            disabled={status === "Connecting..."}
                            className="px-3 py-1.5 bg-slate-950 border border-slate-900 hover:bg-slate-800 text-indigo-400 hover:text-indigo-300 rounded-lg text-xs font-bold transition duration-150 flex items-center gap-1.5"
                            title="Test Connection"
                          >
                            <Play className="h-3.5 w-3.5" /> Test Connection
                          </button>

                          {/* Delete button */}
                          <button
                            onClick={() => handleDeleteConnection(config.id)}
                            className="p-2 bg-slate-950 border border-slate-900 hover:bg-red-500/10 text-red-455 hover:text-red-305 rounded-lg transition duration-150"
                            title="Delete Connection"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>

            {/* Test connection log console displayed below the list */}
            {testResult && (
              <div className="bg-slate-950/95 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-md">
                <div className="flex items-center gap-2 mb-4">
                  <RefreshCw className="h-4 w-4 text-indigo-400 animate-pulse" />
                  <h3 className="text-sm font-bold text-slate-200">
                    Connection Test Output Console
                  </h3>
                </div>
                <pre className="p-4 bg-slate-950 border border-slate-900 rounded-xl text-xs font-mono text-indigo-300/90 whitespace-pre-wrap overflow-x-auto">
                  {testResult}
                </pre>
              </div>
            )}
          </>
        ) : (
          /* Language Model Orchestration Card */
          <div className="bg-slate-950/95 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-md mb-8">
            
            {/* Card Title */}
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-900">
              <div className="p-2 bg-indigo-650/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                <Brain className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-black bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
                  Language Model Orchestration
                </h1>
                <p className="text-slate-400 text-xs mt-0.5">
                  Configure runtime-swappable LLM providers for options strategy & sentiment analysis
                </p>
              </div>
            </div>

            {/* Success/Error Alerts */}
            {error && (
              <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-xs font-semibold flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-400 flex-shrink-0" />
                {error}
              </div>
            )}
            {successMessage && (
              <div className="mb-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                {successMessage}
              </div>
            )}

            {/* LLM Connection Test Alert */}
            {llmTestStatus && (
              <div className="mb-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs font-semibold flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                {llmTestStatus}
              </div>
            )}
            {llmTestError && (
              <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-xs font-semibold flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                  <span className="font-bold">Connection Test Failed</span>
                </div>
                <pre className="mt-2 p-3 bg-black/40 border border-red-500/10 rounded-lg text-[10px] font-mono text-red-300 overflow-x-auto whitespace-pre-wrap">
                  {llmTestError}
                </pre>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveLlm} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Provider Dropdown */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Provider
                  </label>
                  <select
                    value={llmProvider}
                    onChange={(e) => handleLlmProviderChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:border-indigo-500 text-white transition cursor-pointer font-semibold"
                  >
                    <option value="ollama">Ollama (Local)</option>
                    <option value="openai">OpenAI (Cloud)</option>
                    <option value="anthropic">Anthropic (Cloud)</option>
                  </select>
                </div>

                {/* Display Name Input */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={llmDisplayName}
                    onChange={(e) => setLlmDisplayName(e.target.value)}
                    placeholder="e.g. Local Ollama"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-4 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-600 transition"
                  />
                </div>

                {/* Base URL Input */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Base URL / Endpoint
                  </label>
                  <input
                    type="text"
                    required={llmProvider === "ollama"}
                    value={llmBaseUrl}
                    onChange={(e) => setLlmBaseUrl(e.target.value)}
                    placeholder={llmProvider === "ollama" ? "http://127.0.0.1:11434" : "https://api.openai.com/v1"}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-4 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-600 transition font-mono"
                  />
                </div>

                {/* Target Model Input */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Target Model Name
                  </label>
                  {llmProvider === "ollama" ? (
                    <select
                      value={llmTargetModel}
                      onChange={(e) => setLlmTargetModel(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:border-indigo-500 text-white transition cursor-pointer font-mono font-semibold"
                    >
                      {availableModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      value={llmTargetModel}
                      onChange={(e) => setLlmTargetModel(e.target.value)}
                      placeholder="gpt-4o"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-4 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-600 transition font-mono"
                    />
                  )}
                </div>

                {/* API Key (Cloud Providers only) */}
                {llmProvider !== "ollama" && (
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? "text" : "password"}
                        value={llmApiKey}
                        onChange={(e) => setLlmApiKey(e.target.value)}
                        placeholder="Enter provider API key"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-4 pr-10 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-600 transition font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-350 transition"
                      >
                        {showApiKey ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Set Active toggle check */}
                <div className="flex items-center pt-2 md:col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer text-slate-350 hover:text-white transition">
                    <input
                      type="checkbox"
                      checked={llmIsActive}
                      onChange={(e) => setLlmIsActive(e.target.checked)}
                      className="h-4.5 w-4.5 rounded bg-slate-900 border-slate-800 text-indigo-650 focus:ring-indigo-500 transition cursor-pointer"
                    />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Set as Active Model Profile</span>
                  </label>
                </div>

              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-slate-900/60">
                <button
                  type="button"
                  onClick={handleTestLlm}
                  disabled={testingLlm}
                  className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 border border-slate-850 hover:border-slate-800 text-indigo-400 hover:text-indigo-300 font-bold text-sm rounded-xl transition duration-155 flex items-center justify-center gap-2"
                >
                  {testingLlm ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Test Connection
                </button>
                
                <button
                  type="submit"
                  disabled={savingLlm}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-500/20 transition duration-155"
                >
                  {savingLlm ? "Saving..." : "Save Configuration"}
                </button>
              </div>
            </form>

          </div>
        )}

      </div>
    </div>
  );
}
