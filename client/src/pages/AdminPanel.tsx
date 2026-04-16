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

            {/* Servers Table */}
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
      </div>
    </div>
  );
}
