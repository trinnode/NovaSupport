import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ProfileCard } from "@/components/profile-card";
import { SupportPanel } from "@/components/support-panel";
import { ProfileTabs } from "@/components/profile-tabs";
import { API_BASE_URL } from "@/lib/config";

type PageProps = {
  params: {
    username: string;
  };
};

type Profile = {
  username: string;
  displayName: string;
  bio: string;
  walletAddress: string;
  acceptedAssets: Array<{ code: string; issuer?: string | null }>;
};

type SupportTx = {
  txHash: string;
  amount: string;
  assetCode: string;
  message?: string | null;
  createdAt: string;
  senderAddress: string;
};

async function getProfile(username: string): Promise<Profile> {
  // Use a cache-busting or lower revalidation for profile page
  const res = await fetch(`${API_BASE_URL}/profiles/${username}`, {
    next: { revalidate: 10 }
  });

  if (res.status === 404) {
    notFound();
  }

  if (!res.ok) {
    throw new Error("Failed to fetch profile");
  }

  return res.json();
}

async function getTransactions(username: string, limit = 10): Promise<SupportTx[]> {
  const res = await fetch(
    `${API_BASE_URL}/profiles/${username}/transactions?limit=${limit}`,
    { next: { revalidate: 60 } }
  );

  if (!res.ok) return [];

  const body = await res.json();
  return body.transactions ?? [];
}

export default async function ProfilePage({ params }: PageProps) {
  const [profile, transactions] = await Promise.all([
    getProfile(params.username),
    getTransactions(params.username, 10),
  ]);

  return (
    <AppShell>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 items-start">
        <div className="space-y-12">
          <ProfileCard
            username={profile.username}
            displayName={profile.displayName}
            bio={profile.bio}
            walletAddress={profile.walletAddress}
            acceptedAssets={profile.acceptedAssets}
          />
          
          <div className="px-2">
            <ProfileTabs username={profile.username} />
          </div>
        </div>

        <aside className="sticky top-24">
          <SupportPanel walletAddress={profile.walletAddress} />
          
          <div className="mt-6 rounded-3xl border border-white/5 bg-white/[0.02] p-6">
            <h4 className="text-[10px] uppercase tracking-[0.25em] text-steel font-bold mb-4">
              Campaign Stats
            </h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-sky/60">Total Raised</span>
                <span className="text-sm font-bold text-white">12.4k XLM</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-sky/60">Supporters</span>
                <span className="text-sm font-bold text-white">142</span>
              </div>
              <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mt-2">
                <div className="bg-mint h-full w-[65%]" />
              </div>
              <p className="text-[10px] text-steel text-center italic">
                65% of monthly goal reached
              </p>
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
