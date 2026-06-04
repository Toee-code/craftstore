/**
 * StoreFront v5 — Premium dark game-store redesign + DonutSMP template
 * - Full-width hero with server branding + animated gradient
 * - Glowing product cards with hover depth
 * - Sticky glass sidebar
 * - 3-tab checkout: Balance / Pay by Card / Gift
 * - DonutSMP layout: dark tiled grid, featured banner, quantity selectors, "Most Popular" badge
 * - All v3 features preserved: leaderboard, member auth, animations, categories
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
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
  Megaphone, Home, Trophy, ChevronRight, ChevronDown, Menu, X, ShoppingBag,
  User, Gift, LogIn, LogOut, UserPlus, Heart, CreditCard, Zap,
  Star, TrendingUp, Shield, Sparkles, Flame, Plus
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
    discordUrl: string | null; serverIp: string | null; bannerUrl?: string | null;
    ownerUsername: string | null;
  };
  products: Product[];
  theme: {
    layout: string; colorScheme: string; accentColor: string;
    bannerUrl: string | null; startPage: string; announcementText: string | null;
    categories: string; subcategories: string; categoryImages: string; feeMode: string; activePresetId: number | null;
    welcomeTitle: string | null; welcomeText: string | null;
    countdownTitle: string | null; countdownSubtitle: string | null; countdownEnd: string | null;
  };
  preset: StorePreset | null;
}

interface MemberSession {
  id: number; minecraftUsername: string; email: string;
  platform: "java" | "bedrock";
  sessionToken?: string;
}

// Strip bedrock prefix (. or _) to get raw Xbox gamertag for skin API
function bedrockSkinName(username: string): string {
  return username.replace(/^[._]/, "");
}

function skinUrl(username: string, platform: "java" | "bedrock"): string {
  if (platform === "bedrock") {
    // Route through our server proxy which handles XUID lookup via GeyserMC
    return `/api/bedrock/skin/${encodeURIComponent(bedrockSkinName(username))}`;
  }
  return `https://nmsr.nickac.dev/fullbody/${username}`;
}

function faceSkinUrl(username: string, platform: "java" | "bedrock"): string {
  if (platform === "bedrock") {
    return `/api/bedrock/skin/${encodeURIComponent(bedrockSkinName(username))}`;
  }
  return `https://nmsr.nickac.dev/face/${username}`;
}

// Resolve product image — player head (3D render) or custom URL
function productImageUrl(product: Product): string | null {
  if (product.imageType === "playerhead" && product.playerHeadName) {
    return `https://nmsr.nickac.dev/head/${encodeURIComponent(product.playerHeadName)}`;
  }
  return product.imageUrl || null;
}

interface LeaderboardEntry { rank: number; minecraftUsername: string; total: number; }
type LeaderboardPeriod = "monthly" | "yearly" | "alltime";
type SidebarPage = "home" | "leaderboard" | string;
type PaymentMode = "balance" | "card";
interface CheckoutState { open: boolean; product: Product | null; mode: "buy" | "gift"; paymentMode: PaymentMode; }

// ─── MC Skin Avatar ───────────────────────────────────────────────────────────
function SkinAvatar({ username, size = 40 }: { username: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <div
        style={{ width: size, height: size, borderRadius: 8, fontSize: size * 0.45,
          background: "linear-gradient(135deg, #22c55e22, #16a34a22)", border: "1px solid #22c55e30" }}
        className="flex items-center justify-center font-bold text-green-400"
      >
        {username[0]?.toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={`https://nmsr.nickac.dev/face/${username}`}
      alt={username}
      width={size} height={size}
      style={{ imageRendering: "pixelated", borderRadius: 8 }}
      onError={() => setErr(true)}
    />
  );
}

// ─── SkinPreview (modal) ──────────────────────────────────────────────────────
function SkinPreview({ username, platform = "java" }: { username: string; platform?: string }) {
  const [skinUrl, setSkinUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (username.length < 2) { setSkinUrl(null); return; }
    setLoading(true);
    setSkinUrl(null);
    const timer = setTimeout(() => {
      setSkinUrl(skinUrl(username, platform as "java" | "bedrock"));
      setLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [username, platform]);

  return (
    <div className="flex flex-col items-center py-2 gap-2">
      <div className="relative w-24 h-32 rounded-xl overflow-hidden flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
        {loading && <Loader2 className="w-5 h-5 animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />}
        {!loading && skinUrl && (
          <img src={skinUrl} alt={username} className="h-full object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        )}
        {!loading && !skinUrl && (
          <span className="text-2xl" style={{ color: "rgba(255,255,255,0.2)" }}>?</span>
        )}
      </div>
      {username.length >= 2 && (
        <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>{username}</p>
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
      const particles = Array.from({ length: 60 }, () => ({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6,
        r: Math.random() * 3 + 1, alpha: Math.random() * 0.6 + 0.2,
      }));
      const color = glowColor || accent;
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
          if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
          ctx.save(); ctx.globalAlpha = p.alpha * 0.7;
          ctx.shadowBlur = style === "neon_glow" ? 18 : 8; ctx.shadowColor = color;
          ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        });
        animId = requestAnimationFrame(draw);
      };
      draw();
    } else if (style === "pixel_rain") {
      const cols = Math.floor(canvas.width / 18);
      const drops = Array.from({ length: cols }, () => Math.random() * -50);
      const draw = () => {
        ctx.fillStyle = "rgba(0,0,0,0.05)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = "14px monospace";
        drops.forEach((y, i) => {
          const char = String.fromCharCode(0x30A0 + Math.random() * 96);
          ctx.fillStyle = accent + "cc"; ctx.fillText(char, i * 18, y);
          if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
          drops[i] += 18;
        });
        animId = requestAnimationFrame(draw);
      };
      draw();
    } else if (style === "floating_blocks") {
      const blocks = Array.from({ length: 25 }, () => ({
        x: Math.random() * canvas.width, y: canvas.height + Math.random() * 400,
        size: Math.random() * 20 + 8, speed: Math.random() * 0.8 + 0.3,
        alpha: Math.random() * 0.25 + 0.05,
        hue: Math.random() > 0.5 ? accent : (glowColor || "#22c55e"),
      }));
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        blocks.forEach(b => {
          b.y -= b.speed;
          if (b.y < -40) { b.y = canvas.height + 40; b.x = Math.random() * canvas.width; }
          ctx.save(); ctx.globalAlpha = b.alpha; ctx.strokeStyle = b.hue; ctx.lineWidth = 1.5;
          ctx.strokeRect(b.x, b.y, b.size, b.size); ctx.fillStyle = b.hue + "30";
          ctx.fillRect(b.x, b.y, b.size, b.size); ctx.restore();
        });
        animId = requestAnimationFrame(draw);
      };
      draw();
    } else if (style === "nether_fire") {
      const embers = Array.from({ length: 80 }, () => ({
        x: Math.random() * canvas.width, y: canvas.height + Math.random() * 100,
        vx: (Math.random() - 0.5) * 1.5, vy: -(Math.random() * 2 + 0.5),
        r: Math.random() * 2.5 + 0.5, life: Math.random(), decay: Math.random() * 0.004 + 0.002,
      }));
      const fireColors = [accent, glowColor || "#f97316", "#ef4444", "#fbbf24"];
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        embers.forEach(e => {
          e.x += e.vx; e.y += e.vy; e.life -= e.decay;
          if (e.life <= 0 || e.y < -10) { e.x = Math.random() * canvas.width; e.y = canvas.height + 10; e.life = 1; e.vx = (Math.random() - 0.5) * 1.5; }
          ctx.save(); ctx.globalAlpha = e.life * 0.7; ctx.shadowBlur = 8;
          ctx.shadowColor = fireColors[Math.floor(Math.random() * fireColors.length)];
          ctx.fillStyle = fireColors[Math.floor(e.life * fireColors.length)] || accent;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        });
        animId = requestAnimationFrame(draw);
      };
      draw();
    } else if (style === "enchanted") {
      const sparks = Array.from({ length: 50 }, () => ({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        size: Math.random() * 4 + 1, alpha: 0, phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.04 + 0.01,
      }));
      const color = glowColor || accent;
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        sparks.forEach(s => {
          s.phase += s.speed; s.alpha = Math.abs(Math.sin(s.phase)) * 0.8;
          ctx.save(); ctx.globalAlpha = s.alpha; ctx.shadowBlur = 12; ctx.shadowColor = color;
          ctx.fillStyle = color; ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          if (s.alpha < 0.05 && Math.random() > 0.9) { s.x = Math.random() * canvas.width; s.y = Math.random() * canvas.height; }
        });
        animId = requestAnimationFrame(draw);
      };
      draw();
    }

    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, [style, accent, glowColor]);

  if (style === "none") return null;
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0, opacity: 0.4 }} />;
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
function LeaderboardPanel({ serverId, accent }: { serverId: number; accent: string }) {
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
  const rankLabels = ["🥇", "🥈", "🥉"];

  return (
    <div className="max-w-2xl mx-auto w-full px-6 py-8">
      {/* Period tabs */}
      <div className="flex gap-2 mb-8 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
            style={period === p.id
              ? { background: accent, color: "#000", boxShadow: `0 0 20px ${accent}60` }
              : { background: "transparent", color: "rgba(255,255,255,0.5)" }}
            data-testid={`leaderboard-period-${p.id}`}
          >{p.label}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: accent }} /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 rounded-2xl" style={{ border: `2px dashed ${accent}25` }}>
          <Trophy className="w-12 h-12 mx-auto mb-4" style={{ color: accent + "40" }} />
          <p className="font-bold text-lg mb-1" style={{ color: "rgba(255,255,255,0.7)" }}>No purchases yet</p>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>Be the first on the board!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, i) => (
            <div
              key={entry.minecraftUsername}
              className="flex items-center gap-4 rounded-2xl p-4 transition-all hover:scale-[1.01]"
              style={{
                background: i === 0 ? `linear-gradient(135deg, ${accent}18, ${accent}08)` : "rgba(255,255,255,0.04)",
                border: `1px solid ${i === 0 ? accent + "35" : "rgba(255,255,255,0.08)"}`,
                boxShadow: i === 0 ? `0 0 30px ${accent}15` : "none",
              }}
              data-testid={`leaderboard-entry-${i}`}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-extrabold text-lg shrink-0"
                style={{ background: i < 3 ? rankColors[i] + "20" : "rgba(255,255,255,0.06)", color: i < 3 ? rankColors[i] : "rgba(255,255,255,0.4)", border: `1px solid ${i < 3 ? rankColors[i] + "40" : "rgba(255,255,255,0.1)"}` }}>
                {i < 3 ? rankLabels[i] : entry.rank}
              </div>
              <SkinAvatar username={entry.minecraftUsername} size={44} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm" style={{ color: "rgba(255,255,255,0.9)" }}>{entry.minecraftUsername}</p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Rank #{entry.rank}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-extrabold text-xl" style={{ color: accent, textShadow: `0 0 20px ${accent}80` }}>£{entry.total.toFixed(2)}</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>total spent</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Member Auth Modal ────────────────────────────────────────────────────────
function MemberAuthModal({ serverId, accent, onClose, onLogin, bedrockEnabled, bedrockPrefix, bedrockReplaceSpaces }: {
  serverId: number; accent: string;
  onClose: () => void; onLogin: (session: MemberSession) => void;
  bedrockEnabled?: boolean; bedrockPrefix?: string; bedrockReplaceSpaces?: boolean;
}) {
  const [platform, setPlatform] = useState<"java" | "bedrock">("java");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  
  // For Bedrock: apply space replacement then prefix
  const bedrockName = bedrockReplaceSpaces !== false
    ? username.trim().replace(/ /g, "_")
    : username.trim();
  const fullUsername = platform === "bedrock"
    ? `${bedrockPrefix && bedrockPrefix !== "none" ? bedrockPrefix : ""}${bedrockName}`
    : username.trim();

  const handleSubmit = async () => {
    setError("");
    if (!username.trim() || !password.trim()) { setError("Username and password required."); return; }
    if (mode === "register" && !email.trim()) { setError("Email required for registration."); return; }
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/member-auth/login" : "/api/member-auth/register";
      const body = mode === "login"
        ? { serverId, minecraftUsername: fullUsername, password, platform }
        : { serverId, minecraftUsername: fullUsername, email: email.trim(), password, platform };
      const r = await apiRequest("POST", endpoint, body);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      toast({ title: mode === "login" ? "Welcome back!" : "Account created!", description: `Logged in as ${username}` });
      const account = data.member ?? data;
      onLogin({ id: account.id, minecraftUsername: account.minecraftUsername, email: account.email || "", platform, sessionToken: account.sessionToken });
      onClose();
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm" style={{ background: "#0f0f13", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}>
        {/* Header */}
        <div className="text-center pb-2">
          <DialogTitle className="text-2xl font-extrabold text-white">Login</DialogTitle>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
            Enter your {platform === "bedrock" ? "Xbox Gamertag" : "Minecraft Username"} to continue
          </p>
        </div>

        <div className="space-y-4">
          {/* Java / Bedrock switcher — always shown if bedrockEnabled, big buttons like EchoSMP */}
          {bedrockEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setPlatform("java"); setUsername(""); setError(""); }}
                className="flex items-center justify-center gap-2 rounded-xl py-3 font-bold text-sm transition-all"
                style={platform === "java"
                  ? { background: accent, color: "#000" }
                  : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                  <path d="M8.851 18.56s-.917.534.653.714c1.902.218 2.874.187 4.969-.211 0 0 .552.346 1.321.646-4.699 2.013-10.633-.118-6.943-1.149M8.276 15.933s-1.028.761.542.924c2.032.209 3.636.227 6.413-.308 0 0 .384.389.987.602-5.679 1.661-12.007.13-7.942-1.218M13.116 11.475c1.158 1.333-.304 2.533-.304 2.533s2.939-1.518 1.589-3.418c-1.261-1.772-2.228-2.652 3.007-5.688 0 0-8.216 2.051-4.292 6.573M19.33 20.504s.679.559-.747.991c-2.712.822-11.288 1.069-13.669.033-.856-.373.749-.891 1.254-.998.527-.114.828-.093.828-.093-.953-.671-6.156 1.317-2.643 1.887 9.58 1.553 17.462-.7 14.977-1.82M9.292 13.21s-4.362 1.036-1.544 1.412c1.189.159 3.561.123 5.77-.062 1.806-.152 3.618-.477 3.618-.477s-.637.272-1.098.587c-4.429 1.165-12.986.623-10.522-.568 2.082-1.006 3.776-.892 3.776-.892M17.116 17.584c4.503-2.34 2.421-4.589.968-4.285-.355.074-.515.138-.515.138s.132-.207.385-.297c2.875-1.011 5.086 2.981-.928 4.562 0 0 .07-.063.09-.118M14.401 0s2.494 2.494-2.365 6.33c-3.896 3.077-.888 4.832 0 6.836-2.274-2.053-3.943-3.858-2.824-5.539 1.644-2.469 6.197-3.665 5.189-7.627M9.734 23.924c4.322.277 10.959-.153 11.116-2.198 0 0-.302.775-3.572 1.391-3.688.694-8.239.613-10.937.168 0 0 .553.457 3.393.639"/>
                </svg>
                JAVA
              </button>
              <button onClick={() => { setPlatform("bedrock"); setUsername(""); setError(""); }}
                className="flex items-center justify-center gap-2 rounded-xl py-3 font-bold text-sm transition-all"
                style={platform === "bedrock"
                  ? { background: accent, color: "#000" }
                  : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                  <path d="M4.102 21.033C6.211 22.881 8.977 24 12 24c6.623 0 12-5.377 12-12 0-1.585-.31-3.099-.868-4.483L4.102 21.033zm14.521-17.28C16.514 1.99 14.311 1 12 1 5.376 1 0 6.376 0 13c0 1.24.184 2.437.524 3.567l18.099-12.814z"/>
                </svg>
                BEDROCK
              </button>
            </div>
          )}

          {/* Log In / Register tabs */}
          <div className="flex rounded-xl overflow-hidden p-1 gap-1" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {(["login", "register"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                style={mode === m ? { background: accent, color: "#000" } : { color: "rgba(255,255,255,0.5)" }}>
                {m === "login" ? "Log In" : "Register"}
              </button>
            ))}
          </div>

          {/* Username field with inline skin avatar */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>
              {platform === "bedrock" ? "Xbox Gamertag" : "Minecraft Username"}
            </Label>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                {username.trim().length >= 2 ? (
                  <img
                    src={faceSkinUrl(username.trim(), platform)}
                    alt={username}
                    className="w-full h-full object-contain"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 18 }}>?</span>
                )}
              </div>
              <Input
                placeholder={platform === "bedrock" ? "e.g. CoolPlayer" : "e.g. Steve"}
                value={username}
                onChange={e => setUsername(e.target.value)}
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
                data-testid="input-member-username"
              />
            </div>
          </div>

          {mode === "register" && (
            <div className="space-y-1.5">
              <Label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Email</Label>
              <Input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)}
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
                data-testid="input-member-email" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Password</Label>
            <Input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
              data-testid="input-member-password" />
          </div>
          {error && <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "#ef444422", color: "#f87171", border: "1px solid #ef444440" }}>{error}</p>}
          <Button className="w-full font-bold gap-2 py-3 text-base" style={{ background: accent, color: "#000", boxShadow: `0 0 20px ${accent}50` }}
            disabled={loading} onClick={handleSubmit} data-testid="button-member-auth-submit">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><LogIn className="w-5 h-5" /> {mode === "login" ? "Login" : "Create Account"}</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Product Card (grid) ──────────────────────────────────────────────────────
function ProductCard({ product, accent, playerPrice, onBuy, onGift }: {
  product: Product; accent: string; playerPrice: number;
  onBuy: (p: Product) => void; onGift: (p: Product) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="rounded-2xl overflow-hidden flex flex-col transition-all duration-300 cursor-pointer group"
      style={{
        background: hovered
          ? `linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)`
          : "rgba(255,255,255,0.04)",
        border: `1px solid ${hovered ? accent + "50" : "rgba(255,255,255,0.08)"}`,
        boxShadow: hovered ? `0 8px 40px ${accent}25, 0 0 0 1px ${accent}20` : "none",
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
      }}
      data-testid={`card-store-product-${product.id}`}
    >
      {/* Image */}
      <div className="relative overflow-hidden enchant-wrap" style={{ height: 160 }}>
        {(() => { const imgUrl = productImageUrl(product); return imgUrl ? (
          <>
            <img src={imgUrl} alt={product.name}
              className={`w-full h-full transition-transform duration-500 group-hover:scale-105 ${
                product.imageType === "playerhead" ? "object-contain p-2" : "object-cover"
              }`}
              style={product.imageType === "playerhead" ? { imageRendering: "pixelated", background: `linear-gradient(135deg, ${accent}18, ${accent}08)` } : {}}
            />
            {!!product.enchanted && <img src={imgUrl} aria-hidden className="enchant-glint" style={{ objectFit: product.imageType === "playerhead" ? "contain" : "cover" }} />}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${accent}15, ${accent}05)` }}>
            <Package className="w-12 h-12" style={{ color: accent + "50" }} />
          </div>
        ); })()}
        {/* Category badge */}
        {product.category && (
          <div className="absolute top-3 left-3">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: "rgba(0,0,0,0.7)", color: accent, border: `1px solid ${accent}40`, backdropFilter: "blur(8px)" }}>
              {product.category}
            </span>
          </div>
        )}
        {/* Glow overlay on hover */}
        <div className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{ background: `linear-gradient(to bottom, transparent 40%, ${accent}15)`, opacity: hovered ? 1 : 0 }} />
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-bold text-sm leading-tight mb-1" style={{ color: "rgba(255,255,255,0.92)" }}>{product.name}</h3>
        {product.subcategory && <p className="text-xs mb-1" style={{ color: accent + "99" }}>{product.subcategory}</p>}
        {product.description && (
          <p className="text-xs mb-3 line-clamp-2 flex-1" style={{ color: "rgba(255,255,255,0.45)" }}>{product.description}</p>
        )}
        {product.stock > 0 && product.stock !== -1 && (
          <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>
            <span style={{ color: product.stock < 5 ? "#f87171" : accent }}>●</span> {product.stock} left
          </p>
        )}
        <div className="flex items-center justify-between mt-auto pt-3 gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="text-xl font-extrabold" style={{ color: accent, textShadow: `0 0 20px ${accent}80` }}>
            £{playerPrice.toFixed(2)}
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => onBuy(product)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              style={{ background: accent, color: "#000", boxShadow: hovered ? `0 0 20px ${accent}60` : "none" }}
              data-testid={`button-buy-${product.id}`}
            >
              <ShoppingCart className="w-3 h-3" /> Buy
            </button>
            <button
              onClick={() => onGift(product)}
              className="p-1.5 rounded-xl transition-all"
              style={{ background: "rgba(255,255,255,0.08)", color: accent, border: `1px solid ${accent}20` }}
              title="Gift this item"
              data-testid={`button-gift-${product.id}`}
            >
              <Gift className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DonutSMP Layout ──────────────────────────────────────────────────────────
/**
 * DonutSMP-inspired layout:
 * - Near-black background (#111214), dark card tiles (#1C1F26)
 * - Optional featured banner card spanning full width (first product if it has an image or description)
 * - 3-column product grid, cards centered: floating icon/image, bold name, price, quantity selector, full-width CTA
 * - "Most Popular" orange badge on first non-featured product
 * - Accent colour driven by server's theme setting (defaults to royal blue #2563eb)
 */
function DonutProductCard({
  product, accent, playerPrice, onBuy, onGift, isMostPopular
}: {
  product: Product; accent: string; playerPrice: number;
  onBuy: (p: Product) => void; onGift: (p: Product) => void;
  isMostPopular?: boolean;
}) {
  const [qty, setQty] = useState<1 | 5 | 10 | 20>(1);
  const [hovered, setHovered] = useState(false);
  const QTYS: (1 | 5 | 10 | 20)[] = [1, 5, 10, 20];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="rounded-2xl flex flex-col relative transition-all duration-300"
      style={{
        background: hovered ? "#222530" : "#1C1F26",
        border: `1px solid ${hovered ? accent + "50" : "rgba(255,255,255,0.08)"}`,
        boxShadow: hovered ? `0 6px 32px ${accent}20` : "none",
        transform: hovered ? "translateY(-3px)" : "none",
      }}
      data-testid={`card-donut-product-${product.id}`}
    >
      {/* Most Popular badge */}
      {isMostPopular && (
        <div className="absolute -top-2.5 right-4 z-10">
          <span className="text-xs font-extrabold px-3 py-1 rounded-full"
            style={{ background: "#f97316", color: "#fff", letterSpacing: "0.04em" }}>
            ★ Most Popular
          </span>
        </div>
      )}

      {/* Product image / icon area — floats slightly above card */}
      <div className="flex justify-center pt-6 pb-2 relative">
        {(() => { const imgUrl = productImageUrl(product); return imgUrl ? (
          <div className="enchant-wrap" style={{ borderRadius: 8 }}>
            <img
              src={imgUrl}
              alt={product.name}
              className="w-20 h-20 object-contain"
              style={{ filter: `drop-shadow(0 4px 16px ${accent}60)`, imageRendering: "pixelated" }}
            />
            {!!product.enchanted && <img src={imgUrl} aria-hidden className="enchant-glint" style={{ objectFit: "contain", width: 80, height: 80 }} />}
          </div>
        ) : (
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${accent}20, ${accent}08)`, border: `1px solid ${accent}30` }}>
            <Package className="w-9 h-9" style={{ color: accent + "70" }} />
          </div>
        ); })()}
      </div>

      {/* Content */}
      <div className="px-4 pb-4 flex flex-col flex-1">
        {/* Category badge */}
        {product.category && (
          <div className="flex justify-center mb-1">
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: accent + "18", color: accent + "cc", border: `1px solid ${accent}25`, fontSize: 10 }}>
              {product.category}
            </span>
          </div>
        )}

        <h3 className="font-extrabold text-base text-center mb-0.5" style={{ color: "#fff" }}>
          {product.name}
        </h3>
        {product.description && (
          <p className="text-xs text-center mb-2 line-clamp-2" style={{ color: "rgba(255,255,255,0.45)" }}>
            {product.description}
          </p>
        )}

        {/* Price */}
        <p className="text-center font-extrabold text-lg mb-3" style={{ color: "#fff" }}>
          £{playerPrice.toFixed(2)}
        </p>

        {/* Quantity selector */}
        <div className="flex gap-1 mb-3 justify-center">
          {QTYS.map(q => (
            <button
              key={q}
              onClick={() => setQty(q)}
              className="flex-1 py-1 rounded-lg text-xs font-bold transition-all"
              style={qty === q
                ? { background: accent, color: "#fff", boxShadow: `0 0 12px ${accent}60` }
                : { background: "#2a2d37", color: "rgba(255,255,255,0.55)" }}
              data-testid={`button-qty-${product.id}-${q}`}
            >
              {q}×
            </button>
          ))}
        </div>

        {/* Buy + Gift row */}
        <div className="flex gap-1.5">
          <button
            onClick={() => onBuy(product)}
            className="flex-1 py-2.5 rounded-xl font-extrabold text-sm transition-all flex items-center justify-center gap-1.5"
            style={{
              background: accent,
              color: "#fff",
              boxShadow: hovered ? `0 0 20px ${accent}70` : `0 0 10px ${accent}30`,
            }}
            data-testid={`button-donut-buy-${product.id}`}
          >
            <ShoppingCart className="w-4 h-4" /> Add to Cart
          </button>
          <button
            onClick={() => onGift(product)}
            className="px-2.5 rounded-xl transition-all hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.08)", color: accent, border: `1px solid ${accent}25` }}
            title="Gift this item"
            data-testid={`button-donut-gift-${product.id}`}
          >
            <Gift className="w-4 h-4" />
          </button>
        </div>

        {/* Stock */}
        {product.stock != null && product.stock > 0 && product.stock !== -1 && (
          <p className="text-center text-xs mt-2" style={{ color: (product.stock ?? 99) < 5 ? "#f87171" : "rgba(255,255,255,0.3)" }}>
            <span style={{ color: (product.stock ?? 99) < 5 ? "#f87171" : accent }}>●</span> {product.stock} left
          </p>
        )}
      </div>
    </div>
  );
}

function DonutLayout({
  data, accent, onBuy, onGift, calcPlayerPrice, page
}: {
  data: StoreData; accent: string;
  onBuy: (p: Product) => void; onGift: (p: Product) => void;
  calcPlayerPrice: (p: number) => number;
  page: string;
}) {
  const categories: string[] = (() => { try { return JSON.parse(data.theme.categories || "[]"); } catch { return []; } })();

  const filtered = useMemo(() => {
    let prods = data.products.filter(p => p.active);
    if (page !== "all") prods = prods.filter(p => p.category === page);
    return prods;
  }, [data.products, page]);

  // First product with an image or description becomes the featured banner
  const featuredProduct = filtered.find(p => p.imageUrl || p.description);
  const gridProducts = filtered.filter(p => p.id !== featuredProduct?.id);

  return (
    <div style={{ background: "#111214", minHeight: "100%" }}>
      {/* Featured banner — mimics Donut+ Rank card */}
      {featuredProduct && page !== "home" && (
        <div className="mx-4 mt-4 rounded-2xl overflow-hidden relative"
          style={{
            background: `linear-gradient(120deg, ${accent}dd 0%, ${accent}99 100%)`,
            minHeight: 160,
            boxShadow: `0 4px 40px ${accent}40`,
          }}
          data-testid={`card-donut-featured-${featuredProduct.id}`}
        >
          <div className="flex flex-col md:flex-row items-center p-6 gap-6 relative z-10">
            <div className="flex-1">
              <div className="inline-flex items-center gap-1.5 mb-2 px-3 py-1 rounded-full"
                style={{ background: "rgba(255,255,255,0.2)", backdropFilter: "blur(8px)" }}>
                <Flame className="w-3.5 h-3.5 text-white" />
                <span className="text-xs font-extrabold text-white uppercase tracking-wider">Featured</span>
              </div>
              <h2 className="text-2xl font-extrabold text-white mb-1">{featuredProduct.name}</h2>
              {featuredProduct.description && (
                <ul className="space-y-0.5">
                  {featuredProduct.description.split("\n").slice(0, 5).map((line, i) => (
                    <li key={i} className="text-sm text-white/80 flex items-center gap-1.5">
                      <span style={{ color: "rgba(255,255,255,0.7)" }}>+</span> {line}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-3 mt-4">
                <span className="text-3xl font-extrabold text-white">
                  £{calcPlayerPrice(featuredProduct.price).toFixed(2)}
                </span>
                <button
                  onClick={() => onBuy(featuredProduct)}
                  className="px-6 py-2.5 rounded-xl font-extrabold text-sm transition-all hover:opacity-90"
                  style={{ background: "rgba(255,255,255,0.25)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)", backdropFilter: "blur(8px)" }}
                  data-testid={`button-donut-featured-buy-${featuredProduct.id}`}
                >
                  <ShoppingCart className="w-4 h-4 inline mr-2" />
                  Get Now
                </button>
              </div>
            </div>
            {featuredProduct.imageUrl && (
              <img
                src={featuredProduct.imageUrl}
                alt={featuredProduct.name}
                className="w-32 h-32 object-contain shrink-0 hidden md:block"
                style={{ filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.5))" }}
              />
            )}
          </div>
          {/* Subtle grid pattern overlay */}
          <div className="absolute inset-0 opacity-10 pointer-events-none"
            style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "24px 24px" }} />
        </div>
      )}

      {/* Product grid */}
      {gridProducts.length === 0 && !featuredProduct ? (
        <div className="text-center py-20">
          <Package className="w-12 h-12 mx-auto mb-4" style={{ color: "rgba(255,255,255,0.2)" }} />
          <p className="font-bold text-lg" style={{ color: "rgba(255,255,255,0.4)" }}>No items here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 mt-2">
          {gridProducts.map((product, i) => (
            <DonutProductCard
              key={product.id}
              product={product}
              accent={accent}
              playerPrice={calcPlayerPrice(product.price)}
              onBuy={onBuy}
              onGift={onGift}
              isMostPopular={i === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EchoSMP Layout ─────────────────────────────────────────────────────────
/**
 * EchoSMP-inspired layout:
 * - Pure black background (#0a0a0a), dark cards (#1a1d23)
 * - Full-width hero banner: Minecraft-scene image with server IP left + Discord right,
 *   sub-bar below with logo/name left + cyan Login CTA right
 * - "Featured Packages" grid: product cards with image top, name, price, cyan "Add to Basket"
 * - "Categories" section: full-width split cards — dark left with name + "View →", cyan right with item image
 * - Welcome card at bottom: dark card with server description
 * - Accent: driven by server accent colour (default sky cyan #38bdf8)
 */
// EchoSMP product card — desktop style: small card, floating image on transparent bg,
// bold name, muted price, cyan "Add to Basket", flat grey gift row below
function EchoProductCard({
  product, accent, playerPrice, onBuy, onGift
}: {
  product: Product; accent: string; playerPrice: number;
  onBuy: (p: Product) => void; onGift: (p: Product) => void;
}) {
  return (
    <div className="rounded-2xl flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-1"
      style={{ background: "#16191f", border: "1px solid rgba(255,255,255,0.07)" }}
      data-testid={`card-echo-product-${product.id}`}>

      {/* Product image */}
      {(() => { const imgUrl = productImageUrl(product); return imgUrl ? (
        <div className="enchant-wrap relative overflow-hidden" style={{ height: 110, borderRadius: 10, margin: "10px 10px 0 10px" }}>
          <img src={imgUrl} alt={product.name}
            className="w-full h-full"
            style={{
              objectFit: product.imageType === "playerhead" || product.imageType === "minecraft_item" ? "contain" : "cover",
              imageRendering: "pixelated",
              padding: product.imageType === "playerhead" || product.imageType === "minecraft_item" ? 12 : 0,
              filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))",
            }} />
          {!!product.enchanted && <img src={imgUrl} aria-hidden className="enchant-glint" style={{ objectFit: "cover", width: "100%", height: "100%" }} />}
        </div>
      ) : (
        <div className="w-full flex items-center justify-center" style={{ height: 120, borderRadius: "16px 16px 0 0", background: `${accent}15` }}>
          <Package className="w-10 h-10" style={{ color: `${accent}70` }} />
        </div>
      ); })()}

      {/* Text + CTA */}
      <div className="px-4 pb-1 pt-2">
        <h3 className="font-bold text-white text-sm leading-snug">{product.name}</h3>
        <p className="text-sm font-semibold mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
          £{playerPrice.toFixed(2)}
        </p>
      </div>

      <div className="px-3 pb-3 pt-2 flex flex-col gap-2">
        <button
          onClick={() => onBuy(product)}
          className="w-full py-2 rounded-lg font-bold text-sm text-white transition-all hover:brightness-110"
          style={{ background: accent }}
          data-testid={`button-echo-buy-${product.id}`}>
          Add to Basket
        </button>
        {/* Gift row — flat grey, same height as EchoSMP */}
        <button
          onClick={() => onGift(product)}
          className="w-full py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all hover:brightness-110"
          style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.45)" }}
          data-testid={`button-echo-gift-${product.id}`}>
          <Gift className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// EchoSMP category card — 2-col grid, dark left half, accent-colour right half,
// item image overflows upward out of the card
function EchoCategoryCard({
  name, imageUrl, accent, onClick
}: {
  name: string; imageUrl?: string | null; accent: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl overflow-visible flex items-stretch text-left transition-all duration-200 hover:brightness-105 relative"
      style={{ background: "#16191f", border: "1px solid rgba(255,255,255,0.07)", minHeight: 150 }}
      data-testid={`button-echo-cat-${name}`}>

      {/* Dark left: name + link */}
      <div className="flex flex-col justify-center px-5 py-5" style={{ flex: "1 1 55%" }}>
        <h3 className="font-extrabold text-white text-lg capitalize">{name}</h3>
        <p className="text-xs mt-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>View packages →</p>
      </div>

      {/* Accent right block — clipped at the card boundary */}
      <div className="relative rounded-r-2xl overflow-hidden flex items-center justify-center"
        style={{ flex: "0 0 45%", background: accent }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="object-contain"
            style={{
              imageRendering: "pixelated",
              width: 110, height: 110,
              filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.4))"
            }}
          />
        ) : (
          <Package className="w-12 h-12" style={{ color: "rgba(255,255,255,0.5)" }} />
        )}
      </div>
    </button>
  );
}

// ─── Countdown Banner ────────────────────────────────────────────────────────
function CountdownBanner({ title, subtitle, endDate, ownerUsername, accent }: {
  title: string; subtitle: string; endDate: string;
  ownerUsername: string | null; accent: string;
}) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, mins: 0, secs: 0, expired: false });

  useEffect(() => {
    const calc = () => {
      const diff = new Date(endDate).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft({ days: 0, hours: 0, mins: 0, secs: 0, expired: true }); return; }
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        mins: Math.floor((diff % 3600000) / 60000),
        secs: Math.floor((diff % 60000) / 1000),
        expired: false,
      });
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [endDate]);

  if (timeLeft.expired) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  const skinUrl = ownerUsername ? `https://nmsr.nickac.dev/fullbody/${ownerUsername}` : null;

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${accent}dd 0%, ${accent}99 60%, ${accent}bb 100%)`,
        height: "clamp(110px, 28vw, 160px)",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        paddingRight: 16,
      }}
    >
      {/* Dark overlay */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.22)", pointerEvents: "none" }} />

      {/* Owner skin + bow — anchored from top so head always shows */}
      {skinUrl && (
        <div style={{
          position: "relative",
          width: "clamp(80px, 18vw, 140px)",
          height: "clamp(110px, 28vw, 160px)",
          flexShrink: 0,
          zIndex: 10,
        }}>
          {/* Full body skin, top-anchored */}
          <img
            src={skinUrl}
            alt={ownerUsername!}
            width={100}
            height={200}
            style={{
              position: "absolute",
              top: -10,
              left: 16,
              width: 100,
              height: 200,
              imageRendering: "pixelated",
              filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.9))",
              display: "block",
            }}
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          {/* Bow — served locally, positioned at right arm */}
          <img
            src="/bow.png"
            alt="bow"
            width={64}
            height={64}
            style={{
              position: "absolute",
              top: 72,
              right: 6,
              width: 64,
              height: 64,
              imageRendering: "pixelated",
              transform: "rotate(-15deg) scaleX(-1)",
              filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.9))",
              display: "block",
              zIndex: 20,
            }}
          />
        </div>
      )}

      {/* Text block */}
      <div style={{ flex: 1, position: "relative", zIndex: 10 }}>
        <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>LIMITED TIME</p>
        <p style={{ fontWeight: 800, fontSize: "clamp(13px, 3.5vw, 20px)", lineHeight: 1.2, color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,0.5)", margin: 0 }}>{title}</p>
        {subtitle && <p style={{ fontSize: "clamp(9px, 2.5vw, 12px)", color: "rgba(255,255,255,0.8)", marginTop: 4, margin: 0 }}>{subtitle}</p>}
      </div>

      {/* Countdown digits */}
      <div className="flex items-center gap-1.5 sm:gap-2" style={{ position: "relative", zIndex: 10, flexShrink: 0 }}>
        {[
          { val: timeLeft.days, label: "Days" },
          { val: timeLeft.hours, label: "Hrs" },
          { val: timeLeft.mins, label: "Min" },
          { val: timeLeft.secs, label: "Sec" },
        ].map(({ val, label }, i) => (
          <div key={label} className="flex items-center gap-1.5 sm:gap-2">
            <div className="flex flex-col items-center">
              <div className="flex items-center justify-center font-extrabold text-white"
                style={{
                  width: "clamp(34px, 8vw, 52px)",
                  height: "clamp(30px, 7vw, 48px)",
                  fontSize: "clamp(14px, 4vw, 24px)",
                  background: "rgba(0,0,0,0.5)",
                  borderRadius: 8,
                  letterSpacing: -1,
                  backdropFilter: "blur(4px)",
                }}>
                {pad(val)}
              </div>
              <span className="font-bold uppercase text-white/70" style={{ fontSize: "clamp(7px, 1.8vw, 9px)", letterSpacing: "0.08em", marginTop: 3 }}>{label}</span>
            </div>
            {i < 3 && <span className="font-extrabold text-white/60" style={{ fontSize: "clamp(12px, 3vw, 18px)", marginBottom: 14 }}>:</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Donate Modal ───────────────────────────────────────────────────────────────
const DONATE_PRESETS = [1, 2, 5, 10, 20, 50];

function DonateModal({ open, onClose, serverId, serverName, accent, memberSession }: {
  open: boolean; onClose: () => void;
  serverId: number; serverName: string; accent: string;
  memberSession: MemberSession | null;
}) {
  const [amount, setAmount] = useState<number | "">("");
  const [custom, setCustom] = useState("");
  const [playerName, setPlayerName] = useState(memberSession?.minecraftUsername || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  // Keep playerName in sync if member logs in after modal opens
  useEffect(() => {
    if (memberSession?.minecraftUsername) setPlayerName(memberSession.minecraftUsername);
  }, [memberSession]);

  const finalAmount = custom ? parseFloat(custom) : (amount as number);

  const handleDonate = async () => {
    setError("");
    if (!playerName.trim()) { setError("Enter your Minecraft username"); return; }
    if (!finalAmount || finalAmount < 1) { setError("Minimum donation is £1.00"); return; }
    setLoading(true);
    try {
      const r = await apiRequest("POST", `/api/store/${serverId}/donate`, { amount: finalAmount, playerName: playerName.trim() });
      const d = await r.json();
      if (d.url) {
        window.location.href = d.url;
      } else if (d.demoMode) {
        toast({ title: "Demo mode", description: "Stripe not configured — donation skipped." });
        onClose();
      } else {
        setError(d.error || "Something went wrong");
      }
    } catch { setError("Network error"); }
    setLoading(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: "#13161c", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5" style={{ color: accent }} />
            <span className="font-extrabold text-lg">Donate to {serverName}</span>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors text-xl leading-none">×</button>
        </div>

        {/* Username */}
        <div className="mb-4">
          <label className="text-xs font-semibold mb-1.5 block" style={{ color: "rgba(255,255,255,0.5)" }}>Your Minecraft Username</label>
          <input
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder="e.g. ToeeOnTT"
            className="w-full rounded-xl px-4 py-2.5 text-sm font-medium outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
          />
        </div>

        {/* Preset amounts */}
        <p className="text-xs font-semibold mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>Choose an amount</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {DONATE_PRESETS.map(p => (
            <button
              key={p}
              onClick={() => { setAmount(p); setCustom(""); }}
              className="rounded-xl py-2.5 font-extrabold text-sm transition-all"
              style={{
                background: amount === p && !custom ? accent : "rgba(255,255,255,0.06)",
                color: amount === p && !custom ? "#000" : "rgba(255,255,255,0.8)",
                border: amount === p && !custom ? `1px solid ${accent}` : "1px solid rgba(255,255,255,0.08)",
                boxShadow: amount === p && !custom ? `0 0 16px ${accent}50` : "none",
              }}
            >
              £{p}
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <div className="mb-5">
          <input
            value={custom}
            onChange={e => { setCustom(e.target.value); setAmount(""); }}
            placeholder="Custom amount (e.g. 7.50)"
            type="number"
            min="1"
            step="0.01"
            className="w-full rounded-xl px-4 py-2.5 text-sm font-medium outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${custom ? accent : "rgba(255,255,255,0.1)"}`, color: "#fff" }}
          />
        </div>

        {/* Summary */}
        {finalAmount >= 1 && (
          <div className="rounded-xl px-4 py-3 mb-4 text-sm" style={{ background: `${accent}12`, border: `1px solid ${accent}25` }}>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>Donating </span>
            <span className="font-extrabold" style={{ color: accent }}>£{finalAmount.toFixed(2)}</span>
            <span style={{ color: "rgba(255,255,255,0.6)" }}> to {serverName}</span>
          </div>
        )}

        {error && <p className="text-xs mb-3 text-red-400">{error}</p>}

        <button
          onClick={handleDonate}
          disabled={loading}
          className="w-full rounded-xl py-3 font-extrabold text-sm transition-all flex items-center justify-center gap-2"
          style={{ background: accent, color: "#000", opacity: loading ? 0.7 : 1, boxShadow: `0 0 24px ${accent}60` }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" />}
          {loading ? "Processing..." : `Donate${finalAmount >= 1 ? ` £${finalAmount.toFixed(2)}` : ""}`}
        </button>
      </div>
    </div>
  );
}

// ─── Recent Purchases Sticky Sidebar ───────────────────────────────────────
interface OrderEntry { id: number; minecraftUsername: string; productName?: string; amount: number; createdAt: string; status: string; }

function RecentPurchasesSidebar({ serverId, accent }: { serverId: number; accent: string }) {
  const { data: orders = [], isLoading } = useQuery<OrderEntry[]>({
    queryKey: ["/api/servers", serverId, "orders"],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/orders`).then(r => r.json()),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const recent = orders
    .filter((o: OrderEntry) => o.status === "completed")
    .sort((a: OrderEntry, b: OrderEntry) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  // Mobile swipe state
  const [hidden, setHidden] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (dx < -40 && dy < 60) setHidden(true);   // swipe left to hide
    if (dx > 40 && dy < 60) setHidden(false);    // swipe right to show
  };

  return (
    <>
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          position: "fixed",
          top: "50%",
          left: hidden ? -240 : 24,
          transform: "translateY(-50%)",
          transition: "left 0.35s cubic-bezier(0.4,0,0.2,1)",
          width: 220,
          zIndex: 40,
          background: "rgba(13,15,20,0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 20,
          padding: "20px 16px",
          boxShadow: "0 16px 60px rgba(0,0,0,0.8)",
          pointerEvents: "auto",
          touchAction: "pan-x",
        }}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <ShoppingBag className="w-4 h-4 shrink-0" style={{ color: accent }} />
          <span className="text-xs font-extrabold uppercase tracking-widest" style={{ color: accent }}>Recent Payments</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: accent }} />
          </div>
        ) : recent.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: "rgba(255,255,255,0.3)" }}>No purchases yet</p>
        ) : (
          <div className="flex flex-col gap-3">
            {recent.map((order: OrderEntry) => (
              <div key={order.id} className="flex items-center gap-3">
                <div style={{ width: 40, height: 40, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.05)" }}>
                  <img
                    src={`https://nmsr.nickac.dev/face/${order.minecraftUsername}`}
                    alt={order.minecraftUsername}
                    width={40} height={40}
                    style={{ width: 40, height: 40, imageRendering: "pixelated", display: "block" }}
                    onError={e => { (e.target as HTMLImageElement).src = `https://nmsr.nickac.dev/face/Steve`; }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">{order.minecraftUsername}</p>
                  {order.productName && (
                    <p className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.45)" }}>{order.productName}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mobile pull-tab — only visible when hidden, on small screens */}
      {hidden && (
        <button
          className="sm:hidden"
          onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={e => { if (e.changedTouches[0].clientX - touchStartX.current > 20) setHidden(false); }}
          onClick={() => setHidden(false)}
          style={{
            position: "fixed",
            top: "50%",
            left: 0,
            transform: "translateY(-50%)",
            zIndex: 41,
            background: "rgba(13,15,20,0.92)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderLeft: "none",
            borderRadius: "0 10px 10px 0",
            padding: "10px 6px",
            pointerEvents: "auto",
            cursor: "pointer",
          }}>
          <ShoppingBag style={{ width: 14, height: 14, color: accent }} />
        </button>
      )}
    </>
  );
}

// ─── Top Customers Sticky Sidebar ───────────────────────────────────────────
function TopCustomersSidebar({ serverId, accent }: { serverId: number; accent: string }) {
  const { data: entries = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/servers", serverId, "leaderboard", "alltime"],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/leaderboard?period=alltime`).then(r => r.json()),
    staleTime: 60_000,
  });

  const top3 = entries.slice(0, 3);
  const medals = ["🥇", "🥈", "🥉"];

  // Mobile swipe state
  const [hidden, setHidden] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (dx > 40 && dy < 60) setHidden(true);    // swipe right to hide
    if (dx < -40 && dy < 60) setHidden(false);  // swipe left to show
  };

  return (
    <>
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          position: "fixed",
          top: "50%",
          right: hidden ? -320 : 24,
          transform: "translateY(-50%)",
          transition: "right 0.35s cubic-bezier(0.4,0,0.2,1)",
          width: 300,
          zIndex: 40,
          background: "rgba(13,15,20,0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 24,
          padding: "24px 20px",
          boxShadow: "0 16px 60px rgba(0,0,0,0.8)",
          pointerEvents: "auto",
          touchAction: "pan-x",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-5">
          <Trophy className="w-5 h-5 shrink-0" style={{ color: accent }} />
          <span className="text-sm font-extrabold uppercase tracking-widest" style={{ color: accent }}>Top Customers</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: accent }} />
          </div>
        ) : top3.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: "rgba(255,255,255,0.3)" }}>No purchases yet</p>
        ) : (
          <div className="flex flex-col gap-5">
            {top3.map((entry, i) => (
              <div key={entry.minecraftUsername} className="flex flex-col items-center gap-2">
                <div style={{ fontSize: 28, lineHeight: 1 }}>{medals[i]}</div>
                <div className="relative" style={{ width: 90 }}>
                  <img
                    src={`https://nmsr.nickac.dev/fullbody/${entry.minecraftUsername}`}
                    alt={entry.minecraftUsername}
                    style={{ width: 90, height: "auto", display: "block", imageRendering: "pixelated", filter: i === 0 ? `drop-shadow(0 0 12px ${accent}99)` : "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" }}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  {i === 0 && (
                    <div style={{ position: "absolute", inset: 0, borderRadius: 12, boxShadow: `0 0 32px ${accent}60`, pointerEvents: "none" }} />
                  )}
                </div>
                <p className="text-base font-bold text-center truncate w-full" style={{ color: i === 0 ? "#fff" : "rgba(255,255,255,0.75)" }}>{entry.minecraftUsername}</p>
                <p className="text-base font-extrabold" style={{ color: accent, textShadow: i === 0 ? `0 0 16px ${accent}80` : "none" }}>£{entry.total.toFixed(2)}</p>
                {i < 2 && top3[i + 1] && (
                  <div style={{ width: "75%", height: 1, background: "rgba(255,255,255,0.08)", marginTop: 4 }} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mobile pull-tab — only visible when hidden, on small screens */}
      {hidden && (
        <button
          className="sm:hidden"
          onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={e => { if (e.changedTouches[0].clientX - touchStartX.current < -20) setHidden(false); }}
          onClick={() => setHidden(false)}
          style={{
            position: "fixed",
            top: "50%",
            right: 0,
            transform: "translateY(-50%)",
            zIndex: 41,
            background: "rgba(13,15,20,0.92)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRight: "none",
            borderRadius: "10px 0 0 10px",
            padding: "10px 6px",
            pointerEvents: "auto",
            cursor: "pointer",
          }}>
          <Trophy style={{ width: 14, height: 14, color: accent }} />
        </button>
      )}
    </>
  );
}

function MostPopularSection({ serverId, accent, onBuy, onGift, calcPlayerPrice, products }: {
  serverId: number; accent: string;
  onBuy: (p: Product) => void; onGift: (p: Product) => void;
  calcPlayerPrice: (p: number) => number;
  products: Product[];
}) {
  const { data: popular } = useQuery<any[]>({
    queryKey: ["/api/servers", serverId, "most-purchased"],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/most-purchased?limit=5`).then(r => r.json()),
    staleTime: 60_000,
  });

  if (!popular || popular.length === 0) return null;

  // Match to live product objects so we have full data for buy/gift
  const items = popular.map(row => ({
    ...row,
    product: products.find(p => p.id === row.product_id) ?? null,
  }));

  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Flame className="w-5 h-5" style={{ color: accent }} />
        <h2 className="font-extrabold text-white text-xl">Most Popular</h2>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => {
          const imgUrl = item.image_type === "playerhead" && item.player_head_name
            ? `https://nmsr.nickac.dev/head/${encodeURIComponent(item.player_head_name)}`
            : item.image_url;
          return (
            <div key={item.product_id}
              className="flex items-center gap-4 rounded-2xl px-4 py-3 transition-all hover:brightness-110"
              style={{ background: "rgba(255,255,255,0.04)", border: i === 0 ? `1px solid ${accent}40` : "1px solid rgba(255,255,255,0.07)" }}>
              {/* Rank */}
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-extrabold text-sm"
                style={{ background: i === 0 ? accent : "rgba(255,255,255,0.08)", color: i === 0 ? "#000" : "rgba(255,255,255,0.4)" }}>
                {i + 1}
              </div>
              {/* Image */}
              {imgUrl ? (
                <img src={imgUrl} alt={item.product_name}
                  className="w-10 h-10 rounded-lg object-cover shrink-0"
                  style={{ imageRendering: item.image_type === "minecraft_item" ? "pixelated" : "auto" }} />
              ) : (
                <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.06)" }}>
                  <Package className="w-5 h-5" style={{ color: "rgba(255,255,255,0.2)" }} />
                </div>
              )}
              {/* Name + count */}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-white truncate">{item.product_name}</p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {item.purchase_count} {item.purchase_count === 1 ? "purchase" : "purchases"}
                </p>
              </div>
              {/* Price + buy */}
              {item.product && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-extrabold" style={{ color: accent }}>£{calcPlayerPrice(item.product.price).toFixed(2)}</span>
                  <button
                    onClick={() => onBuy(item.product!)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:brightness-110"
                    style={{ background: accent, color: "#000" }}>
                    Buy
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── AutoVideo — forces autoplay+muted as DOM properties for iOS Safari ─────────
function AutoVideo({ src, className, style }: { src: string; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => {});
  }, [src]);
  return (
    <video
      ref={ref}
      src={src}
      autoPlay
      loop
      muted
      playsInline
      className={className}
      style={style}
    />
  );
}

// ─── Promotional Banner ──────────────────────────────────────────────────────
function PromoBanner({ data }: { data: StoreData }) {
  const bannerSrc = (data.theme as any).bannerImageUrl as string | undefined;
  const bannerLink = (data.theme as any).bannerLinkUrl as string | undefined;
  if (!bannerSrc) return null;
  const isVideo = bannerSrc.startsWith("data:video/") || bannerSrc.endsWith(".mp4") || bannerSrc.endsWith(".webm");
  const media = isVideo ? (
    <AutoVideo src={bannerSrc}
      className="w-full object-cover" style={{ maxHeight: 200, minHeight: 80, display: "block" }} />
  ) : (
    <img src={bannerSrc} alt="Promotional banner"
      className="w-full object-cover" style={{ maxHeight: 200, minHeight: 80 }} />
  );
  return bannerLink ? (
    <a href={bannerLink} target="_blank" rel="noopener noreferrer"
      className="block rounded-2xl overflow-hidden mb-6 transition-all hover:brightness-110 hover:scale-[1.01]"
      style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      {media}
    </a>
  ) : (
    <div className="rounded-2xl overflow-hidden mb-6" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      {media}
    </div>
  );
}

function EchoLayout({
  data, accent, onBuy, onGift, calcPlayerPrice, page, setPage, memberSession, onLogin,
  playerDropdownOpen, setPlayerDropdownOpen, onLogout, onTopup
}: {
  data: StoreData; accent: string;
  onBuy: (p: Product) => void; onGift: (p: Product) => void;
  calcPlayerPrice: (p: number) => number;
  page: string; setPage: (p: string) => void;
  memberSession: MemberSession | null; onLogin: () => void;
  playerDropdownOpen: boolean; setPlayerDropdownOpen: (v: boolean | ((prev: boolean) => boolean)) => void; onLogout: () => void;
  onTopup: () => void;
}) {
  const categories: string[] = (() => { try { return JSON.parse(data.theme.categories || "[]"); } catch { return []; } })();
  const worlds: string[] = (() => { try { return JSON.parse((data.theme as any).worlds || "[]"); } catch { return []; } })();
  const [selectedWorld, setSelectedWorld] = useState<string | null>(() => {
    // Restore from URL hash param first, fall back to first world
    const params = new URLSearchParams(window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "");
    const urlWorld = params.get("world");
    if (urlWorld && worlds.includes(urlWorld)) return urlWorld;
    return worlds[0] ?? null;
  });

  // Persist selected world into URL hash so it survives page nav
  useEffect(() => {
    if (!selectedWorld) return;
    const hashBase = window.location.hash.split("?")[0] || "#/";
    const params = new URLSearchParams(window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "");
    params.set("world", selectedWorld);
    window.history.replaceState(null, "", window.location.pathname + hashBase + "?" + params.toString());
  }, [selectedWorld]);
  const activeProducts = data.products.filter(p => p.active);
  // Filter by world: if worlds are configured, always show only the selected world's items (+ untagged)
  const worldFiltered = (worlds.length > 0 && selectedWorld)
    ? activeProducts.filter(p => !(p as any).world || (p as any).world === selectedWorld)
    : activeProducts;
  const filteredProducts = (page === "all" || page === "home") ? worldFiltered : worldFiltered.filter(p => p.category === page);
  const isHome = page === "home" || page === "all";
  return (
    <div style={{ background: "#0a0a0a", minHeight: "100%" }}>


      {/* ── Hero banner card ──────────────────────────────────────── */}
      <div className="rounded-2xl mb-8 overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}>

        {/* Banner image — promo banner (bannerImageUrl) takes priority, then bannerUrl, then default */}
        {(() => {
          const heroSrc = (data.theme as any).bannerImageUrl || data.theme.bannerUrl;
          const focalY = (data.theme as any).bannerFocalY || "50%";
          const objPos = `center ${focalY}`;
          if (heroSrc) {
            const isVideo = heroSrc.startsWith("data:video/") || heroSrc.endsWith(".mp4") || heroSrc.endsWith(".webm");
            return (
              <div className="relative w-full overflow-hidden" style={{ height: 240 }}>
                {isVideo ? (
                  <AutoVideo src={heroSrc}
                    className="w-full h-full"
                    style={{ objectFit: "cover", objectPosition: objPos, display: "block" }} />
                ) : (
                  <img src={heroSrc} alt="banner"
                    className="w-full h-full"
                    style={{ objectFit: "cover", objectPosition: objPos }} />
                )}
              </div>
            );
          }
          return (
            <div className="relative w-full flex items-center justify-center" style={{ height: 180, background: `linear-gradient(135deg, #111318 0%, ${accent}18 100%)` }}>
              <div className="text-center">
                {data.server.logoUrl
                  ? <img src={data.server.logoUrl} alt="logo" className="w-14 h-14 object-contain mx-auto mb-2" />
                  : <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-2" style={{ background: `${accent}20` }}>
                      <Package className="w-8 h-8" style={{ color: accent }} />
                    </div>}
                <p className="font-extrabold text-white text-xl uppercase tracking-widest">{data.server.name}</p>
              </div>
            </div>
          );
        })()}

        {/* Sub-bar: logo+name left, Login right (with MC skin peeking out) */}
        <div className="flex items-center px-5 py-3 relative"
          style={{ background: "#13161c", borderTop: "1px solid rgba(255,255,255,0.06)", overflow: "visible" }}>

          {/* Left: logo pill + server name */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0 font-extrabold text-xs"
              style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}30` }}>
              {data.server.logoUrl
                ? <img src={data.server.logoUrl} alt="logo" className="w-7 h-7 object-contain rounded" />
                : data.server.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-white text-sm leading-none truncate">{data.server.name}</p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.38)" }}>Welcome to our store!</p>
            </div>
          </div>

          {/* Right: Login CTA / Player Avatar — skin peeks above bar like EchoSMP */}
          <div className="relative shrink-0 ml-4" style={{ height: 56 }}>
            {memberSession ? (
              <div className="relative">
                <button
                  onClick={() => setPlayerDropdownOpen(o => !o)}
                  className="flex items-center gap-2 h-full px-4 rounded-xl cursor-pointer"
                  style={{ background: accent, minWidth: 140 }}>
                  {/* Skin overflowing above */}
                  <div className="absolute bottom-0 left-2" style={{ width: 48, height: 80, pointerEvents: "none" }}>
                    <img
                      src={skinUrl(memberSession.minecraftUsername, memberSession.platform)}
                      alt={memberSession.minecraftUsername}
                      style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "bottom" }}
                    />
                  </div>
                  <div className="flex flex-col min-w-0 ml-12">
                    <span className="text-sm font-extrabold leading-none text-white truncate">{memberSession.minecraftUsername}</span>
                    <span className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>Logged in ▾</span>
                  </div>
                </button>
                {/* Click-based dropdown */}
                {playerDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 rounded-xl z-50"
                    style={{ background: "#1a1d24", border: "1px solid rgba(255,255,255,0.1)", minWidth: 160, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", overflow: "visible" }}>
                    <button
                      onClick={() => { setPlayerDropdownOpen(false); setPage("profile"); }}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-white/5 transition-colors rounded-t-xl"
                      style={{ color: "rgba(255,255,255,0.8)" }}>
                      <User className="w-4 h-4" /> My Profile
                    </button>
                    <button
                      onClick={() => { setPlayerDropdownOpen(false); onTopup(); }}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-white/5 transition-colors"
                      style={{ color: "#22c55e", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <Plus className="w-4 h-4" /> Top Up Balance
                    </button>
                    <button
                      onClick={onLogout}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-white/5 transition-colors rounded-b-xl"
                      style={{ color: "#f87171", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <LogOut className="w-4 h-4" /> Log Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={onLogin}
                className="relative flex items-center h-full rounded-xl font-bold text-white transition-all hover:brightness-110 overflow-visible"
                style={{ background: accent, minWidth: 160, paddingLeft: 16, paddingRight: 20 }}
                data-testid="echo-subbar-login">
                {/* Ghost skin silhouette peeking up */}
                <div className="absolute bottom-0 left-1" style={{ width: 52, height: 84, opacity: 0.35, pointerEvents: "none" }}>
                  <img
                    src="https://nmsr.nickac.dev/fullbody/MHF_Steve"
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "bottom" }}
                  />
                </div>
                <div className="flex flex-col items-start ml-10">
                  <span className="text-sm font-extrabold leading-none">Login</span>
                  <span className="text-xs font-normal mt-0.5" style={{ color: "rgba(255,255,255,0.75)" }}>to start shopping</span>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>


      {/* ── World Selector ────────────────────────────────────────── */}
      {isHome && worlds.length > 0 && (
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>Select your world</p>
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${worlds.length}, 1fr)` }}>
            {worlds.map((w) => (
              <button
                key={w}
                onClick={() => setSelectedWorld(w)}
                className="relative flex flex-col items-center justify-center gap-1.5 rounded-2xl py-4 px-3 transition-all font-bold text-sm"
                style={{
                  background: selectedWorld === w ? `${accent}22` : "#13161c",
                  border: selectedWorld === w ? `2px solid ${accent}` : "2px solid rgba(255,255,255,0.07)",
                  color: selectedWorld === w ? accent : "rgba(255,255,255,0.45)",
                  boxShadow: selectedWorld === w ? `0 0 20px ${accent}30` : "none",
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 22, height: 22 }}>
                  <rect x="2" y="3" width="20" height="14" rx="3" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
                <span>{w}</span>
                {selectedWorld === w && <span className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ background: accent }} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Most Popular ──────────────────────────────────────────── */}
      {isHome && <MostPopularSection serverId={data.server.id} accent={accent} onBuy={onBuy} onGift={onGift} calcPlayerPrice={calcPlayerPrice} products={worldFiltered} />}

      {/* ── Featured Packages ───────────────────────────────────── */}
      {isHome && worldFiltered.filter(p => !!(p as any).featured).length > 0 && (
        <div className="mb-10">
          <h2 className="font-extrabold text-white text-xl mb-4">Featured Packages</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {worldFiltered.filter(p => !!(p as any).featured).map(p => (
              <EchoProductCard key={p.id} product={p} accent={accent}
                playerPrice={calcPlayerPrice(p.price)} onBuy={onBuy} onGift={onGift} />
            ))}
          </div>
        </div>
      )}


      {/* ── Category page products ────────────────────────────────── */}
      {!isHome && (
        <div className="mb-10">
          <h2 className="font-extrabold text-white text-xl mb-4 capitalize">{page}</h2>
          {filteredProducts.length === 0 ? (
            <div className="text-center py-20 rounded-2xl" style={{ border: "2px dashed rgba(255,255,255,0.07)" }}>
              <Package className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.15)" }} />
              <p className="font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>No items here yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map(p => (
                <EchoProductCard key={p.id} product={p} accent={accent}
                  playerPrice={calcPlayerPrice(p.price)} onBuy={onBuy} onGift={onGift} />
              ))}
            </div>
          )}
        </div>
      )}


      {/* ── Categories grid (2-col) ──────────────────────────────── */}
      {isHome && categories.length > 0 && (() => {
        const catImgMap: Record<string, { imageType: string; imageUrl: string; playerHeadName: string }> = (() => {
          try { return JSON.parse(data.theme.categoryImages || "{}"); } catch { return {}; }
        })();
        const resolveCatImg = (cat: string): string | null => {
          const img = catImgMap[cat];
          if (img?.imageType === "playerhead" && img.playerHeadName)
            return `https://nmsr.nickac.dev/head/${encodeURIComponent(img.playerHeadName)}`;
          if (img?.imageUrl) return img.imageUrl;
          // Fallback: first product in category with an image
          return worldFiltered.find(p => p.category === cat && p.imageUrl)?.imageUrl ?? null;
        };
        return (
          <div className="mb-10">
            <h2 className="font-extrabold text-white text-xl mb-4">Categories</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {categories.map(cat => (
                <EchoCategoryCard key={cat} name={cat} imageUrl={resolveCatImg(cat)}
                  accent={accent} onClick={() => setPage(cat)} />
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Welcome card ────────────────────────────────────────── */}
      {isHome && (
        <div className="rounded-2xl p-8 mb-4"
          style={{ background: "#13161c", border: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: "rgba(255,255,255,0.3)" }}>Welcome to</p>
          <h2 className="text-3xl font-extrabold mb-4 uppercase" style={{ color: accent }}>
            {data.theme.welcomeTitle || data.server.name}
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
            {data.theme.welcomeText ||
              `Welcome to the official ${data.server.name} Store. To begin shopping, select a category above.`}
          </p>
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────── */}
      <footer style={{ background: "#0e1015", borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 40 }}>
        <div className="max-w-5xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Left */}
          <div>
            <p className="font-extrabold text-white text-sm">{data.server.name}</p>
            <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
              © {new Date().getFullYear()} {data.server.name}. All Rights Reserved. We do not have affiliation with any real world brands.
            </p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>
              Powered by{" "}
              <a href="https://craftstore.org.uk" target="_blank" rel="noreferrer"
                className="underline hover:text-white transition-colors" style={{ color: "rgba(255,255,255,0.4)" }}>
                CraftStore
              </a>
            </p>
          </div>
          {/* Right — payment icons (Stripe-supported only) */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Visa */}
            <div className="rounded px-2 py-1 font-black italic" style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)", color: "#1a73e8", fontSize: 13, letterSpacing: "-0.5px" }}>
              VISA
            </div>
            {/* Mastercard */}
            <div className="rounded px-2 py-1 flex items-center gap-1" style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)" }}>
              <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#eb001b", display: "inline-block" }} />
              <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#f79e1b", display: "inline-block", marginLeft: -8 }} />
            </div>
            {/* Amex */}
            <div className="rounded px-2 py-1 text-xs font-bold" style={{ background: "#016fcb", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 11 }}>
              AMEX
            </div>
            {/* Apple Pay */}
            <div className="rounded px-2 py-1 flex items-center gap-1" style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)" }}>
              {/* Apple logo */}
              <svg viewBox="0 0 384 512" width="8" height="11" fill="white" aria-hidden="true">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 28.9 5.2 58.8 15.6 89.5 13.9 40.3 64.1 139.3 116.4 137.7 29.4-.7 50.2-19.9 83.3-19.9 32.2 0 51.7 19.9 83.8 19.9 52.8-.7 99.2-91.6 112.6-132.1-71.2-33.5-96.8-99.6-96.8-99.9zm-91.2-190.4c27.5-32.1 24.7-61.5 24-72.7-23.8 1.4-51.5 16.1-67.3 34.5-17.5 19.7-27 44.3-25.2 70.5 26.1 2 50.2-12.6 68.5-32.3z"/>
              </svg>
              <span style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif", fontSize: 11, fontWeight: 500, color: "#fff", letterSpacing: "-0.2px" }}>Pay</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Store Home ───────────────────────────────────────────────────────────────
function StoreHome({ data, accent, onCategory }: {
  data: StoreData; accent: string; onCategory: (cat: string) => void;
}) {
  const categories: string[] = (() => { try { return JSON.parse(data.theme.categories || "[]"); } catch { return []; } })();
  const activeCount = data.products.filter(p => p.active).length;
  const categoryMap: Record<string, number> = {};
  data.products.forEach(p => { if (p.category) categoryMap[p.category] = (categoryMap[p.category] || 0) + 1; });

  return (
    <div className="p-6 max-w-2xl mx-auto w-full space-y-8">
      {/* Welcome banner */}
      {(data.theme.welcomeTitle || data.theme.welcomeText) && (
        <div className="rounded-2xl p-6 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${accent}18, ${accent}06)`, border: `1px solid ${accent}30`, boxShadow: `0 0 40px ${accent}10` }}>
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none" style={{ background: accent, filter: "blur(40px)", opacity: 0.15 }} />
          <div className="relative flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: accent + "25", border: `1px solid ${accent}40` }}>
              <Heart className="w-6 h-6" style={{ color: accent }} />
            </div>
            <div>
              {data.theme.welcomeTitle && <h3 className="font-extrabold text-base mb-1" style={{ color: "rgba(255,255,255,0.95)" }}>{data.theme.welcomeTitle}</h3>}
              {data.theme.welcomeText && <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>{data.theme.welcomeText}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: <Package className="w-4 h-4" />, value: activeCount, label: "Items" },
          { icon: <Star className="w-4 h-4" />, value: categories.length || "—", label: "Categories" },
          { icon: <TrendingUp className="w-4 h-4" />, value: "Live", label: "Store" },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl p-4 text-center"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex justify-center mb-2" style={{ color: accent }}>{s.icon}</div>
            <p className="text-xl font-extrabold" style={{ color: accent }}>{s.value}</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Category cards */}
      {categories.length > 0 && (() => {
        const catImgMap: Record<string, { imageType: string; imageUrl: string; playerHeadName: string }> = (() => {
          try { return JSON.parse(data.theme.categoryImages || "{}"); } catch { return {}; }
        })();
        const resolveCatImg = (cat: string): string | null => {
          const img = catImgMap[cat];
          if (img?.imageType === "playerhead" && img.playerHeadName)
            return `https://nmsr.nickac.dev/head/${encodeURIComponent(img.playerHeadName)}`;
          return img?.imageUrl || null;
        };
        return (
        <div>
          <h2 className="font-bold text-xs uppercase tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>Browse Categories</h2>
          <div className="grid grid-cols-2 gap-3">
            {categories.map(cat => {
              const thumb = resolveCatImg(cat);
              const isHead = catImgMap[cat]?.imageType === "playerhead";
              return (
              <button key={cat} onClick={() => onCategory(cat)}
                className="rounded-2xl p-5 text-left transition-all hover:scale-[1.02] group overflow-hidden relative"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                data-testid={`home-category-${cat}`}>
                {thumb ? (
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 overflow-hidden"
                    style={{ background: accent + "15", border: `1px solid ${accent}25` }}>
                    <img src={thumb} alt={cat} className="w-full h-full object-contain"
                      style={isHead ? { imageRendering: "pixelated" } : {}} />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3 transition-colors"
                    style={{ background: accent + "15", border: `1px solid ${accent}25` }}>
                    <ChevronRight className="w-4 h-4" style={{ color: accent }} />
                  </div>
                )}
                <p className="font-bold text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>{cat}</p>
                <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>{categoryMap[cat] || 0} items</p>
              </button>
              );
            })}
            <button onClick={() => onCategory("all")}
              className="rounded-2xl p-5 text-left transition-all hover:scale-[1.02]"
              style={{ background: `linear-gradient(135deg, ${accent}18, ${accent}08)`, border: `1px solid ${accent}30` }}
              data-testid="home-category-all">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: accent + "25", border: `1px solid ${accent}40` }}>
                <Sparkles className="w-4 h-4" style={{ color: accent }} />
              </div>
              <p className="font-bold text-sm" style={{ color: accent }}>All Items</p>
              <p className="text-xs mt-1" style={{ color: accent + "80" }}>{activeCount} items</p>
            </button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

// ─── Main Themed Store ────────────────────────────────────────────────────────
function ThemedStore({ data }: { data: StoreData }) {
  const { toast } = useToast();
  const [_location] = useLocation();
  const scheme = COLOR_SCHEMES.find(s => s.id === data.theme.colorScheme) || COLOR_SCHEMES[0];
  const accent = data.theme.accentColor || scheme.accent || "#22c55e";

  const categories: string[] = (() => { try { return JSON.parse(data.theme.categories || "[]"); } catch { return []; } })();
  const subcategories: Record<string, string[]> = (() => { try { return JSON.parse(data.theme.subcategories || "{}"); } catch { return {}; } })();

  const [page, setPage] = useState<SidebarPage>(data.theme.startPage || "all");
  const [activeSubcat, setActiveSubcat] = useState<string | null>(null);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [username, setUsername] = useState("");
  const [checkout, setCheckout] = useState<CheckoutState>({ open: false, product: null, mode: "buy", paymentMode: "balance" });
  const [purchased, setPurchased] = useState(false);
  const [directPayLoading, setDirectPayLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [memberSession, setMemberSessionRaw] = useState<MemberSession | null>(null);
  const [memberAuthOpen, setMemberAuthOpen] = useState(false);
  const [playerDropdownOpen, setPlayerDropdownOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);

  // ── Persistent member session ──────────────────────────────────────────────
  const memberTokenKey = `cs_member_token_${data.server.id}`;

  const setMemberSession = (session: MemberSession | null) => {
    setMemberSessionRaw(session);
    if (session?.sessionToken) {
      try { localStorage.setItem(memberTokenKey, session.sessionToken); } catch {}
    } else if (!session) {
      try { localStorage.removeItem(memberTokenKey); } catch {}
    }
  };

  // Restore session on mount
  useEffect(() => {
    const token = (() => { try { return localStorage.getItem(memberTokenKey); } catch { return null; } })();
    if (!token) return;
    fetch(`/api/member-auth/session?serverId=${data.server.id}`, {
      headers: { "x-member-token": token }
    }).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.ok) {
        setMemberSessionRaw({ id: d.id, minecraftUsername: d.minecraftUsername, email: d.email || "", platform: d.platform || "java", sessionToken: token });
      } else {
        try { localStorage.removeItem(memberTokenKey); } catch {}
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.server.id]);

  const handleMemberLogout = () => {
    const token = (() => { try { return localStorage.getItem(memberTokenKey); } catch { return null; } })();
    if (token) {
      fetch("/api/member-auth/session", { method: "DELETE", headers: { "x-member-token": token } }).catch(() => {});
    }
    setMemberSession(null);
    setPlayerDropdownOpen(false);
  };
  const [giftRecipient, setGiftRecipient] = useState("");
  const [giftMessage, setGiftMessage] = useState("");

  // ── Balance top-up modal ──────────────────────────────────────────────────
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState(10);
  const [topupCustom, setTopupCustom] = useState("");
  const topupMutation = useMutation({
    mutationFn: async (amount: number) => {
      const r = await apiRequest("POST", "/api/member/balance-topup", {
        serverId: data.server.id,
        minecraftUsername: memberSession?.minecraftUsername,
        amount,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Top-up failed");
      return d;
    },
    onSuccess: (d: any) => {
      if (d.url) { window.location.href = d.url; }
      else { toast({ title: `Balance topped up!` }); setTopupOpen(false); }
    },
    onError: (e: any) => toast({ title: "Top-up failed", description: e.message || "Please try again.", variant: "destructive" }),
  });
  const handleTopup = () => {
    if (!memberSession) {
      setTopupOpen(false);
      setMemberAuthOpen(true);
      return;
    }
    const amt = topupCustom ? Number(topupCustom) : topupAmount;
    if (!amt || amt < 1) return toast({ title: "Minimum top-up is £1", variant: "destructive" });
    topupMutation.mutate(amt);
  };

  const feeMode = data.theme.feeMode || "absorb";
  const calcPlayerPrice = (basePrice: number) => {
    if (feeMode === "passthrough") return Math.round((basePrice * 1.2) * 100) / 100;
    return basePrice;
  };

  // ── Stripe success redirect handler ──────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "");
    const purchaseStatus = params.get("purchase");
    const sessionId = params.get("session_id");
    if (purchaseStatus === "success" && sessionId) {
      window.history.replaceState(null, "", window.location.pathname + window.location.hash.split("?")[0]);
      apiRequest("POST", "/api/stripe/product-confirm", { sessionId })
        .then(r => r.json())
        .then(d => { if (d.success) toast({ title: "Payment successful!", description: "Your item will be delivered in-game shortly." }); })
        .catch(() => toast({ title: "Payment confirmed", description: "Your item will be delivered in-game shortly." }));
    }
  }, []);

  const filtered = useMemo(() => {
    let prods = data.products.filter(p => p.active);
    if (page === "home" || page === "leaderboard") return [];
    if (page !== "all") prods = prods.filter(p => p.category === page);
    if (activeSubcat) prods = prods.filter(p => p.subcategory === activeSubcat);
    return prods;
  }, [data.products, page, activeSubcat]);

  const purchaseMutation = useMutation({
    mutationFn: ({ productId, minecraftUsername }: { productId: number; minecraftUsername: string }) =>
      apiRequest("POST", "/api/purchase", { productId, minecraftUsername, serverId: data.server.id })
        .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Purchase failed"); } return r.json(); }),
    onSuccess: () => setPurchased(true),
    onError: (err: Error) => toast({ title: "Purchase failed", description: err.message, variant: "destructive" }),
  });

  const giftMutation = useMutation({
    mutationFn: ({ productId, senderUsername, recipientUsername, message }: { productId: number; senderUsername: string; recipientUsername: string; message: string; }) =>
      apiRequest("POST", "/api/gift", { productId, senderUsername, recipientUsername, message, serverId: data.server.id })
        .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Gift failed"); } return r.json(); }),
    onSuccess: () => setPurchased(true),
    onError: (err: Error) => toast({ title: "Gift failed", description: err.message, variant: "destructive" }),
  });

  const handleDirectPay = async () => {
    if (!username.trim() || !checkout.product) return;
    setDirectPayLoading(true);
    try {
      const r = await apiRequest("POST", "/api/stripe/product-checkout", { productId: checkout.product.id, serverId: data.server.id, minecraftUsername: username.trim() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to create checkout");
      if (d.url) { window.location.href = d.url; }
      else if (d.demoMode) { toast({ title: "Demo mode", description: `Order #${d.orderId} created.` }); setCheckout({ open: false, product: null, mode: "buy", paymentMode: "balance" }); }
    } catch (e: any) {
      toast({ title: "Card payment failed", description: e.message, variant: "destructive" });
    } finally { setDirectPayLoading(false); }
  };

  const handleBuy = (product: Product) => {
    setCheckout({ open: true, product, mode: "buy", paymentMode: "balance" });
    setPurchased(false); setGiftRecipient(""); setGiftMessage("");
    if (memberSession) setUsername(memberSession.minecraftUsername);
  };

  const handleGift = (product: Product) => {
    setCheckout({ open: true, product, mode: "gift", paymentMode: "balance" });
    setPurchased(false); setGiftRecipient(""); setGiftMessage("");
    if (memberSession) setUsername(memberSession.minecraftUsername);
  };

  const confirmPurchase = () => {
    if (!username.trim() || !checkout.product) return;
    if (checkout.mode === "gift") {
      if (!giftRecipient.trim()) return;
      giftMutation.mutate({ productId: checkout.product.id, senderUsername: username.trim(), recipientUsername: giftRecipient.trim(), message: giftMessage.trim() });
    } else {
      purchaseMutation.mutate({ productId: checkout.product.id, minecraftUsername: username.trim() });
    }
  };

  const toggleCat = (cat: string) => setExpandedCats(p => ({ ...p, [cat]: !p[cat] }));
  const isPurchasePending = purchaseMutation.isPending || giftMutation.isPending || directPayLoading;

  const isDonut = data.theme.layout === "donut";
  const isEcho  = data.theme.layout === "echo";

  // Derive background
  const heroBg = isDonut
    ? "#111214"
    : data.preset?.gradientStart && data.preset?.gradientEnd
      ? `radial-gradient(ellipse at top, ${data.preset.gradientEnd} 0%, ${data.preset.gradientStart} 100%)`
      : scheme.id === "light"
        ? "#f8fafc"
        : "linear-gradient(160deg, #0a0a0f 0%, #0d0d14 50%, #0a0a0f 100%)";

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const NavItem = ({ id, icon, label }: { id: string; icon: React.ReactNode; label: string }) => {
    const active = page === id;
    return (
      <button
        onClick={() => { setPage(id); setActiveSubcat(null); setSidebarOpen(false); }}
        className="w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-2.5 transition-all"
        style={active
          ? { background: `linear-gradient(135deg, ${accent}20, ${accent}10)`, color: accent, fontWeight: 700, border: `1px solid ${accent}25` }
          : { color: "rgba(255,255,255,0.55)", border: "1px solid transparent" }}
        data-testid={`sidebar-${id}`}
      >
        <span style={{ color: active ? accent : "rgba(255,255,255,0.35)" }}>{icon}</span>
        {label}
      </button>
    );
  };

  const sidebarContent = (
    <nav className="flex flex-col h-full">
      {/* Server header */}
      <div className="p-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-3 mb-4">
          {data.server.logoUrl ? (
            <img src={data.server.logoUrl} alt="logo" className="w-12 h-12 rounded-2xl object-cover shrink-0"
              style={{ border: `2px solid ${accent}40`, boxShadow: `0 0 20px ${accent}30` }} />
          ) : (
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: `linear-gradient(135deg, ${accent}25, ${accent}10)`, border: `1px solid ${accent}35`, boxShadow: `0 0 20px ${accent}20` }}>
              <Package className="w-6 h-6" style={{ color: accent }} />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="font-extrabold text-sm leading-tight truncate" style={{ color: "#fff" }}>{data.server.name}</h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{data.products.length} item{data.products.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Server links */}
        {(data.server.discordUrl || data.server.serverIp) && (
          <div className="space-y-2">
            {data.server.serverIp && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-mono select-all cursor-text"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
                data-testid="store-server-ip">
                <Shield className="w-3 h-3 shrink-0" style={{ color: accent }} />
                <span className="truncate">{data.server.serverIp}</span>
              </div>
            )}
            {data.server.discordUrl && (
              <a href={data.server.discordUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all hover:opacity-80"
                style={{ background: "#5865F215", border: "1px solid #5865F230", color: "#7289da" }}
                data-testid="store-discord-link">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                </svg>
                Join Discord
              </a>
            )}
          </div>
        )}
      </div>

      {/* Member panel */}
      <div className="px-3 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {memberSession ? (
          <div className="rounded-2xl p-3" style={{ background: `linear-gradient(135deg, ${accent}15, ${accent}05)`, border: `1px solid ${accent}25` }}>
            {/* Player skin + name */}
            <div className="flex items-center gap-3 mb-2.5">
              <div className="relative w-12 h-14 rounded-xl overflow-hidden shrink-0 flex items-end justify-center"
                style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${accent}20` }}>
                <img
                  src={skinUrl(memberSession.minecraftUsername, memberSession.platform)}
                  alt={memberSession.minecraftUsername}
                  className="h-full object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold truncate" style={{ color: "#fff" }}>{memberSession.minecraftUsername}</p>
                {memberSession.email && <p className="text-xs truncate mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{memberSession.email}</p>}
              </div>
              <button onClick={handleMemberLogout} className="shrink-0 hover:opacity-60 transition-opacity" title="Log out" data-testid="button-member-logout">
                <LogOut className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.5)" }} />
              </button>
            </div>
            <div className="flex gap-1.5">
              <a href={`/store/${data.server.id}/profile`}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-bold transition-all hover:opacity-80"
                style={{ background: accent + "20", color: accent, border: `1px solid ${accent}30` }}
                data-testid="link-my-profile">
                <User className="w-3 h-3" /> Profile
              </a>
              <button
                onClick={() => setTopupOpen(true)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-bold transition-all hover:opacity-80"
                style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}
                data-testid="button-topup-balance">
                <Plus className="w-3 h-3" /> Top Up
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setMemberAuthOpen(true)}
            className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all hover:opacity-80"
            style={{ background: `linear-gradient(135deg, ${accent}18, ${accent}08)`, color: accent, border: `1px solid ${accent}25` }}
            data-testid="button-member-login-sidebar">
            <LogIn className="w-4 h-4 shrink-0" /> Member Login
          </button>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <NavItem id="home" icon={<Home className="w-4 h-4" />} label="Home" />
        <NavItem id="all" icon={<ShoppingCart className="w-4 h-4" />} label="All Items" />

        {categories.length > 0 && (
          <p className="text-xs font-bold uppercase tracking-widest px-3 pt-4 pb-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>Categories</p>
        )}
        {categories.map(cat => {
          const subs = subcategories[cat] || [];
          const isActive = page === cat;
          const isExpanded = expandedCats[cat];
          return (
            <div key={cat}>
              <button
                onClick={() => { setPage(cat); setActiveSubcat(null); setSidebarOpen(false); if (subs.length) toggleCat(cat); }}
                className="w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 transition-all"
                style={isActive
                  ? { background: `linear-gradient(135deg, ${accent}20, ${accent}10)`, color: accent, fontWeight: 700, border: `1px solid ${accent}25` }
                  : { color: "rgba(255,255,255,0.55)", border: "1px solid transparent" }}
                data-testid={`sidebar-cat-${cat}`}>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: isActive ? accent : "rgba(255,255,255,0.3)" }} />
                <span className="flex-1 truncate">{cat}</span>
                {subs.length > 0 && (
                  <ChevronDown className="w-3 h-3 shrink-0 transition-transform"
                    style={{ transform: isExpanded ? "rotate(0)" : "rotate(-90deg)", color: "rgba(255,255,255,0.35)" }} />
                )}
              </button>
              {subs.length > 0 && isExpanded && (
                <div className="ml-5 mt-1 space-y-0.5">
                  {subs.map(sub => (
                    <button key={sub}
                      onClick={() => { setPage(cat); setActiveSubcat(sub); setSidebarOpen(false); }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs transition-all"
                      style={activeSubcat === sub && page === cat
                        ? { background: accent + "15", color: accent }
                        : { color: "rgba(255,255,255,0.45)" }}
                      data-testid={`sidebar-subcat-${cat}-${sub}`}>
                      {sub}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <p className="text-xs font-bold uppercase tracking-widest px-3 pt-4 pb-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>Community</p>
        <NavItem id="leaderboard" icon={<Trophy className="w-4 h-4" />} label="Top Customers" />
      </div>
    </nav>
  );

  // ── DonutSMP full-page shell (no sidebar) ──────────────────────────────────
  if (isDonut) {
    const donutCategories: string[] = (() => { try { return JSON.parse(data.theme.categories || "[]"); } catch { return []; } })();

    return (
      <div style={{ background: "#111214", minHeight: "100vh", color: "#fff", fontFamily: "'Cabinet Grotesk', 'Inter', sans-serif" }}>
        {/* Announcement strip */}
        {data.theme.announcementText && (
          <div style={{ background: accent, color: "#fff" }}
            className="px-4 py-2 text-center text-xs font-bold flex items-center justify-center gap-2">
            <Megaphone className="w-3.5 h-3.5 shrink-0" />
            {data.theme.announcementText}
          </div>
        )}

        {/* Top navbar */}
        <header className="sticky top-0 z-30"
          style={{ background: "rgba(17,18,20,0.92)", borderBottom: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(20px)" }}>
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">

            {/* Logo + Server name */}
            <div className="flex items-center gap-3 mr-4">
              {data.server.logoUrl ? (
                <img src={data.server.logoUrl} alt="logo"
                  className="w-9 h-9 rounded-xl object-cover"
                  style={{ border: `2px solid ${accent}40` }} />
              ) : (
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${accent}30, ${accent}10)`, border: `2px solid ${accent}30` }}>
                  <Package className="w-5 h-5" style={{ color: accent }} />
                </div>
              )}
              <span className="font-extrabold text-sm uppercase tracking-wider text-white hidden sm:block">
                {data.server.name}
              </span>
            </div>

            {/* Category tabs — desktop */}
            <nav className="hidden md:flex items-center gap-1 flex-1">
              <button
                onClick={() => setPage("all")}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                style={page === "all"
                  ? { background: accent, color: "#fff", boxShadow: `0 0 16px ${accent}50` }
                  : { color: "rgba(255,255,255,0.55)" }}
                data-testid="donut-nav-all">
                All Items
              </button>
              {donutCategories.map(cat => (
                <button key={cat}
                  onClick={() => setPage(cat)}
                  className="px-4 py-2 rounded-xl text-sm font-bold transition-all capitalize"
                  style={page === cat
                    ? { background: accent, color: "#fff", boxShadow: `0 0 16px ${accent}50` }
                    : { color: "rgba(255,255,255,0.55)" }}
                  data-testid={`donut-nav-${cat}`}>
                  {cat}
                </button>
              ))}
              <button
                onClick={() => setPage("leaderboard")}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                style={page === "leaderboard"
                  ? { background: accent, color: "#fff", boxShadow: `0 0 16px ${accent}50` }
                  : { color: "rgba(255,255,255,0.55)" }}
                data-testid="donut-nav-leaderboard">
                🏆 Top Customers
              </button>
            </nav>

            {/* Right: login + mobile burger */}
            <div className="ml-auto flex items-center gap-2">
              {memberSession ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl hidden sm:flex"
                    style={{ background: `${accent}20`, border: `1px solid ${accent}30` }}>
                    <img
                      src={faceSkinUrl(memberSession.minecraftUsername, memberSession.platform)}
                      alt={memberSession.minecraftUsername}
                      className="w-5 h-5 rounded object-contain"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <span className="text-xs font-bold" style={{ color: accent }}>{memberSession.minecraftUsername}</span>
                  </div>
                  <button
                    onClick={handleMemberLogout}
                    className="p-2 rounded-xl transition-all hover:opacity-70"
                    style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
                    title="Log out"
                    data-testid="donut-logout">
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setMemberAuthOpen(true)}
                  className="px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5"
                  style={{ background: `${accent}20`, color: accent, border: `1px solid ${accent}30` }}
                  data-testid="donut-login">
                  <LogIn className="w-4 h-4" /> Login
                </button>
              )}
              {/* Mobile burger */}
              <button className="md:hidden p-2 rounded-xl"
                style={{ background: "rgba(255,255,255,0.06)" }}
                onClick={() => setMobileMenuOpen(m => !m)}
                data-testid="donut-mobile-menu">
                <Menu className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          {/* Mobile category dropdown */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t px-4 pb-3 pt-2 flex flex-col gap-1"
              style={{ borderColor: "rgba(255,255,255,0.07)", background: "#16181c" }}>
              {["all", ...donutCategories, "leaderboard"].map(cat => (
                <button key={cat}
                  onClick={() => { setPage(cat); setMobileMenuOpen(false); }}
                  className="text-left px-4 py-2.5 rounded-xl text-sm font-bold capitalize transition-all"
                  style={page === cat
                    ? { background: accent, color: "#fff" }
                    : { color: "rgba(255,255,255,0.6)" }}>
                  {cat === "all" ? "All Items" : cat === "leaderboard" ? "🏆 Top Customers" : cat}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* Page body */}
        <main className="max-w-6xl mx-auto w-full">
          {page === "leaderboard" ? (
            <div className="px-4 pt-8">
              <LeaderboardPanel serverId={data.server.id} accent={accent} />
            </div>
          ) : (
            <DonutLayout
              data={data}
              accent={accent}
              onBuy={handleBuy}
              onGift={handleGift}
              calcPlayerPrice={calcPlayerPrice}
              page={page}
            />
          )}
        </main>

        {/* Top-up Balance Modal */}
        <Dialog open={topupOpen} onOpenChange={setTopupOpen}>
          <DialogContent className="max-w-sm" style={{ background: "#111214", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}>
            <DialogHeader>
              <DialogTitle style={{ color: "#fff" }}>Top Up Balance</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Add credit to your store balance to spend on items.</p>
              <div className="grid grid-cols-3 gap-2">
                {[5, 10, 20, 50, 100, 200].map(amt => (
                  <button key={amt}
                    onClick={() => { setTopupAmount(amt); setTopupCustom(""); }}
                    className="py-2 rounded-xl text-sm font-bold transition-all"
                    style={topupAmount === amt && !topupCustom
                      ? { background: accent, color: "#fff" }
                      : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    £{amt}
                  </button>
                ))}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "rgba(255,255,255,0.4)" }}>£</span>
                <Input
                  type="number" placeholder="Custom amount" value={topupCustom}
                  onChange={e => { setTopupCustom(e.target.value); }}
                  className="pl-7"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
              </div>
              <Button className="w-full font-bold" style={{ background: accent, color: "#fff" }}
                onClick={handleTopup} disabled={topupMutation.isPending}>
                {topupMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting…</>
                  : <><CreditCard className="w-4 h-4" /> Pay £{topupCustom ? (Number(topupCustom) || 0).toFixed(2) : topupAmount.toFixed(2)}</>}
              </Button>
              <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.3)" }}>Powered by Stripe. Funds added to your balance instantly.</p>
            </div>
          </DialogContent>
        </Dialog>

        {/* Shared modals — member auth + checkout (same Dialog as standard layout) */}
        {memberAuthOpen && (
          <MemberAuthModal serverId={data.server.id} accent={accent} onClose={() => setMemberAuthOpen(false)} onLogin={(s) => setMemberSession(s)} bedrockEnabled={data.server.bedrockEnabled} bedrockPrefix={data.server.bedrockPrefix} bedrockReplaceSpaces={data.server.bedrockReplaceSpaces} />
        )}
        <Dialog open={checkout.open} onOpenChange={(o) => { if (!o) { setCheckout({ open: false, product: null, mode: "buy", paymentMode: "balance" }); setPurchased(false); } }}>
          <DialogContent className="max-w-sm" style={{ background: "#111214", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}>
            {!purchased ? (
              <>
                <DialogHeader>
                  <DialogTitle style={{ color: "#fff" }}>
                    {checkout.mode === "gift" ? <span className="flex items-center gap-2"><Gift className="w-5 h-5" style={{ color: accent }} /> Gift an Item</span> : "Complete Purchase"}
                  </DialogTitle>
                </DialogHeader>
                {checkout.product && (
                  <div className="space-y-4">
                    <div className="flex rounded-xl overflow-hidden p-1 gap-1" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <button onClick={() => setCheckout(p => ({ ...p, mode: "buy", paymentMode: "balance" }))}
                        className="flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                        style={checkout.mode === "buy" && checkout.paymentMode === "balance" ? { background: accent, color: "#fff" } : { color: "rgba(255,255,255,0.5)" }}>
                        <ShoppingCart className="w-3 h-3" /> Balance
                      </button>
                      <button onClick={() => setCheckout(p => ({ ...p, mode: "buy", paymentMode: "card" }))}
                        className="flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                        style={checkout.paymentMode === "card" ? { background: accent, color: "#fff" } : { color: "rgba(255,255,255,0.5)" }}>
                        <CreditCard className="w-3 h-3" /> Card
                      </button>
                      <button onClick={() => setCheckout(p => ({ ...p, mode: "gift", paymentMode: "balance" }))}
                        className="flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                        style={checkout.mode === "gift" ? { background: accent, color: "#fff" } : { color: "rgba(255,255,255,0.5)" }}>
                        <Gift className="w-3 h-3" /> Gift
                      </button>
                    </div>
                    <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <p className="font-bold text-sm text-white leading-snug mb-1">{checkout.product.name}</p>
                      {checkout.product.description && <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>{checkout.product.description}</p>}
                      <span className="text-xl font-extrabold" style={{ color: accent }}>£{calcPlayerPrice(checkout.product.price).toFixed(2)}</span>
                    </div>
                    <div className="space-y-1.5">
                      <Label style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                        {checkout.mode === "gift" ? "Your Minecraft username (sender)" : "Your Minecraft username"}
                      </Label>
                      <Input placeholder="Steve" value={username} onChange={e => setUsername(e.target.value)}
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                    </div>
                    {checkout.mode === "gift" && (
                      <>
                        <div className="space-y-1.5">
                          <Label style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>Recipient username</Label>
                          <Input placeholder="Notch" value={giftRecipient} onChange={e => setGiftRecipient(e.target.value)}
                            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                        </div>
                        <div className="space-y-1.5">
                          <Label style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>Gift message (optional)</Label>
                          <Textarea placeholder="Enjoy!" rows={2} value={giftMessage} onChange={e => setGiftMessage(e.target.value)}
                            className="resize-none"
                            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                        </div>
                      </>
                    )}
                    {checkout.paymentMode === "card" ? (
                      <Button className="w-full font-bold gap-2" style={{ background: accent, color: "#fff" }}
                        disabled={!username.trim() || directPayLoading} onClick={handleDirectPay}>
                        {directPayLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Redirecting…</> : <><CreditCard className="w-4 h-4" />Pay £{calcPlayerPrice(checkout.product.price).toFixed(2)} with Card</>}
                      </Button>
                    ) : (
                      <Button className="w-full font-bold" style={{ background: accent, color: "#fff" }}
                        disabled={!username.trim() || isPurchasePending || (checkout.mode === "gift" && !giftRecipient.trim())}
                        onClick={confirmPurchase}>
                        {isPurchasePending
                          ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Processing…</>
                          : checkout.mode === "gift"
                            ? `Send Gift — £${calcPlayerPrice(checkout.product.price).toFixed(2)}`
                            : `Confirm — £${calcPlayerPrice(checkout.product.price).toFixed(2)}`}
                      </Button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                  style={{ background: `${accent}20`, border: `2px solid ${accent}50` }}>
                  <CheckCircle2 className="w-8 h-8" style={{ color: accent }} />
                </div>
                <h3 className="font-extrabold text-xl mb-2 text-white">{checkout.mode === "gift" ? "Gift Sent!" : "Purchase Complete!"}</h3>
                <p className="text-sm mb-1" style={{ color: "rgba(255,255,255,0.6)" }}>
                  {checkout.mode === "gift"
                    ? <><span className="font-bold" style={{ color: accent }}>{checkout.product?.name}</span> gifted to <span className="font-mono text-white">{giftRecipient}</span>.</>
                    : <><span className="font-bold" style={{ color: accent }}>{checkout.product?.name}</span> delivered to <span className="font-mono text-white">{username}</span>.</>}
                </p>
                <Button className="mt-6 font-bold px-8" style={{ background: accent, color: "#fff" }}
                  onClick={() => { setCheckout({ open: false, product: null, mode: "buy", paymentMode: "balance" }); setPurchased(false); }}>
                  Back to Store
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── EchoSMP full-page shell (no sidebar) ────────────────────────────────
  if (isEcho) {
    const echoCategories: string[] = (() => { try { return JSON.parse(data.theme.categories || "[]"); } catch { return []; } })();

    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#fff", fontFamily: "'Cabinet Grotesk','Inter',sans-serif" }}>
        {/* Sticky Top Customers sidebar — right side */}
        <RecentPurchasesSidebar serverId={data.server.id} accent={accent} />
        <TopCustomersSidebar serverId={data.server.id} accent={accent} />

        {/* Announcement strip */}
        {data.theme.announcementText && (
          <div style={{ background: accent }}
            className="px-4 py-2 text-center text-xs font-bold flex items-center justify-center gap-2 text-white">
            <Megaphone className="w-3.5 h-3.5 shrink-0" />
            {data.theme.announcementText}
          </div>
        )}

        {/* Countdown banner */}
        {data.theme.countdownTitle && data.theme.countdownEnd && (
          <CountdownBanner
            title={data.theme.countdownTitle}
            subtitle={data.theme.countdownSubtitle || ""}
            endDate={data.theme.countdownEnd}
            ownerUsername={data.server.ownerUsername}
            accent={accent}
          />
        )}

        {/* Floating top-right: Donate + Login */}
        <div className="relative">
          <div className="absolute top-4 right-4 z-30 flex items-center gap-3">
            {/* Donate button — always visible */}
            <button
              onClick={() => setDonateOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-extrabold text-xs transition-all hover:brightness-110"
              style={{ background: accent, color: "#000", boxShadow: `0 0 18px ${accent}60` }}
              data-testid="echo-donate">
              <Heart className="w-3.5 h-3.5" />
              Donate
            </button>
            {/* Login / username */}
            {!memberSession ? (
              <button
                onClick={() => setMemberAuthOpen(true)}
                className="text-sm font-semibold transition-all hover:opacity-80"
                style={{ color: "rgba(255,255,255,0.55)" }}
                data-testid="echo-login">
                Login
              </button>
            ) : (
              <span className="text-xs font-bold px-3 py-1.5 rounded-lg"
                style={{ background: `${accent}20`, color: accent }}>
                {memberSession.minecraftUsername}
              </span>
            )}
          </div>
        </div>

        {/* Page body */}
        <main className="max-w-5xl mx-auto w-full px-4 pt-10">
          {page === "leaderboard" ? (
            <div className="pt-4">
              <LeaderboardPanel serverId={data.server.id} accent={accent} />
            </div>
          ) : (
            <EchoLayout
              data={data}
              accent={accent}
              onBuy={handleBuy}
              onGift={handleGift}
              calcPlayerPrice={calcPlayerPrice}
              page={page}
              setPage={setPage}
              memberSession={memberSession}
              onLogin={() => setMemberAuthOpen(true)}
              playerDropdownOpen={playerDropdownOpen}
              setPlayerDropdownOpen={setPlayerDropdownOpen}
              onLogout={handleMemberLogout}
              onTopup={() => setTopupOpen(true)}
            />
          )}
        </main>

        {/* Donate modal */}
        <DonateModal
          open={donateOpen}
          onClose={() => setDonateOpen(false)}
          serverId={data.server.id}
          serverName={data.server.name}
          accent={accent}
          memberSession={memberSession}
        />

        {/* Modals */}
        {memberAuthOpen && (
          <MemberAuthModal serverId={data.server.id} accent={accent} onClose={() => setMemberAuthOpen(false)} onLogin={(s) => setMemberSession(s)} bedrockEnabled={data.server.bedrockEnabled} bedrockPrefix={data.server.bedrockPrefix} bedrockReplaceSpaces={data.server.bedrockReplaceSpaces} />
        )}
        <Dialog open={checkout.open} onOpenChange={(o) => { if (!o) { setCheckout({ open: false, product: null, mode: "buy", paymentMode: "balance" }); setPurchased(false); } }}>
          <DialogContent className="max-w-sm" style={{ background: "#14171d", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}>
            {!purchased ? (
              <>
                <DialogHeader>
                  <DialogTitle style={{ color: "#fff" }}>
                    {checkout.mode === "gift" ? <span className="flex items-center gap-2"><Gift className="w-5 h-5" style={{ color: accent }} />Gift an Item</span> : "Complete Purchase"}
                  </DialogTitle>
                </DialogHeader>
                {checkout.product && (
                  <div className="space-y-4">
                    <div className="flex rounded-xl overflow-hidden p-1 gap-1" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <button onClick={() => setCheckout(p => ({ ...p, mode: "buy", paymentMode: "balance" }))}
                        className="flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                        style={checkout.mode === "buy" && checkout.paymentMode === "balance" ? { background: accent, color: "#fff" } : { color: "rgba(255,255,255,0.5)" }}>
                        <ShoppingCart className="w-3 h-3" /> Balance
                      </button>
                      <button onClick={() => setCheckout(p => ({ ...p, mode: "buy", paymentMode: "card" }))}
                        className="flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                        style={checkout.paymentMode === "card" ? { background: accent, color: "#fff" } : { color: "rgba(255,255,255,0.5)" }}>
                        <CreditCard className="w-3 h-3" /> Card
                      </button>
                      <button onClick={() => setCheckout(p => ({ ...p, mode: "gift", paymentMode: "balance" }))}
                        className="flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                        style={checkout.mode === "gift" ? { background: accent, color: "#fff" } : { color: "rgba(255,255,255,0.5)" }}>
                        <Gift className="w-3 h-3" /> Gift
                      </button>
                    </div>
                    <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <p className="font-bold text-sm text-white leading-snug mb-1">{checkout.product.name}</p>
                      <span className="text-xl font-extrabold" style={{ color: accent }}>£{calcPlayerPrice(checkout.product.price).toFixed(2)}</span>
                    </div>
                    <div className="space-y-1.5">
                      <Label style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>Your Minecraft username</Label>
                      <Input placeholder="Steve" value={username} onChange={e => setUsername(e.target.value)}
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                    </div>
                    {checkout.mode === "gift" && (
                      <div className="space-y-1.5">
                        <Label style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>Recipient username</Label>
                        <Input placeholder="Notch" value={giftRecipient} onChange={e => setGiftRecipient(e.target.value)}
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                      </div>
                    )}
                    {checkout.paymentMode === "card" ? (
                      <Button className="w-full font-bold gap-2" style={{ background: accent, color: "#fff" }}
                        disabled={!username.trim() || directPayLoading} onClick={handleDirectPay}>
                        {directPayLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Redirecting…</> : <><CreditCard className="w-4 h-4" />Pay £{calcPlayerPrice(checkout.product.price).toFixed(2)} by Card</>}
                      </Button>
                    ) : (
                      <Button className="w-full font-bold" style={{ background: accent, color: "#fff" }}
                        disabled={!username.trim() || isPurchasePending}
                        onClick={confirmPurchase}>
                        {isPurchasePending
                          ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Processing…</>
                          : `Confirm — £${calcPlayerPrice(checkout.product.price).toFixed(2)}`}
                      </Button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                  style={{ background: `${accent}20`, border: `2px solid ${accent}50` }}>
                  <CheckCircle2 className="w-8 h-8" style={{ color: accent }} />
                </div>
                <h3 className="font-extrabold text-xl mb-2 text-white">Purchase Complete!</h3>
                <p className="text-sm mb-1" style={{ color: "rgba(255,255,255,0.6)" }}>
                  <span className="font-bold" style={{ color: accent }}>{checkout.product?.name}</span> delivered to <span className="font-mono text-white">{username}</span>.
                </p>
                <Button className="mt-6 font-bold px-8" style={{ background: accent, color: "#fff" }}
                  onClick={() => { setCheckout({ open: false, product: null, mode: "buy", paymentMode: "balance" }); setPurchased(false); }}>
                  Back to Store
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Top-up Balance Modal ── */}
        <Dialog open={topupOpen} onOpenChange={setTopupOpen}>
          <DialogContent className="max-w-sm" style={{ background: "#111214", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}>
            <DialogHeader>
              <DialogTitle style={{ color: "#fff" }}>Top Up Balance</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Add credit to your store balance to spend on items.</p>
              <div className="grid grid-cols-3 gap-2">
                {[5, 10, 20, 50, 100, 200].map(amt => (
                  <button key={amt}
                    onClick={() => { setTopupAmount(amt); setTopupCustom(""); }}
                    className="py-2 rounded-xl text-sm font-bold transition-all"
                    style={topupAmount === amt && !topupCustom
                      ? { background: accent, color: "#000" }
                      : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    £{amt}
                  </button>
                ))}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "rgba(255,255,255,0.4)" }}>£</span>
                <Input type="number" placeholder="Custom amount" value={topupCustom}
                  onChange={e => setTopupCustom(e.target.value)} className="pl-7"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
              </div>
              <Button className="w-full font-bold" style={{ background: accent, color: "#000", boxShadow: `0 0 25px ${accent}50` }}
                onClick={handleTopup} disabled={topupMutation.isPending}>
                {topupMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting…</>
                  : <><CreditCard className="w-4 h-4" /> Pay £{topupCustom ? (Number(topupCustom) || 0).toFixed(2) : topupAmount.toFixed(2)}</>}
              </Button>
              <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.3)" }}>Powered by Stripe. Funds added to your balance instantly.</p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Standard sidebar shell ───────────────────────────────────────────────────
  return (
    <div style={{ background: heroBg, minHeight: "100vh", color: "#fff", fontFamily: "'Cabinet Grotesk', 'Inter', sans-serif", position: "relative" }}>
      {/* Animation layer */}
      {data.preset && (
        <AnimationLayer style={data.preset.animationStyle} accent={data.preset.accentColor || accent} glowColor={data.preset.glowColor || null} />
      )}

      {/* Announcement strip */}
      {data.theme.announcementText && (
        <div style={{ background: `linear-gradient(90deg, ${accent}dd, ${accent}bb)`, color: "#000", position: "relative", zIndex: 10 }}
          className="px-4 py-2.5 text-center text-sm font-bold flex items-center justify-center gap-2">
          <Megaphone className="w-3.5 h-3.5 shrink-0" />
          {data.theme.announcementText}
        </div>
      )}

      {/* Layout: sidebar + main */}
      <div className="flex min-h-screen" style={{ position: "relative", zIndex: 2 }}>
        {/* Desktop sidebar */}
        <aside className="w-64 shrink-0 sticky top-0 h-screen overflow-y-auto hidden md:flex flex-col"
          style={{ background: "rgba(255,255,255,0.02)", borderRight: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(20px)" }}>
          {sidebarContent}
        </aside>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div className="flex-1 bg-black/70 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            <aside className="w-72 h-full overflow-y-auto flex flex-col" style={{ background: "#0d0d14", borderLeft: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <span className="font-bold text-sm text-white">Menu</span>
                <button onClick={() => setSidebarOpen(false)}><X className="w-4 h-4 text-white/60" /></button>
              </div>
              {sidebarContent}
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {/* Mobile topbar */}
          <div className="md:hidden flex items-center gap-3 px-4 py-3 sticky top-0 z-20"
            style={{ background: "rgba(10,10,15,0.9)", borderBottom: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(20px)" }}>
            <button onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" style={{ color: accent }} />
            </button>
            <span className="font-bold text-sm flex-1 truncate text-white">{data.server.name}</span>
          </div>

          {/* Hero banner — shown on product pages */}
          {page !== "home" && page !== "leaderboard" && (
            <div className="relative overflow-hidden" style={{ minHeight: 180 }}>
              {/* Banner image */}
              {data.theme.bannerUrl ? (
                data.theme.bannerUrl.startsWith("data:video/") || data.theme.bannerUrl.endsWith(".mp4") || data.theme.bannerUrl.endsWith(".webm") ? (
                  <AutoVideo src={data.theme.bannerUrl!} className="absolute inset-0 w-full h-full object-cover" style={{ display: "block" }} />
                ) : (
                  <img src={data.theme.bannerUrl} alt="banner" className="absolute inset-0 w-full h-full object-cover" />
                )
              ) : (
                <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 30% 50%, ${accent}20 0%, transparent 70%)` }} />
              )}
              {/* Overlay */}
              <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(10,10,15,0.95) 0%, rgba(10,10,15,0.6) 50%, rgba(10,10,15,0.3) 100%)" }} />
              {/* Content */}
              <div className="relative z-10 px-8 py-10 flex items-center gap-6">
                {data.server.logoUrl ? (
                  <img src={data.server.logoUrl} alt="logo" className="w-16 h-16 rounded-2xl object-cover shrink-0 hidden sm:block"
                    style={{ border: `2px solid ${accent}50`, boxShadow: `0 0 30px ${accent}40` }} />
                ) : (
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 hidden sm:block"
                    style={{ background: `linear-gradient(135deg, ${accent}30, ${accent}10)`, border: `2px solid ${accent}40`, boxShadow: `0 0 30px ${accent}30` }}>
                    <Package className="w-8 h-8" style={{ color: accent }} />
                  </div>
                )}
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: accent + "cc" }}>{data.server.name}</p>
                  <h1 className="text-2xl font-extrabold text-white leading-tight">
                    {page === "all" ? "All Items" : page}
                  </h1>
                  <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                    {filtered.length} item{filtered.length !== 1 ? "s" : ""}
                    {activeSubcat ? ` in "${activeSubcat}"` : ""}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Leaderboard header */}
          {page === "leaderboard" && (
            <div className="relative overflow-hidden" style={{ minHeight: 160 }}>
              <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 30% 50%, ${accent}15 0%, transparent 70%)` }} />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(10,10,15,0.95), rgba(10,10,15,0.6))" }} />
              <div className="relative z-10 px-8 py-10">
                <div className="flex items-center gap-3 mb-1">
                  <Trophy className="w-7 h-7" style={{ color: accent }} />
                  <h1 className="text-2xl font-extrabold text-white">Top Customers</h1>
                </div>
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>Players who've spent the most on {data.server.name}</p>
              </div>
            </div>
          )}

          {/* Page content */}
          {page === "home" && (
            <StoreHome data={data} accent={accent} onCategory={(cat) => { setPage(cat); setActiveSubcat(null); }} />
          )}

          {page === "leaderboard" && (
            <LeaderboardPanel serverId={data.server.id} accent={accent} />
          )}

          {page !== "home" && page !== "leaderboard" && isDonut && (
            <DonutLayout
              data={data}
              accent={accent}
              onBuy={handleBuy}
              onGift={handleGift}
              calcPlayerPrice={calcPlayerPrice}
              page={page}
            />
          )}

          {page !== "home" && page !== "leaderboard" && !isDonut && (
            <div className="px-6 py-6">
              {/* Subcategory pills */}
              {page !== "all" && (subcategories[page] || []).length > 0 && (
                <div className="flex gap-2 flex-wrap mb-6">
                  <button
                    onClick={() => setActiveSubcat(null)}
                    className="px-4 py-1.5 rounded-full text-xs font-bold transition-all"
                    style={!activeSubcat ? { background: accent, color: "#000" } : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}>
                    All
                  </button>
                  {(subcategories[page] || []).map(sub => (
                    <button key={sub}
                      onClick={() => setActiveSubcat(sub)}
                      className="px-4 py-1.5 rounded-full text-xs font-bold transition-all"
                      style={activeSubcat === sub ? { background: accent, color: "#000" } : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}
                      data-testid={`subcat-pill-${sub}`}>
                      {sub}
                    </button>
                  ))}
                </div>
              )}

              {filtered.length === 0 ? (
                <div className="text-center py-24 rounded-3xl" style={{ border: "2px dashed rgba(255,255,255,0.08)" }}>
                  <Package className="w-12 h-12 mx-auto mb-4" style={{ color: "rgba(255,255,255,0.2)" }} />
                  <h3 className="font-bold text-lg mb-2" style={{ color: "rgba(255,255,255,0.6)" }}>No items here</h3>
                  <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>Check back soon.</p>
                </div>
              ) : data.theme.layout === "list" ? (
                <div className="space-y-3">
                  {filtered.map(product => (
                    <div key={product.id}
                      className="rounded-2xl p-4 flex items-center gap-4 transition-all hover:scale-[1.005]"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                      data-testid={`card-store-product-${product.id}`}>
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                      ) : (
                        <div className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0" style={{ background: accent + "15" }}>
                          <Package className="w-7 h-7" style={{ color: accent + "80" }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-sm text-white">{product.name}</h3>
                          {product.category && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: accent + "20", color: accent }}>{product.category}</span>}
                        </div>
                        {product.description && <p className="text-xs mt-1 line-clamp-1" style={{ color: "rgba(255,255,255,0.45)" }}>{product.description}</p>}
                        {product.stock > 0 && product.stock !== -1 && <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{product.stock} left</p>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xl font-extrabold" style={{ color: accent, textShadow: `0 0 20px ${accent}80` }}>£{calcPlayerPrice(product.price).toFixed(2)}</span>
                        <div className="flex gap-1.5">
                          <button onClick={() => handleBuy(product)}
                            className="px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90 flex items-center gap-1.5"
                            style={{ background: accent, color: "#000" }}
                            data-testid={`button-buy-${product.id}`}>
                            <ShoppingCart className="w-3.5 h-3.5" /> Buy
                          </button>
                          <button onClick={() => handleGift(product)}
                            className="p-2 rounded-xl transition-all hover:opacity-80"
                            style={{ background: "rgba(255,255,255,0.08)", color: accent, border: `1px solid ${accent}20` }}
                            data-testid={`button-gift-${product.id}`}>
                            <Gift className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : data.theme.layout === "featured" ? (
                <div className="space-y-6">
                  {filtered[0] && (
                    <div className="rounded-3xl overflow-hidden flex flex-col md:flex-row"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: `0 0 60px ${accent}15` }}
                      data-testid={`card-store-product-${filtered[0].id}`}>
                      {filtered[0].imageUrl ? (
                        <img src={filtered[0].imageUrl} alt={filtered[0].name} className="w-full md:w-80 h-56 md:h-auto object-cover" />
                      ) : (
                        <div className="w-full md:w-80 h-56 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${accent}15, ${accent}05)` }}>
                          <Package className="w-20 h-20" style={{ color: accent + "40" }} />
                        </div>
                      )}
                      <div className="p-8 flex flex-col justify-between flex-1">
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs font-extrabold px-3 py-1 rounded-full" style={{ background: accent, color: "#000" }}>FEATURED</span>
                            {filtered[0].category && <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: accent + "20", color: accent }}>{filtered[0].category}</span>}
                          </div>
                          <h2 className="text-2xl font-extrabold text-white mb-2">{filtered[0].name}</h2>
                          {filtered[0].description && <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>{filtered[0].description}</p>}
                        </div>
                        <div className="flex items-center justify-between mt-8">
                          <span className="text-3xl font-extrabold" style={{ color: accent, textShadow: `0 0 30px ${accent}80` }}>£{calcPlayerPrice(filtered[0].price).toFixed(2)}</span>
                          <button onClick={() => handleBuy(filtered[0])}
                            className="px-6 py-3 rounded-2xl font-bold transition-all hover:opacity-90 flex items-center gap-2"
                            style={{ background: accent, color: "#000", boxShadow: `0 0 30px ${accent}50` }}
                            data-testid={`button-buy-${filtered[0].id}`}>
                            <ShoppingCart className="w-4 h-4" /> Buy Now
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {filtered.length > 1 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                      {filtered.slice(1).map(p => (
                        <ProductCard key={p.id} product={p} accent={accent} playerPrice={calcPlayerPrice(p.price)} onBuy={handleBuy} onGift={handleGift} />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                // Default grid
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {filtered.map(p => (
                    <ProductCard key={p.id} product={p} accent={accent} playerPrice={calcPlayerPrice(p.price)} onBuy={handleBuy} onGift={handleGift} />
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Member Auth Modal */}
      {memberAuthOpen && (
        <MemberAuthModal serverId={data.server.id} accent={accent} onClose={() => setMemberAuthOpen(false)} onLogin={(s) => setMemberSession(s)} bedrockEnabled={data.server.bedrockEnabled} bedrockPrefix={data.server.bedrockPrefix} bedrockReplaceSpaces={data.server.bedrockReplaceSpaces} />
      )}

      {/* ── Checkout Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={checkout.open} onOpenChange={(o) => { if (!o) { setCheckout({ open: false, product: null, mode: "buy", paymentMode: "balance" }); setPurchased(false); } }}>
        <DialogContent className="max-w-sm" style={{ background: "#0f0f16", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}>
          {!purchased ? (
            <>
              <DialogHeader>
                <DialogTitle style={{ color: "#fff" }}>
                  {checkout.mode === "gift" ? <span className="flex items-center gap-2"><Gift className="w-5 h-5" style={{ color: accent }} /> Gift an Item</span> : "Complete Purchase"}
                </DialogTitle>
              </DialogHeader>
              {checkout.product && (
                <div className="space-y-4">
                  {/* 3-tab switcher */}
                  <div className="flex rounded-xl overflow-hidden p-1 gap-1" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <button
                      onClick={() => setCheckout(p => ({ ...p, mode: "buy", paymentMode: "balance" }))}
                      className="flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                      style={checkout.mode === "buy" && checkout.paymentMode === "balance" ? { background: accent, color: "#000" } : { color: "rgba(255,255,255,0.5)" }}
                      data-testid="button-checkout-mode-buy">
                      <ShoppingCart className="w-3 h-3" /> Balance
                    </button>
                    <button
                      onClick={() => setCheckout(p => ({ ...p, mode: "buy", paymentMode: "card" }))}
                      className="flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                      style={checkout.paymentMode === "card" ? { background: accent, color: "#000" } : { color: "rgba(255,255,255,0.5)" }}
                      data-testid="button-checkout-mode-card">
                      <CreditCard className="w-3 h-3" /> Card
                    </button>
                    <button
                      onClick={() => setCheckout(p => ({ ...p, mode: "gift", paymentMode: "balance" }))}
                      className="flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                      style={checkout.mode === "gift" ? { background: accent, color: "#000" } : { color: "rgba(255,255,255,0.5)" }}
                      data-testid="button-checkout-mode-gift">
                      <Gift className="w-3 h-3" /> Gift
                    </button>
                  </div>

                  {/* Product summary */}
                  <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="font-bold text-sm text-white leading-snug mb-1">{checkout.product.name}</p>
                    {checkout.product.description && <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>{checkout.product.description}</p>}
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-extrabold" style={{ color: accent, textShadow: `0 0 20px ${accent}80` }}>
                        £{calcPlayerPrice(checkout.product.price).toFixed(2)}
                      </span>
                      {feeMode === "passthrough" && <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>incl. fee</span>}
                    </div>
                  </div>

                  {/* Username */}
                  <div className="space-y-1.5">
                    <Label style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                      {checkout.mode === "gift" ? "Your Minecraft username (sender)" : "Your Minecraft username"}
                    </Label>
                    <Input placeholder="Steve" value={username} onChange={e => setUsername(e.target.value)}
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
                      data-testid="input-checkout-username" />
                  </div>

                  {/* Gift fields */}
                  {checkout.mode === "gift" && (
                    <>
                      <div className="space-y-1.5">
                        <Label style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>Recipient username</Label>
                        <Input placeholder="Notch" value={giftRecipient} onChange={e => setGiftRecipient(e.target.value)}
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
                          data-testid="input-gift-recipient" />
                      </div>
                      <div className="space-y-1.5">
                        <Label style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>Gift message (optional)</Label>
                        <Textarea placeholder="Enjoy this gift!" rows={2} value={giftMessage} onChange={e => setGiftMessage(e.target.value)}
                          className="resize-none"
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
                          data-testid="input-gift-message" />
                      </div>
                    </>
                  )}

                  {/* Info */}
                  <p className="text-xs px-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {checkout.paymentMode === "card"
                      ? "You'll be taken to a secure Stripe checkout. Your item will be delivered in-game after payment."
                      : checkout.mode === "buy"
                        ? "Your store balance will be deducted and the item delivered in-game."
                        : "The item will be delivered to the recipient in-game."}
                  </p>

                  {/* Action */}
                  {checkout.paymentMode === "card" ? (
                    <Button className="w-full font-bold gap-2"
                      style={{ background: accent, color: "#000", boxShadow: `0 0 25px ${accent}50` }}
                      disabled={!username.trim() || directPayLoading}
                      onClick={handleDirectPay}
                      data-testid="button-pay-by-card">
                      {directPayLoading
                        ? <><Loader2 className="w-4 h-4 animate-spin" />Redirecting…</>
                        : <><CreditCard className="w-4 h-4" />Pay £{calcPlayerPrice(checkout.product.price).toFixed(2)} with Card</>}
                    </Button>
                  ) : (
                    <Button className="w-full font-bold"
                      style={{ background: accent, color: "#000", boxShadow: `0 0 25px ${accent}50` }}
                      disabled={!username.trim() || isPurchasePending || (checkout.mode === "gift" && !giftRecipient.trim())}
                      onClick={confirmPurchase}
                      data-testid="button-confirm-purchase">
                      {isPurchasePending
                        ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Processing…</>
                        : checkout.mode === "gift"
                          ? `Send Gift — £${calcPlayerPrice(checkout.product.price).toFixed(2)}`
                          : `Confirm — £${calcPlayerPrice(checkout.product.price).toFixed(2)}`}
                    </Button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{ background: `linear-gradient(135deg, ${accent}30, ${accent}10)`, border: `2px solid ${accent}50`, boxShadow: `0 0 40px ${accent}40` }}>
                <CheckCircle2 className="w-8 h-8" style={{ color: accent }} />
              </div>
              <h3 className="font-extrabold text-xl mb-2 text-white">
                {checkout.mode === "gift" ? "Gift Sent!" : "Purchase Complete!"}
              </h3>
              <p className="text-sm mb-1" style={{ color: "rgba(255,255,255,0.6)" }}>
                {checkout.mode === "gift"
                  ? <><span className="font-bold" style={{ color: accent }}>{checkout.product?.name}</span> gifted to <span className="font-mono text-white">{giftRecipient}</span>.</>
                  : <><span className="font-bold" style={{ color: accent }}>{checkout.product?.name}</span> delivered to <span className="font-mono text-white">{username}</span>.</>}
              </p>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>Check your inventory in-game.</p>
              <Button className="mt-6 font-bold px-8"
                style={{ background: accent, color: "#000", boxShadow: `0 0 25px ${accent}50` }}
                onClick={() => { setCheckout({ open: false, product: null, mode: "buy", paymentMode: "balance" }); setPurchased(false); }}>
                Back to Store
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Top-up Balance Modal */}
      <Dialog open={topupOpen} onOpenChange={setTopupOpen}>
        <DialogContent className="max-w-sm" style={{ background: "#111214", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#fff" }}>Top Up Balance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Add credit to your store balance to spend on items.</p>
            <div className="grid grid-cols-3 gap-2">
              {[5, 10, 20, 50, 100, 200].map(amt => (
                <button key={amt}
                  onClick={() => { setTopupAmount(amt); setTopupCustom(""); }}
                  className="py-2 rounded-xl text-sm font-bold transition-all"
                  style={topupAmount === amt && !topupCustom
                    ? { background: accent, color: "#000" }
                    : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  £{amt}
                </button>
              ))}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "rgba(255,255,255,0.4)" }}>£</span>
              <Input type="number" placeholder="Custom amount" value={topupCustom}
                onChange={e => setTopupCustom(e.target.value)}
                className="pl-7"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
            </div>
            <Button className="w-full font-bold" style={{ background: accent, color: "#000", boxShadow: `0 0 25px ${accent}50` }}
              onClick={handleTopup} disabled={topupMutation.isPending}>
              {topupMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting…</>
                : <><CreditCard className="w-4 h-4" /> Pay £{topupCustom ? (Number(topupCustom) || 0).toFixed(2) : topupAmount.toFixed(2)}</>}
            </Button>
            <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.3)" }}>Powered by Stripe. Funds added to your balance instantly.</p>
          </div>
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0f" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}>
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#22c55e" }} />
          </div>
          <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Loading store…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center p-8" style={{ background: "#0a0a0f" }}>
        <div>
          <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "#f87171" }} />
          <h2 className="font-bold text-lg mb-2 text-white">Store not found</h2>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>This store doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }

  return <ThemedStore data={data} />;
}
