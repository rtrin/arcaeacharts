import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/auth/AuthProvider";
import { getSongs } from "@/lib/supabase";
import { CLEAR_STATUSES, localDateString, validateScoreRecordInput, type ClearStatus } from "@/lib/score-records";
import { toast } from "sonner";

const NewScoreRecord = () => {
  const { addScore } = useAuth();
  const songsQuery = useQuery({ queryKey: ["active-songs"], queryFn: getSongs, staleTime: 5 * 60 * 1000 });
  const allSongs = useMemo(() => songsQuery.data ?? [], [songsQuery.data]);
  const loading = songsQuery.isLoading;
  const error = songsQuery.error;
  const navigate = useNavigate();
  const [songSearch, setSongSearch] = useState("");
  const [songKey, setSongKey] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [scoreInput, setScoreInput] = useState("");
  const [clearStatus, setClearStatus] = useState<ClearStatus>("Clear");
  const [dateTaken, setDateTaken] = useState(localDateString());
  const [errors, setErrors] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);

  const groups = useMemo(() => {
    const grouped = new Map<string, typeof allSongs>();
    for (const song of allSongs) {
      const key = `${song.title}\u0000${song.artist}`;
      grouped.set(key, [...(grouped.get(key) ?? []), song]);
    }
    return [...grouped.entries()].map(([key, songs]) => ({ key, songs })).sort((a, b) => a.songs[0].title.localeCompare(b.songs[0].title));
  }, [allSongs]);
  const visibleGroups = groups.filter(({ songs }) => {
    const query = songSearch.trim().toLowerCase();
    return !query || songs[0].title.toLowerCase().includes(query) || songs[0].artist.toLowerCase().includes(query);
  });
  const selectedGroup = groups.find((group) => group.key === songKey);
  const selectedChart = selectedGroup?.songs.find((song) => song.difficulty === difficulty);

  const chooseSong = (key: string) => {
    const group = groups.find((item) => item.key === key);
    setSongKey(key);
    setDifficulty(group?.songs[0]?.difficulty ?? "");
    setReviewing(false);
  };

  const edit = () => setReviewing(false);

  const review = (event: FormEvent) => {
    event.preventDefault();
    const validation = validateScoreRecordInput({ songId: selectedChart?.id ?? -1, difficulty, scoreInput, clearStatus, dateTaken }, allSongs);
    setErrors(validation.errors);
    if (!validation.errors.length) setReviewing(true);
  };

  const save = async () => {
    if (!selectedChart) return;
    const validation = validateScoreRecordInput({ songId: selectedChart.id, difficulty, scoreInput, clearStatus, dateTaken }, allSongs);
    if (validation.errors.length || validation.score === null) {
      setErrors(validation.errors);
      setReviewing(false);
      return;
    }
    setPending(true);
    try {
      await addScore({ songId: selectedChart.id, difficulty, score: validation.score, clearStatus, dateTaken });
      toast.success("Score added to your archive.");
      navigate("/records");
    } catch (saveError) {
      const message = saveError instanceof Error && saveError.message.toLowerCase().includes("active")
        ? "This chart was retired while you were entering the score. Refresh the catalog and select it again."
        : "We could not save this score. Your entries were kept; please retry.";
      setReviewing(false);
      setErrors([message]);
    } finally {
      setPending(false);
    }
  };

  return <main className="mx-auto min-h-screen max-w-2xl px-4 py-8 text-left"><Link className="text-sm text-muted-foreground hover:underline" to="/records">← Score Archive</Link><h1 className="mt-5 text-3xl font-semibold">Add score</h1>
    {loading && <p className="mt-6 text-muted-foreground">Loading active charts...</p>}
    {error && <div className="mt-6 space-y-3 text-red-600"><p>We could not load the chart catalog.</p><Button variant="outline" onClick={() => void songsQuery.refetch()}>Retry</Button></div>}
    {!loading && !error && <section className="mt-6 rounded-lg border p-6"><form className="space-y-5" onSubmit={review}>
      <div className="space-y-2"><label className="text-sm" htmlFor="song-search">Find a song</label><Input id="song-search" placeholder="Search title or artist" value={songSearch} onChange={(event) => setSongSearch(event.target.value)} /><select aria-label="Song" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={songKey} onChange={(event) => chooseSong(event.target.value)}><option value="">Select a song</option>{visibleGroups.map(({ key, songs }) => <option key={key} value={key}>{songs[0].title} — {songs[0].artist}</option>)}</select></div>
      <div className="space-y-2"><label className="text-sm" htmlFor="difficulty">Difficulty</label><select id="difficulty" className="h-10 w-full rounded-md border bg-background px-3 text-sm" disabled={!selectedGroup} value={difficulty} onChange={(event) => { setDifficulty(event.target.value); edit(); }}>{selectedGroup?.songs.map((song) => <option key={song.id} value={song.difficulty}>{song.difficulty}{song.constant === null ? "" : ` · ${song.constant}`}</option>)}</select></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm" htmlFor="score">Score<Input id="score" inputMode="numeric" placeholder="10,000,000" value={scoreInput} onChange={(event) => { setScoreInput(event.target.value); edit(); }} /></label><label className="space-y-2 text-sm" htmlFor="date-taken">Played date<Input id="date-taken" type="date" value={dateTaken} onChange={(event) => { setDateTaken(event.target.value); edit(); }} /></label></div>
      <label className="block space-y-2 text-sm" htmlFor="clear-status">Clear status<select id="clear-status" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={clearStatus} onChange={(event) => { setClearStatus(event.target.value as ClearStatus); edit(); }}>{CLEAR_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
      {errors.length > 0 && <ul className="space-y-1 text-sm text-red-600">{errors.map((item) => <li key={item}>{item}</li>)}</ul>}
      {!reviewing ? <Button disabled={!selectedChart} type="submit">Review score</Button> : <div className="space-y-4 rounded-md bg-muted p-4"><h2 className="font-medium">Review</h2><p>{selectedChart?.title} · {difficulty}</p><p className="text-sm text-muted-foreground">{Number(scoreInput.replace(/[ ,]/g, "")).toLocaleString()} · {clearStatus} · {dateTaken}</p><div className="flex flex-wrap gap-2"><Button disabled={pending} type="button" onClick={() => void save()}>{pending ? "Saving..." : "Save score"}</Button><Button disabled={pending} type="button" variant="outline" onClick={() => setReviewing(false)}>Edit</Button></div></div>}
    </form></section>}
  </main>;
};

export default NewScoreRecord;
