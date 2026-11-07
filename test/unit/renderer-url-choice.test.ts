import { describe, expect, it } from "vitest";

interface UrlChoiceModule {
	isPresignedUrl(url: string): boolean;
	extractBucketFromUrl(url: string, endpointHosts?: string[]): string | null;
	chooseDefaultConnection(input: {
		url: string;
		connections: Array<{
			id: string;
			name: string;
			pinnedBuckets: string[];
			extraBuckets: string[];
			endpoint?: string;
		}>;
		selectedConnectionId?: string | null;
		currentBucketList?: string[];
	}): string | "anonymous";
	getUrlFileName(url: string): string;
}

const modulePath = "../../src/renderer/src/urlChoice";
const { chooseDefaultConnection, extractBucketFromUrl, isPresignedUrl, getUrlFileName } = (await import(
	modulePath
)) as UrlChoiceModule;

describe("urlChoice", () => {
	const sampleConnections = [
		{
			id: "conn-profile",
			name: "Work Profile",
			pinnedBuckets: ["work-media", "shared-assets"],
			extraBuckets: ["extra-work"],
		},
		{
			id: "conn-minio",
			name: "Local MinIO",
			pinnedBuckets: ["local-bucket"],
			extraBuckets: [],
			endpoint: "http://127.0.0.1:9000",
		},
		{
			id: "conn-backup",
			name: "Backups",
			pinnedBuckets: ["backup-vault"],
			extraBuckets: ["archive-bucket"],
		},
	];

	describe("isPresignedUrl", () => {
		it("detects X-Amz-Signature query parameter", () => {
			expect(isPresignedUrl("https://bucket.s3.amazonaws.com/test.mp4?X-Amz-Signature=abcd123")).toBe(true);
		});

		it("detects Signature and Expires query parameters", () => {
			expect(isPresignedUrl("https://bucket.s3.amazonaws.com/test.mp4?Signature=xyz&Expires=12345")).toBe(true);
		});

		it("returns false for unsigned URLs", () => {
			expect(isPresignedUrl("https://bucket.s3.amazonaws.com/test.mp4")).toBe(false);
			expect(isPresignedUrl("s3://bucket/test.mp4")).toBe(false);
		});
	});

	describe("extractBucketFromUrl", () => {
		it("extracts from s3:// URLs", () => {
			expect(extractBucketFromUrl("s3://my-bucket/path/to/object")).toBe("my-bucket");
			expect(extractBucketFromUrl("s3://photos/vacation.jpg")).toBe("photos");
		});

		it("extracts from AWS virtual-hosted style URLs", () => {
			expect(extractBucketFromUrl("https://my-bucket.s3.us-west-2.amazonaws.com/clip.mp4")).toBe("my-bucket");
			expect(extractBucketFromUrl("https://assets.s3.amazonaws.com/logo.png")).toBe("assets");
		});

		it("extracts from AWS path style URLs", () => {
			expect(extractBucketFromUrl("https://s3.us-west-2.amazonaws.com/my-bucket/clip.mp4")).toBe("my-bucket");
			expect(extractBucketFromUrl("https://s3.amazonaws.com/assets/logo.png")).toBe("assets");
		});

		it("extracts from custom endpoint URLs", () => {
			expect(extractBucketFromUrl("http://127.0.0.1:9000/local-bucket/movie.mkv", ["127.0.0.1:9000"])).toBe(
				"local-bucket",
			);
		});

		it("returns null for unrecognized URLs", () => {
			expect(extractBucketFromUrl("https://example.com/not-s3.mp4")).toBe(null);
			expect(extractBucketFromUrl("")).toBe(null);
		});
	});

	describe("chooseDefaultConnection", () => {
		it("preselects anonymous for presigned URLs", () => {
			const choice = chooseDefaultConnection({
				url: "https://my-bucket.s3.amazonaws.com/test.mp4?X-Amz-Signature=abcd",
				connections: sampleConnections,
				selectedConnectionId: "conn-profile",
			});
			expect(choice).toBe("anonymous");
		});

		it("preselects anonymous when both Signature and Expires are present", () => {
			const choice = chooseDefaultConnection({
				url: "https://example.com/test.mp4?Signature=abc&Expires=9999",
				connections: sampleConnections,
				selectedConnectionId: "conn-profile",
			});
			expect(choice).toBe("anonymous");
		});

		it("preselects connection that pins the extracted bucket", () => {
			const choice = chooseDefaultConnection({
				url: "s3://shared-assets/images/header.png",
				connections: sampleConnections,
				selectedConnectionId: "conn-backup",
			});
			expect(choice).toBe("conn-profile");
		});

		it("preselects connection that has bucket in extraBuckets", () => {
			const choice = chooseDefaultConnection({
				url: "https://archive-bucket.s3.us-east-1.amazonaws.com/dump.tar",
				connections: sampleConnections,
				selectedConnectionId: "conn-profile",
			});
			expect(choice).toBe("conn-backup");
		});

		it("preselects connection from custom endpoint bucket", () => {
			const choice = chooseDefaultConnection({
				url: "http://127.0.0.1:9000/local-bucket/stream.webm",
				connections: sampleConnections,
				selectedConnectionId: "conn-profile",
			});
			expect(choice).toBe("conn-minio");
		});

		it("preselects selected sidebar connection if bucket matches current bucket list", () => {
			const choice = chooseDefaultConnection({
				url: "s3://unpinned-listed-bucket/data.csv",
				connections: sampleConnections,
				selectedConnectionId: "conn-profile",
				currentBucketList: ["unpinned-listed-bucket", "other"],
			});
			expect(choice).toBe("conn-profile");
		});

		it("falls back to selected sidebar connection when URL bucket is unpinned", () => {
			const choice = chooseDefaultConnection({
				url: "s3://completely-unknown-bucket/file.txt",
				connections: sampleConnections,
				selectedConnectionId: "conn-backup",
			});
			expect(choice).toBe("conn-backup");
		});

		it("falls back to first connection when none is selected", () => {
			const choice = chooseDefaultConnection({
				url: "https://unknown.example.com/file.mp4",
				connections: sampleConnections,
				selectedConnectionId: null,
			});
			expect(choice).toBe("conn-profile");
		});

		it("falls back to anonymous when connections list is empty", () => {
			const choice = chooseDefaultConnection({
				url: "https://unknown.example.com/file.mp4",
				connections: [],
			});
			expect(choice).toBe("anonymous");
		});
	});

	describe("getUrlFileName", () => {
		it("extracts last path segment as filename", () => {
			expect(getUrlFileName("https://example.com/path/to/my-video.mp4?query=1")).toBe("my-video.mp4");
			expect(getUrlFileName("s3://bucket/nested/folder/report.pdf")).toBe("report.pdf");
			expect(getUrlFileName("https://example.com/hello%20world.txt")).toBe("hello world.txt");
		});

		it("returns fallback for root path", () => {
			expect(getUrlFileName("https://example.com/")).toBe("download");
		});
	});
});
