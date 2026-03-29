"use client";

import { useState } from "react";
import { getNetworkLabel, stellarConfig } from "@/lib/stellar";
import { WalletConnect } from "./wallet-connect";

type SupportPanelProps = {
  walletAddress: string;
};

export function SupportPanel({ walletAddress }: SupportPanelProps) {
  const [visitorAddress, setVisitorAddress] = useState<string | null>(null);

  if (!visitorAddress) {
    return (
      <section className="rounded-[2rem] border border-gold/25 bg-gold/10 p-7 text-center">
        <p className="mb-4 text-sm text-sky/85">
          Connect your Freighter wallet to support this creator.
        </p>
        <WalletConnect onConnect={setVisitorAddress} />
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] border border-gold/25 bg-gold/10 p-7">
      <p className="text-xs uppercase tracking-[0.25em] text-gold">Support intent</p>
      <h2 className="mt-3 text-2xl font-semibold text-white">Ready for a real Stellar flow</h2>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-sky/85">
        This MVP intentionally stops at wallet connection and transaction preparation.
        The next implementation step is to build and sign a Testnet payment to the
        recipient address below, then store the resulting hash through the backend.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-ink/40 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-sky/70">Network</p>
          <p className="mt-2 font-semibold text-white">{getNetworkLabel()}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-ink/40 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-sky/70">Horizon</p>
          <p className="mt-2 break-all text-sm text-white">{stellarConfig.horizonUrl}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-ink/40 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-sky/70">Recipient</p>
          <p className="mt-2 break-all text-sm text-white">{walletAddress}</p>
        </div>
      </div>
    </section>
  );
}
