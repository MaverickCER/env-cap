import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { githubAuthorizeUrl, githubLoginAvailable, login } from "../server/functions/auth.js";

export const Route = createFileRoute("/login")({
  component: LoginComponent,
});

function LoginComponent() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);
    try {
      await login({ data: { email, password } });
      await navigate({ to: "/matters" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    }
  };

  return (
    <div>
      <h1>Log in</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">Log in</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {githubLoginAvailable() && (
        <p>
          <a href={githubAuthorizeUrl("http://localhost:3000/auth/github/callback")}>
            Log in with GitHub
          </a>
        </p>
      )}
    </div>
  );
}
