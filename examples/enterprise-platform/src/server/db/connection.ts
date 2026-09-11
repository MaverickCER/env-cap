import mongoose from "mongoose";
import { databaseEnv } from "../../capabilities/database/env.schema.js";

let connected: Promise<typeof mongoose> | undefined;

/** Connects once, lazily, and reuses the same connection for every later call -- the standard Mongoose-in-a-long-running-process pattern. */
export function connectDatabase(): Promise<typeof mongoose> {
  connected ??= mongoose.connect(databaseEnv.MONGODB_URI.toString());
  return connected;
}

export async function disconnectDatabase(): Promise<void> {
  if (!connected) return;
  await mongoose.disconnect();
  connected = undefined;
}
