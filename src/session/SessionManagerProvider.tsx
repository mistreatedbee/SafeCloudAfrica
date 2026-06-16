import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from 'react';

type SessionManagerContextValue = {
  continueSession: () => Promise<void>;
  registerActivity: () => void;
};

const SessionManagerContext = createContext<SessionManagerContextValue | null>(
  null,
);

export function SessionManagerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const registerActivity = useCallback(() => {}, []);
  const continueSession = useCallback(async () => {}, []);

  const value = useMemo<SessionManagerContextValue>(
    () => ({ continueSession, registerActivity }),
    [continueSession, registerActivity],
  );

  return (
    <SessionManagerContext.Provider value={value}>
      {children}
    </SessionManagerContext.Provider>
  );
}

export function useSessionManager(): SessionManagerContextValue {
  const context = useContext(SessionManagerContext);
  if (!context)
    throw new Error(
      'useSessionManager must be used within SessionManagerProvider.',
    );
  return context;
}
