import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth, googleAuthEnabled } from "@/auth/AuthProvider";
import { toast } from "sonner";
import { safeReturnTo } from "@/auth/returnTo";

const SignIn = () => {
  const { loading, session, signIn, signUp, requestPasswordReset, signInWithGoogle } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const returnTo = safeReturnTo(params.get("returnTo"));
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "recovery">(
    params.get("mode") === "recovery" ? "recovery" : "sign-in",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate(returnTo, { replace: true });
  }, [loading, navigate, returnTo, session]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      if (mode === "recovery") {
        const result = await requestPasswordReset(email.trim());
        if (result.error) throw result.error;
        toast.success("If that email can receive mail, a reset link is on its way.");
        return;
      }
      if (mode === "sign-up") {
        const result = await signUp(email.trim(), password, displayName, returnTo);
        if (result.error) throw result.error;
        if (result.confirmationRequired) {
          toast.success("Check your email to confirm your account before signing in.");
        } else {
          toast.success("Account created.");
          navigate(returnTo, { replace: true });
        }
        return;
      }
      const result = await signIn(email.trim(), password);
      if (result.error) throw result.error;
      navigate(returnTo, { replace: true });
    } catch {
      toast.error(mode === "recovery"
        ? "We could not send a reset link. Please check the address and try again."
        : "Sign-in details were not accepted. Check your email and password and try again.");
    } finally {
      setPending(false);
    }
  };

  const title = mode === "recovery" ? "Reset your password" : mode === "sign-up" ? "Create an account" : "Sign in";
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
      <section className="w-full space-y-6 rounded-lg border bg-card p-6 text-left shadow-sm">
        <div>
          <Link className="text-sm text-muted-foreground hover:underline" to="/">← Arcaea Charts</Link>
          <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "recovery" ? "We will send a link if the address can receive mail." : "Keep your personal score history private and synced."}
          </p>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          {mode === "sign-up" && (
            <label className="block space-y-1 text-sm" htmlFor="display-name">Display name (optional)
              <Input id="display-name" value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
          )}
          <label className="block space-y-1 text-sm" htmlFor="email">Email
            <Input id="email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          {mode !== "recovery" && (
            <label className="block space-y-1 text-sm" htmlFor="password">Password
              <Input id="password" required minLength={6} type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
          )}
          <Button className="w-full" disabled={pending || loading} type="submit">
            {pending ? "Please wait..." : mode === "recovery" ? "Send reset link" : mode === "sign-up" ? "Create account" : "Sign in"}
          </Button>
        </form>
        {googleAuthEnabled && mode !== "recovery" && (
           <Button className="w-full" disabled={pending} variant="outline" onClick={async () => { setPending(true); const result = await signInWithGoogle(returnTo); if (result.error) { toast.error("Google sign-in is unavailable right now."); setPending(false); } }}>
            Continue with Google
          </Button>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {mode !== "sign-in" && <button className="hover:underline" onClick={() => setMode("sign-in")} type="button">Back to sign in</button>}
          {mode === "sign-in" && <button className="hover:underline" onClick={() => setMode("sign-up")} type="button">Create account</button>}
          {mode === "sign-in" && <button className="hover:underline" onClick={() => setMode("recovery")} type="button">Forgot password?</button>}
        </div>
      </section>
    </main>
  );
};

export default SignIn;
