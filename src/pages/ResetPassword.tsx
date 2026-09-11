import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";

const ResetPassword = () => {
  const { loading, session, recoverySession, updatePassword, signOut } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const validRecovery = !loading && !!session && recoverySession;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmation || password.length < 6) {
      toast.error("Passwords must match and contain at least 6 characters.");
      return;
    }
    setPending(true);
    const { error } = await updatePassword(password);
    setPending(false);
    if (error) {
      toast.error("This reset link is no longer valid. Request a new one and try again.");
      return;
    }
    await signOut();
    toast.success("Password updated. You can now sign in.");
    navigate("/sign-in", { replace: true });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
      <section className="w-full space-y-5 rounded-lg border p-6 text-left">
        <Link className="text-sm text-muted-foreground hover:underline" to="/">← Arcaea Charts</Link>
        {!validRecovery ? (
          <><h1 className="text-2xl font-semibold">Reset link unavailable</h1><p className="text-sm text-muted-foreground">This link is expired, already used, malformed, or missing a recovery session.</p><Button asChild><Link to="/sign-in?mode=recovery">Request a new link</Link></Button></>
        ) : (
          <><h1 className="text-2xl font-semibold">Choose a new password</h1><form className="space-y-4" onSubmit={submit}>
            <label className="block space-y-1 text-sm" htmlFor="new-password">New password<Input id="new-password" required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <label className="block space-y-1 text-sm" htmlFor="confirm-password">Confirm password<Input id="confirm-password" required minLength={6} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
            <Button className="w-full" disabled={pending} type="submit">{pending ? "Updating..." : "Update password"}</Button>
          </form></>
        )}
      </section>
    </main>
  );
};

export default ResetPassword;
