import { loadSharedConfigFiles } from "@smithy/shared-ini-file-loader";

export type ProfileInfo = {
	name: string;
	region?: string;
	endpointUrl?: string;
	kind: "sso" | "static" | "other";
};
export async function listProfiles(configFilepath?: string, credentialsFilepath?: string): Promise<ProfileInfo[]> {
	const files = await loadSharedConfigFiles({
		...(configFilepath ? { configFilepath } : {}),
		...(credentialsFilepath ? { filepath: credentialsFilepath } : {}),
	});
	const config = files.configFile ?? {};
	const credentials = files.credentialsFile ?? {};
	return Object.entries(config)
		.filter(([name]) => name !== "sso-session")
		.map(([name, values]) => {
			const profile = values as Record<string, string>;
			const creds = (credentials[name] ?? {}) as Record<string, string>;
			const sso = Boolean(profile.sso_session || profile.sso_start_url);
			const kind: ProfileInfo["kind"] = sso
				? "sso"
				: profile.aws_access_key_id || creds.aws_access_key_id
					? "static"
					: "other";
			return {
				name,
				...(profile.region ? { region: profile.region } : {}),
				...(profile.endpoint_url ? { endpointUrl: profile.endpoint_url } : {}),
				kind,
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getProfileEndpointUrl(profileName: string): Promise<string | undefined> {
	return (await listProfiles()).find((profile) => profile.name === profileName)?.endpointUrl;
}
