import mongoose, { Schema } from "mongoose";

export interface TaskDocument extends mongoose.Document {
  matterId: mongoose.Types.ObjectId;
  title: string;
  done: boolean;
  assigneeId: mongoose.Types.ObjectId | undefined;
  attachmentKey: string | undefined;
}

const taskSchema = new Schema<TaskDocument>({
  matterId: { type: Schema.Types.ObjectId, ref: "Matter", required: true },
  title: { type: String, required: true },
  done: { type: Boolean, default: false },
  assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
  // Key of an attachment stored via the storage capability's S3 bucket, if one was uploaded.
  attachmentKey: { type: String },
});

export const Task: mongoose.Model<TaskDocument> =
  (mongoose.models["Task"] as mongoose.Model<TaskDocument> | undefined) ??
  mongoose.model<TaskDocument>("Task", taskSchema);
