import { buildFileUrl } from "./personaApi";

describe("personaApi file urls", () => {
  it("builds relative gateway file urls for browser-served assets", () => {
    expect(buildFileUrl("main", "models/avatar.vrm")).toBe("/files/main/models/avatar.vrm");
    expect(buildFileUrl("main", "/motions/idle.vrma")).toBe("/files/main/motions/idle.vrma");
  });
});
