import {
	useEffect,
	useRef,
	useState,
	type ChangeEvent,
	type FormEvent,
	type JSX,
} from "react";
import type { S3Item } from "../format";
import { api, unwrap } from "../api";
import { Button } from "./ui/button";

export interface SearchBarProps {
	connectionId: string;
	bucket: string;
	prefix: string;
	onSearchResults: (
		results: S3Item[],
		isDone: boolean,
		truncated: boolean,
	) => void;
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

	function cleanupListeners(): void {
		for (const unsub of unsubsRef.current) {
			try {
				unsub();
			} catch {
				// Ignore unsubscribe errors
			}
		}
		unsubsRef.current = [];
	}

	useEffect(() => {
		return () => {
			cleanupListeners();
			const activeId = activeJobIdRef.current;
			if (activeId && runningRef.current) {
				void api.search.cancel({ jobId: activeId });
			}
		};
	}, []);

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
		<div className="app-search-bar-container">
			<form
				className="app-search-form"
				onSubmit={(e) => {
					void handleStartSearch(e);
				}}
			>
				<div className="tds-text-input app-search-input-wrapper">
					<input
						type="text"
						className="tds-text-input__field app-search-field"
						value={query}
						onChange={(e: ChangeEvent<HTMLInputElement>) => {
							setQuery(e.target.value);
						}}
						placeholder={`Search objects in ${bucket}/${prefix}...`}
					/>
				</div>
				<Button
					type="submit"
					variant="secondary"
					disabled={running || !query.trim()}
				>
					Search
				</Button>
				{running && (
					<Button
						type="button"
						variant="secondary"
						onClick={() => {
							void handleCancelSearch();
						}}
					>
						Cancel
					</Button>
				)}
				{isSearchActive && !running && (
					<Button
						type="button"
						variant="secondary"
						onClick={handleClear}
					>
						Clear results
					</Button>
				)}
			</form>

			{running && (
				<div className="app-search-status">
					<div className="tds-spinner tds-spinner--xs" />
					<span className="app-search-status-text">
						Scanned: {scanned.toLocaleString()} | Matched:{" "}
						{matched.toLocaleString()}
					</span>
				</div>
			)}

			{truncated && (
				<div className="tds-announcement tds-announcement--warning app-search-banner">
					<div className="tds-announcement__content">
						<div className="tds-announcement__message">
							Search results truncated at maximum limit.
						</div>
					</div>
				</div>
			)}

			{searchError && (
				<div className="tds-announcement tds-announcement--error app-search-banner">
					<div className="tds-announcement__content">
						<div className="tds-announcement__message">
							{searchError}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
