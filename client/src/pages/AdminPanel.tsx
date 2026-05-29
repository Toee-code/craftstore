import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  Server,
  Users,
  ShoppingCart,
  DollarSign,
  Globe,
  Sparkles,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  Package,
  TrendingUp,
  Lock,
  AlertTriangle,
  RefreshCw,
  Wifi,
  ClipboardList,
  ShoppingBag,
  Gift,
  Zap,
} from "lucide-react";

const ADMIN_SECRET = "craftstore_admin_2024";

interface AdminStats {
  totalServers: number;
  totalOwners: number;
  totalOrders: number;
  totalRevenue: number;
  totalPlatformFee: number;
  totalPresetRevenue: number;
  activeDomainPlans: number;
}

interface AdminServer {
  id: number;
  name: string;
  createdAt: string;
  ownerName: string;
  ownerEmail: string;
  slugDomain: string;
  customDomain: string | null;
  domainPlanActive: boolean;
  logoUrl: string | null;
  presetName: string | null;
  presetPrice?: number;
  productCount: number;
  memberCount: number;
  orderCount: number;
  totalRevenue: number;
  totalPlatformFee: number;
}

interface SubdomainClaim {
  id: number;
  subdomain: string;
  claimed_at: string;
  server_id: number;
  server_name: string;
  logo_url: string | null;
  owner_name: string;
  owner_email: string;
}

function fmtGBP(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <Card className="bg-card border-border/60">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: accent ? `${accent}22` : "hsl(var(--muted))" }}
          >
            <Icon
              className="w-5 h-5"
              style={{ color: accent || "hsl(var(--muted-foreground))" }}
            />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminPanel() {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loginError, setLoginError] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const handleLogin = () => {
    if (secret === ADMIN_SECRET) {
      setAuthed(true);
      setLoginError("");
    } else {
      setLoginError("Invalid admin secret.");
    }
  };

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: () =>
      apiRequest("GET", `/api/admin/stats`, undefined, {
        "X-Admin-Secret": ADMIN_SECRET,
      }).then((r) => r.json()),
    enabled: authed,
  });

  const { data: servers, isLoading: serversLoading } = useQuery<AdminServer[]>(
    {
      queryKey: ["/api/admin/servers"],
      queryFn: () =>
        apiRequest("GET", `/api/admin/servers`, undefined, {
          "X-Admin-Secret": ADMIN_SECRET,
        }).then((r) => r.json()),
      enabled: authed,
    }
  );

  const [activeTab, setActiveTab] = useState<"servers" | "subdomains" | "health" | "audit">("servers");

  const { data: auditLog } = useQuery<any[]>({
    queryKey: ["/api/admin/audit-log"],
    queryFn: () =>
      apiRequest("GET", "/api/admin/audit-log", undefined, {
        "X-Admin-Secret": ADMIN_SECRET,
      }).then((r) => r.json()),
    enabled: authed,
  });

  // Domain health state
  const [healthResults, setHealthResults] = useState<Record<number, { status: "ok" | "error" | "checking"; code?: number; ms?: number }>>({});
  const [healthRunning, setHealthRunning] = useState(false);

  function nameToSlugAdmin(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");
  }

  const runHealthCheck = async () => {
    if (!servers || healthRunning) return;
    setHealthRunning(true);
    const results: typeof healthResults = {};
    // Mark all as checking
    servers.forEach(s => { results[s.id] = { status: "checking" }; });
    setHealthResults({ ...results });

    await Promise.all(servers.map(async (s) => {
      const slug = nameToSlugAdmin(s.name);
      const url = `https://${slug}.craftstore.org.uk/api/store/${s.id}`;
      const start = Date.now();
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const ms = Date.now() - start;
        results[s.id] = res.ok ? { status: "ok", code: res.status, ms } : { status: "error", code: res.status, ms };
      } catch {
        results[s.id] = { status: "error", ms: Date.now() - start };
      }
      setHealthResults(prev => ({ ...prev, [s.id]: results[s.id] }));
    }));
    setHealthRunning(false);
  };

  const { data: subdomains, refetch: refetchSubs } = useQuery<SubdomainClaim[]>({
    queryKey: ["/api/admin/subdomains"],
    queryFn: () =>
      apiRequest("GET", "/api/admin/subdomains", undefined, {
        "X-Admin-Secret": ADMIN_SECRET,
      }).then((r) => r.json()),
    enabled: authed,
  });

  const revokeSubMutation = useMutation({
    mutationFn: (serverId: number) =>
      apiRequest("DELETE", `/api/admin/subdomains/${serverId}`, {}, {
        "X-Admin-Secret": ADMIN_SECRET,
      }).then((r) => r.json()),
    onSuccess: () => { refetchSubs(); toast({ title: "Subdomain revoked" }); },
    onError: () => toast({ title: "Failed to revoke", variant: "destructive" }),
  });

  const activateDomainMutation = useMutation({
    mutationFn: (serverId: number) =>
      apiRequest(
        "POST",
        `/api/admin/servers/${serverId}/activate-domain`,
        {},
        { "X-Admin-Secret": ADMIN_SECRET }
      ).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/servers"] });
      toast({ title: "Domain plan activated" });
    },
    onError: () => toast({ title: "Failed to activate", variant: "destructive" }),
  });

  // ── Login screen ────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-sm bg-card border-border/60">
          <CardHeader className="text-center pb-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Shield className="w-7 h-7 text-primary" />
            </div>
            <CardTitle className="text-xl">Admin Login</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Enter the admin secret to access the CraftStore control panel.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Admin secret…"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="font-mono"
              />
              {loginError && (
                <p className="text-xs text-destructive">{loginError}</p>
              )}
            </div>
            <Button className="w-full gap-2" onClick={handleLogin}>
              <Lock className="w-4 h-4" />
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const loading = statsLoading || serversLoading;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/60 bg-card/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none">CraftStore Admin</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Platform Control Panel
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-xs"
            onClick={() => setAuthed(false)}
          >
            Sign Out
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Tab switcher */}
            <div className="flex gap-2 border-b border-border/60 pb-0">
              {(["servers", "subdomains", "health", "audit"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                    activeTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "servers" ? "Servers"
                    : tab === "subdomains" ? `Subdomains (${subdomains?.length ?? 0})`
                    : tab === "health" ? "Domain Health"
                    : `Audit Log (${auditLog?.length ?? 0})`}
                </button>
              ))}
            </div>

            {/* Platform Stats */}
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Platform Overview
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
                <StatCard
                  icon={Server}
                  label="Total Servers"
                  value={stats?.totalServers ?? 0}
                  accent="#22c55e"
                />
                <StatCard
                  icon={Users}
                  label="Total Owners"
                  value={stats?.totalOwners ?? 0}
                  accent="#60a5fa"
                />
                <StatCard
                  icon={ShoppingCart}
                  label="Total Orders"
                  value={stats?.totalOrders ?? 0}
                  accent="#a78bfa"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Total Revenue"
                  value={fmtGBP(stats?.totalRevenue ?? 0)}
                  accent="#34d399"
                />
                <StatCard
                  icon={DollarSign}
                  label="Platform Fee (20%)"
                  value={fmtGBP(stats?.totalPlatformFee ?? 0)}
                  accent="#fbbf24"
                />
                <StatCard
                  icon={Sparkles}
                  label="Preset Revenue"
                  value={fmtGBP((stats?.totalPresetRevenue ?? 0) * 100)}
                  accent="#f472b6"
                />
                <StatCard
                  icon={Globe}
                  label="Active Domains"
                  value={stats?.activeDomainPlans ?? 0}
                  accent="#38bdf8"
                />
              </div>
            </section>

            {activeTab === "servers" && (
            <>{/* Servers Table */}
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Registered Servers ({servers?.length ?? 0})
              </h2>
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-muted/30">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                          Server
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                          Owner
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                          Free Domain
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                          Custom Domain
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                          Domain Plan
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                          Preset
                        </th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                          Products
                        </th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                          Members
                        </th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                          Orders
                        </th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                          Revenue
                        </th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                          Platform Fee
                        </th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {(servers ?? []).map((srv, i) => (
                        <tr
                          key={srv.id}
                          className={`border-b border-border/40 transition-colors hover:bg-muted/20 ${
                            i % 2 === 0 ? "bg-background" : "bg-card/50"
                          }`}
                        >
                          {/* Server name + logo */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              {srv.logoUrl ? (
                                <img
                                  src={srv.logoUrl}
                                  alt={srv.name}
                                  className="w-8 h-8 rounded-md object-cover shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                                  <Package className="w-4 h-4 text-primary" />
                                </div>
                              )}
                              <div>
                                <p className="font-medium leading-none">
                                  {srv.name}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  #{srv.id}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Owner */}
                          <td className="px-4 py-3">
                            <p className="font-medium">{srv.ownerName}</p>
                            <p className="text-xs text-muted-foreground">
                              {srv.ownerEmail}
                            </p>
                          </td>

                          {/* Free slug domain */}
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-1 rounded">
                              {srv.slugDomain}
                            </span>
                          </td>

                          {/* Custom domain */}
                          <td className="px-4 py-3">
                            {srv.customDomain ? (
                              <span className="font-mono text-xs text-foreground bg-muted px-2 py-1 rounded">
                                {srv.customDomain}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>

                          {/* Domain Plan badge */}
                          <td className="px-4 py-3">
                            {srv.domainPlanActive ? (
                              <Badge
                                variant="outline"
                                className="gap-1 text-xs border-primary/50 text-primary"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Active
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="gap-1 text-xs border-border text-muted-foreground"
                              >
                                <XCircle className="w-3 h-3" />
                                Inactive
                              </Badge>
                            )}
                          </td>

                          {/* Preset */}
                          <td className="px-4 py-3">
                            {srv.presetName ? (
                              <Badge
                                variant="outline"
                                className="gap-1 text-xs border-yellow-500/50 text-yellow-400"
                              >
                                <Sparkles className="w-3 h-3" />
                                {srv.presetName}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                None
                              </span>
                            )}
                          </td>

                          {/* Counts */}
                          <td className="px-4 py-3 text-right text-muted-foreground">
                            {srv.productCount}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">
                            {srv.memberCount}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">
                            {srv.orderCount}
                          </td>

                          {/* Revenue */}
                          <td className="px-4 py-3 text-right font-mono text-sm">
                            {fmtGBP(srv.totalRevenue)}
                          </td>

                          {/* Platform fee */}
                          <td className="px-4 py-3 text-right font-mono text-sm text-yellow-400">
                            {fmtGBP(srv.totalPlatformFee)}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 justify-end">
                              {!srv.domainPlanActive && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1"
                                  onClick={() =>
                                    activateDomainMutation.mutate(srv.id)
                                  }
                                  disabled={activateDomainMutation.isPending}
                                >
                                  <Globe className="w-3 h-3" />
                                  Activate Domain
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs gap-1"
                                onClick={() =>
                                  (window.location.href = `/#/store/${srv.id}`)
                                }
                              >
                                <ExternalLink className="w-3 h-3" />
                                View Store
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {(servers ?? []).length === 0 && (
                        <tr>
                          <td
                            colSpan={12}
                            className="px-4 py-12 text-center text-muted-foreground text-sm"
                          >
                            No servers registered yet.
                          </td>
                        </tr>
                      )}
                    </tbody>

                    {/* Footer totals */}
                    {(servers ?? []).length > 0 && (
                      <tfoot>
                        <tr className="border-t border-border bg-muted/20">
                          <td
                            colSpan={9}
                            className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                          >
                            Platform Totals
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm font-semibold">
                            {fmtGBP(
                              (servers ?? []).reduce(
                                (s, r) => s + r.totalRevenue,
                                0
                              )
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm font-bold text-yellow-400">
                            {fmtGBP(
                              (servers ?? []).reduce(
                                (s, r) => s + r.totalPlatformFee,
                                0
                              )
                            )}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </section>
          </>
            )}

            {activeTab === "audit" && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Audit Log</h2>
                  <p className="text-xs text-muted-foreground mt-1">Timestamped history of orders, preset purchases, domain activations, and gifts across all servers.</p>
                </div>
              </div>
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Time</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Event</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Server</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Owner</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Detail</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(auditLog ?? []).map((entry, i) => {
                      const eventMeta: Record<string, { label: string; color: string; Icon: any }> = {
                        order: { label: "Purchase", color: "text-green-400 bg-green-400/10", Icon: ShoppingBag },
                        preset_purchase: { label: "Preset", color: "text-purple-400 bg-purple-400/10", Icon: Sparkles },
                        domain_activation: { label: "Domain", color: "text-blue-400 bg-blue-400/10", Icon: Globe },
                        gift: { label: "Gift", color: "text-yellow-400 bg-yellow-400/10", Icon: Gift },
                      };
                      const meta = eventMeta[entry.event_type] ?? { label: entry.event_type, color: "text-muted-foreground bg-muted/20", Icon: Zap };
                      const detail = entry.event_type === "order"
                        ? `${entry.detail1} bought ${entry.detail2 ?? "item"}`
                        : entry.event_type === "preset_purchase"
                        ? `Applied "${entry.detail1}" preset`
                        : entry.event_type === "domain_activation"
                        ? `Domain activated${entry.detail1 ? `: ${entry.detail1}` : ""}`
                        : entry.event_type === "gift"
                        ? `${entry.detail1} → ${entry.detail2}`
                        : entry.detail1 ?? "—";
                      return (
                        <tr key={`${entry.event_type}-${entry.event_id}`} className={`border-b border-border/40 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "bg-background" : "bg-card/50"}`}>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            <p>{new Date(entry.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                            <p>{new Date(entry.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${meta.color}`}>
                              <meta.Icon className="w-3 h-3" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-sm">{entry.server_name ?? "—"}</td>
                          <td className="px-4 py-3">
                            <p className="text-sm">{entry.owner_name}</p>
                            <p className="text-xs text-muted-foreground">{entry.owner_email}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">{detail}</td>
                          <td className="px-4 py-3 text-right">
                            {entry.amount != null ? (
                              <div>
                                <p className="font-semibold text-sm">£{Number(entry.amount).toFixed(2)}</p>
                                {entry.platform_fee ? <p className="text-xs text-muted-foreground">fee: £{Number(entry.platform_fee).toFixed(2)}</p> : null}
                              </div>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {(auditLog ?? []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-sm">No events recorded yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            )}

            {activeTab === "health" && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Domain Health</h2>
                  <p className="text-xs text-muted-foreground mt-1">Pings each server's craftstore.org.uk subdomain to check it's reachable.</p>
                </div>
                <Button size="sm" onClick={runHealthCheck} disabled={healthRunning} className="gap-2">
                  {healthRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {healthRunning ? "Checking..." : "Run Check"}
                </Button>
              </div>
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Server</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Subdomain</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Response</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {(servers ?? []).map((s, i) => {
                      const slug = nameToSlugAdmin(s.name);
                      const url = `https://${slug}.craftstore.org.uk`;
                      const result = healthResults[s.id];
                      return (
                        <tr key={s.id} className={`border-b border-border/40 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "bg-background" : "bg-card/50"}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {s.logoUrl ? (
                                <img src={s.logoUrl} className="w-7 h-7 rounded object-cover" />
                              ) : (
                                <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                                  <Package className="w-3.5 h-3.5 text-primary" />
                                </div>
                              )}
                              <span className="font-medium">{s.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-primary">{slug}.craftstore.org.uk</span>
                          </td>
                          <td className="px-4 py-3">
                            {!result ? (
                              <span className="text-xs text-muted-foreground">Not checked</span>
                            ) : result.status === "checking" ? (
                              <span className="flex items-center gap-1.5 text-xs text-yellow-400">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…
                              </span>
                            ) : result.status === "ok" ? (
                              <span className="flex items-center gap-1.5 text-xs text-green-400">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Online
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-xs text-destructive">
                                <AlertTriangle className="w-3.5 h-3.5" /> Error {result.code ?? ""}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {result?.ms ? `${result.ms}ms` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <a href={url} target="_blank" rel="noreferrer">
                              <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs">
                                <ExternalLink className="w-3 h-3" /> Visit
                              </Button>
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                    {(servers ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">No servers registered yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            )}

            {activeTab === "subdomains" && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Claimed Subdomains ({subdomains?.length ?? 0})
              </h2>
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Subdomain</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Server</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Owner</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Claimed</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {(subdomains ?? []).map((claim, i) => (
                      <tr key={claim.id} className={`border-b border-border/40 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "bg-background" : "bg-card/50"}`}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-primary bg-primary/10 px-2 py-1 rounded">
                            {claim.subdomain}.craftstore.org.uk
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {claim.logo_url ? (
                              <img src={claim.logo_url} className="w-7 h-7 rounded object-cover" />
                            ) : (
                              <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                                <Package className="w-3.5 h-3.5 text-primary" />
                              </div>
                            )}
                            <span className="font-medium">{claim.server_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{claim.owner_name}</p>
                          <p className="text-xs text-muted-foreground">{claim.owner_email}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {new Date(claim.claimed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                            onClick={() => revokeSubMutation.mutate(claim.server_id)}
                            disabled={revokeSubMutation.isPending}
                          >
                            <XCircle className="w-3 h-3" />
                            Revoke
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {(subdomains ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">
                          No subdomains claimed yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            )}
        </>
        )}
      </div>
    </div>
  );
}
