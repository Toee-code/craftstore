/**
 * PresetSuccess — landing page after Stripe checkout redirect.
 * URL: /#/preset-success?session_id=XXX&serverId=1
 *
 * In demo mode (no real Stripe key), session_id starts with "demo_".
 * Calls POST /api/stripe/confirm to verify + auto-activate the preset.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, Loader2, AlertCircle, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConfirmResult {
  success: boolean;
  preset?: { id: number; name: string; animationStyle: string; accentColor: string };
  alreadyConfirmed?: boolean;
  demoMode?: boolean;
  error?: string;
}

export default function PresetSuccess() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const sessionId = params.get("session_id") || "";
  const serverId = params.get("serverId") || "";

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [result, setResult] = useState<ConfirmResult | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      setResult({ success: false, error: "No session ID found in URL." });
      return;
    }

    apiRequest("POST", "/api/stripe/confirm", { sessionId, serverId: Number(serverId) })
      .then(async r => {
        const data: ConfirmResult = await r.json();
        if (r.ok && data.success) {
          setStatus("success");
          setResult(data);
        } else {
          setStatus("error");
          setResult(data);
        }
      })
      .catch(() => {
        setStatus("error");
        setResult({ success: false, error: "Failed to confirm purchase. Please contact support." });
      });
  }, [sessionId]);

  const accentColor = result?.preset?.accentColor || "#22c55e";

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Confirming your purchase…</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center max-w-sm space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h2 className="font-bold text-lg">Something went wrong</h2>
          <p className="text-muted-foreground text-sm">{result?.error || "Could not confirm this purchase."}</p>
          {serverId && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => navigate(`/servers/${serverId}?tab=presets`)}
              data-testid="button-back-to-presets"
            >
              Back to Presets
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-8 text-center">
        {/* Success icon with glow */}
        <div className="relative inline-block">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center mx-auto"
            style={{ background: accentColor + "18", border: `2px solid ${accentColor}40` }}
          >
            <CheckCircle2 className="w-12 h-12" style={{ color: accentColor }} />
          </div>
          <div
            className="absolute inset-0 rounded-full blur-xl opacity-30"
            style={{ background: accentColor }}
          />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold">Preset Unlocked!</h1>
          {result?.preset && (
            <p className="text-muted-foreground">
              <span className="font-semibold" style={{ color: accentColor }}>{result.preset.name}</span>
              {" "}has been activated on your store.
            </p>
          )}
          {result?.alreadyConfirmed && (
            <p className="text-xs text-muted-foreground">This preset was already active — no changes made.</p>
          )}
          {result?.demoMode && (
            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 text-xs text-yellow-400 mt-2">
              Demo mode — no real payment was processed. Add a Stripe key to enable live purchases.
            </div>
          )}
        </div>

        {/* Preset preview strip */}
        {result?.preset && (
          <div
            className="rounded-xl p-5 space-y-3"
            style={{ background: accentColor + "12", border: `1px solid ${accentColor}30` }}
          >
            <div className="flex items-center justify-center gap-3">
              <Sparkles className="w-5 h-5" style={{ color: accentColor }} />
              <span className="font-bold">{result.preset.name}</span>
            </div>
            <div className="flex justify-center gap-2 text-xs text-muted-foreground">
              <span className="px-2 py-1 rounded-full bg-muted/30 capitalize">
                {result.preset.animationStyle.replace("_", " ")} animation
              </span>
              <span
                className="px-2 py-1 rounded-full font-mono"
                style={{ background: accentColor + "20", color: accentColor }}
              >
                {result.preset.accentColor}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {serverId && (
            <Button
              onClick={() => navigate(`/servers/${serverId}?tab=presets`)}
              style={{ background: accentColor, color: "#000" }}
              className="gap-2 font-semibold"
              data-testid="button-go-to-dashboard"
            >
              <ArrowRight className="w-4 h-4" /> Go to Dashboard
            </Button>
          )}
          {serverId && (
            <Button
              variant="outline"
              onClick={() => navigate(`/store/${serverId}`)}
              data-testid="button-view-store"
            >
              View My Store
            </Button>
          )}
          {!serverId && (
            <Button
              onClick={() => navigate("/dashboard")}
              style={{ background: accentColor, color: "#000" }}
              className="gap-2 font-semibold"
            >
              <ArrowRight className="w-4 h-4" /> Dashboard
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
