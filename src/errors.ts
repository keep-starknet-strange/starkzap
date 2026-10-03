export class SponsorshipNotAvailableError extends Error {
  public readonly reason: 'not_whitelisted' | 'policy_exceeded' | 'network_unavailable';
  public readonly fallbackFeeRequired: boolean;

  constructor(
    reason: 'not_whitelisted' | 'policy_exceeded' | 'network_unavailable',
    message?: string
  ) {
    super(message ?? `Sponsorship not available: ${reason}`);
    this.name = 'SponsorshipNotAvailableError';
    this.reason = reason;
    this.fallbackFeeRequired = true;
    Object.setPrototypeOf(this, SponsorshipNotAvailableError.prototype);
  }
}
