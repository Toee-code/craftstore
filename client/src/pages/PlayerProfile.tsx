import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Wallet, ShoppingBag, Gift, Trophy, Star,
  Loader2, CreditCard, ExternalLink, Package, Crown,
  TrendingUp, Calendar,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) { return `£${Number(n).toFixed(2)}`; }
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function rankSuffix(n: number) {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

// ── Top-up amounts ─────────────────────────────────────────────────────────────
const TOP_UP_PRESETS = [1, 5, 10, 20, 50];

export default function PlayerProfile() {
  const { serverId } = useParams<{ serverId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Read username from localStorage (set on member login)
  const storedKey = `craftstore_member_${serverId}`;
  const [memberSession, setMemberSession] = useState<{ username: string } | null>(() => {
    try { return JSON.parse(localStorage.getItem(storedKey) || "null"); } catch { return null; }
  });

  const username = memberSession?.username ?? null;

  // URL params for top-up return
  const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const topupStatus = params.get("topup");

  useEffect(() => {
    if (topupStatus === "success") {
      toast({ title: "Balance topped up!", description: "Your balance has been credited." });
      qc.invalidateQueries({ queryKey: ["/api/member/profile", serverId, username] });
    } else if (topupStatus === "cancelled") {
      toast({ title: "Top-up cancelled", variant: "destructive" });
    }
  }, [topupStatus]);

  const { data: profile, isLoading } = useQuery<any>({
    queryKey: ["/api/member/profile", serverId, username],
    queryFn: () =>
      apiRequest("GET", `/api/member/profile?serverId=${serverId}&username=${encodeURIComponent(username!)}`).then(r => r.json()),
    enabled: !!username && !!serverId,
  });

  const { data: storeData } = useQuery<any>({
    queryKey: ["/api/store", serverId],
    queryFn: () => apiRequest("GET", `/api/store/${serverId}`).then(r => r.json()),
  });

  const { data: subscriptions = [] } = useQuery<any[]>({
    queryKey: ["/api/servers", serverId, "subscriptions", username],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}/subscriptions/${encodeURIComponent(username!)}`).then(r => r.json()),
    enabled: !!username && !!serverId,
  });

  const cancelSubMutation = useMutation({
    mutationFn: (stripeSubId: string) =>
      apiRequest("POST", `/api/subscriptions/${stripeSubId}/cancel`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "subscriptions", username] });
      toast({ title: "Subscription cancelled", description: "You\'ll keep access until the end of the billing period." });
    },
    onError: () => toast({ title: "Failed to cancel", variant: "destructive" }),
  });

  // Balance top-up
  const [topupAmount, setTopupAmount] = useState<number>(10);
  const [customAmount, setCustomAmount] = useState("");

  const topupMutation = useMutation({
    mutationFn: (amount: number) =>
      apiRequest("POST", "/api/member/balance-topup", {
        serverId: Number(serverId), minecraftUsername: username, amount,
      }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else if (data.demoMode) {
        toast({ title: `Balance topped up! New balance: ${fmt(data.newBalance)}` });
        qc.invalidateQueries({ queryKey: ["/api/member/profile", serverId, username] });
      }
    },
    onError: () => toast({ title: "Top-up failed", variant: "destructive" }),
  });

  const handleTopup = () => {
    const amt = customAmount ? Number(customAmount) : topupAmount;
    if (!amt || amt < 1) { toast({ title: "Minimum top-up is £1.00", variant: "destructive" }); return; }
    topupMutation.mutate(amt);
  };

  // Not logged in
  if (!username) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-sm w-full mx-4">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Crown className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-lg">Sign in to view your profile</h2>
              <p className="text-sm text-muted-foreground mt-1">You need to be logged in to your store account.</p>
            </div>
            <Button className="w-full" onClick={() => navigate(`/store/${serverId}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Store
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const server = storeData?.server;
  const orders: any[] = profile?.orders ?? [];
  const gifts: any[] = profile?.giftsReceived ?? [];
  const balance: number = profile?.balance ?? 0;
  const totalSpent: number = profile?.totalSpent ?? 0;
  const rank: number | null = profile?.leaderboardRank ?? null;
  const totalPlayers: number = profile?.totalOnLeaderboard ?? 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-background/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/store/${serverId}`)}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <span className="font-bold text-sm">{username}</span>
              <span className="text-muted-foreground text-xs ml-2">Player Profile</span>
            </div>
          </div>
          {server?.logoUrl && <img src={server.logoUrl} className="w-8 h-8 rounded object-cover" />}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Wallet className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground">Balance</span>
                  </div>
                  <p className="text-2xl font-bold text-primary">{fmt(balance)}</p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border/60">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Total Spent</span>
                  </div>
                  <p className="text-2xl font-bold">{fmt(totalSpent)}</p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border/60">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Purchases</span>
                  </div>
                  <p className="text-2xl font-bold">{orders.length}</p>
                </CardContent>
              </Card>
              <Card className={`border ${rank === 1 ? "bg-yellow-500/10 border-yellow-500/30" : "bg-card border-border/60"}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Trophy className={`w-4 h-4 ${rank === 1 ? "text-yellow-400" : "text-muted-foreground"}`} />
                    <span className="text-xs text-muted-foreground">Leaderboard</span>
                  </div>
                  {rank ? (
                    <p className={`text-2xl font-bold ${rank === 1 ? "text-yellow-400" : rank <= 3 ? "text-primary" : ""}`}>
                      #{rank}<span className="text-sm font-normal text-muted-foreground">/{totalPlayers}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">Not ranked yet</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Leaderboard badge */}
            {rank && rank <= 3 && (
              <Card className={`border ${rank === 1 ? "bg-yellow-500/10 border-yellow-500/30" : rank === 2 ? "bg-slate-400/10 border-slate-400/30" : "bg-orange-500/10 border-orange-500/30"}`}>
                <CardContent className="pt-4 pb-4 flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold ${rank === 1 ? "bg-yellow-500/20 text-yellow-400" : rank === 2 ? "bg-slate-400/20 text-slate-300" : "bg-orange-500/20 text-orange-400"}`}>
                    {rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}
                  </div>
                  <div>
                    <p className="font-bold">Top {rank}{rankSuffix(rank)} Customer</p>
                    <p className="text-sm text-muted-foreground">You're in the top {Math.round((rank / totalPlayers) * 100)}% of spenders on {server?.name ?? "this server"}!</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              {/* Balance Top-Up */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" /> Top Up Balance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {TOP_UP_PRESETS.map(amt => (
                      <button
                        key={amt}
                        onClick={() => { setTopupAmount(amt); setCustomAmount(""); }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${topupAmount === amt && !customAmount ? "bg-primary text-primary-foreground border-primary" : "border-border/60 hover:border-primary/60 text-muted-foreground hover:text-foreground"}`}
                      >
                        {fmt(amt)}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Custom amount"
                      value={customAmount}
                      onChange={e => { setCustomAmount(e.target.value); setTopupAmount(0); }}
                      className="font-mono text-sm"
                      type="number"
                      min="1"
                    />
                    <Button onClick={handleTopup} disabled={topupMutation.isPending} className="shrink-0">
                      {topupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Top Up"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Funds are added instantly to your store balance and can be used for future purchases.</p>
                </CardContent>
              </Card>

              {/* Gifts Received */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Gift className="w-4 h-4 text-yellow-400" /> Gifts Received
                    {gifts.length > 0 && <Badge variant="secondary" className="ml-auto">{gifts.length}</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {gifts.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No gifts received yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {gifts.map((g: any) => (
                        <div key={g.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                          <Gift className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{g.product_name ?? "Item"}</p>
                            <p className="text-xs text-muted-foreground">From <span className="text-foreground">{g.sender_username}</span> · {fmtDate(g.created_at)}</p>
                            {g.message && <p className="text-xs text-muted-foreground italic mt-0.5">"{g.message}"</p>}
                          </div>
                          <span className="text-xs font-semibold text-yellow-400 shrink-0">{fmt(g.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Purchase History */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-primary" /> Purchase History
                  {orders.length > 0 && <Badge variant="secondary" className="ml-auto">{orders.length}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {orders.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">No purchases yet.</div>
                ) : (
                  <div className="rounded-lg border border-border/40 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/40 bg-muted/20">
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Item</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                          <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o: any, i: number) => (
                          <tr key={o.id} className={`border-b border-border/30 last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/10"}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="font-medium">{o.productName ?? o.product_name ?? "Item"}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {fmtDate(o.createdAt ?? o.created_at)}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">{fmt(o.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Subscriptions */}
            {subscriptions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" /> Active Subscriptions
                    <Badge variant="secondary" className="ml-auto">{subscriptions.filter((s: any) => s.status === "active").length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {subscriptions.map((sub: any) => (
                    <div key={sub.stripe_subscription_id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/10">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{sub.product_name}</span>
                          <Badge variant={sub.status === "active" ? "default" : "secondary"} className="text-xs">
                            {sub.cancel_at_period_end ? "Cancels at period end" : sub.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {fmt(sub.amount ?? 0)}/mo · {sub.cancel_at_period_end ? "Ends" : "Renews"} {sub.current_period_end ? fmtDate(sub.current_period_end) : "—"}
                        </p>
                      </div>
                      {sub.status === "active" && !sub.cancel_at_period_end && (
                        <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 text-xs"
                          onClick={() => cancelSubMutation.mutate(sub.stripe_subscription_id)}
                          disabled={cancelSubMutation.isPending}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
