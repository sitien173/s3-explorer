import { execFileSync } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
	CreateBucketCommand,
	ListBucketsCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import {
	test as base,
	expect,
	_electron,
	type ElectronApplication,
	type Page,
} from "@playwright/test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const composeArgs = [
	"compose",
	"-p",
	"s3-media-explorer-e2e",
	"-f",
	"test/rustfs/compose.yaml",
];

export interface E2EContext {
	electronApp: ElectronApplication;
	page: Page;
	s3: S3Client;
	bucket: string;
	uploadPath: string;
}

async function fileExists(path: string): Promise<boolean> {
	try {
		const info = await stat(path);
		return info.isFile() && info.size > 0;
	} catch {
		return false;
	}
}

async function waitForRustFS(client: S3Client): Promise<void> {
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		try {
			await client.send(new ListBucketsCommand({}));
			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}
	throw new Error("RustFS did not become ready within 60 seconds");
}

export const test = base.extend<{ e2e: E2EContext }>({
	e2e: async ({}, use) => {
		await mkdir(join(projectRoot, "test/.tmp"), { recursive: true });
		const scratch = await mkdtemp(join(projectRoot, "test/.tmp/e2e-"));
		const userData = join(scratch, "user-data");
		const configFile = join(scratch, "aws-config");
		const credentialsFile = join(scratch, "aws-credentials");
		const uploadPath = join(scratch, "upload-me.txt");
		const mediaDir = join(projectRoot, "test/.tmp/media");
		const mediaPath = join(mediaDir, "faststart.mp4");
		let electronApp: ElectronApplication | undefined;
		let s3: S3Client | undefined;

		try {
			if (!(await fileExists(mediaPath))) {
				execFileSync("bash", ["test/fixtures/make-media.sh"], {
					cwd: projectRoot,
					stdio: "inherit",
				});
			}
			const mediaFiles = await readdir(mediaDir);
			if (!mediaFiles.includes("faststart.mp4")) {
				throw new Error("Media fixture faststart.mp4 was not generated");
			}

			await writeFile(configFile, "[default]\nregion = us-east-1\n", {
				mode: 0o600,
			});
			await writeFile(credentialsFile, "", { mode: 0o600 });
			await writeFile(uploadPath, "uploaded by the Playwright smoke flow\n", {
				mode: 0o600,
			});

			execFileSync("docker", [...composeArgs, "up", "-d"], {
				cwd: projectRoot,
				stdio: "inherit",
			});

			s3 = new S3Client({
				endpoint: "http://127.0.0.1:19000",
				region: "us-east-1",
				forcePathStyle: true,
				credentials: {
					accessKeyId: "rustfsadmin",
					secretAccessKey: "rustfsadmin",
				},
			});
			await waitForRustFS(s3);

			const bucket = `s3me-e2e-${process.pid}-${Date.now().toString(36)}`;
			await s3.send(new CreateBucketCommand({ Bucket: bucket }));
			await s3.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: "seeded/faststart.mp4",
					Body: await readFile(mediaPath),
					ContentType: "video/mp4",
				}),
			);

			const env = Object.fromEntries(
				Object.entries(process.env).filter(([, value]) => value !== undefined),
			) as Record<string, string>;
			for (const key of Object.keys(env)) {
				if (key.startsWith("AWS_")) {
					delete env[key];
				}
			}
			env.HOME = scratch;
			env.AWS_CONFIG_FILE = configFile;
			env.AWS_SHARED_CREDENTIALS_FILE = credentialsFile;
			env.AWS_EC2_METADATA_DISABLED = "true";

			electronApp = await _electron.launch({
				args: [
					join(projectRoot, "out/main/index.js"),
					`--user-data-dir=${userData}`,
					"--password-store=basic",
				],
				cwd: projectRoot,
				env,
				timeout: 60_000,
			});
			const page = await electronApp.firstWindow();
			await use({ electronApp, page, s3, bucket, uploadPath });
		} finally {
			await electronApp?.close().catch(() => undefined);
			s3?.destroy();
			try {
				execFileSync("docker", [...composeArgs, "down", "-v"], {
					cwd: projectRoot,
					stdio: "inherit",
				});
			} finally {
				await rm(scratch, { recursive: true, force: true });
			}
		}
	},
});

export { expect };
