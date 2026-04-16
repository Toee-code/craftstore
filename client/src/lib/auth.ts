import { create } from "zustand";

interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
}

// Simple in-memory auth state (no localStorage — sandboxed)
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
