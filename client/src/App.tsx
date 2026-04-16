import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
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
import NotFound from "@/pages/not-found";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/servers/new" component={ServerSetup} />
          <Route path="/servers/:id" component={ServerDashboard} />
          <Route path="/store/:serverId" component={StoreFront} />
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
