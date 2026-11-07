export type ResolvedUrl =
	| { kind: "presigned"; url: string }
	| {
			kind: "object";
			bucket: string;
			key: string;
			region?: string;
			url: string;
	  };
export type ResolveResult = { ok: true; value: ResolvedUrl } | { ok: false; reason: "invalid" | "unsupported" };

type AwsHostMatch = {
	bucket?: string;
	region?: string;
};

const region = "[a-z]{2}(?:-[a-z]+)+-[0-9]+";
const awsPathHostPatterns: readonly RegExp[] = [
	/^s3\.amazonaws\.com$/,
	new RegExp(`^s3\\.(${region})\\.amazonaws\\.com$`),
	new RegExp(`^s3-(${region})\\.amazonaws\\.com$`),
	new RegExp(`^s3\\.dualstack\\.(${region})\\.amazonaws\\.com$`),
	new RegExp(`^s3-fips\\.(${region})\\.amazonaws\\.com$`),
	new RegExp(`^s3-fips\\.dualstack\\.(${region})\\.amazonaws\\.com$`),
];
const awsVirtualHostPatterns: readonly RegExp[] = [
	/^(.+)\.s3\.amazonaws\.com$/,
	new RegExp(`^(.+)\\.s3\\.(${region})\\.amazonaws\\.com$`),
	new RegExp(`^(.+)\\.s3-(${region})\\.amazonaws\\.com$`),
	new RegExp(`^(.+)\\.s3\\.dualstack\\.(${region})\\.amazonaws\\.com$`),
	new RegExp(`^(.+)\\.s3-fips\\.(${region})\\.amazonaws\\.com$`),
	new RegExp(`^(.+)\\.s3-fips\\.dualstack\\.(${region})\\.amazonaws\\.com$`),
];

function decodePathSegments(pathname: string): string[] | undefined {
	const path = pathname.startsWith("/") ? pathname.slice(1) : pathname;
	try {
		return path.split("/").map((segment) => decodeURIComponent(segment));
	} catch {
		return undefined;
	}
}

function objectFromPathStyle(parsed: URL, input: string, regionValue?: string): ResolveResult {
	const segments = decodePathSegments(parsed.pathname);
	if (!segments) return { ok: false, reason: "invalid" };
	const bucket = segments[0] ?? "";
	const key = segments.slice(1).join("/");
	if (!bucket || !key) return { ok: false, reason: "invalid" };
	return {
		ok: true,
		value: {
			kind: "object",
			bucket,
			key,
			...(regionValue ? { region: regionValue } : {}),
			url: withoutQueryAndFragment(input),
		},
	};
}

function objectFromVirtualPath(parsed: URL, input: string, bucket: string, regionValue?: string): ResolveResult {
	const segments = decodePathSegments(parsed.pathname);
	if (!segments) return { ok: false, reason: "invalid" };
	const key = segments.join("/");
	if (!bucket || !key) return { ok: false, reason: "invalid" };
	return {
		ok: true,
		value: {
			kind: "object",
			bucket,
			key,
			...(regionValue ? { region: regionValue } : {}),
			url: withoutQueryAndFragment(input),
		},
	};
}

function withoutQueryAndFragment(url: string): string {
	const query = url.indexOf("?");
	const fragment = url.indexOf("#");
	let end = url.length;
	if (query >= 0) end = Math.min(end, query);
	if (fragment >= 0) end = Math.min(end, fragment);
	return url.slice(0, end);
}

function matchAwsHost(hostname: string): AwsHostMatch | undefined {
	for (const pattern of awsPathHostPatterns) {
		const match = pattern.exec(hostname);
		if (match) {
			return match[1] ? { region: match[1] } : {};
		}
	}
	for (const pattern of awsVirtualHostPatterns) {
		const match = pattern.exec(hostname);
		if (match) {
			return {
				bucket: match[1],
				...(match[2] ? { region: match[2] } : {}),
			};
		}
	}
	return undefined;
}

function isAwsLookalike(hostname: string): boolean {
	return hostname.includes("amazonaws.com");
}

function isPresigned(parsed: URL): boolean {
	const names = new Set(Array.from(parsed.searchParams.keys(), (name) => name.toLowerCase()));
	return names.has("x-amz-signature") || (names.has("signature") && names.has("expires"));
}

function canonicalS3Url(bucket: string, key: string): string {
	const encodedKey = key
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	if (bucket.includes(".")) {
		return `https://s3.amazonaws.com/${bucket}/${encodedKey}`;
	}
	return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
}

export function resolveUrl(input: string, options: { endpointHosts: readonly string[] }): ResolveResult {
	const trimmed = input.trim();
	if (!trimmed || trimmed.length > 8192) {
		return { ok: false, reason: "invalid" };
	}

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return { ok: false, reason: "invalid" };
	}
	if (parsed.username || parsed.password) {
		return { ok: false, reason: "invalid" };
	}

	if (parsed.protocol === "s3:") {
		const bucket = parsed.hostname;
		const segments = decodePathSegments(parsed.pathname);
		if (!segments) return { ok: false, reason: "invalid" };
		const key = segments.join("/");
		if (!bucket || !key) return { ok: false, reason: "invalid" };
		return {
			ok: true,
			value: {
				kind: "object",
				bucket,
				key,
				url: canonicalS3Url(bucket, key),
			},
		};
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return { ok: false, reason: "unsupported" };
	}
	if (isPresigned(parsed)) {
		return { ok: true, value: { kind: "presigned", url: trimmed } };
	}

	const hostname = parsed.hostname.toLowerCase();
	if (parsed.protocol === "https:" && parsed.port === "") {
		const awsMatch = matchAwsHost(hostname);
		if (awsMatch) {
			if (awsMatch.bucket !== undefined) {
				return objectFromVirtualPath(parsed, trimmed, awsMatch.bucket, awsMatch.region);
			}
			return objectFromPathStyle(parsed, trimmed, awsMatch.region);
		}
	}
	if (isAwsLookalike(hostname)) {
		return { ok: false, reason: "unsupported" };
	}

	const host = parsed.host.toLowerCase();
	const endpointHosts = options.endpointHosts.map((entry) => entry.toLowerCase());
	if (endpointHosts.includes(host)) {
		return objectFromPathStyle(parsed, trimmed);
	}
	for (const endpointHost of endpointHosts) {
		if (host.endsWith(`.${endpointHost}`)) {
			const bucket = host.slice(0, -(endpointHost.length + 1));
			return objectFromVirtualPath(parsed, trimmed, bucket);
		}
	}
	return { ok: false, reason: "unsupported" };
}

export function endpointHostOf(endpoint: string | undefined): string | undefined {
	if (endpoint === undefined) return undefined;
	try {
		return new URL(endpoint).host.toLowerCase();
	} catch {
		return undefined;
	}
}
