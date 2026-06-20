import React from "react";
import { useStrategyStore } from "../../store/useStrategyStore";
import { X } from "lucide-react";

export default function IBConnectButton() {
  const store = useStrategyStore();

  const handleConnect = async () => {
    try {
      // Call backend to obtain placeholder token
      const resp = await fetch("http://localhost:8000/api/ib/auth");
      if (!resp.ok) throw new Error("Failed to connect IB");
      const data = await resp.json();
      store.setIBCredentials("clientId", "clientSecret", data.accessToken, Date.now() + 3600 * 1000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDisconnect = () => {
    store.clearIBCredentials();
  };

  const connected = store.ibCredentials?.accessToken;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {connected ? (
        <button
          onClick={handleDisconnect}
          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl shadow-lg"
        >
          <X size={16} /> Disconnect IB
        </button>
      ) : (
        <button
          onClick={handleConnect}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl shadow-lg"
        >
          Connect to IB
        </button>
      )}
    </div>
  );
}
