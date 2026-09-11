import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { getProfile, insertScoreRecord, supabase, updateProfile, type Profile } from "@/lib/supabase";
import type { ClearStatus } from "@/lib/score-records";
import { authCallbackUrl } from "@/auth/returnTo";

interface AuthResult {
  error: AuthError | Error | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | undefined;
  profileLoading: boolean;
  profileError: Error | null;
  retryProfile: () => Promise<void>;
  loading: boolean;
  recoverySession: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, displayName: string, returnTo?: string) => Promise<AuthResult & { confirmationRequired: boolean }>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  signInWithGoogle: (returnTo?: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
  saveProfile: (displayName: string | null) => Promise<Profile>;
  addScore: (input: {
    songId: number;
    difficulty: string;
    score: number;
    clearStatus: ClearStatus;
    dateTaken: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const googleAuthEnabled = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === "true";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoverySession, setRecoverySession] = useState(() => {
    return typeof window !== "undefined"
      && (window.location.hash.includes("type=recovery") || window.location.search.includes("type=recovery"));
  });
  const activeUserId = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      activeUserId.current = data.session?.user.id ?? null;
      setSession(data.session);
      setLoading(false);
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null;
      if (activeUserId.current !== nextUserId) {
        queryClient.clear();
      }
      activeUserId.current = nextUserId;
      setSession(nextSession);
      setLoading(false);
      if (event === "PASSWORD_RECOVERY") {
        setRecoverySession(true);
      } else if (event !== "INITIAL_SESSION") {
        setRecoverySession(false);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [queryClient]);

  const user = session?.user ?? null;
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: !loading && !!user,
    retry: 4,
    retryDelay: 300,
  });
  const profile = profileQuery.data;
  const profileLoading = profileQuery.isLoading || profileQuery.isFetching;
  const profileError = profileQuery.error instanceof Error ? profileQuery.error : null;
  const retryProfile = profileQuery.refetch;

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user,
    profile,
    profileLoading,
    profileError,
    retryProfile: async () => { await retryProfile(); },
    loading,
    recoverySession,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    },
    signUp: async (email, password, displayName, returnTo) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName.trim() || undefined },
          emailRedirectTo: authCallbackUrl(returnTo),
        },
      });
      return { error, confirmationRequired: !data.session };
    },
    requestPasswordReset: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      return { error };
    },
    signInWithGoogle: async (returnTo) => {
      if (!googleAuthEnabled) return { error: new Error("Google sign-in is not enabled.") };
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: authCallbackUrl(returnTo) },
      });
      return { error };
    },
    updatePassword: async (password) => {
      if (!user) return { error: new Error("You must be signed in.") };
      const initiatingUserId = user.id;
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { error };
      const currentUser = (await supabase.auth.getUser()).data.user;
      return {
        error: currentUser?.id === initiatingUserId
          ? null
          : new Error("Your session changed. Please retry."),
      };
    },
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      return { error };
    },
    saveProfile: async (displayName) => {
      if (!user) throw new Error("You must be signed in.");
      const initiatingUserId = user.id;
      const saved = await updateProfile(initiatingUserId, displayName);
      const currentUser = (await supabase.auth.getUser()).data.user;
      if (currentUser?.id !== initiatingUserId) throw new Error("Your session changed. Please retry.");
      await queryClient.invalidateQueries({ queryKey: ["profile", initiatingUserId] });
      return saved;
    },
    addScore: async (input) => {
      if (!user) throw new Error("You must be signed in.");
      const initiatingUserId = user.id;
      await insertScoreRecord({ userId: initiatingUserId, ...input });
      const currentUser = (await supabase.auth.getUser()).data.user;
      if (currentUser?.id !== initiatingUserId) throw new Error("Your session changed. Please retry.");
      await queryClient.invalidateQueries({ queryKey: ["score-history", initiatingUserId] });
    },
  }), [loading, profile, profileError, profileLoading, queryClient, recoverySession, retryProfile, session, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

// eslint-disable-next-line react-refresh/only-export-components
export { googleAuthEnabled };
