import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <div>
      <h1>Matter Tracker</h1>
      <p>A confidential legal-practice matter tracker, built to demonstrate env-cap.</p>
    </div>
  );
}
