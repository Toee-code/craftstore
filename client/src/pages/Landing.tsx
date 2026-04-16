import { Link } from "wouter";
import { ShoppingBag, Zap, Bell, BarChart3, Shield, ArrowRight, Package, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const LOGO = (
  <svg viewBox="0 0 36 36" width="36" height="36" fill="none" aria-label="CraftStore logo">
    {/* Pickaxe + cart hybrid mark */}
    <rect x="2" y="2" width="14" height="14" rx="2" fill="hsl(142 71% 45%)" />
    <rect x="20" y="2" width="14" height="14" rx="2" fill="hsl(142 71% 45% / 0.4)" />
    <rect x="2" y="20" width="14" height="14" rx="2" fill="hsl(142 71% 45% / 0.4)" />
    <rect x="20" y="20" width="14" height="14" rx="2" fill="hsl(45 93% 58%)" />
    {/* cross line */}
    <path d="M9 9 h18 M18 2 v32" stroke="hsl(220 13% 9%)" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const features = [
  { icon: ShoppingBag, title: "Beautiful Storefronts", desc: "Each server gets a branded shop page players can browse from any device." },
  { icon: Zap, title: "Instant In-Game Delivery", desc: "Purchases fire a webhook to your Minecraft plugin and run the command immediately." },
  { icon: Bell, title: "Push Notifications", desc: "Get notified on your phone the moment a player completes a purchase." },
  { icon: BarChart3, title: "Revenue Dashboard", desc: "Track sales, revenue, and top products in real time from your owner dashboard." },
  { icon: Users, title: "Player Management", desc: "Manage player balances, view purchase history, and add members to your server." },
  { icon: Shield, title: "Secure Webhooks", desc: "Every webhook delivery is signed with a secret key so only you can verify it." },
];

const steps = [
  { n: "01", title: "Create your store", desc: "Sign up, add your server, and configure your webhook URL." },
  { n: "02", title: "Add products", desc: "List items with a name, price, and the in-game command to run on purchase." },
  { n: "03", title: "Players buy", desc: "Share your store link. Players browse, top up their balance, and buy." },
  { n: "04", title: "Command runs instantly", desc: "Your plugin receives the webhook and executes the command in-game." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="border-b border-border/60 sticky top-0 z-50 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {LOGO}
            <span className="font-bold text-lg tracking-tight">CraftStore</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                Get started free
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pixel-bg relative overflow-hidden border-b border-border/40">
        <div className="max-w-6xl mx-auto px-6 py-28 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-4 py-1.5 text-sm text-primary font-medium mb-8">
            <Zap className="w-3.5 h-3.5" />
            Webhook-powered delivery — commands run in milliseconds
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            The Minecraft server shop<br />
            <span className="text-primary">your players actually want</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
            Set up a beautiful store for your Minecraft server in minutes. Players buy items, your plugin runs the command instantly. Track everything from your dashboard.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/register">
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 glow-emerald px-8 gap-2">
                Create your store <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/store/1">
              <Button size="lg" variant="outline" className="px-8">
                View demo store
              </Button>
            </Link>
          </div>
        </div>

        {/* Floating stat cards */}
        <div className="max-w-4xl mx-auto px-6 pb-16 grid grid-cols-3 gap-4">
          {[
            { label: "Avg. setup time", value: "< 5 min" },
            { label: "Command delivery", value: "< 500ms" },
            { label: "Payout method", value: "Stripe" },
          ].map(s => (
            <div key={s.label} className="stat-bar rounded-lg bg-card border border-border/60 p-4 text-center">
              <div className="text-2xl font-bold text-primary">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-3">How it works</h2>
          <p className="text-muted-foreground">From sign-up to first sale in under 10 minutes.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {steps.map((step) => (
            <div key={step.n} className="relative">
              <div className="text-5xl font-extrabold text-primary/10 mb-3 leading-none">{step.n}</div>
              <h3 className="font-semibold text-base mb-2">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border/40 bg-card/30">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-3">Everything you need</h2>
            <p className="text-muted-foreground">Built for Minecraft server owners who want a professional shop without the complexity.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="block-card rounded-xl bg-card p-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="border-t border-border/40 pixel-bg">
        <div className="max-w-3xl mx-auto px-6 py-24 text-center">
          <Package className="w-12 h-12 text-primary mx-auto mb-6" />
          <h2 className="text-3xl font-bold mb-4">Ready to open your store?</h2>
          <p className="text-muted-foreground mb-8">Create your store for free and start earning from your server today.</p>
          <Link href="/register">
            <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 px-10 gap-2 glow-emerald">
              Get started — it's free <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-card/20">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            {LOGO}
            <span className="font-semibold text-sm">CraftStore</span>
          </div>
          <p className="text-muted-foreground text-xs">© 2026 CraftStore. Not affiliated with Mojang or Microsoft.</p>
        </div>
      </footer>
    </div>
  );
}
