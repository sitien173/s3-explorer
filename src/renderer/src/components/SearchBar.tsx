import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type JSX } from "react";
import type { S3Item } from "../format";
import { api, unwrap } from "../api";
import { AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Spinner } from "./ui/spinner";

export interface SearchBarProps {
	connectionId: string;
	bucket: string;
	prefix: string;
	onSearchResults: (results: S3Item[], isDone: boolean, truncated: boolean) => void;
	onSearchCleared: () => void;
	isSearchActive: boolean;
}

function generateJobId(): string {
	const rand = Math.random().toString(36).slice(2, 10);
	return `job_${Date.now()}_${rand}`.slice(0, 40);
}

export function SearchBar({
	connectionId,
	bucket,
	prefix,
	onSearchResults,
	onSearchCleared,
	isSearchActive,
}: SearchBarProps): JSX.Element {
	const [query, setQuery] = useState<string>("");
	const [running, setRunning] = useState<boolean>(false);
	const [scanned, setScanned] = useState<number>(0);
	const [matched, setMatched] = useState<number>(0);
	const [truncated, setTruncated] = useState<boolean>(false);
	const [searchError, setSearchError] = useState<string | null>(null);

	const activeJobIdRef = useRef<string | null>(null);
	const runningRef = useRef<boolean>(false);
	runningRef.current = running;
	const unsubsRef = useRef<Array<() => void>>([]);
	const matchesRef = useRef<S3Item[]>([]);

	const cleanupListeners = useCallback((): void => {
		for (const unsub of unsubsRef.current) {
			try {
				unsub();
			} catch {
				// Ignore unsubscribe errors
			}
		}
		unsubsRef.current = [];
	}, []);

	useEffect(() => {
		return () => {
			cleanupListeners();
			const activeId = activeJobIdRef.current;
			if (activeId && runningRef.current) {
				void api.search.cancel({ jobId: activeId });
			}
		};
	}, [cleanupListeners]);

	async function handleStartSearch(event: FormEvent): Promise<void> {
		event.preventDefault();
		const trimmed = query.trim();
		if (!trimmed) {
			return;
		}

		cleanupListeners();
		if (activeJobIdRef.current && runningRef.current) {
			void api.search.cancel({ jobId: activeJobIdRef.current });
		}

		const jobId = generateJobId();
		activeJobIdRef.current = jobId;
		runningRef.current = true;
		matchesRef.current = [];
		setRunning(true);
		setScanned(0);
		setMatched(0);
		setTruncated(false);
		setSearchError(null);

		const unsubBatch = api.search.onBatch((payload) => {
			if (payload.jobId !== activeJobIdRef.current) {
				return;
			}
			matchesRef.current = [...matchesRef.current, ...payload.matches];
			setMatched(matchesRef.current.length);
			onSearchResults(matchesRef.current, false, false);
		});

		const unsubProgress = api.search.onProgress((payload) => {
			if (payload.jobId !== activeJobIdRef.current) {
				return;
			}
			setScanned(payload.scanned);
			setMatched(payload.matched);
		});

		const unsubDone = api.search.onDone((payload) => {
			if (payload.jobId !== activeJobIdRef.current) {
				return;
			}
			activeJobIdRef.current = null;
			runningRef.current = false;
			setRunning(false);
			setTruncated(payload.truncated);
			if (payload.error) {
				setSearchError(payload.error.message);
			}
			onSearchResults(matchesRef.current, true, payload.truncated);
			cleanupListeners();
		});

		unsubsRef.current = [unsubBatch, unsubProgress, unsubDone];

		try {
			const res = await api.search.start({
				jobId,
				connectionId,
				bucket,
				prefix,
				query: trimmed,
			});
			unwrap(res);
		} catch (err: unknown) {
			activeJobIdRef.current = null;
			runningRef.current = false;
			setRunning(false);
			cleanupListeners();
			if (err instanceof Error) {
				setSearchError(err.message);
			} else {
				setSearchError("Failed to start search.");
			}
		}
	}

	async function handleCancelSearch(): Promise<void> {
		const jobId = activeJobIdRef.current;
		activeJobIdRef.current = null;
		runningRef.current = false;
		setRunning(false);
		cleanupListeners();
		if (jobId) {
			try {
				await api.search.cancel({ jobId });
			} catch {
				// Ignore cancel errors
			}
		}
	}

	function handleClear(): void {
		cleanupListeners();
		const jobId = activeJobIdRef.current;
		activeJobIdRef.current = null;
		if (jobId && runningRef.current) {
			void api.search.cancel({ jobId });
		}
		runningRef.current = false;
		setRunning(false);
		setQuery("");
		setScanned(0);
		setMatched(0);
		setTruncated(false);
		setSearchError(null);
		matchesRef.current = [];
		onSearchCleared();
	}

	return (
		<div className="relative flex items-center gap-1.5">
			<form
				className="flex items-center gap-1.5"
				onSubmit={(e) => {
					void handleStartSearch(e);
				}}
			>
				<Input
					type="text"
					className="app-no-drag h-7 w-36 text-xs sm:w-48 lg:w-56"
					value={query}
					onChange={(e: ChangeEvent<HTMLInputElement>) => {
						setQuery(e.target.value);
					}}
					placeholder={`Search in ${bucket}/${prefix}...`}
				/>
				<Button type="submit" variant="secondary" size="sm" className="app-no-drag" disabled={running || !query.trim()}>
					Search
				</Button>
				{running && (
					<Button
						type="button"
						variant="secondary"
						size="sm"
						className="app-no-drag"
						onClick={() => {
							void handleCancelSearch();
						}}
					>
						Cancel
					</Button>
				)}
				{isSearchActive && !running && (
					<Button type="button" variant="secondary" size="sm" className="app-no-drag" onClick={handleClear}>
						Clear results
					</Button>
				)}
			</form>

			{(running || truncated || searchError) && (
				<div className="absolute top-full left-0 z-30 mt-1 flex flex-col gap-1 rounded-surface border border-separator bg-elevated p-2 text-xs text-foreground shadow-overlay">
					{running && (
						<div className="flex items-center gap-1.5 text-xs text-foreground-secondary">
							<Spinner className="size-3" />
							<span>
								Scanned: {scanned.toLocaleString()} | Matched: {matched.toLocaleString()}
							</span>
						</div>
					)}
					{truncated && (
						<div className="text-xs text-foreground-secondary">
							<AlertDescription>Search results truncated at maximum limit.</AlertDescription>
						</div>
					)}
					{searchError && (
						<div className="text-xs text-destructive">
							<AlertDescription>{searchError}</AlertDescription>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
