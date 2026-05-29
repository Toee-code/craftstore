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
  BarChart3, Terminal, Copy, Edit3, TrendingUp, DollarSign, Paintbrush, Sparkles,
  ChevronRight, Loader2, Gift, Globe, CheckCircle2, CreditCard, XCircle, AlertCircle
} from "lucide-react";
import StoreAppearance from "./StoreAppearance";
import StorePresets from "./StorePresets";
import type { Product, Member, Order, Server } from "@shared/schema";

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
    { key: "custom", label: "URL" },
  ];

  // minotar.net works without UUID — uses username directly
  const headPreviewUrl = playerHeadName
    ? `https://minotar.net/helm/${encodeURIComponent(playerHeadName)}/128`
    : null;

  return (
    <div className="space-y-2.5">
      <Label className="text-sm font-semibold">Product Image</Label>

      {/* Tab switcher */}
      <div className="flex rounded-lg overflow-hidden border border-border/60 bg-muted/30">
        {tabs.map(t => (
          <button key={t.key} type="button"
            className={`flex-1 py-2 text-sm font-medium transition-all ${
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
          {/* Hidden real file input */}
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
  imageType: string; playerHeadName: string;
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


function WebhookSecretEditor({ serverId, currentSecret }: { serverId: number; currentSecret: string }) {
  const [secret, setSecret] = useState(currentSecret);
  const [saved, setSaved] = useState(false);
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/servers/${serverId}`, { webhookSecret: secret }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers", serverId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
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
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saved ? "Saved!" : saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-1.5">Set a secret, put it in your plugin config.yml, and CraftStore will send it with every webhook so your plugin can verify it.</p>
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
  useEffect(() => {
    if (!theme) return;
    try { setCatList(JSON.parse(theme.categories || "[]")); } catch { setCatList([]); }
    try { setSubcats(JSON.parse(theme.subcategories || "{}")); } catch { setSubcats({}); }
  }, [theme]);

  const saveCategories = useMutation({
    mutationFn: (data: { categories: string[]; subcategories: Record<string, string[]> }) =>
      apiRequest("PATCH", `/api/servers/${serverId}/theme`, {
        categories: JSON.stringify(data.categories),
        subcategories: JSON.stringify(data.subcategories),
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
    setCatList(next); setSubcats(nextSubs);
    saveCategories.mutate({ categories: next, subcategories: nextSubs });
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
  const productForm = useForm<ProductForm>({ defaultValues: { imageType: "upload", playerHeadName: "", stock: -1 } });
  const addProduct = useMutation({
    mutationFn: (data: ProductForm) =>
      apiRequest("POST", `/api/servers/${serverId}/products`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "products"] });
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "stats"] });
      setAddProductOpen(false);
      productForm.reset({ imageType: "upload", playerHeadName: "", stock: -1 });
      toast({ title: "Product added" });
    },
  });

  // Edit product
  const editForm = useForm<ProductForm>({ defaultValues: { imageType: "upload", playerHeadName: "", stock: -1 } });
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

  const storeUrl = `${window.location.origin}${window.location.pathname}#/store/${serverId}`;

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
                    {catList.map(cat => (
                      <div key={cat} className="rounded-lg border border-border/60 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/20">
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
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

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
                      <Label className="flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5" /> In-game command</Label>
                      <Input placeholder="give {player} diamond_sword 1" data-testid="input-product-command" {...productForm.register("command", { required: true })} />
                      <p className="text-xs text-muted-foreground">Use <code className="text-primary">{"{player}"}</code> as placeholder for the buyer's username.</p>
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
                    <Label className="flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5" /> In-game command</Label>
                    <Input {...editForm.register("command", { required: true })} />
                    <p className="text-xs text-muted-foreground">Use <code className="text-primary">{"{player}"}</code> as placeholder for the buyer's username.</p>
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
                  ? `https://minotar.net/helm/${encodeURIComponent((p as any).playerHeadName)}/128`
                  : p.imageUrl;
                return (
                  <Card
                    key={p.id}
                    draggable
                    onDragStart={() => { dragProductId.current = p.id; }}
                    onDragEnd={() => { dragProductId.current = null; setDragOverCat(null); }}
                    className="block-card bg-card border-border/60 flex flex-col cursor-grab active:cursor-grabbing active:opacity-60 transition-opacity"
                    data-testid={`card-product-${p.id}`}
                  >
                    {imgUrl ? (
                      <div className="h-28 overflow-hidden rounded-t-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.02)" }}>
                        <img src={imgUrl} alt={p.name}
                          className={(p as any).imageType === "playerhead" ? "h-24 object-contain" : "w-full h-full object-cover"}
                          style={(p as any).imageType === "playerhead" ? { imageRendering: "pixelated" } : {}}
                        />
                      </div>
                    ) : (
                      <div className="h-28 rounded-t-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.03)" }}>
                        <Package className="w-8 h-8 text-muted-foreground/30" />
                      </div>
                    )}
                    <CardContent className="p-3 flex flex-col flex-1">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-semibold text-sm truncate flex-1 min-w-0">{p.name}</h3>
                        <span className="text-primary font-bold ml-2 shrink-0 text-sm">£{p.price.toFixed(2)}</span>
                      </div>
                      {p.description && <p className="text-muted-foreground text-xs mb-2 line-clamp-1">{p.description}</p>}
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <span className="text-xs text-muted-foreground">{p.stock === -1 ? "Unlimited" : `${p.stock} left`}</span>
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
                <CardHeader><CardTitle className="text-base">Webhook Configuration</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <WebhookSecretEditor serverId={Number(id)} currentSecret={server?.webhookSecret || ""} />
                  <div className="bg-muted/30 rounded-lg p-4 text-xs font-mono text-muted-foreground space-y-1">
                    <p className="text-primary font-semibold mb-2">Example webhook payload:</p>
                    <p>{"{"}</p>
                    <p className="pl-4">"event": "purchase",</p>
                    <p className="pl-4">"orderId": 42,</p>
                    <p className="pl-4">"minecraftUsername": "Steve",</p>
                    <p className="pl-4">"command": "give Steve diamond_sword 1",</p>
                    <p className="pl-4">"secret": "your-secret-here"</p>
                    <p>{"}"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
