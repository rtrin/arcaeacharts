import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";

const Profile = () => {
  const { user, profile, profileLoading, profileError, retryProfile, saveProfile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (profile) setDisplayName(profile.display_name ?? "");
  }, [profile]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      await saveProfile(displayName.trim().slice(0, 80) || null);
      toast.success("Profile saved.");
    } catch {
      toast.error("We could not save your profile. Please retry.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8 text-left">
      <Link className="text-sm text-muted-foreground hover:underline" to="/records">← Score Archive</Link>
      <h1 className="mt-5 text-3xl font-semibold">Profile</h1>
      <section className="mt-6 space-y-5 rounded-lg border p-6">
        <div><p className="text-sm text-muted-foreground">Account email</p><p className="mt-1 font-medium">{user?.email ?? "—"}</p></div>
        {profileError && <div className="space-y-2 text-sm text-red-600"><p>Profile is still loading. Please retry shortly.</p><Button type="button" variant="outline" onClick={() => void retryProfile()}>Retry profile</Button></div>}
        <form className="space-y-4" onSubmit={submit}>
          <label className="block space-y-1 text-sm" htmlFor="profile-display-name">Display name
            <Input id="profile-display-name" maxLength={80} disabled={profileLoading} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <Button disabled={pending || profileLoading || !profile} type="submit">{pending ? "Saving..." : "Save profile"}</Button>
        </form>
      </section>
    </main>
  );
};

export default Profile;
