import { describe, expect, it } from "vitest";
import { listProfiles } from "../../src/main/connections/profiles";
import { resolve } from "node:path";

describe("profile discovery", () => {
	it("discovers profile metadata without exposing keys or sso-session sections", async () => {
		const profiles = await listProfiles(
			resolve("test/fixtures/aws/config"),
			resolve("test/fixtures/aws/credentials"),
		);
		expect(profiles.find((p) => p.name === "default")).toMatchObject({
			endpointUrl: "http://127.0.0.1:19000",
			kind: "static",
		});
		expect(profiles.find((p) => p.name === "sso-dev")).toMatchObject({
			kind: "sso",
		});
		expect(profiles.find((p) => p.name === "sso-dev")).not.toHaveProperty(
			"endpointUrl",
		);
		expect(profiles.find((p) => p.name === "assume")?.kind).toBe("other");
		expect(profiles.some((p) => p.name === "corp")).toBe(false);
		expect(JSON.stringify(profiles)).not.toMatch(/AKIAFIXTURE|fixture-secret/);
	});
});
