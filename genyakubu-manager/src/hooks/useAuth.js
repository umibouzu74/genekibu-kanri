import { useCallback, useEffect, useState } from "react";
import { auth, isConfigured, authReady } from "../firebase/config";
import {
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut as fbSignOut,
  onAuthStateChanged,
} from "firebase/auth";

// ─── useAuth ───────────────────────────────────────────────────────
// Manages Firebase authentication state.
//   - isAdmin: true when signed in with email/password
//   - Viewers are automatically signed in anonymously
//   - Admin signs in via email/password, gaining write access
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isConfigured || !auth) {
      setLoading(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });

    return unsub;
  }, []);

  const isAdmin = Boolean(user && !user.isAnonymous);

  const signIn = useCallback(async (email, password) => {
    if (!auth) throw new Error("Firebase未設定");
    await authReady;
    return signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signOutAdmin = useCallback(async () => {
    if (!auth) return;
    await fbSignOut(auth);
    await signInAnonymously(auth);
  }, []);

  return { user, isAdmin, loading, signIn, signOutAdmin };
}
