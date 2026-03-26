import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { app } from "./app.js";
import { prisma } from "./db.js";

const baseUsername = "stellar-dev";
const seedEmail = "builder@novasupport.dev";
const walletAddress = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

let baseUrl = "";
let profileId = "";
let server: ReturnType<typeof app.listen>;

async function seedProfile() {
  const user = await prisma.user.upsert({
    where: { email: seedEmail },
    update: {},
    create: {
      email: seedEmail
    }
  });

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

    await runTest("creates a support transaction when the payload is valid", async () => {
      const response = await fetch(`${baseUrl}/support-transactions`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
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
        headers: {
          "content-type": "application/json"
        },
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
        headers: { "content-type": "application/json" },
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
        headers: { "content-type": "application/json" },
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
        headers: { "content-type": "application/json" },
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "not-an-email",
        }),
      });

      assert.equal(response.status, 400);
    });

    await runTest("POST rejects invalid Stellar address checksum", async () => {
      const response = await fetch(`${baseUrl}/profiles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "bad-wallet-test",
          displayName: "Bad Wallet",
          walletAddress: "GBADADDRESSBADADDRESSBADADDRESSBADADDRESSBADADDRESSBADX",
          ownerId: "test-owner-id",
          acceptedAssets: [{ code: "XLM" }],
        }),
      });

      assert.equal(response.status, 400);
    });

    await runTest("PATCH returns 404 for non-existent profile", async () => {
      const response = await fetch(`${baseUrl}/profiles/nonexistent-user`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "New Name" }),
      });

      assert.equal(response.status, 404);
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
