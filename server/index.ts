import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "30mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.set("trust proxy", 1); // Render / Railway sit behind a reverse proxy

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

// ── Auto subdomain: name-based (e.g. skyblock-network.craftstore.org.uk) ──────
const ROOT_HOST = (process.env.ROOT_DOMAIN || "craftstore.org.uk").replace(/^www\./, "");

function nameToSlug(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

app.use((req: any, _res: any, next: any) => {
  const host = ((req.headers.host as string) || "").replace(/:\d+$/, "");
  const bare = host.replace(/^www\./, "");
  if (bare !== ROOT_HOST && bare.endsWith("." + ROOT_HOST)) {
    req.craftSubdomain = bare.replace("." + ROOT_HOST, "");
  }
  next();
});

// Resolve subdomain → serverId by matching server name slug
app.get("/api/subdomain/resolve/:subdomain", (req: any, res: any) => {
  const slug = req.params.subdomain.toLowerCase();
  const allServers = storage.getAllServers();
  const match = allServers.find((s: any) => nameToSlug(s.name) === slug);
  if (!match) return res.status(404).json({ error: "Subdomain not found" });
  res.json({ serverId: match.id, serverName: match.name });
});

(async () => {
  await registerRoutes(httpServer, app);

  // ── Webhook retry queue ─────────────────────────────────────────────────
  // Every 5 minutes, retry failed webhook deliveries (up to 5 attempts each)
  setInterval(async () => {
    const pendingOrders = storage.getUndeliveredOrders();
    if (pendingOrders.length === 0) return;
    log(`[webhook-retry] Retrying ${pendingOrders.length} undelivered order(s)`, "retry");
    for (const order of pendingOrders) {
      const server = storage.getServerById(order.serverId);
      if (!server?.webhookUrl) {
        // No webhook configured — mark delivered so we don't retry forever
        storage.updateOrderStatus(order.id, "completed", true);
        continue;
      }
      const product = storage.getProductById(order.productId);
      const command = (product?.command || "").replace("{player}", order.minecraftUsername);
      try {
        const resp = await fetch(server.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CraftStore-Secret": server.webhookSecret || "" },
          body: JSON.stringify({
            event: "purchase",
            orderId: order.id,
            minecraftUsername: order.minecraftUsername,
            command,
            product: { id: order.productId, name: product?.name || "" },
            productName: product?.name || "",
            secret: server.webhookSecret,
          }),
        });
        if (resp.ok) {
          storage.updateOrderStatus(order.id, "completed", true);
          log(`[webhook-retry] Order ${order.id} delivered OK`, "retry");
        } else {
          storage.incrementWebhookRetry(order.id);
          log(`[webhook-retry] Order ${order.id} HTTP ${resp.status} (attempt ${order.webhookRetryCount + 1})`, "retry");
        }
      } catch (err: any) {
        storage.incrementWebhookRetry(order.id);
        log(`[webhook-retry] Order ${order.id} error: ${err?.message} (attempt ${order.webhookRetryCount + 1})`, "retry");
      }
    }
  }, 5 * 60 * 1000); // 5 minutes

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
