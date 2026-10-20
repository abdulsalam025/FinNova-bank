import { createContext, useContext, useEffect, useState } from "react";
import { getProfile, login as apiLogin, logout as apiLogout } from "../api/auth.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    getProfile()
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch(() => {
        if (active) setProfile(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function signIn(credentials) {
    const data = await apiLogin(credentials);
    setProfile(data);
    return data;
  }

  async function signOut() {
    try {
      await apiLogout();
    } finally {
      setProfile(null);
    }
  }

  return (
    <AuthContext.Provider value={{ profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
