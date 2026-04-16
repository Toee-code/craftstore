/**
 * StorePresets — Marketplace for purchasable animation + colour packs.
 * Embedded inside ServerDashboard "Presets" tab.
 *
 * v3: Stripe checkout flow for paid presets + live preview modal.
 */
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, Sparkles, Check, Lock, Zap, Star, Flame, Snowflake, Wand2,
  Eye, CreditCard, ShieldCheck, X
} from "lucide-react";

interface StorePreset {
  id: number; name: string; description: string; price: number;
  animationStyle: string; colorScheme: string; accentColor: string;
  gradientStart: string | null; gradientEnd: string | null;
  glowColor: string | null; badgeLabel: string | null;
  previewImageUrl: string | null; createdAt: string;
}
interface PresetPurchase { id: number; ownerId: number; presetId: number; serverId: number | null; }

const ANIM_ICONS: Record<string, React.ElementType> = {
  none: Star,
  particles: Sparkles,
  pixel_rain: Zap,
  floating_blocks: Snowflake,
  neon_glow: Flame,
  nether_fire: Flame,
  enchanted: Wand2,
};

const BADGE_COLORS: Record<string, string> = {
  FREE: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  POPULAR: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  NEW: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  HOT: "bg-red-500/20 text-red-400 border-red-500/30",
  EXCLUSIVE: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

// ─── Mini Animation Canvas for preview modal ─────────────────────────────────
function PreviewCanvas({ animStyle, accentColor, glowColor }: {
  animStyle: string; accentColor: string; glowColor: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (animStyle === "none") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const W = canvas.width = 480;
    const H = canvas.height = 220;

    if (animStyle === "particles" || animStyle === "neon_glow") {
      const particles = Array.from({ length: 40 }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.7, vy: (Math.random() - 0.5) * 0.7,
        r: Math.random() * 3 + 1, alpha: Math.random() * 0.6 + 0.2,
      }));
      const color = glowColor || accentColor;
      const draw = () => {
        ctx.clearRect(0, 0, W, H);
        particles.forEach(p => {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
          if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
          ctx.save();
          ctx.globalAlpha = p.alpha * 0.9;
          ctx.shadowBlur = animStyle === "neon_glow" ? 18 : 8;
          ctx.shadowColor = color;
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
        animId = requestAnimationFrame(draw);
      };
      draw();
    } else if (animStyle === "pixel_rain") {
      const cols = Math.floor(W / 18);
      const drops = Array.from({ length: cols }, () => Math.random() * -50);
      const draw = () => {
        ctx.fillStyle = "rgba(0,0,0,0.07)";
        ctx.fillRect(0, 0, W, H);
        ctx.font = "14px monospace";
        drops.forEach((y, i) => {
          const char = String.fromCharCode(0x30A0 + Math.random() * 96);
          ctx.fillStyle = accentColor + "cc";
          ctx.fillText(char, i * 18, y);
          if (y > H && Math.random() > 0.975) drops[i] = 0;
          drops[i] += 18;
        });
        animId = requestAnimationFrame(draw);
      };
      draw();
    } else if (animStyle === "floating_blocks") {
      const blocks = Array.from({ length: 18 }, () => ({
        x: Math.random() * W, y: H + Math.random() * 200,
        size: Math.random() * 20 + 8, speed: Math.random() * 0.8 + 0.3,
        alpha: Math.random() * 0.3 + 0.08,
        hue: Math.random() > 0.5 ? accentColor : (glowColor || "#22c55e"),
      }));
      const draw = () => {
        ctx.clearRect(0, 0, W, H);
        blocks.forEach(b => {
          b.y -= b.speed;
          if (b.y < -40) { b.y = H + 40; b.x = Math.random() * W; }
          ctx.save(); ctx.globalAlpha = b.alpha;
          ctx.strokeStyle = b.hue; ctx.lineWidth = 1.5;
          ctx.strokeRect(b.x, b.y, b.size, b.size);
          ctx.fillStyle = b.hue + "30"; ctx.fillRect(b.x, b.y, b.size, b.size);
          ctx.restore();
        });
        animId = requestAnimationFrame(draw);
      };
      draw();
    } else if (animStyle === "nether_fire") {
      const embers = Array.from({ length: 60 }, () => ({
        x: Math.random() * W, y: H + Math.random() * 80,
        vx: (Math.random() - 0.5) * 1.5, vy: -(Math.random() * 2 + 0.5),
        r: Math.random() * 2.5 + 0.5, life: Math.random(),
        decay: Math.random() * 0.004 + 0.002,
      }));
      const fireColors = [accentColor, glowColor || "#f97316", "#ef4444", "#fbbf24"];
      const draw = () => {
        ctx.clearRect(0, 0, W, H);
        embers.forEach(e => {
          e.x += e.vx; e.y += e.vy; e.life -= e.decay;
          if (e.life <= 0 || e.y < -10) {
            e.x = Math.random() * W; e.y = H + 10; e.life = 1;
            e.vx = (Math.random() - 0.5) * 1.5;
          }
          ctx.save(); ctx.globalAlpha = e.life * 0.8;
          ctx.shadowBlur = 8;
          ctx.shadowColor = fireColors[Math.floor(Math.random() * fireColors.length)];
          ctx.fillStyle = fireColors[Math.floor(e.life * fireColors.length)] || accentColor;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
        animId = requestAnimationFrame(draw);
      };
      draw();
    } else if (animStyle === "enchanted") {
      const sparks = Array.from({ length: 40 }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        size: Math.random() * 4 + 1, alpha: 0,
        phase: Math.random() * Math.PI * 2, speed: Math.random() * 0.04 + 0.01,
      }));
      const color = glowColor || accentColor;
      const draw = () => {
        ctx.clearRect(0, 0, W, H);
        sparks.forEach(s => {
          s.phase += s.speed;
          s.alpha = Math.abs(Math.sin(s.phase)) * 0.9;
          ctx.save(); ctx.globalAlpha = s.alpha;
          ctx.shadowBlur = 12; ctx.shadowColor = color; ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          if (s.alpha < 0.05 && Math.random() > 0.9) {
            s.x = Math.random() * W; s.y = Math.random() * H;
          }
        });
        animId = requestAnimationFrame(draw);
      };
      draw();
    }

    return () => { cancelAnimationFrame(animId); };
  }, [animStyle, accentColor, glowColor]);

  return (
    <canvas
      ref={canvasRef}
      width={480} height={220}
      className="w-full rounded-xl"
      style={{ display: "block" }}
    />
  );
}

// ─── Preview Modal ────────────────────────────────────────────────────────────
function PresetPreviewModal({ preset, onClose, onBuy, onClaim, owned, active, canApply }: {
  preset: StorePreset;
  onClose: () => void;
  onBuy: () => void;
  onClaim: () => void;
  owned: boolean;
  active: boolean;
  canApply: boolean;
}) {
  const isFree = preset.price === 0;

  const bgStyle = preset.gradientStart && preset.gradientEnd
    ? { background: `linear-gradient(135deg, ${preset.gradientStart}, ${preset.gradientEnd})` }
    : { background: preset.accentColor + "12" };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border/60 max-w-lg p-0 overflow-hidden">
        {/* Animation preview */}
        <div className="relative overflow-hidden rounded-t-lg" style={{ ...bgStyle, minHeight: 220 }}>
          <PreviewCanvas
            animStyle={preset.animationStyle}
            accentColor={preset.accentColor}
            glowColor={preset.glowColor}
          />
          {/* Overlay text */}
          <div className="absolute inset-0 flex items-end p-4">
            <div>
              <h3
                className="text-lg font-extrabold drop-shadow"
                style={{ color: preset.accentColor }}
              >
                {preset.name}
              </h3>
              <p className="text-xs text-white/70 capitalize">
                {preset.animationStyle.replace("_", " ")} animation
              </p>
            </div>
          </div>
          <button
            className="absolute top-3 right-3 rounded-full bg-black/40 p-1.5 hover:bg-black/60 transition-colors"
            onClick={onClose}
            data-testid="button-close-preview"
          >
            <X className="w-4 h-4 text-white" />
          </button>
          {preset.badgeLabel && (
            <span
              className={`absolute top-3 left-3 text-xs px-2 py-0.5 rounded-full font-bold border ${BADGE_COLORS[preset.badgeLabel] || "bg-muted text-muted-foreground"}`}
            >
              {preset.badgeLabel}
            </span>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Info */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-bold text-base">{preset.name}</h4>
              <span className="font-extrabold text-lg" style={{ color: preset.accentColor }}>
                {isFree ? "Free" : `£${preset.price.toFixed(2)}`}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{preset.description}</p>
          </div>

          {/* Colour swatch */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg border border-border/40" style={{ background: preset.accentColor }} />
            <div>
              <p className="text-xs font-medium">Accent Colour</p>
              <p className="text-xs text-muted-foreground font-mono">{preset.accentColor}</p>
            </div>
            <div className="text-xs text-muted-foreground ml-auto capitalize px-2 py-1 rounded-full bg-muted/30">
              {preset.colorScheme} theme
            </div>
          </div>

          {/* Trust badge */}
          {!isFree && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Secure payment via Stripe · Instant activation
            </div>
          )}

          {/* Action */}
          {owned || isFree ? (
            <div className="flex gap-2">
              {!owned && isFree && (
                <Button
                  className="flex-1 gap-2"
                  variant="outline"
                  onClick={onClaim}
                  data-testid="button-preview-claim"
                >
                  <Check className="w-4 h-4" /> Claim Free
                </Button>
              )}
              {canApply && (
                <Button
                  className="flex-1 gap-2"
                  style={active ? { background: "#ef4444" } : { background: preset.accentColor }}
                  onClick={onClose}
                  data-testid="button-preview-apply"
                >
                  {active ? "Deactivate from card" : <><Sparkles className="w-4 h-4" /> Activate from card</>}
                </Button>
              )}
              {!canApply && owned && (
                <Button className="flex-1" variant="outline" onClick={onClose}>Close</Button>
              )}
            </div>
          ) : (
            <Button
              className="w-full gap-2 font-semibold"
              style={{ background: preset.accentColor }}
              onClick={onBuy}
              data-testid="button-preview-buy"
            >
              <CreditCard className="w-4 h-4" />
              Buy for £{preset.price.toFixed(2)} — Instant Activation
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Props { serverId: number; }

export default function StorePresets({ serverId }: Props) {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [previewPreset, setPreviewPreset] = useState<StorePreset | null>(null);
  const [buyingId, setBuyingId] = useState<number | null>(null);

  const { data: presets = [], isLoading: presetsLoading } = useQuery<StorePreset[]>({
    queryKey: ["/api/presets"],
    queryFn: () => apiRequest("GET", "/api/presets").then(r => r.json()),
  });

  const { data: purchases = [], isLoading: purchasesLoading } = useQuery<(PresetPurchase & { preset: StorePreset })[]>({
    queryKey: ["/api/owners", user?.id, "preset-purchases"],
    queryFn: () => apiRequest("GET", `/api/owners/${user?.id}/preset-purchases`).then(r => r.json()),
    enabled: !!user?.id,
  });

  const { data: theme } = useQuery<any>({
    queryKey: ["/api/servers", serverId, "theme"],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/theme`).then(r => r.json()),
  });

  const purchasedIds = new Set(purchases.map(p => p.presetId));
  const activePresetId = theme?.activePresetId;

  // Free preset claim (no Stripe)
  const claimMutation = useMutation({
    mutationFn: (presetId: number) =>
      apiRequest("POST", `/api/owners/${user?.id}/preset-purchases`, { presetId, serverId }).then(async r => {
        if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Claim failed"); }
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/owners", user?.id, "preset-purchases"] });
      toast({ title: "Preset claimed!", description: "Activate it with the button below." });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  // Stripe checkout for paid presets
  const stripeMutation = useMutation({
    mutationFn: (presetId: number) =>
      apiRequest("POST", "/api/stripe/checkout", { presetId, serverId, ownerId: user?.id }).then(async r => {
        if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Checkout failed"); }
        return r.json();
      }),
    onSuccess: (data: { sessionId: string; url: string | null; demoMode?: boolean }) => {
      setBuyingId(null);
      if (data.demoMode || !data.url) {
        // Demo mode: simulate success redirect
        const params = new URLSearchParams({
          session_id: data.sessionId,
          serverId: String(serverId),
        });
        window.location.hash = `/preset-success?${params.toString()}`;
      } else {
        // Live Stripe — redirect to hosted checkout
        window.location.href = data.url;
      }
    },
    onError: (e: Error) => {
      setBuyingId(null);
      toast({ title: "Checkout failed", description: e.message, variant: "destructive" });
    },
  });

  const applyMutation = useMutation({
    mutationFn: (presetId: number | null) =>
      apiRequest("POST", `/api/servers/${serverId}/theme`, {
        ...(theme || {}),
        serverId,
        activePresetId: presetId,
        colorScheme: presetId
          ? (presets.find(p => p.id === presetId)?.colorScheme || theme?.colorScheme || "dark")
          : (theme?.colorScheme || "dark"),
        accentColor: presetId
          ? (presets.find(p => p.id === presetId)?.accentColor || theme?.accentColor || "#22c55e")
          : (theme?.accentColor || "#22c55e"),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "theme"] });
      toast({ title: "Preset applied!", description: "Your store now uses this preset." });
    },
    onError: () => toast({ title: "Apply failed", variant: "destructive" }),
  });

  const handleBuy = (preset: StorePreset) => {
    setPreviewPreset(null);
    setBuyingId(preset.id);
    stripeMutation.mutate(preset.id);
  };

  if (presetsLoading || purchasesLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h3 className="font-bold text-base mb-1">Store Presets</h3>
        <p className="text-sm text-muted-foreground">
          Buy animation and colour packs to make your store stand out. Click any preset to preview it live before purchasing.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {presets.map(preset => {
          const owned = purchasedIds.has(preset.id);
          const active = activePresetId === preset.id;
          const isFree = preset.price === 0;
          const isBuying = buyingId === preset.id && stripeMutation.isPending;
          const AnimIcon = ANIM_ICONS[preset.animationStyle] || Sparkles;

          return (
            <div
              key={preset.id}
              className="rounded-xl border overflow-hidden transition-all"
              style={{
                background: preset.gradientStart && preset.gradientEnd
                  ? `linear-gradient(135deg, ${preset.gradientEnd}44, ${preset.gradientStart}22)`
                  : "hsl(var(--card))",
                borderColor: active ? preset.accentColor + "80" : "hsl(var(--border) / 0.6)",
                boxShadow: active ? `0 0 16px ${preset.accentColor}30` : undefined,
              }}
              data-testid={`preset-card-${preset.id}`}
            >
              {/* Header strip */}
              <div
                className="h-16 flex items-center justify-center relative overflow-hidden cursor-pointer"
                style={{
                  background: preset.gradientStart && preset.gradientEnd
                    ? `linear-gradient(135deg, ${preset.gradientStart}, ${preset.gradientEnd})`
                    : preset.accentColor + "18",
                }}
                onClick={() => setPreviewPreset(preset)}
              >
                <AnimIcon className="w-7 h-7" style={{ color: preset.accentColor }} />
                {preset.glowColor && (
                  <div
                    className="absolute inset-0"
                    style={{ background: `radial-gradient(circle at 50% 50%, ${preset.glowColor}30, transparent 70%)` }}
                  />
                )}
                {preset.badgeLabel && (
                  <span
                    className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full font-bold border ${BADGE_COLORS[preset.badgeLabel] || "bg-muted text-muted-foreground"}`}
                  >
                    {preset.badgeLabel}
                  </span>
                )}
                {active && (
                  <span className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    ACTIVE
                  </span>
                )}
                {/* Preview hint */}
                <div
                  className="absolute bottom-1.5 right-2 flex items-center gap-1 text-xs opacity-60"
                  style={{ color: preset.accentColor }}
                >
                  <Eye className="w-3 h-3" /> Preview
                </div>
              </div>

              {/* Body */}
              <div className="p-4 space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-sm">{preset.name}</h4>
                    <span className="font-extrabold text-sm" style={{ color: preset.accentColor }}>
                      {isFree ? "Free" : `£${preset.price.toFixed(2)}`}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{preset.description}</p>
                </div>

                {/* Animation style badge */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AnimIcon className="w-3 h-3" />
                  <span className="capitalize">{preset.animationStyle.replace("_", " ")}</span>
                  <span className="w-1 h-1 rounded-full bg-current opacity-40 mx-0.5" />
                  <span className="capitalize">{preset.colorScheme} theme</span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {/* Preview button */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-xs px-2"
                    onClick={() => setPreviewPreset(preset)}
                    data-testid={`button-preview-preset-${preset.id}`}
                  >
                    <Eye className="w-3 h-3" /> Preview
                  </Button>

                  {owned || isFree ? (
                    <>
                      {!owned && isFree && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1.5 text-xs"
                          onClick={() => claimMutation.mutate(preset.id)}
                          disabled={claimMutation.isPending}
                          data-testid={`button-claim-preset-${preset.id}`}
                        >
                          <Check className="w-3 h-3" /> Claim Free
                        </Button>
                      )}
                      {(owned || isFree) && (
                        <Button
                          size="sm"
                          className="flex-1 gap-1.5 text-xs"
                          onClick={() => active ? applyMutation.mutate(null) : applyMutation.mutate(preset.id)}
                          disabled={applyMutation.isPending}
                          style={active ? { background: "#ef4444" } : { background: preset.accentColor }}
                          data-testid={`button-apply-preset-${preset.id}`}
                        >
                          {active ? "Deactivate" : <><Sparkles className="w-3 h-3" /> Activate</>}
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button
                      size="sm"
                      className="flex-1 gap-1.5 text-xs"
                      onClick={() => handleBuy(preset)}
                      disabled={isBuying || stripeMutation.isPending}
                      style={{ background: preset.accentColor }}
                      data-testid={`button-buy-preset-${preset.id}`}
                    >
                      {isBuying
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <><CreditCard className="w-3 h-3" /> Buy £{preset.price.toFixed(2)}</>}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Preview Modal */}
      {previewPreset && (
        <PresetPreviewModal
          preset={previewPreset}
          onClose={() => setPreviewPreset(null)}
          onBuy={() => handleBuy(previewPreset)}
          onClaim={() => { claimMutation.mutate(previewPreset.id); setPreviewPreset(null); }}
          owned={purchasedIds.has(previewPreset.id)}
          active={activePresetId === previewPreset.id}
          canApply={purchasedIds.has(previewPreset.id) || previewPreset.price === 0}
        />
      )}
    </div>
  );
}
