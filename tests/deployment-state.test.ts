import { describe, expect, it, vi } from "vitest";
import { DeploymentState } from "@/wallet/deploymentState";

describe("DeploymentState", () => {
  it("caches successful deployment checks permanently", async () => {
    const state = new DeploymentState(3_000);
    const readDeploymentState = vi.fn().mockResolvedValue(true);

    await expect(state.check(readDeploymentState)).resolves.toBe(true);
    await expect(state.check(readDeploymentState)).resolves.toBe(true);

    expect(readDeploymentState).toHaveBeenCalledTimes(1);
  });

  it("caches negative deployment checks until cleared", async () => {
    const state = new DeploymentState(60_000);
    const readDeploymentState = vi.fn().mockResolvedValue(false);

    await expect(state.check(readDeploymentState)).resolves.toBe(false);
    await expect(state.check(readDeploymentState)).resolves.toBe(false);

    expect(readDeploymentState).toHaveBeenCalledTimes(1);

    state.clear();
    await expect(state.check(readDeploymentState)).resolves.toBe(false);

    expect(readDeploymentState).toHaveBeenCalledTimes(2);
  });
});
