import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/lib/api';
import type { UserProfile } from '@/lib/types';

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  setToken: (token: string) => void;
  logout: () => void;
  fetchUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,

      setToken: (token: string) => {
        set({ token });
      },

      logout: () => {
        set({ token: null, user: null });
      },

      fetchUser: async () => {
        const res = await api.get<UserProfile>('/auth/user');
        set({ user: res.data });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    },
  ),
);
