import { useState, useEffect, useRef } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useAuthStore } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft, Plus, Trash2, ExternalLink, Package, Users, ShoppingCart,
  BarChart3, Terminal, Copy, Edit3, TrendingUp, DollarSign, Paintbrush, Sparkles, Star,
  ChevronRight, Loader2, Gift, Globe, CheckCircle2, CreditCard, XCircle, AlertCircle,
  Activity, Tag, Percent, PlusCircle, CheckCircle2 as Check2, X, Link2
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import StoreAppearance from "./StoreAppearance";
import StorePresets from "./StorePresets";
import type { Product, Member, Order, Server } from "@shared/schema";

// ─── Command Placeholder Picker ──────────────────────────────────────────────
const COMMAND_PLACEHOLDERS = [
  { tag: "{player}",        label: "Player",         desc: "Buyer's Minecraft username",           color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  { tag: "{displayname}",  label: "Display Name",   desc: "Buyer's display name / nickname",      color: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  { tag: "{uuid}",         label: "UUID",            desc: "Buyer's Minecraft UUID",               color: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  { tag: "{product}",      label: "Product",         desc: "Name of the purchased product",        color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { tag: "{price}",        label: "Price",           desc: "Amount paid (e.g. 4.99)",              color: "bg-green-500/15 text-green-400 border-green-500/30" },
  { tag: "{currency}",     label: "Currency",        desc: "Currency code (e.g. GBP)",             color: "bg-green-500/15 text-green-400 border-green-500/30" },
  { tag: "{order_id}",     label: "Order ID",        desc: "Unique order reference number",        color: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  { tag: "{date}",         label: "Date",            desc: "Purchase date (YYYY-MM-DD)",           color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { tag: "{time}",         label: "Time",            desc: "Purchase time (HH:MM)",               color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { tag: "{server}",       label: "Server",          desc: "Your server's name",                  color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  { tag: "{quantity}",     label: "Quantity",        desc: "Number of items purchased",            color: "bg-pink-500/15 text-pink-400 border-pink-500/30" },
  { tag: "{&c}",           label: "&c Red",          desc: "Chat colour: Red",                    color: "bg-red-500/15 text-red-400 border-red-500/30" },
  { tag: "{&a}",           label: "&a Green",        desc: "Chat colour: Green",                  color: "bg-green-500/15 text-green-400 border-green-500/30" },
  { tag: "{&b}",           label: "&b Aqua",         desc: "Chat colour: Aqua",                   color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  { tag: "{&e}",           label: "&e Yellow",       desc: "Chat colour: Yellow",                 color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  { tag: "{&6}",           label: "&6 Gold",         desc: "Chat colour: Gold",                   color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { tag: "{&d}",           label: "&d Pink",         desc: "Chat colour: Pink / Light Purple",    color: "bg-pink-500/15 text-pink-400 border-pink-500/30" },
  { tag: "{&5}",           label: "&5 Purple",       desc: "Chat colour: Dark Purple",            color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  { tag: "{&9}",           label: "&9 Blue",         desc: "Chat colour: Blue",                   color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  { tag: "{&f}",           label: "&f White",        desc: "Chat colour: White",                  color: "bg-slate-200/15 text-slate-300 border-slate-400/30" },
  { tag: "{&0}",           label: "&0 Black",        desc: "Chat colour: Black",                  color: "bg-slate-900/40 text-slate-400 border-slate-600/30" },
  { tag: "{&l}",           label: "&l Bold",         desc: "Chat format: Bold",                   color: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  { tag: "{&o}",           label: "&o Italic",       desc: "Chat format: Italic",                 color: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  { tag: "{&n}",           label: "&n Underline",    desc: "Chat format: Underline",              color: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  { tag: "{&r}",           label: "&r Reset",        desc: "Chat format: Reset formatting",       color: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
];

function CommandTextarea({ value, onChange, rows = 4, placeholder, dataTestId }: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  dataTestId?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [show, setShow] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = query
    ? COMMAND_PLACEHOLDERS.filter(p =>
        p.label.toLowerCase().includes(query.toLowerCase()) ||
        p.tag.toLowerCase().includes(query.toLowerCase()) ||
        p.desc.toLowerCase().includes(query.toLowerCase())
      )
    : COMMAND_PLACEHOLDERS;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") { setShow(false); setQuery(""); }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    onChange(v);
    // find the last { before the cursor that isn't already closed
    const cursor = e.target.selectionStart ?? v.length;
    const before = v.slice(0, cursor);
    const lastOpen = before.lastIndexOf("{");
    const lastClose = before.lastIndexOf("}");
    if (lastOpen !== -1 && lastOpen > lastClose) {
      setQuery(before.slice(lastOpen + 1));
      setShow(true);
    } else {
      setShow(false);
      setQuery("");
    }
  }

  function insert(tag: string) {
    const el = ref.current;
    if (!el) return;
    const cursor = el.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const after = value.slice(cursor);
    const lastOpen = before.lastIndexOf("{");
    const newBefore = lastOpen !== -1 ? before.slice(0, lastOpen) : before;
    const newValue = newBefore + tag + after;
    onChange(newValue);
    setShow(false);
    setQuery("");
    // restore focus + move cursor after tag
    setTimeout(() => {
      el.focus();
      const pos = newBefore.length + tag.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={rows}
        placeholder={placeholder}
        data-testid={dataTestId}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
      />
      {show && (
        <div className="absolute z-50 left-0 top-full mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl p-2 space-y-0.5">
          <p className="text-[10px] text-muted-foreground px-1 pb-1 font-medium tracking-wide uppercase">Placeholders — click to insert</p>
          {filtered.map(p => (
            <button
              key={p.tag}
              type="button"
              onClick={() => insert(p.tag)}
              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted text-left transition-colors"
            >
              <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${p.color}`}>{p.tag}</span>
              <span className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-foreground leading-tight">{p.label}</span>
                <span className="text-[10px] text-muted-foreground leading-tight truncate">{p.desc}</span>
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-2">No matching placeholders</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stripe Connect Panel ────────────────────────────────────────────────────
function StripeConnectPanel({ serverId, server }: { serverId: number; server: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: connectData, isLoading } = useQuery<{ status: string; accountId: string | null }>({
    queryKey: ["/api/connect/status", serverId],
    queryFn: () => apiRequest("GET", `/api/connect/status/${serverId}`).then(r => r.json()),
    refetchInterval: 8000,
  });

  const onboardMutation = useMutation({
    mutationFn: () => {
      if (!server?.ownerId) throw new Error("Server not loaded yet, please try again");
      return apiRequest("POST", "/api/connect/onboard", { serverId, ownerId: server.ownerId }).then(r => r.json());
    },
    onSuccess: (data) => {
      if (data.demoMode) {
        toast({ title: "Demo mode", description: "Stripe Connect simulated. Add STRIPE_SECRET_KEY on Render for live payments." });
        queryClient.invalidateQueries({ queryKey: ["/api/connect/status", serverId] });
      } else if (data.url) {
        window.open(data.url, "_blank");
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/connect/disconnect", { serverId }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Disconnected", description: "Stripe account unlinked from this server." });
      queryClient.invalidateQueries({ queryKey: ["/api/connect/status", serverId] });
    },
  });

  const status = connectData?.status || "not_connected";

  const statusBadge = {
    active: <Badge className="bg-green-500/15 text-green-400 border-green-500/30 gap-1"><CheckCircle2 className="w-3 h-3" /> Connected</Badge>,
    pending: <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Pending</Badge>,
    not_connected: <Badge className="bg-muted text-muted-foreground gap-1"><XCircle className="w-3 h-3" /> Not Connected</Badge>,
  }[status] ?? null;

  return (
    <div className="max-w-xl space-y-6">
      {/* Header */}
      <Card className="bg-card border-border/60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Stripe Connect
              </CardTitle>
              <CardDescription className="mt-1">
                Connect your Stripe account so members' top-ups go directly to you — CraftStore automatically keeps 20%.
              </CardDescription>
            </div>
            {!isLoading && statusBadge}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Checking status…</div>
          ) : status === "active" ? (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <p className="text-sm font-medium text-green-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Payments are live
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Every player top-up is automatically split: <strong className="text-foreground">80% to you</strong>, 20% platform fee to CraftStore.
                </p>
                {connectData?.accountId && (
                  <p className="text-xs text-muted-foreground mt-1 font-mono">Account: {connectData.accountId}</p>
                )}
              </div>
              <Button
                variant="outline" size="sm"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                data-testid="button-disconnect-stripe"
              >
                {disconnectMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <XCircle className="w-3.5 h-3.5 mr-2" />}
                Disconnect Stripe Account
              </Button>
            </div>
          ) : status === "pending" ? (
            <div className="space-y-4">
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                <p className="text-sm font-medium text-yellow-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Onboarding in progress
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Finish setting up your Stripe account to start receiving payments. Once approved, this page will update automatically.
                </p>
              </div>
              <Button
                size="sm" onClick={() => onboardMutation.mutate()}
                disabled={onboardMutation.isPending}
                data-testid="button-resume-stripe"
              >
                {onboardMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <CreditCard className="w-3.5 h-3.5 mr-2" />}
                Resume Stripe Setup
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-muted/40 rounded-lg p-4 text-sm text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">How it works</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Click Connect below — you'll be taken to Stripe to set up a free Express account (takes ~2 mins)</li>
                  <li>Once approved, member top-ups automatically go to your Stripe account</li>
                  <li>CraftStore keeps 20% as a platform fee — no manual invoicing needed</li>
                </ol>
              </div>
              <Button
                onClick={() => onboardMutation.mutate()}
                disabled={onboardMutation.isPending}
                className="gap-2"
                data-testid="button-connect-stripe"
              >
                {onboardMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                Connect with Stripe
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Earnings summary card */}
      {status === "active" && (
        <Card className="bg-card border-border/60">
          <CardHeader><CardTitle className="text-base">Your Earnings</CardTitle></CardHeader>
          <CardContent>
            <EarningsSummary serverId={serverId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EarningsSummary({ serverId }: { serverId: number }) {
  const { data: orders } = useQuery<any[]>({
    queryKey: ["/api/servers", serverId, "orders"],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/orders`).then(r => r.json()),
  });
  if (!orders) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const completed = orders.filter(o => o.status === "completed");
  const gross = completed.reduce((s: number, o: any) => s + o.amount, 0);
  const fees = completed.reduce((s: number, o: any) => s + (o.platformFee || gross * 0.2), 0);
  const net = gross - fees;
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="text-center">
        <p className="text-xl font-bold">£{gross.toFixed(2)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Gross Revenue</p>
      </div>
      <div className="text-center">
        <p className="text-xl font-bold text-red-400">-£{fees.toFixed(2)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Platform Fee (20%)</p>
      </div>
      <div className="text-center">
        <p className="text-xl font-bold text-green-400">£{net.toFixed(2)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Your Payout</p>
      </div>
    </div>
  );
}

// ─── MinecraftItemBrowser ─────────────────────────────────────────────────────
type McItem = { readable: string; id: string; texture: string };
const MC_ITEMS_URL = "https://unpkg.com/minecraft-textures/dist/textures/json/1.21.json";
let _mcItemsCache: McItem[] | null = null;
let _mcItemsPromise: Promise<McItem[]> | null = null;
function loadMcItems(): Promise<McItem[]> {
  if (_mcItemsCache) return Promise.resolve(_mcItemsCache);
  if (_mcItemsPromise) return _mcItemsPromise;
  _mcItemsPromise = fetch(MC_ITEMS_URL)
    .then(r => r.json())
    .then(data => { _mcItemsCache = data.items || []; return _mcItemsCache!; });
  return _mcItemsPromise;
}

function MinecraftItemBrowser({ onSelect }: { onSelect: (texture: string, name: string) => void }) {
  const [items, setItems] = useState<McItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    loadMcItems().then(its => { setItems(its); setLoading(false); });
  }, []);

  const filtered = search.trim()
    ? items.filter(i => i.readable.toLowerCase().includes(search.toLowerCase()) || i.id.includes(search.toLowerCase()))
    : items;

  // Only render first 120 items unless searching (keeps it snappy)
  const visible = filtered.slice(0, search.trim() ? 300 : 120);

  return (
    <div className="space-y-2">
      <Input
        placeholder="Search items e.g. Diamond Sword, Beacon…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="text-sm"
      />
      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div
            className="grid gap-1 rounded-xl border border-border/60 bg-muted/10 p-2 overflow-y-auto"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(48px, 1fr))", maxHeight: 240 }}
          >
            {visible.map(item => (
              <button
                key={item.id}
                type="button"
                title={item.readable}
                onClick={() => { setSelected(item.id); onSelect(item.texture, item.readable); }}
                className={`aspect-square rounded-lg flex items-center justify-center transition-all hover:scale-110 ${
                  selected === item.id ? "ring-2 ring-primary bg-primary/10" : "hover:bg-muted/60"
                }`}
              >
                <img
                  src={item.texture}
                  alt={item.readable}
                  className="w-8 h-8"
                  style={{ imageRendering: "pixelated" }}
                />
              </button>
            ))}
          </div>
          {!search.trim() && filtered.length > 120 && (
            <p className="text-xs text-muted-foreground text-center">Showing 120 of {filtered.length} — search to filter</p>
          )}
          {search.trim() && filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No items match "{search}"</p>
          )}
        </>
      )}
    </div>
  );
}

// ─── ProductImagePicker ──────────────────────────────────────────────────────
function ProductImagePicker({
  imageType, setImageType,
  imageUrl, setImageUrl,
  playerHeadName, setPlayerHeadName,
}: {
  imageType: string; setImageType: (v: string) => void;
  imageUrl: string; setImageUrl: (v: string) => void;
  playerHeadName: string; setPlayerHeadName: (v: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>(imageUrl || "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("Image must be under 2MB"); return; }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        const res = await fetch("/api/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
        const json = await res.json();
        setImageUrl(json.url);
        setPreviewUrl(json.url);
      } catch { alert("Upload failed"); }
      finally { setUploading(false); }
    };
    reader.readAsDataURL(file);
  };

  const tabs = [
    { key: "upload", label: "Upload" },
    { key: "playerhead", label: "Player Head" },
    { key: "mcitem", label: "MC Item" },
    { key: "custom", label: "URL" },
  ];

  // nmsr.nickac.dev/head/ — 3D rendered player head
  const headPreviewUrl = playerHeadName
    ? `https://nmsr.nickac.dev/head/${encodeURIComponent(playerHeadName)}`
    : null;

  return (
    <div className="space-y-2.5">
      <Label className="text-sm font-semibold">Product Image</Label>

      {/* Tab switcher */}
      <div className="flex rounded-lg overflow-hidden border border-border/60 bg-muted/30">
        {tabs.map(t => (
          <button key={t.key} type="button"
            className={`flex-1 py-2 text-xs font-medium transition-all ${
              imageType === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
            onClick={() => setImageType(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {imageType === "upload" && (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          <div
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border/60 rounded-xl py-6 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : previewUrl ? (
              <img src={previewUrl} alt="preview" className="w-20 h-20 object-contain rounded-lg" />
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center">
                  <Package className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">Click to upload</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 2MB</p>
                </div>
              </>
            )}
          </div>
          {previewUrl && (
            <button type="button" onClick={() => { setPreviewUrl(""); setImageUrl(""); }}
              className="text-xs text-destructive hover:underline w-full text-center">Remove image</button>
          )}
        </div>
      )}

      {imageType === "playerhead" && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-muted/20">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {headPreviewUrl ? (
              <img
                key={playerHeadName}
                src={headPreviewUrl}
                alt={playerHeadName}
                className="w-full h-full object-contain"
                style={{ imageRendering: "pixelated" }}
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <span className="text-2xl">&#x1F464;</span>
            )}
          </div>
          <div className="flex-1 space-y-1.5">
            <Input
              placeholder="Minecraft username e.g. Notch"
              value={playerHeadName}
              onChange={e => setPlayerHeadName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Enter any Java username — their head appears on your store</p>
          </div>
        </div>
      )}

      {imageType === "mcitem" && (
        <div className="space-y-2">
          {imageUrl && imageUrl.startsWith("data:image") && (
            <div className="flex items-center gap-3 p-2.5 rounded-xl border border-primary/30 bg-primary/5">
              <img src={imageUrl} alt="selected" className="w-10 h-10" style={{ imageRendering: "pixelated" }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-primary">Item selected</p>
                <p className="text-xs text-muted-foreground truncate">{(imageUrl as any)._name || "Minecraft item"}</p>
              </div>
              <button type="button" onClick={() => setImageUrl("")}
                className="text-xs text-muted-foreground hover:text-destructive">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          )}
          <MinecraftItemBrowser onSelect={(texture) => {
            setImageUrl(texture);
            setPreviewUrl(texture);
          }} />
        </div>
      )}

      {imageType === "custom" && (
        <div className="space-y-2">
          <Input
            placeholder="https://example.com/image.png"
            value={imageUrl}
            onChange={e => { setImageUrl(e.target.value); setPreviewUrl(e.target.value); }}
          />
          {previewUrl && (
            <div className="flex justify-center p-2 rounded-xl border border-border/60 bg-muted/20">
              <img src={previewUrl} alt="preview" className="h-20 object-contain rounded" onError={e => (e.target as HTMLImageElement).style.display="none"} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ProductForm {
  name: string; description: string; price: number;
  command: string; category: string; stock: number; imageUrl: string;
  imageType: string; playerHeadName: string; enchanted: boolean; featured: boolean; preorder: boolean; preorderReleaseDate: string; purchaseType: string; expiryCommands: string;
}
interface MemberForm { minecraftUsername: string; email: string; balance: number; }

interface MemberStats {
  member: { id: number; minecraftUsername: string; email: string | null; balance: number; createdAt: string };
  orders: { id: number; productId: number; productName: string; amount: number; status: string; createdAt: string }[];
  totalSpent: number;
  orderCount: number;
}

function MemberStatsPanel({ serverId, username, onClose }: {
  serverId: number; username: string; onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery<MemberStats>({
    queryKey: ["/api/servers", serverId, "members", username, "stats"],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/members/${username}/stats`).then(r => r.json()),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border/60 max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Member: <span className="font-mono text-primary">{username}</span>
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        )}
        {error && (
          <p className="text-destructive text-sm py-4 text-center">Failed to load member stats.</p>
        )}
        {data && (
          <div className="space-y-5">
            {/* Stats summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-center">
                <p className="text-xl font-extrabold text-primary">£{data.totalSpent.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total Spent</p>
              </div>
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-center">
                <p className="text-xl font-extrabold text-primary">{data.orderCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Orders</p>
              </div>
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-center">
                <p className="text-xl font-extrabold text-primary">£{data.member.balance.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Balance</p>
              </div>
            </div>

            {/* Member info */}
            <div className="rounded-xl bg-muted/20 border border-border/40 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Username</span>
                <span className="font-mono font-semibold">{data.member.minecraftUsername}</span>
              </div>
              {data.member.email && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span>{data.member.email}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Joined</span>
                <span>{new Date(data.member.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Order history */}
            <div>
              <h4 className="font-semibold text-sm mb-2">Order History ({data.orders.length})</h4>
              {data.orders.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No orders yet.</p>
              ) : (
                <ScrollArea className="h-52 rounded-xl border border-border/40 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/40 hover:bg-transparent">
                        <TableHead className="text-xs">Product</TableHead>
                        <TableHead className="text-xs">Amount</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.orders.map(o => (
                        <TableRow key={o.id} className="border-border/40" data-testid={`row-member-order-${o.id}`}>
                          <TableCell className="text-xs font-medium">{o.productName || `Product #${o.productId}`}</TableCell>
                          <TableCell className="text-xs font-semibold text-primary">£{o.amount.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge className={`text-xs border ${o.status === "completed" ? "status-completed" : o.status === "pending" ? "status-pending" : "status-failed"}`}>
                              {o.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ icon: Icon, label, value, sub }: any) {
  return (
    <Card className="stat-bar bg-card border-border/60">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</span>
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ─── Domain Tab ────────────────────────────────────────────────────────────────────
function nameToSlug(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function DomainTab({ server }: { serverId: number; server?: any }) {
  const ROOT_DOMAIN = "craftstore.org.uk";
  const slug = server?.name ? nameToSlug(server.name) : "";
  const autoUrl = slug ? `https://${slug}.${ROOT_DOMAIN}` : null;
  const { toast } = useToast();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="font-semibold">Your Store Domain</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Your store automatically gets a free subdomain based on your server name.
        </p>
      </div>

      <Card className="bg-primary/5 border-primary/30">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Free Subdomain — Always Active</p>
              <p className="text-xs text-muted-foreground mt-0.5">Automatically generated from your server name</p>
            </div>
          </div>
          {autoUrl ? (
            <div className="rounded-lg bg-background/60 border border-primary/20 px-4 py-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary shrink-0" />
              <span className="font-mono text-sm text-primary flex-1">{autoUrl}</span>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { navigator.clipboard.writeText(autoUrl); toast({ title: "Copied!" }); }}>
                Copy
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}
          <p className="text-xs text-muted-foreground">
            Make sure your DNS has a wildcard CNAME: <span className="font-mono text-foreground">* → craftstore-s1xb.onrender.com</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}


function TestWebhookPanel({ serverId, hasWebhookUrl }: { serverId: number; hasWebhookUrl: boolean }) {
  const { toast } = useToast();
  const [username, setUsername] = useState("TestPlayer");
  const [command, setCommand] = useState("say CraftStore webhook working!");
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const testMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/servers/${serverId}/test-webhook`, { minecraftUsername: username, command }).then(r => r.json()),
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="border border-border/60 rounded-lg p-4 space-y-3">
      <p className="text-sm font-medium flex items-center gap-2"><Terminal className="w-4 h-4 text-primary" /> Test Webhook</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Minecraft Username</Label>
          <Input value={username} onChange={e => setUsername(e.target.value)} className="mt-1 text-xs font-mono h-8" />
        </div>
        <div>
          <Label className="text-xs">Command to run</Label>
          <Input value={command} onChange={e => setCommand(e.target.value)} className="mt-1 text-xs font-mono h-8" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => { setResult(null); testMutation.mutate(); }} disabled={testMutation.isPending || !hasWebhookUrl}>
          {testMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Sending...</> : "Send Test"}
        </Button>
        {!hasWebhookUrl && <p className="text-xs text-muted-foreground">Save a Webhook URL above first</p>}
      </div>
      {result && (
        <div className={`text-xs rounded-md px-3 py-2 font-mono ${
          result.success ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
        }`}>
          {result.success ? "✓" : "✗"} {result.message}
        </div>
      )}
    </div>
  );
}

function WebhookSecretEditor({ serverId, currentSecret, currentWebhookUrl }: { serverId: number; currentSecret: string; currentWebhookUrl: string }) {
  const [secret, setSecret] = useState(currentSecret);
  const [webhookUrl, setWebhookUrl] = useState(currentWebhookUrl);
  const [saved, setSaved] = useState(false);
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/servers/${serverId}`, { webhookSecret: secret, webhookUrl }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers", serverId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>Webhook URL</Label>
        <div className="flex gap-2 mt-1.5">
          <Input
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
            placeholder="http://YOUR_SERVER_IP:8123/craftstore/webhook"
            className="font-mono text-xs"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">The URL CraftStore will POST purchase events to. Replace YOUR_SERVER_IP with your Minecraft server's IP address.</p>
      </div>
      <div>
        <Label>Webhook Secret</Label>
        <div className="flex gap-2 mt-1.5">
          <Input
            value={secret}
            onChange={e => setSecret(e.target.value)}
            placeholder="Enter a secret key e.g. mysecret123"
            className="font-mono text-xs"
          />
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(secret); }}>
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">Must match the webhook-secret in your plugin config.yml.</p>
      </div>
      <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saved ? "Saved!" : saveMutation.isPending ? "Saving..." : "Save Webhook Settings"}
      </Button>
    </div>
  );
}

// ─── Bedrock Settings ────────────────────────────────────────────────────────
function BedrockSettings({ serverId, server }: { serverId: number; server?: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(server?.bedrockEnabled ?? false);
  const [prefix, setPrefix] = useState(server?.bedrockPrefix ?? "none");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (server) { setEnabled(server.bedrockEnabled); setPrefix(server.bedrockPrefix ?? "none"); }
  }, [server]);

  const save = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/servers/${serverId}`, { bedrockEnabled: enabled, bedrockPrefix: prefix, bedrockReplaceSpaces: replaceSpaces }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId] });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
      toast({ title: "Bedrock settings saved" });
    },
  });

  const [replaceSpaces, setReplaceSpaces] = useState(server?.bedrockReplaceSpaces ?? true);

  useEffect(() => {
    if (server) {
      setEnabled(server.bedrockEnabled);
      setPrefix(server.bedrockPrefix ?? "none");
      setReplaceSpaces(server.bedrockReplaceSpaces ?? true);
    }
  }, [server]);

  const prefixOptions = [
    { value: "none", label: "No prefix", desc: "Username sent as-is (e.g. Steve)" },
    { value: ".", label: ". (dot)", desc: "Geyser default (e.g. .Steve)" },
    { value: "_", label: "_ (underscore)", desc: "Alternative prefix (e.g. _Steve)" },
  ];

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-xl bg-muted/20 border border-border/40 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Enable Bedrock / Console login</p>
          <p className="text-xs text-muted-foreground mt-0.5">Shows a "Bedrock" tab in the store login modal for Xbox gamertag entry</p>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative w-10 h-6 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted"}`}>
          <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? "translate-x-4" : ""}`} />
        </button>
      </div>

      {enabled && (
        <div className="space-y-4">
          {/* Replace spaces toggle */}
          <div className="flex items-center justify-between rounded-xl bg-muted/20 border border-border/40 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Replace spaces with underscores</p>
              <p className="text-xs text-muted-foreground mt-0.5">Xbox gamertags can have spaces — this converts them (e.g. "Cool Player" → "Cool_Player")</p>
            </div>
            <button
              onClick={() => setReplaceSpaces(!replaceSpaces)}
              className={`relative w-10 h-6 rounded-full transition-colors ${replaceSpaces ? "bg-primary" : "bg-muted"}`}>
              <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${replaceSpaces ? "translate-x-4" : ""}`} />
            </button>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Username prefix for Bedrock players</Label>
            <p className="text-xs text-muted-foreground">This prefix is added to their gamertag before running commands (must match your Geyser/Floodgate config).</p>
            <div className="grid grid-cols-3 gap-2">
              {prefixOptions.map(opt => (
                <button key={opt.value} onClick={() => setPrefix(opt.value)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                    prefix === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border"
                  }`}>
                  <p className="font-bold text-sm">{opt.label}</p>
                  <p className="text-xs mt-0.5 opacity-70">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Live preview */}
          <div className="rounded-xl bg-muted/20 border border-border/40 px-4 py-3 text-xs">
            <p className="text-muted-foreground mb-1">Example — gamertag "Cool Player" becomes:</p>
            <code className="text-primary font-mono font-bold">
              {prefix !== "none" ? prefix : ""}{replaceSpaces ? "Cool_Player" : "Cool Player"}
            </code>
          </div>
        </div>
      )}

      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
        {saved ? "Saved!" : save.isPending ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}

// ─── Analytics Tab ───────────────────────────────────────────────────────────
function AnalyticsTab({ serverId }: { serverId: number }) {
  const { data, isLoading } = useQuery<{
    dailyRevenue: { date: string; revenue: number }[];
    topProducts: { name: string; count: number; revenue: number }[];
    hourlyOrders: { hour: number; count: number }[];
  }>({
    queryKey: ["/api/servers/analytics", serverId],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/analytics`).then(r => r.json()),
    refetchInterval: 60000,
  });

  const ACCENT = "#22c55e";
  const HOUR_LABELS = ["12a","1a","2a","3a","4a","5a","6a","7a","8a","9a","10a","11a",
                        "12p","1p","2p","3p","4p","5p","6p","7p","8p","9p","10p","11p"];

  // Fill missing hours with 0
  const hourlyFull = Array.from({ length: 24 }, (_, h) => {
    const found = data?.hourlyOrders.find(o => o.hour === h);
    return { hour: HOUR_LABELS[h], count: found?.count ?? 0 };
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Revenue Over Time */}
      <Card className="bg-card border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Revenue — Last 30 Days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.dailyRevenue?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No sales data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data!.dailyRevenue} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={ACCENT} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }}
                  tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "#71717a" }}
                  tickFormatter={v => `£${v}`} />
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8 }}
                  labelStyle={{ color: "#a1a1aa", fontSize: 11 }}
                  formatter={(v: any) => [`£${Number(v).toFixed(2)}`, "Revenue"]}
                />
                <Area type="monotone" dataKey="revenue" stroke={ACCENT} strokeWidth={2}
                  fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: ACCENT }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Products */}
        <Card className="bg-card border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" /> Top Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.topProducts?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No sales yet.</p>
            ) : (
              <div className="space-y-3">
                {data!.topProducts.map((p, i) => {
                  const maxCount = data!.topProducts[0]?.count || 1;
                  const pct = Math.round((p.count / maxCount) * 100);
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate max-w-[60%]">{p.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {p.count}x · £{p.revenue.toFixed(2)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: ACCENT }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Peak Hours */}
        <Card className="bg-card border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Peak Purchase Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hourlyFull.every(h => h.count === 0) ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No sales yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hourlyFull} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#71717a" }}
                    interval={2} />
                  <YAxis tick={{ fontSize: 10, fill: "#71717a" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8 }}
                    labelStyle={{ color: "#a1a1aa", fontSize: 11 }}
                    formatter={(v: any) => [v, "Orders"]}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {hourlyFull.map((entry, idx) => (
                      <Cell key={idx}
                        fill={entry.count === Math.max(...hourlyFull.map(h => h.count)) && entry.count > 0
                          ? ACCENT : "rgba(255,255,255,0.08)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Creator Codes Tab ────────────────────────────────────────────────────────
function CreatorCodesTab({ serverId }: { serverId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ code: "", creatorName: "", rewardPercent: "10", discountPercent: "0" });
  const [adding, setAdding] = useState(false);
  const [payoutsTab, setPayoutsTab] = useState<"codes" | "payouts">("codes");

  const { data: codes = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/servers/creator-codes", serverId],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/creator-codes`).then(r => r.json()),
  });

  const { data: payouts = [] } = useQuery<any[]>({
    queryKey: ["/api/servers/creator-payouts", serverId],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/creator-payouts`).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const payoutMutation = useMutation({
    mutationFn: ({ id, status, ownerNote }: { id: number; status: string; ownerNote?: string }) =>
      apiRequest("PATCH", `/api/creator-payouts/${id}`, { status, ownerNote }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers/creator-payouts", serverId] });
      queryClient.invalidateQueries({ queryKey: ["/api/servers/creator-codes", serverId] });
      toast({ title: "Payout updated" });
    },
  });

  const claimUrl = `${window.location.origin}/#/creator-claim?server=${serverId}`;
  const pendingPayouts = payouts.filter((p: any) => p.status === "pending");

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/servers/${serverId}/creator-codes`, {
      code: form.code.trim().toUpperCase(),
      creatorName: form.creatorName.trim(),
      rewardPercent: Number(form.rewardPercent) || 10,
      discountPercent: Number(form.discountPercent) || 0,
    }).then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error); return d; })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers/creator-codes", serverId] });
      setForm({ code: "", creatorName: "", rewardPercent: "10", discountPercent: "0" });
      setAdding(false);
      toast({ title: "Creator code added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/creator-codes/${id}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers/creator-codes", serverId] });
      toast({ title: "Code deleted" });
    },
  });

  const totalEarned = codes.reduce((s: number, c: any) => s + (c.totalEarned || 0), 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground mb-1">Active Codes</p>
            <p className="text-3xl font-extrabold">{codes.filter((c: any) => c.active).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground mb-1">Total Owed</p>
            <p className="text-3xl font-extrabold">£{(totalEarned / 100).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground mb-1">Pending Claims</p>
            <p className="text-3xl font-extrabold">{pendingPayouts.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Claim link to share with creators */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-semibold mb-2 text-muted-foreground">Share this link with your creators so they can claim earnings:</p>
          <div className="flex gap-2">
            <Input readOnly value={claimUrl} className="font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(claimUrl); toast({ title: "Link copied" }); }}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sub-tab toggle */}
      <div className="flex rounded-lg overflow-hidden border border-border" style={{ width: "fit-content" }}>
        <button onClick={() => setPayoutsTab("codes")}
          className={`px-4 py-1.5 text-sm font-semibold transition-colors ${payoutsTab === "codes" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}>
          Codes
        </button>
        <button onClick={() => setPayoutsTab("payouts")}
          className={`px-4 py-1.5 text-sm font-semibold transition-colors flex items-center gap-2 ${payoutsTab === "payouts" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}>
          Payout Requests {pendingPayouts.length > 0 && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">{pendingPayouts.length}</span>}
        </button>
      </div>

      {/* ── Codes sub-tab ── */}
      {payoutsTab === "codes" && (<>

      {/* Add code form */}
      {adding ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Creator Code</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Code <span className="text-muted-foreground">(e.g. TOEE10)</span></Label>
                <Input
                  placeholder="TOEE10"
                  value={form.code}
                  onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Creator name</Label>
                <Input
                  placeholder="ToeeOnTT"
                  value={form.creatorName}
                  onChange={e => setForm(p => ({ ...p, creatorName: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Reward % <span className="text-muted-foreground">(creator earns this % of each sale)</span></Label>
                <Input
                  type="number" min="0" max="100"
                  value={form.rewardPercent}
                  onChange={e => setForm(p => ({ ...p, rewardPercent: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Discount % <span className="text-muted-foreground">(buyer gets this % off — 0 for no discount)</span></Label>
                <Input
                  type="number" min="0" max="100"
                  value={form.discountPercent}
                  onChange={e => setForm(p => ({ ...p, discountPercent: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => createMutation.mutate()} disabled={!form.code.trim() || !form.creatorName.trim() || createMutation.isPending}>
                {createMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Saving…</> : "Save Code"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button className="gap-2" onClick={() => setAdding(true)}>
          <PlusCircle className="w-4 h-4" /> Add Creator Code
        </Button>
      )}

      {/* Codes list */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : codes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tag className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">No creator codes yet. Add one above.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {codes.map((cc: any) => (
            <Card key={cc.id}>
              <CardContent className="py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-extrabold text-base tracking-wider text-primary">{cc.code}</span>
                    <Badge variant="outline" className="text-xs">{cc.creatorName}</Badge>
                    {cc.discountPercent > 0 && (
                      <Badge className="text-xs gap-1 bg-green-500/15 text-green-600 border-green-500/30">
                        <Percent className="w-2.5 h-2.5" />{cc.discountPercent}% buyer discount
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">Earns <span className="font-bold text-foreground">{cc.rewardPercent}%</span> per sale</span>
                    <span className="text-xs text-muted-foreground">Total earned: <span className="font-bold text-foreground">£{(cc.totalEarned / 100).toFixed(2)}</span></span>
                  </div>
                </div>
                <Button
                  size="sm" variant="ghost"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  title="Copy creator claim link"
                  onClick={() => {
                    const link = `${window.location.origin}/#/creator-claim?server=${serverId}&code=${encodeURIComponent(cc.code)}`;
                    navigator.clipboard.writeText(link);
                    toast({ title: "Link copied", description: `Claim link for ${cc.code} copied to clipboard` });
                  }}
                >
                  <Link2 className="w-4 h-4" />
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={() => deleteMutation.mutate(cc.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </>)} {/* end codes sub-tab */}

      {/* ── Payouts sub-tab ── */}
      {payoutsTab === "payouts" && (
        <div className="space-y-3">
          {payouts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <DollarSign className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">No payout requests yet.</p>
              </CardContent>
            </Card>
          ) : payouts.map((p: any) => (
            <Card key={p.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono font-extrabold text-sm text-primary">{p.code}</span>
                      <span className="text-sm font-semibold">{p.creatorName}</span>
                      <Badge variant={p.status === "paid" ? "default" : p.status === "rejected" ? "destructive" : p.status === "approved" ? "outline" : "secondary"}
                        className="text-xs capitalize">{p.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Requesting <span className="font-bold text-foreground text-sm">£{(p.amountRequested / 100).toFixed(2)}</span> via PayPal</p>
                    <p className="text-xs text-muted-foreground mt-0.5">PayPal: <span className="font-mono text-foreground">{p.paypalEmail}</span></p>
                    {p.ownerNote && <p className="text-xs text-muted-foreground mt-0.5">Note: {p.ownerNote}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">{new Date(p.createdAt).toLocaleDateString()}</p>
                  </div>
                  {p.status === "pending" && (
                    <div className="flex gap-2 flex-shrink-0">
                      <Button size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white gap-1"
                        disabled={payoutMutation.isPending}
                        onClick={() => payoutMutation.mutate({ id: p.id, status: "paid" })}>
                        <Check2 className="w-3.5 h-3.5" /> Mark Paid
                      </Button>
                      <Button size="sm" variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                        disabled={payoutMutation.isPending}
                        onClick={() => payoutMutation.mutate({ id: p.id, status: "rejected" })}>
                        <X className="w-3.5 h-3.5" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


export default function ServerDashboard() {
  const { id } = useParams<{ id: string }>();
  const serverId = Number(id);
  const [, navigate] = useLocation();
  const { user, hydrated } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [statsMember, setStatsMember] = useState<string | null>(null);

  // Redirect to login if not authenticated (wait for hydration first)
  useEffect(() => {
    if (hydrated && !user) navigate("/login");
  }, [hydrated, user]);

  const { data: server } = useQuery<Server>({
    queryKey: ["/api/servers", serverId],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}`).then(r => r.json()),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/servers", serverId, "products"],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/products`).then(r => r.json()),
  });

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["/api/servers", serverId, "members"],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/members`).then(r => r.json()),
  });

  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/servers", serverId, "orders"],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/orders`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/servers", serverId, "stats"],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/stats`).then(r => r.json()),
    refetchInterval: 30000,
  });

  // Theme (for category list)
  const { data: theme } = useQuery<any>({
    queryKey: ["/api/servers", serverId, "theme"],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/theme`).then(r => r.json()),
  });
  const categoryList: string[] = (() => { try { return JSON.parse(theme?.categories || "[]"); } catch { return []; } })();

  // Category management state (synced from theme)
  const [catList, setCatList] = useState<string[]>([]);
  const [newCat, setNewCat] = useState("");
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [subcats, setSubcats] = useState<Record<string, string[]>>({});
  const [newSubcatInput, setNewSubcatInput] = useState<Record<string, string>>({});
  const [dragOverCat, setDragOverCat] = useState<string | null>(null);
  const dragProductId = useRef<number | null>(null);

  // Category image editing
  type CatImage = { imageType: string; imageUrl: string; playerHeadName: string; enchanted?: boolean };
  const [categoryImages, setCategoryImages] = useState<Record<string, CatImage>>({});
  const [editCatImage, setEditCatImage] = useState<string | null>(null); // which cat is being edited
  const [catImgType, setCatImgType] = useState("upload");
  const [catImgUrl, setCatImgUrl] = useState("");
  const [catImgHead, setCatImgHead] = useState("");
  const [catImgEnchanted, setCatImgEnchanted] = useState(false);

  useEffect(() => {
    if (!theme) return;
    try { setCatList(JSON.parse(theme.categories || "[]")); } catch { setCatList([]); }
    try { setSubcats(JSON.parse(theme.subcategories || "{}")); } catch { setSubcats({}); }
    try { setCategoryImages(JSON.parse(theme.categoryImages || "{}")); } catch { setCategoryImages({}); }
  }, [theme]);

  const saveCategories = useMutation({
    mutationFn: (data: { categories: string[]; subcategories: Record<string, string[]>; catImgs?: Record<string, CatImage> }) =>
      apiRequest("PATCH", `/api/servers/${serverId}/theme`, {
        categories: JSON.stringify(data.categories),
        subcategories: JSON.stringify(data.subcategories),
        categoryImages: JSON.stringify(data.catImgs ?? categoryImages),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "theme"] });
      toast({ title: "Categories saved" });
    },
  });

  const addCat = () => {
    const c = newCat.trim();
    if (!c || catList.includes(c)) return;
    const next = [...catList, c];
    setCatList(next);
    setNewCat("");
    saveCategories.mutate({ categories: next, subcategories: subcats });
  };
  const removeCat = (c: string) => {
    const next = catList.filter(x => x !== c);
    const nextSubs = { ...subcats }; delete nextSubs[c];
    const nextImgs = { ...categoryImages }; delete nextImgs[c];
    setCatList(next); setSubcats(nextSubs); setCategoryImages(nextImgs);
    saveCategories.mutate({ categories: next, subcategories: nextSubs, catImgs: nextImgs });
  };

  const openCatImageEditor = (cat: string) => {
    const existing = categoryImages[cat];
    setCatImgType(existing?.imageType || "upload");
    setCatImgUrl(existing?.imageUrl || "");
    setCatImgHead(existing?.playerHeadName || "");
    setCatImgEnchanted(existing?.enchanted ?? false);
    setEditCatImage(cat);
  };

  const saveCatImage = () => {
    if (!editCatImage) return;
    const nextImgs = { ...categoryImages, [editCatImage]: { imageType: catImgType, imageUrl: catImgUrl, playerHeadName: catImgHead, enchanted: catImgEnchanted } };
    setCategoryImages(nextImgs);
    setEditCatImage(null);
    saveCategories.mutate({ categories: catList, subcategories: subcats, catImgs: nextImgs });
  };

  const removeCatImage = (cat: string) => {
    const nextImgs = { ...categoryImages }; delete nextImgs[cat];
    setCategoryImages(nextImgs);
    saveCategories.mutate({ categories: catList, subcategories: subcats, catImgs: nextImgs });
  };

  const catImageUrl = (cat: string): string | null => {
    const img = categoryImages[cat];
    if (!img) return null;
    if (img.imageType === "playerhead" && img.playerHeadName) return `https://nmsr.nickac.dev/head/${encodeURIComponent(img.playerHeadName)}`;
    return img.imageUrl || null;
  };
  const addSubcat = (cat: string) => {
    const sub = (newSubcatInput[cat] || "").trim();
    if (!sub || (subcats[cat] || []).includes(sub)) return;
    const nextSubs = { ...subcats, [cat]: [...(subcats[cat] || []), sub] };
    setSubcats(nextSubs);
    setNewSubcatInput(p => ({ ...p, [cat]: "" }));
    saveCategories.mutate({ categories: catList, subcategories: nextSubs });
  };
  const removeSubcat = (cat: string, sub: string) => {
    const nextSubs = { ...subcats, [cat]: (subcats[cat] || []).filter(s => s !== sub) };
    setSubcats(nextSubs);
    saveCategories.mutate({ categories: catList, subcategories: nextSubs });
  };

  // Add product
  const productForm = useForm<ProductForm>({ defaultValues: { imageType: "upload", playerHeadName: "", stock: -1, enchanted: false, featured: false, preorder: false, preorderReleaseDate: "", purchaseType: "one_time", expiryCommands: "" } });
  const addProduct = useMutation({
    mutationFn: (data: ProductForm) =>
      apiRequest("POST", `/api/servers/${serverId}/products`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "products"] });
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "stats"] });
      setAddProductOpen(false);
      productForm.reset({ imageType: "upload", playerHeadName: "", stock: -1, enchanted: false, featured: false, preorder: false, preorderReleaseDate: "", purchaseType: "one_time", expiryCommands: "" });
      toast({ title: "Product added" });
    },
  });

  // Edit product
  const editForm = useForm<ProductForm>({ defaultValues: { imageType: "upload", playerHeadName: "", stock: -1, enchanted: false, featured: false, preorder: false, preorderReleaseDate: "", purchaseType: "one_time", expiryCommands: "" } });
  const updateProduct = useMutation({
    mutationFn: (data: ProductForm & { id: number }) =>
      apiRequest("PATCH", `/api/products/${data.id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "products"] });
      setEditProduct(null);
      toast({ title: "Product updated" });
    },
  });

  // Open edit dialog and pre-fill form
  const openEdit = (p: Product) => {
    setEditProduct(p);
    editForm.reset({
      name: p.name,
      description: p.description ?? "",
      price: p.price,
      command: p.command,
      category: p.category ?? "",
      stock: p.stock ?? -1,
      imageUrl: p.imageUrl ?? "",
      imageType: (p as any).imageType ?? "upload",
      playerHeadName: (p as any).playerHeadName ?? "",
      enchanted: !!(p as any).enchanted,
      featured: !!(p as any).featured,
      world: (p as any).world ?? "",
      preorder: !!(p as any).preorder,
      preorderReleaseDate: (p as any).preorderReleaseDate ?? "",
      purchaseType: (p as any).purchaseType ?? "one_time",
      expiryCommands: (p as any).expiryCommands ?? "",
    });
  };

  const deleteProduct = useMutation({
    mutationFn: (pid: number) => apiRequest("DELETE", `/api/products/${pid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "products"] });
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "stats"] });
    },
  });

  const moveProduct = useMutation({
    mutationFn: ({ id, category }: { id: number; category: string }) =>
      apiRequest("PATCH", `/api/products/${id}`, { category }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "products"] }),
  });

  // Add member
  const memberForm = useForm<MemberForm>({ defaultValues: { balance: 0 } });
  const addMember = useMutation({
    mutationFn: (data: MemberForm) =>
      apiRequest("POST", `/api/servers/${serverId}/members`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "members"] });
      setAddMemberOpen(false);
      memberForm.reset();
      toast({ title: "Member added" });
    },
  });

  const deleteMember = useMutation({
    mutationFn: (mid: number) => apiRequest("DELETE", `/api/members/${mid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "members"] }),
  });

  const ROOT_DOMAIN = "craftstore.org.uk";
  const storeSlug = server?.name ? nameToSlug(server.name) : "";
  const storeUrl = storeSlug ? `https://${storeSlug}.${ROOT_DOMAIN}` : `${window.location.origin}${window.location.pathname}#/store/${serverId}`;

  // Show spinner while session hydrates or user is null (redirect fires via useEffect)
  if (!hydrated || !user) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-background/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <div>
              <span className="font-bold text-sm">{server?.name ?? ""}</span>
              <span className="text-muted-foreground text-xs ml-2">Server Dashboard</span>
            </div>
          </div>
          <a href={storeUrl} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> View Store
            </Button>
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon={DollarSign} label="Revenue" value={`£${(stats?.totalRevenue ?? 0).toFixed(2)}`} sub={`Platform fee: £${(stats?.platformRevenue ?? 0).toFixed(2)}`} />
          <StatCard icon={ShoppingCart} label="Orders" value={stats?.completedOrders ?? 0} sub={`${stats?.totalOrders ?? 0} total`} />
          <StatCard icon={Package} label="Products" value={stats?.totalProducts ?? 0} />
          <StatCard icon={Users} label="Members" value={stats?.totalMembers ?? 0} />
        </div>

        {/* Store URL */}
        <Card className="bg-card border-border/60 mb-8">
          <CardContent className="py-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground mb-1">Your store link — share with players</p>
              <code className="text-xs text-primary font-mono truncate block">{storeUrl}</code>
            </div>
            <Button
              size="sm" variant="outline" className="gap-1.5 shrink-0"
              onClick={() => { navigator.clipboard.writeText(storeUrl); toast({ title: "Copied!" }); }}
              data-testid="button-copy-store-link"
            >
              <Copy className="w-3.5 h-3.5" /> Copy
            </Button>
          </CardContent>
        </Card>

        <Tabs defaultValue="products">
          <TabsList className="mb-6">
            <TabsTrigger value="products" data-testid="tab-products">Products / Categories</TabsTrigger>
            <TabsTrigger value="members" data-testid="tab-members">Members</TabsTrigger>
            <TabsTrigger value="orders" data-testid="tab-orders">Orders</TabsTrigger>
            <TabsTrigger value="appearance" data-testid="tab-appearance" className="gap-1.5">
              <Paintbrush className="w-3.5 h-3.5" /> Appearance
            </TabsTrigger>
            <TabsTrigger value="presets" data-testid="tab-presets" className="gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Presets
            </TabsTrigger>
            <TabsTrigger value="domain" data-testid="tab-domain" className="gap-1.5">
              <Globe className="w-3.5 h-3.5" /> Domain
            </TabsTrigger>
            <TabsTrigger value="payments" data-testid="tab-payments" className="gap-1.5">
              <CreditCard className="w-3.5 h-3.5" /> Payments
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics" className="gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="creator-codes" data-testid="tab-creator-codes" className="gap-1.5">
              <Tag className="w-3.5 h-3.5" /> Creator Codes
            </TabsTrigger>
          </TabsList>

          {/* Products Tab */}
          <TabsContent value="products">

            {/* ── Categories ─────────────────────────────────────────── */}
            <Card className="bg-card border-border/60 mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Categories</CardTitle>
                <CardDescription>Organise your products into categories. Changes save instantly.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. Ranks, Kits, Weapons…"
                    value={newCat}
                    onChange={e => setNewCat(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addCat())}
                  />
                  <Button type="button" onClick={addCat} variant="outline" className="shrink-0 gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </Button>
                </div>
                {catList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No categories yet — products will appear unfiltered.</p>
                ) : (
                  <div className="space-y-2">
                    {catList.map(cat => {
                      const thumb = catImageUrl(cat);
                      const isHead = categoryImages[cat]?.imageType === "playerhead";
                      const isCatEnchanted = !!categoryImages[cat]?.enchanted;
                      return (
                      <div key={cat} className="rounded-lg border border-border/60 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 bg-muted/20">
                          {/* Thumbnail */}
                          <div
                            className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity border border-border/40 enchant-wrap"
                            style={{ background: "rgba(255,255,255,0.03)", borderRadius: 6 }}
                            onClick={() => openCatImageEditor(cat)}
                            title="Set category image"
                          >
                            {thumb ? (
                              <>
                                <img src={thumb} alt={cat}
                                  className="w-full h-full object-contain"
                                  style={isHead ? { imageRendering: "pixelated" } : {}}
                                />
                                {isCatEnchanted && <img src={thumb} aria-hidden className="enchant-glint" style={{ objectFit: "contain", borderRadius: 6 }} />}
                              </>
                            ) : (
                              <Edit3 className="w-3.5 h-3.5 text-muted-foreground/50" />
                            )}
                          </div>
                          <button type="button"
                            onClick={() => setExpandedCat(expandedCat === cat ? null : cat)}
                            className="flex items-center gap-2 flex-1 text-left">
                            {expandedCat === cat
                              ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground rotate-90" />
                              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                            <span className="font-medium text-sm">{cat}</span>
                            {(subcats[cat] || []).length > 0 && (
                              <span className="text-xs text-muted-foreground">({subcats[cat].length} sub{subcats[cat].length !== 1 ? "s" : ""})</span>
                            )}
                          </button>
                          {thumb && (
                            <button type="button" onClick={() => removeCatImage(cat)}
                              className="hover:text-muted-foreground transition-colors shrink-0 text-muted-foreground/40" title="Remove image">
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button type="button" onClick={() => removeCat(cat)}
                            className="hover:text-destructive transition-colors shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {expandedCat === cat && (
                          <div className="px-3 py-3 space-y-2 border-t border-border/40">
                            <div className="flex gap-2">
                              <Input
                                placeholder={`Add subcategory under "${cat}"…`}
                                className="text-xs h-8"
                                value={newSubcatInput[cat] || ""}
                                onChange={e => setNewSubcatInput(p => ({ ...p, [cat]: e.target.value }))}
                                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addSubcat(cat))}
                              />
                              <Button type="button" size="sm" variant="outline" className="h-8 px-2 shrink-0" onClick={() => addSubcat(cat)}>
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                            {(subcats[cat] || []).length === 0 ? (
                              <p className="text-xs text-muted-foreground">No subcategories yet.</p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {(subcats[cat] || []).map(sub => (
                                  <span key={sub} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
                                    {sub}
                                    <button type="button" onClick={() => removeSubcat(cat, sub)} className="hover:text-destructive">
                                      <Trash2 className="w-2.5 h-2.5" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ); })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Category image editor dialog */}
            <Dialog open={!!editCatImage} onOpenChange={o => { if (!o) setEditCatImage(null); }}>
              <DialogContent className="bg-card border-border/60 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Set image for "{editCatImage}"</DialogTitle>
                </DialogHeader>
                {/* Enchanted toggle */}
                <div className="flex items-center justify-between rounded-xl bg-purple-500/10 border border-purple-500/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-purple-400" /> Enchanted</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Adds enchantment glint shimmer to this category's image</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCatImgEnchanted(v => !v)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${catImgEnchanted ? "bg-purple-500" : "bg-muted"}`}>
                    <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${catImgEnchanted ? "translate-x-4" : ""}`} />
                  </button>
                </div>
                <ProductImagePicker
                  imageType={catImgType}
                  setImageType={setCatImgType}
                  imageUrl={catImgUrl}
                  setImageUrl={setCatImgUrl}
                  playerHeadName={catImgHead}
                  setPlayerHeadName={setCatImgHead}
                />
                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setEditCatImage(null)}>Cancel</Button>
                  <Button type="button" className="flex-1 bg-primary text-primary-foreground" onClick={saveCatImage}
                    disabled={saveCategories.isPending}>
                    {saveCategories.isPending ? "Saving…" : "Save image"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold">Products ({products.length})</h2>
              <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5" data-testid="button-add-product">
                    <Plus className="w-3.5 h-3.5" /> Add Product
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border/60 max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>
                  <form onSubmit={productForm.handleSubmit(
                    (d) => addProduct.mutate(d),
                    (errs) => toast({ title: "Please fill in required fields", description: Object.values(errs).map((e: any) => e.message).filter(Boolean).join(", ") || "Name, price and command are required", variant: "destructive" })
                  )} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Name</Label>
                        <Input placeholder="Diamond Sword" data-testid="input-product-name" {...productForm.register("name", { required: true })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Price (£)</Label>
                        <Input type="number" step="0.01" placeholder="4.99" data-testid="input-product-price" {...productForm.register("price", { required: true, valueAsNumber: true })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Description</Label>
                      <Textarea placeholder="A powerful sword…" rows={2} {...productForm.register("description")} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5" /> In-game commands</Label>
                      <CommandTextarea
                        value={productForm.watch("command") ?? ""}
                        onChange={v => productForm.setValue("command", v, { shouldValidate: true, shouldDirty: true })}
                        rows={4}
                        placeholder={"give {player} diamond_sword 1\nlp user {player} parent set vip\ntell {player} Thanks for purchasing!"}
                        dataTestId="input-product-command"
                      />
                      <p className="text-xs text-muted-foreground">One command per line. Type <code className="text-primary">{"{}"}</code> to browse placeholders — player, colours, product info and more.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Category</Label>
                        <select
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                          {...productForm.register("category")}>
                          <option value="">No category</option>
                          {catList.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        {catList.length === 0 && (
                          <p className="text-xs text-muted-foreground">Add categories above first</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Stock (-1 = unlimited)</Label>
                        <Input type="number" {...productForm.register("stock", { valueAsNumber: true })} />
                      </div>
                    </div>
                    {(() => { const wl: string[] = (() => { try { return JSON.parse(theme?.worlds || "[]"); } catch { return []; } })(); return wl.length > 0 ? (
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="2" y="3" width="20" height="14" rx="3" /><path d="M8 21h8M12 17v4" /></svg>
                          World
                        </Label>
                        <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" {...productForm.register("world" as any)}>
                          <option value="">All worlds</option>
                          {wl.map((w: string) => <option key={w} value={w}>{w}</option>)}
                        </select>
                        <p className="text-xs text-muted-foreground">Only show this item when that world is selected on the store</p>
                      </div>
                    ) : null; })()}
                    {/* Enchanted toggle */}
                    <div className="flex items-center justify-between rounded-xl bg-purple-500/10 border border-purple-500/30 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-purple-400" /> Enchanted Item</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Adds a Minecraft-style enchantment glint shimmer to the item image</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => productForm.setValue("enchanted", !productForm.watch("enchanted"))}
                        className={`relative w-10 h-6 rounded-full transition-colors ${productForm.watch("enchanted") ? "bg-purple-500" : "bg-muted"}`}>
                        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${productForm.watch("enchanted") ? "translate-x-4" : ""}`} />
                      </button>
                    </div>
                    {/* Featured toggle */}
                    <div className="flex items-center justify-between rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-yellow-400" /> Featured Package</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Show this item in the Featured Packages section on the store home page</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => productForm.setValue("featured", !productForm.watch("featured"))}
                        className={`relative w-10 h-6 rounded-full transition-colors ${productForm.watch("featured") ? "bg-yellow-500" : "bg-muted"}`}>
                        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${productForm.watch("featured") ? "translate-x-4" : ""}`} />
                      </button>
                    </div>
                    {/* Pre-Order toggle */}
                    <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium flex items-center gap-1.5"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-blue-400"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Pre-Order</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Players pay now — item delivered when released</p>
                        </div>
                        <button type="button" onClick={() => productForm.setValue("preorder", !productForm.watch("preorder"))} className={`relative w-10 h-6 rounded-full transition-colors ${productForm.watch("preorder") ? "bg-blue-500" : "bg-muted"}`}>
                          <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${productForm.watch("preorder") ? "translate-x-4" : ""}`} />
                        </button>
                      </div>
                      {productForm.watch("preorder") && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Release Date (optional)</Label>
                          <Input type="date" {...productForm.register("preorderReleaseDate")} className="h-8 text-sm" />
                          <p className="text-xs text-muted-foreground">Shown on the store as the expected availability date</p>
                        </div>
                      )}
                      {/* Purchase Type */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Purchase Type</Label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(["one_time", "subscription", "one_month_sub", "both_sub"] as const).map(pt => (
                            <button key={pt} type="button"
                              onClick={() => productForm.setValue("purchaseType", pt)}
                              className={`py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                                productForm.watch("purchaseType") === pt
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-muted text-muted-foreground border-border"
                              }`}>
                              {pt === "one_time" ? "One-Time" : pt === "subscription" ? "Monthly Sub" : pt === "one_month_sub" ? "1-Month Sub" : "Monthly + 1-Month"}
                            </button>
                          ))}
                        </div>
                        {productForm.watch("purchaseType") !== "one_time" && (
                          <p className="text-xs text-muted-foreground">
                            {productForm.watch("purchaseType") === "subscription" ? "Recurring monthly — player can cancel anytime."
                              : productForm.watch("purchaseType") === "one_month_sub" ? "Charged once, auto-cancels after 1 month."
                              : "Player chooses Monthly or 1-Month at checkout."}
                          </p>
                        )}
                      </div>
                      {/* Expiry Commands — shown for any subscription type */}
                      {productForm.watch("purchaseType") !== "one_time" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Expiry Commands <span className="text-muted-foreground font-normal">(fired when subscription ends)</span></Label>
                          <textarea
                            {...productForm.register("expiryCommands")}
                            rows={3}
                            placeholder={"lp user {player} parent remove vip\nessentials:gamemode survival {player}"}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono resize-y min-h-[60px] focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <p className="text-xs text-muted-foreground">One command per line. Use <code className="bg-muted px-1 rounded">{{player}}</code> for the player's username.</p>
                        </div>
                      )}
                    </div>
                    <ProductImagePicker
                      imageType={productForm.watch("imageType") || "upload"}
                      setImageType={(v) => productForm.setValue("imageType", v)}
                      imageUrl={productForm.watch("imageUrl") || ""}
                      setImageUrl={(v) => productForm.setValue("imageUrl", v)}
                      playerHeadName={productForm.watch("playerHeadName") || ""}
                      setPlayerHeadName={(v) => productForm.setValue("playerHeadName", v)}
                    />
                    <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={addProduct.isPending}>
                      {addProduct.isPending ? "Adding…" : "Add product"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Edit product dialog */}
            <Dialog open={!!editProduct} onOpenChange={(o) => { if (!o) setEditProduct(null); }}>
              <DialogContent className="bg-card border-border/60 max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Edit Product</DialogTitle></DialogHeader>
                <form onSubmit={editForm.handleSubmit((d) => updateProduct.mutate({ ...d, id: editProduct!.id }))} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Name</Label>
                      <Input {...editForm.register("name", { required: true })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Price (£)</Label>
                      <Input type="number" step="0.01" {...editForm.register("price", { required: true, valueAsNumber: true })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description</Label>
                    <Textarea rows={2} {...editForm.register("description")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5" /> In-game commands</Label>
                    <CommandTextarea
                      value={editForm.watch("command") ?? ""}
                      onChange={v => editForm.setValue("command", v, { shouldValidate: true, shouldDirty: true })}
                      rows={4}
                    />
                    <p className="text-xs text-muted-foreground">One command per line. Type <code className="text-primary">{"{}"}</code> to browse placeholders — player, colours, product info and more.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Category</Label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        {...editForm.register("category")}>
                        <option value="">No category</option>
                        {catList.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Stock (-1 = unlimited)</Label>
                      <Input type="number" {...editForm.register("stock", { valueAsNumber: true })} />
                    </div>
                  </div>
                  {(() => { const wl: string[] = (() => { try { return JSON.parse(theme?.worlds || "[]"); } catch { return []; } })(); return wl.length > 0 ? (
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="2" y="3" width="20" height="14" rx="3" /><path d="M8 21h8M12 17v4" /></svg>
                        World
                      </Label>
                      <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" {...editForm.register("world" as any)}>
                        <option value="">All worlds</option>
                        {wl.map((w: string) => <option key={w} value={w}>{w}</option>)}
                      </select>
                      <p className="text-xs text-muted-foreground">Only show this item when that world is selected on the store</p>
                    </div>
                  ) : null; })()}
                  {/* Enchanted toggle */}
                  <div className="flex items-center justify-between rounded-xl bg-purple-500/10 border border-purple-500/30 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-purple-400" /> Enchanted Item</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Adds a Minecraft-style enchantment glint shimmer to the item image</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => editForm.setValue("enchanted", !editForm.watch("enchanted"))}
                      className={`relative w-10 h-6 rounded-full transition-colors ${editForm.watch("enchanted") ? "bg-purple-500" : "bg-muted"}`}>
                      <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${editForm.watch("enchanted") ? "translate-x-4" : ""}`} />
                    </button>
                  </div>
                  {/* Featured toggle */}
                  <div className="flex items-center justify-between rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-yellow-400" /> Featured Package</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Show this item in the Featured Packages section on the store home page</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => editForm.setValue("featured", !editForm.watch("featured"))}
                      className={`relative w-10 h-6 rounded-full transition-colors ${editForm.watch("featured") ? "bg-yellow-500" : "bg-muted"}`}>
                      <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${editForm.watch("featured") ? "translate-x-4" : ""}`} />
                    </button>
                  </div>
                  {/* Pre-Order toggle */}
                  <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium flex items-center gap-1.5"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-blue-400"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Pre-Order</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Players pay now — item delivered when released</p>
                      </div>
                      <button type="button" onClick={() => editForm.setValue("preorder", !editForm.watch("preorder"))} className={`relative w-10 h-6 rounded-full transition-colors ${editForm.watch("preorder") ? "bg-blue-500" : "bg-muted"}`}>
                        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${editForm.watch("preorder") ? "translate-x-4" : ""}`} />
                      </button>
                    </div>
                    {editForm.watch("preorder") && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Release Date (optional)</Label>
                        <Input type="date" {...editForm.register("preorderReleaseDate")} className="h-8 text-sm" />
                        <p className="text-xs text-muted-foreground">Shown on the store as the expected availability date</p>
                      </div>
                    )}
                    {/* Purchase Type */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Purchase Type</Label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(["one_time", "subscription", "one_month_sub", "both_sub"] as const).map(pt => (
                          <button key={pt} type="button"
                            onClick={() => editForm.setValue("purchaseType", pt)}
                            className={`py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                              editForm.watch("purchaseType") === pt
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted text-muted-foreground border-border"
                            }`}>
                            {pt === "one_time" ? "One-Time" : pt === "subscription" ? "Monthly Sub" : pt === "one_month_sub" ? "1-Month Sub" : "Monthly + 1-Month"}
                          </button>
                        ))}
                      </div>
                      {editForm.watch("purchaseType") !== "one_time" && (
                        <p className="text-xs text-muted-foreground">
                          {editForm.watch("purchaseType") === "subscription" ? "Recurring monthly — player can cancel anytime."
                            : editForm.watch("purchaseType") === "one_month_sub" ? "Charged once, auto-cancels after 1 month."
                            : "Player chooses Monthly or 1-Month at checkout."}
                        </p>
                      )}
                    </div>
                    {/* Expiry Commands — shown for any subscription type */}
                    {editForm.watch("purchaseType") !== "one_time" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Expiry Commands <span className="text-muted-foreground font-normal">(fired when subscription ends)</span></Label>
                        <textarea
                          {...editForm.register("expiryCommands")}
                          rows={3}
                          placeholder={"lp user {player} parent remove vip\nessentials:gamemode survival {player}"}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono resize-y min-h-[60px] focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <p className="text-xs text-muted-foreground">One command per line. Use <code className="bg-muted px-1 rounded">{{player}}</code> for the player's username.</p>
                      </div>
                    )}
                  </div>
                  <ProductImagePicker
                    imageType={editForm.watch("imageType") || "upload"}
                    setImageType={(v) => editForm.setValue("imageType", v)}
                    imageUrl={editForm.watch("imageUrl") || ""}
                    setImageUrl={(v) => editForm.setValue("imageUrl", v)}
                    playerHeadName={editForm.watch("playerHeadName") || ""}
                    setPlayerHeadName={(v) => editForm.setValue("playerHeadName", v)}
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setEditProduct(null)}>Cancel</Button>
                    <Button type="submit" className="flex-1 bg-primary text-primary-foreground" disabled={updateProduct.isPending}>
                      {updateProduct.isPending ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            {products.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-border/60 rounded-xl">
                <Package className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No products yet — add your first one</p>
              </div>
            ) : (() => {
              // Group products by category
              const sections = [
                ...catList.map(c => ({ label: c, key: c })),
                { label: "Uncategorised", key: "" },
              ];

              const ProductCard = ({ p }: { p: Product }) => {
                const imgUrl = (p as any).imageType === "playerhead" && (p as any).playerHeadName
                  ? `https://nmsr.nickac.dev/head/${encodeURIComponent((p as any).playerHeadName)}`
                  : p.imageUrl;
                const isEnchanted = !!(p as any).enchanted;
                return (
                  <Card
                    key={p.id}
                    draggable
                    onDragStart={() => { dragProductId.current = p.id; }}
                    onDragEnd={() => { dragProductId.current = null; setDragOverCat(null); }}
                    className="block-card bg-card border-border/60 flex flex-col cursor-grab active:cursor-grabbing active:opacity-60 transition-opacity relative"
                    data-testid={`card-product-${p.id}`}
                  >
                    {imgUrl ? (
                      <div className="h-28 overflow-hidden rounded-t-xl flex items-center justify-center enchant-wrap" style={{ background: "rgba(255,255,255,0.02)" }}>
                        <img src={imgUrl} alt={p.name}
                          className={(p as any).imageType === "playerhead" ? "h-24 object-contain" : "w-full h-full object-cover"}
                          style={(p as any).imageType === "playerhead" ? { imageRendering: "pixelated" } : {}}
                        />
                        {isEnchanted && <img src={imgUrl} aria-hidden className="enchant-glint" style={{ objectFit: (p as any).imageType === "playerhead" ? "contain" : "cover" }} />}
                      </div>
                    ) : (
                      <div className="h-28 rounded-t-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.03)" }}>
                        <Package className="w-8 h-8 text-muted-foreground/30" />
                      </div>
                    )}
                    {isEnchanted && (
                      <span className="absolute top-1.5 right-1.5 z-10 text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(120,60,255,0.85)", color: "#fff", fontSize: 10 }}>✨ Enchanted</span>
                    )}
                    <CardContent className="p-3 flex flex-col flex-1">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-semibold text-sm truncate flex-1 min-w-0">{p.name}</h3>
                        <span className="text-primary font-bold ml-2 shrink-0 text-sm">£{p.price.toFixed(2)}</span>
                      </div>
                      {p.description && <p className="text-muted-foreground text-xs mb-2 line-clamp-1">{p.description}</p>}
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <span className="text-xs text-muted-foreground">{p.stock === -1 ? "Unlimited" : p.stock > 0 ? `${p.stock} left` : ""}</span>
                        <div className="flex items-center gap-0.5">
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => openEdit(p)}>
                            <Edit3 className="w-3 h-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => deleteProduct.mutate(p.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              };

              return (
                <div className="space-y-6">
                  {sections.map(({ label, key }) => {
                    const sectionProducts = products.filter(p => (p.category ?? "") === key);
                    const isOver = dragOverCat === key;
                    return (
                      <div key={key}
                        onDragOver={e => { e.preventDefault(); setDragOverCat(key); }}
                        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCat(null); }}
                        onDrop={e => {
                          e.preventDefault();
                          if (dragProductId.current !== null) {
                            moveProduct.mutate({ id: dragProductId.current, category: key });
                          }
                          setDragOverCat(null);
                        }}
                        className={`rounded-xl border-2 transition-colors ${
                          isOver ? "border-primary bg-primary/5" : "border-border/40"
                        }`}
                      >
                        {/* Section header */}
                        <div className={`flex items-center justify-between px-4 py-2.5 rounded-t-xl ${
                          isOver ? "bg-primary/10" : "bg-muted/30"
                        }`}>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{label}</span>
                            <Badge variant="outline" className="text-xs">{sectionProducts.length}</Badge>
                          </div>
                          {isOver && <span className="text-xs text-primary font-medium">Drop here</span>}
                        </div>

                        {/* Products grid */}
                        <div className="p-3">
                          {sectionProducts.length === 0 ? (
                            <div className={`flex items-center justify-center py-6 rounded-lg border-2 border-dashed transition-colors ${
                              isOver ? "border-primary/40 text-primary" : "border-border/30 text-muted-foreground"
                            }`}>
                              <p className="text-xs">{isOver ? "Release to move here" : "Drag products here"}</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                              {sectionProducts.map(p => <ProductCard key={p.id} p={p} />)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </TabsContent>

          {/* Members Tab */}
          <TabsContent value="members">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold">Members ({members.length})</h2>
              <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5" data-testid="button-add-member">
                    <Plus className="w-3.5 h-3.5" /> Add Member
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border/60">
                  <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
                  <form onSubmit={memberForm.handleSubmit((d) => addMember.mutate(d))} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Minecraft Username</Label>
                      <Input placeholder="Steve" data-testid="input-member-username" {...memberForm.register("minecraftUsername", { required: true })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Email (optional)</Label>
                      <Input type="email" placeholder="player@example.com" {...memberForm.register("email")} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Starting Balance (£)</Label>
                      <Input type="number" step="0.01" defaultValue={0} data-testid="input-member-balance" {...memberForm.register("balance", { valueAsNumber: true })} />
                    </div>
                    <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={addMember.isPending}>
                      {addMember.isPending ? "Adding…" : "Add member"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
{statsMember && (
              <MemberStatsPanel
                serverId={serverId}
                username={statsMember}
                onClose={() => setStatsMember(null)}
              />
            )}
            {members.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-border/60 rounded-xl">
                <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No members yet</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/60 hover:bg-transparent">
                      <TableHead>Username</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map(m => (
                      <TableRow
                        key={m.id}
                        className="border-border/60 cursor-pointer hover:bg-muted/20 transition-colors"
                        onClick={() => setStatsMember(m.minecraftUsername)}
                        data-testid={`row-member-${m.id}`}
                      >
                        <TableCell className="font-medium font-mono text-sm">
                          <span className="flex items-center gap-1.5">
                            {m.minecraftUsername}
                            <ChevronRight className="w-3 h-3 text-muted-foreground" />
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{m.email || "—"}</TableCell>
                        <TableCell>
                          <span className="text-primary font-semibold">£{m.balance.toFixed(2)}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{new Date(m.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => deleteMember.mutate(m.id)}
                            data-testid={`button-delete-member-${m.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">Click a member row to view their full stats and order history.</p>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders">
            <h2 className="font-semibold mb-4">Recent Orders ({orders.length})</h2>
            {orders.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-border/60 rounded-xl">
                <ShoppingCart className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No orders yet</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/60 hover:bg-transparent">
                      <TableHead>Order ID</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Webhook</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map(o => (
                      <TableRow key={o.id} className="border-border/60" data-testid={`row-order-${o.id}`}>
                        <TableCell className="text-muted-foreground text-xs font-mono">#{o.id}</TableCell>
                        <TableCell className="font-mono text-sm">{o.minecraftUsername}</TableCell>
                        <TableCell className="text-sm">Product #{o.productId}</TableCell>
                        <TableCell className="font-semibold text-primary">£{o.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs border ${o.status === "completed" ? "status-completed" : o.status === "pending" ? "status-pending" : "status-failed"}`}>
                            {o.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${o.webhookDelivered ? "text-green-400 border-green-500/20" : "text-muted-foreground"}`}>
                            {o.webhookDelivered ? "Sent" : "Pending"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{new Date(o.createdAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance">
            <div className="mb-6">
              <h2 className="font-semibold">Store Appearance</h2>
              <p className="text-muted-foreground text-sm mt-1">Customise the look of your player-facing store.</p>
            </div>
            <StoreAppearance serverId={serverId} />
          </TabsContent>

          {/* Presets Tab */}
          <TabsContent value="presets">
            <div className="mb-6">
              <h2 className="font-semibold">Store Presets</h2>
              <p className="text-muted-foreground text-sm mt-1">Buy animation and colour packs to bring your store to life.</p>
            </div>
            <StorePresets serverId={serverId} />
          </TabsContent>

          {/* Domain Tab */}
          <TabsContent value="domain">
            <DomainTab serverId={serverId} server={server} />
          </TabsContent>

          {/* Settings Tab */}
          {/* Payments / Stripe Connect Tab */}
          <TabsContent value="payments">
            <StripeConnectPanel serverId={Number(id)} server={server} />
          </TabsContent>

          <TabsContent value="settings">
            <div className="max-w-xl space-y-6">
              {/* Bedrock / Console Settings */}
              <Card className="bg-card border-border/60">
                <CardHeader>
                  <CardTitle className="text-base">Bedrock & Console Players</CardTitle>
                  <CardDescription>Allow Xbox/console players to log in to your store using their gamertag.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <BedrockSettings serverId={Number(id)} server={server} />
                </CardContent>
              </Card>

              <Card className="bg-card border-border/60">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Webhook Configuration</CardTitle>
                    <a href="/CraftStorePlugin-1.0.0.jar" download="CraftStorePlugin-1.0.0.jar">
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <Package className="w-3.5 h-3.5" /> Download Plugin
                      </Button>
                    </a>
                  </div>
                  <CardDescription>Install the plugin on your Minecraft server, then paste the generated config below into <code className="text-xs bg-muted px-1 py-0.5 rounded">plugins/CraftStorePlugin/config.yml</code></CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <WebhookSecretEditor serverId={Number(id)} currentSecret={server?.webhookSecret || ""} currentWebhookUrl={server?.webhookUrl || ""} />

                  {/* Test Webhook */}
                  <TestWebhookPanel serverId={Number(id)} hasWebhookUrl={!!server?.webhookUrl} />

                  {/* Auto-generated config.yml */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-xs">Generated config.yml</Label>
                      <Button
                        size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1"
                        onClick={() => {
                          const storeUrl = `https://${window.location.hostname}`;
                          const cfg = `# CraftStore Plugin Configuration\n# Get your server ID and secret key from your CraftStore server dashboard\n\n# Your CraftStore server ID (found in your dashboard URL: /servers/YOUR_ID)\nserver-id: "${id}"\n\n# Secret key for webhook verification (set this in your CraftStore dashboard → Settings)\nwebhook-secret: "${server?.webhookSecret || "your-secret-here"}"\n\n# Your CraftStore store URL\nstore-url: "${storeUrl}"\n\n# Port for the webhook listener (must be open/forwarded on your server)\n# CraftStore will POST purchase events to: http://YOUR_SERVER_IP:webhook-port/craftstore/webhook\nwebhook-port: 8123\n\n# How long to queue commands for offline players (in minutes, 0 = forever until they join)\noffline-queue-timeout: 0\n\n# Debug mode - logs all webhook requests\ndebug: false`;
                          navigator.clipboard.writeText(cfg);
                        }}
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </Button>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-4 text-xs font-mono space-y-0.5">
                      <p className="text-muted-foreground"># CraftStore Plugin Configuration</p>
                      <p className="text-muted-foreground"># Get your server ID and secret from your CraftStore dashboard</p>
                      <p className="mt-1 text-green-400">server-id: <span className="text-yellow-400">"{id}"</span></p>
                      <p className="text-green-400">webhook-secret: <span className="text-yellow-400">"{server?.webhookSecret || "your-secret-here"}"</span></p>
                      <p className="text-green-400">store-url: <span className="text-yellow-400">"{window.location.hostname}"</span></p>
                      <p className="text-green-400">webhook-port: <span className="text-blue-400">8123</span></p>
                      <p className="text-green-400">offline-queue-timeout: <span className="text-blue-400">0</span></p>
                      <p className="text-green-400">debug: <span className="text-blue-400">false</span></p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Then set your Webhook URL in CraftStore to{" "}
                      <code className="bg-muted px-1 py-0.5 rounded">http://YOUR_SERVER_IP:8123/craftstore/webhook</code>
                    </p>
                  </div>

                  {/* Example payload */}
                  <div className="bg-muted/30 rounded-lg p-4 text-xs font-mono text-muted-foreground space-y-1">
                    <p className="text-primary font-semibold mb-2">Example webhook payload:</p>
                    <p>{"{"}</p>
                    <p className="pl-4">"event": "purchase",</p>
                    <p className="pl-4">"orderId": 42,</p>
                    <p className="pl-4">"minecraftUsername": "Steve",</p>
                    <p className="pl-4">"command": "give Steve diamond_sword 1",</p>
                    <p className="pl-4">"secret": "{server?.webhookSecret || "your-secret-here"}"</p>
                    <p>{"}"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Analytics Tab ─────────────────────────────────────────────── */}
          <TabsContent value="analytics">
            <AnalyticsTab serverId={Number(id)} />
          </TabsContent>

          {/* ── Creator Codes Tab ──────────────────────────────────────────── */}
          <TabsContent value="creator-codes">
            <CreatorCodesTab serverId={Number(id)} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
