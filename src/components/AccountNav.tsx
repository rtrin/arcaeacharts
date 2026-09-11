import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";

export function AccountNav() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) return <Button asChild variant="outline" size="sm"><Link to="/sign-in">Sign in</Link></Button>;

  const label = profile?.display_name || user.email || "Account";
  return (
    <details className="relative">
      <summary className="list-none cursor-pointer rounded-md border px-3 py-2 text-sm hover:bg-accent">
        {label}
      </summary>
      <div className="absolute right-0 z-20 mt-2 flex min-w-44 flex-col rounded-md border bg-background p-1 text-left shadow-lg">
        <Link className="rounded px-3 py-2 text-sm hover:bg-accent" to="/records">Score Archive</Link>
        <Link className="rounded px-3 py-2 text-sm hover:bg-accent" to="/profile">Profile</Link>
        <button
          className="rounded px-3 py-2 text-left text-sm hover:bg-accent"
          type="button"
           onClick={async () => {
             const result = await signOut();
             if (!result.error) navigate("/");
           }}
        >
          Sign out
        </button>
      </div>
    </details>
  );
}
