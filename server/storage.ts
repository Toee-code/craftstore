import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import {
  users, servers, products, members, orders, notifications, storeThemes, storePresets, presetPurchases,
  checkoutSessions, memberAccounts, giftOrders,
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
} from "@shared/schema";

// Use /data volume on Railway (persistent), fallback to local file
const DB_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/craftstore.db`
  : "craftstore.db";
const sqlite = new Database(DB_PATH);
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
    layout TEXT NOT NULL DEFAULT 'grid',
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
];
for (const stmt of alterStatements) {
  try { sqlite.exec(stmt); } catch { /* column already exists */ }
}

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
  getTopSpenders(serverId: number, since: string | null): { minecraftUsername: string; total: number }[];
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
      createdAt: row.created_at,
    } as any;
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
    };
    const entries = Object.entries(data).filter(([k]) => fieldMap[k] !== undefined);
    if (entries.length === 0) return storage.getServerById(id);
    const setClauses = entries.map(([k]) => `${fieldMap[k]} = ?`).join(', ');
    const values = entries.map(([, v]) => v);
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
  deleteMember(id) {
    db.delete(members).where(eq(members.id, id)).run();
  },

  // ── Orders ─────────────────────────────────────────────────────────────────
  createOrder(data) {
    return db.insert(orders).values(data).returning().get();
  },
  getOrdersByServer(serverId) {
    return db.select().from(orders)
      .where(eq(orders.serverId, serverId))
      .orderBy(desc(orders.createdAt))
      .all();
  },
  getOrderById(id) {
    return db.select().from(orders).where(eq(orders.id, id)).get();
  },
  updateOrderStatus(id, status, webhookDelivered) {
    const data: any = { status };
    if (webhookDelivered !== undefined) data.webhookDelivered = webhookDelivered;
    return db.update(orders).set(data).where(eq(orders.id, id)).returning().get();
  },
  getTopSpenders(serverId, since) {
    // Returns top 10 spenders for a server, optionally filtered by date
    if (since) {
      return sqlite.prepare(`
        SELECT minecraft_username, SUM(amount) as total
        FROM orders
        WHERE server_id = ? AND status = 'completed' AND created_at >= ?
        GROUP BY minecraft_username
        ORDER BY total DESC
        LIMIT 10
      `).all(serverId, since) as { minecraftUsername: string; total: number }[];
    }
    return sqlite.prepare(`
      SELECT minecraft_username, SUM(amount) as total
      FROM orders
      WHERE server_id = ? AND status = 'completed'
      GROUP BY minecraft_username
      ORDER BY total DESC
      LIMIT 10
    `).all(serverId) as { minecraftUsername: string; total: number }[];
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

  // ── Admin ───────────────────────────────────────────────────────────────
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
};
