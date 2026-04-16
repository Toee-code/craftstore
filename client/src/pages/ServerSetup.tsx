import { Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useAuthStore } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Info } from "lucide-react";

interface ServerForm {
  name: string;
  description: string;
  webhookUrl: string;
}

export default function ServerSetup() {
  const [, navigate] = useLocation();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm<ServerForm>();

  const mutation = useMutation({
    mutationFn: (data: ServerForm) =>
      apiRequest("POST", "/api/servers", { ...data, ownerId: user?.id }).then(r => r.json()),
    onSuccess: (server) => {
      qc.invalidateQueries({ queryKey: ["/api/servers", user?.id] });
      toast({ title: "Server created!", description: "Your store is ready to configure." });
      navigate(`/servers/${server.id}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Could not create server.", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-xl mx-auto">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-1.5 mb-6">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
          </Button>
        </Link>
        <Card className="border-border/60 bg-card">
          <CardHeader>
            <CardTitle>Add a server</CardTitle>
            <CardDescription>Connect your Minecraft server to start selling.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
              <div className="space-y-1.5">
                <Label>Server name</Label>
                <Input placeholder="e.g. SkyBlock Network" data-testid="input-server-name" {...register("name", { required: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea placeholder="Tell players what your server is about…" rows={3} {...register("description")} />
              </div>
              <div className="space-y-1.5">
                <Label>Plugin Webhook URL <span className="text-muted-foreground">(optional)</span></Label>
                <Input placeholder="https://your-server.com/webhook" data-testid="input-webhook-url" {...register("webhookUrl")} />
                <div className="flex gap-2 items-start bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                  <span>Your Minecraft plugin should expose an HTTP endpoint here. CraftStore will POST the command to run whenever a player purchases.</span>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={mutation.isPending}
                data-testid="button-create-server"
              >
                {mutation.isPending ? "Creating…" : "Create server"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
