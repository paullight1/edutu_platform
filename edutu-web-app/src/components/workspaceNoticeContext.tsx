import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface WorkspaceNoticeState {
  pending: boolean;
  open: boolean;
}

interface WorkspaceNoticeContextValue extends WorkspaceNoticeState {
  setBlockingNotice: (next: WorkspaceNoticeState) => void;
}

const defaultNoticeState: WorkspaceNoticeState = { pending: false, open: false };

const WorkspaceNoticeContext = createContext<WorkspaceNoticeContextValue>({
  ...defaultNoticeState,
  setBlockingNotice: () => undefined,
});

interface WorkspaceNoticeProviderProps {
  children: React.ReactNode;
  initialBlockingNoticePending?: boolean;
}

export function WorkspaceNoticeProvider({
  children,
  initialBlockingNoticePending = false,
}: WorkspaceNoticeProviderProps) {
  const [state, setState] = useState<WorkspaceNoticeState>(() => ({
    pending: initialBlockingNoticePending,
    open: false,
  }));

  const setBlockingNotice = useCallback((next: WorkspaceNoticeState) => {
    setState(next);
  }, []);

  const value = useMemo(
    () => ({ ...state, setBlockingNotice }),
    [setBlockingNotice, state],
  );

  return (
    <WorkspaceNoticeContext.Provider value={value}>
      {children}
    </WorkspaceNoticeContext.Provider>
  );
}

export function useWorkspaceNotice() {
  return useContext(WorkspaceNoticeContext);
}
