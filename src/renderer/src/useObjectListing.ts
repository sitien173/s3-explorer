import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { IpcErrorWrapper } from "./api";
import { objectsQuery } from "./queries";
import { filterBrowserRows, mergeFoldersAndObjects, type BrowserRow, type S3Item } from "./format";

export interface UseObjectListingOptions {
	connectionId: string;
	bucket: string;
	prefix: string;
	searchResults?: S3Item[] | null;
	isSearchActive?: boolean;
	onScopeReset?: () => void;
}

export function useObjectListing({
	connectionId,
	bucket,
	prefix,
	searchResults,
	isSearchActive = false,
	onScopeReset,
}: UseObjectListingOptions) {
	const [filterText, setFilterText] = useState<string>("");

	const listing = useInfiniteQuery({
		...objectsQuery({ connectionId, bucket, prefix }),
		enabled: !isSearchActive,
	});
	const folders = useMemo(() => listing.data?.pages.flatMap((page) => page.folders) ?? [], [listing.data]);
	const objects = useMemo(() => listing.data?.pages.flatMap((page) => page.objects) ?? [], [listing.data]);
	const hasNextPage = listing.hasNextPage;
	const loading = listing.isLoading;
	const loadingMore = listing.isFetchingNextPage;
	const failure = listing.isError ? listing.error : null;
	const nextPageFailed = listing.isFetchNextPageError;
	const ipcCode = failure instanceof IpcErrorWrapper ? failure.code : null;
	const accessDenied = !nextPageFailed && ipcCode === "ACCESS_DENIED";
	const ssoProfile = ipcCode === "SSO_LOGIN_REQUIRED" ? (failure as IpcErrorWrapper).profile || "default" : null;
	const otherFailure = failure && !accessDenied && !ssoProfile ? failure : null;
	const error = otherFailure && !nextPageFailed ? otherFailure.message || "Failed to load objects." : null;
	const pageError = otherFailure && nextPageFailed ? otherFailure.message || "Failed to load next page." : null;

	const [scope, setScope] = useState({ connectionId, bucket, prefix });
	if (scope.connectionId !== connectionId || scope.bucket !== bucket || scope.prefix !== prefix) {
		setScope({ connectionId, bucket, prefix });
		setFilterText("");
		onScopeReset?.();
	}

	const rawRows: BrowserRow[] = isSearchActive
		? (searchResults || []).map((obj) => ({
				kind: "object",
				name: obj.key,
				key: obj.key,
				size: obj.size,
				lastModified: obj.lastModified,
				etag: obj.etag,
			}))
		: mergeFoldersAndObjects(prefix, folders, objects);

	const visibleRows = filterBrowserRows(rawRows, filterText);

	return {
		listing,
		folders,
		objects,
		hasNextPage,
		loading,
		loadingMore,
		accessDenied,
		ssoProfile,
		error,
		pageError,
		rawRows,
		visibleRows,
		filterText,
		setFilterText,
	};
}
