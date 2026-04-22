import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { app } from "./app.js";
import { prisma } from "./db.js";
import { signJWT } from "./auth.js";

const baseUsername = "stellar-dev";
const seedEmail = "builder@novasupport.dev";
const walletAddress = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

let baseUrl = "";
let profileId = "";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let userId = "";
let server: ReturnType<typeof app.listen>;
let authToken = "";

// Helper to get auth headers for protected endpoints
function getAuthHeaders() {
  return {
    "content-type": "application/json",
    "authorization": `Bearer ${authToken}`,
  };
}

const validProfilePayload = {
  displayName: "Test Creator",
  walletAddress,
  acceptedAssets: [{ code: "XLM" }],
};

async function seedProfile() {
  const user = await prisma.user.upsert({
    where: { email: seedEmail },
    update: {},
    create: {
      email: seedEmail
    }
  });

  userId = user.id;
  authToken = signJWT(walletAddress, user.id);

  const profile = await prisma.profile.upsert({
    where: { username: baseUsername },
    update: {},
    create: {
      username: baseUsername,
      displayName: "Stellar Dev Collective",
      bio: "Shipping guides, tools, and experiments that help more builders work on Stellar.",
      walletAddress,
      ownerId: user.id
    }
  });

  await prisma.acceptedAsset.deleteMany({
    where: {
      profileId: profile.id
    }
  });

  await prisma.acceptedAsset.createMany({
    data: [
      {
        code: "XLM",
        profileId: profile.id
      },
      {
        code: "USDC",
        issuer: "GA5ZSEJYB37Y5WZL56FWSOZ5LX5K7Q4SOX7YH3Y2AWJZQURQW6Z5YB2M",
        profileId: profile.id
      }
    ],
    skipDuplicates: true
  });

  profileId = profile.id;
}

async function startServer() {
  await seedProfile();

  server = app.listen(0);
  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve());
  });

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopServer() {
  if (server.listening) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  await prisma.supportTransaction.deleteMany({
    where: {
      txHash: {
        startsWith: "ci-test-"
      }
    }
  });

  await prisma.$disconnect();
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function main() {
  await startServer();

  try {
    await runTest("returns health status", async () => {
      const response = await fetch(`${baseUrl}/health`);

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.service, "NovaSupport backend");
      assert.equal(body.network, "Stellar Testnet");
      assert.equal(body.database, "connected");
    });

    await runTest("returns a seeded profile with accepted assets", async () => {
      const response = await fetch(`${baseUrl}/profiles/${baseUsername}`);

      assert.equal(response.status, 200);

      const profile = await response.json();
      assert.equal(profile.username, baseUsername);
      assert.equal(profile.walletAddress, walletAddress);
      assert.equal(profile.acceptedAssets.length, 2);
    });

    await runTest("returns profile stats summary using only SUCCESS transactions", async () => {
      const supporterOne = `G${"B".repeat(55)}`;
      const supporterTwo = `G${"C".repeat(55)}`;
      const ignoredSupporter = `G${"D".repeat(55)}`;

      await prisma.supportTransaction.createMany({
        data: [
          {
            txHash: `ci-test-${randomUUID()}`,
            amount: "10.5000000",
            assetCode: "XLM",
            status: "SUCCESS",
            stellarNetwork: "TESTNET",
            supporterAddress: supporterOne,
            recipientAddress: walletAddress,
            profileId,
          },
          {
            txHash: `ci-test-${randomUUID()}`,
            amount: "5.0000000",
            assetCode: "XLM",
            status: "SUCCESS",
            stellarNetwork: "TESTNET",
            supporterAddress: supporterTwo,
            recipientAddress: walletAddress,
            profileId,
          },
          {
            txHash: `ci-test-${randomUUID()}`,
            amount: "2.2500000",
            assetCode: "USDC",
            status: "SUCCESS",
            stellarNetwork: "TESTNET",
            supporterAddress: supporterOne,
            recipientAddress: walletAddress,
            profileId,
          },
          {
            txHash: `ci-test-${randomUUID()}`,
            amount: "99.0000000",
            assetCode: "XLM",
            status: "pending",
            stellarNetwork: "TESTNET",
            supporterAddress: ignoredSupporter,
            recipientAddress: walletAddress,
            profileId,
          },
        ],
      });

      const response = await fetch(`${baseUrl}/profiles/${baseUsername}/stats`);

      assert.equal(response.status, 200);

      const body = await response.json();
      assert.deepEqual(body, {
        totalTransactions: 3,
        uniqueSupporters: 2,
        totalAmountXLM: "15.5000000",
      });
    });

    await runTest("returns 404 for stats of unknown profile", async () => {
      const response = await fetch(`${baseUrl}/profiles/nonexistent-user/stats`);

      assert.equal(response.status, 404);

      const body = await response.json();
      assert.equal(body.error, "Profile not found");
    });

    await runTest("GET /profiles supports search across username/displayName with trim and 100-char cap", async () => {
      const suffix = randomUUID().slice(0, 8);
      const displayNameNeedle = `Needle ${suffix}`;
      const oversizedSearch = `   ${"a".repeat(120)}   `;
      const usernameMatch = `search-user-${suffix}`;

      const createByUsername = await fetch(`${baseUrl}/profiles`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...validProfilePayload,
          username: usernameMatch,
          displayName: `Profile ${suffix}`,
        }),
      });
      assert.equal(createByUsername.status, 201);

      const createByDisplayName = await fetch(`${baseUrl}/profiles`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...validProfilePayload,
          username: `search-long-${suffix}`,
          displayName: displayNameNeedle,
        }),
      });
      assert.equal(createByDisplayName.status, 201);

      const withoutSearchResponse = await fetch(`${baseUrl}/profiles`);
      assert.equal(withoutSearchResponse.status, 200);
      const withoutSearch = await withoutSearchResponse.json();
      assert.ok(Array.isArray(withoutSearch.profiles));
      assert.ok(
        withoutSearch.profiles.some((profile: { username: string }) => profile.username === baseUsername),
        "Expected unfiltered profile list to include seeded profile"
      );

      const usernameSearchResponse = await fetch(`${baseUrl}/profiles?search=${encodeURIComponent(usernameMatch.toUpperCase())}`);
      assert.equal(usernameSearchResponse.status, 200);
      const usernameSearch = await usernameSearchResponse.json();
      assert.ok(
        usernameSearch.profiles.some((profile: { username: string }) => profile.username === usernameMatch),
        "Expected case-insensitive username search to match"
      );

      const trimmedSearchResponse = await fetch(`${baseUrl}/profiles?search=${encodeURIComponent(`   ${displayNameNeedle}   `)}`);
      assert.equal(trimmedSearchResponse.status, 200);
      const trimmedSearch = await trimmedSearchResponse.json();
      assert.ok(
        trimmedSearch.profiles.some((profile: { displayName: string }) => profile.displayName === displayNameNeedle),
        "Expected trimmed search to match displayName"
      );

      const sanitizedSearchResponse = await fetch(`${baseUrl}/profiles?search=${encodeURIComponent(oversizedSearch)}`);
      assert.equal(sanitizedSearchResponse.status, 200);
      const sanitizedSearch = await sanitizedSearchResponse.json();
      assert.ok(Array.isArray(sanitizedSearch.profiles));

      const noMatchResponse = await fetch(`${baseUrl}/profiles?search=${encodeURIComponent("definitely-no-profile-match")}`);
      assert.equal(noMatchResponse.status, 200);
      const noMatch = await noMatchResponse.json();
      assert.equal(noMatch.profiles.length, 0);
    });

    await runTest("creates a support transaction when the payload is valid", async () => {
      const response = await fetch(`${baseUrl}/support-transactions`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          txHash: `ci-test-${randomUUID()}`,
          amount: "5.0000000",
          assetCode: "XLM",
          recipientAddress: walletAddress,
          profileId,
          message: "Thanks for maintaining NovaSupport."
        })
      });

      assert.equal(response.status, 201);

      const transaction = await response.json();
      assert.equal(transaction.assetCode, "XLM");
      assert.equal(transaction.status, "pending");
      assert.equal(transaction.profileId, profileId);
    });

    await runTest("returns a validation error for incomplete support payloads", async () => {
      const response = await fetch(`${baseUrl}/support-transactions`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          txHash: "bad"
        })
      });

      assert.equal(response.status, 400);

      const body = await response.json();
      assert.ok(body.error.fieldErrors.amount);
      assert.ok(body.error.fieldErrors.assetCode);
      assert.ok(body.error.fieldErrors.recipientAddress);
      assert.ok(body.error.fieldErrors.profileId);
    });

    await runTest("returns paginated transactions for a valid profile", async () => {
      const txHash = `ci-test-${randomUUID()}`;

      await fetch(`${baseUrl}/support-transactions`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          txHash,
          amount: "10.0000000",
          assetCode: "XLM",
          recipientAddress: walletAddress,
          profileId,
          stellarNetwork: "TESTNET",
          message: "Transaction pagination test"
        })
      });

      const response = await fetch(
        `${baseUrl}/profiles/${baseUsername}/transactions`
      );

      assert.equal(response.status, 200);

      const body = await response.json();
      assert.ok(Array.isArray(body.transactions));
      assert.equal(typeof body.total, "number");
      assert.ok(body.total >= 1);
      assert.equal(body.limit, 20);
      assert.equal(body.offset, 0);
    });

    await runTest("filters transactions by network query param", async () => {
      const response = await fetch(
        `${baseUrl}/profiles/${baseUsername}/transactions?network=TESTNET`
      );

      assert.equal(response.status, 200);

      const body = await response.json();
      assert.ok(Array.isArray(body.transactions));

      for (const tx of body.transactions) {
        assert.equal(tx.stellarNetwork, "TESTNET");
      }
    });

    await runTest("respects limit and offset query params", async () => {
      const response = await fetch(
        `${baseUrl}/profiles/${baseUsername}/transactions?limit=1&offset=0`
      );

      assert.equal(response.status, 200);

      const body = await response.json();
      assert.ok(body.transactions.length <= 1);
      assert.equal(body.limit, 1);
      assert.equal(body.offset, 0);
    });

    await runTest("returns 404 for transactions of unknown profile", async () => {
      const response = await fetch(
        `${baseUrl}/profiles/nonexistent-user/transactions`
      );

      assert.equal(response.status, 404);

      const body = await response.json();
      assert.equal(body.error, "Profile not found");
    });
    await runTest("PATCH updates social fields on a profile", async () => {
      const response = await fetch(`${baseUrl}/profiles/${baseUsername}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          email: "updated@stellar.example",
          websiteUrl: "https://stellar.example",
          twitterHandle: "stellardev",
          githubHandle: "stellar-dev",
        }),
      });

      assert.equal(response.status, 200);

      const profile = await response.json();
      assert.equal(profile.email, "updated@stellar.example");
      assert.equal(profile.websiteUrl, "https://stellar.example");
      assert.equal(profile.twitterHandle, "stellardev");
      assert.equal(profile.githubHandle, "stellar-dev");
    });

    await runTest("PATCH clears nullable social fields when set to null", async () => {
      const response = await fetch(`${baseUrl}/profiles/${baseUsername}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          email: null,
          twitterHandle: null,
        }),
      });

      assert.equal(response.status, 200);

      const profile = await response.json();
      assert.equal(profile.email, null);
      assert.equal(profile.twitterHandle, null);
    });

    await runTest("PATCH rejects invalid social field formats", async () => {
      const response = await fetch(`${baseUrl}/profiles/${baseUsername}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          email: "not-an-email",
        }),
      });

      assert.equal(response.status, 400);
    });

    await runTest("POST rejects invalid Stellar address checksum", async () => {
      const response = await fetch(`${baseUrl}/profiles`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          username: "bad-wallet-test",
          displayName: "Bad Wallet",
          walletAddress: "GBADADDRESSBADADDRESSBADADDRESSBADADDRESSBADADDRESSBADX",
          acceptedAssets: [{ code: "XLM" }],
        }),
      });

      assert.equal(response.status, 400);
    });

    await runTest("PATCH returns 404 for non-existent profile", async () => {
      const response = await fetch(`${baseUrl}/profiles/nonexistent-user`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ displayName: "New Name" }),
      });

      assert.equal(response.status, 404);
    });

    await runTest("POST /profiles - returns 201 with social fields when provided", async () => {
      const response = await fetch(`${baseUrl}/profiles`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...validProfilePayload,
          username: `social-test-${randomUUID().slice(0, 8)}`,
          email: "social@example.com",
          websiteUrl: "https://example.com",
          twitterHandle: "testhandle",
          githubHandle: "testhandle",
        }),
      });

      assert.equal(response.status, 201);
      const profile = await response.json();
      assert.equal(profile.email, "social@example.com");
      assert.equal(profile.websiteUrl, "https://example.com");
      assert.equal(profile.twitterHandle, "testhandle");
      assert.equal(profile.githubHandle, "testhandle");
    });

    await runTest("POST /profiles - returns 409 EMAIL_TAKEN for duplicate email", async () => {
      const dupEmail = `dup-${randomUUID().slice(0, 8)}@example.com`;

      await fetch(`${baseUrl}/profiles`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...validProfilePayload,
          username: `first-${randomUUID().slice(0, 8)}`,
          email: dupEmail,
        }),
      });

      const response = await fetch(`${baseUrl}/profiles`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...validProfilePayload,
          username: `second-${randomUUID().slice(0, 8)}`,
          email: dupEmail,
        }),
      });

      assert.equal(response.status, 409);
      const body = await response.json();
      assert.equal(body.code, "EMAIL_TAKEN");
    });

    await runTest("POST /profiles - returns 400 for invalid email format", async () => {
      const response = await fetch(`${baseUrl}/profiles`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...validProfilePayload,
          username: `inv-email-${randomUUID().slice(0, 8)}`,
          email: "not-an-email",
        }),
      });

      assert.equal(response.status, 400);
    });

    await runTest("POST /profiles - returns 400 for websiteUrl without https", async () => {
      const response = await fetch(`${baseUrl}/profiles`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...validProfilePayload,
          username: `inv-url-${randomUUID().slice(0, 8)}`,
          websiteUrl: "http://example.com",
        }),
      });

      assert.equal(response.status, 400);
    });

    await runTest("POST /profiles - returns 400 for twitterHandle with @ prefix", async () => {
      const response = await fetch(`${baseUrl}/profiles`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...validProfilePayload,
          username: `inv-twit-${randomUUID().slice(0, 8)}`,
          twitterHandle: "@testhandle",
        }),
      });

      assert.equal(response.status, 400);
    });

    // ── Rate Limiting (Requirement 1.1, 2.1, 3.1) ─────────────────────────

    await runTest("GET /health includes RateLimit-Limit and RateLimit-Remaining headers", async () => {
      const response = await fetch(`${baseUrl}/health`);

      assert.equal(response.status, 200);
      assert.ok(
        response.headers.get("ratelimit-limit") !== null,
        "Expected ratelimit-limit header to be present"
      );
      assert.ok(
        response.headers.get("ratelimit-remaining") !== null,
        "Expected ratelimit-remaining header to be present"
      );
    });

    await runTest("POST /support-transactions includes RateLimit-Limit and RateLimit-Remaining headers", async () => {
      const response = await fetch(`${baseUrl}/support-transactions`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          txHash: `ci-test-${randomUUID()}`,
          amount: "1.0000000",
          assetCode: "XLM",
          recipientAddress: walletAddress,
          profileId,
        }),
      });

      // 201 on success; either way headers should be present
      assert.ok(
        response.headers.get("ratelimit-limit") !== null,
        "Expected ratelimit-limit header to be present"
      );
      assert.ok(
        response.headers.get("ratelimit-remaining") !== null,
        "Expected ratelimit-remaining header to be present"
      );
    });

  } finally {
    await stopServer();
  }
}

main().catch((error) => {
  console.error("Backend tests failed.");
  console.error(error);
  process.exit(1);
});
