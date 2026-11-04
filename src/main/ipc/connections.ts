import { ListBucketsCommand } from "@aws-sdk/client-s3";
import { channels } from "../../shared/channels";
import type {
	Channel,
	RequestByChannel,
	ResponseByChannel,
} from "../../shared/ipc";
import { listProfiles } from "../connections/profiles";
import type { ConnectionStore } from "../connections/store";
import { mapSsoError, ssoLogin } from "../sso";
import type { S3ClientFactory } from "../s3/client";

export type IpcDeps = {
	store: ConnectionStore;
	clients: Pick<S3ClientFactory, "get" | "invalidate">;
	configFilepath?: string;
	credentialsFilepath?: string;
	login?: typeof ssoLogin;
};

type HandlerMap = {
	[Key in Channel]: (
		input: RequestByChannel[Key],
	) => Promise<ResponseByChannel[Key]>;
};

function codedError(code: string, message: string) {
	return Object.assign(new Error(message), { code });
}

export function connectionHandlers(deps: IpcDeps): HandlerMap {
	return {
		[channels.list]: async () => deps.store.list(),
		[channels.create]: async (input) => deps.store.create(input),
		[channels.update]: async (input) => {
			const result = await deps.store.update(input.id, input);
			if (!result) throw codedError("NOT_FOUND", "Connection not found");
			deps.clients.invalidate(input.id);
			return result;
		},
		[channels.delete]: async (input) => {
			const deleted = await deps.store.delete(input.id);
			if (!deleted) throw codedError("NOT_FOUND", "Connection not found");
			deps.clients.invalidate(input.id);
			return { deleted };
		},
		[channels.testConnection]: async (input) => {
			const connection = await deps.store.get(input.id);
			if (!connection) throw codedError("NOT_FOUND", "Connection not found");
			try {
				const client = await deps.clients.get(connection);
				const result = await client.send(new ListBucketsCommand({}));
				return { bucketCount: result.Buckets?.length ?? 0 };
			} catch (error) {
				if (connection.kind === "profile") {
					const mapped = mapSsoError(error, connection.profile ?? "");
					if (mapped)
						throw Object.assign(new Error("SSO login required"), mapped);
				}
				const failure =
					error instanceof Error ? error : new Error(String(error));
				throw codedError(
					"REQUEST_FAILED",
					`${failure.name}: ${failure.message}`.replace(
						/(AKIA|ASIA)[A-Z0-9]{16}/g,
						"[redacted]",
					),
				);
			}
		},
		[channels.ssoLogin]: async (input) => {
			const profiles = await listProfiles(
				deps.configFilepath,
				deps.credentialsFilepath,
			);
			if (!profiles.some((profile) => profile.name === input.profile)) {
				throw codedError("NOT_FOUND", "Profile not found");
			}
			const result = await (deps.login ?? ssoLogin)(input.profile);
			if (!result.ok) {
				throw codedError(
					result.code,
					result.code === "CLI_MISSING"
						? "AWS CLI not found"
						: "SSO login failed",
				);
			}
			return { loggedIn: true };
		},
		[channels.listProfiles]: async () =>
			listProfiles(deps.configFilepath, deps.credentialsFilepath),
	};
}
