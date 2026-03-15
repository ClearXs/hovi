import { create } from "zustand";
import { generateId } from "@/lib/utils";
import {
  AgentState,
  Agent,
  TodoItem,
  LogEntry,
  ToolUsage,
  FileItem,
  SubagentMessageProps,
} from "@/types";

interface AgentStore extends AgentState {
  // Subagent state
  subagents: Map<string, SubagentMessageProps>;

  // Actions
  setAgent: (agent: Agent) => void;
  updateAgentStatus: (status: Agent["status"], progress?: number) => void;
  setCurrentTask: (task: string) => void;
  addTodo: (text: string, priority?: TodoItem["priority"]) => void;
  toggleTodo: (todoId: string) => void;
  deleteTodo: (todoId: string) => void;
  addLogEntry: (entry: Omit<LogEntry, "id" | "timestamp">) => void;
  addToolUsage: (tool: Omit<ToolUsage, "id" | "timestamp">) => void;
  addCreatedFile: (file: Omit<FileItem, "id" | "createdAt" | "modifiedAt">) => void;
  clearAgent: () => void;
  setError: (error: string | null) => void;

  // Subagent actions
  addSubagent: (subagent: SubagentMessageProps) => void;
  updateSubagent: (runId: string, updates: Partial<SubagentMessageProps>) => void;
  removeSubagent: (runId: string) => void;
  clearSubagents: () => void;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agent: null,
  isRunning: false,
  error: null,
  subagents: new Map(),

  setAgent: (agent) => {
    set({ agent, error: null });
  },

  updateAgentStatus: (status, progress) => {
    set((state) => {
      if (!state.agent) return state;

      return {
        agent: {
          ...state.agent,
          status,
          progress: progress ?? state.agent.progress,
        },
        isRunning: status === "running",
      };
    });
  },

  setCurrentTask: (task) => {
    set((state) => {
      if (!state.agent) return state;

      return {
        agent: {
          ...state.agent,
          currentTask: task,
        },
      };
    });
  },

  addTodo: (text, priority = "medium") => {
    set((state) => {
      if (!state.agent) return state;

      const newTodo: TodoItem = {
        id: generateId(),
        text,
        completed: false,
        priority,
        createdAt: new Date(),
      };

      return {
        agent: {
          ...state.agent,
          todos: [...state.agent.todos, newTodo],
        },
      };
    });
  },

  toggleTodo: (todoId) => {
    set((state) => {
      if (!state.agent) return state;

      return {
        agent: {
          ...state.agent,
          todos: state.agent.todos.map((todo) =>
            todo.id === todoId ? { ...todo, completed: !todo.completed } : todo,
          ),
        },
      };
    });
  },

  deleteTodo: (todoId) => {
    set((state) => {
      if (!state.agent) return state;

      return {
        agent: {
          ...state.agent,
          todos: state.agent.todos.filter((todo) => todo.id !== todoId),
        },
      };
    });
  },

  addLogEntry: (entry) => {
    set((state) => {
      if (!state.agent) return state;

      const newLogEntry: LogEntry = {
        ...entry,
        id: generateId(),
        timestamp: new Date(),
      };

      return {
        agent: {
          ...state.agent,
          executionLog: [...state.agent.executionLog, newLogEntry],
        },
      };
    });
  },

  addToolUsage: (tool) => {
    set((state) => {
      if (!state.agent) return state;

      const newToolUsage: ToolUsage = {
        ...tool,
        id: generateId(),
        timestamp: new Date(),
      };

      return {
        agent: {
          ...state.agent,
          usedTools: [...state.agent.usedTools, newToolUsage],
        },
      };
    });
  },

  addCreatedFile: (file) => {
    set((state) => {
      if (!state.agent) return state;

      const now = new Date();
      const newFile: FileItem = {
        ...file,
        id: generateId(),
        createdAt: now,
        modifiedAt: now,
      };

      return {
        agent: {
          ...state.agent,
          createdFiles: [...state.agent.createdFiles, newFile],
        },
      };
    });
  },

  clearAgent: () => {
    set({
      agent: null,
      isRunning: false,
      error: null,
      subagents: new Map(),
    });
  },

  setError: (error) => {
    set({ error });
  },

  // Subagent actions
  addSubagent: (subagent) => {
    set((state) => {
      const newMap = new Map(state.subagents);
      newMap.set(subagent.id, subagent);
      return { subagents: newMap };
    });
  },

  updateSubagent: (runId, updates) => {
    set((state) => {
      const existing = state.subagents.get(runId);
      if (!existing) return state;
      const newMap = new Map(state.subagents);
      newMap.set(runId, { ...existing, ...updates });
      return { subagents: newMap };
    });
  },

  removeSubagent: (runId) => {
    set((state) => {
      const newMap = new Map(state.subagents);
      newMap.delete(runId);
      return { subagents: newMap };
    });
  },

  clearSubagents: () => {
    set({ subagents: new Map() });
  },
}));
