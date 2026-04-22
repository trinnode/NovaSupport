"use client";
import { useState } from "react";
import { isValidStellarAddress } from "@/lib/stellar";

type Asset = {
  code: string;
  issuer?: string | null;
};

type ProfileCardProps = {
  username: string;
  displayName: string;
  bio: string;
  walletAddress: string;
  acceptedAssets: Asset[];
  email?: string;
  websiteUrl?: string;
  twitterHandle?: string;
  githubHandle?: string;
};

export function ProfileCard({
  username,
  displayName,
  bio,
  walletAddress,
  acceptedAssets,
  email,
  websiteUrl,
  twitterHandle,
  githubHandle,
}: ProfileCardProps) {
  const [copied, setCopied] = useState(false);
  const isValid = isValidStellarAddress(walletAddress);
  const hasSocialLinks = email || websiteUrl || twitterHandle || githubHandle;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const expertUrl = `https://stellar.expert/explorer/testnet/account/${walletAddress}`;

  return (
    <article className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-7 shadow-xl shadow-black/15">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-mint">@{username}</p>
          <h1 className="mt-3 text-2xl sm:text-3xl font-semibold text-white">{displayName}</h1>
          <p className="mt-4 max-w-2xl text-sm sm:text-base leading-relaxed sm:leading-7 text-sky/80">{bio}</p>

          {hasSocialLinks && (
            <div className="mt-4 flex flex-wrap gap-3">
              {websiteUrl && (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-sky/70 hover:text-mint transition"
                >
                  🌐 Website
                </a>
              )}
              {twitterHandle && (
                <a
                  href={`https://twitter.com/${twitterHandle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-sky/70 hover:text-mint transition"
                >
                  𝕏 @{twitterHandle}
                </a>
              )}
              {githubHandle && (
                <a
                  href={`https://github.com/${githubHandle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-sky/70 hover:text-mint transition"
                >
                  GitHub
                </a>
              )}
              {email && (
                <span className="text-xs text-sky/50">{email}</span>
              )}
            </div>
          )}
        </div>
        <div className="w-full sm:w-auto mt-4 sm:mt-0 rounded-3xl border border-mint/20 bg-ink/50 px-4 py-3 text-sm text-sky/80">
          <p className="font-semibold text-white">Stellar Wallet</p>
          <div className="mt-2 flex items-center">
            <a
              href={expertUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-500 hover:underline font-mono break-all flex-1"
            >
              {walletAddress}
            </a>
            <button 
              onClick={handleCopy} 
              className="ml-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className={`mt-3 ${isValid ? "text-mint" : "text-gold"}`}>
            {isValid ? "Valid Stellar address" : "Replace with a valid Stellar address"}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <p className="text-sm font-semibold text-white">Accepted assets</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {acceptedAssets.map((asset) => (
            <div
              key={`${asset.code}-${asset.issuer ?? "native"}`}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-sky/80"
            >
              <span className="font-semibold text-white">{asset.code}</span>
              {asset.issuer ? <span className="ml-2 text-xs">{asset.issuer}</span> : <span className="ml-2 text-xs">native</span>}
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
