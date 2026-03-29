describe("shortcutStore", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
  });

  it("includes default shortcuts for new task and global search", async () => {
    let useShortcutStore: typeof import("./shortcutStore").useShortcutStore | undefined;

    await jest.isolateModulesAsync(async () => {
      ({ useShortcutStore } = await import("./shortcutStore"));
    });

    expect(useShortcutStore).toBeDefined();
    const shortcuts = useShortcutStore!.getState().shortcuts;

    const search = shortcuts.find((entry) => entry.id === "search");
    const newSession = shortcuts.find((entry) => entry.id === "newSession");

    expect(search).toBeDefined();
    expect(search).toMatchObject({
      key: "k",
      ctrl: true,
      meta: true,
      shift: false,
      alt: false,
    });

    expect(newSession).toBeDefined();
    expect(newSession).toMatchObject({
      key: "n",
      ctrl: true,
      meta: true,
      shift: false,
      alt: false,
    });
  });
});
