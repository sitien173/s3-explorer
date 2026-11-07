import type { CreateRequest, UpdateRequest } from "../../shared/ipc";

export interface BucketItem {
	name: string;
	pinned: boolean;
	listed: boolean;
}

export interface ConnectionFormState {
	name: string;
	kind: "profile" | "manual";
	profile?: string;
	region?: string;
	endpoint?: string;
	forcePathStyle: boolean;
	accessKeyId?: string;
	secretAccessKey?: string;
	sessionToken?: string;
}

export function sortBuckets(buckets: BucketItem[]): BucketItem[] {
	return [...buckets].sort((a, b) => {
		if (a.pinned && !b.pinned) {
			return -1;
		}
		if (!a.pinned && b.pinned) {
			return 1;
		}
		return 0;
	});
}

export function buildCreateRequest(state: ConnectionFormState): CreateRequest {
	const name = state.name.trim();
	const region = state.region?.trim() || undefined;
	const endpoint = state.endpoint?.trim() || undefined;
	const forcePathStyle = Boolean(state.forcePathStyle);

	if (state.kind === "profile") {
		const profile = state.profile?.trim() || "";
		return {
			kind: "profile",
			name,
			profile,
			...(region ? { region } : {}),
			...(endpoint ? { endpoint } : {}),
			forcePathStyle,
		};
	}

	const accessKeyId = state.accessKeyId?.trim() || "";
	const secretAccessKey = state.secretAccessKey?.trim() || "";
	const sessionToken = state.sessionToken?.trim() || undefined;

	return {
		kind: "manual",
		name,
		region: region || "",
		accessKeyId,
		secretAccessKey,
		...(sessionToken ? { sessionToken } : {}),
		...(endpoint ? { endpoint } : {}),
		forcePathStyle,
	};
}

export function buildUpdateRequest(id: string, state: ConnectionFormState): UpdateRequest {
	const name = state.name.trim();
	const region = state.region?.trim() || null;
	const endpoint = state.endpoint?.trim() || null;
	const secret = state.secretAccessKey?.trim();
	const sessionToken = state.sessionToken?.trim() || null;

	const req: UpdateRequest = {
		id,
		name: name || undefined,
		region,
		endpoint,
		forcePathStyle: Boolean(state.forcePathStyle),
	};

	if (state.kind === "manual") {
		if (state.accessKeyId?.trim()) {
			req.accessKeyId = state.accessKeyId.trim();
		}
		if (secret) {
			req.secretAccessKey = secret;
		}
		req.sessionToken = sessionToken;
	}

	return req;
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return "0 B";
	}
	const units = ["B", "KB", "MB", "GB", "TB", "PB"];
	const digitGroups = Math.floor(Math.log(bytes) / Math.log(1024));
	const idx = Math.min(digitGroups, units.length - 1);
	if (idx === 0) {
		return `${bytes} B`;
	}
	const value = bytes / 1024 ** idx;
	return `${value.toFixed(1)} ${units[idx]}`;
}

export function filterByName<T extends { name: string }>(items: T[], query: string): T[] {
	const trimmed = query.trim().toLowerCase();
	if (!trimmed) {
		return items;
	}
	return items.filter((item) => item.name.toLowerCase().includes(trimmed));
}

export interface S3Item {
	key: string;
	size: number;
	lastModified?: string;
	etag?: string;
}

interface FolderRow {
	kind: "folder";
	name: string;
	prefix: string;
}

interface ObjectRow {
	kind: "object";
	name: string;
	key: string;
	size: number;
	lastModified?: string;
	etag?: string;
}

export type BrowserRow = FolderRow | ObjectRow;

interface BreadcrumbSegment {
	name: string;
	prefix: string;
}

export interface PageState {
	requestId: number;
	prefix: string;
	folders: string[];
	objects: S3Item[];
	nextToken?: string;
	hasMore: boolean;
}

export interface PageResponse {
	requestId: number;
	prefix: string;
	folders: string[];
	objects: S3Item[];
	nextToken?: string;
}

export function parseBreadcrumbs(bucket: string, prefix: string): BreadcrumbSegment[] {
	const segments: BreadcrumbSegment[] = [{ name: bucket, prefix: "" }];
	if (!prefix) {
		return segments;
	}
	const parts = prefix.split("/").filter(Boolean);
	let accumulated = "";
	for (const part of parts) {
		accumulated += `${part}/`;
		segments.push({
			name: part,
			prefix: accumulated,
		});
	}
	return segments;
}

export function mergeFoldersAndObjects(currentPrefix: string, folders: string[], objects: S3Item[]): BrowserRow[] {
	const folderRows: FolderRow[] = folders.map((f) => {
		const rel = f.startsWith(currentPrefix) ? f.slice(currentPrefix.length) : f;
		return {
			kind: "folder",
			name: rel,
			prefix: f,
		};
	});

	const objectRows: ObjectRow[] = objects.map((obj) => {
		const rel = obj.key.startsWith(currentPrefix) ? obj.key.slice(currentPrefix.length) : obj.key;
		return {
			kind: "object",
			name: rel,
			key: obj.key,
			size: obj.size,
			lastModified: obj.lastModified,
			etag: obj.etag,
		};
	});

	return [...folderRows, ...objectRows];
}

export function filterBrowserRows(rows: BrowserRow[], query: string): BrowserRow[] {
	const trimmed = query.trim().toLowerCase();
	if (!trimmed) {
		return rows;
	}
	return rows.filter((r) => r.name.toLowerCase().includes(trimmed));
}

export function isStaleResponse(
	currentRequestId: number,
	currentPrefix: string,
	responseRequestId: number,
	responsePrefix: string,
): boolean {
	return responseRequestId !== currentRequestId || responsePrefix !== currentPrefix;
}

export function applyPageResponse(
	currentState: PageState,
	response: PageResponse,
	isAppend: boolean,
): PageState | null {
	if (isStaleResponse(currentState.requestId, currentState.prefix, response.requestId, response.prefix)) {
		return null;
	}

	if (isAppend) {
		return {
			...currentState,
			folders: [...currentState.folders, ...response.folders],
			objects: [...currentState.objects, ...response.objects],
			nextToken: response.nextToken,
			hasMore: Boolean(response.nextToken),
		};
	}

	return {
		...currentState,
		folders: response.folders,
		objects: response.objects,
		nextToken: response.nextToken,
		hasMore: Boolean(response.nextToken),
	};
}

export function shouldResetInFlight(
	activeRequestId: number,
	activePrefix: string,
	responseRequestId: number,
	responsePrefix: string,
): boolean {
	return !isStaleResponse(activeRequestId, activePrefix, responseRequestId, responsePrefix);
}

export function shouldAutoPage(
	isSearchActive: boolean,
	hasPageError: boolean,
	hasMore: boolean,
	inFlight: boolean,
	lastVisibleIndex: number,
	totalRows: number,
): boolean {
	if (isSearchActive || hasPageError || !hasMore || inFlight) {
		return false;
	}
	return lastVisibleIndex >= totalRows - 5;
}

export interface NavigationLoadingState {
	inFlight: boolean;
	loading: boolean;
	loadingMore: boolean;
}

export function resetNavigationLoading(): NavigationLoadingState {
	return {
		inFlight: true,
		loading: true,
		loadingMore: false,
	};
}
