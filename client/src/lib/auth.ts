import { create } from "zustand";
import { apiRequest } from "@/lib/queryClient";

interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  hydrated: boolean;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  hydrated: false,

  setUser: (user) => set({ user }),

  // Call on login — creates a server-side session token (stored as HttpOnly cookie)
  // Note: setUser is called first (from Login.tsx) then this is called to persist it
  logout: async () => {
    try {
      await apiRequest("DELETE", "/api/auth/session");
    } catch {}
    set({ user: null });
  },

  // Called once on app mount — restores session from HttpOnly cookie silently
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const res = await apiRequest("GET", "/api/auth/session");
      if (res.ok) {
        const data = await res.json();
        set({ user: data.user, hydrated: true });
        return;
      }
    } catch {}
    set({ hydrated: true });
  },
}));
