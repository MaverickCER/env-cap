import "server-only"

import { serverEnv } from "@/features/todos/env.server.schema"

export interface Todo {
  id: string
  userId: string
  title: string
  completed: boolean
  createdAt: string
}

// Deliberately in-memory: the point of this example is the env-cap contract
// around DATABASE_URL (see env.server.schema.ts), not a real persistence
// layer. A real deployment would open a real connection using
// serverEnv.DATABASE_URL here instead of this Map.
//
// connectOnce() below reads serverEnv.DATABASE_URL lazily, on first real
// request, never at module-evaluation time. That's not just style: Next.js
// imports this module (transitively, via the API route) during its own
// build-time "collect page data" step, in a worker process where
// instrumentation.ts's register() hasn't necessarily run yet -- a
// module-top-level read hit env-cap's own EnvNotReadyError there for real
// during development of this example (the contract mechanically refusing an
// unvalidated read, working exactly as designed, just in a context this
// module doesn't control). Reading lazily is also what keeps env-cap's
// dependency analysis from flagging DATABASE_URL as UNCONSUMED_OWNED_VARIABLE
// (see docs/OWNERSHIP.md after `npm run docs`) without fighting Next's build
// lifecycle to do it.
let connected = false
function connectOnce(): void {
  if (connected) return
  console.log(`[store] would connect to ${new URL(serverEnv.DATABASE_URL).protocol}//... (in-memory for this example)`)
  connected = true
}

const todos = new Map<string, Todo>([
  [
    "seed-1",
    {
      id: "seed-1",
      userId: "demo-user",
      title: "Try editing this todo",
      completed: false,
      createdAt: new Date().toISOString(),
    },
  ],
])

export function listTodos(userId: string): Todo[] {
  connectOnce()
  return [...todos.values()]
    .filter((todo) => todo.userId === userId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function addTodo(userId: string, title: string): Todo {
  const todo: Todo = {
    id: crypto.randomUUID(),
    userId,
    title,
    completed: false,
    createdAt: new Date().toISOString(),
  }
  todos.set(todo.id, todo)
  return todo
}

export function toggleTodo(userId: string, id: string): Todo | undefined {
  const todo = todos.get(id)
  if (!todo || todo.userId !== userId) return undefined
  const updated: Todo = { ...todo, completed: !todo.completed }
  todos.set(id, updated)
  return updated
}

export function deleteTodo(id: string): boolean {
  return todos.delete(id)
}
