import React from "react";
import { Me, me as apiMe, logout as logoutApi } from "./api";

type AuthState = {
  loading: boolean;
  me: Me | null;
  error?: string;
};

const AuthContext = React.createContext<{
  state: AuthState;
  refresh: () => Promise<void>;
  logout: () => void;
}>({
  state: { loading: true, me: null },
  refresh: async () => {},
  logout: () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>({ loading: true, me: null });

  const refresh = React.useCallback(async () => {
    try {
      const data = await apiMe();
      setState({ loading: false, me: data });
    } catch {
      setState({ loading: false, me: null, error: "Not logged in" });
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = React.useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      /* ignore */
    }
    setState({ loading: false, me: null });
  }, []);

  return <AuthContext.Provider value={{ state, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return React.useContext(AuthContext);
}

