import { channels } from "../../shared/channels";
import type { RequestByChannel, ResponseByChannel } from "../../shared/ipc";
import { endpointHostOf, resolveUrl } from "../url/resolve";
import type { HandleRegistry, HandleTarget } from "../stream/handles";
import type { StreamProxy } from "../stream/proxy";
import type { IpcDeps } from "./connections";
import type { SenderLike } from "./register";

type StreamChannel = typeof channels.streamOpen | typeof channels.streamOpenUrl;
export type StreamIpcDeps = IpcDeps & {
	stream?: {
		registry: HandleRegistry;
		proxy: Pick<StreamProxy, "urlFor" | "describe">;
	};
};
type HandlerMap = {
	[Key in StreamChannel]: (
		request: RequestByChannel[Key],
		context: { sender: SenderLike },
	) => Promise<ResponseByChannel[Key]>;
};

function codedError(code: string, message: string): Error & { code: string } {
	return Object.assign(new Error(message), { code });
}

export function streamHandlers(deps: StreamIpcDeps): HandlerMap {
	function requireStream(): NonNullable<StreamIpcDeps["stream"]> {
		if (!deps.stream) {
			throw codedError("REQUEST_FAILED", "Stream proxy unavailable");
		}
		return deps.stream;
	}

	async function describeTarget(target: HandleTarget) {
		const stream = requireStream();
		const handle = stream.registry.create(target);
		const description = await stream.proxy.describe(handle);
		return { url: stream.proxy.urlFor(handle), ...description };
	}

	return {
		[channels.streamOpen]: async (request) => {
			requireStream();
			const connection = await deps.store.get(request.connectionId);
			if (!connection) {
				throw codedError("NOT_FOUND", "Connection not found");
			}
			return describeTarget({
				kind: "s3",
				connectionId: connection.id,
				bucket: request.bucket,
				key: request.key,
			});
		},
		[channels.streamOpenUrl]: async (request) => {
			requireStream();
			const connections = await deps.store.list();
			const endpointHosts = connections
				.map((connection) => endpointHostOf(connection.endpoint))
				.filter((host): host is string => host !== undefined && host.length > 0);
			const resolved = resolveUrl(request.url, { endpointHosts });
			if (!resolved.ok) {
				const message = resolved.reason === "invalid" ? "Invalid URL" : "Unsupported URL";
				throw codedError("INVALID_REQUEST", message);
			}

			const value = resolved.value;
			if (value.kind === "presigned" || request.anonymous === true) {
				return describeTarget({
					kind: "passthrough",
					url: value.url,
				});
			}

			const connection = request.connectionId
				? await deps.store.get(request.connectionId)
				: connections.find(
						(candidate) =>
							candidate.pinnedBuckets.includes(value.bucket) || candidate.extraBuckets.includes(value.bucket),
					);
			if (request.connectionId && !connection) {
				throw codedError("NOT_FOUND", "Connection not found");
			}
			if (!connection) {
				throw codedError("INVALID_REQUEST", "Choose a connection or anonymous access");
			}
			return describeTarget({
				kind: "s3",
				connectionId: connection.id,
				bucket: value.bucket,
				key: value.key,
			});
		},
	};
}
