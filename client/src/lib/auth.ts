import { create } from "zustand";

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
  logout: () => void;
  hydrate: () => Promise<void>;
}

const LS_KEY = "cs_uid";

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  hydrated: false,

  setUser: (user) => {
    if (user) {
      try { localStorage.setItem(LS_KEY, String(user.id)); } catch {}
    }
    set({ user });
  },

  logout: () => {
    try { localStorage.removeItem(LS_KEY); } catch {}
    set({ user: null });
  },

  // Called once on app mount — silently restores session from localStorage
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const uid = localStorage.getItem(LS_KEY);
      if (uid) {
        const res = await fetch(`/api/auth/me/${uid}`);
        if (res.ok) {
          const user = await res.json();
          set({ user, hydrated: true });
          return;
        }
        // Stale entry — clear it
        localStorage.removeItem(LS_KEY);
      }
    } catch {}
    set({ hydrated: true });
  },
}));
