export interface ConnectionOption {
	id: string;
	name: string;
	pinnedBuckets: string[];
	extraBuckets: string[];
	endpoint?: string;
}

export interface DefaultChoiceInput {
	url: string;
	connections: ConnectionOption[];
	selectedConnectionId?: string | null;
	currentBucketList?: string[];
}

export function isPresignedUrl(urlStr: string): boolean {
	try {
		const parsed = new URL(urlStr);
		if (parsed.searchParams.has("X-Amz-Signature")) {
			return true;
		}
		if (
			parsed.searchParams.has("Signature") &&
			parsed.searchParams.has("Expires")
		) {
			return true;
		}
	} catch {
		if (urlStr.includes("X-Amz-Signature=")) {
			return true;
		}
		if (urlStr.includes("Signature=") && urlStr.includes("Expires=")) {
			return true;
		}
	}
	return false;
}

function extractEndpointHost(endpointStr?: string): string | null {
	if (!endpointStr) {
		return null;
	}
	try {
		const parsed = new URL(endpointStr);
		return parsed.host.toLowerCase();
	} catch {
		return null;
	}
}

export function extractBucketFromUrl(
	urlStr: string,
	endpointHosts: string[] = [],
): string | null {
	const trimmed = urlStr.trim();
	if (!trimmed) {
		return null;
	}

	if (trimmed.startsWith("s3://")) {
		const withoutScheme = trimmed.slice(5);
		const slashIndex = withoutScheme.indexOf("/");
		const bucket =
			slashIndex >= 0 ? withoutScheme.slice(0, slashIndex) : withoutScheme;
		return bucket.length > 0 ? bucket : null;
	}

	try {
		const parsed = new URL(trimmed);
		const host = parsed.host.toLowerCase();
		const hostname = parsed.hostname.toLowerCase();
		const pathSegments = parsed.pathname.split("/").filter(Boolean);

		// AWS virtual-hosted style: <bucket>.s3.<region>.amazonaws.com or <bucket>.s3.amazonaws.com
		const s3VirtualHostedMatch =
			/^([a-z0-9][a-z0-9.-]{1,62})\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.exec(
				hostname,
			);
		if (s3VirtualHostedMatch && s3VirtualHostedMatch[1]) {
			return s3VirtualHostedMatch[1];
		}

		// AWS path style: s3.<region>.amazonaws.com/<bucket>/... or s3.amazonaws.com/<bucket>/...
		const s3PathMatch =
			/^s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(hostname);
		if (s3PathMatch && pathSegments.length > 0) {
			return pathSegments[0]!;
		}

		// Check custom endpoint hosts
		for (const endpointHost of endpointHosts) {
			const cleanEndpoint = endpointHost.toLowerCase();
			if (host === cleanEndpoint || hostname === cleanEndpoint) {
				if (pathSegments.length > 0) {
					return pathSegments[0]!;
				}
			}
		}

		return null;
	} catch {
		return null;
	}
}

export function chooseDefaultConnection(
	input: DefaultChoiceInput,
): string | "anonymous" {
	const { url, connections, selectedConnectionId, currentBucketList } = input;

	if (isPresignedUrl(url)) {
		return "anonymous";
	}

	const endpointHosts = connections
		.map((conn) => extractEndpointHost(conn.endpoint))
		.filter((h): h is string => h !== null);

	const extractedBucket = extractBucketFromUrl(url, endpointHosts);

	if (extractedBucket) {
		// 1. Connection that lists or pins that bucket
		const matchingConn = connections.find((conn) => {
			if (
				conn.pinnedBuckets.includes(extractedBucket) ||
				conn.extraBuckets.includes(extractedBucket)
			) {
				return true;
			}
			if (
				conn.id === selectedConnectionId &&
				currentBucketList?.includes(extractedBucket)
			) {
				return true;
			}
			return false;
		});

		if (matchingConn) {
			return matchingConn.id;
		}
	}

	// 2. Otherwise selected sidebar connection
	if (selectedConnectionId) {
		const exists = connections.some((c) => c.id === selectedConnectionId);
		if (exists) {
			return selectedConnectionId;
		}
	}

	// 3. Fallback
	if (connections.length > 0) {
		return connections[0]!.id;
	}

	return "anonymous";
}

export function getUrlFileName(urlStr: string): string {
	try {
		const parsed = new URL(urlStr);
		const segments = parsed.pathname.split("/").filter(Boolean);
		if (segments.length > 0) {
			return decodeURIComponent(segments[segments.length - 1]!);
		}
	} catch {
		const withoutQuery = urlStr.split("?")[0]!.split("#")[0]!;
		const segments = withoutQuery.split("/").filter(Boolean);
		if (segments.length > 0) {
			return segments[segments.length - 1]!;
		}
	}
	return "download";
}
