import React from "react";
import { motion } from "framer-motion";

type OptionCardProps = {
  title: string;
  description: string;
  icon: React.ReactNode;
};

export default function OptionCard({ title, description, icon }: OptionCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      className="glass-panel p-5 rounded-xl border border-indigo-500/20 hover:border-indigo-400/30 transition-colors shadow-lg cursor-pointer"
    >
      <div className="flex items-center gap-3 mb-3">
        {icon}
        <h3 className="text-xl font-bold text-white">{title}</h3>
      </div>
      <p className="text-slate-400 text-sm">{description}</p>
    </motion.div>
  );
}
