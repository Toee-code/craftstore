import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, Tag, DollarSign, AlertCircle } from "lucide-react";

export default function CreatorClaim() {
  // Parse ?code=XXX&server=1 — wouter puts query params into window.location.search
  // when navigating via hash router, so check both places
  const [location] = useLocation();
  const params = new URLSearchParams(
    window.location.search ||
    (window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "")
  );

  const [code, setCode] = useState(params.get("code") || "");
  const [serverId, setServerId] = useState(params.get("server") || "");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [info, setInfo] = useState<{ creatorName: string; totalEarned: number; hasPendingClaim: boolean; serverName: string } | null>(null);
  const [infoError, setInfoError] = useState("");
  const [infoLoading, setInfoLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Auto-lookup if code + server pre-filled from URL
  useEffect(() => {
    if (code && serverId) lookupCode();
  }, []);

  const lookupCode = async () => {
    if (!code.trim() || !serverId.trim()) return;
    setInfoLoading(true);
    setInfoError("");
    setInfo(null);
    try {
      const r = await apiRequest("GET", `/api/creator-codes/info?code=${encodeURIComponent(code.trim())}&serverId=${serverId.trim()}`);
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || "Code not found"); }
      setInfo(await r.json());
    } catch (e: any) { setInfoError(e.message); }
    finally { setInfoLoading(false); }
  };

  const handleSubmit = async () => {
    if (!paypalEmail.trim() || !info) return;
    setSubmitLoading(true);
    setSubmitError("");
    try {
      const r = await apiRequest("POST", "/api/creator-codes/claim", {
        code: code.trim(),
        serverId: Number(serverId),
        paypalEmail: paypalEmail.trim(),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to submit claim");
      setSubmitted(true);
    } catch (e: any) { setSubmitError(e.message); }
    finally { setSubmitLoading(false); }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0b0f 0%, #0f1117 50%, #0a0c10 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px 16px",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 420,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 20, padding: "32px 28px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
      }}>
        {submitted ? (
          /* ── Success state ── */
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{
              width: 64, height: 64, borderRadius: "50%", margin: "0 auto 20px",
              background: "rgba(34,197,94,0.15)", border: "2px solid rgba(34,197,94,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <CheckCircle2 style={{ width: 32, height: 32, color: "#22c55e" }} />
            </div>
            <h2 style={{ color: "#fff", fontWeight: 900, fontSize: 22, marginBottom: 8 }}>Claim Submitted!</h2>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, lineHeight: 1.6 }}>
              The server owner has been notified. Once they send payment to your PayPal, your earnings will be marked as paid.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <DollarSign style={{ width: 20, height: 20, color: "#818cf8" }} />
              </div>
              <div>
                <h1 style={{ color: "#fff", fontWeight: 900, fontSize: 18, margin: 0 }}>Creator Earnings</h1>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0 }}>Claim your referral earnings</p>
              </div>
            </div>

            {/* Step 1: Code lookup */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 10 }}>
                <Label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 4, display: "block" }}>Your Creator Code</Label>
                <Input
                  placeholder="e.g. BILLY10"
                  value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase()); setInfo(null); setInfoError(""); }}
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontFamily: "monospace", fontWeight: 700, letterSpacing: 1 }}
                />
              </div>
              {/* Show server ID field only if not pre-filled from URL */}
              {!params.get("server") && (
                <div style={{ marginBottom: 10 }}>
                  <Label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 4, display: "block" }}>Server ID</Label>
                  <Input
                    placeholder="1"
                    value={serverId}
                    onChange={e => { setServerId(e.target.value); setInfo(null); setInfoError(""); }}
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
                  />
                </div>
              )}
              <Button
                style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" }}
                onClick={lookupCode}
                disabled={!code.trim() || !serverId.trim() || infoLoading}
                variant="ghost"
              >
                {infoLoading ? <><Loader2 style={{ width: 14, height: 14, marginRight: 6 }} className="animate-spin" />Checking…</> : <><Tag style={{ width: 14, height: 14, marginRight: 6 }} />Look Up Code</>}
              </Button>
              {infoError && (
                <p style={{ color: "#ef4444", fontSize: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertCircle style={{ width: 12, height: 12, flexShrink: 0 }} /> {infoError}
                </p>
              )}
            </div>

            {/* Code info card */}
            {info && (
              <div style={{
                background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)",
                borderRadius: 12, padding: "14px 16px", marginBottom: 16,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Server</span>
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{info.serverName}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Creator</span>
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{info.creatorName}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Available to claim</span>
                  <span style={{ color: "#22c55e", fontWeight: 900, fontSize: 20 }}>
                    £{(info.totalEarned / 100).toFixed(2)}
                  </span>
                </div>
                {info.hasPendingClaim && (
                  <p style={{ color: "#f59e0b", fontSize: 11, marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
                    <AlertCircle style={{ width: 11, height: 11 }} /> You have a pending claim — wait for the owner to process it.
                  </p>
                )}
              </div>
            )}

            {/* Step 2: PayPal + submit */}
            {info && !info.hasPendingClaim && info.totalEarned > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <Label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 4, display: "block" }}>PayPal Email <span style={{ color: "rgba(255,255,255,0.3)" }}>(we'll send payment here)</span></Label>
                  <Input
                    type="email"
                    placeholder="you@paypal.com"
                    value={paypalEmail}
                    onChange={e => setPaypalEmail(e.target.value)}
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
                  />
                </div>
                {submitError && (
                  <p style={{ color: "#ef4444", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <AlertCircle style={{ width: 12, height: 12 }} /> {submitError}
                  </p>
                )}
                <Button
                  style={{ background: "#22c55e", color: "#fff", fontWeight: 800 }}
                  disabled={!paypalEmail.trim() || submitLoading}
                  onClick={handleSubmit}
                >
                  {submitLoading
                    ? <><Loader2 style={{ width: 14, height: 14, marginRight: 6 }} className="animate-spin" />Submitting…</>
                    : <>Request Payout — £{(info.totalEarned / 100).toFixed(2)}</>}
                </Button>
              </div>
            )}

            {info && info.totalEarned <= 0 && (
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", padding: "8px 0" }}>
                No earnings yet — share your code to start earning!
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
