import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { 
  auth, 
  googleProvider,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  type User 
} from "@/lib/firebase";
import { apiRequest } from "@/lib/queryClient";
import { t, Language } from "@/lib/i18n";

function getStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem('preferredLanguage');
    if (stored && ['en', 'zh', 'hi', 'es', 'fr', 'ar', 'ru', 'tr'].includes(stored)) {
      return stored as Language;
    }
  } catch {}
  return 'en';
}

async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

export async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = {};
  const token = await getIdToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  try {
    const sessionToken = localStorage.getItem('gameSessionToken');
    if (sessionToken) {
      headers["x-session-token"] = sessionToken;
    }
  } catch {}
  return headers;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  emailVerificationSent: boolean;
  pendingVerificationEmail: string | null;
  passwordResetSent: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  clearError: () => void;
  resendVerificationEmail: (email: string, password: string) => Promise<void>;
  sendResetPasswordEmail: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useFirebaseAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useFirebaseAuth must be used within FirebaseAuthProvider");
  }
  return context;
}

interface FirebaseAuthProviderProps {
  children: React.ReactNode;
}

export function FirebaseAuthProvider({ children }: FirebaseAuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [passwordResetSent, setPasswordResetSent] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          await fetch("/api/auth/firebase-sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            credentials: 'include',
            body: JSON.stringify({}),
          });
        } catch (err) {
          console.error("Failed to sync Firebase user:", err);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(result.user);
      setEmailVerificationSent(true);
      setPendingVerificationEmail(email);
      await firebaseSignOut(auth);
    } catch (err: any) {
      const lang = getStoredLanguage();
      let message = t(lang, 'authRegistrationFailed');
      if (err.code === "auth/email-already-in-use") {
        message = t(lang, 'authEmailInUse');
      } else if (err.code === "auth/weak-password") {
        message = t(lang, 'authWeakPassword');
      } else if (err.code === "auth/invalid-email") {
        message = t(lang, 'authInvalidEmail');
      } else if (err.message) {
        message = err.message;
      }
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      if (!result.user.emailVerified) {
        await firebaseSignOut(auth);
        const lang = getStoredLanguage();
        const message = t(lang, 'authEmailNotVerified');
        setError(message);
        throw new Error(message);
      }
    } catch (err: any) {
      const lang = getStoredLanguage();
      let message = t(lang, 'authLoginFailed');
      if (err.code === "auth/user-not-found") {
        message = t(lang, 'authUserNotFound');
      } else if (err.code === "auth/wrong-password") {
        message = t(lang, 'authWrongPassword');
      } else if (err.code === "auth/invalid-email") {
        message = t(lang, 'authInvalidEmail');
      } else if (err.code === "auth/invalid-credential") {
        message = t(lang, 'authInvalidCredential');
      } else if (err.message === t(lang, 'authEmailNotVerified')) {
        message = err.message;
      }
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      await fetch("/api/auth/firebase-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        credentials: 'include',
        body: JSON.stringify({}),
      });
    } catch (err: any) {
      const lang = getStoredLanguage();
      let message = t(lang, 'authGoogleLoginFailed');
      if (err.code === "auth/popup-closed-by-user") {
        message = t(lang, 'authLoginCancelled');
      }
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setError(null);
    try {
      // Get token BEFORE signing out (otherwise it will be null)
      const token = await getIdToken();
      
      // Call backend logout with token to clear session cookie
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          credentials: 'include',
        });
      }
      
      // Now sign out from Firebase
      await firebaseSignOut(auth);
    } catch (err: any) {
      setError(t(getStoredLanguage(), 'authLogoutFailed'));
      throw err;
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setPasswordResetSent(false);
  }, []);

  const resendVerificationEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(result.user);
      await firebaseSignOut(auth);
      setEmailVerificationSent(true);
      setPendingVerificationEmail(email);
    } catch (err: any) {
      const lang = getStoredLanguage();
      let message = t(lang, 'authLoginFailed');
      if (err.code === "auth/user-not-found") {
        message = t(lang, 'authUserNotFound');
      } else if (err.code === "auth/wrong-password") {
        message = t(lang, 'authWrongPassword');
      } else if (err.code === "auth/invalid-credential") {
        message = t(lang, 'authInvalidCredential');
      }
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const sendResetPasswordEmail = useCallback(async (email: string) => {
    setError(null);
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setPasswordResetSent(true);
    } catch (err: any) {
      const lang = getStoredLanguage();
      let message = t(lang, 'authResetPasswordFailed');
      if (err.code === "auth/user-not-found") {
        message = t(lang, 'authUserNotFound');
      } else if (err.code === "auth/invalid-email") {
        message = t(lang, 'authInvalidEmail');
      }
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("No user logged in");
      }

      const token = await currentUser.getIdToken();
      
      // First delete player data from our database
      const response = await fetch("/api/auth/firebase-delete-account", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to delete account data");
      }

      // Then delete Firebase auth user
      await currentUser.delete();
      
      // Sign out to clear any remaining state
      await firebaseSignOut(auth);
    } catch (err: any) {
      const lang = getStoredLanguage();
      let message = t(lang, 'deleteAccountFailed');
      if (err.code === "auth/requires-recent-login") {
        message = t(lang, 'deleteAccountRequiresReauth');
      }
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      error, 
      emailVerificationSent,
      pendingVerificationEmail,
      passwordResetSent,
      signUp, 
      signIn, 
      signInWithGoogle, 
      logout,
      deleteAccount,
      clearError,
      resendVerificationEmail,
      sendResetPasswordEmail
    }}>
      {children}
    </AuthContext.Provider>
  );
}
