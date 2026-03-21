import { isSubagentLifecycleEvent } from "./agent-stream-events";

describe("isSubagentLifecycleEvent", () => {
  it("accepts lifecycle payloads with a subagent object", () => {
    expect(
      isSubagentLifecycleEvent({
        stream: "lifecycle",
        data: {
          phase: "start",
          subagent: {
            id: "sa-1",
          },
        },
      }),
    ).toBe(true);
  });

  it("rejects non-lifecycle payloads", () => {
    expect(
      isSubagentLifecycleEvent({
        stream: "tool",
        data: {
          subagent: {
            id: "sa-1",
          },
        },
      }),
    ).toBe(false);
  });

  it("rejects lifecycle payloads without a subagent payload", () => {
    expect(
      isSubagentLifecycleEvent({
        stream: "lifecycle",
        data: {
          phase: "start",
        },
      }),
    ).toBe(false);
  });
});
