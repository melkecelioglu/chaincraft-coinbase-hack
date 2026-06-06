import { create } from 'zustand';
import api from '@/lib/api';
import type { Project } from '@/lib/types';

interface ProjectState {
  projects: Project[];
  selectedProjectId: string | null;
  isLoading: boolean;
  fetchProjects: () => Promise<void>;
  createProject: (name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  selectProject: (id: string | null) => void;
}

export const useProjectStore = create<ProjectState>()((set) => ({
  projects: [],
  selectedProjectId: null,
  isLoading: false,

  fetchProjects: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get<Project[]>('/projects');
      set({ projects: res.data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createProject: async (name: string) => {
    const res = await api.post<Project>('/projects', { name });
    set((state) => ({ projects: [...state.projects, res.data] }));
  },

  deleteProject: async (id: string) => {
    await api.delete(`/projects/${id}`);
    set((state) => ({
      projects: state.projects.filter((p) => p._id !== id),
      selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
    }));
  },

  selectProject: (id: string | null) => {
    set({ selectedProjectId: id });
  },
}));
