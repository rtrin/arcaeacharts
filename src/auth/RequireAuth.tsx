import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      navigate(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
    }
  }, [loading, location.hash, location.pathname, location.search, navigate, session]);

  if (loading || !session) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Checking your session...</div>;
  }
  return <>{children}</>;
}
