import { Switch, Route, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import ServerSetup from "@/pages/ServerSetup";
import ServerDashboard from "@/pages/ServerDashboard";
import StoreFront from "@/pages/StoreFront";
import PresetSuccess from "@/pages/PresetSuccess";
import DomainSuccess from "@/pages/DomainSuccess";
import AdminPanel from "@/pages/AdminPanel";
import PlayerProfile from "@/pages/PlayerProfile";
import NotFound from "@/pages/not-found";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/auth";

// Detect if we're on a subdomain like myserver.craftstore.org.uk
function getSubdomain(): string | null {
  const host = window.location.hostname;
  const rootDomain = "craftstore.org.uk";
  if (host === rootDomain || host === `www.${rootDomain}` || host === "localhost") return null;
  if (host.endsWith(`.${rootDomain}`)) {
    return host.replace(`.${rootDomain}`, "");
  }
  return null;
}

function SubdomainRedirect() {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const slug = getSubdomain();
    if (!slug) { setLoading(false); return; }
    apiRequest("GET", `/api/subdomain/resolve/${slug}`)
      .then(r => r.json())
      .then(data => {
        if (data.serverId) {
          navigate(`/store/${data.serverId}`);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading store...</div>;
  return null;
}

function AuthHydrator() {
  const { hydrate, user, hydrated } = useAuthStore();
  const [, navigate] = useLocation();

  useEffect(() => { hydrate(); }, []);

  // Once hydration completes, if user is restored and we're on the landing/login page, go to dashboard
  useEffect(() => {
    if (!hydrated) return;
    if (!user) return;
    const hash = window.location.hash; // e.g. "" or "#/" or "#/login"
    const isRootOrLogin = hash === '' || hash === '#' || hash === '#/' || hash === '#/login';
    if (isRootOrLogin) {
      navigate('/dashboard');
    }
  }, [hydrated, user]);

  return null;
}

export default function App() {
  const subdomain = getSubdomain();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthHydrator />
      <Router hook={useHashLocation}>
        {subdomain ? (
          <SubdomainRedirect />
        ) : null}
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/servers/new" component={ServerSetup} />
          <Route path="/servers/:id" component={ServerDashboard} />
          <Route path="/store/:serverId" component={StoreFront} />
          <Route path="/store/:serverId/profile" component={PlayerProfile} />
          <Route path="/preset-success" component={PresetSuccess} />
          <Route path="/domain-success" component={DomainSuccess} />
          <Route path="/admin" component={AdminPanel} />
          <Route component={NotFound} />
        </Switch>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}
