import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { safeReturnTo } from "@/auth/returnTo";

const AuthCallback = () => {
  const { loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const exchangedCode = useRef<string | null>(null);
  const returnTo = safeReturnTo(new URLSearchParams(location.search).get("returnTo"));

  useEffect(() => {
    let active = true;
    const complete = async () => {
      const code = new URLSearchParams(location.search).get("code");
      if (code && exchangedCode.current !== code) {
        exchangedCode.current = code;
        const result = await supabase.auth.exchangeCodeForSession(code);
        if (result.error) {
          if (active) setError("This sign-in link is no longer valid. Please sign in again.");
          return;
        }
      }
      const current = (await supabase.auth.getSession()).data.session;
      if (active && current) navigate(returnTo, { replace: true });
      else if (active && !loading) setError("We could not complete sign-in. Please try again.");
    };
    void complete();
    return () => { active = false; };
  }, [loading, location.search, navigate, returnTo]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
      <section className="w-full space-y-4 rounded-lg border p-6 text-center">
        {error ? <><h1 className="text-xl font-semibold">Sign-in link unavailable</h1><p className="text-sm text-muted-foreground">{error}</p><Button asChild><Link to="/sign-in">Return to sign in</Link></Button></> : <p className="text-muted-foreground">Completing sign-in...</p>}
      </section>
    </main>
  );
};

export default AuthCallback;
