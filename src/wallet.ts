import { SponsorshipNotAvailableError } from './errors';
import { TransferOptions, FeeMode } from './types';

export class StarkzapWallet {
  // existing wallet implementation preserved
  // ...

  private isSponsorshipError(err: unknown): boolean {
    const msg = (err as Error)?.message?.toLowerCase() ?? '';
    return (
      msg.includes('not in policies') ||
      msg.includes('not whitelisted') ||
      msg.includes('sponsored') ||
      msg.includes('policy limit') ||
      msg.includes('policy_exceeded') ||
      msg.includes('network unavailable')
    );
  }

  private mapSponsorshipError(err: unknown): SponsorshipNotAvailableError {
    const msg = (err as Error)?.message?.toLowerCase() ?? '';
    let reason: 'not_whitelisted' | 'policy_exceeded' | 'network_unavailable' = 'network_unavailable';

    if (msg.includes('not in policies') || msg.includes('not whitelisted')) {
      reason = 'not_whitelisted';
    } else if (msg.includes('policy limit') || msg.includes('policy_exceeded') || msg.includes('limit exceeded')) {
      reason = 'policy_exceeded';
    } else if (msg.includes('network unavailable') || msg.includes('network_unavailable')) {
      reason = 'network_unavailable';
    }

    return new SponsorshipNotAvailableError(reason, (err as Error)?.message);
  }

  private async _executeTransfer(
    token: string,
    recipients: unknown[],
    options: TransferOptions & { feeMode: FeeMode }
  ): Promise<{ txHash: string }> {
    // existing transfer execution logic preserved
    // Replace with real implementation
    return { txHash: '0x0' };
  }

  async transfer(token: string, recipients: unknown[], options: TransferOptions = {}) {
    const feeMode: FeeMode = options.feeMode ?? 'user_pays';

    try {
      return await this._executeTransfer(token, recipients, { ...options, feeMode });
    } catch (err) {
      if (feeMode === 'sponsored' && this.isSponsorshipError(err)) {
        const sponsorshipError = this.mapSponsorshipError(err);

        if (options.fallbackTo === 'user_pays') {
          options.onFallback?.(sponsorshipError);
          return await this._executeTransfer(token, recipients, {
            ...options,
            feeMode: 'user_pays',
          });
        }

        throw sponsorshipError;
      }
      throw err;
    }
  }
}
