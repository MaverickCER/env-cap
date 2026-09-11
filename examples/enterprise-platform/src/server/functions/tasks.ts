import { createServerFn } from "@tanstack/react-start";
import { Task } from "../db/models/task.model.js";
import { uploadAttachment } from "../services/storage.service.js";

/**
 * Plain, directly-callable business logic -- see auth.ts's own comment on
 * why this is kept separate from the createServerFn() wrappers below.
 */
export interface TaskSummary {
  id: string;
  title: string;
  done: boolean;
  attachmentKey: string | undefined;
}

export async function listTasksForMatterLogic(data: { matterId: string }): Promise<TaskSummary[]> {
  const tasks = await Task.find({ matterId: data.matterId }).lean();
  return tasks.map((t) => ({
    id: String(t._id),
    title: t.title,
    done: t.done,
    attachmentKey: t.attachmentKey,
  }));
}

export async function createTaskLogic(data: {
  matterId: string;
  title: string;
  assigneeId?: string;
}): Promise<{ taskId: string }> {
  const task = await Task.create({
    matterId: data.matterId,
    title: data.title,
    assigneeId: data.assigneeId,
  });
  return { taskId: task.id as string };
}

export async function toggleTaskLogic(data: { taskId: string }): Promise<{ done: boolean }> {
  const task = await Task.findById(data.taskId);
  if (!task) throw new Error(`Task ${data.taskId} not found.`);
  task.done = !task.done;
  await task.save();
  return { done: task.done };
}

export async function attachFileToTaskLogic(data: {
  taskId: string;
  fileName: string;
  content: string;
}): Promise<{ attachmentKey: string }> {
  const key = `tasks/${data.taskId}/${data.fileName}`;
  await uploadAttachment(key, data.content);
  await Task.findByIdAndUpdate(data.taskId, { attachmentKey: key });
  return { attachmentKey: key };
}

export const listTasksForMatter = createServerFn({ method: "GET" })
  .validator((data: { matterId: string }) => data)
  .handler(({ data }) => listTasksForMatterLogic(data));

export const createTask = createServerFn({ method: "POST" })
  .validator((data: { matterId: string; title: string; assigneeId?: string }) => data)
  .handler(({ data }) => createTaskLogic(data));

export const toggleTask = createServerFn({ method: "POST" })
  .validator((data: { taskId: string }) => data)
  .handler(({ data }) => toggleTaskLogic(data));

export const attachFileToTask = createServerFn({ method: "POST" })
  .validator((data: { taskId: string; fileName: string; content: string }) => data)
  .handler(({ data }) => attachFileToTaskLogic(data));
