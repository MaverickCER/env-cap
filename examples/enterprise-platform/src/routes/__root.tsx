import { createRootRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Enterprise Platform -- Matter Tracker</title>
      </head>
      <body>
        <header>
          <strong>Matter Tracker</strong>{" "}
          <em>(illustrative only, not legal advice -- see README)</em>
          <nav>
            <Link to="/">Home</Link> | <Link to="/matters">Matters</Link> |{" "}
            <Link to="/login">Log in</Link> | <Link to="/signup">Sign up</Link>
          </nav>
        </header>
        <main>
          <Outlet />
        </main>
      </body>
    </html>
  );
}
