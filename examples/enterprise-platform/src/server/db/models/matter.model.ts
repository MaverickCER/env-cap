import mongoose, { Schema } from "mongoose";

export type MatterStatus = "open" | "closed";

export interface MatterDocument extends mongoose.Document {
  title: string;
  clientName: string;
  status: MatterStatus;
  ownerId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const matterSchema = new Schema<MatterDocument>({
  title: { type: String, required: true },
  clientName: { type: String, required: true },
  status: { type: String, enum: ["open", "closed"], default: "open" },
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: () => new Date() },
});

export const Matter: mongoose.Model<MatterDocument> =
  (mongoose.models["Matter"] as mongoose.Model<MatterDocument> | undefined) ??
  mongoose.model<MatterDocument>("Matter", matterSchema);
