"use client"

import { useEffect, useState } from "react"

interface Todo {
  id: string
  userId: string
  title: string
  completed: boolean
  createdAt: string
}

interface TodoAppProps {
  // Read server-side in page.tsx and passed down, never read from
  // env-cap directly in this client component -- see page.tsx's comment.
  appName: string
}

export function TodoApp({ appName }: TodoAppProps) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [title, setTitle] = useState("")

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh(): Promise<void> {
    const res = await fetch("/api/todos")
    const data = (await res.json()) as { todos: Todo[] }
    setTodos(data.todos)
  }

  async function handleAdd(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!title.trim()) return
    await fetch("/api/todos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    })
    setTitle("")
    await refresh()
  }

  async function handleToggle(id: string): Promise<void> {
    await fetch("/api/todos", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    })
    await refresh()
  }

  return (
    <main>
      {/* appName traces back to publicEnv.NEXT_PUBLIC_APP_NAME, read
          server-side in page.tsx -- the counterpart to serverEnv's
          DATABASE_URL/SESSION_SECRET/INTERNAL_API_KEY, which "server-only"
          (see src/lib/session.ts and src/lib/store.ts) makes it a build
          error to import from a client component like this one. */}
      <h1>{appName}</h1>
      <form onSubmit={handleAdd}>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a todo"
        />
        <button type="submit">Add</button>
      </form>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <label>
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => void handleToggle(todo.id)}
              />
              {todo.title}
            </label>
          </li>
        ))}
      </ul>
    </main>
  )
}
