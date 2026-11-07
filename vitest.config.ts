import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
	resolve: { alias: { "@": resolve("src/renderer/src") } },
	test: {
		projects: [
			{ test: { name: "unit", include: ["test/unit/**/*.test.{ts,tsx}"], setupFiles: ["test/unit/dom-setup.ts"] } },
			{
				test: {
					name: "integration",
					include: ["test/integration/**/*.test.ts"],
					globalSetup: ["test/integration/global-setup.ts"],
					testTimeout: 60_000,
				},
			},
		],
	},
});
