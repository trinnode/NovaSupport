import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import type { AddressInfo } from "node:net";
import pino from "pino";
import { createApp } from "./app.js";
import { prisma } from "./db.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Creates a writable stream that collects chunks into a string buffer. */
function makeLogStream(): { stream: Writable; getOutput: () => string } {
  let buf = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  return { stream, getOutput: () => buf };
}

/** Parses newline-delimited JSON log output into an array of objects. */
function parseLogLines(output: string): Record<string, unknown>[] {
  return output
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

type TestServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

async function startTestServer(logStream: Writable): Promise<TestServer> {
  const testLogger = pino({ level: "trace" }, logStream as NodeJS.WritableStream);
  const app = createApp(testLogger);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const close = () =>
    new Promise<void>((resolve, reject) => {
      server.closeAllConnections();
      server.close((err) => (err ? reject(err) : resolve()));
    });
  return { baseUrl, close };
}

// ── Test runner ────────────────────────────────────────────────────────────

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

// ── Seed helpers ───────────────────────────────────────────────────────────

const walletAddress = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

async function seedUser(): Promise<string> {
  const email = `app-test-${randomUUID()}@example.com`;
  const user = await prisma.user.create({ data: { email } });
  return user.id;
}

async function seedProfile(ownerId: string): Promise<string> {
  const profile = await prisma.profile.create({
    data: {
      username: `app-test-${randomUUID().slice(0, 8)}`,
      displayName: "App Test Profile",
      bio: "",
      walletAddress,
      ownerId,
      acceptedAssets: { create: [{ code: "XLM" }] },
    },
  });
  return profile.id;
}

// ── Tests ──────────────────────────────────────────────────────────────────

const hasDb = Boolean(process.env.DATABASE_URL);

async function main() {
  // Test 1: POST /profiles success → captured log has { level: 30, username }
  // Validates: Requirements 4.3
  if (!hasDb) {
    console.log("SKIP POST /profiles success → log has { level: 30, username } (no DATABASE_URL)");
  } else {
    await runTest("POST /profiles success → log has { level: 30, username }", async () => {
      const { stream, getOutput } = makeLogStream();
      const srv = await startTestServer(stream);

      let ownerId: string | undefined;
      try {
        ownerId = await seedUser();
        const username = `log-test-${randomUUID().slice(0, 8)}`;

        const res = await fetch(`${srv.baseUrl}/profiles`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username,
            displayName: "Log Test User",
            walletAddress,
            ownerId,
            acceptedAssets: [{ code: "XLM" }],
          }),
        });

        assert.equal(res.status, 201, `Expected 201, got ${res.status}`);

        // Give the stream a tick to flush
        await new Promise((r) => setImmediate(r));

        const lines = parseLogLines(getOutput());
        const infoEntry = lines.find(
          (l) => l.level === 30 && l.username === username
        );
        assert.ok(
          infoEntry !== undefined,
          `Expected an info log entry with username="${username}". Got:\n${getOutput()}`
        );
      } finally {
        await srv.close();
        if (ownerId) {
          await prisma.profile.deleteMany({ where: { ownerId } });
          await prisma.user.deleteMany({ where: { id: ownerId } });
        }
      }
    });
  }

  // Test 2: POST /profiles validation failure → captured log has { level: 40, issues }
  // Validates: Requirements 5.2
  await runTest("POST /profiles validation failure → log has { level: 40, issues }", async () => {
    const { stream, getOutput } = makeLogStream();
    const srv = await startTestServer(stream);

    try {
      const res = await fetch(`${srv.baseUrl}/profiles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Missing required fields — will fail Zod validation
        body: JSON.stringify({ username: "x" }),
      });

      assert.equal(res.status, 400, `Expected 400, got ${res.status}`);

      await new Promise((r) => setImmediate(r));

      const lines = parseLogLines(getOutput());
      const warnEntry = lines.find(
        (l) => l.level === 40 && l.issues !== undefined
      );
      assert.ok(
        warnEntry !== undefined,
        `Expected a warn log entry with issues field. Got:\n${getOutput()}`
      );
    } finally {
      await srv.close();
    }
  });

  // Test 3: POST /profiles DB error → captured log has { level: 50, err: { message } }
  // Validates: Requirements 5.1
  // Note: This test mocks prisma.profile.create to throw — no real DB needed.
  await runTest("POST /profiles DB error → log has { level: 50, err: { message } }", async () => {
    const { stream, getOutput } = makeLogStream();
    const srv = await startTestServer(stream);

    // Temporarily replace prisma.profile.create to throw
    const originalCreate = prisma.profile.create.bind(prisma.profile);
    (prisma.profile as unknown as Record<string, unknown>).create = async () => {
      throw new Error("simulated DB failure");
    };

    try {
      const res = await fetch(`${srv.baseUrl}/profiles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: `db-err-${randomUUID().slice(0, 8)}`,
          displayName: "DB Error Test",
          walletAddress,
          // Use a fake ownerId — Zod only checks it's a non-empty string
          ownerId: randomUUID(),
          acceptedAssets: [{ code: "XLM" }],
        }),
      });

      assert.equal(res.status, 500, `Expected 500, got ${res.status}`);

      await new Promise((r) => setImmediate(r));

      const lines = parseLogLines(getOutput());
      const errorEntry = lines.find(
        (l) =>
          l.level === 50 &&
          l.err !== undefined &&
          typeof (l.err as Record<string, unknown>).message === "string"
      );
      assert.ok(
        errorEntry !== undefined,
        `Expected an error log entry with err.message. Got:\n${getOutput()}`
      );
    } finally {
      // Restore original
      (prisma.profile as unknown as Record<string, unknown>).create = originalCreate;
      await srv.close();
    }
  });

  // Test 4: POST /support-transactions success → captured log has { level: 30, txHash }
  // Validates: Requirements 4.4
  if (!hasDb) {
    console.log("SKIP POST /support-transactions success → log has { level: 30, txHash } (no DATABASE_URL)");
  } else {
    await runTest("POST /support-transactions success → log has { level: 30, txHash }", async () => {
      const { stream, getOutput } = makeLogStream();
      const srv = await startTestServer(stream);

      let ownerId: string | undefined;
      let profileId: string | undefined;
      const txHash = `app-test-${randomUUID()}`;

      try {
        ownerId = await seedUser();
        profileId = await seedProfile(ownerId);

        const res = await fetch(`${srv.baseUrl}/support-transactions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            txHash,
            amount: "5.0000000",
            assetCode: "XLM",
            recipientAddress: walletAddress,
            profileId,
          }),
        });

        assert.equal(res.status, 201, `Expected 201, got ${res.status}`);

        await new Promise((r) => setImmediate(r));

        const lines = parseLogLines(getOutput());
        const infoEntry = lines.find(
          (l) => l.level === 30 && l.txHash === txHash
        );
        assert.ok(
          infoEntry !== undefined,
          `Expected an info log entry with txHash="${txHash}". Got:\n${getOutput()}`
        );
      } finally {
        await srv.close();
        await prisma.supportTransaction.deleteMany({ where: { txHash } });
        if (profileId) {
          await prisma.acceptedAsset.deleteMany({ where: { profileId } });
          await prisma.profile.deleteMany({ where: { id: profileId } });
        }
        if (ownerId) {
          await prisma.user.deleteMany({ where: { id: ownerId } });
        }
      }
    });
  }

  // Test 5: PATCH /profiles/:username/assets → replaces assets and returns updated profile
  if (!hasDb) {
    console.log("SKIP PATCH /profiles/:username/assets → replaces assets (no DATABASE_URL)");
  } else {
    await runTest("PATCH /profiles/:username/assets → replaces assets and returns updated profile", async () => {
      const srv = await startTestServer(makeLogStream().stream);
      let ownerId: string | undefined;
      let username: string | undefined;
      try {
        ownerId = await seedUser();
        const profile = await prisma.profile.create({
          data: {
            username: `asset-test-${randomUUID().slice(0, 8)}`,
            displayName: "Asset Test",
            bio: "",
            walletAddress,
            ownerId,
            acceptedAssets: { create: [{ code: "XLM" }] },
          },
        });
        username = profile.username;

        const res = await fetch(`${srv.baseUrl}/profiles/${username}/assets`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            assets: [
              { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
            ],
          }),
        });

        assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
        const body = await res.json() as { acceptedAssets: { code: string }[] };
        assert.equal(body.acceptedAssets.length, 1);
        assert.equal(body.acceptedAssets[0].code, "USDC");
      } finally {
        await srv.close();
        if (username) {
          await prisma.acceptedAsset.deleteMany({ where: { profile: { username } } });
          await prisma.profile.deleteMany({ where: { username } });
        }
        if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
      }
    });
  }

  // Test 6: PATCH /profiles/:username/assets → empty array returns 422
  await runTest("PATCH /profiles/:username/assets → empty array returns 422", async () => {
    const srv = await startTestServer(makeLogStream().stream);
    try {
      const res = await fetch(`${srv.baseUrl}/profiles/any-user/assets`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assets: [] }),
      });
      assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
    } finally {
      await srv.close();
    }
  });

  // Test 7: PATCH /profiles/:username/assets → invalid asset code returns 422
  await runTest("PATCH /profiles/:username/assets → invalid asset code returns 422", async () => {
    const srv = await startTestServer(makeLogStream().stream);
    try {
      const res = await fetch(`${srv.baseUrl}/profiles/any-user/assets`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assets: [{ code: "invalid-code!" }] }),
      });
      assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
    } finally {
      await srv.close();
    }
  });

  // Test 8: PATCH /profiles/:username/assets → unknown profile returns 404
  if (!hasDb) {
    console.log("SKIP PATCH /profiles/:username/assets → unknown profile returns 404 (no DATABASE_URL)");
  } else {
    await runTest("PATCH /profiles/:username/assets → unknown profile returns 404", async () => {
      const srv = await startTestServer(makeLogStream().stream);
      try {
        const res = await fetch(`${srv.baseUrl}/profiles/no-such-user-xyz/assets`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ assets: [{ code: "XLM" }] }),
        });
        assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
      } finally {
        await srv.close();
      }
    });
  }

  if (hasDb) await prisma.$disconnect();
}

main().catch((err) => {
  console.error("App integration tests failed.");
  console.error(err);
  if (hasDb) {
    prisma.$disconnect().finally(() => process.exit(1));
  } else {
    process.exit(1);
  }
});
