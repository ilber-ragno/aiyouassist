import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../lib/api';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      tenant: null,
      token: null,
      isAuthenticated: false,
      activeProfileSlug: null, // currently selected profile slug

      login: async (email, password) => {
        const { data } = await api.post('/auth/login', { email, password });
        const profileSlug = data.tenant?.view_profile?.slug || 'comum';
        set({
          user: data.user,
          tenant: data.tenant,
          token: data.token,
          isAuthenticated: true,
          activeProfileSlug: get().activeProfileSlug || profileSlug,
        });
        api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
        return data;
      },

      register: async (formData) => {
        const { data } = await api.post('/auth/register', formData);
        set({
          user: data.user,
          tenant: data.tenant,
          token: data.token,
          isAuthenticated: true,
          activeProfileSlug: data.tenant?.view_profile?.slug || 'comum',
        });
        api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
        return data;
      },

      logout: () => {
        set({
          user: null,
          tenant: null,
          token: null,
          isAuthenticated: false,
          activeProfileSlug: null,
        });
        delete api.defaults.headers.common['Authorization'];
      },

      refreshUser: async () => {
        const { data } = await api.get('/auth/me');
        const currentSlug = get().activeProfileSlug;
        set({
          user: data.user,
          tenant: data.tenant,
          activeProfileSlug: currentSlug || data.tenant?.view_profile?.slug || 'comum',
        });
      },

      setActiveProfile: (slug) => {
        set({ activeProfileSlug: slug });
      },

      getActiveProfile: () => {
        const state = get();
        const slug = state.activeProfileSlug;
        const profiles = state.tenant?.available_profiles || [];
        return profiles.find(p => p.slug === slug) || profiles[0] || null;
      },

      getVisibleMenuItems: () => {
        const state = get();
        const profile = state.getActiveProfile();
        return profile?.menu_items || [];
      },
    }),
    {
      name: 'aiyou-auth',
      partialize: (state) => ({
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        activeProfileSlug: state.activeProfileSlug,
      }),
    }
  )
);
