export class DeploymentState {
  private deployed: boolean | null = null;
  private expiresAt = 0;

  constructor(private readonly negativeCacheTtlMs: number) {}

  clear(): void {
    this.deployed = null;
    this.expiresAt = 0;
  }

  async check(readDeploymentState: () => Promise<boolean>): Promise<boolean> {
    const now = Date.now();

    if (this.deployed === true) {
      return true;
    }

    if (this.deployed === false && now < this.expiresAt) {
      return false;
    }

    const deployed = await readDeploymentState();
    if (deployed) {
      this.deployed = true;
      this.expiresAt = Number.POSITIVE_INFINITY;
    } else {
      this.deployed = false;
      this.expiresAt = now + this.negativeCacheTtlMs;
    }

    return deployed;
  }
}
