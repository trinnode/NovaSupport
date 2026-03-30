"use client";

import { useState, useEffect } from "react";
import { 
  History, Award, LayoutDashboard, 
  ExternalLink, Clock, ShieldCheck 
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type Transaction = {
  id: string;
  txHash: string;
  amount: string;
  assetCode: string;
  createdAt: string;
  status: string;
  message?: string;
};

export function ProfileTabs({ username }: { username: string }) {
  const [activeTab, setActiveTab] = useState<"history" | "badges">("history");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === "history") {
      setLoading(true);
      fetch(`${API_BASE_URL}/profiles/${username}/transactions`)
        .then(res => res.json())
        .then(data => {
          setTransactions(data.transactions || []);
        })
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [username, activeTab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-1">
        <div className="flex gap-8">
          <TabButton 
            active={activeTab === "history"} 
            onClick={() => setActiveTab("history")}
            icon={<History size={16} />}
            label="Support History"
          />
          <TabButton 
            active={activeTab === "badges"} 
            onClick={() => setActiveTab("badges")}
            icon={<Award size={16} />}
            label="Badges"
          />
        </div>
        
        <Link 
          href={`/dashboard/${username}`}
          className="w-full sm:w-auto flex items-center justify-center sm:justify-start gap-2 rounded-xl bg-mint/10 px-4 py-2 text-xs font-bold text-mint transition hover:bg-mint/20"
        >
          <LayoutDashboard size={14} />
          View Dashboard
        </Link>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "history" ? (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="min-h-[300px]"
          >
            {loading ? (
              <div className="flex h-40 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-mint border-t-transparent" />
              </div>
            ) : transactions.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
                <table className="w-full text-left text-sm text-sky/70">
                  <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-steel font-bold">
                    <tr>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Amount</th>
                      <th className="px-6 py-4">Transaction</th>
                      <th className="px-6 py-4 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="group hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <ShieldCheck size={14} className="text-mint" />
                            <span className="text-[11px] font-bold text-mint uppercase">Verified</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-white font-medium">{tx.amount} {tx.assetCode}</span>
                        </td>
                        <td className="px-6 py-4">
                          <a 
                            href={`https://stellar.expert/explorer/testnet/tx/${tx.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 font-mono text-xs hover:text-mint transition-colors"
                          >
                            {tx.txHash.slice(0, 8)}...{tx.txHash.slice(-8)}
                            <ExternalLink size={12} />
                          </a>
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums text-xs">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-gray-500 font-medium">No support yet</p>
                <p className="text-sm text-gray-400 mt-1">
                  Be the first to support {username}!
                </p>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="badges"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-2 gap-4 sm:grid-cols-4"
          >
            <BadgeCard 
              name="Early Bird" 
              desc="Supported in the first 24h" 
              date="Mar 2024"
              color="text-gold"
            />
            <BadgeCard 
              name="Nova Whale" 
              desc="5,000+ XLM Contributed" 
              locked
            />
            <BadgeCard 
              name="Consistent" 
              desc="Active Drip for 3 months" 
              locked
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 py-4 text-sm font-semibold transition-all ${
        active 
          ? "border-mint text-mint" 
          : "border-transparent text-steel hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function BadgeCard({ name, desc, date, color = "text-steel/50", locked = false }: any) {
  return (
    <div className={`relative flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-6 text-center ${locked ? "opacity-50 grayscale" : ""}`}>
      <div className={`rounded-xl bg-white/5 p-3 ${color}`}>
        <Award size={32} />
      </div>
      <div>
        <h4 className="text-xs font-bold text-white uppercase tracking-wider">{name}</h4>
        <p className="mt-1 text-[10px] text-steel leading-tight">{desc}</p>
        {date && <p className="mt-2 text-[9px] font-mono text-mint/60">{date}</p>}
      </div>
      {locked && (
        <div className="absolute right-2 top-2 rounded-full bg-black/40 p-1">
          <Clock size={10} className="text-white/40" />
        </div>
      )}
    </div>
  );
}
