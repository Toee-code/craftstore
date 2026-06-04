import type { Express } from "express";
import type { Server as HttpServer } from "http";
import { storage, sqlite } from "./storage";
import { insertUserSchema, insertServerSchema, insertProductSchema, insertMemberSchema, insertOrderSchema } from "@shared/schema";
import crypto from "crypto";
import Stripe from "stripe";

// Stripe — uses STRIPE_SECRET_KEY env var (falls back to test mode stub)
const stripeKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2025-03-31.basil" }) : null;

// Public URL for Stripe redirect (deployment proxy or localhost)
function getBaseUrl(req: any): string {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "craftstore_salt").digest("hex");
}

// Generates slug domain from server name: "SkyBlock Network" → "skyblock-network-craftstore.to"
function slugDomain(serverName: string): string {
  return serverName.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    + "-craftstore.to";
}

// Admin secret (env var or hardcoded dev fallback)
const ADMIN_SECRET = process.env.ADMIN_SECRET || "craftstore_admin_2024";
const ROOT_DOMAIN = process.env.ROOT_DOMAIN || "craftstore.org.uk";

// Platform fee rate: 20%
const PLATFORM_FEE_RATE = 0.2;

export async function registerRoutes(httpServer: HttpServer, app: Express) {
  // ── Expo Push Notification helper ────────────────────────────────────────────
async function sendPushNotifications(tokens: string[], title: string, body: string, data?: object) {
  if (!tokens || tokens.length === 0) return;
  const messages = tokens
    .filter(t => t && t.startsWith('ExponentPushToken['))
    .map(token => ({
      to: token,
      sound: 'default' as const,
      title,
      body,
      data: data || {},
      priority: 'high' as const,
    }));
  if (messages.length === 0) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    console.error('[push] Failed to send notifications:', e);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// Health check — used by Railway and monitoring
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  // Apple Pay domain verification
  app.get("/.well-known/apple-developer-merchantid-domain-association", async (_req, res) => {
    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(404).send("Stripe not configured");
      }
      const response = await fetch(
        "https://api.stripe.com/v1/apple_pay/domains",
        { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } }
      );
      // Serve the static Apple Pay domain association file from Stripe CDN
      const fileRes = await fetch(
        "https://stripe.com/.well-known/apple-developer-merchantid-domain-association"
      );
      const text = await fileRes.text();
      res.setHeader("Content-Type", "application/octet-stream");
      res.send(text);
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });


  // ── Auth ─────────────────────────────────────────────────────────────────
  app.post("/api/auth/register", (req, res) => {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) return res.status(400).json({ error: "Missing fields" });
      const existing = storage.getUserByEmail(email);
      if (existing) return res.status(409).json({ error: "Email already registered" });
      const user = storage.createUser({
        username, email,
        passwordHash: hashPassword(password),
        role: "owner",
      });
      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    try {
      const { email, password } = req.body;
      const user = storage.getUserByEmail(email);
      if (!user || user.passwordHash !== hashPassword(password)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/auth/me/:id", (req, res) => {
    const user = storage.getUserById(Number(req.params.id));
    if (!user) return res.status(404).json({ error: "Not found" });
    const { passwordHash, ...safeUser } = user;
    res.json(safeUser);
  });

  // ── Persistent Owner Sessions ────────────────────────────────────────────
  // Create a session token after login (called from frontend after successful login)
  app.post("/api/auth/session", (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "userId required" });
      const user = storage.getUserById(Number(userId));
      if (!user) return res.status(404).json({ error: "User not found" });
      // Clean up expired sessions periodically
      storage.deleteExpiredOwnerSessions();
      // 30-day expiry
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      storage.createOwnerSession(Number(userId), token, expiresAt);
      const { passwordHash, ...safeUser } = user;
      // Return token to frontend — stored in localStorage, sent as x-session-token header
      res.json({ ok: true, token, user: safeUser });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Restore session — token sent via x-session-token header (stored in localStorage)
  app.get("/api/auth/session", (req, res) => {
    try {
      const token = req.headers["x-session-token"] as string;
      if (!token) return res.status(401).json({ error: "No session" });
      const session = storage.getOwnerSession(token);
      if (!session) return res.status(401).json({ error: "Session not found" });
      if (new Date(session.expiresAt) < new Date()) {
        storage.deleteOwnerSession(token);
        return res.status(401).json({ error: "Session expired" });
      }
      const user = storage.getUserById(session.userId);
      if (!user) return res.status(401).json({ error: "User not found" });
      const { passwordHash, ...safeUser } = user;
      res.json({ ok: true, user: safeUser });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete session (logout)
  app.delete("/api/auth/session", (req, res) => {
    try {
      const token = req.headers["x-session-token"] as string;
      if (token) storage.deleteOwnerSession(token);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Servers ───────────────────────────────────────────────────────────────
  app.get("/api/servers", (req, res) => {
    const ownerId = Number(req.query.ownerId);
    if (!ownerId) return res.status(400).json({ error: "ownerId required" });
    res.json(storage.getServersByOwner(ownerId));
  });

  app.post("/api/servers", (req, res) => {
    try {
      const parsed = insertServerSchema.parse(req.body);
      const secret = crypto.randomBytes(16).toString("hex");
      const server = storage.createServer({ ...parsed, webhookSecret: secret });
      res.json(server);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/servers/:id", (req, res) => {
    const server = storage.getServerById(Number(req.params.id));
    if (!server) return res.status(404).json({ error: "Not found" });
    res.json(server);
  });

  app.patch("/api/servers/:id", (req, res) => {
    const server = storage.updateServer(Number(req.params.id), req.body);
    if (!server) return res.status(404).json({ error: "Not found" });
    res.json(server);
  });

  app.delete("/api/servers/:id", (req, res) => {
    storage.deleteServer(Number(req.params.id));
    res.json({ success: true });
  });

  // POST /api/servers/:id/upload-logo — accepts base64 data URL, saves as logoUrl
  app.post("/api/servers/:id/upload-logo", (req, res) => {
    try {
      const { dataUrl } = req.body;
      if (!dataUrl || !dataUrl.startsWith("data:image/")) {
        return res.status(400).json({ error: "Invalid image data" });
      }
      // Limit to ~2MB (base64 ~2.7MB raw)
      if (dataUrl.length > 2_800_000) {
        return res.status(413).json({ error: "Image too large — max 2MB" });
      }
      const server = storage.updateServer(Number(req.params.id), { logoUrl: dataUrl } as any);
      if (!server) return res.status(404).json({ error: "Not found" });
      res.json({ logoUrl: dataUrl });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/upload-image — generic image upload (base64 data URL), returns url
  app.post("/api/upload-image", (req, res) => {
    try {
      const { dataUrl } = req.body;
      if (!dataUrl || !dataUrl.startsWith("data:image/")) {
        return res.status(400).json({ error: "Invalid image data" });
      }
      if (dataUrl.length > 2_800_000) {
        return res.status(413).json({ error: "Image too large — max 2MB" });
      }
      res.json({ url: dataUrl });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/upload-banner — image OR video upload up to 20MB, returns url
  app.post("/api/upload-banner", (req, res) => {
    try {
      const { dataUrl } = req.body;
      if (!dataUrl) return res.status(400).json({ error: "No data provided" });
      const isImage = dataUrl.startsWith("data:image/");
      const isVideo = dataUrl.startsWith("data:video/");
      if (!isImage && !isVideo) {
        return res.status(400).json({ error: "Only image or video files are supported" });
      }
      // ~27MB base64 = ~20MB raw file
      if (dataUrl.length > 27_000_000) {
        return res.status(413).json({ error: "File too large — max 20MB" });
      }
      res.json({ url: dataUrl });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Products ──────────────────────────────────────────────────────────────
  app.get("/api/servers/:serverId/products", (req, res) => {
    res.json(storage.getProductsByServer(Number(req.params.serverId)));
  });

  app.post("/api/servers/:serverId/products", (req, res) => {
    try {
      const body = { ...req.body, serverId: Number(req.params.serverId) };
      // Convert boolean fields → integer for SQLite
      if (typeof body.enchanted === "boolean") body.enchanted = body.enchanted ? 1 : 0;
      if (typeof body.featured === "boolean") body.featured = body.featured ? 1 : 0;
      if (typeof body.preorder === "boolean") body.preorder = body.preorder ? 1 : 0;
      const parsed = insertProductSchema.parse(body);
      res.json(storage.createProduct(parsed));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch("/api/products/:id", (req, res) => {
    const body = { ...req.body };
    // Convert boolean fields → integer for SQLite
    if (typeof body.enchanted === "boolean") body.enchanted = body.enchanted ? 1 : 0;
    if (typeof body.featured === "boolean") body.featured = body.featured ? 1 : 0;
    if (typeof body.preorder === "boolean") body.preorder = body.preorder ? 1 : 0;
    const product = storage.updateProduct(Number(req.params.id), body);
    if (!product) return res.status(404).json({ error: "Not found" });
    res.json(product);
  });

  app.delete("/api/products/:id", (req, res) => {
    storage.deleteProduct(Number(req.params.id));
    res.json({ success: true });
  });

  // ── Members ───────────────────────────────────────────────────────────────
  app.get("/api/servers/:serverId/members", (req, res) => {
    res.json(storage.getMembersByServer(Number(req.params.serverId)));
  });

  app.post("/api/servers/:serverId/members", (req, res) => {
    try {
      const parsed = insertMemberSchema.parse({ ...req.body, serverId: Number(req.params.serverId) });
      res.json(storage.createMember(parsed));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch("/api/members/:id/balance", (req, res) => {
    const { balance } = req.body;
    const member = storage.updateMemberBalance(Number(req.params.id), balance);
    if (!member) return res.status(404).json({ error: "Not found" });
    res.json(member);
  });

  app.delete("/api/members/:id", (req, res) => {
    storage.deleteMember(Number(req.params.id));
    res.json({ success: true });
  });

  // ── Orders ────────────────────────────────────────────────────────────────
  app.get("/api/servers/:serverId/orders", (req, res) => {
    res.json(storage.getOrdersByServer(Number(req.params.serverId)));
  });

  // ── Leaderboard ───────────────────────────────────────────────────────────
  // period: "monthly" | "yearly" | "alltime"
  app.get("/api/servers/:serverId/leaderboard", (req, res) => {
    const serverId = Number(req.params.serverId);
    const period = (req.query.period as string) || "alltime";
    let since: string | null = null;
    if (period === "monthly") {
      const d = new Date();
      d.setDate(1); d.setHours(0, 0, 0, 0);
      since = d.toISOString();
    } else if (period === "yearly") {
      const d = new Date();
      d.setMonth(0); d.setDate(1); d.setHours(0, 0, 0, 0);
      since = d.toISOString();
    }
    const rows = storage.getTopSpenders(serverId, since);
    // Normalise column name (raw SQL returns snake_case)
    const result = rows.map((r: any, i: number) => ({
      rank: i + 1,
      minecraftUsername: r.minecraft_username || r.minecraftUsername,
      total: Number(r.total),
    }));
    res.json(result);
  });


  // Most purchased products
  app.get("/api/servers/:serverId/most-purchased", (req, res) => {
    const serverId = Number(req.params.serverId);
    const limit = Number(req.query.limit) || 5;
    res.json(storage.getMostPurchased(serverId, limit));
  });

  // ── Creator Codes ──────────────────────────────────────────────────────────
  // List codes for a server
  app.get("/api/servers/:serverId/creator-codes", (req, res) => {
    const serverId = Number(req.params.serverId);
    res.json(storage.getCreatorCodesByServer(serverId));
  });

  // Create a new creator code
  app.post("/api/servers/:serverId/creator-codes", (req, res) => {
    const serverId = Number(req.params.serverId);
    const { code, creatorName, rewardPercent, discountPercent } = req.body;
    if (!code || !creatorName) return res.status(400).json({ error: "code and creatorName required" });
    // Check uniqueness within server
    const existing = storage.getCreatorCodeByCode(serverId, code);
    if (existing) return res.status(409).json({ error: "Code already exists for this server" });
    const created = storage.createCreatorCode({
      serverId,
      code: code.toUpperCase(),
      creatorName,
      rewardPercent: Number(rewardPercent) || 10,
      discountPercent: Number(discountPercent) || 0,
      active: 1,
    });
    res.json(created);
  });

  // Delete a creator code
  app.delete("/api/creator-codes/:id", (req, res) => {
    const id = Number(req.params.id);
    storage.deleteCreatorCode(id);
    res.json({ success: true });
  });

  // Validate a creator code (player-facing — returns discount % if valid)
  app.post("/api/servers/:serverId/validate-creator-code", (req, res) => {
    const serverId = Number(req.params.serverId);
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "code required" });
    const cc = storage.getCreatorCodeByCode(serverId, code);
    if (!cc) return res.status(404).json({ error: "Invalid or inactive code" });
    res.json({ valid: true, creatorName: cc.creatorName, discountPercent: cc.discountPercent, rewardPercent: cc.rewardPercent });
  });

  // Public purchase endpoint (player-facing store)
  app.post("/api/purchase", async (req, res) => {
    try {
      const { productId, minecraftUsername, serverId, creatorCode } = req.body;
      if (!productId || !minecraftUsername || !serverId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const product = storage.getProductById(Number(productId));
      if (!product || !product.active) return res.status(404).json({ error: "Product not found" });

      const server = storage.getServerById(Number(serverId));
      if (!server) return res.status(404).json({ error: "Server not found" });

      // Determine fee mode
      const theme = storage.getStoreTheme(Number(serverId));
      const feeMode = theme?.feeMode || "absorb";

      // Creator code discount
      let creatorCodeRecord: any = null;
      let creatorDiscount = 0;
      if (creatorCode) {
        creatorCodeRecord = storage.getCreatorCodeByCode(Number(serverId), creatorCode);
        if (creatorCodeRecord) creatorDiscount = creatorCodeRecord.discountPercent || 0;
      }

      // Player price: passthrough = base + 20%, absorb = base price, then apply creator discount
      const basePrice = product.price;
      const platformFee = Math.round(basePrice * PLATFORM_FEE_RATE * 100) / 100;
      const priceBeforeDiscount = feeMode === "passthrough"
        ? Math.round((basePrice + platformFee) * 100) / 100
        : basePrice;
      const playerPrice = creatorDiscount > 0
        ? Math.round(priceBeforeDiscount * (1 - creatorDiscount / 100) * 100) / 100
        : priceBeforeDiscount;

      // Check member balance — auto-create member record if they have a valid account
      let member = storage.getMemberByUsername(Number(serverId), minecraftUsername);
      if (!member) {
        const account = storage.getMemberAccount(Number(serverId), minecraftUsername);
        if (!account) return res.status(404).json({ error: "Player not found in this server" });
        // Auto-create member record for this server
        member = storage.createMember({ serverId: Number(serverId), minecraftUsername, balance: 0, totalSpent: 0 });
      }
      if (member.balance < playerPrice) return res.status(402).json({ error: "Insufficient balance" });

      // Deduct balance
      storage.updateMemberBalance(member.id, member.balance - playerPrice);
      storage.updateMemberTotalSpent(member.id, playerPrice);

      // Create order
      const order = storage.createOrder({
        serverId: Number(serverId),
        productId: product.id,
        memberId: member.id,
        minecraftUsername,
        amount: playerPrice,
        platformFee,
        status: "pending",
        webhookDelivered: false,
        creatorCodeUsed: creatorCodeRecord ? creatorCodeRecord.code : null,
        creatorCodeDiscount: creatorDiscount,
      });
      // Credit creator code earnings
      if (creatorCodeRecord) {
        storage.updateCreatorCodeEarnings(creatorCodeRecord.id, Math.round(playerPrice * (creatorCodeRecord.rewardPercent / 100) * 100));
      }

      // Fire push notification to server owner
    try {
      const tokens = storage.getDeviceTokensForServer(Number(serverId));
      if (tokens.length > 0) {
        await sendPushNotifications(
          tokens,
          '💰 New Purchase!',
          `${minecraftUsername} bought ${product.name} for £${playerPrice.toFixed(2)}`,
          { serverId, orderId: order.id, productName: product.name, minecraftUsername }
        );
      }
    } catch (pushErr) {
      console.error('[push] notification error:', pushErr);
    }

    // Fire webhook if configured (skip for preorders — hold as pending until release date)
      if ((product as any).preorder) {
        storage.updateOrderStatus(order.id, "pending", false);
      } else if (server.webhookUrl) {
        const command = product.command.replace("{player}", minecraftUsername);
        const commands = command.split("\n").map((c: string) => c.trim()).filter(Boolean);
        const payload = {
          event: "purchase",
          orderId: order.id,
          minecraftUsername,
          command,
          commands,
          preorder: false,
          preorderReleaseDate: null,
          product: { id: product.id, name: product.name },
          secret: server.webhookSecret,
        };
        try {
          const response = await fetch(server.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CraftStore-Secret": server.webhookSecret || "" },
            body: JSON.stringify(payload),
          });
          if (response.ok) {
            storage.updateOrderStatus(order.id, "completed", true);
          } else {
            storage.updateOrderStatus(order.id, "failed", false);
          }
        } catch {
          storage.updateOrderStatus(order.id, "failed", false);
        }
      } else {
        storage.updateOrderStatus(order.id, "completed", false);
      }

      // Notify the server owner
      const owner = storage.getUserById(server.ownerId);
      if (owner) {
        storage.createNotification({
          userId: owner.id,
          message: `${minecraftUsername} purchased ${product.name} on ${server.name} (£${playerPrice.toFixed(2)})`,
          read: false,
        });
      }

      const updatedOrder = storage.getOrderById(order.id);
      res.json({ success: true, order: updatedOrder });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Notifications ─────────────────────────────────────────────────────────
  app.get("/api/notifications/:userId", (req, res) => {
    res.json(storage.getNotificationsByUser(Number(req.params.userId)));
  });

  app.patch("/api/notifications/:id/read", (req, res) => {
    storage.markNotificationRead(Number(req.params.id));
    res.json({ success: true });
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  app.get("/api/servers/:serverId/stats", (req, res) => {
    const serverId = Number(req.params.serverId);
    const allOrders = storage.getOrdersByServer(serverId);
    const completedOrders = allOrders.filter(o => o.status === "completed" || o.status === "failed" || o.status === "pending");
    const revenue = completedOrders.reduce((sum, o) => sum + o.amount, 0);
    const platformRevenue = completedOrders.reduce((sum, o) => sum + (o.platformFee || 0), 0);
    const membersList = storage.getMembersByServer(serverId);
    const productsList = storage.getProductsByServer(serverId);
    res.json({
      totalRevenue: revenue,
      platformRevenue,
      totalOrders: allOrders.length,
      completedOrders: completedOrders.length,
      totalMembers: membersList.length,
      totalProducts: productsList.length,
    });
  });

  // ── Store Theme ───────────────────────────────────────────────────
  app.get("/api/servers/:serverId/theme", (req, res) => {
    const theme = storage.getStoreTheme(Number(req.params.serverId));
    if (!theme) return res.json({
      serverId: Number(req.params.serverId),
      layout: "grid", colorScheme: "dark", accentColor: "#22c55e",
      bannerUrl: null, startPage: "all", announcementText: null,
      categories: "[]", subcategories: "{}", feeMode: "absorb", activePresetId: null,
    });
    res.json(theme);
  });

  app.post("/api/servers/:serverId/theme", (req, res) => {
    try {
      const theme = storage.upsertStoreTheme({ ...req.body, serverId: Number(req.params.serverId) });
      res.json(theme);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // PATCH — merge partial fields into existing theme (won't wipe other fields)
  app.patch("/api/servers/:serverId/theme", (req, res) => {
    try {
      const serverId = Number(req.params.serverId);
      const existing = storage.getStoreTheme(serverId);
      const merged = { ...(existing || {}), ...req.body, serverId };
      const theme = storage.upsertStoreTheme(merged);
      res.json(theme);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── Presets ──────────────────────────────────────────────────────────────
  // List all presets (marketplace)
  app.get("/api/presets", (req, res) => {
    res.json(storage.getAllPresets());
  });

  // Get owner's purchased presets
  app.get("/api/owners/:ownerId/preset-purchases", (req, res) => {
    res.json(storage.getOwnerPresetPurchases(Number(req.params.ownerId)));
  });

  // Free-preset claim (price === 0 only)
  app.post("/api/owners/:ownerId/preset-purchases", (req, res) => {
    try {
      const ownerId = Number(req.params.ownerId);
      const { presetId, serverId } = req.body;
      if (!presetId) return res.status(400).json({ error: "presetId required" });

      const preset = storage.getPresetById(Number(presetId));
      if (!preset) return res.status(404).json({ error: "Preset not found" });
      if (preset.price > 0) return res.status(400).json({ error: "Use Stripe checkout for paid presets" });

      const already = storage.hasOwnerPurchasedPreset(ownerId, Number(presetId));
      if (already) return res.status(409).json({ error: "Already purchased" });

      const purchase = storage.purchasePreset({
        ownerId,
        presetId: Number(presetId),
        serverId: serverId ? Number(serverId) : null,
      });
      res.json(purchase);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── Stripe Checkout ─────────────────────────────────────────────────────────────────────
  // Create a Stripe checkout session for a preset purchase
  app.post("/api/stripe/checkout", async (req, res) => {
    try {
      const { ownerId, presetId, serverId } = req.body;
      if (!ownerId || !presetId) return res.status(400).json({ error: "ownerId and presetId required" });

      const preset = storage.getPresetById(Number(presetId));
      if (!preset) return res.status(404).json({ error: "Preset not found" });
      if (preset.price === 0) return res.status(400).json({ error: "Free presets use the claim endpoint" });

      const already = storage.hasOwnerPurchasedPreset(Number(ownerId), Number(presetId));
      if (already) return res.status(409).json({ error: "Already owned" });

      // If no Stripe key, simulate a successful session (demo mode)
      if (!stripe) {
        const fakeSessionId = `demo_${crypto.randomBytes(8).toString("hex")}`;
        storage.createCheckoutSession({
          stripeSessionId: fakeSessionId,
          ownerId: Number(ownerId),
          presetId: Number(presetId),
          serverId: serverId ? Number(serverId) : null,
          status: "pending",
        });
        return res.json({ sessionId: fakeSessionId, url: null, demoMode: true });
      }

      const baseUrl = getBaseUrl(req);
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "gbp",
            product_data: {
              name: `CraftStore Preset: ${preset.name}`,
              description: preset.description,
            },
            unit_amount: Math.round(preset.price * 100),
          },
          quantity: 1,
        }],
        metadata: {
          ownerId: String(ownerId),
          presetId: String(presetId),
          serverId: serverId ? String(serverId) : "",
        },
        success_url: `${baseUrl}/#/preset-success?session_id={CHECKOUT_SESSION_ID}&serverId=${serverId || ""}`,
        cancel_url: `${baseUrl}/#/servers/${serverId}?tab=presets&cancelled=1`,
      });

      storage.createCheckoutSession({
        stripeSessionId: session.id,
        ownerId: Number(ownerId),
        presetId: Number(presetId),
        serverId: serverId ? Number(serverId) : null,
        status: "pending",
      });

      res.json({ sessionId: session.id, url: session.url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Creator Code Payout Claims ────────────────────────────────────────────
  // Public: get creator code info + balance for the claim page
  app.get("/api/creator-codes/info", (req, res) => {
    const { code, serverId } = req.query;
    if (!code || !serverId) return res.status(400).json({ error: "code and serverId required" });
    const cc = storage.getCreatorCodeByCode(Number(serverId), String(code));
    if (!cc) return res.status(404).json({ error: "Invalid or inactive code" });
    const pending = storage.getCreatorCodePayoutsByCode(cc.id).filter((p: any) => p.status === "pending");
    const serverObj = storage.getServerById(Number(serverId));
    res.json({ creatorName: cc.creatorName, code: cc.code, totalEarned: cc.totalEarned, hasPendingClaim: pending.length > 0, serverName: serverObj?.name || `Server ${serverId}` });
  });

  // Public: creator submits a payout request
  app.post("/api/creator-codes/claim", async (req, res) => {
    try {
      const { code, serverId, paypalEmail } = req.body;
      if (!code || !serverId || !paypalEmail) return res.status(400).json({ error: "code, serverId, paypalEmail required" });
      const cc = storage.getCreatorCodeByCode(Number(serverId), code);
      if (!cc) return res.status(404).json({ error: "Invalid or inactive code" });
      if (cc.totalEarned <= 0) return res.status(400).json({ error: "No earnings to claim yet" });
      const existing = storage.getCreatorCodePayoutsByCode(cc.id).filter((p: any) => p.status === "pending");
      if (existing.length > 0) return res.status(409).json({ error: "You already have a pending claim — wait for the owner to review it" });
      const payout = storage.createCreatorCodePayout({
        creatorCodeId: cc.id,
        serverId: Number(serverId),
        creatorName: cc.creatorName,
        code: cc.code,
        amountRequested: cc.totalEarned,
        paypalEmail,
        status: "pending",
      });
      const server = storage.getServerById(Number(serverId));
      if (server) {
        const owner = storage.getUserById(server.ownerId);
        if (owner) {
          storage.createNotification({ userId: owner.id, message: `Creator ${cc.creatorName} (${cc.code}) requested a payout of £${(cc.totalEarned / 100).toFixed(2)} via PayPal`, read: false });
        }
      }
      res.json({ success: true, payout });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Owner: list payout requests for their server
  app.get("/api/servers/:serverId/creator-payouts", (req, res) => {
    res.json(storage.getCreatorCodePayoutsByServer(Number(req.params.serverId)));
  });

  // Owner: approve / reject / mark paid
  app.patch("/api/creator-payouts/:id", (req, res) => {
    const { status, ownerNote } = req.body;
    if (!["approved", "rejected", "paid"].includes(status)) return res.status(400).json({ error: "status must be approved, rejected or paid" });
    storage.updateCreatorCodePayoutStatus(Number(req.params.id), status, ownerNote);
    res.json({ success: true });
  });

  // ── Direct product purchase via Stripe Checkout ────────────────────────────
  app.post("/api/stripe/product-checkout", async (req, res) => {
    try {
      const { productId, serverId, minecraftUsername, creatorCode } = req.body;
      if (!productId || !serverId || !minecraftUsername) {
        return res.status(400).json({ error: "productId, serverId and minecraftUsername required" });
      }

      const product = storage.getProductById(Number(productId));
      if (!product || !product.active) return res.status(404).json({ error: "Product not found" });

      const server = storage.getServerById(Number(serverId));
      if (!server) return res.status(404).json({ error: "Server not found" });

      const theme = storage.getStoreTheme(Number(serverId));
      const feeMode = theme?.feeMode || "absorb";
      const basePrice = product.price;
      const platformFee = Math.round(basePrice * PLATFORM_FEE_RATE * 100) / 100;
      const priceBeforeDiscount = feeMode === "passthrough"
        ? Math.round((basePrice + platformFee) * 100) / 100
        : basePrice;

      // Creator code discount
      let ccRecord: any = null;
      let ccDiscount = 0;
      if (creatorCode) {
        ccRecord = storage.getCreatorCodeByCode(Number(serverId), creatorCode);
        if (ccRecord) ccDiscount = ccRecord.discountPercent || 0;
      }
      const playerPrice = ccDiscount > 0
        ? Math.round(priceBeforeDiscount * (1 - ccDiscount / 100) * 100) / 100
        : priceBeforeDiscount;

      const baseUrl = getBaseUrl(req);

      // Demo mode — no Stripe key
      if (!stripe) {
        let member = storage.getMemberByUsername(Number(serverId), minecraftUsername);
        if (!member) member = storage.createMember({ serverId: Number(serverId), minecraftUsername, balance: 0, totalSpent: 0 });
        const order = storage.createOrder({ serverId: Number(serverId), productId: Number(productId), memberId: member.id, minecraftUsername, amount: playerPrice, platformFee, status: "completed", webhookDelivered: false, creatorCodeUsed: ccRecord ? ccRecord.code : null, creatorCodeDiscount: ccDiscount });
        if (ccRecord) storage.updateCreatorCodeEarnings(ccRecord.id, Math.round(playerPrice * (ccRecord.rewardPercent / 100) * 100));
        storage.updateMemberTotalSpent(member.id, playerPrice);
        if (server.webhookUrl) {
          const command = product.command.replace("%player%", minecraftUsername).replace("{player}", minecraftUsername);
          const commands = command.split("\n").map((c: string) => c.trim()).filter(Boolean);
          try {
            await fetch(server.webhookUrl, { method: "POST", headers: { "Content-Type": "application/json", "X-CraftStore-Secret": server.webhookSecret || "" }, body: JSON.stringify({ event: "purchase", orderId: order.id, minecraftUsername, command, commands, preorder: !!(product as any).preorder, preorderReleaseDate: (product as any).preorderReleaseDate || null, product: { id: product.id, name: product.name }, productName: product.name, secret: server.webhookSecret }) });
            storage.updateOrderStatus(order.id, "completed", true);
          } catch { storage.updateOrderStatus(order.id, "failed", false); }
        }
        return res.json({ success: true, demoMode: true, orderId: order.id });
      }

      // Real Stripe — create checkout session
      // No payment_method_types restriction = Stripe auto-shows Apple Pay, Google Pay, card etc.
      const sessionParams: any = {
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "gbp",
            product_data: {
              name: product.name,
              description: product.description || `Purchase from ${server.name}`,
            },
            unit_amount: Math.round(playerPrice * 100),
          },
          quantity: 1,
        }],
        metadata: {
          type: "product_purchase",
          productId: String(productId),
          serverId: String(serverId),
          minecraftUsername,
          ...(creatorCode ? { creatorCode } : {}),
        },
        success_url: `${baseUrl}/#/store/${serverId}?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/#/store/${serverId}`,
      };

      // If server has Stripe Connect, route payment to them with platform fee
      if (server.stripeAccountId && server.stripeConnectStatus === "active") {
        sessionParams.payment_intent_data = {
          application_fee_amount: Math.round(platformFee * 100),
          transfer_data: { destination: server.stripeAccountId },
        };
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      // Store pending direct purchase session
      storage.createCheckoutSession({
        stripeSessionId: session.id,
        ownerId: server.ownerId,
        presetId: 0, // not a preset
        serverId: Number(serverId),
        status: "pending",
        metadata: JSON.stringify({ type: "product_purchase", productId, minecraftUsername, creatorCode: creatorCode || null }),
      } as any);

      res.json({ url: session.url, sessionId: session.id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Confirm direct product purchase after Stripe success
  app.post("/api/stripe/product-confirm", async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: "sessionId required" });

      if (stripe) {
        const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
        if (stripeSession.payment_status !== "paid") {
          return res.status(402).json({ error: "Payment not completed" });
        }
        const meta = stripeSession.metadata || {};
        if (meta.type !== "product_purchase") return res.status(400).json({ error: "Wrong session type" });

        const { productId, serverId, minecraftUsername, creatorCode: savedCode } = meta;
        const product = storage.getProductById(Number(productId));
        const server = storage.getServerById(Number(serverId));
        if (!product || !server) return res.status(404).json({ error: "Product or server not found" });

        const theme = storage.getStoreTheme(Number(serverId));
        const feeMode = theme?.feeMode || "absorb";
        const basePrice = product.price;
        const platformFee = Math.round(basePrice * PLATFORM_FEE_RATE * 100) / 100;
        const priceBeforeDiscount = feeMode === "passthrough"
          ? Math.round((basePrice + platformFee) * 100) / 100
          : basePrice;
        // Re-apply creator code discount from metadata
        let confirmCC: any = null;
        let confirmCCDiscount = 0;
        if (savedCode) {
          confirmCC = storage.getCreatorCodeByCode(Number(serverId), savedCode);
          if (confirmCC) confirmCCDiscount = confirmCC.discountPercent || 0;
        }
        const playerPrice = confirmCCDiscount > 0
          ? Math.round(priceBeforeDiscount * (1 - confirmCCDiscount / 100) * 100) / 100
          : priceBeforeDiscount;

        let member = storage.getMemberByUsername(Number(serverId), minecraftUsername);
        if (!member) member = storage.createMember({ serverId: Number(serverId), minecraftUsername, balance: 0, totalSpent: 0 });

        const order = storage.createOrder({
          serverId: Number(serverId),
          productId: Number(productId),
          memberId: member.id,
          minecraftUsername,
          amount: playerPrice,
          platformFee,
          status: "pending",
          webhookDelivered: false,
          creatorCodeUsed: confirmCC ? confirmCC.code : null,
          creatorCodeDiscount: confirmCCDiscount,
        });
        if (confirmCC) storage.updateCreatorCodeEarnings(confirmCC.id, Math.round(playerPrice * (confirmCC.rewardPercent / 100) * 100));
        storage.updateMemberTotalSpent(member.id, playerPrice);

        // Fire webhook to Minecraft server (skip for preorders)
        if ((product as any).preorder) {
          storage.updateOrderStatus(order.id, "pending", false);
        } else if (server.webhookUrl) {
          const command = product.command.replace("%player%", minecraftUsername).replace("{player}", minecraftUsername);
          const commands = command.split("\n").map((c: string) => c.trim()).filter(Boolean);
          try {
            const wResp = await fetch(server.webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-CraftStore-Secret": server.webhookSecret || "" },
              body: JSON.stringify({ event: "purchase", orderId: order.id, minecraftUsername, command, commands, preorder: false, preorderReleaseDate: null, product: { id: product.id, name: product.name }, productName: product.name, secret: server.webhookSecret }),
            });
            storage.updateOrderStatus(order.id, wResp.ok ? "completed" : "failed", wResp.ok);
          } catch {
            storage.updateOrderStatus(order.id, "failed", false);
          }
        } else {
          storage.updateOrderStatus(order.id, "completed", false);
        }

        // Send push notification to server owner
        try {
          const tokens = storage.getDeviceTokensForServer(Number(serverId));
          if (tokens.length > 0) {
            await sendPushNotifications(
              tokens,
              '💰 New Purchase!',
              `${minecraftUsername} bought ${product.name} for £${playerPrice.toFixed(2)}`,
              { serverId, orderId: order.id, productName: product.name, minecraftUsername }
            );
          }
        } catch (pushErr) {
          console.error('[push] notification error:', pushErr);
        }

        // Notify server owner in-app
        const owner = storage.getUserById(server.ownerId);
        if (owner) {
          storage.createNotification({
            userId: owner.id,
            message: `${minecraftUsername} purchased ${product.name} on ${server.name} (£${playerPrice.toFixed(2)}) via direct payment`,
            read: false,
          });
        }

        return res.json({ success: true, orderId: order.id });
      }

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Verify & complete a checkout session (called from success page)
  app.post("/api/stripe/confirm", async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: "sessionId required" });

      const session = storage.getCheckoutSession(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });
      if (session.status === "completed") {
        // Already confirmed — idempotent response
        const preset = storage.getPresetById(session.presetId);
        return res.json({ success: true, alreadyConfirmed: true, preset });
      }

      // Verify with Stripe if key present
      if (stripe) {
        const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
        if (stripeSession.payment_status !== "paid") {
          return res.status(402).json({ error: "Payment not completed" });
        }
      }

      // Mark session completed
      storage.updateCheckoutSessionStatus(sessionId, "completed");

      // Grant the preset
      const alreadyOwned = storage.hasOwnerPurchasedPreset(session.ownerId, session.presetId);
      if (!alreadyOwned) {
        storage.purchasePreset({
          ownerId: session.ownerId,
          presetId: session.presetId,
          serverId: session.serverId,
        });
      }

      // Auto-apply to server if serverId present
      if (session.serverId) {
        const preset = storage.getPresetById(session.presetId);
        if (preset) {
          const theme = storage.getStoreTheme(session.serverId);
          storage.upsertStoreTheme({
            ...(theme || {}),
            serverId: session.serverId,
            activePresetId: preset.id,
            colorScheme: preset.colorScheme,
            accentColor: preset.accentColor,
            layout: theme?.layout || "grid",
            feeMode: theme?.feeMode || "absorb",
            categories: theme?.categories || "[]",
            subcategories: theme?.subcategories || "{}",
          });
        }
      }

      const preset = storage.getPresetById(session.presetId);
      res.json({ success: true, preset, serverId: session.serverId });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Stripe webhook (for production reliability)
  app.post("/api/stripe/webhook", async (req, res) => {
    if (!stripe) return res.json({ received: true });
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event: Stripe.Event;
    try {
      if (webhookSecret) {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else {
        event = JSON.parse(req.body.toString());
      }
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const meta = session.metadata || {};

      // ── Balance top-up ──────────────────────────────────────────────────
      if (meta.type === "balance_topup") {
        const { serverId, minecraftUsername, amount } = meta;
        const member = storage.getMemberByUsername(Number(serverId), minecraftUsername);
        if (member) storage.updateMemberBalance(member.id, (member.balance ?? 0) + Number(amount));

      // ── Direct product purchase via Stripe ──────────────────────────────
      } else if (meta.type === "product_purchase") {
        // Server-side fulfilment — handles the case where the browser redirect
        // doesn't call /api/stripe/product-confirm (e.g. tab closed, mobile)
        const { productId, serverId, minecraftUsername, creatorCode: savedCode } = meta;
        // Check if order already created (by product-confirm)
        const existingOrders = storage.getOrdersByServer(Number(serverId))
          .filter((o: any) => o.stripePaymentIntentId === session.payment_intent ||
                              (o.minecraftUsername === minecraftUsername && o.productId === Number(productId) &&
                               Math.abs(new Date(o.createdAt).getTime() - Date.now()) < 5 * 60 * 1000));
        if (existingOrders.length === 0) {
          // No order yet — create it now
          const product = storage.getProductById(Number(productId));
          const server = storage.getServerById(Number(serverId));
          if (product && server) {
            const theme = storage.getStoreTheme(Number(serverId));
            const feeMode = theme?.feeMode || "absorb";
            const basePrice = product.price;
            const platformFee = Math.round(basePrice * PLATFORM_FEE_RATE * 100) / 100;
            const priceBeforeDiscount = feeMode === "passthrough"
              ? Math.round((basePrice + platformFee) * 100) / 100
              : basePrice;
            let webhookCC: any = null;
            let webhookCCDiscount = 0;
            if (savedCode) {
              webhookCC = storage.getCreatorCodeByCode(Number(serverId), savedCode);
              if (webhookCC) webhookCCDiscount = webhookCC.discountPercent || 0;
            }
            const playerPrice = webhookCCDiscount > 0
              ? Math.round(priceBeforeDiscount * (1 - webhookCCDiscount / 100) * 100) / 100
              : priceBeforeDiscount;

            let member = storage.getMemberByUsername(Number(serverId), minecraftUsername);
            if (!member) member = storage.createMember({ serverId: Number(serverId), minecraftUsername, balance: 0, totalSpent: 0 });

            const order = storage.createOrder({
              serverId: Number(serverId),
              productId: Number(productId),
              memberId: member.id,
              minecraftUsername,
              amount: playerPrice,
              platformFee,
              status: "pending",
              webhookDelivered: false,
              creatorCodeUsed: webhookCC ? webhookCC.code : null,
              creatorCodeDiscount: webhookCCDiscount,
            });
            if (webhookCC) storage.updateCreatorCodeEarnings(webhookCC.id, Math.round(playerPrice * (webhookCC.rewardPercent / 100) * 100));
            storage.updateMemberTotalSpent(member.id, playerPrice);

            // Fire Minecraft webhook (skip for preorders)
            if ((product as any).preorder) {
              storage.updateOrderStatus(order.id, "pending", false);
            } else if (server.webhookUrl) {
              const command = product.command.replace("%player%", minecraftUsername).replace("{player}", minecraftUsername);
              const commands = command.split("\n").map((c: string) => c.trim()).filter(Boolean);
              try {
                const wResp = await fetch(server.webhookUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "X-CraftStore-Secret": server.webhookSecret || "" },
                  body: JSON.stringify({ event: "purchase", orderId: order.id, minecraftUsername, command, commands, preorder: false, preorderReleaseDate: null, product: { id: product.id, name: product.name }, productName: product.name, secret: server.webhookSecret }),
                });
                storage.updateOrderStatus(order.id, wResp.ok ? "completed" : "failed", wResp.ok);
              } catch {
                storage.updateOrderStatus(order.id, "failed", false);
              }
            } else {
              storage.updateOrderStatus(order.id, "completed", false);
            }

            // Push notification
            try {
              const tokens = storage.getDeviceTokensForServer(Number(serverId));
              if (tokens.length > 0) {
                await sendPushNotifications(tokens, "💰 New Purchase!", `${minecraftUsername} bought ${product.name} for £${playerPrice.toFixed(2)}`, { serverId, orderId: order.id, productName: product.name, minecraftUsername });
              }
            } catch {}
          }
        }

      // ── Donation ────────────────────────────────────────────────────────
      } else if (meta.type === "donation") {
        const { serverId, playerName, amount } = meta;
        const server = storage.getServerById(Number(serverId));
        if (server) {
          // Create a donation order record so it shows in the dashboard
          let member = storage.getMemberByUsername(Number(serverId), playerName);
          if (!member) member = storage.createMember({ serverId: Number(serverId), minecraftUsername: playerName, balance: 0, totalSpent: 0 });
          const donationAmount = Number(amount);
          const platformFee = Math.round(donationAmount * PLATFORM_FEE_RATE * 100) / 100;
          storage.updateMemberTotalSpent(member.id, donationAmount);
          // Push notification to server owner
          try {
            const tokens = storage.getDeviceTokensForServer(Number(serverId));
            if (tokens.length > 0) {
              await sendPushNotifications(tokens, "💝 New Donation!", `${playerName} donated £${donationAmount.toFixed(2)} to ${server.name}`, { serverId, playerName, amount: String(donationAmount) });
            }
          } catch {}
          // In-app notification
          const owner = storage.getUserById(server.ownerId);
          if (owner) {
            storage.createNotification({ userId: owner.id, message: `${playerName} donated £${donationAmount.toFixed(2)} to ${server.name}`, read: false });
          }
        }

      // ── Preset purchase ─────────────────────────────────────────────────
      } else {
        const dbSession = storage.getCheckoutSession(session.id);
        if (dbSession && dbSession.status !== "completed") {
          storage.updateCheckoutSessionStatus(session.id, "completed");
          if (!storage.hasOwnerPurchasedPreset(dbSession.ownerId, dbSession.presetId)) {
            storage.purchasePreset({ ownerId: dbSession.ownerId, presetId: dbSession.presetId, serverId: dbSession.serverId });
          }
        }
      }
    }
    res.json({ received: true });
  });

  // ── Stripe Connect ─────────────────────────────────────────────────────────────────────
  // Start onboarding: creates a Connect account + returns onboarding URL
  app.post("/api/connect/onboard", async (req, res) => {
    try {
      const { serverId } = req.body;
      if (!serverId) return res.status(400).json({ error: "serverId required" });
      const server = storage.getServerById(Number(serverId));
      if (!server) return res.status(404).json({ error: "Server not found" });
      const ownerId = server.ownerId;

      if (!stripe) {
        // Demo mode — simulate connected
        storage.updateServer(Number(serverId), { stripeAccountId: `demo_acct_${serverId}`, stripeConnectStatus: "active" });
        return res.json({ demoMode: true, url: null, status: "active" });
      }

      let accountId = server.stripeAccountId;
      if (!accountId) {
        const account = await stripe.accounts.create({ type: "express" });
        accountId = account.id;
        storage.updateServer(Number(serverId), { stripeAccountId: accountId, stripeConnectStatus: "pending" });
      }

      const baseUrl = getBaseUrl(req);
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${baseUrl}/#/servers/${serverId}?connect=refresh`,
        return_url: `${baseUrl}/#/servers/${serverId}?connect=success`,
        type: "account_onboarding",
      });
      res.json({ url: accountLink.url, accountId });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Poll connect status — checks Stripe and updates DB
  app.get("/api/connect/status/:serverId", async (req, res) => {
    try {
      const server = storage.getServerById(Number(req.params.serverId));
      if (!server) return res.status(404).json({ error: "Not found" });

      if (!server.stripeAccountId) return res.json({ status: "not_connected", accountId: null });

      if (stripe && server.stripeConnectStatus !== "active") {
        const account = await stripe.accounts.retrieve(server.stripeAccountId);
        if (account.details_submitted && account.charges_enabled) {
          storage.updateServer(server.id, { stripeConnectStatus: "active" });
          return res.json({ status: "active", accountId: server.stripeAccountId });
        }
        return res.json({ status: "pending", accountId: server.stripeAccountId });
      }
      res.json({ status: server.stripeConnectStatus, accountId: server.stripeAccountId });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Disconnect — remove Connect account from server
  app.post("/api/connect/disconnect", (req, res) => {
    try {
      const { serverId } = req.body;
      if (!serverId) return res.status(400).json({ error: "serverId required" });
      storage.updateServer(Number(serverId), { stripeAccountId: null as any, stripeConnectStatus: "not_connected" });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Member Auth (player login for storefronts) ─────────────────────────────────────────
  app.post("/api/member-auth/register", (req, res) => {
    try {
      const { serverId, minecraftUsername, email, password, platform } = req.body;
      if (!serverId || !minecraftUsername || !password) return res.status(400).json({ error: "Missing fields" });
      const existing = storage.getMemberAccount(Number(serverId), minecraftUsername);
      if (existing) return res.status(409).json({ error: "Account already exists for this username" });
      const account = storage.createMemberAccount({
        serverId: Number(serverId),
        minecraftUsername,
        email: email || null,
        passwordHash: hashPassword(password),
      });
      const { passwordHash, ...safe } = account;
      // Also find their member record to return balance
      const member = storage.getMemberByUsername(Number(serverId), minecraftUsername);
      // Create persistent session token
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      storage.createMemberSession(account.id, Number(serverId), token, platform || "java", expiresAt);
      res.json({ ...safe, balance: member?.balance ?? 0, totalSpent: member?.totalSpent ?? 0, sessionToken: token });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/member-auth/login", (req, res) => {
    try {
      const { serverId, minecraftUsername, password, platform } = req.body;
      if (!serverId || !minecraftUsername || !password) return res.status(400).json({ error: "Missing fields" });
      const account = storage.getMemberAccount(Number(serverId), minecraftUsername);
      if (!account || account.passwordHash !== hashPassword(password)) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      const { passwordHash, ...safe } = account;
      const member = storage.getMemberByUsername(Number(serverId), minecraftUsername);
      const orders = storage.getOrdersByServer(Number(serverId)).filter(o => o.minecraftUsername === minecraftUsername);
      // Create persistent session token
      storage.deleteExpiredMemberSessions();
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      storage.createMemberSession(account.id, Number(serverId), token, platform || "java", expiresAt);
      res.json({ ...safe, balance: member?.balance ?? 0, totalSpent: member?.totalSpent ?? 0, orders, sessionToken: token });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Member Persistent Sessions ────────────────────────────────────────────
  // Create session after player login
  app.post("/api/member-auth/session", (req, res) => {
    try {
      const { memberAccountId, serverId, platform } = req.body;
      if (!memberAccountId || !serverId) return res.status(400).json({ error: "memberAccountId and serverId required" });
      storage.deleteExpiredMemberSessions();
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      storage.createMemberSession(Number(memberAccountId), Number(serverId), token, platform || "java", expiresAt);
      res.json({ ok: true, token });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Restore member session
  app.get("/api/member-auth/session", (req, res) => {
    try {
      const token = req.headers["x-member-token"] as string;
      const serverId = Number(req.query.serverId);
      if (!token || !serverId) return res.status(401).json({ error: "No token" });
      const session = storage.getMemberSession(token);
      if (!session || session.serverId !== serverId) return res.status(401).json({ error: "Invalid session" });
      if (new Date(session.expiresAt) < new Date()) {
        storage.deleteMemberSession(token);
        return res.status(401).json({ error: "Session expired" });
      }
      const accountRow = storage.getMemberAccountById(session.memberAccountId) as any;
      if (!accountRow) return res.status(401).json({ error: "Account not found" });
      const member = storage.getMemberByUsername(serverId, accountRow.minecraftUsername || accountRow.minecraft_username);
      res.json({
        ok: true,
        id: accountRow.id,
        minecraftUsername: accountRow.minecraftUsername || accountRow.minecraft_username,
        email: accountRow.email,
        platform: session.platform,
        balance: member?.balance ?? 0,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Delete member session (logout)
  app.delete("/api/member-auth/session", (req, res) => {
    try {
      const token = req.headers["x-member-token"] as string;
      if (token) storage.deleteMemberSession(token);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Player-facing profile: purchase history, gifts received, balance, leaderboard rank
  app.get("/api/member/profile", (req, res) => {
    try {
      const serverId = Number(req.query.serverId);
      const username = (req.query.username as string || "").trim();
      if (!serverId || !username) return res.status(400).json({ error: "serverId and username required" });
      const member = storage.getMemberByUsername(serverId, username);
      if (!member) return res.status(404).json({ error: "Member not found" });
      // Orders
      const allOrders = storage.getOrdersByServer(serverId);
      const myOrders = allOrders.filter((o: any) => o.minecraftUsername === username && (o.status === "completed" || o.status === "failed" || o.status === "pending"));
      // Gifts received (via gift_orders)
      const giftRows = (storage as any).getGiftsReceivedByUsername
        ? (storage as any).getGiftsReceivedByUsername(serverId, username)
        : [];
      // Leaderboard rank
      const leaderboard = storage.getTopSpenders(serverId, null);
      const rank = leaderboard.findIndex((r: any) => (r.minecraft_username || r.minecraftUsername) === username) + 1;
      const totalOnLeaderboard = leaderboard.length;
      res.json({
        username,
        balance: member.balance ?? 0,
        totalSpent: member.totalSpent ?? 0,
        orders: myOrders,
        giftsReceived: giftRows,
        leaderboardRank: rank > 0 ? rank : null,
        totalOnLeaderboard,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Player balance top-up via Stripe
  app.post("/api/member/balance-topup", async (req, res) => {
    try {
      const { serverId, minecraftUsername, amount } = req.body;
      if (!serverId || !minecraftUsername || !amount) return res.status(400).json({ error: "Missing fields" });
      const amountPence = Math.round(Number(amount) * 100);
      if (amountPence < 100) return res.status(400).json({ error: "Minimum top-up is £1.00" });
      const server = storage.getServerById(Number(serverId));
      if (!server) return res.status(404).json({ error: "Server not found" });
      const rootDomain = process.env.ROOT_DOMAIN || "craftstore.org.uk";
      const origin = process.env.SITE_ORIGIN || `https://${rootDomain}`;
      if (process.env.STRIPE_SECRET_KEY) {
        const platformFeePence = Math.round(amountPence * 0.20); // 20% to CraftStore
        const connectedAccountId = server.stripeAccountId && server.stripeConnectStatus === "active"
          ? server.stripeAccountId : null;

        const sessionParams: Stripe.Checkout.SessionCreateParams = {
          payment_method_types: ["card"],
          line_items: [{ price_data: { currency: "gbp", product_data: { name: `Balance Top-Up — ${server.name}`, description: `Adding £${Number(amount).toFixed(2)} to ${minecraftUsername}'s balance` }, unit_amount: amountPence }, quantity: 1 }],
          mode: "payment",
          success_url: `${origin}/#/store/${serverId}/profile?topup=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/#/store/${serverId}/profile?topup=cancelled`,
          metadata: { type: "balance_topup", serverId: String(serverId), minecraftUsername, amount: String(amount) },
          ...(connectedAccountId ? {
            payment_intent_data: {
              application_fee_amount: platformFeePence,
              transfer_data: { destination: connectedAccountId },
            },
          } : {}),
        };
        const session = await stripe!.checkout.sessions.create(sessionParams);
        res.json({ url: session.url });
      } else {
        // Demo mode: instantly credit balance
        const member = storage.getMemberByUsername(Number(serverId), minecraftUsername);
        if (!member) return res.status(404).json({ error: "Member not found" });
        storage.updateMemberBalance(member.id, (member.balance ?? 0) + Number(amount));
        res.json({ demoMode: true, newBalance: (member.balance ?? 0) + Number(amount) });
      }
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Stripe webhook: handle balance top-up completion
  // (already handled in webhook via metadata.type === 'balance_topup')

  // Anonymous donation — no login required, player just picks an amount
  app.post("/api/store/:serverId/donate", async (req, res) => {
    try {
      const serverId = Number(req.params.serverId);
      const { amount, playerName } = req.body;
      if (!amount || !playerName) return res.status(400).json({ error: "Missing fields" });
      const amountPence = Math.round(Number(amount) * 100);
      if (amountPence < 100) return res.status(400).json({ error: "Minimum donation is £1.00" });
      const server = storage.getServerById(serverId);
      if (!server) return res.status(404).json({ error: "Server not found" });
      const rootDomain = process.env.ROOT_DOMAIN || "craftstore.org.uk";
      const origin = process.env.SITE_ORIGIN || `https://${rootDomain}`;
      if (process.env.STRIPE_SECRET_KEY) {
        const platformFeePence = Math.round(amountPence * 0.20);
        const connectedAccountId = server.stripeAccountId && server.stripeConnectStatus === "active"
          ? server.stripeAccountId : null;
        const sessionParams: Stripe.Checkout.SessionCreateParams = {
          line_items: [{ price_data: { currency: "gbp", product_data: { name: `Donation to ${server.name}`, description: `Donated by ${playerName}` }, unit_amount: amountPence }, quantity: 1 }],
          mode: "payment",
          success_url: `${origin}/#/store/${serverId}?donated=true`,
          cancel_url: `${origin}/#/store/${serverId}`,
          metadata: { type: "donation", serverId: String(serverId), playerName, amount: String(amount) },
          ...(connectedAccountId ? {
            payment_intent_data: {
              application_fee_amount: platformFeePence,
              transfer_data: { destination: connectedAccountId },
            },
          } : {}),
        };
        const session = await stripe!.checkout.sessions.create(sessionParams);
        res.json({ url: session.url });
      } else {
        res.json({ demoMode: true, message: "Demo mode — Stripe not configured" });
      }
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Member stats endpoint (owner-facing — full profile)
  app.get("/api/servers/:serverId/members/:username/stats", (req, res) => {
    const serverId = Number(req.params.serverId);
    const { username } = req.params;
    const member = storage.getMemberByUsername(serverId, username);
    if (!member) return res.status(404).json({ error: "Member not found" });
    const allOrders = storage.getOrdersByServer(serverId);
    const memberOrders = allOrders.filter(o => o.minecraftUsername === username);
    const completedOrders = memberOrders.filter(o => o.status === "completed" || o.status === "failed" || o.status === "pending");
    const totalSpent = completedOrders.reduce((s, o) => s + o.amount, 0);
    const productsList = storage.getProductsByServer(serverId);
    const productMap: Record<number, string> = {};
    productsList.forEach(p => { productMap[p.id] = p.name; });
    const ordersWithProducts = completedOrders.map(o => ({
      ...o,
      productName: productMap[o.productId] || `Product #${o.productId}`,
    }));
    res.json({ member, orders: ordersWithProducts, totalSpent, orderCount: completedOrders.length });
  });

  // ── Gift Orders ────────────────────────────────────────────────────────────────────────
  app.post("/api/gift", async (req, res) => {
    try {
      const { productId, senderUsername, recipientUsername, serverId, message } = req.body;
      if (!productId || !senderUsername || !recipientUsername || !serverId) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (senderUsername === recipientUsername) return res.status(400).json({ error: "Cannot gift to yourself" });

      const product = storage.getProductById(Number(productId));
      if (!product || !product.active) return res.status(404).json({ error: "Product not found" });

      const server = storage.getServerById(Number(serverId));
      if (!server) return res.status(404).json({ error: "Server not found" });

      const theme = storage.getStoreTheme(Number(serverId));
      const feeMode = theme?.feeMode || "absorb";
      const platformFee = Math.round(product.price * PLATFORM_FEE_RATE * 100) / 100;
      const playerPrice = feeMode === "passthrough"
        ? Math.round((product.price + platformFee) * 100) / 100
        : product.price;

      // Deduct from sender
      const sender = storage.getMemberByUsername(Number(serverId), senderUsername);
      if (!sender) return res.status(404).json({ error: "Sender not found in this server" });
      if (sender.balance < playerPrice) return res.status(402).json({ error: "Insufficient balance" });

      storage.updateMemberBalance(sender.id, sender.balance - playerPrice);
      storage.updateMemberTotalSpent(sender.id, playerPrice);

      // Create order for recipient
      const order = storage.createOrder({
        serverId: Number(serverId),
        productId: product.id,
        memberId: sender.id,
        minecraftUsername: recipientUsername,
        amount: playerPrice,
        platformFee,
        status: "pending",
        webhookDelivered: false,
      });

      // Create gift record
      const gift = storage.createGiftOrder({
        orderId: order.id,
        senderUsername,
        recipientUsername,
        message: message || null,
      });

      // Fire webhook for recipient
      if (server.webhookUrl) {
        const command = product.command.replace("{player}", recipientUsername);
        const commands = command.split("\n").map((c: string) => c.trim()).filter(Boolean);
        const payload = {
          event: "gift_purchase", orderId: order.id,
          minecraftUsername: recipientUsername, senderUsername,
          command, commands, preorder: !!(product as any).preorder, preorderReleaseDate: (product as any).preorderReleaseDate || null,
          product: { id: product.id, name: product.name },
          secret: server.webhookSecret,
        };
        try {
          const response = await fetch(server.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CraftStore-Secret": server.webhookSecret || "" },
            body: JSON.stringify(payload),
          });
          storage.updateOrderStatus(order.id, response.ok ? "completed" : "failed", response.ok);
        } catch {
          storage.updateOrderStatus(order.id, "failed", false);
        }
      } else {
        storage.updateOrderStatus(order.id, "completed", false);
      }

      // Notify owner
      const owner = storage.getUserById(server.ownerId);
      if (owner) {
        storage.createNotification({
          userId: owner.id,
          message: `${senderUsername} gifted ${product.name} to ${recipientUsername} on ${server.name} (£${playerPrice.toFixed(2)})`,
          read: false,
        });
      }

      res.json({ success: true, order: storage.getOrderById(order.id), gift });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Public store (player-facing) ────────────────────────────────
  // ── Domain Plan ───────────────────────────────────────────────────────────
  // POST /api/stripe/domain-checkout — creates a Stripe session for £4.99/mo domain plan
  app.post("/api/stripe/domain-checkout", async (req, res) => {
    try {
      const { ownerId, serverId } = req.body;
      if (!ownerId || !serverId) return res.status(400).json({ error: "Missing ownerId or serverId" });

      if (stripe) {
        const baseUrl = getBaseUrl(req);
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "subscription",
          line_items: [{
            price_data: {
              currency: "gbp",
              unit_amount: 499,
              recurring: { interval: "month" },
              product_data: { name: "CraftStore Custom Domain", description: "Host your store at your own domain" },
            },
            quantity: 1,
          }],
          success_url: `${baseUrl}/#/domain-success?session_id={CHECKOUT_SESSION_ID}&serverId=${serverId}`,
          cancel_url: `${baseUrl}/#/server/${serverId}?tab=domain`,
          metadata: { ownerId: String(ownerId), serverId: String(serverId) },
        });
        storage.createDomainCheckout(session.id, Number(ownerId), Number(serverId));
        return res.json({ sessionId: session.id, url: session.url });
      } else {
        // Demo mode
        const demoId = `demo_domain_${Date.now()}`;
        storage.createDomainCheckout(demoId, Number(ownerId), Number(serverId));
        return res.json({ sessionId: demoId, url: null, demoMode: true });
      }
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/stripe/domain-confirm — confirm a domain checkout + optionally save domain
  app.post("/api/stripe/domain-confirm", async (req, res) => {
    try {
      const { sessionId, customDomain } = req.body;
      if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });
      const record = storage.getDomainCheckout(sessionId);
      if (!record) return res.status(404).json({ error: "Session not found" });
      storage.activateDomainPlan(record.serverId, customDomain || undefined);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PATCH /api/servers/:id/domain — save custom domain string (owner must have plan active)
  app.patch("/api/servers/:id/domain", (req, res) => {
    try {
      const { customDomain } = req.body;
      const server = storage.getServerById(Number(req.params.id));
      if (!server) return res.status(404).json({ error: "Not found" });
      storage.activateDomainPlan(server.id, customDomain);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/store/:serverId", (req, res) => {
    const server = storage.getServerById(Number(req.params.serverId));
    if (!server) return res.status(404).json({ error: "Not found" });
    const productsList = storage.getProductsByServer(server.id).filter(p => p.active);
    const theme = storage.getStoreTheme(server.id) || {
      layout: "grid", colorScheme: "dark", accentColor: "#22c55e",
      bannerUrl: null, startPage: "all", announcementText: null,
      categories: "[]", subcategories: "{}", feeMode: "absorb", activePresetId: null,
    };

    // Resolve active preset if set
    let preset = null;
    if (theme.activePresetId) {
      preset = storage.getPresetById(theme.activePresetId) || null;
    }

    // Use ownerMinecraftUsername from theme (set in Appearance panel)
    const ownerUsername = (theme as any).ownerMinecraftUsername || null;

    res.json({
      server: {
        id: server.id,
        name: server.name,
        description: server.description,
        logoUrl: server.logoUrl,
        discordUrl: (server as any).discordUrl || null,
        serverIp: (server as any).serverIp || null,
        slugDomain: slugDomain(server.name),
        customDomain: (server as any).customDomain || null,
        domainPlanActive: (server as any).domainPlanActive || false,
        bedrockEnabled: (server as any).bedrockEnabled || false,
        bedrockPrefix: (server as any).bedrockPrefix || "none",
        bedrockReplaceSpaces: (server as any).bedrockReplaceSpaces !== false,
        ownerUsername,
      },
      products: productsList,
      theme,
      preset,
    });
  });

  // ── Subdomain routes ─────────────────────────────────────────────────────
  app.post("/api/servers/:id/subdomain", (req, res) => {
    try {
      const serverId = Number(req.params.id);
      const { subdomain } = req.body as { subdomain: string };
      if (!subdomain) return res.status(400).json({ error: "subdomain required" });
      const clean = subdomain.toLowerCase().trim();
      const result = storage.claimSubdomain(serverId, clean);
      if (!result.success) return res.status(400).json({ error: result.error });
      const rootDomain = process.env.ROOT_DOMAIN || "craftstore.org.uk";
      res.json({ success: true, subdomain: clean, url: `https://${clean}.${rootDomain}` });
    } catch (e: any) {
      console.error("[subdomain claim error]", e);
      res.status(500).json({ error: e.message || "Failed to claim subdomain" });
    }
  });

  app.delete("/api/servers/:id/subdomain", (req, res) => {
    storage.revokeSubdomain(Number(req.params.id));
    res.json({ success: true });
  });

  app.get("/api/servers/:id/subdomain", (req, res) => {
    const sub = storage.getSubdomainByServer(Number(req.params.id));
    const rootDomain = process.env.ROOT_DOMAIN || "craftstore.org.uk";
    res.json({ subdomain: sub, url: sub ? `https://${sub}.${rootDomain}` : null });
  });

  // ── Admin ──────────────────────────────────────────────────────────────
  // Middleware: require X-Admin-Secret header or ?secret= query param
  function requireAdmin(req: any, res: any, next: any) {
    const secret = req.headers["x-admin-secret"] || req.query.secret;
    if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorised" });
    next();
  }

  // Proxy Mojang UUID + skin lookup — avoids CORS, returns skinUrl directly
  app.get("/api/minecraft/uuid/:username", async (req, res) => {
    try {
      const r = await fetch(`https://api.mojang.com/users/profiles/minecraft/${req.params.username}`);
      if (!r.ok) return res.status(404).json({ error: "Player not found" });
      const data = await r.json() as { id: string; name: string };
      // Also fetch skin texture URL from session server
      try {
        const sr = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${data.id}`);
        if (sr.ok) {
          const profile = await sr.json() as any;
          const texProp = profile.properties?.find((p: any) => p.name === "textures");
          if (texProp) {
            const texData = JSON.parse(Buffer.from(texProp.value, "base64").toString("utf8"));
            const skinUrl = texData?.textures?.SKIN?.url;
            if (skinUrl) return res.json({ id: data.id, name: data.name, skinUrl });
          }
        }
      } catch {}
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy skin render — fetches skin texture and returns it to avoid CORS
  app.get("/api/minecraft/skin/:uuid", async (req, res) => {
    try {
      const sr = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${req.params.uuid}`);
      if (!sr.ok) return res.status(404).json({ error: "Profile not found" });
      const profile = await sr.json() as any;
      const texProp = profile.properties?.find((p: any) => p.name === "textures");
      if (!texProp) return res.status(404).json({ error: "No textures" });
      const texData = JSON.parse(Buffer.from(texProp.value, "base64").toString("utf8"));
      const skinUrl = texData?.textures?.SKIN?.url;
      if (!skinUrl) return res.status(404).json({ error: "No skin URL" });
      // Redirect to mc-heads with the actual texture hash for accurate render
      const hash = skinUrl.split("/texture/")[1];
      res.redirect(`https://mc-heads.net/body/${req.params.uuid}/64`);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Bedrock skin proxy — XUID via GeyserMC → texture hash → nmsr render (proxied)
  app.get("/api/bedrock/skin/:gamertag", async (req, res) => {
    const FALLBACK = "https://nmsr.nickac.dev/fullbody/MHF_Steve";
    try {
      const gamertag = req.params.gamertag.replace(/^[._]/, ""); // strip . or _ floodgate prefix
      // 1. Gamertag → XUID
      const xuidRes = await fetch(`https://api.geysermc.org/v2/xbox/xuid/${encodeURIComponent(gamertag)}`);
      if (!xuidRes.ok) return res.redirect(FALLBACK);
      const { xuid } = await xuidRes.json() as { xuid: number };
      // 2. XUID → texture hash via GeyserMC skin API
      const skinRes = await fetch(`https://api.geysermc.org/v2/skin/${xuid}`);
      if (!skinRes.ok) return res.redirect(FALLBACK);
      const skinData = await skinRes.json() as any;
      const textureId = skinData.texture_id;
      if (!textureId) return res.redirect(FALLBACK);
      // 3. Texture hash → nmsr body render (proxy image bytes to avoid CORS)
      const renderUrl = `https://nmsr.nickac.dev/fullbody/${textureId}`;
      const imgRes = await fetch(renderUrl);
      if (!imgRes.ok) return res.redirect(FALLBACK);
      const contentType = imgRes.headers.get("content-type") || "image/png";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600"); // cache 1h
      const buf = await imgRes.arrayBuffer();
      res.send(Buffer.from(buf));
    } catch {
      res.redirect(FALLBACK);
    }
  });

  // ── Test webhook endpoint ──────────────────────────────────────────────────
  app.post("/api/servers/:serverId/test-webhook", async (req: any, res: any) => {
    const serverId = Number(req.params.serverId);
    const server = storage.getServerById(serverId);
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (!server.webhookUrl) return res.status(400).json({ error: "No webhook URL configured. Add one in Settings first." });
    const { minecraftUsername = "TestPlayer", command = "say Welcome TestPlayer!" } = req.body;
    const commands = command.split("\n").map((c: string) => c.trim()).filter(Boolean);
    const payload = {
      event: "purchase",
      orderId: 0,
      minecraftUsername,
      command,
      commands,
      product: { id: 0, name: "Test Product" },
      productName: "Test Product",
      secret: server.webhookSecret,
      test: true,
    };
    try {
      const response = await fetch(server.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CraftStore-Secret": server.webhookSecret || "" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        res.json({ success: true, message: `Webhook delivered — HTTP ${response.status}` });
      } else {
        res.json({ success: false, message: `Webhook failed — HTTP ${response.status}. Is port 8123 open and the plugin running?` });
      }
    } catch (err: any) {
      res.json({ success: false, message: `Could not reach webhook URL: ${err.message}. Check your IP and port forward.` });
    }
  });

  // ── Analytics endpoint ───────────────────────────────────────────────────
  app.get("/api/servers/:serverId/analytics", (req: any, res: any) => {
    const serverId = Number(req.params.serverId);
    const server = storage.getServerById(serverId);
    if (!server) return res.status(404).json({ error: "Server not found" });
    const analytics = storage.getServerAnalytics(serverId);
    res.json(analytics);
  });

  app.get("/api/admin/stats", requireAdmin, (req, res) => {
    try { res.json(storage.getAdminStats()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/admin/servers", requireAdmin, (req, res) => {
    try {
      const rows = storage.getAdminServers();
      // Enrich with slug domain
      const enriched = rows.map(r => ({
        ...r,
        slugDomain: slugDomain(r.name),
        domainPlanActive: r.domain_plan_active === 1,
        customDomain: r.custom_domain || null,
        logoUrl: r.logo_url || null,
        discordUrl: r.discord_url || null,
        serverIp: r.server_ip || null,
        ownerName: r.owner_name,
        ownerEmail: r.owner_email,
        productCount: r.product_count,
        memberCount: r.member_count,
        orderCount: r.order_count,
        totalRevenue: r.total_revenue,
        totalPlatformFee: r.total_platform_fee,
        presetName: r.preset_name || null,
        createdAt: r.created_at,
      }));
      res.json(enriched);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Admin: force-activate domain plan for a server
  app.post("/api/admin/servers/:id/activate-domain", requireAdmin, (req, res) => {
    try {
      storage.activateDomainPlan(Number(req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Admin: list all claimed subdomains
  app.get("/api/admin/subdomains", requireAdmin, (req, res) => {
    try {
      const claims = storage.getAllSubdomainClaims();
      const rootDomain = process.env.ROOT_DOMAIN || "craftstore.org.uk";
      res.json(claims.map((c: any) => ({
        ...c,
        url: `https://${c.subdomain}.${rootDomain}`,
      })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Admin: audit log
  app.get("/api/admin/audit-log", requireAdmin, (req, res) => {
    try {
      const limit = Number(req.query.limit) || 200;
      res.json(storage.getAuditLog(limit));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Admin: revoke a subdomain claim by server id
  // Admin: manually create an order (for backfilling missed donations/purchases)
  app.post("/api/admin/orders", requireAdmin, (req, res) => {
    try {
      const { serverId, productId, minecraftUsername, amount, platformFee, status } = req.body;
      if (!serverId || !minecraftUsername || !amount) return res.status(400).json({ error: "serverId, minecraftUsername, amount required" });
      let member = storage.getMemberByUsername(Number(serverId), minecraftUsername);
      if (!member) member = storage.createMember({ serverId: Number(serverId), minecraftUsername, balance: 0, totalSpent: 0 });
      const order = storage.createOrder({
        serverId: Number(serverId),
        productId: productId ? Number(productId) : 1,
        memberId: member.id,
        minecraftUsername,
        amount: Number(amount),
        platformFee: platformFee ? Number(platformFee) : Math.round(Number(amount) * 0.2 * 100) / 100,
        status: status || "completed",
        webhookDelivered: false,
      });
      storage.updateMemberTotalSpent(member.id, Number(amount));
      res.json({ success: true, order, member });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Directly set creator code totalEarned
  app.post("/api/admin/creator-codes/:id/set-earned", requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id);
      const { totalEarned } = req.body;
      if (totalEarned === undefined) return res.status(400).json({ error: "totalEarned required" });
      sqlite.prepare("UPDATE creator_codes SET total_earned = ? WHERE id = ?").run(Number(totalEarned), id);
      res.json({ success: true, id, totalEarned });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Patch an order's amount + fix member totalSpent + fix creator code earnings
  app.post("/api/admin/orders/:orderId/fix-amount", requireAdmin, (req, res) => {
    try {
      const orderId = Number(req.params.orderId);
      const { serverId, newAmount, oldAmount } = req.body;
      if (!newAmount || !serverId) return res.status(400).json({ error: "serverId and newAmount required" });
      const orders = storage.getOrdersByServer(Number(serverId));
      const order = orders.find((o: any) => o.id === orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });
      const prev = oldAmount ?? order.amount;
      const diff = Number(newAmount) - Number(prev);
      // Update order amount
      sqlite.prepare("UPDATE orders SET amount = ? WHERE id = ?").run(Number(newAmount), orderId);
      // Fix member totalSpent
      const member = storage.getMemberById(order.memberId);
      if (member) {
        const corrected = Math.max(0, (member.totalSpent ?? 0) + diff);
        sqlite.prepare("UPDATE members SET total_spent = ? WHERE id = ?").run(corrected, member.id);
      }
      // Fix creator code earnings if one was used
      if (order.creatorCodeUsed) {
        const cc = storage.getCreatorCodeByCode(Number(serverId), order.creatorCodeUsed);
        if (cc) {
          const oldEarning = Math.round(Number(prev) * (cc.rewardPercent / 100) * 100);
          const newEarning = Math.round(Number(newAmount) * (cc.rewardPercent / 100) * 100);
          const earnDiff = newEarning - oldEarning;
          sqlite.prepare("UPDATE creator_codes SET total_earned = total_earned + ? WHERE id = ?").run(earnDiff, cc.id);
        }
      }
      res.json({ success: true, orderId, newAmount, diff });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Patch an order's creator code retroactively
  app.post("/api/admin/orders/:orderId/creator-code", requireAdmin, (req, res) => {
    try {
      const orderId = Number(req.params.orderId);
      const { serverId, code } = req.body;
      if (!code || !serverId) return res.status(400).json({ error: "code and serverId required" });
      const cc = storage.getCreatorCodeByCode(Number(serverId), String(code));
      if (!cc) return res.status(404).json({ error: "Creator code not found" });
      const orders = storage.getOrdersByServer(Number(serverId));
      const order = orders.find((o: any) => o.id === orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });
      // Update order row
      sqlite.prepare("UPDATE orders SET creator_code_used = ?, creator_code_discount = ? WHERE id = ?")
        .run(cc.code, cc.discountPercent, orderId);
      // Add earnings
      const earning = Math.round(order.amount * (cc.rewardPercent / 100) * 100);
      storage.updateCreatorCodeEarnings(cc.id, earning);
      res.json({ success: true, earning, code: cc.code });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/admin/subdomains/:serverId", requireAdmin, (req, res) => {
    try {
      storage.revokeSubdomain(Number(req.params.serverId));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  return httpServer;
}
