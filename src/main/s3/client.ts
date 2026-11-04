import { S3Client } from "@aws-sdk/client-s3";
import type { ConnectionStore } from "../connections/store";
import type { SecretVault } from "../connections/secrets";
import { getProfileEndpointUrl } from "../connections/profiles";

type Connection = {
	id: string;
	kind: "profile" | "manual";
	profile?: string;
	region?: string;
	endpoint?: string;
	forcePathStyle: boolean;
};

type CachedClient = {
	client: S3Client;
	connectionId: string;
};

export function manualCredentialsProvider(vault: SecretVault, id: string) {
	return async () => {
		const secret = await vault.get(id);
		if (!secret) throw new Error("Credentials unavailable");
		return {
			accessKeyId: secret.accessKeyId,
			secretAccessKey: secret.secretAccessKey,
			...(secret.sessionToken ? { sessionToken: secret.sessionToken } : {}),
		};
	};
}

export class S3ClientFactory {
	private clients = new Map<string, CachedClient>();

	constructor(
		private store: ConnectionStore,
		private vault: SecretVault,
	) {}

	async get(connection: Connection): Promise<S3Client> {
		const key = `${connection.id}:${connection.region ?? ""}`;
		const cached = this.clients.get(key);
		if (cached) return cached.client;

		const config: Record<string, unknown> = {
			...(connection.region ? { region: connection.region } : {}),
			forcePathStyle: connection.forcePathStyle,
			followRegionRedirects: true,
		};

		if (connection.kind === "profile") {
			config.profile = connection.profile;
			if (connection.endpoint) {
				config.endpoint = connection.endpoint;
			} else {
				const profileEndpoint = await getProfileEndpointUrl(
					connection.profile ?? "",
				);
				if (profileEndpoint) config.endpoint = profileEndpoint;
				else config.ignoreConfiguredEndpointUrls = true;
			}
		} else {
			if (connection.endpoint) config.endpoint = connection.endpoint;
			config.credentials = manualCredentialsProvider(this.vault, connection.id);
		}

		const client = new S3Client(
			config as NonNullable<ConstructorParameters<typeof S3Client>[0]>,
		);
		this.clients.set(key, { client, connectionId: connection.id });
		return client;
	}

	invalidate(connectionId: string): void {
		for (const [key, cached] of this.clients) {
			if (cached.connectionId !== connectionId) continue;
			cached.client.destroy();
			this.clients.delete(key);
		}
	}
}
