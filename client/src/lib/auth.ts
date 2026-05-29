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

// ── Simple cookie helpers (client-side, no HttpOnly) ──────────────────────────
function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  // Get root domain so cookie works across www. and subdomains
  const host = window.location.hostname;
  const isSecure = window.location.protocol === 'https:';
  const parts = host.split('.');
  const domain = parts.length > 1 ? parts.slice(-2).join('.') : host;
  const secureFlag = isSecure ? ';Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;domain=${domain};SameSite=Lax${secureFlag}`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name: string) {
  const host = window.location.hostname;
  const parts = host.split('.');
  const domain = parts.length > 1 ? parts.slice(-2).join('.') : host;
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${domain}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  hydrated: false,

  setUser: (user) => {
    if (user) {
      // Persist user ID in a 30-day cookie so we can restore on next visit
      setCookie("cs_uid", String(user.id), 30);
    }
    set({ user });
  },

  logout: () => {
    deleteCookie("cs_uid");
    set({ user: null });
  },

  // Called once on app mount — silently restores session from cookie
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const uid = getCookie("cs_uid");
      if (uid) {
        const res = await fetch(`/api/auth/me/${uid}`);
        if (res.ok) {
          const user = await res.json();
          set({ user, hydrated: true });
          return;
        }
        // Cookie is stale — clear it
        deleteCookie("cs_uid");
      }
    } catch {}
    set({ hydrated: true });
  },
}));
