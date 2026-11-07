import { z } from "zod";
import { channels, events } from "./channels";

const profileName = z
	.string()
	.min(1)
	.max(128)
	.regex(/^[A-Za-z0-9][A-Za-z0-9_.@+=,:-]*$/);
const endpoint = z
	.string()
	.url()
	.refine((value) => ["http:", "https:"].includes(new URL(value).protocol));
const common = {
	name: z.string().min(1).max(128),
	region: z.string().min(1).max(128).optional(),
	endpoint: endpoint.optional(),
	forcePathStyle: z.boolean().default(false),
};

const bucketName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/);
export const createBucketName = z
	.string()
	.min(3)
	.max(63)
	.regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/)
	.refine((name) => !name.includes(".."))
	.refine((name) => !/^\d{1,3}(\.\d{1,3}){3}$/.test(name))
	.refine((name) => !/^(xn--|sthree-|amzn-s3-demo-)/.test(name))
	.refine((name) => !/(-s3alias|--ol-s3|\.mrap|--x-s3|--table-s3|-an)$/.test(name));
const prefix = z.string().max(1024).default("");
const token = z.string().max(4096).optional();
const jobId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const query = z.string().min(1).max(1024);
const connectionId = z.string().min(1);
const objectKey = z.string().min(1).max(1024);
const folderPrefix = z
	.string()
	.min(1)
	.max(1024)
	.refine((value) => value.endsWith("/"));
const parentPrefix = z
	.string()
	.max(1024)
	.refine((value) => !value || value.endsWith("/"));
const folderName = z
	.string()
	.min(1)
	.max(255)
	.refine((value) => !value.includes("/") && value !== "." && value !== "..");
const transferId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const createRequest = z.discriminatedUnion("kind", [
	z.object({ ...common, kind: z.literal("profile"), profile: profileName }),
	z.object({
		...common,
		kind: z.literal("manual"),
		region: z.string().min(1),
		accessKeyId: z.string().min(1),
		secretAccessKey: z.string().min(1),
		sessionToken: z.string().optional(),
	}),
]);
export const updateRequest = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(128).optional(),
	region: z.string().nullable().optional(),
	endpoint: endpoint.nullable().optional(),
	forcePathStyle: z.boolean().optional(),
	pinnedBuckets: z.array(z.string()).optional(),
	extraBuckets: z.array(z.string()).optional(),
	accessKeyId: z.string().optional(),
	secretAccessKey: z.string().optional(),
	sessionToken: z.string().nullable().optional(),
});
export const schemas = {
	[channels.list]: z.object({}),
	[channels.create]: createRequest,
	[channels.update]: updateRequest,
	[channels.delete]: z.object({ id: z.string().min(1) }),
	[channels.testConnection]: z.object({ id: z.string().min(1) }),
	[channels.ssoLogin]: z.object({ profile: profileName }),
	[channels.listProfiles]: z.object({}),
	[channels.bucketsList]: z.object({ connectionId: z.string().min(1) }),
	[channels.bucketsPin]: z.object({
		connectionId: z.string().min(1),
		bucket: bucketName,
	}),
	[channels.bucketsUnpin]: z.object({
		connectionId: z.string().min(1),
		bucket: bucketName,
	}),
	[channels.bucketsAdd]: z.object({
		connectionId: z.string().min(1),
		bucket: bucketName,
	}),
	[channels.bucketsCreate]: z.object({
		connectionId: z.string().min(1),
		bucket: createBucketName,
	}),
	[channels.bucketsDelete]: z.object({
		connectionId: z.string().min(1),
		bucket: bucketName,
	}),
	[channels.objectsList]: z.object({
		connectionId: z.string().min(1),
		bucket: bucketName,
		prefix,
		token,
	}),
	[channels.searchStart]: z.object({
		jobId,
		connectionId: z.string().min(1),
		bucket: bucketName,
		prefix,
		query,
	}),
	[channels.searchCancel]: z.object({ jobId }),
	[channels.opsCreateFolder]: z.object({
		connectionId,
		bucket: bucketName,
		parent: parentPrefix,
		name: folderName,
	}),
	[channels.opsDelete]: z.object({
		opId: jobId,
		connectionId,
		bucket: bucketName,
		keys: z.array(objectKey).min(1).max(10_000),
	}),
	[channels.opsDeletePrefix]: z.object({
		opId: jobId,
		connectionId,
		bucket: bucketName,
		prefix: folderPrefix,
	}),
	[channels.opsCountPrefix]: z.object({
		connectionId,
		bucket: bucketName,
		prefix: folderPrefix,
	}),
	[channels.opsRename]: z.object({
		connectionId,
		bucket: bucketName,
		fromKey: objectKey.refine((value) => !value.endsWith("/")),
		toKey: objectKey.refine((value) => !value.endsWith("/")),
	}),
	[channels.opsRenamePrefix]: z.object({
		opId: jobId,
		connectionId,
		bucket: bucketName,
		fromPrefix: folderPrefix,
		toPrefix: folderPrefix,
	}),
	[channels.transfersUpload]: z.object({
		connectionId,
		bucket: bucketName,
		prefix: parentPrefix,
	}),
	[channels.transfersUploadPaths]: z.object({
		connectionId,
		bucket: bucketName,
		prefix: parentPrefix,
		paths: z.array(z.string().min(1).max(4096)).min(1).max(500),
	}),
	[channels.transfersDownload]: z.object({
		connectionId,
		bucket: bucketName,
		key: objectKey.refine((value) => !value.endsWith("/")),
	}),
	[channels.transfersCancel]: z.object({ transferId }),
	[channels.streamOpen]: z
		.object({
			connectionId,
			bucket: bucketName,
			key: objectKey.refine((value) => !value.endsWith("/")),
		})
		.strict(),
	[channels.streamOpenUrl]: z
		.object({
			url: z.string().min(1).max(8192),
			connectionId: z.string().min(1).optional(),
			anonymous: z.boolean().optional(),
		})
		.strict()
		.refine((value) => !(value.connectionId && value.anonymous === true)),
	[channels.filesOpenWithSystemApp]: z
		.object({
			url: z.string().min(1).max(8192),
			fileName: z.string().min(1).max(255),
		})
		.strict(),
} as const;

const connection = z
	.object({
		id: z.string(),
		name: z.string(),
		kind: z.enum(["profile", "manual"]),
		profile: z.string().optional(),
		region: z.string().optional(),
		endpoint: z.string().optional(),
		forcePathStyle: z.boolean(),
		pinnedBuckets: z.array(z.string()),
		extraBuckets: z.array(z.string()),
		sessionOnly: z.boolean(),
		hasSecret: z.boolean(),
	})
	.strict();
const profile = z
	.object({
		name: z.string(),
		region: z.string().optional(),
		endpointUrl: z.string().optional(),
		kind: z.enum(["sso", "static", "other"]),
	})
	.strict();

export const errorSchema = z
	.object({
		code: z.enum([
			"INVALID_REQUEST",
			"NOT_FOUND",
			"SSO_LOGIN_REQUIRED",
			"CLI_MISSING",
			"SSO_LOGIN_FAILED",
			"REQUEST_FAILED",
			"ACCESS_DENIED",
			"CONFLICT",
			"TOO_LARGE",
			"BUCKET_EXISTS",
			"BUCKET_NOT_EMPTY",
		]),
		message: z.string(),
		profile: z.string().optional(),
	})
	.strict();

const s3Object = z
	.object({
		key: z.string(),
		size: z.number().int().nonnegative(),
		lastModified: z.string().optional(),
		etag: z.string().optional(),
	})
	.strict();

const bucketMutationResult = z.object({ bucket: z.string(), warning: z.string().optional() }).strict();

export const responseSchemas = {
	[channels.list]: z.array(connection),
	[channels.create]: connection,
	[channels.update]: connection,
	[channels.delete]: z.object({ deleted: z.boolean() }).strict(),
	[channels.testConnection]: z.object({ bucketCount: z.number().int().nonnegative() }).strict(),
	[channels.ssoLogin]: z.object({ loggedIn: z.boolean() }).strict(),
	[channels.listProfiles]: z.array(profile),
	[channels.bucketsList]: z
		.object({
			buckets: z.array(
				z
					.object({
						name: z.string(),
						pinned: z.boolean(),
						listed: z.boolean(),
					})
					.strict(),
			),
			listDenied: z.boolean(),
		})
		.strict(),
	[channels.bucketsPin]: connection,
	[channels.bucketsUnpin]: connection,
	[channels.bucketsAdd]: connection,
	[channels.bucketsCreate]: bucketMutationResult,
	[channels.bucketsDelete]: bucketMutationResult,
	[channels.objectsList]: z
		.object({
			folders: z.array(z.string()),
			objects: z.array(s3Object),
			nextToken: z.string().optional(),
		})
		.strict(),
	[channels.searchStart]: z.object({ jobId: z.string() }).strict(),
	[channels.searchCancel]: z.object({ cancelled: z.boolean() }).strict(),
	[channels.opsCreateFolder]: z.object({ key: objectKey }).strict(),
	[channels.opsDelete]: z
		.object({
			completed: z.array(z.string()),
			remaining: z.array(z.string()),
			error: errorSchema.optional(),
		})
		.strict(),
	[channels.opsDeletePrefix]: z
		.object({
			completed: z.array(z.string()),
			remaining: z.array(z.string()),
			error: errorSchema.optional(),
		})
		.strict(),
	[channels.opsCountPrefix]: z.object({ count: z.number().int().nonnegative() }).strict(),
	[channels.opsRename]: z.object({ key: objectKey }).strict(),
	[channels.opsRenamePrefix]: z
		.object({
			completed: z.array(z.string()),
			remaining: z.array(z.string()),
			error: errorSchema.optional(),
		})
		.strict(),
	[channels.transfersUpload]: z.object({ transferIds: z.array(z.string()) }).strict(),
	[channels.transfersUploadPaths]: z
		.object({
			transferIds: z.array(z.string()),
			rejectedCount: z.number().int().nonnegative(),
		})
		.strict(),
	[channels.transfersDownload]: z.object({ transferId: z.string().nullable() }).strict(),
	[channels.transfersCancel]: z.object({ cancelled: z.boolean() }).strict(),
	[channels.streamOpen]: z
		.object({
			url: z.string().min(1),
			contentType: z.string(),
			size: z.number().int().nonnegative(),
		})
		.strict(),
	[channels.streamOpenUrl]: z
		.object({
			url: z.string().min(1),
			contentType: z.string(),
			size: z.number().int().nonnegative(),
		})
		.strict(),
	[channels.filesOpenWithSystemApp]: z
		.object({
			opened: z.boolean(),
		})
		.strict(),
} as const;

export const envelopeSchema = <T extends z.ZodType>(data: T) =>
	z.discriminatedUnion("ok", [
		z.object({ ok: z.literal(true), data }),
		z.object({ ok: z.literal(false), error: errorSchema }),
	]);

export const searchBatchPayloadSchema = z
	.object({
		jobId: z.string(),
		matches: z.array(s3Object),
	})
	.strict();

export const searchProgressPayloadSchema = z
	.object({
		jobId: z.string(),
		scanned: z.number().int().nonnegative(),
		matched: z.number().int().nonnegative(),
	})
	.strict();

export const searchDonePayloadSchema = z
	.object({
		jobId: z.string(),
		truncated: z.boolean(),
		cancelled: z.boolean(),
		error: errorSchema.optional(),
	})
	.strict();

export const opsProgressPayloadSchema = z
	.object({
		opId: z.string(),
		done: z.number().int().nonnegative(),
		total: z.number().int().nonnegative(),
	})
	.strict();

export const transferProgressPayloadSchema = z
	.object({
		transferId: z.string(),
		kind: z.enum(["upload", "download"]),
		bucket: z.string(),
		key: z.string(),
		loaded: z.number().nonnegative(),
		total: z.number().nonnegative(),
	})
	.strict();

export const transferDonePayloadSchema = z
	.object({
		transferId: z.string(),
		status: z.enum(["completed", "cancelled", "failed"]),
		error: errorSchema.optional(),
	})
	.strict();

export const eventSchemas = {
	[events.searchBatch]: searchBatchPayloadSchema,
	[events.searchProgress]: searchProgressPayloadSchema,
	[events.searchDone]: searchDonePayloadSchema,
	[events.opsProgress]: opsProgressPayloadSchema,
	[events.transferProgress]: transferProgressPayloadSchema,
	[events.transferDone]: transferDonePayloadSchema,
} as const;

export type ListRequest = z.infer<(typeof schemas)[typeof channels.list]>;
export type CreateRequest = z.infer<(typeof schemas)[typeof channels.create]>;
export type UpdateRequest = z.infer<(typeof schemas)[typeof channels.update]>;
export type DeleteRequest = z.infer<(typeof schemas)[typeof channels.delete]>;
export type TestConnectionRequest = z.infer<(typeof schemas)[typeof channels.testConnection]>;
export type SsoLoginRequest = z.infer<(typeof schemas)[typeof channels.ssoLogin]>;
export type ListProfilesRequest = z.infer<(typeof schemas)[typeof channels.listProfiles]>;
export type BucketsListRequest = z.infer<(typeof schemas)[typeof channels.bucketsList]>;
export type BucketsPinRequest = z.infer<(typeof schemas)[typeof channels.bucketsPin]>;
export type BucketsUnpinRequest = z.infer<(typeof schemas)[typeof channels.bucketsUnpin]>;
export type BucketsAddRequest = z.infer<(typeof schemas)[typeof channels.bucketsAdd]>;
export type BucketsCreateRequest = z.infer<(typeof schemas)[typeof channels.bucketsCreate]>;
export type BucketsDeleteRequest = z.infer<(typeof schemas)[typeof channels.bucketsDelete]>;
export type ObjectsListRequest = z.infer<(typeof schemas)[typeof channels.objectsList]>;
export type SearchStartRequest = z.infer<(typeof schemas)[typeof channels.searchStart]>;
export type SearchCancelRequest = z.infer<(typeof schemas)[typeof channels.searchCancel]>;
export type OpsCreateFolderRequest = z.infer<(typeof schemas)[typeof channels.opsCreateFolder]>;
export type OpsDeleteRequest = z.infer<(typeof schemas)[typeof channels.opsDelete]>;
export type OpsDeletePrefixRequest = z.infer<(typeof schemas)[typeof channels.opsDeletePrefix]>;
export type OpsCountPrefixRequest = z.infer<(typeof schemas)[typeof channels.opsCountPrefix]>;
export type OpsRenameRequest = z.infer<(typeof schemas)[typeof channels.opsRename]>;
export type OpsRenamePrefixRequest = z.infer<(typeof schemas)[typeof channels.opsRenamePrefix]>;
export type TransfersUploadRequest = z.infer<(typeof schemas)[typeof channels.transfersUpload]>;
export type TransfersUploadPathsRequest = z.infer<(typeof schemas)[typeof channels.transfersUploadPaths]>;
export type TransfersDownloadRequest = z.infer<(typeof schemas)[typeof channels.transfersDownload]>;
export type TransfersCancelRequest = z.infer<(typeof schemas)[typeof channels.transfersCancel]>;
export type StreamOpenRequest = z.infer<(typeof schemas)[typeof channels.streamOpen]>;
export type StreamOpenUrlRequest = z.infer<(typeof schemas)[typeof channels.streamOpenUrl]>;
export type FilesOpenWithSystemAppRequest = z.infer<(typeof schemas)[typeof channels.filesOpenWithSystemApp]>;

export type ListResponse = z.infer<(typeof responseSchemas)[typeof channels.list]>;
export type CreateResponse = z.infer<(typeof responseSchemas)[typeof channels.create]>;
export type UpdateResponse = z.infer<(typeof responseSchemas)[typeof channels.update]>;
export type DeleteResponse = z.infer<(typeof responseSchemas)[typeof channels.delete]>;
export type TestConnectionResponse = z.infer<(typeof responseSchemas)[typeof channels.testConnection]>;
export type SsoLoginResponse = z.infer<(typeof responseSchemas)[typeof channels.ssoLogin]>;
export type ListProfilesResponse = z.infer<(typeof responseSchemas)[typeof channels.listProfiles]>;
export type BucketsListResponse = z.infer<(typeof responseSchemas)[typeof channels.bucketsList]>;
export type BucketsPinResponse = z.infer<(typeof responseSchemas)[typeof channels.bucketsPin]>;
export type BucketsUnpinResponse = z.infer<(typeof responseSchemas)[typeof channels.bucketsUnpin]>;
export type BucketsAddResponse = z.infer<(typeof responseSchemas)[typeof channels.bucketsAdd]>;
export type BucketsCreateResponse = z.infer<(typeof responseSchemas)[typeof channels.bucketsCreate]>;
export type BucketsDeleteResponse = z.infer<(typeof responseSchemas)[typeof channels.bucketsDelete]>;
export type ObjectsListResponse = z.infer<(typeof responseSchemas)[typeof channels.objectsList]>;
export type SearchStartResponse = z.infer<(typeof responseSchemas)[typeof channels.searchStart]>;
export type SearchCancelResponse = z.infer<(typeof responseSchemas)[typeof channels.searchCancel]>;
export type OpsCreateFolderResponse = z.infer<(typeof responseSchemas)[typeof channels.opsCreateFolder]>;
export type OpsDeleteResponse = z.infer<(typeof responseSchemas)[typeof channels.opsDelete]>;
export type OpsDeletePrefixResponse = z.infer<(typeof responseSchemas)[typeof channels.opsDeletePrefix]>;
export type OpsCountPrefixResponse = z.infer<(typeof responseSchemas)[typeof channels.opsCountPrefix]>;
export type OpsRenameResponse = z.infer<(typeof responseSchemas)[typeof channels.opsRename]>;
export type OpsRenamePrefixResponse = z.infer<(typeof responseSchemas)[typeof channels.opsRenamePrefix]>;
export type TransfersUploadResponse = z.infer<(typeof responseSchemas)[typeof channels.transfersUpload]>;
export type TransfersUploadPathsResponse = z.infer<(typeof responseSchemas)[typeof channels.transfersUploadPaths]>;
export type TransfersDownloadResponse = z.infer<(typeof responseSchemas)[typeof channels.transfersDownload]>;
export type TransfersCancelResponse = z.infer<(typeof responseSchemas)[typeof channels.transfersCancel]>;
export type StreamOpenResponse = z.infer<(typeof responseSchemas)[typeof channels.streamOpen]>;
export type StreamOpenUrlResponse = z.infer<(typeof responseSchemas)[typeof channels.streamOpenUrl]>;
export type FilesOpenWithSystemAppResponse = z.infer<(typeof responseSchemas)[typeof channels.filesOpenWithSystemApp]>;

export type SearchBatchPayload = z.infer<typeof searchBatchPayloadSchema>;
export type SearchProgressPayload = z.infer<typeof searchProgressPayloadSchema>;
export type SearchDonePayload = z.infer<typeof searchDonePayloadSchema>;
export type OpsProgressPayload = z.infer<typeof opsProgressPayloadSchema>;
export type TransferProgressPayload = z.infer<typeof transferProgressPayloadSchema>;
export type TransferDonePayload = z.infer<typeof transferDonePayloadSchema>;

export type IpcError = z.infer<typeof errorSchema>;

export type Result<T> = { ok: true; data: T } | { ok: false; error: IpcError };

export type RequestByChannel = {
	[channels.list]: ListRequest;
	[channels.create]: CreateRequest;
	[channels.update]: UpdateRequest;
	[channels.delete]: DeleteRequest;
	[channels.testConnection]: TestConnectionRequest;
	[channels.ssoLogin]: SsoLoginRequest;
	[channels.listProfiles]: ListProfilesRequest;
	[channels.bucketsList]: BucketsListRequest;
	[channels.bucketsPin]: BucketsPinRequest;
	[channels.bucketsUnpin]: BucketsUnpinRequest;
	[channels.bucketsAdd]: BucketsAddRequest;
	[channels.bucketsCreate]: BucketsCreateRequest;
	[channels.bucketsDelete]: BucketsDeleteRequest;
	[channels.objectsList]: ObjectsListRequest;
	[channels.searchStart]: SearchStartRequest;
	[channels.searchCancel]: SearchCancelRequest;
	[channels.opsCreateFolder]: OpsCreateFolderRequest;
	[channels.opsDelete]: OpsDeleteRequest;
	[channels.opsDeletePrefix]: OpsDeletePrefixRequest;
	[channels.opsCountPrefix]: OpsCountPrefixRequest;
	[channels.opsRename]: OpsRenameRequest;
	[channels.opsRenamePrefix]: OpsRenamePrefixRequest;
	[channels.transfersUpload]: TransfersUploadRequest;
	[channels.transfersUploadPaths]: TransfersUploadPathsRequest;
	[channels.transfersDownload]: TransfersDownloadRequest;
	[channels.transfersCancel]: TransfersCancelRequest;
	[channels.streamOpen]: StreamOpenRequest;
	[channels.streamOpenUrl]: StreamOpenUrlRequest;
	[channels.filesOpenWithSystemApp]: FilesOpenWithSystemAppRequest;
};
export type ResponseByChannel = {
	[channels.list]: ListResponse;
	[channels.create]: CreateResponse;
	[channels.update]: UpdateResponse;
	[channels.delete]: DeleteResponse;
	[channels.testConnection]: TestConnectionResponse;
	[channels.ssoLogin]: SsoLoginResponse;
	[channels.listProfiles]: ListProfilesResponse;
	[channels.bucketsList]: BucketsListResponse;
	[channels.bucketsPin]: BucketsPinResponse;
	[channels.bucketsUnpin]: BucketsUnpinResponse;
	[channels.bucketsAdd]: BucketsAddResponse;
	[channels.bucketsCreate]: BucketsCreateResponse;
	[channels.bucketsDelete]: BucketsDeleteResponse;
	[channels.objectsList]: ObjectsListResponse;
	[channels.searchStart]: SearchStartResponse;
	[channels.searchCancel]: SearchCancelResponse;
	[channels.opsCreateFolder]: OpsCreateFolderResponse;
	[channels.opsDelete]: OpsDeleteResponse;
	[channels.opsDeletePrefix]: OpsDeletePrefixResponse;
	[channels.opsCountPrefix]: OpsCountPrefixResponse;
	[channels.opsRename]: OpsRenameResponse;
	[channels.opsRenamePrefix]: OpsRenamePrefixResponse;
	[channels.transfersUpload]: TransfersUploadResponse;
	[channels.transfersUploadPaths]: TransfersUploadPathsResponse;
	[channels.transfersDownload]: TransfersDownloadResponse;
	[channels.transfersCancel]: TransfersCancelResponse;
	[channels.streamOpen]: StreamOpenResponse;
	[channels.streamOpenUrl]: StreamOpenUrlResponse;
	[channels.filesOpenWithSystemApp]: FilesOpenWithSystemAppResponse;
};

export type Channel =
	| typeof channels.list
	| typeof channels.create
	| typeof channels.update
	| typeof channels.delete
	| typeof channels.testConnection
	| typeof channels.ssoLogin
	| typeof channels.listProfiles;

export type AnyChannel = keyof RequestByChannel;

export type Api = {
	connections: {
		list: (input?: ListRequest) => Promise<Result<ListResponse>>;
		create: (input: CreateRequest) => Promise<Result<CreateResponse>>;
		update: (input: UpdateRequest) => Promise<Result<UpdateResponse>>;
		delete: (input: DeleteRequest) => Promise<Result<DeleteResponse>>;
		testConnection: (input: TestConnectionRequest) => Promise<Result<TestConnectionResponse>>;
		ssoLogin: (input: SsoLoginRequest) => Promise<Result<SsoLoginResponse>>;
		listProfiles: (input?: ListProfilesRequest) => Promise<Result<ListProfilesResponse>>;
	};
	buckets: {
		list: (input: BucketsListRequest) => Promise<Result<BucketsListResponse>>;
		pin: (input: BucketsPinRequest) => Promise<Result<BucketsPinResponse>>;
		unpin: (input: BucketsUnpinRequest) => Promise<Result<BucketsUnpinResponse>>;
		add: (input: BucketsAddRequest) => Promise<Result<BucketsAddResponse>>;
		create: (input: BucketsCreateRequest) => Promise<Result<BucketsCreateResponse>>;
		delete: (input: BucketsDeleteRequest) => Promise<Result<BucketsDeleteResponse>>;
	};
	objects: {
		list: (input: ObjectsListRequest) => Promise<Result<ObjectsListResponse>>;
	};
	search: {
		start: (input: SearchStartRequest) => Promise<Result<SearchStartResponse>>;
		cancel: (input: SearchCancelRequest) => Promise<Result<SearchCancelResponse>>;
		onBatch: (listener: (payload: SearchBatchPayload) => void) => () => void;
		onProgress: (listener: (payload: SearchProgressPayload) => void) => () => void;
		onDone: (listener: (payload: SearchDonePayload) => void) => () => void;
	};
	ops: {
		createFolder: (input: OpsCreateFolderRequest) => Promise<Result<OpsCreateFolderResponse>>;
		delete: (input: OpsDeleteRequest) => Promise<Result<OpsDeleteResponse>>;
		deletePrefix: (input: OpsDeletePrefixRequest) => Promise<Result<OpsDeletePrefixResponse>>;
		countPrefix: (input: OpsCountPrefixRequest) => Promise<Result<OpsCountPrefixResponse>>;
		rename: (input: OpsRenameRequest) => Promise<Result<OpsRenameResponse>>;
		renamePrefix: (input: OpsRenamePrefixRequest) => Promise<Result<OpsRenamePrefixResponse>>;
		onProgress: (listener: (payload: OpsProgressPayload) => void) => () => void;
	};
	stream: {
		open: (input: StreamOpenRequest) => Promise<Result<StreamOpenResponse>>;
		openUrl: (input: StreamOpenUrlRequest) => Promise<Result<StreamOpenUrlResponse>>;
	};
	transfers: {
		upload: (input: TransfersUploadRequest) => Promise<Result<TransfersUploadResponse>>;
		uploadPaths: (input: TransfersUploadPathsRequest) => Promise<Result<TransfersUploadPathsResponse>>;
		download: (input: TransfersDownloadRequest) => Promise<Result<TransfersDownloadResponse>>;
		cancel: (input: TransfersCancelRequest) => Promise<Result<TransfersCancelResponse>>;
		onProgress: (listener: (payload: TransferProgressPayload) => void) => () => void;
		onDone: (listener: (payload: TransferDonePayload) => void) => () => void;
		pathsForFiles: (files: Array<{ readonly name: string }>) => string[];
	};
	files: {
		openWithSystemApp: (input: FilesOpenWithSystemAppRequest) => Promise<Result<FilesOpenWithSystemAppResponse>>;
	};
};
