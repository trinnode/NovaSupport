"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { 
  TrendingUp, Users, Wallet, Activity, 
  ArrowUpRight, ArrowDownRight, Info
} from "lucide-react";
import { motion } from "framer-motion";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

interface AnalyticsData {
  summary: {
    totalRaised: number;
    totalContributors: number;
    avgContribution: number;
    activeDrips: number;
  };
  dailyContributions: { date: string; amount: number }[];
  assetBreakdown: { name: string; value: number }[];
}

const COLORS = ["#00FFC2", "#00E0FF", "#FFB800", "#FF4D4D", "#9D4EDD"];

export default function DashboardPage() {
  const { campaignId } = useParams();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`${API_BASE_URL}/analytics/${campaignId}`);
        if (!res.ok) throw new Error("Failed to fetch analytics");
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [campaignId]);

  if (loading) return (
    <AppShell>
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-mint border-t-transparent" />
      </div>
    </AppShell>
  );

  if (error || !data) return (
    <AppShell>
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <div className="rounded-full bg-red-500/10 p-4 text-red-500">
          <Info size={48} />
        </div>
        <h2 className="text-2xl font-bold text-white">Analytics Unavailable</h2>
        <p className="text-steel">We couldn&apos;t load the metrics for this campaign.</p>
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Campaign <span className="text-mint">Analytics</span>
          </h1>
          <p className="text-steel">
            Real-time performance metrics for <span className="text-white font-mono">{campaignId}</span>
          </p>
        </header>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard 
            title="Total Raised" 
            value={`${data.summary.totalRaised.toLocaleString()} XLM`}
            icon={<Wallet className="text-mint" />}
            trend="+12.5%"
            positive={true}
          />
          <StatCard 
            title="Contributors" 
            value={data.summary.totalContributors.toString()}
            icon={<Users className="text-sky" />}
            trend="+8"
            positive={true}
          />
          <StatCard 
            title="Avg. Support" 
            value={`${data.summary.avgContribution} XLM`}
            icon={<TrendingUp className="text-gold" />}
            trend="-2.4%"
            positive={false}
          />
          <StatCard 
            title="Active Drips" 
            value={data.summary.activeDrips.toString()}
            icon={<Activity className="text-purple-400" />}
            trend="Stable"
            positive={true}
          />
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Trend Chart */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="col-span-1 rounded-3xl border border-white/10 bg-white/5 p-6 lg:col-span-2 shadow-sm shadow-black/40"
          >
            <h3 className="mb-6 text-sm font-semibold uppercase tracking-widest text-steel">
              Contribution Trend (7 Days)
            </h3>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.dailyContributions}>
                  <defs>
                    <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00FFC2" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#00FFC2" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#ffffff40" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#ffffff40" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "#0A0A0B", 
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "12px",
                      fontSize: "12px"
                    }}
                    itemStyle={{ color: "#00FFC2" }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="#00FFC2" 
                    fillOpacity={1} 
                    fill="url(#colorAmt)" 
                    strokeWidth={3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Pie Chart */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm shadow-black/40"
          >
            <h3 className="mb-6 text-sm font-semibold uppercase tracking-widest text-steel">
              Asset Distribution
            </h3>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.assetBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {data.assetBreakdown.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "#0A0A0B", 
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "12px"
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>

        {/* Mock Activity Section */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h3 className="mb-6 text-sm font-semibold uppercase tracking-widest text-steel font-mono">
            On-Chain Explorer Integration
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-sky/70">
              <thead className="border-b border-white/10 text-[10px] uppercase tracking-widest text-steel">
                <tr>
                  <th className="pb-4 pr-4">Type</th>
                  <th className="pb-4 pr-4">Supporter</th>
                  <th className="pb-4 pr-4">Asset</th>
                  <th className="pb-4 pr-4">Amount</th>
                  <th className="pb-4 pr-4 text-right">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[
                  { id: 1, type: "One-time", user: "G...3f2k", asset: "XLM", amount: "500", age: "2h ago" },
                  { id: 2, type: "Drip", user: "G...as91", asset: "USDC", amount: "15", age: "5h ago" },
                  { id: 3, type: "One-time", user: "G...78m2", asset: "AQUA", amount: "1200", age: "1d ago" },
                ].map((item) => (
                  <tr key={item.id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        item.type === "Drip" ? "bg-purple-500/10 text-purple-400" : "bg-mint/10 text-mint"
                      }`}>
                        {item.type}
                      </span>
                    </td>
                    <td className="py-4 pr-4 font-mono text-xs">{item.user}</td>
                    <td className="py-4 pr-4 text-white font-medium">{item.asset}</td>
                    <td className="py-4 pr-4 text-white font-medium">{item.amount}</td>
                    <td className="py-4 pr-4 text-right tabular-nums">{item.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({ title, value, icon, trend, positive }: { 
  title: string; 
  value: string; 
  icon: React.ReactNode; 
  trend: string;
  positive: boolean;
}) {
  return (
    <motion.div 
      whileHover={{ scale: 1.02 }}
      className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20"
    >
      <div className="flex items-center justify-between">
        <div className="rounded-2xl bg-white/5 p-3">
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-tight ${
          positive ? "text-mint" : trend === "Stable" ? "text-steel" : "text-red-400"
        }`}>
          {positive ? <ArrowUpRight size={14} /> : trend === "Stable" ? null : <ArrowDownRight size={14} />}
          {trend}
        </div>
      </div>
      <div className="mt-5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-steel">
          {title}
        </p>
        <h4 className="mt-1 text-2xl font-bold text-white tabular-nums">
          {value}
        </h4>
      </div>
    </motion.div>
  );
}
