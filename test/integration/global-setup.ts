import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import { execFileSync } from "node:child_process";

export default async function setup() {
	const compose = ["compose", "-f", "test/rustfs/compose.yaml"];
	execFileSync("docker", [...compose, "up", "-d"], { stdio: "inherit" });
	const client = new S3Client({
		endpoint: "http://127.0.0.1:19000",
		region: "us-east-1",
		forcePathStyle: true,
		credentials: { accessKeyId: "rustfsadmin", secretAccessKey: "rustfsadmin" },
	});
	const deadline = Date.now() + 60_000;
	try {
		while (Date.now() < deadline) {
			try {
				await client.send(new ListBucketsCommand({}));
				break;
			} catch {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}
		if (Date.now() >= deadline) throw new Error("RustFS did not become ready within 60 seconds");
	} catch (error) {
		execFileSync("docker", [...compose, "down", "-v"], { stdio: "inherit" });
		throw error;
	} finally {
		client.destroy();
	}
	return async () => {
		execFileSync("docker", [...compose, "down", "-v"], { stdio: "inherit" });
	};
}
