"use client";

import { useEffect, useState } from "react";
import { signTransaction } from "@stellar/freighter-api";
import {
  Asset as StellarAsset,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import {
  buildSupportIntent,
  buildPathPaymentIntent,
  getNetworkLabel,
  horizonServer,
  stellarConfig,
} from "@/lib/stellar";
import { WalletConnect } from "./wallet-connect";
import { API_BASE_URL } from "@/lib/config";

type Asset = {
  code: string;
  issuer?: string | null;
};

type SupportPanelProps = {
  walletAddress: string;
  acceptedAssets?: Asset[];
  profileId?: string;
};

export function SupportPanel({
  walletAddress,
  acceptedAssets,
  profileId,
}: SupportPanelProps) {
  const [visitorAddress, setVisitorAddress] = useState<string | null>(null);
  const [visitorBalances, setVisitorBalances] = useState<any[]>([]);
  const [paymentAsset, setPaymentAsset] = useState<{
    code: string;
    issuer?: string;
  } | null>(null);
  const [amount, setAmount] = useState("");
  const [isSigning, setIsSigning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedHash, setSubmittedHash] = useState<string | null>(null);
  const [estimatedReceived, setEstimatedReceived] = useState<string | null>(
    null,
  );
  const [isFindingPath, setIsFindingPath] = useState(false);
  const [noPathFound, setNoPathFound] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("monthly");
  const [recurringError, setRecurringError] = useState<string | null>(null);

  const networkLabel = getNetworkLabel();

  const recipientAsset = acceptedAssets?.[0] || { code: "XLM" };
  const amountNum = parseFloat(amount);
  const isValidAmount = amountNum > 0;
  const showError = amount !== "" && !isValidAmount;
  const isProcessing = isSigning || isSubmitting || isFindingPath;

  useEffect(() => {
    if (visitorAddress) {
      horizonServer
        .loadAccount(visitorAddress)
        .then((acc) => {
          const balances = acc.balances.filter(
            (b: any) => parseFloat(b.balance) > 0 || b.asset_type === "native",
          );
          setVisitorBalances(balances);
          // Default to XLM if available, else first balance
          const xlm = balances.find((b: any) => b.asset_type === "native");
          if (xlm) {
            setPaymentAsset({ code: "XLM" });
          } else if (balances.length > 0) {
            const firstBalance = balances[0] as any;
            if (firstBalance.asset_type !== "native") {
              setPaymentAsset({
                code: firstBalance.asset_code,
                issuer: firstBalance.asset_issuer,
              });
            }
          }
        })
        .catch((err) => {
          console.error("Failed to load visitor account", err);
        });
    } else {
      setVisitorBalances([]);
      setPaymentAsset(null);
    }
  }, [visitorAddress]);

  useEffect(() => {
    const findPath = async () => {
      if (!visitorAddress || !paymentAsset || !isValidAmount) {
        setEstimatedReceived(null);
        setNoPathFound(false);
        return;
      }

      const isSameAsset =
        paymentAsset.code === recipientAsset.code &&
        (paymentAsset.code === "XLM" ||
          paymentAsset.issuer === recipientAsset.issuer);

      if (isSameAsset) {
        setEstimatedReceived(amount);
        setNoPathFound(false);
        return;
      }

      setIsFindingPath(true);
      setNoPathFound(false);
      try {
        const sourceAsset =
          paymentAsset.code === "XLM"
            ? StellarAsset.native()
            : new StellarAsset(paymentAsset.code, paymentAsset.issuer!);
        const destAsset =
          recipientAsset.code === "XLM"
            ? StellarAsset.native()
            : new StellarAsset(recipientAsset.code, recipientAsset.issuer!);

        const paths = await horizonServer
          .strictSendPaths(sourceAsset, amount, [destAsset])
          .call();
        if (paths.records.length > 0) {
          setEstimatedReceived(paths.records[0].destination_amount);
        } else {
          setNoPathFound(true);
          setEstimatedReceived(null);
        }
      } catch (err) {
        console.error("Pathfinding error", err);
        setNoPathFound(true);
      } finally {
        setIsFindingPath(false);
      }
    };

    const timer = setTimeout(findPath, 500);
    return () => clearTimeout(timer);
  }, [visitorAddress, paymentAsset, amount, recipientAsset, isValidAmount]);

  function truncateHash(hash: string) {
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  }

  function mapHorizonError(error: unknown): string {
    const resultCodes =
      error &&
      typeof error === "object" &&
      "response" in error &&
      error.response &&
      typeof error.response === "object" &&
      "data" in error.response &&
      error.response.data &&
      typeof error.response.data === "object" &&
      "extras" in error.response.data &&
      error.response.data.extras &&
      typeof error.response.data.extras === "object" &&
      "result_codes" in error.response.data.extras
        ? (error.response.data.extras.result_codes as {
            transaction?: string;
            operations?: string[];
          })
        : null;

    const operationCode = resultCodes?.operations?.[0];
    const transactionCode = resultCodes?.transaction;

    if (operationCode === "op_underfunded") {
      return "Insufficient balance";
    }
    if (transactionCode === "tx_too_late") return "Transaction expired";
    if (transactionCode === "tx_bad_seq")
      return "Transaction sequence is out of date. Please try again.";
    if (transactionCode === "tx_insufficient_balance")
      return "Insufficient balance";
    if (transactionCode === "tx_bad_auth" || operationCode === "op_bad_auth")
      return "Authorization failed. Please reconnect Freighter and try again.";

    if (error instanceof Error && error.message) return error.message;
    return "Unable to submit transaction to Stellar. Please try again.";
  }

  async function handleSendSupport() {
    if (!visitorAddress || !isValidAmount || isProcessing || noPathFound) {
      return;
    }

    setErrorMessage(null);
    setSubmittedHash(null);
    setRecurringError(null);
    setIsSigning(true);

    try {
      const isSameAsset =
        paymentAsset?.code === recipientAsset.code &&
        (paymentAsset?.code === "XLM" ||
          paymentAsset?.issuer === recipientAsset.issuer);

      let unsignedXdr: string;

      if (isSameAsset) {
        unsignedXdr = await buildSupportIntent({
          sourceAccount: visitorAddress,
          destination: walletAddress,
          amount,
          assetCode: recipientAsset?.issuer ? recipientAsset.code : undefined,
          assetIssuer: recipientAsset?.issuer ?? undefined,
        });
      } else {
        const sourceAsset =
          paymentAsset?.code === "XLM"
            ? StellarAsset.native()
            : new StellarAsset(paymentAsset!.code, paymentAsset!.issuer!);
        const destAsset =
          recipientAsset.code === "XLM"
            ? StellarAsset.native()
            : new StellarAsset(recipientAsset.code, recipientAsset.issuer!);

        unsignedXdr = await buildPathPaymentIntent({
          sourceAccount: visitorAddress,
          sourceAsset,
          sourceAmount: amount,
          destAsset,
          destAddress: walletAddress,
        });
      }

      const signedResult = await signTransaction(unsignedXdr, {
        address: visitorAddress,
        networkPassphrase: stellarConfig.networkPassphrase,
      });

      if (signedResult.error || !signedResult.signedTxXdr) {
        throw new Error(
          signedResult.error ||
            "Freighter did not return a signed transaction.",
        );
      }

      setIsSigning(false);
      setIsSubmitting(true);

      const transactionToSubmit = TransactionBuilder.fromXDR(
        signedResult.signedTxXdr,
        stellarConfig.networkPassphrase,
      );

      const response =
        await horizonServer.submitTransaction(transactionToSubmit);

      setSubmittedHash(response.hash);

      // If recurring is enabled, set up the drip
      if (isRecurring && profileId) {
        try {
          const token = localStorage.getItem("authToken");
          const recurringResponse = await fetch(
            `${API_BASE_URL}/recurring-support`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                supporterAddress: visitorAddress,
                recipientAddress: walletAddress,
                profileId,
                amount,
                assetCode: recipientAsset?.code || "XLM",
                assetIssuer: recipientAsset?.issuer,
                frequency,
              }),
            },
          );

          if (!recurringResponse.ok) {
            throw new Error("Failed to set up recurring support");
          }
        } catch (recurringErr) {
          setRecurringError(
            "On-chain payment succeeded, but drip setup failed. Please try setting up recurring support again.",
          );
        }
      }

      setAmount("");
    } catch (error) {
      setErrorMessage(mapHorizonError(error));
    } finally {
      setIsSigning(false);
      setIsSubmitting(false);
    }
  }

  if (!visitorAddress) {
    return (
      <section className="rounded-[2rem] border border-gold/25 bg-gold/10 p-7 text-center">
        <div className="mb-4">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
            {networkLabel}
          </span>
        </div>
        <p className="mb-4 text-sm text-sky/85">
          Connect your Freighter wallet to support this creator.
        </p>
        <WalletConnect onConnect={setVisitorAddress} />
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] border border-gold/25 bg-gold/10 p-7">
      <div className="mb-4">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
          {networkLabel}
        </span>
      </div>
      <p className="text-xs uppercase tracking-[0.25em] text-gold">
        Support intent
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-white">
        Select assets & support
      </h2>

      <div className="mt-6 space-y-4">
        {/* Payment Asset Selector */}
        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-sky/70 block mb-2">
            Pay with
          </label>
          <select
            value={
              paymentAsset
                ? paymentAsset.code === "XLM"
                  ? "native"
                  : `${paymentAsset.code}:${paymentAsset.issuer}`
                : ""
            }
            onChange={(e) => {
              const val = e.target.value;
              if (val === "native") setPaymentAsset({ code: "XLM" });
              else {
                const [code, issuer] = val.split(":");
                setPaymentAsset({ code, issuer });
              }
            }}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-mint/50 focus:outline-none appearance-none"
          >
            {visitorBalances.map((b: any) => (
              <option
                key={
                  b.asset_type === "native"
                    ? "native"
                    : `${b.asset_code}:${b.asset_issuer}`
                }
                value={
                  b.asset_type === "native"
                    ? "native"
                    : `${b.asset_code}:${b.asset_issuer}`
                }
                className="bg-ink text-white"
              >
                {b.asset_type === "native" ? "XLM" : b.asset_code} (
                {parseFloat(b.balance).toFixed(2)})
              </option>
            ))}
          </select>
        </div>

        {/* Amount Input */}
        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-sky/70 block mb-2">
            Amount
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0.0000001"
              step="0.0000001"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-sky/50 focus:border-mint/50 focus:outline-none"
            />
            <div className="flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-sky/80 min-w-[80px] justify-center">
              <span className="font-semibold text-white">
                {paymentAsset?.code || "XLM"}
              </span>
            </div>
          </div>
          {showError && (
            <p className="mt-2 text-xs text-red-400">
              Please enter a positive amount
            </p>
          )}
        </div>

        {estimatedReceived && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/5">
            <p className="text-xs text-mint text-center">
              Creator receives ~{parseFloat(estimatedReceived).toFixed(4)}{" "}
              {recipientAsset.code}
            </p>
          </div>
        )}

        {noPathFound && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-400 text-center">
              No DEX path found from {paymentAsset?.code} to{" "}
              {recipientAsset.code}
            </p>
          </div>
        )}
      </div>

      {/* Recurring Support Toggle */}
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/10 text-mint focus:ring-mint focus:ring-offset-0"
          />
          <span className="text-sm text-white font-medium">
            Make it recurring
          </span>
        </label>

        {isRecurring && (
          <div className="mt-4">
            <label className="text-xs uppercase tracking-[0.2em] text-sky/70 block mb-2">
              Frequency
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFrequency("weekly")}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
                  frequency === "weekly"
                    ? "bg-mint text-ink"
                    : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                Weekly
              </button>
              <button
                type="button"
                onClick={() => setFrequency("monthly")}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
                  frequency === "monthly"
                    ? "bg-mint text-ink"
                    : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                Monthly
              </button>
            </div>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </div>
      )}

      {recurringError && (
        <div className="mt-4 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          {recurringError}
        </div>
      )}

      {submittedHash && (
        <div className="mt-4 rounded-2xl border border-mint/30 bg-mint/10 px-4 py-3 text-sm text-mint">
          {isRecurring && !recurringError ? (
            <>
              Drip activated! You&apos;ll support this creator every{" "}
              {frequency === "weekly" ? "week" : "month"}.
              <br />
              Transaction:{" "}
              <span className="font-semibold text-white">
                {truncateHash(submittedHash)}
              </span>
            </>
          ) : (
            <>
              Transaction submitted:{" "}
              <span className="font-semibold text-white">
                {truncateHash(submittedHash)}
              </span>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleSendSupport}
        disabled={!isValidAmount || isProcessing || noPathFound}
        className="mt-6 w-full rounded-full bg-mint px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-mint"
      >
        {isSubmitting
          ? "Submitting to Stellar network…"
          : isSigning
            ? "Waiting for Freighter signature…"
            : isFindingPath
              ? "Finding best exchange path…"
              : "Send Support"}
      </button>
    </section>
  );
}
