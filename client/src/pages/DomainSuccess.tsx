/**
 * DomainSuccess — shown after a successful domain plan purchase via Stripe.
 * Auto-confirms the checkout and redirects owner back to their server dashboard.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, Loader2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DomainSuccess() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    const sessionId = params.get("session_id");
    const serverId = params.get("serverId");

    if (!sessionId || !serverId) {
      setStatus("error");
      return;
    }

    apiRequest("POST", "/api/stripe/domain-confirm", { sessionId })
      .then(r => r.json())
      .then(() => {
        setStatus("done");
        setTimeout(() => navigate(`/servers/${serverId}?tab=domain`), 2500);
      })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-sm px-6">
        {status === "loading" && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="font-semibold">Activating your domain plan…</p>
          </>
        )}
        {status === "done" && (
          <>
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-xl font-extrabold mb-2">Domain Plan Active!</h1>
            <p className="text-muted-foreground text-sm">
              You can now set your custom domain in the Domain tab of your server dashboard.
            </p>
            <p className="text-xs text-muted-foreground mt-3">Redirecting…</p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Globe className="w-8 h-8 text-destructive" />
            </div>
            <h1 className="text-xl font-extrabold mb-2">Something went wrong</h1>
            <p className="text-muted-foreground text-sm mb-4">
              We couldn't confirm your purchase. Please contact support or try again.
            </p>
            <Button onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
          </>
        )}
      </div>
    </div>
  );
}
