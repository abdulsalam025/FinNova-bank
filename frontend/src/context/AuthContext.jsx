import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as authApi from "../api/auth.js";
import { clearCsrf, http } from "../api/http.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  // Restore the session from the HttpOnly cookie. No token is ever stored by JavaScript.
  useEffect(() => {
    let active = true;
    authApi.getProfile()
      .then((profile) => { if (active) setUser(profile); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setInitializing(false); });
    return () => { active = false; };
  }, []);

  // If the server says the session is gone (expired or revoked), drop local state.
  useEffect(() => {
    const id = http.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error && error.response && error.response.status;
        const url = (error && error.config && error.config.url) || "";
        if (status === 401 && !url.includes("/auth/login")) {
          setUser(null);
        }
        return Promise.reject(error);
      },
    );
    return () => http.interceptors.response.eject(id);
  }, []);

  const login = useCallback(async (credentials) => {
    const profile = await authApi.login(credentials);
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // The session is ended locally even if the network call fails.
    } finally {
      setUser(null);
    }
  }, []);

  // Used after a password change: the server clears the cookie, so end the local session too.
  const endSession = useCallback(() => {
    clearCsrf();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, setUser, initializing, login, logout, endSession }),
    [user, initializing, login, logout, endSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
