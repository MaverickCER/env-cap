import mongoose, { Schema } from "mongoose";

export interface UserDocument extends mongoose.Document {
  email: string;
  name: string;
  passwordHash: string | undefined;
  githubId: string | undefined;
}

const userSchema = new Schema<UserDocument>({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  passwordHash: { type: String },
  githubId: { type: String },
});

// Re-registering a model with the same name throws on hot reload (dev server
// restarts trigger this module repeatedly) -- reuse the existing model when
// mongoose already has one registered.
export const User: mongoose.Model<UserDocument> =
  (mongoose.models["User"] as mongoose.Model<UserDocument> | undefined) ??
  mongoose.model<UserDocument>("User", userSchema);
