import { describe, expect, it } from "vitest";
import { endpointHostOf, resolveUrl } from "../../src/main/url/resolve";

const acceptedCases = [
	{
		name: "canonicalizes an S3 URL with a simple bucket",
		input: "s3://media/films/clip.mp4?download=1#section",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media",
				key: "films/clip.mp4",
				url: "https://media.s3.amazonaws.com/films/clip.mp4",
			},
		},
	},
	{
		name: "canonicalizes dotted S3 buckets and encoded nested keys",
		input: "s3://media.archive/a%20b/c%2Bd?ignored=yes",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media.archive",
				key: "a b/c+d",
				url: "https://s3.amazonaws.com/media.archive/a%20b/c%2Bd",
			},
		},
	},
	{
		name: "accepts an S3 URL with a plus in its key",
		input: "s3://media/a+b",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media",
				key: "a+b",
				url: "https://media.s3.amazonaws.com/a%2Bb",
			},
		},
	},
	{
		name: "accepts the global path-style AWS endpoint",
		input: "https://s3.amazonaws.com/media/a/b?version=1#part",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media",
				key: "a/b",
				url: "https://s3.amazonaws.com/media/a/b",
			},
		},
	},
	{
		name: "accepts the regional path-style AWS endpoint",
		input: "https://s3.us-east-1.amazonaws.com/media/a%20b",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media",
				key: "a b",
				region: "us-east-1",
				url: "https://s3.us-east-1.amazonaws.com/media/a%20b",
			},
		},
	},
	{
		name: "accepts the hyphenated regional path-style AWS endpoint",
		input: "https://s3-us-west-2.amazonaws.com/media/a",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media",
				key: "a",
				region: "us-west-2",
				url: "https://s3-us-west-2.amazonaws.com/media/a",
			},
		},
	},
	{
		name: "accepts the dualstack regional path-style endpoint",
		input: "https://s3.dualstack.eu-west-1.amazonaws.com/media/a",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media",
				key: "a",
				region: "eu-west-1",
				url: "https://s3.dualstack.eu-west-1.amazonaws.com/media/a",
			},
		},
	},
	{
		name: "accepts the FIPS regional path-style endpoint",
		input: "https://s3-fips.us-gov-west-1.amazonaws.com/media/a",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media",
				key: "a",
				region: "us-gov-west-1",
				url: "https://s3-fips.us-gov-west-1.amazonaws.com/media/a",
			},
		},
	},
	{
		name: "accepts the FIPS dualstack regional path-style endpoint",
		input: "https://s3-fips.dualstack.eu-central-1.amazonaws.com/media/a",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media",
				key: "a",
				region: "eu-central-1",
				url: "https://s3-fips.dualstack.eu-central-1.amazonaws.com/media/a",
			},
		},
	},
	{
		name: "accepts the global virtual-hosted endpoint",
		input: "https://media.s3.amazonaws.com/a/b",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media",
				key: "a/b",
				url: "https://media.s3.amazonaws.com/a/b",
			},
		},
	},
	{
		name: "matches dotted buckets on the region-less virtual-hosted endpoint",
		input: "https://team.media.s3.amazonaws.com/a/b",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "team.media",
				key: "a/b",
				url: "https://team.media.s3.amazonaws.com/a/b",
			},
		},
	},
	{
		name: "matches dotted virtual-hosted buckets from the right",
		input: "https://team.media.s3.us-east-1.amazonaws.com/a%20b/c%2Bd?x=1#f",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "team.media",
				key: "a b/c+d",
				region: "us-east-1",
				url: "https://team.media.s3.us-east-1.amazonaws.com/a%20b/c%2Bd",
			},
		},
	},
	{
		name: "matches dotted buckets on the hyphenated regional virtual host",
		input: "https://team.media.s3-us-west-2.amazonaws.com/a/b",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "team.media",
				key: "a/b",
				region: "us-west-2",
				url: "https://team.media.s3-us-west-2.amazonaws.com/a/b",
			},
		},
	},
	{
		name: "matches dotted buckets on the dualstack virtual-hosted endpoint",
		input: "https://team.media.s3.dualstack.eu-west-1.amazonaws.com/a/b",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "team.media",
				key: "a/b",
				region: "eu-west-1",
				url: "https://team.media.s3.dualstack.eu-west-1.amazonaws.com/a/b",
			},
		},
	},
	{
		name: "matches dotted buckets on the FIPS virtual-hosted endpoint",
		input: "https://team.media.s3-fips.us-gov-west-1.amazonaws.com/a/b",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "team.media",
				key: "a/b",
				region: "us-gov-west-1",
				url: "https://team.media.s3-fips.us-gov-west-1.amazonaws.com/a/b",
			},
		},
	},
	{
		name: "matches dotted buckets on the FIPS dualstack virtual host",
		input: "https://team.media.s3-fips.dualstack.eu-central-1.amazonaws.com/a/b",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "team.media",
				key: "a/b",
				region: "eu-central-1",
				url: "https://team.media.s3-fips.dualstack.eu-central-1.amazonaws.com/a/b",
			},
		},
	},
	{
		name: "accepts an object URL of exactly 8192 characters",
		input: `https://s3.amazonaws.com/media/${"a".repeat(8192 - "https://s3.amazonaws.com/media/".length)}`,
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media",
				key: "a".repeat(8192 - "https://s3.amazonaws.com/media/".length),
				url: `https://s3.amazonaws.com/media/${"a".repeat(8192 - "https://s3.amazonaws.com/media/".length)}`,
			},
		},
	},
	{
		name: "accepts a hyphenated regional virtual-hosted endpoint",
		input: "https://media.s3-us-west-2.amazonaws.com/key",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media",
				key: "key",
				region: "us-west-2",
				url: "https://media.s3-us-west-2.amazonaws.com/key",
			},
		},
	},
	{
		name: "accepts a dualstack regional virtual-hosted endpoint",
		input: "https://media.s3.dualstack.eu-west-1.amazonaws.com/key",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media",
				key: "key",
				region: "eu-west-1",
				url: "https://media.s3.dualstack.eu-west-1.amazonaws.com/key",
			},
		},
	},
	{
		name: "accepts a FIPS regional virtual-hosted endpoint",
		input: "https://media.s3-fips.us-gov-west-1.amazonaws.com/key",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media",
				key: "key",
				region: "us-gov-west-1",
				url: "https://media.s3-fips.us-gov-west-1.amazonaws.com/key",
			},
		},
	},
	{
		name: "accepts a FIPS dualstack virtual-hosted endpoint",
		input: "https://media.s3-fips.dualstack.eu-central-1.amazonaws.com/key",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media",
				key: "key",
				region: "eu-central-1",
				url: "https://media.s3-fips.dualstack.eu-central-1.amazonaws.com/key",
			},
		},
	},
	{
		name: "accepts a configured HTTP endpoint with a custom port",
		input: "http://storage.example:9000/media/a/b?download=1#top",
		endpointHosts: ["storage.example:9000"],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media",
				key: "a/b",
				url: "http://storage.example:9000/media/a/b",
			},
		},
	},
	{
		name: "accepts a dotted virtual bucket on a configured endpoint",
		input: "https://team.media.storage.example/key%20name",
		endpointHosts: ["storage.example"],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "team.media",
				key: "key name",
				url: "https://team.media.storage.example/key%20name",
			},
		},
	},
	{
		name: "preserves the trimmed object URL except for query and fragment",
		input: "  HTTPS://Team.Media.S3.us-east-1.amazonaws.com:443/%7e?x=1#part  ",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "team.media",
				key: "~",
				region: "us-east-1",
				url: "HTTPS://Team.Media.S3.us-east-1.amazonaws.com:443/%7e",
			},
		},
	},
	{
		name: "matches a configured endpoint with its default port",
		input: "https://storage.example:443/media/key",
		endpointHosts: ["storage.example"],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "media",
				key: "key",
				url: "https://storage.example:443/media/key",
			},
		},
	},
	{
		name: "matches a configured virtual endpoint with a custom port",
		input: "https://team.media.storage.example:9443/key",
		endpointHosts: ["storage.example:9443"],
		expected: {
			ok: true,
			value: {
				kind: "object",
				bucket: "team.media",
				key: "key",
				url: "https://team.media.storage.example:9443/key",
			},
		},
	},
	{
		name: "detects a mixed-case signature parameter on an S3 host",
		input: "https://s3.amazonaws.com/media/key?x-AmZ-sIgNaTuRe=secret",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "presigned",
				url: "https://s3.amazonaws.com/media/key?x-AmZ-sIgNaTuRe=secret",
			},
		},
	},
	{
		name: "detects Signature and Expires on a non-S3 host",
		input: "https://download.example/file?signature=abc&EXPIRES=123",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "presigned",
				url: "https://download.example/file?signature=abc&EXPIRES=123",
			},
		},
	},
	{
		name: "detects the exact AWS signature parameter on a non-S3 host",
		input: "http://unconfigured.example/file?X-AMZ-SIGNATURE=value",
		endpointHosts: [],
		expected: {
			ok: true,
			value: {
				kind: "presigned",
				url: "http://unconfigured.example/file?X-AMZ-SIGNATURE=value",
			},
		},
	},
] as const;

const invalidCases: Array<{
	name: string;
	input: string;
	endpointHosts?: readonly string[];
}> = [
	{ name: "empty input", input: "" },
	{ name: "whitespace-only input", input: " \t\n " },
	{ name: "input longer than 8192 characters", input: `https://${"a".repeat(8190)}` },
	{
		name: "object URL of exactly 8193 characters",
		input: `https://s3.amazonaws.com/media/${"a".repeat(8193 - "https://s3.amazonaws.com/media/".length)}`,
	},
	{ name: "URL parsing failure", input: "https://[" },
	{ name: "URL username", input: "https://user@example.com/a" },
	{ name: "URL password", input: "https://user:pass@example.com/a" },
	{ name: "S3 URL with no bucket", input: "s3:///key" },
	{ name: "S3 URL with no key", input: "s3://media/" },
	{ name: "S3 URL with malformed encoding", input: "s3://media/%E0%A4%A" },
	{ name: "AWS path URL with no bucket", input: "https://s3.amazonaws.com/" },
	{ name: "AWS path URL with no key", input: "https://s3.amazonaws.com/media" },
	{ name: "AWS virtual URL with no key", input: "https://media.s3.amazonaws.com/" },
	{
		name: "AWS URL with malformed encoding",
		input: "https://s3.amazonaws.com/media/%ZZ",
	},
	{
		name: "configured endpoint URL with malformed encoding",
		input: "https://storage.example/media/%E0%A4%A",
		endpointHosts: ["storage.example"],
	},
	{
		name: "configured path-style URL with no bucket",
		input: "https://storage.example/",
		endpointHosts: ["storage.example"],
	},
	{
		name: "configured path-style URL with no key",
		input: "https://storage.example/media",
		endpointHosts: ["storage.example"],
	},
	{
		name: "configured virtual URL with no key",
		input: "https://media.storage.example/",
		endpointHosts: ["storage.example"],
	},
] as const;

const unsupportedCases = [
	{ name: "unsigned non-S3 host", input: "https://example.com/media/key" },
	{ name: "HTTP on an AWS S3 host", input: "http://s3.amazonaws.com/media/key" },
	{ name: "FTP URL", input: "ftp://example.com/media/key" },
	{ name: "file URL", input: "file:///etc/passwd" },
	{ name: "javascript URL", input: "javascript:alert(1)" },
	{ name: "data URL", input: "data:text/plain,hello" },
	{ name: "evil-amazonaws lookalike", input: "https://evil-amazonaws.com/a" },
	{
		name: "amazonaws.com.evil.com lookalike",
		input: "https://amazonaws.com.evil.com/a",
	},
	{ name: "S3 suffix lookalike", input: "https://s3.amazonaws.com.evil.com/media/a" },
	{ name: "EC2 service host", input: "https://ec2.amazonaws.com/a" },
	{ name: "S3 accelerate host", input: "https://s3-accelerate.amazonaws.com/media/a" },
	{
		name: "S3 website host",
		input: "https://s3-website-us-east-1.amazonaws.com/media/a",
	},
	{ name: "S3 external host", input: "https://s3-external-1.amazonaws.com/media/a" },
	{
		name: "S3 access point host",
		input: "https://alias-123.s3-accesspoint.us-east-1.amazonaws.com/key",
	},
	{
		name: "S3 object lambda host",
		input: "https://alias-123.s3-object-lambda.us-east-1.amazonaws.com/key",
	},
	{ name: "China AWS host", input: "https://s3.us-east-1.amazonaws.com.cn/media/a" },
	{ name: "non-default AWS port", input: "https://s3.amazonaws.com:444/media/a" },
	{
		name: "bare Signature without Expires",
		input: "https://example.com/a?Signature=abc",
	},
	{
		name: "endpoint host that is not configured",
		input: "https://storage.example/media/key",
	},
	{ name: "free-text AWS region", input: "https://s3.free-text.amazonaws.com/media/a" },
	{ name: "malformed AWS region", input: "https://s3.us-east-1x.amazonaws.com/media/a" },
] as const;

describe("resolveUrl", () => {
	it.each(acceptedCases)("$name", ({ input, endpointHosts, expected }) => {
		expect(resolveUrl(input, { endpointHosts })).toEqual(expected);
	});

	it.each(invalidCases)("returns invalid for $name", ({ input, endpointHosts }) => {
		expect(resolveUrl(input, { endpointHosts: endpointHosts ?? [] })).toEqual({
			ok: false,
			reason: "invalid",
		});
	});

	it.each(unsupportedCases)("returns unsupported for $name", ({ input }) => {
		expect(resolveUrl(input, { endpointHosts: [] })).toEqual({
			ok: false,
			reason: "unsupported",
		});
	});
});

describe("endpointHostOf", () => {
	it.each([
		["https://Storage.Example:443/path", "storage.example"],
		["http://Storage.Example:9000/path", "storage.example:9000"],
		[undefined, undefined],
		["not a URL", undefined],
	])("normalizes endpoint %j", (endpoint, expected) => {
		expect(endpointHostOf(endpoint)).toBe(expected);
	});
});
