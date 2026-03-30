import cors from "cors";
import express, { Response } from "express";
import { rateLimit } from "express-rate-limit";
import { pinoHttp } from "pino-http";
import type { Logger } from "pino";
import { z } from "zod";
import { StrKey } from "@stellar/stellar-sdk";
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { prisma } from "./db.js";
import { logger } from "./logger.js";
import { generateChallenge, verifySignature, signJWT, requireAuth, isValidStellarAddress, type AuthContext } from "./auth.js";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

// Extend Express Request to include auth context
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 2_097_152;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }
  },
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseClient = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

if (!supabaseClient) {
  logger.warn("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set — avatar upload endpoint will return 503");
}

function createRateLimiters() {
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });

  const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });

  return { globalLimiter, writeLimiter };
}

function sendError(res: Response, status: number, message: string, code?: string) {
  return res.status(status).json({ error: message, ...(code ? { code } : {}) });
}

export function createApp(customLogger?: Logger) {
  const app = express();
  const { globalLimiter, writeLimiter } = createRateLimiters();

  const swaggerSpec = swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'NovaSupport API',
        version: '1.0.0',
        description: 'Backend API for NovaSupport — Stellar-native creator support platform',
      },
      servers: [{ url: 'http://localhost:4000' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
    apis: ['./src/app.ts'],
  });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/docs.json', (req, res) => res.json(swaggerSpec));

  // In-memory challenge store (stateless with signed timestamp)
  const challenges = new Map<string, { challenge: string; timestamp: number }>();
  const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

  function cleanupExpiredChallenges() {
    const now = Date.now();
    for (const [key, value] of challenges.entries()) {
      if (now - value.timestamp > CHALLENGE_EXPIRY_MS) {
        challenges.delete(key);
      }
    }
  }

  // Cleanup expired challenges every minute
  setInterval(cleanupExpiredChallenges, 60000);

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
  app.use(pinoHttp({ logger: customLogger ?? logger }));
  app.use(globalLimiter);

  /**
   * @openapi
   * /health:
   *   get:
   *     summary: Health check with database connectivity
   *     responses:
   *       200:
   *         description: Service is healthy
   *       503:
   *         description: Service is unhealthy or database is unreachable
   */
  // ── Health check with database connectivity ────────────────────────────

  app.get("/health", async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        ok: true,
        service: "NovaSupport backend",
        network: "Stellar Testnet",
        database: "connected",
      });
    } catch (e: unknown) {
      req.log.error({ err: e }, "health check database error");
      res.status(503).json({
        ok: false,
        service: "NovaSupport backend",
        database: "unreachable",
      });
    }
  });

  // ── Authentication ─────────────────────────────────────────────────────

  /**
   * @openapi
   * /auth/challenge:
   *   post:
   *     summary: Request a challenge nonce for wallet signature
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               walletAddress:
   *                 type: string
   *                 description: User's Stellar wallet address
   *             required:
   *               - walletAddress
   *     responses:
   *       200:
   *         description: Challenge generated
   *       400:
   *         description: Invalid wallet address
   */
  // Request a challenge nonce for wallet signature
  app.post("/auth/challenge", (req, res) => {
    const { walletAddress } = req.body;
    
    if (!walletAddress || !isValidStellarAddress(walletAddress)) {
      return sendError(res, 400, "Invalid wallet address");
    }
    
    const challenge = generateChallenge(walletAddress);
    challenges.set(walletAddress, { challenge, timestamp: Date.now() });
    
    res.json({ challenge, walletAddress });
  });

  // Verify signature and return JWT
  const verifySchema = z.object({
    walletAddress: z.string(),
    signature: z.string(),
  });

  /**
   * @openapi
   * /auth/verify:
   *   post:
   *     summary: Verify signature and return JWT
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               walletAddress:
   *                 type: string
   *                 description: User's Stellar wallet address
   *               signature:
   *                 type: string
   *                 description: Signature of the challenge message
   *             required:
   *               - walletAddress
   *               - signature
   *     responses:
   *       200:
   *         description: Signature verified and JWT returned
   *       400:
   *         description: Invalid request or challenge expired
   *       401:
   *         description: Invalid signature
   */
  app.post("/auth/verify", async (req, res) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "Invalid request body");
    }

    const { walletAddress, signature } = parsed.data;
    
    if (!isValidStellarAddress(walletAddress)) {
      return sendError(res, 400, "Invalid wallet address");
    }

    const challengeData = challenges.get(walletAddress);
    if (!challengeData) {
      return sendError(res, 400, "No challenge found for this wallet");
    }

    // Check if challenge expired
    if (Date.now() - challengeData.timestamp > CHALLENGE_EXPIRY_MS) {
      challenges.delete(walletAddress);
      return sendError(res, 400, "Challenge expired");
    }

    // Verify the signature
    const isValid = verifySignature(walletAddress, challengeData.challenge, signature);
    if (!isValid) {
      return sendError(res, 401, "Invalid signature");
    }

    // Clear the used challenge
    challenges.delete(walletAddress);

    // Create or get user
    let user = await prisma.user.findFirst({
      where: { email: walletAddress },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { email: walletAddress },
      });
    }

    // Sign JWT
    const token = signJWT(walletAddress, user.id);

    res.json({ token, walletAddress, userId: user.id });
  });

  // ── List profiles with pagination ──────────────────────────────────────

  /**
   * @openapi
   * /profiles:
   *   get:
   *     summary: List profiles with pagination
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *         description: Number of profiles to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Number of profiles to skip
   *     responses:
   *       200:
   *         description: List of profiles
   *       500:
   *         description: Internal server error
   */
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
    } catch (e: unknown) {
      req.log.error({ err: e }, "database error listing profiles");
      return sendError(res, 500, "Internal server error");
    }
  });

  // ── Get profile by username ────────────────────────────────────────────

  /**
   * @openapi
   * /profiles/{username}:
   *   get:
   *     summary: Get a profile by username
   *     parameters:
   *       - in: path
   *         name: username
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Profile found
   *       404:
   *         description: Profile not found
   *       500:
   *         description: Internal server error
   */
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
    } catch (e: unknown) {
      req.log.error({ err: e }, "database error fetching profile");
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
    // ownerId removed - now derived from JWT
    acceptedAssets: z.array(z.object({
      code: z.string().min(1).max(12),
      issuer: z.string().optional(),
    })).min(1),
  });

  /**
   * @openapi
   * /profiles:
   *   post:
   *     summary: Create a new profile
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               username:
   *                 type: string
   *               displayName:
   *                 type: string
   *               bio:
   *                 type: string
   *               walletAddress:
   *                 type: string
   *               email:
   *                 type: string
   *                 format: email
   *               websiteUrl:
   *                 type: string
   *                 format: uri
   *               twitterHandle:
   *                 type: string
   *               githubHandle:
   *                 type: string
   *               acceptedAssets:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     code:
   *                       type: string
   *                     issuer:
   *                       type: string
   *                   required:
   *                     - code
   *             required:
   *               - username
   *               - displayName
   *               - walletAddress
   *               - acceptedAssets
   *     responses:
   *       201:
   *         description: Profile created
   *       400:
   *         description: Invalid request body or validation failed
   *       403:
   *         description: Wallet address does not match authenticated user
   *       409:
   *         description: Email or username already taken
   *       500:
   *         description: Internal server error
   */
  app.post("/profiles", requireAuth, writeLimiter, async (req, res) => {
    const parsed = createProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      req.log.warn({ issues: parsed.error.flatten() }, "validation failed");
      return sendError(res, 400, "Invalid request body");
    }

    const { username, displayName, bio, walletAddress, email, websiteUrl, twitterHandle, githubHandle, acceptedAssets } = parsed.data;
    
    // Verify authenticated wallet matches the profile wallet address
    if (!req.auth || req.auth.walletAddress !== walletAddress) {
      return sendError(res, 403, "Forbidden: Wallet address does not match authenticated user");
    }

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
          ownerId: req.auth.userId || req.auth.walletAddress,
          acceptedAssets: { create: acceptedAssets },
        },
        include: { acceptedAssets: true },
      });
      req.log.info({ username: profile.username }, "profile created");
      return res.status(201).json(profile);
    } catch (e: unknown) {
      if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
        const meta = (e as { meta?: { target?: string[] } }).meta;
        const field = meta?.target?.includes("email") ? "Email" : "Username";
        return sendError(res, 409, `${field} already taken`, `${field.toUpperCase()}_TAKEN`);
      }
      req.log.error({ err: e }, "database error creating profile");
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

  /**
   * @openapi
   * /profiles/{username}:
   *   patch:
   *     summary: Update profile
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: username
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               displayName:
   *                 type: string
   *               bio:
   *                 type: string
   *               avatarUrl:
   *                 type: string
   *                 format: uri
   *               email:
   *                 type: string
   *                 format: email
   *               websiteUrl:
   *                 type: string
   *                 format: uri
   *               twitterHandle:
   *                 type: string
   *               githubHandle:
   *                 type: string
   *     responses:
   *       200:
   *         description: Profile updated
   *       400:
   *         description: Invalid request body
   *       403:
   *         description: Authenticated user does not own this profile
   *       404:
   *         description: Profile not found
   *       409:
   *         description: Email already in use
   *       500:
   *         description: Internal server error
   */
  app.patch("/profiles/:username", requireAuth, writeLimiter, async (req, res) => {
    const parsed = updateProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      req.log.warn({ issues: parsed.error.flatten() }, "validation failed");
      return sendError(res, 400, "Invalid request body");
    }

    const username = req.params.username as string;
    const profile = await prisma.profile.findUnique({
      where: { username },
    });

    if (!profile) {
      return sendError(res, 404, "Profile not found");
    }

    // Verify authenticated wallet owns the profile
    if (!req.auth || req.auth.walletAddress !== profile.walletAddress) {
      return sendError(res, 403, "Forbidden: You do not own this profile");
    }

    try {
      const updated = await prisma.profile.update({
        where: { username },
        data: parsed.data,
        include: { acceptedAssets: true },
      });
      return res.json(updated);
    } catch (e: unknown) {
      if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
        return sendError(res, 409, "Email already in use", "EMAIL_TAKEN");
      }
      req.log.error({ err: e }, "database error updating profile");
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

  /**
   * @openapi
   * /profiles/{username}/transactions:
   *   get:
   *     summary: Get profile support transactions
   *     parameters:
   *       - in: path
   *         name: username
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *       - in: query
   *         name: network
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: List of transactions
   *       404:
   *         description: Profile not found
   *       500:
   *         description: Internal server error
   */
  app.get("/profiles/:username/transactions", async (req, res) => {
    const { username } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const network = req.query.network as string | undefined;

    const profile = await prisma.profile.findUnique({
      where: { username },
    });

    if (!profile) {
      return sendError(res, 404, "Profile not found");
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

  /**
   * @openapi
   * /support-transactions:
   *   post:
   *     summary: Record a support transaction
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               txHash:
   *                 type: string
   *               amount:
   *                 type: string
   *               assetCode:
   *                 type: string
   *               assetIssuer:
   *                 type: string
   *               status:
   *                 type: string
   *                 default: pending
   *               message:
   *                 type: string
   *               stellarNetwork:
   *                 type: string
   *                 default: TESTNET
   *               supporterAddress:
   *                 type: string
   *               recipientAddress:
   *                 type: string
   *               profileId:
   *                 type: string
   *               supporterId:
   *                 type: string
   *             required:
   *               - txHash
   *               - amount
   *               - assetCode
   *               - recipientAddress
   *               - profileId
   *     responses:
   *       201:
   *         description: Support transaction recorded
   *       400:
   *         description: Invalid request body
   *       500:
   *         description: Internal server error
   */
  app.post("/support-transactions", requireAuth, writeLimiter, async (req, res) => {
    const parsed = supportPayloadSchema.safeParse(req.body);

    if (!parsed.success) {
      const flat = parsed.error.flatten();
      req.log.warn({ issues: flat }, "validation failed");
      return res.status(400).json({ error: flat });
    }

    const supportRecord = await prisma.supportTransaction.create({
      data: parsed.data,
    });

    req.log.info({ txHash: supportRecord.txHash }, "support transaction recorded");
    res.status(201).json(supportRecord);
  });

  // ── Analytics ──────────────────────────────────────────────────────────

  /**
   * @openapi
   * /analytics/{campaignId}:
   *   get:
   *     summary: Get profile analytics
   *     parameters:
   *       - in: path
   *         name: campaignId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Analytics data
   *       404:
   *         description: Analytics not found
   */
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

  // ── Avatar upload ──────────────────────────────────────────────────────

  /**
   * @openapi
   * /profiles/{username}/avatar:
   *   post:
   *     summary: Update profile avatar
   *     parameters:
   *       - in: path
   *         name: username
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               avatar:
   *                 type: string
   *                 format: binary
   *     responses:
   *       200:
   *         description: Avatar updated
   *       404:
   *         description: Profile not found
   *       413:
   *         description: File too large
   *       422:
   *         description: Invalid file
   *       502:
   *         description: Avatar storage upload failed
   *       503:
   *         description: Avatar upload service unavailable
   */
  app.post(
    "/profiles/:username/avatar",
    writeLimiter,
    upload.single("avatar"),
    async (req, res) => {
      if (!supabaseClient) {
        return sendError(res, 503, "Avatar upload service unavailable");
      }

      const bucket = process.env.SUPABASE_AVATAR_BUCKET;
      if (!bucket) {
        return sendError(res, 503, "Avatar upload service unavailable");
      }

      const username = req.params.username as string;

      const profile = await prisma.profile.findUnique({
        where: { username },
      });

      if (!profile) {
        return sendError(res, 404, "Profile not found");
      }

      const path = `avatars/${username}`;
      const { error: uploadError } = await supabaseClient.storage
        .from(bucket)
        .upload(path, req.file!.buffer, { upsert: true });

      if (uploadError) {
        req.log.error({ err: uploadError }, "supabase storage upload failed");
        return sendError(res, 502, "Avatar storage upload failed");
      }

      const { data: { publicUrl } } = supabaseClient.storage
        .from(bucket)
        .getPublicUrl(path);

      try {
        const updated = await prisma.profile.update({
          where: { username },
          data: { avatarUrl: publicUrl },
          include: { acceptedAssets: true },
        });
        return res.json(updated);
      } catch (e: unknown) {
        req.log.error({ err: e }, "database error updating avatarUrl");
        return sendError(res, 500, "Internal server error");
      }
    }
  );

  // ── Multer error handler ───────────────────────────────────────────────

  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") return sendError(res, 413, "File too large");
      return sendError(res, 422, "Invalid file");
    }
    next(err);
  });

  return app;
}

export const app = createApp();
