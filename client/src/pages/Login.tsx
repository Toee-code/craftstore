import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { apiRequest } from "@/lib/queryClient";
import { useAuthStore } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface LoginForm { email: string; password: string; }

export default function Login() {
  const [, navigate] = useLocation();
  const { setUser } = useAuthStore();
  const { toast } = useToast();
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();

  const mutation = useMutation({
    mutationFn: (data: LoginForm) => apiRequest("POST", "/api/auth/login", data),
    onSuccess: async (res) => {
      const user = await res.json();
      setUser(user);
      navigate("/dashboard");
    },
    onError: async (err: any) => {
      toast({ title: "Login failed", description: "Invalid email or password.", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 pixel-bg">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <svg viewBox="0 0 36 36" width="32" height="32" fill="none">
            <rect x="2" y="2" width="14" height="14" rx="2" fill="hsl(142 71% 45%)" />
            <rect x="20" y="2" width="14" height="14" rx="2" fill="hsl(142 71% 45% / 0.4)" />
            <rect x="2" y="20" width="14" height="14" rx="2" fill="hsl(142 71% 45% / 0.4)" />
            <rect x="20" y="20" width="14" height="14" rx="2" fill="hsl(45 93% 58%)" />
          </svg>
          <Link href="/"><span className="font-bold text-xl tracking-tight cursor-pointer">CraftStore</span></Link>
        </div>
        <Card className="border-border/60 bg-card">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>Sign in to manage your stores</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  data-testid="input-email"
                  {...register("email", { required: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  data-testid="input-password"
                  {...register("password", { required: true })}
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={mutation.isPending}
                data-testid="button-login"
              >
                {mutation.isPending ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-6">
              Don't have an account?{" "}
              <Link href="/register"><span className="text-primary hover:underline cursor-pointer">Sign up free</span></Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
