// Custom hook for Agent execution with streaming

import { useState, useCallback, useRef } from "react";
import { buildGatewayUrl } from "@/lib/runtime/desktop-env";
import { AgentExecution, AgentTask } from "@/types/agent";

interface UseAgentExecutionOptions {
  onStepStarted?: (stepNumber: number, action: string) => void;
  onStepCompleted?: (stepNumber: number, observation: string) => void;
  onPlanCreated?: (stepsCount: number) => void;
  onCompleted?: (execution: AgentExecution) => void;
  onError?: (error: string) => void;
}

export function useAgentExecution(options: UseAgentExecutionOptions = {}) {
  const [execution, setExecution] = useState<AgentExecution | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const execute = useCallback(
    async (task: AgentTask) => {
      if (isExecuting) return;

      setIsExecuting(true);
      setIsThinking(true);
      setExecution(null);

      try {
        // Create execution first
        const createResponse = await fetch(buildGatewayUrl("/api/v1/agent/execute"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task,
            max_steps: 10,
            stream: true,
          }),
        });

        if (!createResponse.ok) {
          throw new Error("Failed to start execution");
        }

        // For streaming, we use the streaming endpoint
        const response = await fetch(buildGatewayUrl("/api/v1/agent/execute/stream"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task,
            max_steps: 10,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to start streaming execution");
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let executionId = "";
        let currentSteps: any[] = [];

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]" || !data) continue;

              try {
                const update = JSON.parse(data);

                switch (update.type) {
                  case "execution_started":
                    executionId = update.execution_id;
                    setExecution({
                      execution_id: executionId,
                      status: "running",
                      steps: [],
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    });
                    break;

                  case "plan_created":
                    options.onPlanCreated?.(update.steps_count);
                    setExecution((prev) =>
                      prev
                        ? {
                            ...prev,
                            steps: Array.from({ length: update.steps_count }, (_, i) => ({
                              step_number: i + 1,
                              action: "",
                              observation: "",
                              status: "pending" as const,
                            })),
                          }
                        : null,
                    );
                    break;

                  case "step_started":
                    setIsThinking(false);
                    options.onStepStarted?.(update.step_number, update.action);
                    setExecution((prev) => {
                      if (!prev) return prev;
                      const steps = [...prev.steps];
                      if (steps[update.step_number - 1]) {
                        steps[update.step_number - 1] = {
                          ...steps[update.step_number - 1],
                          action: update.action,
                          status: "running",
                        };
                      }
                      return { ...prev, steps, updated_at: new Date().toISOString() };
                    });
                    break;

                  case "step_completed":
                    setIsThinking(false);
                    options.onStepCompleted?.(update.step_number, update.observation);
                    setExecution((prev) => {
                      if (!prev) return prev;
                      const steps = [...prev.steps];
                      if (steps[update.step_number - 1]) {
                        steps[update.step_number - 1] = {
                          ...steps[update.step_number - 1],
                          observation: update.observation,
                          status: update.success ? "completed" : "failed",
                        };
                      }
                      return { ...prev, steps, updated_at: new Date().toISOString() };
                    });
                    break;

                  case "execution_completed":
                    setExecution((prev) =>
                      prev
                        ? {
                            ...prev,
                            status: "completed",
                            result: update.result,
                            updated_at: new Date().toISOString(),
                          }
                        : null,
                    );
                    options.onCompleted?.(execution as AgentExecution);
                    break;

                  case "execution_error":
                    setExecution((prev) =>
                      prev
                        ? {
                            ...prev,
                            status: "failed",
                            error: update.error,
                            updated_at: new Date().toISOString(),
                          }
                        : null,
                    );
                    options.onError?.(update.error);
                    break;
                }
              } catch (parseError) {
                // Ignore parse errors
              }
            }
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        options.onError?.(errorMessage);
        setExecution((prev) =>
          prev
            ? {
                ...prev,
                status: "failed",
                error: errorMessage,
              }
            : null,
        );
      } finally {
        setIsExecuting(false);
        setIsThinking(false);
      }
    },
    [isExecuting, options],
  );

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsExecuting(false);
    setIsThinking(false);
  }, []);

  const reset = useCallback(() => {
    setExecution(null);
    setIsExecuting(false);
    setIsThinking(false);
  }, []);

  return {
    execution,
    isExecuting,
    isThinking,
    execute,
    cancel,
    reset,
  };
}
