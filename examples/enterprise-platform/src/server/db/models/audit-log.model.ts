import mongoose, { Schema } from "mongoose";

export interface AuditLogDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  action: string;
  matterId: mongoose.Types.ObjectId | undefined;
  at: Date;
}

const auditLogSchema = new Schema<AuditLogDocument>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, required: true },
  matterId: { type: Schema.Types.ObjectId, ref: "Matter" },
  at: { type: Date, default: () => new Date() },
});

export const AuditLog: mongoose.Model<AuditLogDocument> =
  (mongoose.models["AuditLog"] as mongoose.Model<AuditLogDocument> | undefined) ??
  mongoose.model<AuditLogDocument>("AuditLog", auditLogSchema);
