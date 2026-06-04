/**
 * StoreAppearance — embeddable panel used inside ServerDashboard's "Appearance" tab.
 * Lets server owners pick:
 *   - Layout (Grid / List / Featured)
 *   - Colour scheme (8 presets) + optional accent hex override
 *   - Category management (add / reorder / delete) + subcategories per category
 *   - Start page (All Items, Home, or a specific category)
 *   - Optional announcement banner text
 *   - Optional banner image URL
 *   - Welcome title + welcome text (shown as rich banner on storefront)
 *   - Fee mode: absorb (owner pays 20%) | passthrough (player pays 20% more)
 */
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  LayoutGrid, List, Star, Plus, Trash2, Save, Eye, Loader2, Upload,
  Palette, Type, ImageIcon, Megaphone, Home, DollarSign,
  ChevronDown, ChevronRight, MessageSquare, X, Globe, Server, Image, Layers, Timer
} from "lucide-react";
import type { StoreTheme } from "@shared/schema";

// ─── Colour schemes ───────────────────────────────────────────────────────────
export const COLOR_SCHEMES: {
  id: string; label: string; accent: string;
  bg: string; surface: string; text: string; badge: string;
}[] = [
  { id: "dark",    label: "Obsidian",  accent: "#22c55e", bg: "#0f1117", surface: "#1a1d25", text: "#e2e8f0", badge: "bg-slate-800 text-slate-200" },
  { id: "light",   label: "Daylight",  accent: "#16a34a", bg: "#f8fafc", surface: "#ffffff", text: "#1e293b", badge: "bg-slate-100 text-slate-700" },
  { id: "emerald", label: "Emerald",   accent: "#10b981", bg: "#022c22", surface: "#064e3b", text: "#d1fae5", badge: "bg-emerald-900 text-emerald-200" },
  { id: "purple",  label: "Amethyst",  accent: "#a78bfa", bg: "#0f0a1e", surface: "#1e1333", text: "#ede9fe", badge: "bg-purple-900 text-purple-200" },
  { id: "red",     label: "Nether",    accent: "#f87171", bg: "#1a0505", surface: "#2d0a0a", text: "#fee2e2", badge: "bg-red-900 text-red-200" },
  { id: "blue",    label: "Ocean",     accent: "#60a5fa", bg: "#030d1a", surface: "#0d2240", text: "#dbeafe", badge: "bg-blue-900 text-blue-200" },
  { id: "gold",    label: "Gold Rush", accent: "#fbbf24", bg: "#1a1200", surface: "#292100", text: "#fef3c7", badge: "bg-yellow-900 text-yellow-200" },
  { id: "rose",    label: "Cherry",    accent: "#fb7185", bg: "#1a0510", surface: "#2d0a1a", text: "#ffe4e6", badge: "bg-rose-900 text-rose-200" },
];

const LAYOUTS = [
  { id: "grid",     label: "Grid",       Icon: LayoutGrid, desc: "3-column card grid — most popular" },
  { id: "list",     label: "List",       Icon: List,       desc: "Full-width rows with detail" },
  { id: "featured", label: "Featured",   Icon: Star,       desc: "Hero banner + grid below" },
  { id: "donut",    label: "DonutSMP",   Icon: Layers,     desc: "Dark tiled cards + featured banner" },
  { id: "echo",     label: "ToeesSMP",   Icon: Star,       desc: "Hero banner + category cards + featured grid" },
];

interface ThemeForm {
  layout: string;
  colorScheme: string;
  accentColor: string;
  bannerUrl: string;
  startPage: string;
  announcementText: string;
  feeMode: string;
  welcomeTitle: string;
  welcomeText: string;
  countdownTitle: string;
  countdownSubtitle: string;
  countdownEnd: string;
  ownerMinecraftUsername: string;
  bannerImageUrl: string;
  bannerLinkUrl: string;
  bannerPosition: string;
  bannerFocalY: string;
}

interface ServerInfoForm {
  logoUrl: string;
  discordUrl: string;
  serverIp: string;
}

interface Props { serverId: number; }

export default function StoreAppearance({ serverId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newCategory, setNewCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<Record<string, string[]>>({});
  const [worlds, setWorlds] = useState<string[]>([]);
  const [newWorld, setNewWorld] = useState("");
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [newSubcat, setNewSubcat] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);

  // Server info state (logo, discord, IP — stored on servers table)
  const [serverInfo, setServerInfo] = useState<ServerInfoForm>({ logoUrl: "", discordUrl: "", serverIp: "" });
  const [logoUploading, setLogoUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [promoBannerUploading, setPromoBannerUploading] = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);
  const promoBannerFileRef = useRef<HTMLInputElement>(null);

  const { data: theme, isLoading } = useQuery<any>({
    queryKey: ["/api/servers", serverId, "theme"],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/theme`).then(r => r.json()),
  });

  const { data: serverData } = useQuery<any>({
    queryKey: ["/api/servers", serverId],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}`).then(r => r.json()),
  });

  useEffect(() => {
    if (!serverData) return;
    setServerInfo({
      logoUrl: serverData.logoUrl || "",
      discordUrl: serverData.discordUrl || "",
      serverIp: serverData.serverIp || "",
    });
  }, [serverData]);

  const { register, handleSubmit, control, watch, setValue, reset } = useForm<ThemeForm>({
    defaultValues: {
      layout: "echo", colorScheme: "dark", accentColor: "#22c55e",
      bannerUrl: "", startPage: "all", announcementText: "", feeMode: "absorb",
      welcomeTitle: "", welcomeText: "",
      countdownTitle: "", countdownSubtitle: "", countdownEnd: "", ownerMinecraftUsername: "",
      bannerImageUrl: "", bannerLinkUrl: "", bannerPosition: "top", bannerFocalY: "50%",
    },
  });

  useEffect(() => {
    if (!theme) return;
    reset({
      layout: theme.layout || "echo",
      colorScheme: theme.colorScheme || "dark",
      accentColor: theme.accentColor || "#22c55e",
      bannerUrl: theme.bannerUrl || "",
      startPage: theme.startPage || "all",
      announcementText: theme.announcementText || "",
      feeMode: theme.feeMode || "absorb",
      welcomeTitle: theme.welcomeTitle || "",
      welcomeText: theme.welcomeText || "",
      countdownTitle: (theme as any).countdownTitle || "",
      countdownSubtitle: (theme as any).countdownSubtitle || "",
      countdownEnd: (theme as any).countdownEnd ? (theme as any).countdownEnd.slice(0, 16) : "",
      ownerMinecraftUsername: (theme as any).ownerMinecraftUsername || "",
      bannerImageUrl: (theme as any).bannerImageUrl || "",
      bannerLinkUrl: (theme as any).bannerLinkUrl || "",
      bannerPosition: (theme as any).bannerPosition || "top",
      bannerFocalY: (theme as any).bannerFocalY || "50%",
    });
    try { setCategories(JSON.parse(theme.categories || "[]")); } catch { setCategories([]); }
    try { setSubcategories(JSON.parse(theme.subcategories || "{}")); } catch { setSubcategories({}); }
    try { setWorlds(JSON.parse((theme as any).worlds || "[]")); } catch { setWorlds([]); }
  }, [theme]);

  const selectedScheme = watch("colorScheme");
  const selectedLayout = watch("layout");
  const selectedFeeMode = watch("feeMode");
  const schemeData = COLOR_SCHEMES.find(s => s.id === selectedScheme) || COLOR_SCHEMES[0];

  // Build the deployed store URL for iframe preview
  const deployedBase = window.location.href.includes("localhost")
    ? window.location.origin
    : window.location.href.split("/#")[0];
  const previewUrl = `${deployedBase}/#/store/${serverId}`;

  const saveMutation = useMutation({
    mutationFn: (data: ThemeForm) =>
      apiRequest("POST", `/api/servers/${serverId}/theme`, {
        ...data,
        categories: JSON.stringify(categories),
        subcategories: JSON.stringify(subcategories),
        worlds: JSON.stringify(worlds),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "theme"] });
      toast({ title: "Appearance saved", description: "Your store looks updated immediately." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const saveServerInfoMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/servers/${serverId}`, {
        logoUrl: serverInfo.logoUrl || null,
        discordUrl: serverInfo.discordUrl || null,
        serverIp: serverInfo.serverIp || null,
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId] });
      toast({ title: "Server info saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" }); return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 2MB", variant: "destructive" }); return;
    }
    setLogoUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        const res = await apiRequest("POST", `/api/servers/${serverId}/upload-logo`, { dataUrl }).then(r => r.json());
        setServerInfo(p => ({ ...p, logoUrl: res.logoUrl }));
        qc.invalidateQueries({ queryKey: ["/api/servers", serverId] });
        toast({ title: "Logo uploaded" });
      } catch {
        toast({ title: "Upload failed", variant: "destructive" });
      } finally { setLogoUploading(false); }
    };
    reader.readAsDataURL(file);
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type === "video/mp4" || file.type === "video/webm";
    if (!isImage && !isVideo) {
      toast({ title: "Please select an image or MP4 video", variant: "destructive" }); return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 20MB", variant: "destructive" }); return;
    }
    setBannerUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        const res = await apiRequest("POST", "/api/upload-banner", { dataUrl }).then(r => r.json());
        setValue("bannerUrl", res.url);
        toast({ title: isVideo ? "Video banner uploaded" : "Banner uploaded" });
      } catch {
        toast({ title: "Upload failed", variant: "destructive" });
      } finally { setBannerUploading(false); }
    };
    reader.readAsDataURL(file);
  };

  const handlePromoBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type === "video/mp4" || file.type === "video/webm";
    if (!isImage && !isVideo) {
      toast({ title: "Please select an image or MP4 video", variant: "destructive" }); return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 20MB", variant: "destructive" }); return;
    }
    setPromoBannerUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        const res = await apiRequest("POST", "/api/upload-banner", { dataUrl }).then(r => r.json());
        setValue("bannerImageUrl", res.url);
        toast({ title: isVideo ? "Video banner uploaded" : "Banner uploaded" });
      } catch {
        toast({ title: "Upload failed", variant: "destructive" });
      } finally { setPromoBannerUploading(false); }
    };
    reader.readAsDataURL(file);
  };

  const addCategory = () => {
    const cat = newCategory.trim();
    if (!cat || categories.includes(cat)) return;
    setCategories([...categories, cat]);
    setNewCategory("");
  };
  const removeCategory = (cat: string) => {
    setCategories(categories.filter(c => c !== cat));
    setSubcategories(prev => { const copy = { ...prev }; delete copy[cat]; return copy; });
  };

  const addSubcat = (cat: string) => {
    const sub = (newSubcat[cat] || "").trim();
    if (!sub) return;
    const existing = subcategories[cat] || [];
    if (existing.includes(sub)) return;
    setSubcategories(prev => ({ ...prev, [cat]: [...existing, sub] }));
    setNewSubcat(prev => ({ ...prev, [cat]: "" }));
  };
  const removeSubcat = (cat: string, sub: string) => {
    setSubcategories(prev => ({ ...prev, [cat]: (prev[cat] || []).filter(s => s !== sub) }));
  };

  if (isLoading) return <div className="py-12 text-center text-muted-foreground text-sm">Loading appearance settings…</div>;

  return (
    <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-8 max-w-3xl">

      {/* ── Preview link ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
        <div>
          <p className="text-sm font-semibold">Preview your store</p>
          <p className="text-xs text-muted-foreground mt-0.5">See exactly what players will see</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setPreviewOpen(true)}
          data-testid="button-preview-store"
        >
          <Eye className="w-3.5 h-3.5" /> Preview
        </Button>
      </div>

      {/* Preview modal (iframe) */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl w-[95vw] p-0 overflow-hidden bg-background border-border/60" style={{ height: "85vh" }}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-card">
            <p className="text-sm font-semibold">Store Preview</p>
            <div className="flex items-center gap-2">
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
                data-testid="link-open-store-new-tab"
              >
                Open in new tab
              </a>
              <button onClick={() => setPreviewOpen(false)} className="rounded p-1 hover:bg-muted transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <iframe
            src={previewUrl}
            className="w-full"
            style={{ height: "calc(85vh - 44px)", border: "none" }}
            title="Store Preview"
            data-testid="iframe-store-preview"
          />
        </DialogContent>
      </Dialog>

      {/* ── Server Info: Logo, Discord, IP ────────────────────────────────── */}
      <Card className="bg-card border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Server Info</CardTitle>
          </div>
          <CardDescription>
            Add your logo, Discord invite, and server IP — shown to players in the storefront sidebar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Logo Upload */}
          <div>
            <Label className="flex items-center gap-1.5 mb-2"><Image className="w-3.5 h-3.5" /> Server Logo</Label>
            <div className="flex items-center gap-4">
              {/* Preview */}
              <div
                className="w-16 h-16 rounded-xl border-2 border-dashed border-border/60 flex items-center justify-center shrink-0 overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => logoFileRef.current?.click()}
                title="Click to upload logo"
                data-testid="logo-preview-area"
              >
                {serverInfo.logoUrl ? (
                  <img
                    src={serverInfo.logoUrl}
                    alt="Logo"
                    className="w-full h-full object-cover"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                ) : (
                  <Image className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => logoFileRef.current?.click()}
                  disabled={logoUploading}
                  data-testid="button-upload-logo"
                >
                  {logoUploading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                    : <><Image className="w-3.5 h-3.5" /> {serverInfo.logoUrl ? "Replace Logo" : "Upload Logo"}</>}
                </Button>
                {serverInfo.logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground text-xs h-7"
                    onClick={() => { setServerInfo(p => ({ ...p, logoUrl: "" })); saveServerInfoMutation.mutate(); }}
                  >
                    Remove logo
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">PNG, JPG, GIF · Max 2MB</p>
              </div>
            </div>
            {/* Hidden file input */}
            <input
              ref={logoFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
              data-testid="input-logo-file"
            />
          </div>
          {/* Discord */}
          <div>
            <Label className="flex items-center gap-1.5 mb-1.5">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" style={{ color: "#7289da" }}>
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
              </svg>
              Discord Invite URL
            </Label>
            <Input
              value={serverInfo.discordUrl}
              onChange={e => setServerInfo(p => ({ ...p, discordUrl: e.target.value }))}
              placeholder="https://discord.gg/your-server"
              data-testid="input-discord-url"
            />
          </div>
          {/* Server IP */}
          <div>
            <Label className="flex items-center gap-1.5 mb-1.5"><Server className="w-3.5 h-3.5" /> Minecraft Server IP</Label>
            <Input
              value={serverInfo.serverIp}
              onChange={e => setServerInfo(p => ({ ...p, serverIp: e.target.value }))}
              placeholder="play.yourserver.net"
              data-testid="input-server-ip"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => saveServerInfoMutation.mutate()}
            disabled={saveServerInfoMutation.isPending}
            data-testid="button-save-server-info"
          >
            {saveServerInfoMutation.isPending ? "Saving…" : <><Save className="w-3.5 h-3.5 mr-1.5" />Save Server Info</>}
          </Button>
        </CardContent>
      </Card>

      {/* ── Fee Mode ───────────────────────────────────────────────────────── */}
      <Card className="bg-card border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Platform Fee</CardTitle>
          </div>
          <CardDescription>
            CraftStore takes a 20% platform fee on all sales. Choose how this is handled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Controller
            name="feeMode"
            control={control}
            render={({ field }) => (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => field.onChange("absorb")}
                  data-testid="feemode-absorb"
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    field.value === "absorb" ? "border-primary bg-primary/10" : "border-border/60 bg-muted/20 hover:border-border"
                  }`}
                >
                  <p className="font-semibold text-sm mb-1">You absorb the fee</p>
                  <p className="text-xs text-muted-foreground">Players pay exactly your listed price. 20% of that goes to CraftStore, you keep 80%.</p>
                  <div className="mt-2 text-xs font-mono bg-muted/30 rounded px-2 py-1 w-fit">
                    Item £10 → You keep £8
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => field.onChange("passthrough")}
                  data-testid="feemode-passthrough"
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    field.value === "passthrough" ? "border-primary bg-primary/10" : "border-border/60 bg-muted/20 hover:border-border"
                  }`}
                >
                  <p className="font-semibold text-sm mb-1">Pass through to player</p>
                  <p className="text-xs text-muted-foreground">20% is added on top of your price at checkout. You receive your full listed price.</p>
                  <div className="mt-2 text-xs font-mono bg-muted/30 rounded px-2 py-1 w-fit">
                    Item £10 → Player pays £12
                  </div>
                </button>
              </div>
            )}
          />
        </CardContent>
      </Card>

      {/* ── Layout ─────────────────────────────────────────────────────────── */}
      <Card className="bg-card border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Layout</CardTitle>
          </div>
          <CardDescription>Choose how products are displayed to your players.</CardDescription>
        </CardHeader>
        <CardContent>
          <Controller
            name="layout"
            control={control}
            render={({ field }) => (
              <div className="grid grid-cols-3 gap-3">
                {LAYOUTS.map(({ id, label, Icon, desc }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => field.onChange(id)}
                    data-testid={`layout-option-${id}`}
                    className={`rounded-xl border-2 p-4 text-left transition-all ${
                      field.value === id
                        ? "border-primary bg-primary/10"
                        : "border-border/60 bg-muted/20 hover:border-border"
                    }`}
                  >
                    <Icon className={`w-6 h-6 mb-2 ${field.value === id ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="font-semibold text-sm">{label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                  </button>
                ))}
              </div>
            )}
          />
        </CardContent>
      </Card>

      {/* ── Colour Scheme ──────────────────────────────────────────────────── */}
      <Card className="bg-card border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Colour Scheme</CardTitle>
          </div>
          <CardDescription>Set the overall look and feel of your storefront.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Controller
            name="colorScheme"
            control={control}
            render={({ field }) => (
              <div className="grid grid-cols-4 gap-2">
                {COLOR_SCHEMES.map(scheme => (
                  <button
                    key={scheme.id}
                    type="button"
                    onClick={() => {
                      field.onChange(scheme.id);
                      setValue("accentColor", scheme.accent);
                    }}
                    data-testid={`scheme-option-${scheme.id}`}
                    className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                      field.value === scheme.id ? "border-primary" : "border-border/40 hover:border-border"
                    }`}
                    style={{ background: scheme.bg }}
                  >
                    <div className="p-3 space-y-1.5">
                      <div className="flex gap-1">
                        <div className="w-4 h-4 rounded" style={{ background: scheme.surface }} />
                        <div className="w-4 h-4 rounded" style={{ background: scheme.accent }} />
                      </div>
                      <div className="text-xs font-medium" style={{ color: scheme.text }}>{scheme.label}</div>
                    </div>
                    {field.value === scheme.id && (
                      <div className="absolute top-1.5 right-1.5 w-3 h-3 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}
          />

          <div className="flex items-center gap-3">
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs">Custom accent colour</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  className="w-8 h-8 rounded cursor-pointer border border-border/60 bg-transparent"
                  {...register("accentColor")}
                />
                <Input className="font-mono text-xs" {...register("accentColor")} />
              </div>
            </div>
            <div className="shrink-0 pt-5">
              <div
                className="px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: schemeData.bg, color: watch("accentColor") || schemeData.accent, border: `1px solid ${watch("accentColor") || schemeData.accent}40` }}
              >
                Preview
              </div>
            </div>
          </div>
        </CardContent>
      </Card>


      {/* ── Start Page      {/* ── Start Page ─────────────────────────────────────────────────────── */}
      <Card className="bg-card border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Home className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Start Page</CardTitle>
          </div>
          <CardDescription>Which page players land on when they open your store.</CardDescription>
        </CardHeader>
        <CardContent>
          <Controller
            name="startPage"
            control={control}
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {["home", "all", ...categories].map(page => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => field.onChange(page)}
                    data-testid={`startpage-option-${page}`}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      field.value === page
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {page === "home" ? "Store Home" : page === "all" ? "All Items" : page}
                  </button>
                ))}
              </div>
            )}
          />
          <p className="text-xs text-muted-foreground mt-2">
            "Store Home" shows your server info and category overview. "All Items" shows all products immediately.
          </p>
        </CardContent>
      </Card>

      {/* ── World Selector ───────────────────────────────────────────────── */}
      <Card className="bg-card border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-primary"><rect x="2" y="3" width="20" height="14" rx="3" /><path d="M8 21h8M12 17v4" /></svg>
            <CardTitle className="text-base">World Selector</CardTitle>
          </div>
          <CardDescription>Add your server's worlds. Players will see a selector on the store letting them filter items by world.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <input
              value={newWorld}
              onChange={e => setNewWorld(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const w = newWorld.trim(); if (w && !worlds.includes(w)) { setWorlds([...worlds, w]); setNewWorld(""); } } }}
              placeholder="e.g. SMP, Builderville, Creative…"
              className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => { const w = newWorld.trim(); if (w && !worlds.includes(w)) { setWorlds([...worlds, w]); setNewWorld(""); } }}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              Add World
            </button>
          </div>
          {worlds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {worlds.map(w => (
                <div key={w} className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 opacity-60"><rect x="2" y="3" width="20" height="14" rx="3" /><path d="M8 21h8M12 17v4" /></svg>
                  {w}
                  <button type="button" onClick={() => setWorlds(worlds.filter(x => x !== w))} className="ml-1 opacity-50 hover:opacity-100 transition-opacity">×</button>
                </div>
              ))}
            </div>
          )}
          {worlds.length === 0 && (
            <p className="text-xs text-muted-foreground">No worlds added yet. Add worlds to show a selector on your store.</p>
          )}
          <p className="text-xs text-muted-foreground">Worlds appear as cards above the shop. When a player picks one, only items tagged to that world (or untagged) are shown.</p>
        </CardContent>
      </Card>

      {/* ── Welcome Section ────────────────────────────────────────────────── */}
      <Card className="bg-card border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Welcome Section</CardTitle>
          </div>
          <CardDescription>
            A rich welcome banner shown at the top of your storefront, between the announcement strip and the products.
            Leave both fields blank to hide it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Welcome heading <span className="text-muted-foreground font-normal text-xs">(shown in large text, e.g. "Toee SMP")</span></Label>
            <Input
              placeholder={"e.g. Toee SMP"}
              {...register("welcomeTitle")}
              data-testid="input-welcome-title"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Welcome message <span className="text-muted-foreground font-normal text-xs">(shown as body text below the heading)</span></Label>
            <Textarea
              placeholder="e.g. Welcome to the official Toee SMP Store. To begin shopping, select a category above."
              rows={3}
              {...register("welcomeText")}
              data-testid="textarea-welcome-text"
            />
            <p className="text-xs text-muted-foreground">
              Shown as a styled welcome card on your storefront. Supports plain text only.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Countdown Banner ────────────────────────────────────────────── */}
      <Card className="bg-card border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Countdown Banner</CardTitle>
          </div>
          <CardDescription>
            Shows a full-width countdown strip at the top of your store with your skin and a live timer. Leave the end date blank to hide it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5" /> Countdown end date &amp; time
            </Label>
            <Input
              type="datetime-local"
              {...register("countdownEnd")}
            />
            <p className="text-xs text-muted-foreground">Set to a future date/time. The banner hides automatically when it expires.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Banner title</Label>
            <Input
              placeholder="e.g. SEASON 2 LAUNCHES IN"
              {...register("countdownTitle")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Banner subtitle</Label>
            <Input
              placeholder="e.g. Get ready for the biggest update yet!"
              {...register("countdownSubtitle")}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5" /> Your Minecraft username (for skin)
            </Label>
            <Input
              placeholder="e.g. ToeeOnTT"
              {...register("ownerMinecraftUsername")}
            />
            <p className="text-xs text-muted-foreground">Your Java username — this skin appears in the countdown banner.</p>
          </div>
        </CardContent>
      </Card>

      {/* ── Promotional Banner ──────────────────────────────────────────────── */}
      <Card className="bg-card border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Promotional Banner</CardTitle>
          </div>
          <CardDescription>A clickable image banner shown at the top of your store home page — great for events, sales, or announcements.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Banner image</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                disabled={promoBannerUploading}
                onClick={() => promoBannerFileRef.current?.click()}
              >
                {promoBannerUploading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                  : <><Upload className="w-3.5 h-3.5" /> Upload Image / Video</>}
              </Button>
              <Input placeholder="…or paste image URL" {...register("bannerImageUrl")} />
            </div>
            <p className="text-xs text-muted-foreground">Recommended size: 1200×300px. Supports images or MP4 video (max 20MB). Leave blank to hide.</p>
          </div>
          {watch("bannerImageUrl") && (() => {
            const isVid = watch("bannerImageUrl").startsWith("data:video/") || watch("bannerImageUrl").endsWith(".mp4") || watch("bannerImageUrl").endsWith(".webm");
            const focalY = watch("bannerFocalY") || "50%";
            const focalPct = parseFloat(focalY);
            const accent = watch("accentColor") || "#22c55e";
            return (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7-7 7 7M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Drag to reposition — this is exactly how it looks in your store
                </p>
                {/* ── Exact replica of EchoLayout hero card ── */}
                <div className="rounded-2xl overflow-hidden select-none" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#0a0a0a" }}>
                  {/* Top area: 180px, draggable */}
                  <div
                    className="relative w-full overflow-hidden group"
                    style={{ height: 240, cursor: "ns-resize" }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const startY = e.clientY;
                      const startPct = focalPct;
                      const onMove = (mv: MouseEvent) => {
                        const deltaY = mv.clientY - startY;
                        const newPct = Math.min(100, Math.max(0, startPct + (deltaY / rect.height) * 100));
                        setValue("bannerFocalY", `${Math.round(newPct)}%`);
                      };
                      const onUp = () => {
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", onUp);
                      };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", onUp);
                    }}
                  >
                    {isVid ? (() => {
                      const vRef = (el: HTMLVideoElement | null) => { if (el) { el.muted = true; el.play().catch(() => {}); } };
                      return <video ref={vRef} src={watch("bannerImageUrl")} autoPlay loop muted playsInline
                        className="w-full h-full" style={{ objectFit: "cover", objectPosition: `center ${focalY}`, display: "block" }} />;
                    })() : (
                      <img src={watch("bannerImageUrl")} alt="Banner preview"
                        className="w-full h-full" style={{ objectFit: "cover", objectPosition: `center ${focalY}` }} />
                    )}
                    {/* Drag hint overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 5v14M5 12l7-7 7 7M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <span className="text-xs font-semibold text-white">Drag up / down</span>
                      </div>
                    </div>
                    {/* Clear button */}
                    <button type="button" onClick={() => setValue("bannerImageUrl", "")}
                      className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Sub-bar replica */}
                  <div className="flex items-center px-5 py-3" style={{ background: "#13161c", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0"
                        style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}30` }}>
                        {serverInfo.logoUrl
                          ? <img src={serverInfo.logoUrl} alt="logo" className="w-7 h-7 object-contain rounded" />
                          : "TO"}
                      </div>
                      <div>
                        <p className="font-bold text-white text-sm leading-none">Toee SMP</p>
                        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.38)" }}>Welcome to our store!</p>
                      </div>
                    </div>
                    <div className="rounded-xl px-4 py-2 text-xs font-extrabold text-white" style={{ background: accent }}>Login</div>
                  </div>
                </div>
              </div>
            );
          })()}
          <input
            ref={promoBannerFileRef}
            type="file"
            accept="image/*,video/mp4,video/webm"
            className="hidden"
            onChange={handlePromoBannerUpload}
          />
          <div className="space-y-1.5">
            <Label>Click-through URL (optional)</Label>
            <Input placeholder="https://discord.gg/yourserver" {...register("bannerLinkUrl")} />
            <p className="text-xs text-muted-foreground">Where players go when they click the banner. Leave blank to make it non-clickable.</p>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Banner position</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "top", label: "Top of page", desc: "Above everything" },
                { value: "below-countdown", label: "Below countdown", desc: "After the timer strip" },
                { value: "below-welcome", label: "Below welcome", desc: "After the welcome card" },
                { value: "below-featured", label: "Below featured", desc: "After featured packages" },
                { value: "above-categories", label: "Above categories", desc: "Just before category list" },
                { value: "bottom", label: "Bottom of page", desc: "Below all products" },
              ].map(opt => {
                const selected = watch("bannerPosition") === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setValue("bannerPosition", opt.value)}
                    className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/50 bg-card hover:border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <p className={`text-xs font-semibold ${selected ? "text-primary" : ""}`}>{opt.label}</p>
                    <p className="text-[11px] opacity-60 mt-0.5">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Banner & Announcement ──────────────────────────────────────────── */}
      <Card className="bg-card border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Banner & Announcement</CardTitle>
          </div>
          <CardDescription>Optional hero banner image and announcement strip shown at the top of your store.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" /> Banner image</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                disabled={bannerUploading}
                onClick={() => bannerFileRef.current?.click()}
              >
                {bannerUploading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                  : <><Upload className="w-3.5 h-3.5" /> Upload Image / Video</>}
              </Button>
              <Input placeholder="…or paste image URL" {...register("bannerUrl")} />
            </div>
            {watch("bannerUrl") && (
              <div className="rounded-xl overflow-hidden border border-border/40 relative group mt-2">
                {watch("bannerUrl").startsWith("data:video/") || watch("bannerUrl").endsWith(".mp4") ? (
                  <video ref={(el) => { if (el) { el.muted = true; el.play().catch(() => {}); } }} src={watch("bannerUrl")} autoPlay loop muted playsInline className="w-full object-cover" style={{ maxHeight: 120 }} />
                ) : (
                  <img src={watch("bannerUrl")} alt="Banner preview" className="w-full object-cover" style={{ maxHeight: 120 }} />
                )}
                <button
                  type="button"
                  onClick={() => setValue("bannerUrl", "")}
                  className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <input
              ref={bannerFileRef}
              type="file"
              accept="image/*,video/mp4,video/webm"
              className="hidden"
              onChange={handleBannerUpload}
            />
            <p className="text-xs text-muted-foreground">Shown as the hero image on your store card. Supports images or MP4 video (max 20MB). Leave blank to show the default icon.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Announcement text</Label>
            <Textarea
              placeholder="e.g. 🎉 Double XP weekend — 20% off all ranks!"
              rows={2}
              {...register("announcementText")}
            />
            <p className="text-xs text-muted-foreground">Shown as a highlighted strip at the top of your store. Leave blank to hide it.</p>
          </div>
        </CardContent>
      </Card>

      {/* ── Save ───────────────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <Button
          type="submit"
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 px-8"
          disabled={saveMutation.isPending}
          data-testid="button-save-appearance"
        >
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? "Saving…" : "Save appearance"}
        </Button>
      </div>
    </form>
  );
}
