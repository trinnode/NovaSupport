import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ProfileCard } from "@/components/profile-card";
import { SupportPanel } from "@/components/support-panel";
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

async function getProfile(username: string): Promise<Profile> {
  const res = await fetch(`${API_BASE_URL}/profiles/${username}`, {
    next: { revalidate: 60 }
  });

  if (res.status === 404) {
    notFound();
  }

  if (!res.ok) {
    throw new Error("Failed to fetch profile");
  }

  return res.json();
}

export default async function ProfilePage({ params }: PageProps) {
  const profile = await getProfile(params.username);

  return (
    <AppShell>
      <div className="space-y-8">
        <ProfileCard
          username={profile.username}
          displayName={profile.displayName}
          bio={profile.bio}
          walletAddress={profile.walletAddress}
          acceptedAssets={profile.acceptedAssets}
        />
        <SupportPanel walletAddress={profile.walletAddress} />
      </div>
    </AppShell>
  );
}

