import { useState, useEffect } from "react";
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
  ChevronRight, Loader2, Gift, Globe, CheckCircle2
} from "lucide-react";
import StoreAppearance from "./StoreAppearance";
import StorePresets from "./StorePresets";
import type { Product, Member, Order, Server } from "@shared/schema";

interface ProductForm {
  name: string; description: string; price: number;
  command: string; category: string; stock: number; imageUrl: string;
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

// ─── Domain Tab ──────────────────────────────────────────────────────────────
function DomainTab({ serverId }: { serverId: number; server?: Server }) {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [customDomain, setCustomDomain] = useState("");
  const [purchasing, setPurchasing] = useState(false);

  // Own query so it re-fetches independently after activation
  const { data: serverData, refetch } = useQuery<any>({
    queryKey: ["/api/servers", serverId, "domain-tab"],
    queryFn: () => apiRequest("GET", `/api/servers/${serverId}`).then(r => r.json()),
  });

  // domainPlanActive can be true (boolean) or 1 (integer from SQLite) — normalise
  const domainActive = serverData ? (serverData.domainPlanActive === true || serverData.domainPlanActive === 1) : false;
  const currentDomain = serverData?.customDomain || "";
  const slugDomain = serverData?.slugDomain || null;

  useEffect(() => {
    if (currentDomain) setCustomDomain(currentDomain);
  }, [currentDomain]);

  const saveDomainMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/servers/${serverId}/domain`, { customDomain }).then(r => r.json()),
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId] });
      toast({ title: "Domain saved", description: "Your custom domain has been updated." });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const startCheckout = async () => {
    if (!user) return;
    setPurchasing(true);
    try {
      const res = await apiRequest("POST", "/api/stripe/domain-checkout", {
        ownerId: user.id, serverId,
      }).then(r => r.json());
      if (res.url) {
        window.location.href = res.url;
      } else if (res.demoMode) {
        // Demo: auto-confirm then re-fetch
        await apiRequest("POST", "/api/stripe/domain-confirm", { sessionId: res.sessionId });
        await refetch();
        qc.invalidateQueries({ queryKey: ["/api/servers", serverId] });
        toast({ title: "Domain plan activated", description: "Set your custom domain below." });
      }
    } catch {
      toast({ title: "Checkout failed", variant: "destructive" });
    } finally { setPurchasing(false); }
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="font-semibold">Your Store Domain</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Every store gets a free subdomain. Upgrade for a fully custom domain.
        </p>
      </div>

      {/* Free slug domain — always active */}
      {slugDomain && (
        <Card className="bg-primary/5 border-primary/30">
          <CardContent className="pt-5 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Free Domain — Always Active</p>
                <p className="text-xs text-muted-foreground mt-0.5">Your store is available at this address right now.</p>
              </div>
            </div>
            <div className="rounded-lg bg-background/60 border border-primary/20 px-4 py-2.5 flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary shrink-0" />
              <span className="font-mono text-sm text-primary">{slugDomain}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan status */}
      <Card className="bg-card border-border/60">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-3">
            {domainActive ? (
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-primary" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <Globe className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div>
              <p className="font-semibold text-sm">{domainActive ? "Domain Plan Active" : "Domain Plan"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {domainActive ? "Your plan is active — set your domain below." : "£4.99/month · Host at your own domain"}
              </p>
            </div>
            {!domainActive && (
              <Button
                size="sm"
                className="ml-auto"
                onClick={startCheckout}
                disabled={purchasing}
                data-testid="button-buy-domain-plan"
              >
                {purchasing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Globe className="w-3.5 h-3.5 mr-1.5" />Buy Plan</>}
              </Button>
            )}
          </div>

          {/* Domain input — only shown once plan is active */}
          {domainActive && (
            <div className="space-y-3 pt-2 border-t border-border/40">
              <div>
                <Label className="text-sm">Your Custom Domain</Label>
                <div className="flex gap-2 mt-1.5">
                  <Input
                    value={customDomain}
                    onChange={e => setCustomDomain(e.target.value)}
                    placeholder="shop.yourserver.net"
                    className="font-mono text-sm"
                    data-testid="input-custom-domain"
                  />
                  <Button
                    size="sm"
                    onClick={() => saveDomainMutation.mutate()}
                    disabled={saveDomainMutation.isPending || !customDomain.trim()}
                    data-testid="button-save-domain"
                  >
                    {saveDomainMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </div>
              {/* CNAME instructions */}
              <div className="rounded-lg bg-muted/30 p-4 text-xs space-y-2">
                <p className="font-semibold text-foreground">DNS Setup Instructions</p>
                <p className="text-muted-foreground">Add a CNAME record in your DNS provider pointing to CraftStore:</p>
                <div className="font-mono bg-background rounded p-2 space-y-1 text-foreground">
                  <p><span className="text-primary">Type:</span> CNAME</p>
                  <p><span className="text-primary">Name:</span> {customDomain.split(".")[0] || "shop"}</p>
                  <p><span className="text-primary">Value:</span> stores.craftstore.dev</p>
                  <p><span className="text-primary">TTL:</span> 3600</p>
                </div>
                <p className="text-muted-foreground">DNS changes can take up to 24 hours to propagate.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* What you get */}
      {!domainActive && (
        <Card className="bg-card border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">What's included</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              "Your store at your own domain (e.g. shop.yourserver.net)",
              "SSL certificate automatically provisioned",
              "Custom domain shown to players instead of craftstore.dev",
              "Cancel anytime from your dashboard",
            ].map(f => (
              <div key={f} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span className="text-muted-foreground">{f}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ServerDashboard() {
  const { id } = useParams<{ id: string }>();
  const serverId = Number(id);
  const [, navigate] = useLocation();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [statsMember, setStatsMember] = useState<string | null>(null);

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

  // Add product
  const productForm = useForm<ProductForm>();
  const addProduct = useMutation({
    mutationFn: (data: ProductForm) =>
      apiRequest("POST", `/api/servers/${serverId}/products`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "products"] });
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "stats"] });
      setAddProductOpen(false);
      productForm.reset();
      toast({ title: "Product added" });
    },
  });

  const deleteProduct = useMutation({
    mutationFn: (pid: number) => apiRequest("DELETE", `/api/products/${pid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "products"] });
      qc.invalidateQueries({ queryKey: ["/api/servers", serverId, "stats"] });
    },
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
              <span className="font-bold text-sm">{server?.name || "Loading…"}</span>
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
            <TabsTrigger value="products" data-testid="tab-products">Products</TabsTrigger>
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
            <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
          </TabsList>

          {/* Products Tab */}
          <TabsContent value="products">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold">Products ({products.length})</h2>
              <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5" data-testid="button-add-product">
                    <Plus className="w-3.5 h-3.5" /> Add Product
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border/60">
                  <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>
                  <form onSubmit={productForm.handleSubmit((d) => addProduct.mutate(d))} className="space-y-4">
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
                      <p className="text-xs text-muted-foreground">Use <code className="text-primary">{"{player}"}</code> as a placeholder for the buyer's Minecraft username.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Category</Label>
                        <Input placeholder="Weapons" {...productForm.register("category")} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Stock (-1 = unlimited)</Label>
                        <Input type="number" defaultValue={-1} {...productForm.register("stock", { valueAsNumber: true })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Image URL (optional)</Label>
                      <Input placeholder="https://…" {...productForm.register("imageUrl")} />
                    </div>
                    <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={addProduct.isPending}>
                      {addProduct.isPending ? "Adding…" : "Add product"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            {products.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-border/60 rounded-xl">
                <Package className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No products yet — add your first one</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map(p => (
                  <Card key={p.id} className="block-card bg-card border-border/60" data-testid={`card-product-${p.id}`}>
                    {p.imageUrl && (
                      <div className="h-32 overflow-hidden rounded-t-xl">
                        <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold text-sm">{p.name}</h3>
                          {p.category && <Badge variant="outline" className="text-xs mt-1">{p.category}</Badge>}
                        </div>
                        <span className="text-primary font-bold">£{p.price.toFixed(2)}</span>
                      </div>
                      {p.description && <p className="text-muted-foreground text-xs mb-3 line-clamp-2">{p.description}</p>}
                      <div className="bg-muted/30 rounded-md p-2 mb-3">
                        <code className="text-xs text-primary/80 font-mono line-clamp-1">{p.command}</code>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {p.stock === -1 ? "Unlimited stock" : `${p.stock} left`}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => deleteProduct.mutate(p.id)}
                          data-testid={`button-delete-product-${p.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
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
          <TabsContent value="settings">
            <div className="max-w-xl space-y-6">
              <Card className="bg-card border-border/60">
                <CardHeader><CardTitle className="text-base">Webhook Configuration</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Webhook Secret</Label>
                    <div className="flex gap-2 mt-1.5">
                      <Input value={server?.webhookSecret || ""} readOnly className="font-mono text-xs" />
                      <Button
                        size="sm" variant="outline"
                        onClick={() => { navigator.clipboard.writeText(server?.webhookSecret || ""); toast({ title: "Copied!" }); }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">Use this to verify webhook deliveries in your plugin (check the X-CraftStore-Secret header).</p>
                  </div>
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
