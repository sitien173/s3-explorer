import { z } from "zod";
import { channels } from "../../shared/channels";
import { createBucketName, schemas } from "../../shared/ipc";

// Message-bearing checks run first; each field then pipes into its IPC field schema so the IPC limits stay the source of truth.
// Connection limits are not exported from src/shared/ipc.ts, so connectionFormSchema mirrors them; test/unit/forms.test.ts keeps them in step.
const trimmed = z.string().transform((value) => value.trim());
// The IPC schema throws on a string that is not a URL; here it is a plain rejection.
const isHttpUrl = (value: string) => URL.canParse(value) && ["http:", "https:"].includes(new URL(value).protocol);
const PROFILE_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9_.@+=,:-]*$/;

export const connectionFormSchema = (isEdit: boolean) =>
	z
		.object({
			name: z.string(),
			kind: z.enum(["profile", "manual"]),
			profile: z.string().optional(),
			region: z.string().optional(),
			endpoint: z.string().optional(),
			forcePathStyle: z.boolean(),
			accessKeyId: z.string().optional(),
			secretAccessKey: z.string().optional(),
			sessionToken: z.string().optional(),
		})
		.superRefine((values, ctx) => {
			const fail = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
			const name = values.name.trim();
			const region = values.region?.trim() ?? "";
			const endpoint = values.endpoint?.trim() ?? "";
			if (!name) {
				fail("name", "Connection name is required.");
			} else if (name.length > 128) {
				fail("name", "Connection name must be 128 characters or fewer.");
			}
			if (endpoint && !isHttpUrl(endpoint)) {
				fail("endpoint", "Endpoint must be a valid http or https URL.");
			}
			if (values.kind === "profile") {
				if (!isEdit && region.length > 128) {
					fail("region", "Region must be 128 characters or fewer.");
				}
				const profile = values.profile?.trim() ?? "";
				if (!profile) {
					fail("profile", "AWS profile name is required.");
				} else if (!isEdit && (profile.length > 128 || !PROFILE_NAME_REGEX.test(profile))) {
					fail("profile", "AWS profile name is invalid.");
				}
				return;
			}
			if (!region) {
				fail("region", "AWS Region is required.");
			}
			if (!isEdit && !values.accessKeyId?.trim()) {
				fail("accessKeyId", "Access Key ID is required.");
			}
			if (!isEdit && !values.secretAccessKey?.trim()) {
				fail("secretAccessKey", "Secret Access Key is required.");
			}
		});

// The parsed targetKey is the final destination key: trimmed, with a trailing slash added for a folder.
export const renameFormSchema = (isFolder: boolean, currentKey: string) =>
	z.object({
		targetKey: trimmed
			.transform((value) => (isFolder && value && !value.endsWith("/") ? `${value}/` : value))
			.pipe(
				z
					.string()
					.min(1, "Target name cannot be empty.")
					.max(1024, "Target name must be 1024 characters or fewer.")
					.refine((value) => isFolder || !value.endsWith("/"), "Object key cannot end with a slash.")
					.refine((value) => value !== currentKey, "Target name must be different from current name."),
			)
			.pipe(isFolder ? schemas[channels.opsRenamePrefix].shape.toPrefix : schemas[channels.opsRename].shape.toKey),
	});

export const openUrlFormSchema = z.object({
	url: trimmed
		.pipe(z.string().min(1, "URL is required.").max(8192, "URL must be 8192 characters or fewer."))
		.pipe(schemas[channels.streamOpenUrl].shape.url),
	connectionId: z.string(),
});

// Reuses the IPC bucket schema through safeParse so a failure keeps the previous single message.
export const addBucketFormSchema = z.object({
	bucket: trimmed.pipe(
		z
			.string()
			.min(1, "Bucket name is required.")
			.refine(
				(value) => schemas[channels.bucketsAdd].shape.bucket.safeParse(value).success,
				"Invalid bucket name. Must start with alphanumeric and contain only letters, numbers, dots, hyphens, and underscores (max 255 chars).",
			),
	),
});

export const createBucketFormSchema = (existingNames: string[]) =>
	z.object({
		bucket: trimmed
			.pipe(createBucketName)
			.refine((value) => !existingNames.includes(value), "A bucket with this name is already listed"),
	});

export const newFolderFormSchema = z.object({
	name: trimmed.pipe(
		z
			.string()
			.min(1, "Folder name cannot be empty.")
			.max(255, "Folder name must be 255 characters or fewer.")
			.refine((value) => !value.includes("/"), "Folder name cannot contain slashes.")
			.refine((value) => value !== "." && value !== "..", "Invalid folder name."),
	),
});
