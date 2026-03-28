import cors from "cors";
import express, { Response } from "express";
import morgan from "morgan";
import { z } from "zod";
import { StrKey } from "@stellar/stellar-sdk";
import { prisma } from "./db.js";

function sendError(res: Response, status: number, message: string, code?: string) {
  return res.status(status).json({ error: message, ...(code ? { code } : {}) });
}

export function createApp() {
  const app = express();

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map(o => o.trim());

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  }));
  app.use(express.json());
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

  // ── Health check with database connectivity ────────────────────────────

  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        ok: true,
        service: "NovaSupport backend",
        network: "Stellar Testnet",
        database: "connected",
      });
    } catch {
      res.status(503).json({
        ok: false,
        service: "NovaSupport backend",
        database: "unreachable",
      });
    }
  });

  // ── List profiles with pagination ──────────────────────────────────────

  app.get("/profiles", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const offset = parseInt(req.query.offset as string) || 0;

      const [profiles, total] = await Promise.all([
        prisma.profile.findMany({
          take: limit,
          skip: offset,
          orderBy: { createdAt: "desc" },
          include: { acceptedAssets: true },
        }),
        prisma.profile.count(),
      ]);

      res.json({ profiles, total, limit, offset });
    } catch {
      return sendError(res, 500, "Internal server error");
    }
  });

  // ── Get profile by username ────────────────────────────────────────────

  app.get("/profiles/:username", async (req, res) => {
    try {
      const profile = await prisma.profile.findUnique({
        where: { username: req.params.username },
        include: {
          acceptedAssets: true,
        },
      });

      if (!profile) {
        return sendError(res, 404, "Profile not found");
      }

      res.json(profile);
    } catch {
      return sendError(res, 500, "Internal server error");
    }
  });

  const stellarAddress = z.string().refine(
    (val) => StrKey.isValidEd25519PublicKey(val),
    { message: "Must be a valid Stellar public key" }
  );

  const createProfileSchema = z.object({
    username: z.string().min(3).max(32).regex(/^[a-z0-9-]+$/),
    displayName: z.string().min(1).max(64),
    bio: z.string().max(280).optional().default(""),
    walletAddress: stellarAddress,
    email: z.string().email().optional().nullable(),
    websiteUrl: z.string().url().startsWith("https://").optional().nullable(),
    twitterHandle: z.string().max(15).regex(/^[a-zA-Z0-9_]+$/).optional().nullable(),
    githubHandle: z.string().max(39).regex(/^[a-zA-Z0-9-]+$/).optional().nullable(),
    ownerId: z.string().min(1),
    acceptedAssets: z.array(z.object({
      code: z.string().min(1).max(12),
      issuer: z.string().optional(),
    })).min(1),
  });

  app.post("/profiles", async (req, res) => {
    const parsed = createProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(res, 400, "Invalid request body");
    }

    const { username, displayName, bio, walletAddress, email, websiteUrl, twitterHandle, githubHandle, ownerId, acceptedAssets } = parsed.data;

    try {
      const profile = await prisma.profile.create({
        data: {
          username,
          displayName,
          bio,
          walletAddress,
          email,
          websiteUrl,
          twitterHandle,
          githubHandle,
          ownerId,
          acceptedAssets: { create: acceptedAssets },
        },
        include: { acceptedAssets: true },
      });
      return res.status(201).json(profile);
    } catch (e: any) {
      if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
        const field = e.meta?.target?.includes("email") ? "Email" : "Username";
        return sendError(res, 409, `${field} already taken`, `${field.toUpperCase()}_TAKEN`);
      }
      return sendError(res, 500, "Internal server error");
    }
  });

  // ── Update profile ────────────────────────────────────────────────────

  const updateProfileSchema = z.object({
    displayName: z.string().min(1).max(64).optional(),
    bio: z.string().max(280).optional(),
    avatarUrl: z.string().url().optional().nullable(),
    email: z.string().email().optional().nullable(),
    websiteUrl: z.string().url().startsWith("https://").optional().nullable(),
    twitterHandle: z.string().max(15).regex(/^[a-zA-Z0-9_]+$/).optional().nullable(),
    githubHandle: z.string().max(39).regex(/^[a-zA-Z0-9-]+$/).optional().nullable(),
  });

  app.patch("/profiles/:username", async (req, res) => {
    const parsed = updateProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      return sendError(res, 400, "Invalid request body");
    }

    const profile = await prisma.profile.findUnique({
      where: { username: req.params.username },
    });

    if (!profile) {
      return sendError(res, 404, "Profile not found");
    }

    try {
      const updated = await prisma.profile.update({
        where: { username: req.params.username },
        data: parsed.data,
        include: { acceptedAssets: true },
      });
      return res.json(updated);
    } catch (e: unknown) {
      if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
        return sendError(res, 409, "Email already in use", "EMAIL_TAKEN");
      }
      return sendError(res, 500, "Internal server error");
    }
  });

  // ── Support transactions ───────────────────────────────────────────────

  const supportPayloadSchema = z.object({
    txHash: z.string().min(3),
    amount: z.string().min(1),
    assetCode: z.string().min(1),
    assetIssuer: z.string().optional().nullable(),
    status: z.string().default("pending"),
    message: z.string().max(280).optional().nullable(),
    stellarNetwork: z.string().default("TESTNET"),
    supporterAddress: z.string().optional().nullable(),
    recipientAddress: z.string().min(1),
    profileId: z.string().min(1),
    supporterId: z.string().optional().nullable(),
  });

  app.get("/profiles/:username/transactions", async (req, res) => {
    const { username } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const network = req.query.network as string | undefined;

    const profile = await prisma.profile.findUnique({
      where: { username },
    });

    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    const where = {
      recipientAddress: profile.walletAddress,
      ...(network ? { stellarNetwork: network } : {}),
    };

    const [transactions, total] = await Promise.all([
      prisma.supportTransaction.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
      }),
      prisma.supportTransaction.count({ where }),
    ]);

    res.json({ transactions, total, limit, offset });
  });

  app.post("/support-transactions", async (req, res) => {
    const parsed = supportPayloadSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const supportRecord = await prisma.supportTransaction.create({
      data: parsed.data,
    });

    res.status(201).json(supportRecord);
  });

  // ── Analytics ──────────────────────────────────────────────────────────

  app.get("/analytics/:campaignId", async (req, res) => {
    // Mock analytics logic (future: fetch optimized views from DB)
    const { campaignId } = req.params;

    const data = {
      summary: {
        totalRaised: 12540.5,
        totalContributors: 142,
        avgContribution: 88.3,
        activeDrips: 12,
      },
      dailyContributions: [
        { date: "2024-03-21", amount: 450 },
        { date: "2024-03-22", amount: 620 },
        { date: "2024-03-23", amount: 380 },
        { date: "2024-03-24", amount: 940 },
        { date: "2024-03-25", amount: 1100 },
        { date: "2024-03-26", amount: 850 },
        { date: "2024-03-27", amount: 1200 },
      ],
      assetBreakdown: [
        { name: "XLM", value: 8500 },
        { name: "USDC", value: 3200 },
        { name: "AQUA", value: 840.5 },
      ],
    };

    if (campaignId === "error") {
      return sendError(res, 404, "Analytics not found for this campaign");
    }

    res.json(data);
  });

  return app;
}

export const app = createApp();
