/**
 * auth.jsx — global auth state via React Context.
 *
 * Stores the JWT in localStorage (so a refresh keeps you logged in) and decodes
 * the user info from the token payload. Exposes login/register/logout helpers.
 */

import { createContext, useContext, useState, useCallback } from "react";
import { api, getToken, setToken, clearToken } from "./api";

const AuthContext = createContext(null);

// Decode the JWT payload (middle segment) without verifying — purely to read
// the display name/email. The server is the one that actually verifies it.
function decodeUser(token) {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return { id: payload.sub, email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setTok] = useState(() => getToken());
  const [user, setUser] = useState(() => decodeUser(getToken()));

  const applyToken = useCallback((newToken) => {
    setToken(newToken);
    setTok(newToken);
    setUser(decodeUser(newToken));
  }, []);

  const login = useCallback(async (email, password) => {
    const { token } = await api.login({ email, password });
    applyToken(token);
  }, [applyToken]);

  const register = useCallback(async (name, email, password) => {
    const { token } = await api.register({ name, email, password });
    applyToken(token);
  }, [applyToken]);

  const logout = useCallback(() => {
    clearToken();
    setTok(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, isAuthed: !!token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
