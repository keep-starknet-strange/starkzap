import { ChainId, TipButtonConfig } from './types';

export class Subscription {
  private interval: 'monthly' | 'yearly';
  private amount: string;
  private token: string;
  private chains: ChainId[];
  private recipientAddress: string;

  constructor(config: {
    interval: 'monthly' | 'yearly';
    amount: string;
    token: string;
    chains: ChainId[];
    recipientAddress: string;
  }) {
    this.interval = config.interval;
    this.amount = config.amount;
    this.token = config.token;
    this.chains = config.chains;
    this.recipientAddress = config.recipientAddress;
  }

  getInterval(): 'monthly' | 'yearly' {
    return this.interval;
  }

  getAmount(): string {
    return this.amount;
  }

  getToken(): string {
    return this.token;
  }

  getChains(): ChainId[] {
    return this.chains;
  }

  getRecipientAddress(): string {
    return this.recipientAddress;
  }

  renderScheduleBadge(): string {
    return `<div class="sz-subscription-badge">
      <span class="sz-subscription-interval">${this.interval}</span>
      <span class="sz-subscription-amount">${this.amount} ${this.token}</span>
    </div>`;
  }

  render(): string {
    return `
    <div class="sz-subscription-container">
      ${this.renderScheduleBadge()}
      <div class="sz-subscription-chains">
        ${this.chains.map(chain => `<span class="sz-chain-tag">${chain}</span>`).join('')}
      </div>
    </div>`;
  }
}

export function createSubscriptionWidget(subscription: Subscription): string {
  return `
  <div class="sz-subscription-widget">
    <div class="sz-subscription-header">
      <span class="sz-subscription-title">Subscribe</span>
      <span class="sz-subscription-period">${subscription.getInterval()}</span>
    </div>
    <div class="sz-subscription-amount">
      ${subscription.getAmount()} ${subscription.getToken()}
    </div>
    <button class="sz-subscribe-btn" onclick="handleSubscribe()">
      Start Subscription
    </button>
    <div class="sz-subscription-info">
      Pay with ${subscription.getChains().join(', ')}
    </div>
  </div>`;
}
