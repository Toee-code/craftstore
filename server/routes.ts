import type { Express } from "express";
import type { Server as HttpServer } from "http";
import { storage } from "./storage";
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

// Platform fee rate: 20%
const PLATFORM_FEE_RATE = 0.2;

export async function registerRoutes(httpServer: HttpServer, app: Express) {
  // Health check — used by Railway and monitoring
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));


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

  // ── Products ──────────────────────────────────────────────────────────────
  app.get("/api/servers/:serverId/products", (req, res) => {
    res.json(storage.getProductsByServer(Number(req.params.serverId)));
  });

  app.post("/api/servers/:serverId/products", (req, res) => {
    try {
      const parsed = insertProductSchema.parse({ ...req.body, serverId: Number(req.params.serverId) });
      res.json(storage.createProduct(parsed));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch("/api/products/:id", (req, res) => {
    const product = storage.updateProduct(Number(req.params.id), req.body);
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

  // Public purchase endpoint (player-facing store)
  app.post("/api/purchase", async (req, res) => {
    try {
      const { productId, minecraftUsername, serverId } = req.body;
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

      // Player price: passthrough = base + 20%, absorb = base price
      const basePrice = product.price;
      const platformFee = Math.round(basePrice * PLATFORM_FEE_RATE * 100) / 100;
      const playerPrice = feeMode === "passthrough"
        ? Math.round((basePrice + platformFee) * 100) / 100
        : basePrice;

      // Check member balance
      const member = storage.getMemberByUsername(Number(serverId), minecraftUsername);
      if (!member) return res.status(404).json({ error: "Player not found in this server" });
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
      });

      // Fire webhook if configured
      if (server.webhookUrl) {
        const command = product.command.replace("{player}", minecraftUsername);
        const payload = {
          event: "purchase",
          orderId: order.id,
          minecraftUsername,
          command,
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
    const completedOrders = allOrders.filter(o => o.status === "completed");
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
      const dbSession = storage.getCheckoutSession(session.id);
      if (dbSession && dbSession.status !== "completed") {
        storage.updateCheckoutSessionStatus(session.id, "completed");
        if (!storage.hasOwnerPurchasedPreset(dbSession.ownerId, dbSession.presetId)) {
          storage.purchasePreset({ ownerId: dbSession.ownerId, presetId: dbSession.presetId, serverId: dbSession.serverId });
        }
      }
    }
    res.json({ received: true });
  });

  // ── Member Auth (player login for storefronts) ─────────────────────────────────────────
  app.post("/api/member-auth/register", (req, res) => {
    try {
      const { serverId, minecraftUsername, email, password } = req.body;
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
      res.json({ ...safe, balance: member?.balance ?? 0, totalSpent: member?.totalSpent ?? 0 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/member-auth/login", (req, res) => {
    try {
      const { serverId, minecraftUsername, password } = req.body;
      if (!serverId || !minecraftUsername || !password) return res.status(400).json({ error: "Missing fields" });
      const account = storage.getMemberAccount(Number(serverId), minecraftUsername);
      if (!account || account.passwordHash !== hashPassword(password)) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      const { passwordHash, ...safe } = account;
      const member = storage.getMemberByUsername(Number(serverId), minecraftUsername);
      const orders = storage.getOrdersByServer(Number(serverId)).filter(o => o.minecraftUsername === minecraftUsername);
      res.json({ ...safe, balance: member?.balance ?? 0, totalSpent: member?.totalSpent ?? 0, orders });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Member stats endpoint (owner-facing — full profile)
  app.get("/api/servers/:serverId/members/:username/stats", (req, res) => {
    const serverId = Number(req.params.serverId);
    const { username } = req.params;
    const member = storage.getMemberByUsername(serverId, username);
    if (!member) return res.status(404).json({ error: "Member not found" });
    const allOrders = storage.getOrdersByServer(serverId);
    const memberOrders = allOrders.filter(o => o.minecraftUsername === username);
    const completedOrders = memberOrders.filter(o => o.status === "completed");
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
        const payload = {
          event: "gift_purchase", orderId: order.id,
          minecraftUsername: recipientUsername, senderUsername,
          command, product: { id: product.id, name: product.name },
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
      },
      products: productsList,
      theme,
      preset,
    });
  });

  // ── Admin ──────────────────────────────────────────────────────────────
  // Middleware: require X-Admin-Secret header or ?secret= query param
  function requireAdmin(req: any, res: any, next: any) {
    const secret = req.headers["x-admin-secret"] || req.query.secret;
    if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorised" });
    next();
  }

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

  return httpServer;
}
