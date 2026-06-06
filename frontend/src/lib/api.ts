import axios from 'axios';
import { useAuthStore } from '@/stores/auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach JWT token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('auth-storage');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const token = parsed?.state?.token;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch {
        // ignore parse errors
      }
    }
  }
  return config;
});

// Response interceptor: handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isAuthRoute =
      url.includes('/auth/nonce') || url.includes('/auth/verify');
    if (
      error.response?.status === 401 &&
      typeof window !== 'undefined' &&
      !isAuthRoute
    ) {
      useAuthStore.getState().logout();
      // Don't redirect — wallet disconnect will handle state
    }
    return Promise.reject(error);
  },
);

export default api;
