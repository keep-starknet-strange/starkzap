import { ChainId, CreatorConfig, TipButtonConfig } from './types';
import { TipButton, createTipButtonHTML } from './tip-button';
import { Subscription, createSubscriptionWidget } from './subscription';

export class Creator {
  private config: CreatorConfig;
  private displayName: string;
  private starknetAddress: string;

  constructor(config: CreatorConfig) {
    this.config = config;
    this.displayName = config.displayName;
    this.starknetAddress = config.starknetAddress;
  }

  getDisplayName(): string {
    return this.displayName;
  }

  getStarknetAddress(): string {
    return this.starknetAddress;
  }

  getConfig(): CreatorConfig {
    return { ...this.config };
  }

  tipButton(config: TipButtonConfig): TipButton {
    return new TipButton(config, this.starknetAddress, this.displayName);
  }

  subscription(subConfig: {
    interval: 'monthly' | 'yearly';
    amount: string;
    token: string;
    chains: ChainId[];
  }): Subscription {
    return new Subscription({
      ...subConfig,
      recipientAddress: this.starknetAddress,
    });
  }

  renderTipButton(config: TipButtonConfig): string {
    const tipButton = this.tipButton(config);
    return tipButton.render();
  }

  renderSubscriptionWidget(sub: Subscription): string {
    return createSubscriptionWidget(sub);
  }

  getProfileHTML(): string {
    const { displayName, description, avatarUrl, websiteUrl, socialLinks } = this.config;
    return `
    <div class="sz-creator-profile">
      <div class="sz-profile-header">
        ${avatarUrl 
          ? `<img src="${avatarUrl}" alt="${displayName}" class="sz-avatar">` 
          : `<div class="sz-avatar-placeholder">${displayName.charAt(0).toUpperCase()}</div>`}
        <div class="sz-profile-info">
          <h3 class="sz-profile-name">${displayName}</h3>
          ${description ? `<p class="sz-profile-description">${description}</p>` : ''}
          ${websiteUrl ? `<a href="${websiteUrl}" target="_blank" class="sz-website-link">🔗 Website</a>` : ''}
        </div>
      </div>
      ${socialLinks ? `
      <div class="sz-social-links">
        ${socialLinks.twitter ? `<a href="https://twitter.com/${socialLinks.twitter}" target="_blank" class="sz-social-link">🐦 Twitter</a>` : ''}
        ${socialLinks.discord ? `<a href="https://discord.gg/${socialLinks.discord}" target="_blank" class="sz-social-link">💬 Discord</a>` : ''}
        ${socialLinks.telegram ? `<a href="https://t.me/${socialLinks.telegram}" target="_blank" class="sz-social-link">📱 Telegram</a>` : ''}
        ${socialLinks.github ? `<a href="https://github.com/${socialLinks.github}" target="_blank" class="sz-social-link">🐙 GitHub</a>` : ''}
      </div>` : ''}
    </div>`;
  }
}

// Factory function for convenience
export function createCreator(config: CreatorConfig): Creator {
  return new Creator(config);
}
