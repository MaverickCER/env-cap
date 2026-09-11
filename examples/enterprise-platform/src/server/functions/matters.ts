import { createServerFn } from "@tanstack/react-start";
import { AuditLog } from "../db/models/audit-log.model.js";
import { Matter } from "../db/models/matter.model.js";

/**
 * Plain, directly-callable business logic -- see auth.ts's own comment on
 * why this is kept separate from the createServerFn() wrappers below.
 */
export async function createMatterLogic(data: {
  title: string;
  clientName: string;
  ownerId: string;
}): Promise<{ matterId: string }> {
  const matter = await Matter.create({
    title: data.title,
    clientName: data.clientName,
    ownerId: data.ownerId,
  });
  await AuditLog.create({ userId: data.ownerId, action: "matter.created", matterId: matter.id });
  return { matterId: matter.id as string };
}

export interface MatterSummary {
  id: string;
  title: string;
  clientName: string;
  status: string;
}

export async function listMattersLogic(): Promise<MatterSummary[]> {
  const matters = await Matter.find().sort({ createdAt: -1 }).lean();
  return matters.map((m) => ({
    id: String(m._id),
    title: m.title,
    clientName: m.clientName,
    status: m.status,
  }));
}

export async function closeMatterLogic(data: {
  matterId: string;
  userId: string;
}): Promise<{ ok: true }> {
  await Matter.findByIdAndUpdate(data.matterId, { status: "closed" });
  await AuditLog.create({ userId: data.userId, action: "matter.closed", matterId: data.matterId });
  return { ok: true };
}

export const createMatter = createServerFn({ method: "POST" })
  .validator((data: { title: string; clientName: string; ownerId: string }) => data)
  .handler(({ data }) => createMatterLogic(data));

export const listMatters = createServerFn({ method: "GET" }).handler(() => listMattersLogic());

export const closeMatter = createServerFn({ method: "POST" })
  .validator((data: { matterId: string; userId: string }) => data)
  .handler(({ data }) => closeMatterLogic(data));
