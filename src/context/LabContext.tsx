import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type {
  AppSettings,
  AssessmentUserSession,
  HistoricalPerformance,
  PersistedLabStoreV1,
  SessionRecord,
} from '../types/domain.ts';
import {
  clearPlayerSessionProfile,
  computeHistoricalPerformance,
  createPlayerSessionProfile,
  exportStoreToJson,
  getDefaultStore,
  importStoreFromJson,
  loadPersistedStore,
  loadPlayerSessionProfile,
  PLAYER_SESSION_STORAGE_KEY,
  savePersistedStore,
  savePlayerSessionProfile,
  STORAGE_KEY,
  updatePlayerSessionWithRecord,
  validatePlayerName,
} from '../storage/persistence.ts';

interface LabContextValue {
  store: PersistedLabStoreV1;
  settings: AppSettings;
  sessions: SessionRecord[];
  performance: HistoricalPerformance;
  playerProfile: AssessmentUserSession | null;
  onboardingModalOpen: boolean;
  openOnboardingModal: () => void;
  closeOnboardingModal: () => void;
  setPlayerName: (rawName: string) => { ok: boolean; error?: string };
  resetPlayerProfile: () => void;
  storageAvailable: boolean;
  storageWarning: string | null;
  dismissStorageWarning: () => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
  recordSession: (session: SessionRecord) => void;
  getSessionById: (sessionId: string) => SessionRecord | undefined;
  clearAllHistory: () => void;
  exportProgressJson: () => string;
  importProgressJson: (jsonString: string) => { ok: boolean; message: string };
}

const LabContext = createContext<LabContextValue | null>(null);

export const LabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialLoad = useMemo(() => loadPersistedStore(), []);
  const initialProfile = useMemo(() => loadPlayerSessionProfile(), []);
  const [store, setStore] = useState<PersistedLabStoreV1>(initialLoad.data);
  const [playerProfile, setPlayerProfile] = useState<AssessmentUserSession | null>(initialProfile);
  const [onboardingModalOpen, setOnboardingModalOpen] = useState<boolean>(() => {
    if (initialProfile) return false;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return false;
    }
    return true;
  });
  const [storageAvailable, setStorageAvailable] = useState<boolean>(initialLoad.storageAvailable);
  const [storageWarning, setStorageWarning] = useState<string | null>(initialLoad.warning ?? null);

  // Sync reducedMotion class on document.body & respect OS prefers-reduced-motion
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const osReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (store.settings.reducedMotion || osReduced) {
      document.body.classList.add('reduce-motion');
    } else {
      document.body.classList.remove('reduce-motion');
    }
  }, [store.settings.reducedMotion]);

  // Cross-tab storage synchronization so multiple tabs editing saved history stay consistent
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) {
        const latest = loadPersistedStore();
        setStore(latest.data);
        setStorageAvailable(latest.storageAvailable);
      }
      if (e.key === PLAYER_SESSION_STORAGE_KEY || e.key === null) {
        const latestProfile = loadPlayerSessionProfile();
        setPlayerProfile(latestProfile);
      }
    };
    window.addEventListener('storage', handleStorageEvent);
    return () => window.removeEventListener('storage', handleStorageEvent);
  }, []);

  const setPlayerName = useCallback(
    (rawName: string): { ok: boolean; error?: string } => {
      const check = validatePlayerName(rawName);
      if (!check.valid) {
        return { ok: false, error: check.error };
      }
      setPlayerProfile((prev) => {
        if (prev) {
          const updated: AssessmentUserSession = {
            ...prev,
            playerName: check.trimmedName,
            lastActive: new Date().toISOString(),
          };
          return savePlayerSessionProfile(updated);
        }
        const created = createPlayerSessionProfile(check.trimmedName);
        return savePlayerSessionProfile(created);
      });
      setOnboardingModalOpen(false);
      return { ok: true };
    },
    []
  );

  const openOnboardingModal = useCallback(() => {
    setOnboardingModalOpen(true);
  }, []);

  const closeOnboardingModal = useCallback(() => {
    setOnboardingModalOpen(false);
  }, []);

  const resetPlayerProfile = useCallback(() => {
    clearPlayerSessionProfile();
    setPlayerProfile(null);
    setOnboardingModalOpen(true);
  }, []);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setStore((prevStore) => {
      const nextSettings: AppSettings = {
        ...prevStore.settings,
        ...partial,
        practiceRules: {
          ...prevStore.settings.practiceRules,
          ...(partial.practiceRules ?? {}),
        },
      };
      const res = savePersistedStore({
        ...prevStore,
        settings: nextSettings,
      });
      setStorageAvailable(res.storageAvailable);
      if (res.warning) setStorageWarning(res.warning);
      return res.data;
    });
  }, []);

  const recordSession = useCallback((session: SessionRecord) => {
    setStore((prevStore) => {
      const existingFiltered = prevStore.sessions.filter((s) => s.sessionId !== session.sessionId);
      const nextSessions = [session, ...existingFiltered];
      const res = savePersistedStore({
        ...prevStore,
        sessions: nextSessions,
      });
      setStorageAvailable(res.storageAvailable);
      if (res.warning) setStorageWarning(res.warning);
      return res.data;
    });

    setPlayerProfile((prevProfile) => {
      const base = prevProfile ?? loadPlayerSessionProfile() ?? createPlayerSessionProfile('Player');
      return updatePlayerSessionWithRecord(base, session);
    });
  }, []);

  const getSessionById = useCallback(
    (sessionId: string) => {
      return store.sessions.find((s) => s.sessionId === sessionId);
    },
    [store.sessions]
  );

  const clearAllHistory = useCallback(() => {
    setStore((prevStore) => {
      const fresh = getDefaultStore();
      const res = savePersistedStore({
        ...fresh,
        settings: prevStore.settings,
        sessions: [],
      });
      setStorageAvailable(res.storageAvailable);
      if (res.warning) setStorageWarning(res.warning);
      return res.data;
    });
    setPlayerProfile((prev) => {
      if (!prev) return null;
      const resetStats = createPlayerSessionProfile(prev.playerName, prev.createdAt);
      return savePlayerSessionProfile(resetStats);
    });
  }, []);

  const exportProgressJson = useCallback(() => {
    return exportStoreToJson(store);
  }, [store]);

  const importProgressJson = useCallback((jsonString: string): { ok: boolean; message: string } => {
    const result = importStoreFromJson(jsonString);
    if (!result.ok) {
      return { ok: false, message: result.error };
    }
    const res = savePersistedStore(result.store);
    setStore(res.data);
    setStorageAvailable(res.storageAvailable);
    if (res.warning) setStorageWarning(res.warning);
    return {
      ok: true,
      message:
        result.warning ??
        `Imported ${result.store.sessions.length} session(s) and preferences successfully.`,
    };
  }, []);

  const dismissStorageWarning = useCallback(() => {
    setStorageWarning(null);
  }, []);

  const performance = useMemo(
    () => computeHistoricalPerformance(store.sessions),
    [store.sessions]
  );

  const value = useMemo<LabContextValue>(
    () => ({
      store,
      settings: store.settings,
      sessions: store.sessions,
      performance,
      playerProfile,
      onboardingModalOpen,
      openOnboardingModal,
      closeOnboardingModal,
      setPlayerName,
      resetPlayerProfile,
      storageAvailable,
      storageWarning,
      dismissStorageWarning,
      updateSettings,
      recordSession,
      getSessionById,
      clearAllHistory,
      exportProgressJson,
      importProgressJson,
    }),
    [
      store,
      performance,
      playerProfile,
      onboardingModalOpen,
      openOnboardingModal,
      closeOnboardingModal,
      setPlayerName,
      resetPlayerProfile,
      storageAvailable,
      storageWarning,
      dismissStorageWarning,
      updateSettings,
      recordSession,
      getSessionById,
      clearAllHistory,
      exportProgressJson,
      importProgressJson,
    ]
  );

  return <LabContext.Provider value={value}>{children}</LabContext.Provider>;
};

export function useLab(): LabContextValue {
  const ctx = useContext(LabContext);
  if (!ctx) {
    throw new Error('useLab must be used inside a LabProvider');
  }
  return ctx;
}

