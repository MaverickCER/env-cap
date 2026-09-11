import { createFileRoute, Link } from "@tanstack/react-router";
import { listMatters } from "../server/functions/matters.js";
import type { MatterSummary } from "../server/functions/matters.js";

export const Route = createFileRoute("/matters")({
  component: MattersComponent,
  loader: () => listMatters(),
});

function MattersComponent() {
  const matters = Route.useLoaderData();

  return (
    <div>
      <h1>Matters</h1>
      <ul>
        {matters.map((matter: MatterSummary) => (
          <li key={matter.id}>
            <Link to="/matters/$id" params={{ id: matter.id }}>
              {matter.title}
            </Link>{" "}
            -- {matter.clientName} ({matter.status})
          </li>
        ))}
      </ul>
    </div>
  );
}
