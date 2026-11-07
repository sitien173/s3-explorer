import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

export type SsoError = {
	code: "SSO_LOGIN_REQUIRED";
	profile: string;
};

type SsoLoginResult = { ok: true } | { ok: false; code: "CLI_MISSING" | "SSO_LOGIN_FAILED" };

type SsoLoginDependencies = {
	spawn?: typeof nodeSpawn;
	env?: NodeJS.ProcessEnv;
};

export function mapSsoError(error: unknown, profile: string): SsoError | null {
	const candidate = error as { name?: string; message?: string };
	const message = candidate?.message ?? "";
	const missingOrExpiredToken =
		/token is expired/i.test(message) ||
		/(?:not present|missing|not found|invalid).*SSO Token/i.test(message) ||
		/SSO session token.*(?:not found|invalid)/i.test(message);
	const expiredSsoSession = /SSO session.*(?:invalid|expired)/i.test(message);

	if (
		(candidate?.name === "TokenProviderError" && missingOrExpiredToken) ||
		(candidate?.name === "CredentialsProviderError" &&
			(expiredSsoSession || /SSO session token.*(?:not found|invalid)/i.test(message)))
	) {
		return { code: "SSO_LOGIN_REQUIRED", profile };
	}
	return null;
}

export function ssoLogin(profile: string, dependencies: SsoLoginDependencies = {}): Promise<SsoLoginResult> {
	return new Promise((resolve) => {
		let child: ChildProcess;
		try {
			child = (dependencies.spawn ?? nodeSpawn)("aws", ["sso", "login", "--profile", profile], {
				env: dependencies.env ?? process.env,
				stdio: "ignore",
			});
		} catch (error) {
			resolve({
				ok: false,
				code: (error as NodeJS.ErrnoException).code === "ENOENT" ? "CLI_MISSING" : "SSO_LOGIN_FAILED",
			});
			return;
		}

		let settled = false;
		child.once("error", (error) => {
			if (settled) return;
			settled = true;
			resolve({
				ok: false,
				code: (error as NodeJS.ErrnoException).code === "ENOENT" ? "CLI_MISSING" : "SSO_LOGIN_FAILED",
			});
		});
		child.once("exit", (code) => {
			if (settled) return;
			settled = true;
			resolve(code === 0 ? { ok: true } : { ok: false, code: "SSO_LOGIN_FAILED" });
		});
	});
}
