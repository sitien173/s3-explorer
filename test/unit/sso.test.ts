import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { mapSsoError, ssoLogin } from "../../src/main/sso";

describe("SSO helpers", () => {
	it("maps missing and expired SDK token errors but ignores unrelated failures", () => {
		expect(mapSsoError({ name: "TokenProviderError", message: "Token is expired." }, "dev")).toEqual({
			code: "SSO_LOGIN_REQUIRED",
			profile: "dev",
		});
		expect(
			mapSsoError(
				{
					name: "TokenProviderError",
					message: "Value not present for 'accessToken' in SSO Token.",
				},
				"dev",
			),
		).toEqual({ code: "SSO_LOGIN_REQUIRED", profile: "dev" });
		expect(
			mapSsoError(
				{
					name: "CredentialsProviderError",
					message: "The SSO session associated with this profile has expired.",
				},
				"dev",
			),
		).toEqual({ code: "SSO_LOGIN_REQUIRED", profile: "dev" });
		expect(
			mapSsoError(
				{
					name: "TokenProviderError",
					message: "Could not load token from any providers",
				},
				"dev",
			),
		).toBeNull();
		expect(mapSsoError(new Error("unrelated"), "dev")).toBeNull();
	});

	it("spawns aws with an argv array and handles successful and failed exit codes", async () => {
		let spawnArgs: any[] = [];
		const spawn: any = (...args: any[]) => {
			spawnArgs = args;
			const child = new EventEmitter();
			queueMicrotask(() => child.emit("exit", 0));
			return child;
		};
		expect(await ssoLogin("dev", { spawn })).toEqual({ ok: true });
		expect(spawnArgs.slice(0, 2)).toEqual(["aws", ["sso", "login", "--profile", "dev"]]);
		expect(spawnArgs[2]).not.toHaveProperty("shell");
		expect(spawnArgs[2].stdio).toBe("ignore");

		const nonzeroSpawn: any = () => {
			const child = new EventEmitter();
			queueMicrotask(() => child.emit("exit", 2));
			return child;
		};
		expect(await ssoLogin("dev", { spawn: nonzeroSpawn })).toEqual({
			ok: false,
			code: "SSO_LOGIN_FAILED",
		});
	});

	it("maps ENOENT to CLI_MISSING, including a real spawn with an empty PATH", async () => {
		const missingSpawn: any = () => {
			const child = new EventEmitter();
			queueMicrotask(() => child.emit("error", Object.assign(new Error("missing"), { code: "ENOENT" })));
			return child;
		};
		expect(await ssoLogin("dev", { spawn: missingSpawn })).toEqual({
			ok: false,
			code: "CLI_MISSING",
		});
		expect(await ssoLogin("dev", { env: { PATH: "" } })).toEqual({
			ok: false,
			code: "CLI_MISSING",
		});
	});
});
