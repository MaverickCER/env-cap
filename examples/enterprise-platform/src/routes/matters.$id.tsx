import { createFileRoute, useRouter } from "@tanstack/react-router";
import { listTasksForMatter, toggleTask } from "../server/functions/tasks.js";
import type { TaskSummary } from "../server/functions/tasks.js";

export const Route = createFileRoute("/matters/$id")({
  component: MatterDetailComponent,
  loader: ({ params }) => listTasksForMatter({ data: { matterId: params.id } }),
});

function MatterDetailComponent() {
  const tasks = Route.useLoaderData();
  const router = useRouter();

  const handleToggle = async (taskId: string) => {
    await toggleTask({ data: { taskId } });
    await router.invalidate();
  };

  return (
    <div>
      <h1>Matter tasks</h1>
      <ul>
        {tasks.map((task: TaskSummary) => (
          <li key={task.id}>
            <label>
              <input type="checkbox" checked={task.done} onChange={() => handleToggle(task.id)} />
              {task.title}
            </label>
            {task.attachmentKey && <span> (attachment: {task.attachmentKey})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
