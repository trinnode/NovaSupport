"use client";

import { useState } from "react";
import { getAddress, isAllowed, setAllowed } from "@stellar/freighter-api";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

type WalletConnectProps = {
  onConnect?: (address: string) => void;
};

export function WalletConnect({ onConnect }: WalletConnectProps = {}) {
  const [address, setAddress] = useState<string | null>(null);
  const [status, setStatus] = useState("Connect Freighter to preview Stellar Testnet support.");
  const [errorType, setErrorType] = useState<"not_installed" | "denied" | "wrong_network" | null>(null);

  async function connectWallet() {
    setErrorType(null);
    try {
      setStatus("Checking Freighter availability...");

      if (typeof window !== "undefined" && (window as any).stellarLumens === undefined) {
        setErrorType("not_installed");
        setStatus("Freighter not found.");
        return;
      }

      const access = await isAllowed();
      if (!access.isAllowed) {
        const permission = await setAllowed();
        if (!permission.isAllowed) {
          setErrorType("denied");
          setStatus("Permission denied.");
          return;
        }
      }

      const result = await getAddress();
      if (result.error) {
        if (result.error.toLowerCase().includes("network")) {
          setErrorType("wrong_network");
          setStatus("Wrong network.");
        } else {
          setStatus(result.error);
        }
        return;
      }

      setAddress(result.address);
      setStatus("Freighter connected on Stellar Testnet.");
      onConnect?.(result.address);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Unable to connect to Freighter."
      );
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-mint">Wallet</p>
          <div className="mt-2 text-sm text-sky/80">
            {errorType === "not_installed" && (
              <p>
                Freighter wallet is not installed.{" "}
                <a
                  href="https://freighter.app"
                  target="_blank"
                  className="text-mint underline decoration-mint/30 underline-offset-4 hover:decoration-mint"
                >
                  Install it here →
                </a>
              </p>
            )}
            {errorType === "denied" && (
              <p>
                Connection was denied. Please approve in Freighter and{" "}
                <button
                  onClick={connectWallet}
                  className="text-mint underline decoration-mint/30 underline-offset-4 hover:decoration-mint"
                >
                  try again
                </button>
                .
              </p>
            )}
            {errorType === "wrong_network" && (
              <p>Please switch Freighter to Testnet in wallet settings.</p>
            )}
            {!errorType && <p>{status}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={connectWallet}
          className="rounded-full bg-mint px-4 py-2 text-sm font-semibold text-ink transition hover:bg-white"
        >
          {address ? "Reconnect" : "Connect Freighter"}
        </button>
      </div>
      {address ? (
        <div className="mt-4 rounded-2xl border border-mint/30 bg-ink/50 p-3 text-sm text-white">
          Connected address: <span className="font-semibold">{truncateAddress(address)}</span>
        </div>
      ) : null}
    </div>
  );
}

