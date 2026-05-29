import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Server, Settings, LogOut, Bell, ExternalLink, ShoppingBag } from "lucide-react";
import type { Server as ServerType, Notification } from "@shared/schema";
import { useEffect } from "react";

function NavBar({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuthStore();
  const { data: notifs = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", user?.id],
    queryFn: () => apiRequest("GET", `/api/notifications/${user?.id}`).then(r => r.json()),
    enabled: !!user,
    refetchInterval: 15000,
  });
  const unread = notifs.filter((n: Notification) => !n.read).length;

  return (
    <header className="border-b border-border/60 bg-background/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/"><div className="flex items-center gap-2 cursor-pointer">
          <svg viewBox="0 0 36 36" width="28" height="28" fill="none">
            <rect x="2" y="2" width="14" height="14" rx="2" fill="hsl(142 71% 45%)" />
            <rect x="20" y="2" width="14" height="14" rx="2" fill="hsl(142 71% 45% / 0.4)" />
            <rect x="2" y="20" width="14" height="14" rx="2" fill="hsl(142 71% 45% / 0.4)" />
            <rect x="20" y="20" width="14" height="14" rx="2" fill="hsl(45 93% 58%)" />
          </svg>
          <span className="font-bold text-sm">CraftStore</span>
        </div></Link>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
              <Bell className="w-4 h-4" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full text-[10px] text-primary-foreground flex items-center justify-center font-bold">
                  {unread}
                </span>
              )}
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout} className="gap-1.5">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { user, hydrated, logout: authLogout } = useAuthStore();

  useEffect(() => {
    if (hydrated && !user) navigate("/login");
  }, [user, hydrated]);

  const { data: myServers = [], isLoading } = useQuery<ServerType[]>({
    queryKey: ["/api/servers", user?.id],
    queryFn: () => apiRequest("GET", `/api/servers?ownerId=${user?.id}`).then(r => r.json()),
    enabled: !!user,
  });

  const logout = () => { authLogout(); navigate("/"); };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <NavBar onLogout={logout} />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Your Servers</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage your Minecraft store pages</p>
          </div>
          <Link href="/servers/new">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2" data-testid="button-new-server">
              <Plus className="w-4 h-4" /> Add Server
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-40 rounded-xl bg-card animate-pulse" />)}
          </div>
        ) : myServers.length === 0 ? (
          <div className="text-center py-24 border-2 border-dashed border-border/60 rounded-2xl">
            <Server className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No servers yet</h3>
            <p className="text-muted-foreground text-sm mb-6">Add your first Minecraft server to create a store for your players.</p>
            <Link href="/servers/new">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                <Plus className="w-4 h-4" /> Add your first server
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {myServers.map((server) => (
              <Card key={server.id} className="block-card bg-card border-border/60 cursor-pointer" data-testid={`card-server-${server.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Server className="w-5 h-5 text-primary" />
                    </div>
                    <Badge variant="outline" className="text-xs status-completed">Active</Badge>
                  </div>
                  <CardTitle className="text-base mt-3">{server.name}</CardTitle>
                  {server.description && (
                    <p className="text-muted-foreground text-sm line-clamp-2">{server.description}</p>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex gap-2">
                    <Link href={`/servers/${server.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full gap-1.5">
                        <Settings className="w-3.5 h-3.5" /> Manage
                      </Button>
                    </Link>
                    <Link href={`/store/${server.id}`}>
                      <Button size="sm" variant="ghost" className="gap-1.5">
                        <ExternalLink className="w-3.5 h-3.5" /> Store
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
