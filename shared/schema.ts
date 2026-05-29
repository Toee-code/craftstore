import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Users (server owners + players) ─────────────────────────────────────────
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("owner"), // "owner" | "player"
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ─── Servers ──────────────────────────────────────────────────────────────────
export const servers = sqliteTable("servers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: integer("owner_id").notNull(),
  name: text("name").notNull(),
  webhookUrl: text("webhook_url"),
  webhookSecret: text("webhook_secret"),
  logoUrl: text("logo_url"),
  description: text("description"),
  discordUrl: text("discord_url"),                                  // NEW: Discord invite link
  serverIp: text("server_ip"),                                      // NEW: Minecraft server IP
  customDomain: text("custom_domain"),                              // NEW: custom domain (paid)
  domainPlanActive: integer("domain_plan_active", { mode: "boolean" }).default(false), // NEW
  stripeAccountId: text("stripe_account_id"),         // Stripe Connect account ID
  stripeConnectStatus: text("stripe_connect_status").default("not_connected"), // "not_connected" | "pending" | "active"
  bedrockPrefix: text("bedrock_prefix").default("none"), // "none" | "." | "_" — prefix added to Bedrock usernames
  bedrockEnabled: integer("bedrock_enabled", { mode: "boolean" }).default(false), // show Bedrock login option
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertServerSchema = createInsertSchema(servers).omit({ id: true, createdAt: true });
export type InsertServer = z.infer<typeof insertServerSchema>;
export type Server = typeof servers.$inferSelect;

// ─── Products ─────────────────────────────────────────────────────────────────
export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serverId: integer("server_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  imageUrl: text("image_url"),
  category: text("category"),
  subcategory: text("subcategory"),            // NEW: subcategory within a category
  command: text("command").notNull(),
  stock: integer("stock").default(-1),
  active: integer("active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// ─── Members (players linked to a server) ────────────────────────────────────
export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serverId: integer("server_id").notNull(),
  minecraftUsername: text("minecraft_username").notNull(),
  email: text("email"),
  balance: real("balance").notNull().default(0),
  totalSpent: real("total_spent").notNull().default(0),  // NEW: cumulative spending
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertMemberSchema = createInsertSchema(members).omit({ id: true, createdAt: true });
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof members.$inferSelect;

// ─── Orders ───────────────────────────────────────────────────────────────────
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serverId: integer("server_id").notNull(),
  productId: integer("product_id").notNull(),
  memberId: integer("member_id"),
  minecraftUsername: text("minecraft_username").notNull(),
  amount: real("amount").notNull(),
  platformFee: real("platform_fee").notNull().default(0),   // NEW: 20% platform cut
  status: text("status").notNull().default("pending"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  webhookDelivered: integer("webhook_delivered", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// ─── Notifications ────────────────────────────────────────────────────────────
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  message: text("message").notNull(),
  read: integer("read", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// ─── Store Theme ──────────────────────────────────────────────────────────────
// layout: "grid" | "list" | "featured"
// colorScheme: "dark" | "light" | "emerald" | "purple" | "red" | "blue" | "gold" | "rose"
// startPage: "all" | "leaderboard" | category name string
// categories stored as JSON array string e.g. ["Weapons","Ranks"]
// subcategories stored as JSON object string e.g. {"Weapons":["Swords","Bows"]}
// feeMode: "absorb" (owner pays 20% from their cut) | "passthrough" (20% added to player price)
// activePresetId: optional purchased preset ID
export const storeThemes = sqliteTable("store_themes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serverId: integer("server_id").notNull().unique(),
  layout: text("layout").notNull().default("grid"),
  colorScheme: text("color_scheme").notNull().default("dark"),
  accentColor: text("accent_color").default("#22c55e"),
  bannerUrl: text("banner_url"),
  startPage: text("start_page").default("all"),
  announcementText: text("announcement_text"),
  categories: text("categories").default("[]"),       // JSON array
  subcategories: text("subcategories").default("{}"), // NEW: JSON object map
  feeMode: text("fee_mode").notNull().default("absorb"), // NEW: "absorb" | "passthrough"
  activePresetId: integer("active_preset_id"),           // NEW: purchased preset
  welcomeTitle: text("welcome_title"),                    // NEW: welcome section heading
  welcomeText: text("welcome_text"),                      // NEW: welcome section body
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

export const insertStoreThemeSchema = createInsertSchema(storeThemes).omit({ id: true, updatedAt: true });
export type InsertStoreTheme = z.infer<typeof insertStoreThemeSchema>;
export type StoreTheme = typeof storeThemes.$inferSelect;

// ─── Store Presets ────────────────────────────────────────────────────────────
// Purchasable animation + colour packs that owners can buy to upgrade their store
// animationStyle: "none" | "particles" | "pixel_rain" | "floating_blocks" | "neon_glow" | "enchanted" | "nether_fire"
// colorOverrides stored as JSON object string with custom CSS variables
export const storePresets = sqliteTable("store_presets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: real("price").notNull(),          // price in £ for the owner to purchase
  animationStyle: text("animation_style").notNull().default("none"),
  colorScheme: text("color_scheme").notNull().default("dark"),
  accentColor: text("accent_color").notNull().default("#22c55e"),
  gradientStart: text("gradient_start"),   // optional gradient bg
  gradientEnd: text("gradient_end"),
  glowColor: text("glow_color"),           // optional glow effect color
  badgeLabel: text("badge_label"),         // e.g. "POPULAR", "NEW", "EXCLUSIVE"
  previewImageUrl: text("preview_image_url"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertStorePresetSchema = createInsertSchema(storePresets).omit({ id: true, createdAt: true });
export type InsertStorePreset = z.infer<typeof insertStorePresetSchema>;
export type StorePreset = typeof storePresets.$inferSelect;

// ─── Preset Purchases ─────────────────────────────────────────────────────────
// Track which owners have bought which presets
export const presetPurchases = sqliteTable("preset_purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: integer("owner_id").notNull(),
  presetId: integer("preset_id").notNull(),
  serverId: integer("server_id"),             // which server it's applied to (null = purchased but not applied)
  purchasedAt: text("purchased_at").notNull().default(new Date().toISOString()),
});

export const insertPresetPurchaseSchema = createInsertSchema(presetPurchases).omit({ id: true, purchasedAt: true });
export type InsertPresetPurchase = z.infer<typeof insertPresetPurchaseSchema>;
export type PresetPurchase = typeof presetPurchases.$inferSelect;

// ─── Stripe Checkout Sessions ─────────────────────────────────────────────────
// Tracks pending Stripe checkout sessions for preset purchases
export const checkoutSessions = sqliteTable("checkout_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  ownerId: integer("owner_id").notNull(),
  presetId: integer("preset_id").notNull(),
  serverId: integer("server_id"),
  status: text("status").notNull().default("pending"), // "pending" | "completed" | "expired"
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertCheckoutSessionSchema = createInsertSchema(checkoutSessions).omit({ id: true, createdAt: true });
export type InsertCheckoutSession = z.infer<typeof insertCheckoutSessionSchema>;
export type CheckoutSession = typeof checkoutSessions.$inferSelect;

// ─── Member Auth ──────────────────────────────────────────────────────────────
// Players can create accounts tied to a server to track balance + orders
export const memberAccounts = sqliteTable("member_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serverId: integer("server_id").notNull(),
  minecraftUsername: text("minecraft_username").notNull(),
  email: text("email"),
  passwordHash: text("password_hash"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertMemberAccountSchema = createInsertSchema(memberAccounts).omit({ id: true, createdAt: true });
export type InsertMemberAccount = z.infer<typeof insertMemberAccountSchema>;
export type MemberAccount = typeof memberAccounts.$inferSelect;

// ─── Gift Orders ──────────────────────────────────────────────────────────────
// Player buys an item for another player
export const giftOrders = sqliteTable("gift_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull(),          // the underlying order
  senderUsername: text("sender_username").notNull(),
  recipientUsername: text("recipient_username").notNull(),
  message: text("message"),                         // optional gift message
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const insertGiftOrderSchema = createInsertSchema(giftOrders).omit({ id: true, createdAt: true });
export type InsertGiftOrder = z.infer<typeof insertGiftOrderSchema>;
export type GiftOrder = typeof giftOrders.$inferSelect;

// ─── Owner Sessions ───────────────────────────────────────────────────────────
// Persistent login tokens for server owners — stored server-side, token sent via cookie
export const ownerSessions = sqliteTable("owner_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  expiresAt: text("expires_at").notNull(),
});

export type OwnerSession = typeof ownerSessions.$inferSelect;
