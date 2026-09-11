import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";
import S3rver from "s3rver";

/**
 * The application smoke test (plan's design: "server functions called
 * directly in-process, mongodb-memory-server for the DB, real
 * node:assert/strict checks, output.json diffed against a committed
 * golden"). Deliberately separate from evidence/configuration-governance.test.ts (which
 * proves the *evidence report* is correct, with no Mongo/server/browser
 * involved) -- this proves the *application* works, so a break in either is
 * never masked by, or confused with, a break in the other.
 *
 * Every capability's env.schema.ts calls createEnv() at module import time,
 * reading process.env immediately -- so MONGODB_URI/S3_* must be set
 * *before* any module that transitively imports a capability schema is
 * imported. Hence the dynamic imports below, run only after the ephemeral
 * Mongo/S3 servers are up and their real connection details are known.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const mongo = await MongoMemoryServer.create();
  process.env["MONGODB_URI"] = mongo.getUri("enterprise-platform-smoke-test");

  const s3Dir = await fs.mkdtemp(path.join(os.tmpdir(), "env-cap-enterprise-platform-s3-"));
  const s3Port = 34567;
  const s3 = new S3rver({
    port: s3Port,
    address: "localhost",
    silent: true,
    directory: s3Dir,
  });
  await s3.run();
  process.env["S3_ENDPOINT"] = `http://localhost:${s3Port}`;
  process.env["S3_BUCKET"] = "case-file-attachments-smoke-test";
  process.env["S3_REGION"] = "us-east-1";
  // s3rver only accepts this exact literal credential -- see its own README's
  // client-configuration example -- not an arbitrary placeholder.
  process.env["S3_ACCESS_KEY_ID"] = "S3RVER";
  process.env["S3_SECRET_ACCESS_KEY"] = "S3RVER";
  process.env["SESSION_SECRET"] = "smoke-test-session-secret-at-least-32-characters-long";
  process.env["GITHUB_CLIENT_ID"] = "smoke-test-github-client-id";
  process.env["GITHUB_CLIENT_SECRET"] = "smoke-test-github-client-secret";
  process.env["EMAIL_FROM_ADDRESS"] = "notifications@example.invalid";
  process.env["LOG_LEVEL"] = "error";

  const { S3Client, CreateBucketCommand } = await import("@aws-sdk/client-s3");
  await new S3Client({
    endpoint: process.env["S3_ENDPOINT"],
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: "S3RVER", secretAccessKey: "S3RVER" },
  }).send(new CreateBucketCommand({ Bucket: process.env["S3_BUCKET"] }));

  // Imports the *Logic functions directly, never the createServerFn()-
  // wrapped versions -- those can only run inside TanStack Start's own
  // request context (an AsyncLocalStorage the framework sets up per-request),
  // which doesn't exist in this plain-Node headless run. See
  // server/functions/auth.ts's own comment on the split.
  const { startServer } = await import("./server/startup.js");
  const { connectDatabase, disconnectDatabase } = await import("./server/db/connection.js");
  const {
    signupLogic: signup,
    githubLoginAvailable,
    githubAuthorizeUrl,
  } = await import("./server/functions/auth.js");
  const {
    createMatterLogic: createMatter,
    listMattersLogic: listMatters,
    closeMatterLogic: closeMatter,
  } = await import("./server/functions/matters.js");
  const {
    createTaskLogic: createTask,
    toggleTaskLogic: toggleTask,
    attachFileToTaskLogic: attachFileToTask,
    listTasksForMatterLogic: listTasksForMatter,
  } = await import("./server/functions/tasks.js");
  const { sendNotification } = await import("./server/services/email.service.js");

  await startServer();
  await connectDatabase();

  const output: Record<string, unknown> = {};

  // signup -> create matter -> add task -> toggle -> attach a file -> logout (per README's manual browser walkthrough, exercised headlessly here)
  const user = await signup({
    email: "attorney@example.invalid",
    name: "Test Attorney",
    password: "correct horse battery staple",
  });
  assert.ok(user.userId, "signup() must return a userId");
  assert.ok(user.token, "signup() must return a session token");
  output["signup"] = { hasUserId: user.userId.length > 0, hasToken: user.token.length > 0 };

  const matter = await createMatter({
    title: "Smith v. Jones",
    clientName: "Smith",
    ownerId: user.userId,
  });
  assert.ok(matter.matterId, "createMatter() must return a matterId");

  const matters = await listMatters();
  assert.equal(matters.length, 1);
  assert.equal(matters[0]?.title, "Smith v. Jones");
  output["matters"] = matters.map((m) => ({ title: m.title, status: m.status }));

  const task = await createTask({ matterId: matter.matterId, title: "Draft complaint" });
  assert.ok(task.taskId, "createTask() must return a taskId");

  const toggled = await toggleTask({ taskId: task.taskId });
  assert.equal(toggled.done, true, "toggling a fresh task must mark it done");

  const attached = await attachFileToTask({
    taskId: task.taskId,
    fileName: "complaint-draft.txt",
    content: "Privileged and confidential draft.",
  });
  assert.ok(attached.attachmentKey.includes(task.taskId));

  const tasks = await listTasksForMatter({ matterId: matter.matterId });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.done, true);
  assert.equal(tasks[0]?.attachmentKey, attached.attachmentKey);
  output["tasks"] = tasks.map((t) => ({ title: t.title, done: t.done, hasAttachment: Boolean(t.attachmentKey) }));

  const closed = await closeMatter({ matterId: matter.matterId, userId: user.userId });
  assert.equal(closed.ok, true);
  const mattersAfterClose = await listMatters();
  assert.equal(mattersAfterClose[0]?.status, "closed");
  output["matterClosedAfterClose"] = mattersAfterClose[0]?.status === "closed";

  // email: RESEND_API_KEY is deliberately unset -- proves the console-fallback path, not the Resend SDK call.
  const notification = await sendNotification({
    to: user.userId,
    subject: "Task assigned",
    body: "You have a new task.",
  });
  assert.equal(notification.sent, false, "with no RESEND_API_KEY, sendNotification() must fall back, not throw");
  output["emailFallback"] = notification.sent === false;

  // oauth-github: GITHUB_CLIENT_ID is set in this smoke test, so login is offered -- pure string construction, no real GitHub handshake (see README).
  assert.equal(githubLoginAvailable(), true);
  const authorizeUrl = githubAuthorizeUrl("http://localhost:3000/auth/github/callback");
  assert.ok(authorizeUrl.startsWith("https://github.com/login/oauth/authorize"));
  output["githubLoginAvailable"] = githubLoginAvailable();

  await disconnectDatabase();
  await mongo.stop();
  await s3.close();
  await fs.rm(s3Dir, { recursive: true, force: true });

  const outputPath = path.join(root, "output.json");
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const expectedPath = path.join(root, "expected", "output.json");
  const expected = await fs.readFile(expectedPath, "utf8");
  const actual = await fs.readFile(outputPath, "utf8");
  assert.equal(actual, expected, `output.json does not match expected/output.json -- diff them directly`);

  console.log("Headless smoke test passed: signup -> create matter -> add task -> toggle -> attach file -> close matter -> notify (console fallback) -> GitHub login availability.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
