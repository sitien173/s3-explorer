import { describe, expect, it } from "vitest";
import { channels } from "../../src/shared/channels";
import { createBucketName, createRequest, schemas, updateRequest } from "../../src/shared/ipc";
import {
	addBucketFormSchema,
	connectionFormSchema,
	createBucketFormSchema,
	newFolderFormSchema,
	openUrlFormSchema,
	renameFormSchema,
} from "../../src/renderer/src/forms";
import { buildCreateRequest, buildUpdateRequest, type ConnectionFormState } from "../../src/renderer/src/format";

const messageAt = (
	result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
	field: string,
) => result.error?.issues.find((issue) => issue.path[0] === field)?.message;

// The IPC schema throws on a non-URL endpoint, which the main process treats as a rejection.
const accepted = (parse: () => { success: boolean }) => {
	try {
		return parse().success;
	} catch {
		return false;
	}
};

const base: ConnectionFormState = { name: "Prod", kind: "profile", profile: "default", forcePathStyle: false };
const manual: ConnectionFormState = {
	...base,
	kind: "manual",
	region: "us-east-1",
	accessKeyId: "AKIA",
	secretAccessKey: "secret",
};

describe("connectionFormSchema mirrors the IPC create and update schemas", () => {
	const createCases: [string, ConnectionFormState][] = [
		["valid profile", base],
		["valid manual", manual],
		["name 128", { ...base, name: "n".repeat(128) }],
		["name 129", { ...base, name: "n".repeat(129) }],
		["blank name", { ...base, name: "   " }],
		["blank profile", { ...base, profile: " " }],
		["profile with leading dash", { ...base, profile: "-bad" }],
		["profile 128", { ...base, profile: "p".repeat(128) }],
		["profile 129", { ...base, profile: "p".repeat(129) }],
		["profile region override 128", { ...base, region: "r".repeat(128) }],
		["profile region override 129", { ...base, region: "r".repeat(129) }],
		["https endpoint", { ...base, endpoint: "https://s3.example.com" }],
		["http endpoint with port", { ...base, endpoint: "http://127.0.0.1:9000" }],
		["ftp endpoint", { ...base, endpoint: "ftp://example.com" }],
		["non-url endpoint", { ...base, endpoint: "not a url" }],
		["blank endpoint", { ...base, endpoint: "  " }],
		["manual blank region", { ...manual, region: "" }],
		["manual region 129 has no limit", { ...manual, region: "r".repeat(129) }],
		["manual blank access key", { ...manual, accessKeyId: " " }],
		["manual blank secret", { ...manual, secretAccessKey: "" }],
		["manual bad endpoint", { ...manual, endpoint: "ftp://x" }],
	];
	it.each(createCases)("create: %s", (_label, values) => {
		const ipc = accepted(() => createRequest.safeParse(buildCreateRequest(values)));
		expect(connectionFormSchema(false).safeParse(values).success).toBe(ipc);
	});

	const updateCases: [string, ConnectionFormState][] = [
		["profile keeps blank profile out of the request", { ...base, profile: "default" }],
		["manual leaves secret blank", { ...manual, accessKeyId: "", secretAccessKey: "" }],
		["manual region 129", { ...manual, region: "r".repeat(129) }],
		["name 129", { ...base, name: "n".repeat(129) }],
		["blank name", { ...base, name: "" }],
		["ftp endpoint", { ...base, endpoint: "ftp://example.com" }],
		["valid endpoint", { ...base, endpoint: "https://s3.example.com" }],
	];
	it.each(updateCases)("update: %s", (_label, values) => {
		const ipc = accepted(() => updateRequest.safeParse(buildUpdateRequest("c1", values)));
		// The form also requires a non-blank name, which the update request treats as an unchanged name.
		const expected = ipc && values.name.trim().length > 0;
		expect(connectionFormSchema(true).safeParse(values).success).toBe(expected);
	});

	it("keeps the field messages of the previous validation", () => {
		const empty = connectionFormSchema(false).safeParse({ ...base, name: "", profile: "" });
		expect(messageAt(empty, "name")).toBe("Connection name is required.");
		expect(messageAt(empty, "profile")).toBe("AWS profile name is required.");
		const blankManual = connectionFormSchema(false).safeParse({
			...manual,
			region: "",
			accessKeyId: "",
			secretAccessKey: "",
		});
		expect(messageAt(blankManual, "region")).toBe("AWS Region is required.");
		expect(messageAt(blankManual, "accessKeyId")).toBe("Access Key ID is required.");
		expect(messageAt(blankManual, "secretAccessKey")).toBe("Secret Access Key is required.");
	});
});

describe("renameFormSchema mirrors the IPC rename schemas", () => {
	const keyCases = ["a", "a/b.txt", "k".repeat(1024), "k".repeat(1025), "", "   ", "dir/", "other"];
	it.each(keyCases)("object key %#", (value) => {
		const parsed = renameFormSchema(false, "current").safeParse({ targetKey: value });
		const ipc = schemas[channels.opsRename].safeParse({
			connectionId: "c1",
			bucket: "b1",
			fromKey: "current",
			toKey: value.trim(),
		}).success;
		expect(parsed.success).toBe(ipc);
	});

	const prefixCases = ["a/", "a", `${"p".repeat(1023)}/`, `${"p".repeat(1024)}/`, "", "   "];
	it.each(prefixCases)("folder prefix %#", (value) => {
		const parsed = renameFormSchema(true, "current/").safeParse({ targetKey: value });
		const trimmed = value.trim();
		const toPrefix = trimmed && !trimmed.endsWith("/") ? `${trimmed}/` : trimmed;
		const ipc = schemas[channels.opsRenamePrefix].safeParse({
			opId: "op-12345678",
			connectionId: "c1",
			bucket: "b1",
			fromPrefix: "current/",
			toPrefix,
		}).success;
		expect(parsed.success).toBe(ipc);
	});

	it("rejects the unchanged name and returns the final key", () => {
		const same = renameFormSchema(false, "file.txt").safeParse({ targetKey: " file.txt " });
		expect(messageAt(same, "targetKey")).toBe("Target name must be different from current name.");
		const folderSame = renameFormSchema(true, "docs/").safeParse({ targetKey: "docs" });
		expect(messageAt(folderSame, "targetKey")).toBe("Target name must be different from current name.");
		const folder = renameFormSchema(true, "docs/").safeParse({ targetKey: " other " });
		expect(folder.data).toEqual({ targetKey: "other/" });
		const slash = renameFormSchema(false, "file.txt").safeParse({ targetKey: "dir/" });
		expect(messageAt(slash, "targetKey")).toBe("Object key cannot end with a slash.");
		const empty = renameFormSchema(false, "file.txt").safeParse({ targetKey: "  " });
		expect(messageAt(empty, "targetKey")).toBe("Target name cannot be empty.");
	});
});

describe("openUrlFormSchema mirrors the IPC open URL schema", () => {
	it.each(["s3://b/k", "u".repeat(8192), "u".repeat(8193), "", "   "])("url %#", (value) => {
		const parsed = openUrlFormSchema.safeParse({ url: value, connectionId: "anonymous" });
		const ipc = schemas[channels.streamOpenUrl].safeParse({ url: value.trim(), anonymous: true }).success;
		expect(parsed.success).toBe(ipc);
	});
	it("trims the url", () => {
		expect(openUrlFormSchema.parse({ url: "  s3://b/k ", connectionId: "c1" })).toEqual({
			url: "s3://b/k",
			connectionId: "c1",
		});
	});
});

describe("addBucketFormSchema mirrors the IPC add bucket schema", () => {
	const names = ["a", "A1", "a._-b", "a".repeat(255), "a".repeat(256), "", "   ", "-a", ".a", "a b", "a/b"];
	it.each(names)("bucket %#", (value) => {
		const parsed = addBucketFormSchema.safeParse({ bucket: value });
		const ipc = schemas[channels.bucketsAdd].safeParse({ connectionId: "c1", bucket: value.trim() }).success;
		expect(parsed.success).toBe(ipc);
	});
	it("uses the previous messages", () => {
		expect(messageAt(addBucketFormSchema.safeParse({ bucket: " " }), "bucket")).toBe("Bucket name is required.");
		expect(messageAt(addBucketFormSchema.safeParse({ bucket: "-a" }), "bucket")).toMatch(/^Invalid bucket name\./);
	});
});

describe("createBucketFormSchema reuses createBucketName", () => {
	const names = [
		"abc",
		"ab",
		"a".repeat(63),
		"a".repeat(64),
		"ABC",
		"a..b",
		"192.168.0.1",
		"xn--abc",
		"abc-s3alias",
		"  abc  ",
	];
	it.each(names)("bucket %#", (value) => {
		const parsed = createBucketFormSchema([]).safeParse({ bucket: value });
		expect(parsed.success).toBe(createBucketName.safeParse(value.trim()).success);
	});
	it("rejects a listed name after trimming", () => {
		const result = createBucketFormSchema(["taken"]).safeParse({ bucket: " taken " });
		expect(messageAt(result, "bucket")).toBe("A bucket with this name is already listed");
	});
});

describe("newFolderFormSchema mirrors the IPC create folder schema", () => {
	const names = ["docs", "a".repeat(255), "a".repeat(256), "", "  ", "a/b", ".", "..", "...", " x "];
	it.each(names)("name %#", (value) => {
		const parsed = newFolderFormSchema.safeParse({ name: value });
		const ipc = schemas[channels.opsCreateFolder].safeParse({
			connectionId: "c1",
			bucket: "b1",
			parent: "",
			name: value.trim(),
		}).success;
		expect(parsed.success).toBe(ipc);
	});
	it("uses the previous messages", () => {
		expect(messageAt(newFolderFormSchema.safeParse({ name: " " }), "name")).toBe("Folder name cannot be empty.");
		expect(messageAt(newFolderFormSchema.safeParse({ name: "a/b" }), "name")).toBe(
			"Folder name cannot contain slashes.",
		);
		expect(messageAt(newFolderFormSchema.safeParse({ name: ".." }), "name")).toBe("Invalid folder name.");
	});
});
