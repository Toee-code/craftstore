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

const LS_KEY = "cs_token";

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  hydrated: false,

  setUser: (user) => {
    set({ user });
    // Token is saved separately after login via saveToken()
  },

  logout: () => {
    try {
      const token = localStorage.getItem(LS_KEY);
      if (token) fetch('/api/auth/session', { method: 'DELETE', headers: { 'x-session-token': token } });
      localStorage.removeItem(LS_KEY);
    } catch {}
    set({ user: null });
  },

  // Called once on app mount — silently restores session from localStorage token
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const token = localStorage.getItem(LS_KEY);
      if (token) {
        const res = await fetch('/api/auth/session', {
          headers: { 'x-session-token': token }
        });
        if (res.ok) {
          const data = await res.json();
          set({ user: data.user, hydrated: true });
          return;
        }
        // Token invalid/expired
        localStorage.removeItem(LS_KEY);
      }
    } catch {}
    set({ hydrated: true });
  },
}));

// Called from Login.tsx after successful login to persist the session
export async function saveSession(userId: number) {
  try {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem(LS_KEY, data.token);
    }
  } catch {}
}
