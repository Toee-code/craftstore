import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import {
  users, servers, products, members, orders, notifications, storeThemes, storePresets, presetPurchases,
  checkoutSessions, memberAccounts, giftOrders, ownerSessions, memberSessions,
  type User, type InsertUser,
  type Server, type InsertServer,
  type Product, type InsertProduct,
  type Member, type InsertMember,
  type Order, type InsertOrder,
  type Notification, type InsertNotification,
  type StoreTheme, type InsertStoreTheme,
  type StorePreset, type InsertStorePreset,
  type PresetPurchase, type InsertPresetPurchase,
  type CheckoutSession, type InsertCheckoutSession,
  type MemberAccount, type InsertMemberAccount,
  type GiftOrder, type InsertGiftOrder,
  type OwnerSession, type MemberSessionRow,
  creatorCodes,
  type CreatorCode,
  type InsertCreatorCode,
  creatorCodePayouts,
  type CreatorCodePayout,
  type InsertCreatorCodePayout,
} from "@shared/schema";

// Use DB_PATH env var (set by render.yaml disk mount), then Railway, then local
const DB_PATH = process.env.DB_PATH
  || (process.env.RAILWAY_VOLUME_MOUNT_PATH ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/craftstore.db` : null)
  || "craftstore.db";

console.log(`[CraftStore] Opening database at: ${DB_PATH}`);
export const sqlite = new Database(DB_PATH);

// Enable WAL mode for crash safety and better write performance
// WAL ensures completed transactions survive crashes/restarts
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");  // Safe with WAL, much faster than FULL
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");   // Wait up to 5s if DB is locked

export const db = drizzle(sqlite);

// Auto-migrate: create tables if not exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    webhook_url TEXT,
    webhook_secret TEXT,
    logo_url TEXT,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    image_url TEXT,
    category TEXT,
    subcategory TEXT,
    command TEXT NOT NULL,
    stock INTEGER DEFAULT -1,
    active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    minecraft_username TEXT NOT NULL,
    email TEXT,
    balance REAL NOT NULL DEFAULT 0,
    total_spent REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    member_id INTEGER,
    minecraft_username TEXT NOT NULL,
    amount REAL NOT NULL,
    platform_fee REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    stripe_payment_intent_id TEXT,
    webhook_delivered INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS store_themes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL UNIQUE,
    layout TEXT NOT NULL DEFAULT 'echo',
    color_scheme TEXT NOT NULL DEFAULT 'dark',
    accent_color TEXT DEFAULT '#22c55e',
    banner_url TEXT,
    start_page TEXT DEFAULT 'all',
    announcement_text TEXT,
    categories TEXT DEFAULT '[]',
    subcategories TEXT DEFAULT '{}',
    fee_mode TEXT NOT NULL DEFAULT 'absorb',
    active_preset_id INTEGER,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS store_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price REAL NOT NULL,
    animation_style TEXT NOT NULL DEFAULT 'none',
    color_scheme TEXT NOT NULL DEFAULT 'dark',
    accent_color TEXT NOT NULL DEFAULT '#22c55e',
    gradient_start TEXT,
    gradient_end TEXT,
    glow_color TEXT,
    badge_label TEXT,
    preview_image_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS preset_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    preset_id INTEGER NOT NULL,
    server_id INTEGER,
    purchased_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS checkout_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stripe_session_id TEXT NOT NULL UNIQUE,
    owner_id INTEGER NOT NULL,
    preset_id INTEGER NOT NULL,
    server_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS member_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    minecraft_username TEXT NOT NULL,
    email TEXT,
    password_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS gift_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    sender_username TEXT NOT NULL,
    recipient_username TEXT NOT NULL,
    message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Run column migrations for existing DBs (safe: IF NOT EXISTS equivalent via try/catch)
const alterStatements = [
  "ALTER TABLE products ADD COLUMN subcategory TEXT",
  "ALTER TABLE members ADD COLUMN total_spent REAL NOT NULL DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN platform_fee REAL NOT NULL DEFAULT 0",
  "ALTER TABLE store_themes ADD COLUMN subcategories TEXT DEFAULT '{}'",
  "ALTER TABLE store_themes ADD COLUMN fee_mode TEXT NOT NULL DEFAULT 'absorb'",
  "ALTER TABLE store_themes ADD COLUMN active_preset_id INTEGER",
  "ALTER TABLE store_themes ADD COLUMN welcome_title TEXT",
  "ALTER TABLE store_themes ADD COLUMN welcome_text TEXT",
  // v4 additions
  "ALTER TABLE servers ADD COLUMN discord_url TEXT",
  "ALTER TABLE servers ADD COLUMN server_ip TEXT",
  "ALTER TABLE servers ADD COLUMN custom_domain TEXT",
  "ALTER TABLE servers ADD COLUMN domain_plan_active INTEGER DEFAULT 0",
  // v5 — Stripe Connect
  "ALTER TABLE servers ADD COLUMN stripe_account_id TEXT",
  "ALTER TABLE servers ADD COLUMN stripe_connect_status TEXT DEFAULT 'not_connected'",
  "ALTER TABLE servers ADD COLUMN bedrock_prefix TEXT DEFAULT 'none'",
  "ALTER TABLE servers ADD COLUMN bedrock_enabled INTEGER DEFAULT 0",
  "ALTER TABLE servers ADD COLUMN bedrock_replace_spaces INTEGER DEFAULT 1",
  "ALTER TABLE products ADD COLUMN image_type TEXT DEFAULT 'custom'",
  "ALTER TABLE products ADD COLUMN player_head_name TEXT",
  "ALTER TABLE store_themes ADD COLUMN category_images TEXT DEFAULT '{}'",
  "ALTER TABLE products ADD COLUMN enchanted INTEGER DEFAULT 0",
  "ALTER TABLE products ADD COLUMN featured INTEGER DEFAULT 0",
  "ALTER TABLE store_themes ADD COLUMN countdown_title TEXT",
  "ALTER TABLE store_themes ADD COLUMN countdown_subtitle TEXT",
  "ALTER TABLE store_themes ADD COLUMN countdown_end TEXT",
  "ALTER TABLE store_themes ADD COLUMN owner_minecraft_username TEXT",
  "ALTER TABLE store_themes ADD COLUMN banner_image_url TEXT",
  "ALTER TABLE store_themes ADD COLUMN banner_link_url TEXT",
  "ALTER TABLE store_themes ADD COLUMN banner_position TEXT DEFAULT 'top'",
  "ALTER TABLE store_themes ADD COLUMN banner_focal_y TEXT DEFAULT '50%'",
  // v7 — webhook retry
  "ALTER TABLE orders ADD COLUMN webhook_retry_count INTEGER NOT NULL DEFAULT 0",
  // v8 — world selector
  "ALTER TABLE products ADD COLUMN world TEXT",
  "ALTER TABLE store_themes ADD COLUMN worlds TEXT DEFAULT '[]'",
  // v9 — preorder
  "ALTER TABLE products ADD COLUMN preorder INTEGER DEFAULT 0",
  "ALTER TABLE products ADD COLUMN preorder_release_date TEXT",
  // v10 — creator codes
  "ALTER TABLE orders ADD COLUMN creator_code_used TEXT",
  "ALTER TABLE orders ADD COLUMN creator_code_discount INTEGER DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN stripe_session_id TEXT",
  `CREATE TABLE IF NOT EXISTS creator_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    creator_name TEXT NOT NULL,
    reward_percent INTEGER NOT NULL DEFAULT 10,
    discount_percent INTEGER NOT NULL DEFAULT 0,
    total_earned INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS creator_code_payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_code_id INTEGER NOT NULL,
    server_id INTEGER NOT NULL,
    creator_name TEXT NOT NULL,
    code TEXT NOT NULL,
    amount_requested INTEGER NOT NULL,
    paypal_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    owner_note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT
  )`,
  "ALTER TABLE creator_codes ADD COLUMN paid_out INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE products ADD COLUMN purchase_type TEXT DEFAULT 'one_time'",
  "ALTER TABLE products ADD COLUMN stripe_price_id TEXT",
  "ALTER TABLE products ADD COLUMN expiry_commands TEXT",
  // v11 — unique index on stripe_session_id to prevent duplicate orders from race conditions
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_session_id ON orders(stripe_session_id) WHERE stripe_session_id IS NOT NULL",
  // v12 — AjLeaderboards economy stats on members
  "ALTER TABLE members ADD COLUMN eco_rank INTEGER",
  "ALTER TABLE members ADD COLUMN eco_balance REAL",
  // v13 — product name on orders for display
  "ALTER TABLE orders ADD COLUMN product_name TEXT",
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    minecraft_username TEXT NOT NULL,
    stripe_subscription_id TEXT NOT NULL,
    stripe_customer_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    current_period_end TEXT,
    cancel_at_period_end INTEGER DEFAULT 0,
    product_name TEXT,
    amount REAL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];
for (const stmt of alterStatements) {
  try { sqlite.exec(stmt); } catch { /* column already exists */ }
}

// Migrate all existing stores to 'echo' (ToeesSMP) as the new default layout
try {
  sqlite.exec(`UPDATE store_themes SET layout = 'echo' WHERE layout IN ('grid', 'featured', 'list')`);
} catch {}


// Domain checkout sessions table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS domain_checkout_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stripe_session_id TEXT NOT NULL UNIQUE,
    owner_id INTEGER NOT NULL,
    server_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Subdomain claims table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS subdomain_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL UNIQUE,
    subdomain TEXT NOT NULL UNIQUE,
    claimed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Device tokens table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS device_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL DEFAULT 'expo',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS member_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_account_id INTEGER NOT NULL,
    server_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL DEFAULT 'java',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS owner_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
`);

// Seed default presets if none exist
const presetCount = sqlite.prepare("SELECT COUNT(*) as n FROM store_presets").get() as { n: number };
if (presetCount.n === 0) {
  sqlite.exec(`
    INSERT INTO store_presets (name, description, price, animation_style, color_scheme, accent_color, gradient_start, gradient_end, glow_color, badge_label) VALUES
    ('Starter', 'Clean default look — no extras.', 0, 'none', 'dark', '#22c55e', NULL, NULL, NULL, 'FREE'),
    ('Neon Surge', 'Electric cyan particles fly across the screen.', 4.99, 'particles', 'dark', '#06b6d4', '#0a0a1a', '#0f2d3d', '#06b6d4', 'POPULAR'),
    ('Pixel Rain', 'Falling green pixel rain à la Matrix.', 4.99, 'pixel_rain', 'dark', '#22c55e', '#030b03', '#071307', '#22c55e', NULL),
    ('Floating Blocks', 'Minecraft blocks gently float upward.', 6.99, 'floating_blocks', 'emerald', '#10b981', '#01110a', '#022c1a', '#10b981', 'NEW'),
    ('Amethyst Glow', 'Purple crystal glow pulses behind your products.', 6.99, 'neon_glow', 'purple', '#c084fc', '#0c0520', '#1a0b40', '#c084fc', NULL),
    ('Nether Fire', 'Red ember particles rise from the bottom.', 7.99, 'nether_fire', 'red', '#f97316', '#1a0300', '#300a00', '#f97316', 'HOT'),
    ('Enchanted Forest', 'Gold sparkles shimmer across a dark green bg.', 9.99, 'enchanted', 'emerald', '#fbbf24', '#011a08', '#032d12', '#fbbf24', 'EXCLUSIVE'),
    ('Ocean Depth', 'Bioluminescent bubbles float through deep blue.', 7.99, 'particles', 'blue', '#38bdf8', '#01060f', '#011a33', '#38bdf8', NULL)
  `);
}

export interface IStorage {
  // Users
  createUser(data: InsertUser): User;
  getUserById(id: number): User | undefined;
  getUserByEmail(email: string): User | undefined;
  getUserByUsername(username: string): User | undefined;
  // Servers
  createServer(data: InsertServer): Server;
  getAllServers(): any[];
  getServersByOwner(ownerId: number): Server[];
  getServerById(id: number): Server | undefined;
  updateServer(id: number, data: Partial<InsertServer>): Server | undefined;
  deleteServer(id: number): void;
  // Products
  createProduct(data: InsertProduct): Product;
  getProductsByServer(serverId: number): Product[];
  getProductById(id: number): Product | undefined;
  updateProduct(id: number, data: Partial<InsertProduct>): Product | undefined;
  deleteProduct(id: number): void;
  // Members
  createMember(data: InsertMember): Member;
  getMembersByServer(serverId: number): Member[];
  getMemberById(id: number): Member | undefined;
  getMemberByUsername(serverId: number, username: string): Member | undefined;
  updateMemberBalance(id: number, balance: number): Member | undefined;
  updateMemberTotalSpent(id: number, addAmount: number): void;
  deleteMember(id: number): void;
  // Orders
  createOrder(data: InsertOrder): Order;
  getOrdersByServer(serverId: number): Order[];
  getOrderById(id: number): Order | undefined;
  updateOrderStatus(id: number, status: string, webhookDelivered?: boolean): Order | undefined;
  updateOrderUsername(id: number, minecraftUsername: string): void;
  getTopSpenders(serverId: number, since: string | null): { minecraftUsername: string; total: number }[];
  getUndeliveredOrders(): { id: number; serverId: number; productId: number; minecraftUsername: string; webhookRetryCount: number }[];
  incrementWebhookRetry(orderId: number): void;
  getPendingCommandsForServer(serverId: number): { id: number; minecraftUsername: string; command: string; commands: string[]; productName: string; amount: number }[];
  getServerAnalytics(serverId: number): { dailyRevenue: { date: string; revenue: number }[]; topProducts: { name: string; count: number; revenue: number }[]; hourlyOrders: { hour: number; count: number }[] };
  getMostPurchased(serverId: number, limit: number): { product_id: number; product_name: string; purchase_count: number; image_url: string | null; image_type: string | null; player_head_name: string | null; price: number }[];
  // Notifications
  createNotification(data: InsertNotification): Notification;
  getNotificationsByUser(userId: number): Notification[];
  markNotificationRead(id: number): void;
  // Store Theme
  getStoreTheme(serverId: number): StoreTheme | undefined;
  upsertStoreTheme(data: InsertStoreTheme): StoreTheme;
  // Presets
  getAllPresets(): StorePreset[];
  getPresetById(id: number): StorePreset | undefined;
  getOwnerPresetPurchases(ownerId: number): (PresetPurchase & { preset: StorePreset })[];
  purchasePreset(data: InsertPresetPurchase): PresetPurchase;
  hasOwnerPurchasedPreset(ownerId: number, presetId: number): boolean;
  // Checkout Sessions
  createCheckoutSession(data: InsertCheckoutSession): CheckoutSession;
  getCheckoutSession(stripeSessionId: string): CheckoutSession | undefined;
  updateCheckoutSessionStatus(stripeSessionId: string, status: string): void;
  // Member Accounts
  createMemberAccount(data: InsertMemberAccount): MemberAccount;
  getMemberAccount(serverId: number, username: string): MemberAccount | undefined;
  getMemberAccountByEmail(serverId: number, email: string): MemberAccount | undefined;
  // Gift Orders
  createGiftOrder(data: InsertGiftOrder): GiftOrder;
  getGiftOrdersByServer(serverId: number): GiftOrder[];
  // Domain checkout
  createDomainCheckout(stripeSessionId: string, ownerId: number, serverId: number): void;
  getDomainCheckout(stripeSessionId: string): { id: number; stripeSessionId: string; ownerId: number; serverId: number; status: string } | undefined;
  activateDomainPlan(serverId: number, customDomain?: string): void;
  // Admin
  // Subdomain claims
  claimSubdomain(serverId: number, subdomain: string): { success: boolean; error?: string };
  revokeSubdomain(serverId: number): void;
  getSubdomainByServer(serverId: number): string | null;
  getServerBySubdomain(subdomain: string): any | null;
  getAllSubdomainClaims(): any[];

  // Push notifications
  registerDeviceToken(ownerId: number, token: string, platform: string): void;
  getDeviceTokensForOwner(ownerId: number): string[];
  getDeviceTokensForServer(serverId: number): string[];

  getAdminStats(): {
    totalServers: number;
    totalOwners: number;
    totalOrders: number;
    totalRevenue: number;
    totalPlatformFee: number;
    totalPresetRevenue: number;
    activeDomainPlans: number;
  };
  getAdminServers(): any[];
  getAuditLog(limit?: number): any[];
  // Owner sessions (persistent login)
  createOwnerSession(userId: number, token: string, expiresAt: string): OwnerSession;
  getOwnerSession(token: string): OwnerSession | undefined;
  deleteOwnerSession(token: string): void;
  deleteExpiredOwnerSessions(): void;
  // Member Sessions
  getMemberAccountById(id: number): MemberAccount | undefined;
  createMemberSession(memberAccountId: number, serverId: number, token: string, platform: string, expiresAt: string): MemberSessionRow;
  getMemberSession(token: string): MemberSessionRow | undefined;
  deleteMemberSession(token: string): void;
  deleteExpiredMemberSessions(): void;
  // Subscriptions
  createSubscription(data: { serverId: number; productId: number; memberId: number; minecraftUsername: string; stripeSubscriptionId: string; stripeCustomerId: string; status: string; currentPeriodEnd: string; cancelAtPeriodEnd: number; productName: string; amount: number }): any;
  getSubscriptionsByServer(serverId: number): any[];
  getSubscriptionsByUsername(serverId: number, username: string): any[];
  getSubscriptionByStripeId(stripeSubscriptionId: string): any;
  updateSubscriptionStatus(stripeSubscriptionId: string, status: string, currentPeriodEnd?: string, cancelAtPeriodEnd?: number): void;
  cancelSubscription(stripeSubscriptionId: string): void;
}

export const storage: IStorage = {
  // ── Users ──────────────────────────────────────────────────────────────────
  createUser(data) {
    return db.insert(users).values(data).returning().get();
  },
  getUserById(id) {
    return db.select().from(users).where(eq(users.id, id)).get();
  },
  getUserByEmail(email) {
    return db.select().from(users).where(eq(users.email, email)).get();
  },
  getUserByUsername(username) {
    return db.select().from(users).where(eq(users.username, username)).get();
  },

  // ── Servers ────────────────────────────────────────────────────────────────
  createServer(data) {
    return db.insert(servers).values(data).returning().get();
  },
  getServerById(id) {
    // Use raw query so ALTER TABLE columns (discord_url, server_ip, custom_domain, domain_plan_active) are included
    const row = sqlite.prepare(`SELECT * FROM servers WHERE id = ?`).get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id, ownerId: row.owner_id, name: row.name,
      webhookUrl: row.webhook_url, webhookSecret: row.webhook_secret,
      logoUrl: row.logo_url, description: row.description,
      discordUrl: row.discord_url || null,
      serverIp: row.server_ip || null,
      customDomain: row.custom_domain || null,
      domainPlanActive: row.domain_plan_active === 1,
      stripeAccountId: row.stripe_account_id || null,
      stripeConnectStatus: row.stripe_connect_status || 'not_connected',
      bedrockPrefix: row.bedrock_prefix || 'none',
      bedrockEnabled: row.bedrock_enabled === 1,
      bedrockReplaceSpaces: row.bedrock_replace_spaces !== 0,
      createdAt: row.created_at,
    } as any;
  },
  getAllServers() {
    return sqlite.prepare(`SELECT * FROM servers`).all() as any[];
  },
  getServersByOwner(ownerId) {
    const rows = sqlite.prepare(`SELECT * FROM servers WHERE owner_id = ?`).all(ownerId) as any[];
    return rows.map(row => ({
      id: row.id, ownerId: row.owner_id, name: row.name,
      webhookUrl: row.webhook_url, webhookSecret: row.webhook_secret,
      logoUrl: row.logo_url, description: row.description,
      discordUrl: row.discord_url || null,
      serverIp: row.server_ip || null,
      customDomain: row.custom_domain || null,
      domainPlanActive: row.domain_plan_active === 1,
      stripeAccountId: row.stripe_account_id || null,
      stripeConnectStatus: row.stripe_connect_status || 'not_connected',
      createdAt: row.created_at,
    } as any));
  },
  updateServer(id, data) {
    // Build dynamic SET clause
    const fieldMap: Record<string, string> = {
      name: 'name', webhookUrl: 'webhook_url', webhookSecret: 'webhook_secret',
      logoUrl: 'logo_url', description: 'description',
      discordUrl: 'discord_url', serverIp: 'server_ip',
      customDomain: 'custom_domain', domainPlanActive: 'domain_plan_active',
      stripeAccountId: 'stripe_account_id', stripeConnectStatus: 'stripe_connect_status',
      bedrockEnabled: 'bedrock_enabled', bedrockPrefix: 'bedrock_prefix', bedrockReplaceSpaces: 'bedrock_replace_spaces',
    };
    const entries = Object.entries(data).filter(([k]) => fieldMap[k] !== undefined);
    if (entries.length === 0) return storage.getServerById(id);
    const setClauses = entries.map(([k]) => `${fieldMap[k]} = ?`).join(', ');
    // Convert booleans to 1/0 for SQLite
    const values = entries.map(([, v]) => typeof v === 'boolean' ? (v ? 1 : 0) : v);
    sqlite.prepare(`UPDATE servers SET ${setClauses} WHERE id = ?`).run(...values, id);
    return storage.getServerById(id);
  },
  deleteServer(id) {
    db.delete(servers).where(eq(servers.id, id)).run();
  },

  // ── Products ───────────────────────────────────────────────────────────────
  createProduct(data) {
    return db.insert(products).values(data).returning().get();
  },
  getProductsByServer(serverId) {
    return db.select().from(products).where(eq(products.serverId, serverId)).all();
  },
  getProductById(id) {
    return db.select().from(products).where(eq(products.id, id)).get();
  },
  updateProduct(id, data) {
    return db.update(products).set(data).where(eq(products.id, id)).returning().get();
  },
  deleteProduct(id) {
    db.delete(products).where(eq(products.id, id)).run();
  },

  // ── Members ────────────────────────────────────────────────────────────────
  createMember(data) {
    return db.insert(members).values(data).returning().get();
  },
  getMembersByServer(serverId) {
    return db.select().from(members).where(eq(members.serverId, serverId)).all();
  },
  getMemberById(id) {
    return db.select().from(members).where(eq(members.id, id)).get();
  },
  getMemberByUsername(serverId, username) {
    return db.select().from(members)
      .where(and(eq(members.serverId, serverId), eq(members.minecraftUsername, username)))
      .get();
  },
  updateMemberBalance(id, balance) {
    return db.update(members).set({ balance }).where(eq(members.id, id)).returning().get();
  },
  updateMemberTotalSpent(id, addAmount) {
    sqlite.prepare("UPDATE members SET total_spent = total_spent + ? WHERE id = ?").run(addAmount, id);
  },
  updateMemberEcoStats(serverId: number, minecraftUsername: string, ecoRank: number, ecoBalance: number) {
    sqlite.prepare(
      "UPDATE members SET eco_rank = ?, eco_balance = ? WHERE server_id = ? AND LOWER(minecraft_username) = LOWER(?)"
    ).run(ecoRank, ecoBalance, serverId, minecraftUsername);
  },
  deleteMember(id) {
    db.delete(members).where(eq(members.id, id)).run();
  },

  // ── Orders ─────────────────────────────────────────────────────────────────
  createOrder(data) {
    return db.insert(orders).values(data).returning().get();
  },
  getOrdersByServer(serverId) {
    // Use raw SQL to include product_name (from orders or joined from products)
    const rows = sqlite.prepare(`
      SELECT o.*, COALESCE(o.product_name, p.name) as product_name
      FROM orders o
      LEFT JOIN products p ON o.product_id = p.id
      WHERE o.server_id = ?
      ORDER BY o.created_at DESC, o.id DESC
    `).all(serverId) as any[];
    // Map snake_case to camelCase to match Drizzle output shape
    return rows.map((r: any) => ({
      id: r.id,
      serverId: r.server_id,
      productId: r.product_id,
      memberId: r.member_id,
      minecraftUsername: r.minecraft_username,
      amount: r.amount,
      platformFee: r.platform_fee,
      status: r.status,
      stripePaymentIntentId: r.stripe_payment_intent_id,
      stripeSessionId: r.stripe_session_id,
      webhookDelivered: r.webhook_delivered,
      webhookRetryCount: r.webhook_retry_count,
      creatorCodeUsed: r.creator_code_used,
      creatorCodeDiscount: r.creator_code_discount,
      createdAt: r.created_at,
      productName: r.product_name || null,
    }));
  },
  getOrderById(id) {
    return db.select().from(orders).where(eq(orders.id, id)).get();
  },
  updateOrderStatus(id, status, webhookDelivered) {
    const data: any = { status };
    if (webhookDelivered !== undefined) data.webhookDelivered = webhookDelivered;
    return db.update(orders).set(data).where(eq(orders.id, id)).returning().get();
  },
  updateOrderUsername(id, minecraftUsername) {
    sqlite.prepare(`UPDATE orders SET minecraft_username = ? WHERE id = ?`).run(minecraftUsername, id);
  },
  getTopSpenders(serverId, since) {
    // Returns top 10 spenders for a server, optionally filtered by date
    if (since) {
      return sqlite.prepare(`
        SELECT minecraft_username, SUM(amount) as total
        FROM orders
        WHERE server_id = ? AND status IN ('completed', 'failed', 'pending', 'delivered') AND created_at >= ?
        GROUP BY minecraft_username
        ORDER BY total DESC
        LIMIT 10
      `).all(serverId, since) as { minecraftUsername: string; total: number }[];
    }
    return sqlite.prepare(`
      SELECT minecraft_username, SUM(amount) as total
      FROM orders
      WHERE server_id = ? AND status IN ('completed', 'failed', 'pending', 'delivered')
      GROUP BY minecraft_username
      ORDER BY total DESC
      LIMIT 10
    `).all(serverId) as { minecraftUsername: string; total: number }[];
  },

  getMostPurchased(serverId: number, limit: number) {
    return sqlite.prepare(`
      SELECT o.product_id, p.name as product_name, COUNT(*) as purchase_count,
             p.image_url, p.image_type, p.player_head_name, p.price
      FROM orders o
      LEFT JOIN products p ON p.id = o.product_id
      WHERE o.server_id = ? AND o.status IN ('completed', 'failed', 'pending', 'delivered')
      GROUP BY o.product_id
      ORDER BY purchase_count DESC
      LIMIT ?
    `).all(serverId, limit) as any[];
  },

  getUndeliveredOrders() {
    return sqlite.prepare(`
      SELECT o.id, o.server_id as serverId, o.product_id as productId,
             o.minecraft_username as minecraftUsername,
             o.webhook_retry_count as webhookRetryCount
      FROM orders o
      WHERE o.status = 'completed'
        AND o.webhook_delivered = 0
        AND o.webhook_retry_count < 5
      ORDER BY o.created_at ASC
    `).all() as any[];
  },

  incrementWebhookRetry(orderId) {
    sqlite.prepare(`UPDATE orders SET webhook_retry_count = webhook_retry_count + 1 WHERE id = ?`).run(orderId);
  },

  getPendingCommandsForServer(serverId) {
    const rows = sqlite.prepare(`
      SELECT o.id, o.minecraft_username as minecraftUsername,
             o.amount, p.name as productName,
             p.command
      FROM orders o
      LEFT JOIN products p ON p.id = o.product_id
      WHERE o.server_id = ?
        AND o.status IN ('completed', 'delivered')
        AND (o.webhook_delivered = 0 OR o.webhook_delivered IS NULL OR o.webhook_delivered = 'false')
      ORDER BY o.created_at ASC
      LIMIT 50
    `).all(serverId) as any[];
    return rows.map((r: any) => ({
      id: r.id,
      minecraftUsername: r.minecraftUsername,
      productName: r.productName || '',
      amount: r.amount,
      command: (r.command || '').replace('%player%', r.minecraftUsername).replace('{player}', r.minecraftUsername),
      commands: (r.command || '').split('\n').map((c: string) => c.trim()).filter(Boolean).map((c: string) => c.replace('%player%', r.minecraftUsername).replace('{player}', r.minecraftUsername)),
    }));
  },

  getServerAnalytics(serverId) {
    // Daily revenue: last 30 days
    const dailyRevenue = sqlite.prepare(`
      SELECT strftime('%Y-%m-%d', created_at) as date,
             COALESCE(SUM(amount), 0) as revenue
      FROM orders
      WHERE server_id = ? AND status IN ('completed', 'failed', 'pending', 'delivered')
        AND created_at >= datetime('now', '-30 days')
      GROUP BY date
      ORDER BY date ASC
    `).all(serverId) as { date: string; revenue: number }[];

    // Top 5 products by purchase count
    const topProducts = sqlite.prepare(`
      SELECT o.product_name as name,
             COUNT(*) as count,
             COALESCE(SUM(o.amount), 0) as revenue
      FROM orders o
      WHERE o.server_id = ? AND o.status IN ('completed', 'failed', 'pending', 'delivered')
      GROUP BY o.product_name
      ORDER BY count DESC
      LIMIT 5
    `).all(serverId) as { name: string; count: number; revenue: number }[];

    // Hourly distribution (0-23)
    const hourlyOrders = sqlite.prepare(`
      SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour,
             COUNT(*) as count
      FROM orders
      WHERE server_id = ? AND status IN ('completed', 'failed', 'pending', 'delivered')
      GROUP BY hour
      ORDER BY hour ASC
    `).all(serverId) as { hour: number; count: number }[];

    return { dailyRevenue, topProducts, hourlyOrders };
  },

  // ── Notifications ──────────────────────────────────────────────────────────
  createNotification(data) {
    return db.insert(notifications).values(data).returning().get();
  },
  getNotificationsByUser(userId) {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .all();
  },
  markNotificationRead(id) {
    db.update(notifications).set({ read: true }).where(eq(notifications.id, id)).run();
  },

  // ── Store Theme ────────────────────────────────────────────────────────────
  getStoreTheme(serverId) {
    return db.select().from(storeThemes).where(eq(storeThemes.serverId, serverId)).get();
  },
  upsertStoreTheme(data) {
    const existing = db.select().from(storeThemes).where(eq(storeThemes.serverId, data.serverId)).get();
    if (existing) {
      return db.update(storeThemes)
        .set({ ...data, updatedAt: new Date().toISOString() })
        .where(eq(storeThemes.serverId, data.serverId))
        .returning().get();
    }
    return db.insert(storeThemes).values({ ...data, updatedAt: new Date().toISOString() }).returning().get();
  },

  // ── Presets ────────────────────────────────────────────────────────────────
  getAllPresets() {
    return db.select().from(storePresets).all();
  },
  getPresetById(id) {
    return db.select().from(storePresets).where(eq(storePresets.id, id)).get();
  },
  getOwnerPresetPurchases(ownerId) {
    const purchases = db.select().from(presetPurchases)
      .where(eq(presetPurchases.ownerId, ownerId)).all();
    return purchases.map(p => {
      const preset = db.select().from(storePresets).where(eq(storePresets.id, p.presetId)).get()!;
      return { ...p, preset };
    });
  },
  purchasePreset(data) {
    return db.insert(presetPurchases).values(data).returning().get();
  },
  hasOwnerPurchasedPreset(ownerId, presetId) {
    const row = db.select().from(presetPurchases)
      .where(and(eq(presetPurchases.ownerId, ownerId), eq(presetPurchases.presetId, presetId)))
      .get();
    return !!row;
  },

  // ── Checkout Sessions ──────────────────────────────────────────────────────
  createCheckoutSession(data) {
    return db.insert(checkoutSessions).values(data).returning().get();
  },
  getCheckoutSession(stripeSessionId) {
    return db.select().from(checkoutSessions)
      .where(eq(checkoutSessions.stripeSessionId, stripeSessionId)).get();
  },
  updateCheckoutSessionStatus(stripeSessionId, status) {
    db.update(checkoutSessions).set({ status })
      .where(eq(checkoutSessions.stripeSessionId, stripeSessionId)).run();
  },

  // ── Member Accounts ────────────────────────────────────────────────────────
  createMemberAccount(data) {
    return db.insert(memberAccounts).values(data).returning().get();
  },
  getMemberAccount(serverId, username) {
    return db.select().from(memberAccounts)
      .where(and(eq(memberAccounts.serverId, serverId), eq(memberAccounts.minecraftUsername, username)))
      .get();
  },
  getMemberAccountByEmail(serverId, email) {
    return db.select().from(memberAccounts)
      .where(and(eq(memberAccounts.serverId, serverId), eq(memberAccounts.email, email)))
      .get();
  },

  // ── Gift Orders ────────────────────────────────────────────────────────────
  createGiftOrder(data) {
    return db.insert(giftOrders).values(data).returning().get();
  },
  getGiftOrdersByServer(serverId) {
    return sqlite.prepare(`
      SELECT g.* FROM gift_orders g
      JOIN orders o ON g.order_id = o.id
      WHERE o.server_id = ?
      ORDER BY g.created_at DESC
    `).all(serverId) as GiftOrder[];
  },

  getGiftsReceivedByUsername(serverId: number, username: string) {
    return sqlite.prepare(`
      SELECT g.*, o.amount, o.created_at as order_date, p.name as product_name
      FROM gift_orders g
      JOIN orders o ON o.id = g.order_id
      LEFT JOIN products p ON p.id = o.product_id
      WHERE o.server_id = ? AND g.recipient_username = ?
      ORDER BY g.created_at DESC
    `).all(serverId, username) as any[];
  },

  // ── Domain Checkout ────────────────────────────────────────────────────────
  createDomainCheckout(stripeSessionId, ownerId, serverId) {
    sqlite.prepare(`INSERT INTO domain_checkout_sessions (stripe_session_id, owner_id, server_id) VALUES (?,?,?)`)
      .run(stripeSessionId, ownerId, serverId);
  },
  getDomainCheckout(stripeSessionId) {
    const row = sqlite.prepare(`SELECT * FROM domain_checkout_sessions WHERE stripe_session_id = ?`)
      .get(stripeSessionId) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      stripeSessionId: row.stripe_session_id,
      ownerId: row.owner_id,
      serverId: row.server_id,
      status: row.status,
    };
  },
  activateDomainPlan(serverId, customDomain) {
    if (customDomain !== undefined) {
      sqlite.prepare(`UPDATE servers SET domain_plan_active = 1, custom_domain = ? WHERE id = ?`)
        .run(customDomain, serverId);
    } else {
      sqlite.prepare(`UPDATE servers SET domain_plan_active = 1 WHERE id = ?`).run(serverId);
    }
  },

  // ── Subdomain ────────────────────────────────────────────────────────────
  claimSubdomain(serverId, subdomain) {
    // Ensure table exists (safe on live DB that was created before this migration)
    sqlite.exec(`CREATE TABLE IF NOT EXISTS subdomain_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL UNIQUE,
      subdomain TEXT NOT NULL UNIQUE,
      claimed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    // Validate: lowercase alphanumeric + hyphens only, 3-32 chars
    if (!/^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/.test(subdomain) && !/^[a-z0-9]{3,32}$/.test(subdomain)) {
      return { success: false, error: 'Subdomain must be 3-32 lowercase letters, numbers, or hyphens.' };
    }
    // Check not taken by another server
    const existing = sqlite.prepare(
      'SELECT server_id FROM subdomain_claims WHERE subdomain = ? AND server_id != ?'
    ).get(subdomain, serverId) as any;
    if (existing) return { success: false, error: 'That subdomain is already taken.' };
    sqlite.prepare(
      "INSERT INTO subdomain_claims (server_id, subdomain) VALUES (?, ?) ON CONFLICT(server_id) DO UPDATE SET subdomain = excluded.subdomain, claimed_at = datetime('now')"
    ).run(serverId, subdomain);
    return { success: true };
  },

  revokeSubdomain(serverId) {
    try { sqlite.exec(`CREATE TABLE IF NOT EXISTS subdomain_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, server_id INTEGER NOT NULL UNIQUE, subdomain TEXT NOT NULL UNIQUE, claimed_at TEXT NOT NULL DEFAULT (datetime('now')))`); } catch {}
    sqlite.prepare('DELETE FROM subdomain_claims WHERE server_id = ?').run(serverId);
  },

  getSubdomainByServer(serverId) {
    try { sqlite.exec(`CREATE TABLE IF NOT EXISTS subdomain_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, server_id INTEGER NOT NULL UNIQUE, subdomain TEXT NOT NULL UNIQUE, claimed_at TEXT NOT NULL DEFAULT (datetime('now')))`); } catch {}
    const row = sqlite.prepare('SELECT subdomain FROM subdomain_claims WHERE server_id = ?').get(serverId) as any;
    return row ? row.subdomain : null;
  },

  getServerBySubdomain(subdomain) {
    const row = sqlite.prepare(`
      SELECT s.*, sc.subdomain FROM servers s
      JOIN subdomain_claims sc ON sc.server_id = s.id
      WHERE sc.subdomain = ?
    `).get(subdomain) as any;
    return row || null;
  },

  getAllSubdomainClaims() {
    try { sqlite.exec(`CREATE TABLE IF NOT EXISTS subdomain_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, server_id INTEGER NOT NULL UNIQUE, subdomain TEXT NOT NULL UNIQUE, claimed_at TEXT NOT NULL DEFAULT (datetime('now')))`); } catch {}
    return sqlite.prepare(`
      SELECT sc.id, sc.subdomain, sc.claimed_at, sc.server_id,
             s.name as server_name, s.logo_url,
             u.username as owner_name, u.email as owner_email
      FROM subdomain_claims sc
      JOIN servers s ON s.id = sc.server_id
      JOIN users u ON u.id = s.owner_id
      ORDER BY sc.claimed_at DESC
    `).all() as any[];
  },

  registerDeviceToken(ownerId, token, platform = 'expo') {
    sqlite.prepare(
      'INSERT OR REPLACE INTO device_tokens (owner_id, token, platform) VALUES (?, ?, ?)'
    ).run(ownerId, token, platform);
  },

  getDeviceTokensForOwner(ownerId) {
    const rows = sqlite.prepare(
      'SELECT token FROM device_tokens WHERE owner_id = ?'
    ).all(ownerId) as { token: string }[];
    return rows.map(r => r.token);
  },

  getDeviceTokensForServer(serverId) {
    const rows = sqlite.prepare(`
      SELECT dt.token FROM device_tokens dt
      JOIN servers s ON s.owner_id = dt.owner_id
      WHERE s.id = ?
    `).all(serverId) as { token: string }[];
    return rows.map(r => r.token);
  },

  getAdminStats() {
    const totalServers = (sqlite.prepare(`SELECT COUNT(*) as n FROM servers`).get() as any).n;
    const totalOwners = (sqlite.prepare(`SELECT COUNT(DISTINCT owner_id) as n FROM servers`).get() as any).n;
    const orderRow = sqlite.prepare(`SELECT COUNT(*) as n, COALESCE(SUM(amount),0) as rev, COALESCE(SUM(platform_fee),0) as fee FROM orders WHERE status='completed'`).get() as any;
    const presetRow = sqlite.prepare(`SELECT COALESCE(SUM(sp.price),0) as rev FROM preset_purchases pp JOIN store_presets sp ON sp.id=pp.preset_id`).get() as any;
    const domainRow = sqlite.prepare(`SELECT COUNT(*) as n FROM servers WHERE domain_plan_active=1`).get() as any;
    return {
      totalServers,
      totalOwners,
      totalOrders: orderRow.n,
      totalRevenue: orderRow.rev,
      totalPlatformFee: orderRow.fee,
      totalPresetRevenue: presetRow.rev,
      activeDomainPlans: domainRow.n,
    };
  },
  getAdminServers() {
    return sqlite.prepare(`
      SELECT
        s.id, s.name, s.created_at,
        u.id as owner_id, u.username as owner_name, u.email as owner_email,
        s.domain_plan_active, s.custom_domain, s.discord_url, s.server_ip, s.logo_url,
        COALESCE(p.product_count,0) as product_count,
        COALESCE(m.member_count,0) as member_count,
        COALESCE(o.order_count,0) as order_count,
        COALESCE(o.total_revenue,0) as total_revenue,
        COALESCE(o.total_platform_fee,0) as total_platform_fee,
        pp.preset_name, pp.preset_price
      FROM servers s
      JOIN users u ON u.id = s.owner_id
      LEFT JOIN (SELECT server_id, COUNT(*) as product_count FROM products GROUP BY server_id) p ON p.server_id=s.id
      LEFT JOIN (SELECT server_id, COUNT(*) as member_count FROM members GROUP BY server_id) m ON m.server_id=s.id
      LEFT JOIN (
        SELECT server_id, COUNT(*) as order_count,
               COALESCE(SUM(amount),0) as total_revenue,
               COALESCE(SUM(platform_fee),0) as total_platform_fee
        FROM orders WHERE status='completed' GROUP BY server_id
      ) o ON o.server_id=s.id
      LEFT JOIN (
        SELECT pp2.server_id, sp.name as preset_name, sp.price as preset_price
        FROM preset_purchases pp2
        JOIN store_presets sp ON sp.id=pp2.preset_id
        ORDER BY pp2.id DESC LIMIT 1
      ) pp ON pp.server_id=s.id
      ORDER BY s.id DESC
    `).all() as any[];
  },

  getAuditLog(limit = 200) {
    // Completed orders
    const orders = sqlite.prepare(`
      SELECT
        'order' as event_type,
        o.id as event_id,
        o.created_at,
        s.name as server_name,
        u.username as owner_name,
        u.email as owner_email,
        o.minecraft_username as detail1,
        pr.name as detail2,
        o.amount as amount,
        o.platform_fee as platform_fee,
        o.status as status
      FROM orders o
      JOIN servers s ON s.id = o.server_id
      JOIN users u ON u.id = s.owner_id
      LEFT JOIN products pr ON pr.id = o.product_id
      WHERE o.status = 'completed'
    `).all() as any[];

    // Preset purchases
    const presets = sqlite.prepare(`
      SELECT
        'preset_purchase' as event_type,
        pp.id as event_id,
        pp.purchased_at as created_at,
        s.name as server_name,
        u.username as owner_name,
        u.email as owner_email,
        sp.name as detail1,
        NULL as detail2,
        sp.price as amount,
        NULL as platform_fee,
        'completed' as status
      FROM preset_purchases pp
      JOIN users u ON u.id = pp.owner_id
      LEFT JOIN servers s ON s.id = pp.server_id
      JOIN store_presets sp ON sp.id = pp.preset_id
    `).all() as any[];

    // Domain activations
    const domains = sqlite.prepare(`
      SELECT
        'domain_activation' as event_type,
        dcs.id as event_id,
        dcs.created_at,
        s.name as server_name,
        u.username as owner_name,
        u.email as owner_email,
        s.custom_domain as detail1,
        NULL as detail2,
        4.99 as amount,
        NULL as platform_fee,
        dcs.status as status
      FROM domain_checkout_sessions dcs
      JOIN servers s ON s.id = dcs.server_id
      JOIN users u ON u.id = dcs.owner_id
      WHERE dcs.status = 'completed'
    `).all() as any[];

    // Gift orders
    const gifts = sqlite.prepare(`
      SELECT
        'gift' as event_type,
        g.id as event_id,
        g.created_at,
        s.name as server_name,
        u.username as owner_name,
        u.email as owner_email,
        g.sender_username as detail1,
        g.recipient_username as detail2,
        o.amount as amount,
        o.platform_fee as platform_fee,
        'completed' as status
      FROM gift_orders g
      JOIN orders o ON o.id = g.order_id
      JOIN servers s ON s.id = o.server_id
      JOIN users u ON u.id = s.owner_id
    `).all() as any[];

    // Merge and sort by date desc
    const all = [...orders, ...presets, ...domains, ...gifts];
    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return all.slice(0, limit);
  },

  // ── Owner Sessions ─────────────────────────────────────────────────────────
  createOwnerSession(userId, token, expiresAt) {
    return db.insert(ownerSessions).values({ userId, token, expiresAt }).returning().get();
  },
  getOwnerSession(token) {
    return db.select().from(ownerSessions).where(eq(ownerSessions.token, token)).get();
  },
  deleteOwnerSession(token) {
    db.delete(ownerSessions).where(eq(ownerSessions.token, token)).run();
  },
  deleteExpiredOwnerSessions() {
    db.delete(ownerSessions).where(sql`expires_at < ${new Date().toISOString()}`).run();
  },

  // ── Member Sessions ────────────────────────────────────────────────────────
  getMemberAccountById(id: number): MemberAccount | undefined {
    return sqlite.prepare("SELECT * FROM member_accounts WHERE id = ?").get(id) as MemberAccount | undefined;
  },
  createMemberSession(memberAccountId, serverId, token, platform, expiresAt) {
    return db.insert(memberSessions).values({ memberAccountId, serverId, token, platform, expiresAt }).returning().get();
  },
  getMemberSession(token) {
    return db.select().from(memberSessions).where(eq(memberSessions.token, token)).get();
  },
  deleteMemberSession(token) {
    db.delete(memberSessions).where(eq(memberSessions.token, token)).run();
  },
  deleteExpiredMemberSessions() {
    db.delete(memberSessions).where(sql`expires_at < ${new Date().toISOString()}`).run();
  },
  // ── Creator Codes ──────────────────────────────────────────────────────────
  createCreatorCode(data: InsertCreatorCode): CreatorCode {
    return db.insert(creatorCodes).values(data).returning().get() as CreatorCode;
  },
  getCreatorCodesByServer(serverId: number): CreatorCode[] {
    return db.select().from(creatorCodes).where(eq(creatorCodes.serverId, serverId)).all() as CreatorCode[];
  },
  getCreatorCodeByCode(serverId: number, code: string): CreatorCode | undefined {
    return db.select().from(creatorCodes)
      .where(sql`server_id = ${serverId} AND upper(code) = upper(${code}) AND active = 1`)
      .get() as CreatorCode | undefined;
  },
  updateCreatorCodeEarnings(id: number, earned: number) {
    db.update(creatorCodes).set({ totalEarned: sql`total_earned + ${earned}` }).where(eq(creatorCodes.id, id)).run();
  },
  deleteCreatorCode(id: number) {
    db.delete(creatorCodes).where(eq(creatorCodes.id, id)).run();
  },

  // ── Creator Code Payouts ───────────────────────────────────────────────────
  createCreatorCodePayout(data: InsertCreatorCodePayout): CreatorCodePayout {
    return db.insert(creatorCodePayouts).values(data).returning().get() as CreatorCodePayout;
  },
  getCreatorCodePayoutsByServer(serverId: number): CreatorCodePayout[] {
    return db.select().from(creatorCodePayouts).where(eq(creatorCodePayouts.serverId, serverId))
      .orderBy(desc(creatorCodePayouts.createdAt)).all() as CreatorCodePayout[];
  },
  getCreatorCodePayoutsByCode(creatorCodeId: number): CreatorCodePayout[] {
    return db.select().from(creatorCodePayouts).where(eq(creatorCodePayouts.creatorCodeId, creatorCodeId)).all() as CreatorCodePayout[];
  },
  updateCreatorCodePayoutStatus(id: number, status: string, ownerNote?: string) {
    db.update(creatorCodePayouts).set({
      status,
      ownerNote: ownerNote || null,
      resolvedAt: new Date().toISOString(),
    }).where(eq(creatorCodePayouts.id, id)).run();
    if (status === "paid") {
      const payout = db.select().from(creatorCodePayouts).where(eq(creatorCodePayouts.id, id)).get() as CreatorCodePayout | undefined;
      if (payout) {
        db.update(creatorCodes).set({ totalEarned: sql`total_earned - ${payout.amountRequested}` }).where(eq(creatorCodes.id, payout.creatorCodeId)).run();
      }
    }
  },

  // ── Subscriptions ─────────────────────────────────────────────────────────────
  createSubscription(data: any): any {
    return sqlite.prepare(`
      INSERT INTO subscriptions (server_id, product_id, member_id, minecraft_username, stripe_subscription_id, stripe_customer_id, status, current_period_end, cancel_at_period_end, product_name, amount, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.serverId, data.productId, data.memberId, data.minecraftUsername, data.stripeSubscriptionId, data.stripeCustomerId, data.status, data.currentPeriodEnd, data.cancelAtPeriodEnd, data.productName, data.amount, new Date().toISOString());
  },
  getSubscriptionsByServer(serverId: number): any[] {
    return sqlite.prepare("SELECT * FROM subscriptions WHERE server_id = ? ORDER BY created_at DESC").all(serverId);
  },
  getSubscriptionsByUsername(serverId: number, username: string): any[] {
    return sqlite.prepare("SELECT * FROM subscriptions WHERE server_id = ? AND minecraft_username = ? ORDER BY created_at DESC").all(serverId, username);
  },
  getSubscriptionByStripeId(stripeSubscriptionId: string): any {
    return sqlite.prepare("SELECT * FROM subscriptions WHERE stripe_subscription_id = ?").get(stripeSubscriptionId);
  },
  updateSubscriptionStatus(stripeSubscriptionId: string, status: string, currentPeriodEnd?: string, cancelAtPeriodEnd?: number): void {
    sqlite.prepare("UPDATE subscriptions SET status = ?, current_period_end = COALESCE(?, current_period_end), cancel_at_period_end = COALESCE(?, cancel_at_period_end) WHERE stripe_subscription_id = ?")
      .run(status, currentPeriodEnd ?? null, cancelAtPeriodEnd ?? null, stripeSubscriptionId);
  },
  cancelSubscription(stripeSubscriptionId: string): void {
    sqlite.prepare("UPDATE subscriptions SET status = 'cancelled', cancel_at_period_end = 1 WHERE stripe_subscription_id = ?").run(stripeSubscriptionId);
  },
};
