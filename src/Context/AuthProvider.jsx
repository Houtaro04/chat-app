// src/Context/AuthProvider.jsx
import React, { createContext, useEffect, useMemo, useState } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../firebase/config";

export const AuthContext = createContext({
  user: null,
  setUser: () => {},
  logout: async () => {},
});

const normalize = (u) => {
  if (!u) return null;
  return {
    uid: u.uid ?? u.id ?? u._id ?? u.username ?? null,
    displayName: u.displayName ?? u.username ?? "User",
    photoURL: u.photoURL ?? "",
    email: u.email ?? "",
  };
};

const readJwtUser = () => {
  try {
    const jwt = JSON.parse(localStorage.getItem("jwt_auth") || "null");
    return normalize(jwt?.user) || null;
  } catch {
    return null;
  }
};

export default function AuthProvider({ children }) {
  // Firebase (Google/Facebook)
  const [fbUser] = useAuthState(auth);

  // User trong Context: ưu tiên Firebase, nếu không có thì dùng JWT
  const [user, setUser] = useState(() => normalize(fbUser) || readJwtUser());

  // Cập nhật theo Firebase khi có
  useEffect(() => {
    if (fbUser) setUser(normalize(fbUser));
    else setUser((prev) => readJwtUser() || prev || null);
  }, [fbUser]);

  // Đồng bộ khi tab được focus hoặc storage thay đổi (khác tab)
  useEffect(() => {
    const sync = () => {
      if (!auth.currentUser) setUser(readJwtUser());
    };
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const logout = async () => {
    try {
      localStorage.removeItem("jwt_auth");
      await auth.signOut().catch(() => {});
    } finally {
      setUser(null);
      window.location.href = "/login";
    }
  };

  const value = useMemo(() => ({ user, setUser, logout }), [user]);

  if (import.meta.env.DEV) {
    console.log("AuthProvider user:", user);
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
