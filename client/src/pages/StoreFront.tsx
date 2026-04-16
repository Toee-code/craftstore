/**
 * StoreFront v3
 * - Left sidebar: category nav + subcategories + member login button
 * - "Home" page: server info, stats, announcements
 * - Welcome section: owner-defined rich banner
 * - Leaderboard tab: top spenders (monthly / yearly / all-time) with MC skins
 * - Products: grid / list / featured layouts
 * - Preset animations: particles, pixel_rain, floating_blocks, neon_glow, nether_fire, enchanted
 * - Fee-aware: checkout shows correct price based on feeMode
 * - Member auth: login/register modal in sidebar
 * - Gift section: buy an item for another player
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ShoppingCart, Package, CheckCircle2, Loader2, AlertCircle,
  Megaphone, Home, Trophy, ChevronRight, ChevronDown, Menu, X,
  User, Gift, LogIn, LogOut, UserPlus, Heart, MessageSquare
} from "lucide-react";
import type { Product } from "@shared/schema";
import { COLOR_SCHEMES } from "./StoreAppearance";

// ─── Types ────────────────────────────────────────────────────────────────────
interface StorePreset {
  id: number; name: string; animationStyle: string;
  colorScheme: string; accentColor: string;
  gradientStart: string | null; gradientEnd: string | null;
  glowColor: string | null;
}

interface StoreData {
  server: {
    id: number; name: string; description: string | null; logoUrl: string | null;
    discordUrl: string | null; serverIp: string | null;
  };
  products: Product[];
  theme: {
    layout: string; colorScheme: string; accentColor: string;
    bannerUrl: string | null; startPage: string; announcementText: string | null;
    categories: string; subcategories: string; feeMode: string; activePresetId: number | null;
    welcomeTitle: string | null; welcomeText: string | null;
  };
  preset: StorePreset | null;
}

interface MemberSession {
  id: number; minecraftUsername: string; email: string;
}

interface LeaderboardEntry { rank: number; minecraftUsername: string; total: number; }
type LeaderboardPeriod = "monthly" | "yearly" | "alltime";
type SidebarPage = "home" | "leaderboard" | string; // string = category name
interface CheckoutState { open: boolean; product: Product | null; mode: "buy" | "gift"; }

// ─── MC Skin Avatar ───────────────────────────────────────────────────────────
function SkinAvatar({ username, size = 40 }: { username: string; size?: number }) {
  const [err, setErr] = useState(false);
  const url = `https://mc-heads.net/avatar/${username}/${size}`;
  if (err) {
    return (
      <div
        style={{ width: size, height: size, background: "#22c55e22", borderRadius: 6, fontSize: size * 0.5 }}
        className="flex items-center justify-center font-bold"
      >
        {username[0]?.toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={username}
      width={size} height={size}
      style={{ imageRendering: "pixelated", borderRadius: 6 }}
      onError={() => setErr(true)}
    />
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
function LeaderboardPanel({ serverId, accent, scheme }: {
  serverId: number; accent: string; scheme: typeof COLOR_SCHEMES[0];
}) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("alltime");
  const PERIODS: { id: LeaderboardPeriod; label: string }[] = [
    { id: "monthly", label: "This Month" },
    { id: "yearly", label: "This Year" },
    { id: "alltime", label: "All Time" },
  ];

  const { data: entries = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/servers", serverId, "leaderboard", period],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/leaderboard?period=${period}`).then(r => r.json()),
  });

  const rankColors = ["#fbbf24", "#94a3b8", "#cd7f32"];

  return (
    <div className="p-6 max-w-xl mx-auto w-full">
      {/* Period tabs */}
      <div className="flex gap-2 mb-6">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            style={
              period === p.id
                ? { background: accent, color: scheme.bg, border: `1px solid ${accent}` }
                : { background: "transparent", color: scheme.text + "88", border: `1px solid ${accent}30` }
            }
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
            data-testid={`leaderboard-period-${p.id}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: accent }} /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ border: `2px dashed ${accent}25` }}>
          <Trophy className="w-10 h-10 mx-auto mb-3" style={{ color: scheme.text + "33" }} />
          <p className="font-semibold mb-1">No purchases yet</p>
          <p className="text-sm" style={{ color: scheme.text + "66" }}>Be the first to make it on the board!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, i) => (
            <div
              key={entry.minecraftUsername}
              className="flex items-center gap-4 rounded-xl p-4 transition-all"
              style={{
                background: i === 0 ? `${accent}15` : scheme.surface,
                border: `1px solid ${i === 0 ? accent + "40" : accent + "15"}`,
              }}
              data-testid={`leaderboard-entry-${i}`}
            >
              {/* Rank */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-sm shrink-0"
                style={{
                  background: i < 3 ? rankColors[i] + "25" : scheme.bg,
                  color: i < 3 ? rankColors[i] : scheme.text + "66",
                  border: `1px solid ${i < 3 ? rankColors[i] + "50" : accent + "15"}`,
                }}
              >
                {i < 3 ? ["🥇", "🥈", "🥉"][i] : entry.rank}
              </div>

              {/* Skin */}
              <SkinAvatar username={entry.minecraftUsername} size={40} />

              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{entry.minecraftUsername}</p>
                <p className="text-xs" style={{ color: scheme.text + "66" }}>Rank #{entry.rank}</p>
              </div>

              {/* Amount */}
              <div className="text-right shrink-0">
                <p className="font-extrabold text-lg" style={{ color: accent }}>£{entry.total.toFixed(2)}</p>
                <p className="text-xs" style={{ color: scheme.text + "55" }}>spent</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Member Auth Modal ────────────────────────────────────────────────────────
function MemberAuthModal({ serverId, accent, scheme, onClose, onLogin }: {
  serverId: number; accent: string; scheme: typeof COLOR_SCHEMES[0];
  onClose: () => void; onLogin: (session: MemberSession) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const handleSubmit = async () => {
    setError("");
    if (!username.trim() || !password.trim()) { setError("Username and password required."); return; }
    if (mode === "register" && !email.trim()) { setError("Email required for registration."); return; }
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/member-auth/login" : "/api/member-auth/register";
      const body = mode === "login"
        ? { serverId, minecraftUsername: username.trim(), password }
        : { serverId, minecraftUsername: username.trim(), email: email.trim(), password };
      const r = await apiRequest("POST", endpoint, body);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      toast({ title: mode === "login" ? "Welcome back!" : "Account created!", description: `Logged in as ${username}` });
      onLogin({ id: data.member.id, minecraftUsername: data.member.minecraftUsername, email: data.member.email || "" });
      onClose();
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm" style={{ background: scheme.surface, borderColor: accent + "30", color: scheme.text }}>
        <DialogHeader>
          <DialogTitle style={{ color: scheme.text }}>
            {mode === "login" ? "Member Login" : "Create Account"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: accent + "30" }}>
            <button
              onClick={() => setMode("login")}
              className="flex-1 py-2 text-sm font-medium transition-all"
              style={mode === "login" ? { background: accent, color: scheme.bg } : { background: "transparent", color: scheme.text + "99" }}
            >
              Log In
            </button>
            <button
              onClick={() => setMode("register")}
              className="flex-1 py-2 text-sm font-medium transition-all"
              style={mode === "register" ? { background: accent, color: scheme.bg } : { background: "transparent", color: scheme.text + "99" }}
            >
              Register
            </button>
          </div>

          <div className="space-y-1.5">
            <Label style={{ color: scheme.text + "cc" }}>Minecraft Username</Label>
            <Input
              placeholder="Steve"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="bg-transparent"
              style={{ borderColor: accent + "30", color: scheme.text }}
              data-testid="input-member-username"
            />
          </div>

          {mode === "register" && (
            <div className="space-y-1.5">
              <Label style={{ color: scheme.text + "cc" }}>Email</Label>
              <Input
                type="email" placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="bg-transparent"
                style={{ borderColor: accent + "30", color: scheme.text }}
                data-testid="input-member-email"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label style={{ color: scheme.text + "cc" }}>Password</Label>
            <Input
              type="password" placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="bg-transparent"
              style={{ borderColor: accent + "30", color: scheme.text }}
              data-testid="input-member-password"
            />
          </div>

          {error && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: "#ef444422", color: "#f87171", border: "1px solid #ef444440" }}>
              {error}
            </p>
          )}

          <Button
            className="w-full font-semibold gap-2"
            style={{ background: accent, color: scheme.bg }}
            disabled={loading}
            onClick={handleSubmit}
            data-testid="button-member-auth-submit"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              mode === "login" ? <><LogIn className="w-4 h-4" /> Log In</> : <><UserPlus className="w-4 h-4" /> Create Account</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Store Home ───────────────────────────────────────────────────────────────
function StoreHome({ data, accent, scheme, onCategory }: {
  data: StoreData; accent: string; scheme: typeof COLOR_SCHEMES[0];
  onCategory: (cat: string) => void;
}) {
  const categories: string[] = (() => {
    try { return JSON.parse(data.theme.categories || "[]"); } catch { return []; }
  })();

  const activeCount = data.products.filter(p => p.active).length;
  const categoryMap: Record<string, number> = {};
  data.products.forEach(p => { if (p.category) categoryMap[p.category] = (categoryMap[p.category] || 0) + 1; });

  return (
    <div className="p-6 max-w-2xl mx-auto w-full space-y-8">
      {/* Hero */}
      <div className="text-center py-6">
        {data.server.logoUrl ? (
          <img
            src={data.server.logoUrl}
            alt={`${data.server.name} logo`}
            className="w-20 h-20 rounded-2xl mx-auto mb-4 object-cover"
            style={{ border: `2px solid ${accent}35` }}
            data-testid="store-logo"
          />
        ) : (
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: `${accent}18`, border: `2px solid ${accent}35` }}
          >
            <Package className="w-10 h-10" style={{ color: accent }} />
          </div>
        )}
        <h1 className="text-3xl font-extrabold mb-2">{data.server.name}</h1>
        {data.server.description && (
          <p className="text-sm max-w-md mx-auto" style={{ color: scheme.text + "99" }}>{data.server.description}</p>
        )}
      </div>

      {/* Welcome banner on home page */}
      {(data.theme.welcomeTitle || data.theme.welcomeText) && (
        <div
          className="rounded-2xl p-5 relative overflow-hidden"
          style={{ background: accent + "12", border: `1px solid ${accent}30` }}
        >
          <div
            className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-20 pointer-events-none"
            style={{ background: accent }}
          />
          <div className="flex items-start gap-3 relative">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: accent + "25", border: `1px solid ${accent}40` }}
            >
              <Heart className="w-5 h-5" style={{ color: accent }} />
            </div>
            <div className="flex-1 min-w-0">
              {data.theme.welcomeTitle && (
                <h3 className="font-extrabold text-base mb-1 leading-tight" style={{ color: scheme.text }}>
                  {data.theme.welcomeTitle}
                </h3>
              )}
              {data.theme.welcomeText && (
                <p className="text-sm leading-relaxed" style={{ color: scheme.text + "aa" }}>
                  {data.theme.welcomeText}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-4 text-center" style={{ background: scheme.surface, border: `1px solid ${accent}20` }}>
          <p className="text-2xl font-extrabold" style={{ color: accent }}>{activeCount}</p>
          <p className="text-xs mt-1" style={{ color: scheme.text + "77" }}>Items available</p>
        </div>
        <div className="rounded-xl p-4 text-center" style={{ background: scheme.surface, border: `1px solid ${accent}20` }}>
          <p className="text-2xl font-extrabold" style={{ color: accent }}>{categories.length || "—"}</p>
          <p className="text-xs mt-1" style={{ color: scheme.text + "77" }}>Categories</p>
        </div>
      </div>

      {/* Category cards */}
      {categories.length > 0 && (
        <div>
          <h2 className="font-bold text-sm mb-3 uppercase tracking-widest" style={{ color: scheme.text + "66" }}>Browse by Category</h2>
          <div className="grid grid-cols-2 gap-3">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => onCategory(cat)}
                className="rounded-xl p-4 text-left transition-all hover:scale-[1.02]"
                style={{ background: scheme.surface, border: `1px solid ${accent}20` }}
                data-testid={`home-category-${cat}`}
              >
                <p className="font-semibold text-sm">{cat}</p>
                <p className="text-xs mt-1" style={{ color: scheme.text + "66" }}>{categoryMap[cat] || 0} items</p>
              </button>
            ))}
            <button
              onClick={() => onCategory("all")}
              className="rounded-xl p-4 text-left transition-all hover:scale-[1.02]"
              style={{ background: `${accent}12`, border: `1px solid ${accent}35` }}
              data-testid="home-category-all"
            >
              <p className="font-semibold text-sm" style={{ color: accent }}>All Items</p>
              <p className="text-xs mt-1" style={{ color: accent + "99" }}>{activeCount} items</p>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Animation Canvas ─────────────────────────────────────────────────────────
function AnimationLayer({ style, accent, glowColor }: { style: string; accent: string; glowColor: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (style === "none") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    if (style === "particles" || style === "neon_glow") {
      // Floating glowing particles
      const particles = Array.from({ length: 60 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        r: Math.random() * 3 + 1,
        alpha: Math.random() * 0.6 + 0.2,
      }));
      const color = glowColor || accent;
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
          if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
          ctx.save();
          ctx.globalAlpha = p.alpha * 0.7;
          ctx.shadowBlur = style === "neon_glow" ? 18 : 8;
          ctx.shadowColor = color;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
        animId = requestAnimationFrame(draw);
      };
      draw();
    } else if (style === "pixel_rain") {
      // Matrix-style falling pixels
      const cols = Math.floor(canvas.width / 18);
      const drops = Array.from({ length: cols }, () => Math.random() * -50);
      const color = accent;
      const draw = () => {
        ctx.fillStyle = "rgba(0,0,0,0.05)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = "14px monospace";
        drops.forEach((y, i) => {
          const char = String.fromCharCode(0x30A0 + Math.random() * 96);
          ctx.fillStyle = color + "cc";
          ctx.fillText(char, i * 18, y);
          if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
          drops[i] += 18;
        });
        animId = requestAnimationFrame(draw);
      };
      draw();
    } else if (style === "floating_blocks") {
      // Minecraft-ish floating cubes
      const blocks = Array.from({ length: 25 }, () => ({
        x: Math.random() * canvas.width,
        y: canvas.height + Math.random() * 400,
        size: Math.random() * 20 + 8,
        speed: Math.random() * 0.8 + 0.3,
        alpha: Math.random() * 0.25 + 0.05,
        hue: Math.random() > 0.5 ? accent : (glowColor || "#22c55e"),
      }));
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        blocks.forEach(b => {
          b.y -= b.speed;
          if (b.y < -40) { b.y = canvas.height + 40; b.x = Math.random() * canvas.width; }
          ctx.save();
          ctx.globalAlpha = b.alpha;
          ctx.strokeStyle = b.hue;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(b.x, b.y, b.size, b.size);
          ctx.fillStyle = b.hue + "30";
          ctx.fillRect(b.x, b.y, b.size, b.size);
          ctx.restore();
        });
        animId = requestAnimationFrame(draw);
      };
      draw();
    } else if (style === "nether_fire") {
      // Rising ember particles
      const embers = Array.from({ length: 80 }, () => ({
        x: Math.random() * canvas.width,
        y: canvas.height + Math.random() * 100,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -(Math.random() * 2 + 0.5),
        r: Math.random() * 2.5 + 0.5,
        life: Math.random(),
        decay: Math.random() * 0.004 + 0.002,
      }));
      const fireColors = [accent, glowColor || "#f97316", "#ef4444", "#fbbf24"];
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        embers.forEach(e => {
          e.x += e.vx; e.y += e.vy; e.life -= e.decay;
          if (e.life <= 0 || e.y < -10) {
            e.x = Math.random() * canvas.width; e.y = canvas.height + 10;
            e.life = 1; e.vx = (Math.random() - 0.5) * 1.5;
          }
          ctx.save();
          ctx.globalAlpha = e.life * 0.7;
          ctx.shadowBlur = 8;
          ctx.shadowColor = fireColors[Math.floor(Math.random() * fireColors.length)];
          ctx.fillStyle = fireColors[Math.floor(e.life * fireColors.length)] || accent;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
        animId = requestAnimationFrame(draw);
      };
      draw();
    } else if (style === "enchanted") {
      // Sparkle shimmer
      const sparks = Array.from({ length: 50 }, () => ({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        size: Math.random() * 4 + 1, alpha: 0, phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.04 + 0.01,
      }));
      const color = glowColor || accent;
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        sparks.forEach(s => {
          s.phase += s.speed;
          s.alpha = Math.abs(Math.sin(s.phase)) * 0.8;
          ctx.save();
          ctx.globalAlpha = s.alpha;
          ctx.shadowBlur = 12;
          ctx.shadowColor = color;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          if (s.alpha < 0.05 && Math.random() > 0.9) {
            s.x = Math.random() * canvas.width; s.y = Math.random() * canvas.height;
          }
        });
        animId = requestAnimationFrame(draw);
      };
      draw();
    }

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [style, accent, glowColor]);

  if (style === "none") return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, opacity: 0.5 }}
    />
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ product, scheme, accent, onBuy, onGift }: {
  product: Product; scheme: typeof COLOR_SCHEMES[0]; accent: string;
  onBuy: (p: Product) => void; onGift: (p: Product) => void;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden transition-all hover:-translate-y-1 flex flex-col"
      style={{ background: scheme.surface, border: `1px solid ${accent}20` }}
      data-testid={`card-store-product-${product.id}`}
    >
      {product.imageUrl ? (
        <div className="h-36 overflow-hidden shrink-0">
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-36 flex items-center justify-center shrink-0" style={{ background: accent + "10" }}>
          <Package className="w-10 h-10" style={{ color: accent + "50" }} />
        </div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-1 gap-1">
          <h3 className="font-semibold text-sm leading-tight">{product.name}</h3>
          {product.category && (
            <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0" style={{ background: accent + "20", color: accent }}>{product.category}</span>
          )}
        </div>
        {product.subcategory && (
          <p className="text-xs mb-1" style={{ color: accent + "99" }}>{product.subcategory}</p>
        )}
        {product.description && <p className="text-xs mb-3 line-clamp-2 flex-1" style={{ color: scheme.text + "77" }}>{product.description}</p>}
        <div className="flex items-center justify-between mt-auto pt-2 gap-2">
          <span className="text-xl font-extrabold" style={{ color: accent }}>£{product.price.toFixed(2)}</span>
          <div className="flex gap-1.5">
            <button
              onClick={() => onBuy(product)}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90 flex items-center gap-1.5"
              style={{ background: accent, color: scheme.bg }}
              data-testid={`button-buy-${product.id}`}
            >
              <ShoppingCart className="w-3.5 h-3.5" /> Buy
            </button>
            <button
              onClick={() => onGift(product)}
              className="p-2 rounded-lg text-sm transition-all hover:opacity-80"
              style={{ background: accent + "18", color: accent, border: `1px solid ${accent}25` }}
              title="Gift this item"
              data-testid={`button-gift-${product.id}`}
            >
              <Gift className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {product.stock !== -1 && <p className="text-xs mt-1.5" style={{ color: scheme.text + "55" }}>{product.stock} left</p>}
      </div>
    </div>
  );
}

// ─── Main Themed Store ────────────────────────────────────────────────────────
function ThemedStore({ data }: { data: StoreData }) {
  const { toast } = useToast();
  const scheme = COLOR_SCHEMES.find(s => s.id === data.theme.colorScheme) || COLOR_SCHEMES[0];
  const accent = data.theme.accentColor || scheme.accent;

  const categories: string[] = (() => {
    try { return JSON.parse(data.theme.categories || "[]"); } catch { return []; }
  })();
  const subcategories: Record<string, string[]> = (() => {
    try { return JSON.parse(data.theme.subcategories || "{}"); } catch { return {}; }
  })();

  // Sidebar page state: "home" | "leaderboard" | category name | "all"
  const [page, setPage] = useState<SidebarPage>(data.theme.startPage || "all");
  const [activeSubcat, setActiveSubcat] = useState<string | null>(null);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [username, setUsername] = useState("");
  const [checkout, setCheckout] = useState<CheckoutState>({ open: false, product: null, mode: "buy" });
  const [purchased, setPurchased] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Member session (in-memory)
  const [memberSession, setMemberSession] = useState<MemberSession | null>(null);
  const [memberAuthOpen, setMemberAuthOpen] = useState(false);

  // Gift state (within checkout)
  const [giftRecipient, setGiftRecipient] = useState("");
  const [giftMessage, setGiftMessage] = useState("");

  const layout = data.theme.layout || "grid";
  const feeMode = data.theme.feeMode || "absorb";

  // Compute player price
  const playerPrice = (basePrice: number) => {
    if (feeMode === "passthrough") return Math.round((basePrice * 1.2) * 100) / 100;
    return basePrice;
  };

  // Filter products by current page + subcategory
  const filtered = useMemo(() => {
    let prods = data.products.filter(p => p.active);
    if (page === "home" || page === "leaderboard") return [];
    if (page !== "all") prods = prods.filter(p => p.category === page);
    if (activeSubcat) prods = prods.filter(p => p.subcategory === activeSubcat);
    return prods;
  }, [data.products, page, activeSubcat]);

  const purchaseMutation = useMutation({
    mutationFn: ({ productId, minecraftUsername }: { productId: number; minecraftUsername: string }) =>
      apiRequest("POST", "/api/purchase", {
        productId, minecraftUsername, serverId: data.server.id,
      }).then(async r => {
        if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Purchase failed"); }
        return r.json();
      }),
    onSuccess: () => setPurchased(true),
    onError: (err: Error) => toast({ title: "Purchase failed", description: err.message, variant: "destructive" }),
  });

  const giftMutation = useMutation({
    mutationFn: ({ productId, senderUsername, recipientUsername, message }: {
      productId: number; senderUsername: string; recipientUsername: string; message: string;
    }) =>
      apiRequest("POST", "/api/gift", {
        productId, senderUsername, recipientUsername, message, serverId: data.server.id,
      }).then(async r => {
        if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Gift failed"); }
        return r.json();
      }),
    onSuccess: () => setPurchased(true),
    onError: (err: Error) => toast({ title: "Gift failed", description: err.message, variant: "destructive" }),
  });

  const handleBuy = (product: Product) => {
    setCheckout({ open: true, product, mode: "buy" });
    setPurchased(false);
    setGiftRecipient("");
    setGiftMessage("");
    // Pre-fill username from member session if logged in
    if (memberSession) setUsername(memberSession.minecraftUsername);
  };

  const handleGift = (product: Product) => {
    setCheckout({ open: true, product, mode: "gift" });
    setPurchased(false);
    setGiftRecipient("");
    setGiftMessage("");
    if (memberSession) setUsername(memberSession.minecraftUsername);
  };

  const confirmPurchase = () => {
    if (!username.trim() || !checkout.product) return;
    if (checkout.mode === "gift") {
      if (!giftRecipient.trim()) return;
      giftMutation.mutate({
        productId: checkout.product.id,
        senderUsername: username.trim(),
        recipientUsername: giftRecipient.trim(),
        message: giftMessage.trim(),
      });
    } else {
      purchaseMutation.mutate({ productId: checkout.product.id, minecraftUsername: username.trim() });
    }
  };

  const toggleCat = (cat: string) => setExpandedCats(p => ({ ...p, [cat]: !p[cat] }));
  const isPurchasePending = purchaseMutation.isPending || giftMutation.isPending;

  // Background style with optional gradient from preset
  const bgStyle: React.CSSProperties = data.preset?.gradientStart && data.preset?.gradientEnd
    ? { background: `radial-gradient(ellipse at top, ${data.preset.gradientEnd} 0%, ${data.preset.gradientStart} 100%)`, minHeight: "100vh" }
    : { background: scheme.bg, minHeight: "100vh" };

  // ── Sidebar ──────────────────────────────────────────────────────────────
  const sidebarContent = (
    <nav className="flex flex-col h-full">
      {/* Server header */}
      <div className="p-5 border-b" style={{ borderColor: accent + "20" }}>
        <div className="flex items-center gap-3 mb-3">
          {data.server.logoUrl ? (
            <img
              src={data.server.logoUrl}
              alt="logo"
              className="w-10 h-10 rounded-xl object-cover shrink-0"
              style={{ border: `1px solid ${accent}40` }}
            />
          ) : (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: accent + "20", border: `1px solid ${accent}40` }}
            >
              <Package className="w-5 h-5" style={{ color: accent }} />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="font-extrabold text-sm leading-tight truncate">{data.server.name}</h2>
            <p className="text-xs mt-0.5" style={{ color: scheme.text + "66" }}>{data.products.length} item{data.products.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Discord + Server IP quick links */}
        {(data.server.discordUrl || data.server.serverIp) && (
          <div className="space-y-1.5">
            {data.server.serverIp && (
              <div
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-mono select-all cursor-text"
                style={{ background: accent + "10", border: `1px solid ${accent}20`, color: scheme.text + "cc" }}
                title="Copy server IP"
                data-testid="store-server-ip"
              >
                <svg viewBox="0 0 16 16" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: accent }}>
                  <rect x="1" y="3" width="14" height="10" rx="2"/>
                  <path d="M4 8h2M7 8h5"/>
                </svg>
                <span className="truncate">{data.server.serverIp}</span>
              </div>
            )}
            {data.server.discordUrl && (
              <a
                href={data.server.discordUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all hover:opacity-80"
                style={{ background: "#5865F215", border: `1px solid #5865F230`, color: "#7289da" }}
                data-testid="store-discord-link"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                </svg>
                Join Discord
              </a>
            )}
          </div>
        )}
      </div>

      {/* Member account panel */}
      <div className="px-3 py-3 border-b" style={{ borderColor: accent + "15" }}>
        {memberSession ? (
          <div className="rounded-lg p-2.5 space-y-1" style={{ background: accent + "10", border: `1px solid ${accent}25` }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: accent + "25" }}>
                <User className="w-3.5 h-3.5" style={{ color: accent }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate" style={{ color: scheme.text }}>{memberSession.minecraftUsername}</p>
                <p className="text-xs truncate" style={{ color: scheme.text + "66" }}>{memberSession.email}</p>
              </div>
              <button
                onClick={() => setMemberSession(null)}
                className="shrink-0 hover:opacity-60 transition-opacity"
                title="Log out"
                data-testid="button-member-logout"
              >
                <LogOut className="w-3.5 h-3.5" style={{ color: scheme.text + "88" }} />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setMemberAuthOpen(true)}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:opacity-80"
            style={{ background: accent + "15", color: accent, border: `1px solid ${accent}25` }}
            data-testid="button-member-login-sidebar"
          >
            <LogIn className="w-4 h-4 shrink-0" /> Member Login
          </button>
        )}
      </div>

      {/* Nav items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {/* Home */}
        <button
          onClick={() => { setPage("home"); setSidebarOpen(false); }}
          className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2.5 transition-all"
          style={page === "home" ? { background: accent + "18", color: accent, fontWeight: 700 } : { color: scheme.text + "cc" }}
          data-testid="sidebar-home"
        >
          <Home className="w-4 h-4 shrink-0" /> Home
        </button>

        {/* All Items */}
        <button
          onClick={() => { setPage("all"); setActiveSubcat(null); setSidebarOpen(false); }}
          className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2.5 transition-all"
          style={page === "all" ? { background: accent + "18", color: accent, fontWeight: 700 } : { color: scheme.text + "cc" }}
          data-testid="sidebar-all"
        >
          <ShoppingCart className="w-4 h-4 shrink-0" /> All Items
        </button>

        {/* Category separator */}
        {categories.length > 0 && (
          <p className="text-xs font-bold uppercase tracking-widest px-3 pt-4 pb-1" style={{ color: scheme.text + "44" }}>Categories</p>
        )}

        {/* Categories + subcategories */}
        {categories.map(cat => {
          const subs = subcategories[cat] || [];
          const isActive = page === cat;
          const isExpanded = expandedCats[cat];
          return (
            <div key={cat}>
              <button
                onClick={() => { setPage(cat); setActiveSubcat(null); setSidebarOpen(false); if (subs.length) toggleCat(cat); }}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-all"
                style={isActive ? { background: accent + "18", color: accent, fontWeight: 700 } : { color: scheme.text + "cc" }}
                data-testid={`sidebar-cat-${cat}`}
              >
                <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: accent + "88" }} />
                <span className="flex-1 truncate">{cat}</span>
                {subs.length > 0 && (
                  <ChevronDown
                    className="w-3 h-3 shrink-0 transition-transform"
                    style={{ transform: isExpanded ? "rotate(0)" : "rotate(-90deg)", color: scheme.text + "55" }}
                  />
                )}
              </button>
              {/* Subcategories */}
              {subs.length > 0 && isExpanded && (
                <div className="ml-5 mt-0.5 space-y-0.5">
                  {subs.map(sub => (
                    <button
                      key={sub}
                      onClick={() => { setPage(cat); setActiveSubcat(sub); setSidebarOpen(false); }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs transition-all"
                      style={activeSubcat === sub && page === cat
                        ? { background: accent + "12", color: accent }
                        : { color: scheme.text + "88" }
                      }
                      data-testid={`sidebar-subcat-${cat}-${sub}`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Leaderboard */}
        <p className="text-xs font-bold uppercase tracking-widest px-3 pt-4 pb-1" style={{ color: scheme.text + "44" }}>Community</p>
        <button
          onClick={() => { setPage("leaderboard"); setSidebarOpen(false); }}
          className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2.5 transition-all"
          style={page === "leaderboard" ? { background: accent + "18", color: accent, fontWeight: 700 } : { color: scheme.text + "cc" }}
          data-testid="sidebar-leaderboard"
        >
          <Trophy className="w-4 h-4 shrink-0" /> Top Customers
        </button>
      </div>
    </nav>
  );

  // Welcome section
  const welcomeSection = data.theme.welcomeTitle || data.theme.welcomeText ? (
    <div
      className="mx-6 mt-6 rounded-2xl p-5 relative overflow-hidden"
      style={{ background: accent + "12", border: `1px solid ${accent}30` }}
    >
      {/* Decorative glow */}
      <div
        className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-20 pointer-events-none"
        style={{ background: accent }}
      />
      <div className="flex items-start gap-3 relative">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: accent + "25", border: `1px solid ${accent}40` }}
        >
          <Heart className="w-5 h-5" style={{ color: accent }} />
        </div>
        <div className="flex-1 min-w-0">
          {data.theme.welcomeTitle && (
            <h3 className="font-extrabold text-base mb-1 leading-tight" style={{ color: scheme.text }}>
              {data.theme.welcomeTitle}
            </h3>
          )}
          {data.theme.welcomeText && (
            <p className="text-sm leading-relaxed" style={{ color: scheme.text + "aa" }}>
              {data.theme.welcomeText}
            </p>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div style={{ ...bgStyle, color: scheme.text, fontFamily: "'Cabinet Grotesk', sans-serif", position: "relative" }}>
      {/* Animation layer */}
      {data.preset && (
        <AnimationLayer
          style={data.preset.animationStyle}
          accent={data.preset.accentColor || accent}
          glowColor={data.preset.glowColor || null}
        />
      )}

      {/* Announcement strip */}
      {data.theme.announcementText && (
        <div
          style={{ background: accent, color: scheme.bg, position: "relative", zIndex: 10 }}
          className="px-4 py-2 text-center text-sm font-semibold flex items-center justify-center gap-2"
        >
          <Megaphone className="w-3.5 h-3.5 shrink-0" />
          {data.theme.announcementText}
        </div>
      )}

      {/* Banner */}
      {data.theme.bannerUrl && (
        <div className="w-full h-40 overflow-hidden relative" style={{ zIndex: 1 }}>
          <img src={data.theme.bannerUrl} alt="Store banner" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent 30%, ${scheme.bg})` }} />
        </div>
      )}

      {/* Body: sidebar + main */}
      <div className="flex min-h-screen" style={{ position: "relative", zIndex: 2 }}>
        {/* Desktop sidebar */}
        <aside
          className="w-60 shrink-0 sticky top-0 h-screen overflow-y-auto hidden md:flex flex-col"
          style={{ background: scheme.surface + "dd", borderRight: `1px solid ${accent}18`, backdropFilter: "blur(8px)" }}
        >
          {sidebarContent}
        </aside>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div className="flex-1 bg-black/50" onClick={() => setSidebarOpen(false)} />
            <aside
              className="w-64 h-full overflow-y-auto flex flex-col"
              style={{ background: scheme.surface, borderLeft: `1px solid ${accent}20` }}
            >
              <div className="flex items-center justify-between p-4">
                <span className="font-bold text-sm">Menu</span>
                <button onClick={() => setSidebarOpen(false)}><X className="w-4 h-4" /></button>
              </div>
              {sidebarContent}
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {/* Mobile topbar */}
          <div
            className="md:hidden flex items-center gap-3 px-4 py-3 sticky top-0 z-20"
            style={{ background: scheme.surface + "ee", borderBottom: `1px solid ${accent}18`, backdropFilter: "blur(8px)" }}
          >
            <button onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" style={{ color: accent }} />
            </button>
            <span className="font-bold text-sm flex-1 truncate">{data.server.name}</span>
          </div>

          {/* Welcome section — shown on product pages (home page has its own inline welcome) */}
          {page !== "home" && page !== "leaderboard" && welcomeSection}

          {/* Page content */}
          {page === "home" && (
            <StoreHome data={data} accent={accent} scheme={scheme} onCategory={(cat) => { setPage(cat); setActiveSubcat(null); }} />
          )}

          {page === "leaderboard" && (
            <div>
              <div className="p-6 pb-0">
                <h2 className="text-xl font-extrabold flex items-center gap-2"><Trophy className="w-5 h-5" style={{ color: accent }} /> Top Customers</h2>
                <p className="text-sm mt-1" style={{ color: scheme.text + "77" }}>Players who've spent the most on {data.server.name}</p>
              </div>
              <LeaderboardPanel serverId={data.server.id} accent={accent} scheme={scheme} />
            </div>
          )}

          {page !== "home" && page !== "leaderboard" && (
            <div className="p-6">
              {/* Page header + subcategory filter */}
              <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
                <div>
                  <h2 className="text-xl font-extrabold">{page === "all" ? "All Items" : page}</h2>
                  <p className="text-sm mt-0.5" style={{ color: scheme.text + "66" }}>
                    {filtered.length} item{filtered.length !== 1 ? "s" : ""}
                    {activeSubcat ? ` in "${activeSubcat}"` : ""}
                  </p>
                </div>
                {/* Subcategory pills */}
                {page !== "all" && (subcategories[page] || []).length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setActiveSubcat(null)}
                      style={!activeSubcat ? { background: accent, color: scheme.bg } : { background: "transparent", color: scheme.text + "88", border: `1px solid ${accent}30` }}
                      className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                    >All</button>
                    {(subcategories[page] || []).map(sub => (
                      <button
                        key={sub}
                        onClick={() => setActiveSubcat(sub)}
                        style={activeSubcat === sub ? { background: accent, color: scheme.bg } : { background: "transparent", color: scheme.text + "88", border: `1px solid ${accent}30` }}
                        className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                        data-testid={`subcat-pill-${sub}`}
                      >{sub}</button>
                    ))}
                  </div>
                )}
              </div>

              {filtered.length === 0 ? (
                <div className="text-center py-20 rounded-2xl" style={{ border: `2px dashed ${accent}25` }}>
                  <Package className="w-10 h-10 mx-auto mb-4" style={{ color: scheme.text + "44" }} />
                  <h3 className="font-semibold mb-2">No items here</h3>
                  <p className="text-sm" style={{ color: scheme.text + "66" }}>Check back soon.</p>
                </div>
              ) : layout === "list" ? (
                <div className="space-y-3">
                  {filtered.map(product => (
                    <div
                      key={product.id}
                      className="rounded-xl p-4 flex items-center gap-4 transition-all"
                      style={{ background: scheme.surface, border: `1px solid ${accent}20` }}
                      data-testid={`card-store-product-${product.id}`}
                    >
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="w-16 h-16 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-16 h-16 rounded-lg flex items-center justify-center shrink-0" style={{ background: accent + "15" }}>
                          <Package className="w-7 h-7" style={{ color: accent + "80" }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{product.name}</h3>
                          {product.category && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: accent + "20", color: accent }}>{product.category}</span>}
                          {product.subcategory && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: accent + "10", color: accent + "aa" }}>{product.subcategory}</span>}
                        </div>
                        {product.description && <p className="text-xs mt-1 line-clamp-1" style={{ color: scheme.text + "80" }}>{product.description}</p>}
                        {product.stock !== -1 && <p className="text-xs mt-1" style={{ color: scheme.text + "55" }}>{product.stock} left</p>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xl font-extrabold" style={{ color: accent }}>£{playerPrice(product.price).toFixed(2)}</span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleBuy(product)}
                            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 flex items-center gap-1.5"
                            style={{ background: accent, color: scheme.bg }}
                            data-testid={`button-buy-${product.id}`}
                          >
                            <ShoppingCart className="w-3.5 h-3.5" /> Buy
                          </button>
                          <button
                            onClick={() => handleGift(product)}
                            className="p-2 rounded-lg text-sm transition-all hover:opacity-90"
                            style={{ background: accent + "20", color: accent, border: `1px solid ${accent}30` }}
                            title="Gift to a friend"
                            data-testid={`button-gift-${product.id}`}
                          >
                            <Gift className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : layout === "featured" ? (
                <div className="space-y-6">
                  {filtered[0] && (
                    <div
                      className="rounded-2xl overflow-hidden flex flex-col md:flex-row"
                      style={{ background: scheme.surface, border: `1px solid ${accent}25` }}
                      data-testid={`card-store-product-${filtered[0].id}`}
                    >
                      {filtered[0].imageUrl ? (
                        <img src={filtered[0].imageUrl} alt={filtered[0].name} className="w-full md:w-72 h-48 md:h-auto object-cover" />
                      ) : (
                        <div className="w-full md:w-72 h-48 flex items-center justify-center" style={{ background: accent + "10" }}>
                          <Package className="w-16 h-16" style={{ color: accent + "50" }} />
                        </div>
                      )}
                      <div className="p-6 flex flex-col justify-between flex-1">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: accent, color: scheme.bg }}>FEATURED</span>
                            {filtered[0].category && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: accent + "20", color: accent }}>{filtered[0].category}</span>}
                          </div>
                          <h2 className="text-2xl font-extrabold mb-2">{filtered[0].name}</h2>
                          {filtered[0].description && <p className="text-sm" style={{ color: scheme.text + "88" }}>{filtered[0].description}</p>}
                        </div>
                        <div className="flex items-center justify-between mt-6">
                          <span className="text-3xl font-extrabold" style={{ color: accent }}>£{playerPrice(filtered[0].price).toFixed(2)}</span>
                          <button
                            onClick={() => handleBuy(filtered[0])}
                            className="px-6 py-2.5 rounded-xl font-semibold transition-all hover:opacity-90 flex items-center gap-2"
                            style={{ background: accent, color: scheme.bg }}
                            data-testid={`button-buy-${filtered[0].id}`}
                          >
                            <ShoppingCart className="w-4 h-4" /> Buy Now
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {filtered.length > 1 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filtered.slice(1).map(p => <ProductCard key={p.id} product={p} scheme={scheme} accent={accent} onBuy={handleBuy} onGift={handleGift} />)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filtered.map(p => <ProductCard key={p.id} product={p} scheme={scheme} accent={accent} onBuy={handleBuy} onGift={handleGift} />)}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Member Auth Modal */}
      {memberAuthOpen && (
        <MemberAuthModal
          serverId={data.server.id}
          accent={accent}
          scheme={scheme}
          onClose={() => setMemberAuthOpen(false)}
          onLogin={(s) => setMemberSession(s)}
        />
      )}

      {/* Checkout / Gift Dialog */}
      <Dialog open={checkout.open} onOpenChange={(o) => { if (!o) { setCheckout({ open: false, product: null, mode: "buy" }); setPurchased(false); } }}>
        <DialogContent className="max-w-sm" style={{ background: scheme.surface, borderColor: accent + "30", color: scheme.text }}>
          {!purchased ? (
            <>
              <DialogHeader>
                <DialogTitle style={{ color: scheme.text }}>
                  {checkout.mode === "gift" ? (
                    <span className="flex items-center gap-2"><Gift className="w-5 h-5" style={{ color: accent }} /> Gift an Item</span>
                  ) : "Complete Purchase"}
                </DialogTitle>
              </DialogHeader>
              {checkout.product && (
                <div className="space-y-4">
                  {/* Mode switcher */}
                  <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: accent + "30" }}>
                    <button
                      onClick={() => setCheckout(p => ({ ...p, mode: "buy" }))}
                      className="flex-1 py-2 text-sm font-medium transition-all flex items-center justify-center gap-1.5"
                      style={checkout.mode === "buy" ? { background: accent, color: scheme.bg } : { background: "transparent", color: scheme.text + "88" }}
                      data-testid="button-checkout-mode-buy"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" /> For Me
                    </button>
                    <button
                      onClick={() => setCheckout(p => ({ ...p, mode: "gift" }))}
                      className="flex-1 py-2 text-sm font-medium transition-all flex items-center justify-center gap-1.5"
                      style={checkout.mode === "gift" ? { background: accent, color: scheme.bg } : { background: "transparent", color: scheme.text + "88" }}
                      data-testid="button-checkout-mode-gift"
                    >
                      <Gift className="w-3.5 h-3.5" /> Gift
                    </button>
                  </div>

                  {/* Product summary */}
                  <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: scheme.bg }}>
                    <div>
                      <p className="font-semibold" style={{ color: scheme.text }}>{checkout.product.name}</p>
                      {checkout.product.description && <p className="text-xs mt-0.5" style={{ color: scheme.text + "77" }}>{checkout.product.description}</p>}
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <span className="text-lg font-bold" style={{ color: accent }}>£{playerPrice(checkout.product.price).toFixed(2)}</span>
                      {feeMode === "passthrough" && (
                        <p className="text-xs" style={{ color: scheme.text + "55" }}>incl. 20% fee</p>
                      )}
                    </div>
                  </div>

                  {/* Your username */}
                  <div className="space-y-1.5">
                    <Label style={{ color: scheme.text + "cc" }}>
                      {checkout.mode === "gift" ? "Your Minecraft username (sender)" : "Your Minecraft username"}
                    </Label>
                    <Input
                      placeholder="Steve"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      className="bg-transparent"
                      style={{ borderColor: accent + "30", color: scheme.text }}
                      data-testid="input-checkout-username"
                    />
                  </div>

                  {/* Gift recipient + message */}
                  {checkout.mode === "gift" && (
                    <>
                      <div className="space-y-1.5">
                        <Label style={{ color: scheme.text + "cc" }}>Recipient Minecraft username</Label>
                        <Input
                          placeholder="Notch"
                          value={giftRecipient}
                          onChange={e => setGiftRecipient(e.target.value)}
                          className="bg-transparent"
                          style={{ borderColor: accent + "30", color: scheme.text }}
                          data-testid="input-gift-recipient"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label style={{ color: scheme.text + "cc" }}>Gift message (optional)</Label>
                        <Textarea
                          placeholder="Enjoy this gift!"
                          rows={2}
                          value={giftMessage}
                          onChange={e => setGiftMessage(e.target.value)}
                          className="bg-transparent resize-none"
                          style={{ borderColor: accent + "30", color: scheme.text }}
                          data-testid="input-gift-message"
                        />
                      </div>
                    </>
                  )}

                  {!checkout.mode || checkout.mode === "buy" ? (
                    <p className="text-xs" style={{ color: scheme.text + "66" }}>Your balance will be deducted and the item delivered in-game.</p>
                  ) : (
                    <p className="text-xs" style={{ color: scheme.text + "66" }}>The item will be delivered to the recipient in-game and a webhook notification will be sent.</p>
                  )}

                  <Button
                    className="w-full font-semibold"
                    style={{ background: accent, color: scheme.bg }}
                    disabled={!username.trim() || isPurchasePending || (checkout.mode === "gift" && !giftRecipient.trim())}
                    onClick={confirmPurchase}
                    data-testid="button-confirm-purchase"
                  >
                    {isPurchasePending
                      ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Processing…</>
                      : checkout.mode === "gift"
                        ? `Send Gift — £${playerPrice(checkout.product.price).toFixed(2)}`
                        : `Confirm — £${playerPrice(checkout.product.price).toFixed(2)}`}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-4" style={{ color: accent }} />
              <h3 className="font-bold text-lg mb-2">
                {checkout.mode === "gift" ? "Gift Sent!" : "Purchase Complete!"}
              </h3>
              <p className="text-sm mb-1" style={{ color: scheme.text + "aa" }}>
                {checkout.mode === "gift" ? (
                  <><span className="font-semibold" style={{ color: accent }}>{checkout.product?.name}</span> gifted to <span className="font-mono">{giftRecipient}</span>.</>  
                ) : (
                  <><span className="font-semibold" style={{ color: accent }}>{checkout.product?.name}</span> delivered to <span className="font-mono">{username}</span>.</>
                )}
              </p>
              <p className="text-xs mt-1" style={{ color: scheme.text + "66" }}>Check your inventory in-game.</p>
              <Button className="mt-6" style={{ background: accent, color: scheme.bg }}
                onClick={() => { setCheckout({ open: false, product: null, mode: "buy" }); setPurchased(false); }}>
                Back to store
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────
export default function StoreFront() {
  const { serverId } = useParams<{ serverId: string }>();

  const { data, isLoading, error } = useQuery<StoreData>({
    queryKey: ["/api/store", serverId],
    queryFn: () => apiRequest("GET", `/api/store/${serverId}`).then(r => r.json()),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-center p-8">
        <div>
          <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
          <h2 className="font-semibold mb-2">Store not found</h2>
          <p className="text-muted-foreground text-sm">This store doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }

  return <ThemedStore data={data} />;
}
