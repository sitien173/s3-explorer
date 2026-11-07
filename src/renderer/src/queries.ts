import {
	type InfiniteData,
	infiniteQueryOptions,
	QueryClient,
	queryOptions,
	type QueryKey,
} from "@tanstack/react-query";
import type { RequestByChannel, ResponseByChannel } from "../../shared/ipc";
import type { channels } from "../../shared/channels";
import { api, unwrap } from "./api";

type ListObjectsRequest = RequestByChannel[typeof channels.objectsList];
type ObjectsPage = ResponseByChannel[typeof channels.objectsList];

export interface ListingScope {
	connectionId: string;
	bucket: string;
	prefix: string;
}

/** Every key starts with the connection id, except channels that take none. */
export const queryKeys = {
	connections: (): QueryKey => ["connections"],
	profiles: (): QueryKey => ["profiles"],
	connection: (connectionId: string): QueryKey => [connectionId],
	buckets: (connectionId: string): QueryKey => [connectionId, "buckets"],
	objects: (connectionId: string): QueryKey => [connectionId, "objects"],
	bucketObjects: (connectionId: string, bucket: string): QueryKey => [connectionId, "objects", bucket],
	objectList: (connectionId: string, bucket: string, prefix: string): QueryKey => [
		connectionId,
		"objects",
		bucket,
		prefix,
	],
	countPrefixes: (connectionId: string, bucket: string): QueryKey => [connectionId, "countPrefix", bucket],
	countPrefix: (connectionId: string, bucket: string, prefix: string): QueryKey => [
		connectionId,
		"countPrefix",
		bucket,
		prefix,
	],
	stream: (connectionId: string, bucket: string, key: string): QueryKey => [connectionId, "stream", bucket, key],
};

export const connectionsQuery = () =>
	queryOptions({
		queryKey: queryKeys.connections(),
		queryFn: async () => unwrap(await api.connections.list()),
	});

export const profilesQuery = () =>
	queryOptions({
		queryKey: queryKeys.profiles(),
		queryFn: async () => unwrap(await api.connections.listProfiles()),
	});

export const bucketsQuery = (connectionId: string) =>
	queryOptions({
		queryKey: queryKeys.buckets(connectionId),
		queryFn: async () => unwrap(await api.buckets.list({ connectionId })),
	});

export const objectsQuery = ({ connectionId, bucket, prefix }: ListingScope) =>
	infiniteQueryOptions({
		queryKey: queryKeys.objectList(connectionId, bucket, prefix),
		queryFn: async ({ pageParam }): Promise<ObjectsPage> => {
			const request: ListObjectsRequest = { connectionId, bucket, prefix };
			if (pageParam) request.token = pageParam;
			return unwrap(await api.objects.list(request));
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.nextToken,
	});

export const countPrefixQuery = ({ connectionId, bucket, prefix }: ListingScope) =>
	queryOptions({
		queryKey: queryKeys.countPrefix(connectionId, bucket, prefix),
		queryFn: async () => unwrap(await api.ops.countPrefix({ connectionId, bucket, prefix })),
	});

export const streamOpenQuery = (request: { connectionId: string; bucket: string; key: string }) =>
	queryOptions({
		queryKey: queryKeys.stream(request.connectionId, request.bucket, request.key),
		queryFn: async () => unwrap(await api.stream.open(request)),
		staleTime: Number.POSITIVE_INFINITY,
	});

/** IPC errors carry codes the UI handles itself, so retries and focus refetches are off. */
export const createQueryClient = () =>
	new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

/** The folder prefix whose listing contains the key or folder prefix. */
export function parentPrefix(keyOrPrefix: string): string {
	const trimmed = keyOrPrefix.endsWith("/") ? keyOrPrefix.slice(0, -1) : keyOrPrefix;
	const slash = trimmed.lastIndexOf("/");
	return slash === -1 ? "" : trimmed.slice(0, slash + 1);
}

function listings(connectionId: string, bucket: string, ...keysOrPrefixes: string[]): QueryKey[] {
	const parents = [...new Set(keysOrPrefixes.map(parentPrefix))];
	return parents.map((parent) => queryKeys.objectList(connectionId, bucket, parent));
}

/** The exact keys each mutation must invalidate. */
export const invalidations = {
	saveConnection: (): QueryKey[] => [queryKeys.connections()],
	deleteConnection: (connectionId: string): QueryKey[] => [queryKeys.connections(), queryKeys.connection(connectionId)],
	pinBucket: (connectionId: string): QueryKey[] => [queryKeys.connections(), queryKeys.buckets(connectionId)],
	unpinBucket: (connectionId: string): QueryKey[] => [queryKeys.connections(), queryKeys.buckets(connectionId)],
	addBucket: (connectionId: string): QueryKey[] => [queryKeys.connections(), queryKeys.buckets(connectionId)],
	createBucket: (connectionId: string): QueryKey[] => [queryKeys.buckets(connectionId)],
	deleteBucket: (connectionId: string, bucket: string): QueryKey[] => [
		queryKeys.buckets(connectionId),
		queryKeys.bucketObjects(connectionId, bucket),
	],
	createFolder: (connectionId: string, bucket: string, parent: string): QueryKey[] => [
		queryKeys.objectList(connectionId, bucket, parent),
	],
	deleteObjects: (connectionId: string, bucket: string, objectKeys: string[]): QueryKey[] => [
		...listings(connectionId, bucket, ...objectKeys),
		queryKeys.countPrefixes(connectionId, bucket),
	],
	deletePrefix: (connectionId: string, bucket: string, prefix: string): QueryKey[] => [
		...listings(connectionId, bucket, prefix),
		queryKeys.countPrefixes(connectionId, bucket),
	],
	rename: (connectionId: string, bucket: string, fromKey: string, toKey: string): QueryKey[] =>
		listings(connectionId, bucket, fromKey, toKey),
	renamePrefix: (connectionId: string, bucket: string, fromPrefix: string, toPrefix: string): QueryKey[] => [
		...listings(connectionId, bucket, fromPrefix, toPrefix),
		queryKeys.countPrefixes(connectionId, bucket),
	],
	upload: (connectionId: string, bucket: string, prefix: string): QueryKey[] => [
		queryKeys.objectList(connectionId, bucket, prefix),
	],
};

function isObjectListKey(key: QueryKey): boolean {
	return key.length >= 2 && key[1] === "objects";
}

export function invalidateKeys(queryClient: QueryClient, keys: QueryKey[]): Promise<unknown> {
	return Promise.all(
		keys.map((queryKey) => {
			if (isObjectListKey(queryKey)) {
				queryClient.setQueriesData<InfiniteData<ObjectsPage, string | undefined>>({ queryKey }, (d) =>
					d ? { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) } : d,
				);
			}
			return queryClient.invalidateQueries({ queryKey });
		}),
	);
}
