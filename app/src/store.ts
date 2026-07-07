import { create } from 'zustand';
import { SqlDatabase } from './db/database';
import { Method, Subject, User } from './domain/types';
import { methodsRepo, settingsRepo, subjectsRepo, usersRepo } from './db/repositories';
import { DEFAULT_SCORING_CONFIG, ScoringConfig } from './domain/normSelection/score';

export type Route =
  | { name: 'profiles' }
  | { name: 'subjects' }
  | { name: 'subject'; code: string }
  | { name: 'exam'; code: string }
  | { name: 'report'; code: string }
  | { name: 'norms' }
  | { name: 'methods' }
  | { name: 'settings' };

interface AppState {
  db: SqlDatabase | null;
  user: User | null;
  users: User[];
  methods: Method[];
  subjects: Subject[];
  scoring: ScoringConfig;
  route: Route;
  online: boolean;

  init(db: SqlDatabase): Promise<void>;
  refreshUsers(): Promise<void>;
  refreshMethods(): Promise<void>;
  refreshSubjects(): Promise<void>;
  refreshScoring(): Promise<void>;
  login(user: User): Promise<void>;
  logout(): void;
  go(route: Route): void;
  persist(): Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  db: null,
  user: null,
  users: [],
  methods: [],
  subjects: [],
  scoring: DEFAULT_SCORING_CONFIG,
  route: { name: 'profiles' },
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,

  async init(db) {
    set({ db });
    await get().refreshUsers();
    await get().refreshMethods();
    await get().refreshScoring();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => set({ online: true }));
      window.addEventListener('offline', () => set({ online: false }));
    }
  },

  async refreshUsers() {
    const { db } = get();
    if (!db) return;
    set({ users: await usersRepo.list(db) });
  },

  async refreshMethods() {
    const { db } = get();
    if (!db) return;
    set({ methods: await methodsRepo.list(db) });
  },

  async refreshSubjects() {
    const { db, user } = get();
    if (!db || !user) return;
    set({ subjects: await subjectsRepo.listVisible(db, user) });
  },

  async refreshScoring() {
    const { db } = get();
    if (!db) return;
    set({ scoring: await settingsRepo.getScoring(db) });
  },

  async login(user) {
    set({ user, route: { name: 'subjects' } });
    await get().refreshSubjects();
  },

  logout() {
    set({ user: null, route: { name: 'profiles' }, subjects: [] });
  },

  go(route) {
    set({ route });
  },

  async persist() {
    await get().db?.persist();
  },
}));
