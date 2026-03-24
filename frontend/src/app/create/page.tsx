// import { AppShell } from "@/components/app-shell";

// export default function CreatePage() {
//   return (
//     <AppShell>
//       <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-xl shadow-black/20">
//         <p className="text-xs uppercase tracking-[0.3em] text-mint">Draft flow</p>
//         <h1 className="mt-4 text-4xl font-semibold text-white">
//           Create your NovaSupport profile draft
//         </h1>
//         <p className="mt-4 max-w-2xl text-base leading-7 text-sky/80">
//           This starter page exists to show the intended MVP path: connect a wallet,
//           choose accepted Stellar assets, and publish a shareable support profile.
//           Contributors can turn this page into a real form wired to the backend.
//         </p>

//         <div className="mt-8 grid gap-4 md:grid-cols-2">
//           <div className="rounded-3xl border border-white/10 bg-ink/50 p-5">
//             <p className="text-sm font-semibold text-white">Planned fields</p>
//             <ul className="mt-4 space-y-2 text-sm text-sky/80">
//               <li>Display name and username</li>
//               <li>Short bio focused on ecosystem work</li>
//               <li>Primary Stellar wallet address</li>
//               <li>Accepted asset list such as XLM and USDC</li>
//             </ul>
//           </div>
//           <div className="rounded-3xl border border-gold/25 bg-gold/10 p-5">
//             <p className="text-sm font-semibold text-white">Contributor note</p>
//             <p className="mt-4 text-sm leading-7 text-sky/85">
//               Keep this flow simple. The MVP does not need scheduling, subscriptions,
//               analytics dashboards, or a generic checkout builder. It only needs a
//               clear path from profile to Stellar-native support.
//             </p>
//           </div>
//         </div>
//       </section>
//     </AppShell>
//   );
// }
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

interface FormData {
  username: string;
  displayName: string;
  bio: string;
  walletAddress: string;
}

const CONSTRAINTS = [
  { field: "Username", rule: "Alphanumeric + hyphens · max 32 chars" },
  { field: "Display name", rule: "Max 64 chars" },
  { field: "Bio", rule: "Optional · max 280 chars" },
  { field: "Wallet", rule: "Valid Stellar public key (G…)" },
];

export default function CreatePage() {
  const router = useRouter();

  const [form, setForm] = useState<FormData>({
    username: "",
    displayName: "",
    bio: "",
    walletAddress: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set(field: keyof FormData) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      setError(null);
    };
  }

  const walletValid =
    form.walletAddress === "" ||
    /^G[A-Z0-9]{55}$/.test(form.walletAddress);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!walletValid) {
      setError("Wallet address must be a valid Stellar public key starting with G.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.status === 409) setError("Username already taken.");
      else if (!res.ok) setError("Something went wrong. Please try again.");
      else {
        const profile = await res.json();
        router.push(`/profile/${profile.username}`);
      }
    } catch {
      setError("Network error — please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-xl shadow-black/20">
          <div className="flex gap-2 mb-8">
            <div className="h-1.5 flex-1 rounded-full bg-mint" />
            <div className="h-1.5 flex-1 rounded-full bg-mint" />
            <div className="h-1.5 flex-1 rounded-full bg-mint" />
          </div>

          {/* <p className="text-xs uppercase tracking-[0.35em] text-mint">
            Draft Flow · Step 1 of 3
          </p> */}
          <h1 className="mt-4 text-[1.2rem] sm:text-4xl font-semibold tracking-tight text-white leading-tight">
            Create your&nbsp;
            <span className="text-mint">NovaSupport</span>&nbsp;profile
          </h1>
          <p className="mt-3 text-sm text-sky/70">
            Your public Stellar-native support page — shareable in seconds.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            {/* Row: Display name + username */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase tracking-[0.25em] text-steel">
                  Display Name <span className="text-mint">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={64}
                  placeholder="e.g. Star Voyager"
                  value={form.displayName}
                  onChange={set("displayName")}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-steel/40 focus:border-mint/50 focus:outline-none focus:ring-1 focus:ring-mint/20 transition"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase tracking-[0.25em] text-steel">
                  Username <span className="text-mint">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-steel/60 text-sm select-none">
                    @
                  </span>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    pattern="[a-zA-Z0-9\-]+"
                    placeholder="username"
                    value={form.username}
                    onChange={set("username")}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 pl-8 pr-4 py-3 text-sm text-white placeholder:text-steel/40 focus:border-mint/50 focus:outline-none focus:ring-1 focus:ring-mint/20 transition"
                  />
                </div>
              </div>
            </div>

            {/* Bio */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase tracking-[0.25em] text-steel">
                  Bio
                </label>
                <span
                  className={`text-[10px] tabular-nums ${
                    form.bio.length >= 260 ? "text-gold" : "text-steel/50"
                  }`}
                >
                  {form.bio.length}&nbsp;/&nbsp;280
                </span>
              </div>
              <textarea
                maxLength={280}
                rows={4}
                placeholder="Tell the galaxy about your mission…"
                value={form.bio}
                onChange={set("bio")}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-steel/40 focus:border-mint/50 focus:outline-none focus:ring-1 focus:ring-mint/20 transition resize-none"
              />
            </div>

            {/* Wallet address */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] uppercase tracking-[0.25em] text-steel">
                Stellar Wallet Address <span className="text-mint">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="G…"
                  value={form.walletAddress}
                  onChange={set("walletAddress")}
                  className={`w-full rounded-2xl border bg-white/5 px-4 py-3 text-sm font-mono placeholder:text-steel/40 focus:outline-none focus:ring-1 transition ${
                    !walletValid && form.walletAddress
                      ? "border-red-500/40 text-red-400 focus:ring-red-500/20 focus:border-red-500/50"
                      : walletValid && form.walletAddress
                      ? "border-mint/40 text-mint focus:ring-mint/20 focus:border-mint/50"
                      : "border-white/10 text-white focus:border-mint/50 focus:ring-mint/20"
                  }`}
                />
                {/* Inline status badge */}
                {form.walletAddress && (
                  <span
                    className={`absolute right-4 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-widest font-bold ${
                      walletValid ? "text-mint" : "text-red-400"
                    }`}
                  >
                    {walletValid ? "✓ Valid" : "✗ Invalid"}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-steel/50 pl-1">
                56-character Stellar public key starting with G
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-mint px-5 py-4 text-sm font-semibold text-ink transition hover:bg-white active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating profile…" : "Create Profile →"}
            </button>

            <p className="text-center text-[10px] uppercase tracking-[0.2em] text-steel/35">
              By continuing you agree to the NovaSupport Protocol Terms.
            </p>
          </form>
        </div>

        {/* ── Right column — context aside ── */}
        <aside className="rounded-[2rem] border border-white/10 bg-ocean/60 p-8">
          <p className="text-xs uppercase tracking-[0.25em] text-gold">
            What you get
          </p>
          <div className="mt-5 space-y-3">
            {[
              "A shareable public Stellar-native support page",
              "Accept XLM, USDC, AQUA and any Stellar asset",
              "On-chain transaction history visible to everyone",
              "Soroban-ready contract path for support events",
            ].map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-sky/85"
              >
                {item}
              </div>
            ))}
          </div>

          {/* Constraint reference card */}
          <div className="mt-6 rounded-3xl border border-mint/25 bg-ink/50 p-5 text-sm">
            <p className="font-semibold text-white mb-3">Field constraints</p>
            <ul className="space-y-2.5">
              {CONSTRAINTS.map(({ field, rule }) => (
                <li key={field} className="flex justify-between gap-4">
                  <span className="text-steel font-medium shrink-0">{field}</span>
                  <span className="text-sky/60 text-xs text-right">{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Progress callout */}
          <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-[0.25em] text-steel">
                Draft progress
              </span>
              <span className="text-[10px] text-mint font-bold">Step 0 / 1</span>
            </div>
            <div className="">
              <input type={"range"} value={1} className="w-full h-1 flex-1 rounded-full bg-mint rounded" />
            </div>
            <p className="mt-3 text-[11px] text-sky/50">
              Next: Choose accepted assets and customize your page theme.
            </p>
          </div>
        </aside>
      </section>
    </AppShell>
  );
}