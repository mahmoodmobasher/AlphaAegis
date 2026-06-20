// "use client"

import React from "react";
import { X } from "lucide-react";
import IBConnectButton from "./IBConnectButton";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function IBConnectModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 hover:bg-slate-800 rounded-full transition"
        >
          <X className="h-4 w-4 text-slate-400" />
        </button>

        <h2 className="text-lg font-bold text-slate-100 mb-4">
          Interactive Brokers Settings
        </h2>

        <IBConnectButton />
      </div>
    </div>
  );
}
