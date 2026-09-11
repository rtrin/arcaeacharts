import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/auth/AuthProvider";
import { getScoreHistory } from "@/lib/supabase";
import { addImprovements, calculateStatistics, CLEAR_STATUSES, orderHistory, type HistorySort, type ScoreHistoryRow } from "@/lib/score-records";

const Records = () => {
  const { user, profile } = useAuth();
  const historyQuery = useQuery({
    queryKey: ["score-history", user?.id],
    queryFn: () => getScoreHistory(user!.id),
    enabled: !!user,
    retry: false,
  });
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [clearStatus, setClearStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState<HistorySort>("date");

  const history = useMemo(() => {
    if (!historyQuery.data) return [];
    return addImprovements(orderHistory(historyQuery.data));
  }, [historyQuery.data]);
  const stats = useMemo(() => calculateStatistics(history), [history]);
  const filteredHistory = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...history]
      .filter((row) => {
        const title = row.song?.title ?? `Song ${row.song_id}`;
        const artist = row.song?.artist ?? "";
        return (!query || title.toLowerCase().includes(query) || artist.toLowerCase().includes(query))
          && (!difficulty || row.difficulty === difficulty)
          && (!clearStatus || row.clear_status === clearStatus)
          && (!fromDate || row.date_taken >= fromDate)
          && (!toDate || row.date_taken <= toDate);
      })
      .sort((a, b) => {
        if (sort === "score") return b.score - a.score || b.date_taken.localeCompare(a.date_taken);
        if (sort === "improvement") return (b.improvement ?? -Infinity) - (a.improvement ?? -Infinity) || b.date_taken.localeCompare(a.date_taken);
        return b.date_taken.localeCompare(a.date_taken) || b.created_at.localeCompare(a.created_at) || b.id - a.id;
      });
  }, [clearStatus, difficulty, fromDate, history, search, sort, toDate]);
  const difficulties = [...new Set(history.map((row) => row.difficulty))].sort();

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 text-left">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><Link className="text-sm text-muted-foreground hover:underline" to="/">← Catalog</Link><h1 className="mt-3 text-3xl font-semibold">{profile?.display_name ? `${profile.display_name}'s ` : "Your "}Score Archive</h1></div>
        <Button asChild><Link to="/records/new">Add score</Link></Button>
      </header>

      {historyQuery.isLoading && <div className="py-16 text-center text-muted-foreground">Loading score history...</div>}
      {historyQuery.error && <div className="mt-8 rounded-lg border border-red-200 p-6 text-center"><p className="text-red-600">We could not load your complete history.</p><Button className="mt-3" variant="outline" onClick={() => void historyQuery.refetch()}>Retry</Button></div>}
      {historyQuery.data && !historyQuery.error && (
        <>
          <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Score statistics">
            <Stat label="Total plays" value={String(stats.totalPlays)} />
            <Stat label="Average" value={stats.average === null ? "--" : Math.round(stats.average).toLocaleString()} />
            <Stat label="Highest" value={stats.highest === null ? "--" : stats.highest.toLocaleString()} />
            <Stat label="Lowest" value={stats.lowest === null ? "--" : stats.lowest.toLocaleString()} />
          </section>
          <section className="mt-4 rounded-lg border p-4">
            <h2 className="font-medium">Clear status</h2>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
              {CLEAR_STATUSES.map((status) => <span key={status}>{status}: <strong className="text-foreground">{stats.clearStatusCounts[status]}</strong></span>)}
            </div>
          </section>
          <section className="mt-8 space-y-4" aria-labelledby="history-heading">
            <div className="flex flex-wrap items-end gap-3"><h2 id="history-heading" className="mr-auto text-xl font-semibold">History</h2>
              <Button asChild variant="outline" size="sm"><Link to="/records/new">Add score</Link></Button>
            </div>
            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-5">
              <Input aria-label="Search song or artist" placeholder="Song or artist" value={search} onChange={(event) => setSearch(event.target.value)} />
              <select aria-label="Filter difficulty" className="h-9 rounded-md border bg-background px-3 text-sm" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="">All difficulties</option>{difficulties.map((item) => <option key={item}>{item}</option>)}</select>
              <select aria-label="Filter clear status" className="h-9 rounded-md border bg-background px-3 text-sm" value={clearStatus} onChange={(event) => setClearStatus(event.target.value)}><option value="">All statuses</option>{CLEAR_STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
              <Input aria-label="Played after" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              <Input aria-label="Played before" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
              <select aria-label="Sort history" className="h-9 rounded-md border bg-background px-3 text-sm" value={sort} onChange={(event) => setSort(event.target.value as HistorySort)}><option value="date">Sort: date played</option><option value="score">Sort: score</option><option value="improvement">Sort: improvement</option></select>
            </div>
            {history.length === 0 ? <div className="rounded-lg border p-10 text-center"><p className="text-muted-foreground">No scores yet.</p><Button className="mt-4" asChild><Link to="/records/new">Add score</Link></Button></div> : filteredHistory.length === 0 ? <div className="rounded-lg border p-10 text-center text-muted-foreground">No scores match these filters.</div> : <div className="space-y-2">{filteredHistory.map((row) => <RecordRow key={row.id} row={row} />)}</div>}
          </section>
        </>
      )}
    </main>
  );
};

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}

function RecordRow({ row }: { row: ScoreHistoryRow }) {
  return <article className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium">{row.song?.title ?? `Song ${row.song_id}`}</h3><p className="text-sm text-muted-foreground">{row.song?.artist ?? "Catalog entry unavailable"} · {row.difficulty}</p></div><div className="text-right"><p className="text-lg font-semibold">{row.score.toLocaleString()}</p><p className="text-xs text-muted-foreground">{row.clear_status}</p></div></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>Played {row.date_taken}</span><span>Improvement: {row.improvement === null || row.improvement === undefined ? "--" : `${row.improvement >= 0 ? "+" : ""}${row.improvement.toLocaleString()}`}</span></div></article>;
}

export default Records;
