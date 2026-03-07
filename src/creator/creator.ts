import { type Address, type Token } from "@/types";
import type { RpcProvider } from "starknet";
import { Erc20 } from "@/erc20";
import {
  type CreatorConfig,
  type TipOptions,
  type TipResult,
  type TipLinkOptions,
  type TipLinkResult,
  type CreatorStats,
  type TipButtonRenderResult,
} from "./types";

/**
 * Default tokens for tips if none specified.
 */
const DEFAULT_TIP_TOKENS: Token[] = [];

/**
 * Creator class for managing creator profiles and tips.
 *
 * @example
 * ```ts
 * import { Creator } from "starkzap/creator";
 *
 * const creator = new Creator({
 *   address: "0x123...",
 *   displayName: "MyAwesomeCreator",
 *   tokens: [STRK, ETH, USDC],
 * });
 *
 * // Send a tip
 * await creator.tip({
 *   amount: Amount.parse("10", STRK),
 *   message: "Love your work!",
 *   from: wallet,
 * });
 *
 * // Generate a tip link
 * const tipLink = creator.createTipLink({
 *   suggestedAmount: "5",
 *   token: STRK,
 * });
 * console.log(tipLink.url);
 * ```
 */
export class Creator {
  private readonly config: CreatorConfig;
  private readonly provider: RpcProvider | null;

  constructor(config: CreatorConfig, provider?: RpcProvider) {
    this.config = config;
    this.provider = provider ?? null;
  }

  /**
   * Get the creator's address.
   */
  get address(): Address {
    return this.config.address;
  }

  /**
   * Get the creator's display name.
   */
  get displayName(): string {
    return this.config.displayName ?? "Anonymous Creator";
  }

  /**
   * Get the creator's avatar URL.
   */
  get avatarUrl(): string | undefined {
    return this.config.avatarUrl;
  }

  /**
   * Get the creator's bio.
   */
  get bio(): string | undefined {
    return this.config.bio;
  }

  /**
   * Get supported tip tokens.
   */
  get tokens(): Token[] {
    return this.config.tokens ?? DEFAULT_TIP_TOKENS;
  }

  /**
   * Send a tip to this creator.
   *
   * @param options - Tip options including amount, message, and sender wallet
   * @param token - The token to tip (required when amount doesn't have symbol info)
   * @returns Tip result with transaction details
   *
   * @example
   * ```ts
   * const result = await creator.tip({
   *   amount: Amount.parse("10", STRK),
   *   message: "Great work!",
   *   from: wallet,
   * });
   * console.log(`Tip sent! Tx: ${result.txHash}`);
   * ```
   */
  async tip(options: TipOptions, token?: Token): Promise<TipResult> {
    const { amount, from } = options;

    // Get token info from amount or provided token
    const decimals = amount.getDecimals();
    const symbol = amount.getSymbol();

    if (!symbol && !token) {
      throw new Error(
        "Token must be provided when amount doesn't have symbol info. Pass the token parameter or use Amount.parse() with a Token.",
      );
    }

    // Validate the recipient is this creator
    const recipientAddress = this.config.address;

    // If we have a full token, use it; otherwise create a minimal token for the transfer
    const tipToken: Token = token ?? {
      name: symbol ?? "Unknown Token",
      address: "" as Address, // Will be resolved by the wallet
      decimals,
      symbol: symbol ?? "UNKNOWN",
    };

    // Create ERC20 helper and transfer
    const erc20 = new Erc20(tipToken, from.getProvider());

    // Build the transfer call
    const transferCalls = erc20.populateTransfer([
      { to: recipientAddress, amount },
    ]);

    // Execute the transfer
    const tx = await from.execute(transferCalls);

    // Wait for transaction to be accepted
    await tx.wait();

    return {
      txHash: tx.hash,
      amount,
      recipient: recipientAddress,
      timestamp: new Date(),
    };
  }

  /**
   * Create a shareable tip link for this creator.
   *
   * @param options - Tip link options
   * @returns Tip link with URL and optional QR code
   *
   * @example
   * ```ts
   * const tipLink = creator.createTipLink({
   *   suggestedAmount: "5",
   *   token: STRK,
   *   message: "☕ Buy me a coffee",
   * });
   *
   * // Share the link
   * console.log(tipLink.url);
   * // https://tip.starkzap.io/0x123...?amount=5&token=STRK
   * ```
   */
  createTipLink(options: TipLinkOptions = {}): TipLinkResult {
    const { suggestedAmount = "5", token, message, theme = "dark" } = options;

    // Build URL parameters
    const params = new URLSearchParams();
    params.set("amount", suggestedAmount);
    if (token) {
      params.set("token", token.symbol);
    }
    if (message) {
      params.set("message", encodeURIComponent(message));
    }
    params.set("theme", theme);

    // Generate the tip URL
    const baseUrl = "https://tip.starkzap.io";
    const url = `${baseUrl}/${this.config.address}?${params.toString()}`;

    return { url };
  }

  /**
   * Generate embeddable tip button HTML.
   *
   * @param options - Tip button options
   * @returns HTML, script, and styles for embedding
   *
   * @example
   * ```ts
   * const button = creator.tipButton({
   *   suggestedTips: ["1", "5", "10"],
   *   theme: "dark",
   * });
   *
   * // In your HTML
   * document.body.innerHTML = button.html;
   * ```
   */
  tipButton(
    options: {
      suggestedTips?: string[];
      theme?: "light" | "dark" | "auto";
      buttonText?: string;
      allowCustomAmount?: boolean;
    } = {},
  ): TipButtonRenderResult {
    const {
      suggestedTips = ["1", "5", "10"],
      theme = "dark",
      buttonText = "Tip",
      allowCustomAmount = true,
    } = options;

    const creatorAddress = this.config.address;
    const creatorName = this.displayName;

    // Generate unique ID for this button instance
    const buttonId = `starkzap-tip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const styles = `
      .starkzap-tip-container {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: inline-flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px;
        border-radius: 12px;
        background: ${theme === "dark" ? "#1a1a2e" : "#ffffff"};
        border: 1px solid ${theme === "dark" ? "#2d2d44" : "#e0e0e0"};
        max-width: 280px;
      }
      .starkzap-tip-header {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .starkzap-tip-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }
      .starkzap-tip-name {
        font-weight: 600;
        color: ${theme === "dark" ? "#ffffff" : "#1a1a1a"};
        font-size: 14px;
      }
      .starkzap-tip-amounts {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .starkzap-tip-amount-btn {
        padding: 8px 16px;
        border-radius: 20px;
        border: 1px solid ${theme === "dark" ? "#3d3d5c" : "#d0d0d0"};
        background: ${theme === "dark" ? "#2d2d44" : "#f5f5f5"};
        color: ${theme === "dark" ? "#ffffff" : "#1a1a1a"};
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s ease;
      }
      .starkzap-tip-amount-btn:hover {
        border-color: #667eea;
        background: ${theme === "dark" ? "#3d3d5c" : "#e8e8ff"};
      }
      .starkzap-tip-amount-btn.selected {
        border-color: #667eea;
        background: #667eea;
        color: #ffffff;
      }
      .starkzap-tip-custom {
        display: ${allowCustomAmount ? "block" : "none"};
        margin-top: 8px;
      }
      .starkzap-tip-custom-input {
        width: 100%;
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid ${theme === "dark" ? "#3d3d5c" : "#d0d0d0"};
        background: ${theme === "dark" ? "#1a1a2e" : "#ffffff"};
        color: ${theme === "dark" ? "#ffffff" : "#1a1a1a"};
        font-size: 14px;
        box-sizing: border-box;
      }
      .starkzap-tip-button {
        margin-top: 12px;
        padding: 12px 24px;
        border-radius: 8px;
        border: none;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #ffffff;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .starkzap-tip-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }
      .starkzap-tip-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
      }
    `;

    const html = `
      <div class="starkzap-tip-container" id="${buttonId}">
        <div class="starkzap-tip-header">
          <div class="starkzap-tip-avatar"></div>
          <span class="starkzap-tip-name">Tip ${creatorName}</span>
        </div>
        <div class="starkzap-tip-amounts">
          ${suggestedTips
            .map(
              (amount: string, i: number) =>
                `<button class="starkzap-tip-amount-btn${i === 0 ? " selected" : ""}" data-amount="${amount}">${amount}</button>`,
            )
            .join("")}
        </div>
        ${
          allowCustomAmount
            ? `<div class="starkzap-tip-custom">
          <input type="number" class="starkzap-tip-custom-input" placeholder="Custom amount" min="0" step="0.01">
        </div>`
            : ""
        }
        <button class="starkzap-tip-button" data-creator="${creatorAddress}">${buttonText}</button>
      </div>
    `;

    const script = `
      (function() {
        const container = document.getElementById('${buttonId}');
        if (!container) return;

        let selectedAmount = '${suggestedTips[0] ?? "1"}';

        // Amount button selection
        container.querySelectorAll('.starkzap-tip-amount-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            container.querySelectorAll('.starkzap-tip-amount-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedAmount = btn.dataset.amount;
            const customInput = container.querySelector('.starkzap-tip-custom-input');
            if (customInput) customInput.value = '';
          });
        });

        // Custom amount input
        const customInput = container.querySelector('.starkzap-tip-custom-input');
        if (customInput) {
          customInput.addEventListener('input', () => {
            if (customInput.value) {
              container.querySelectorAll('.starkzap-tip-amount-btn').forEach(b => b.classList.remove('selected'));
              selectedAmount = customInput.value;
            }
          });
        }

        // Tip button
        container.querySelector('.starkzap-tip-button').addEventListener('click', () => {
          const creator = container.querySelector('.starkzap-tip-button').dataset.creator;
          const event = new CustomEvent('starkzap:tip', {
            detail: {
              creator,
              amount: selectedAmount,
            },
            bubbles: true,
          });
          container.dispatchEvent(event);
        });
      })();
    `;

    return { html, script, styles };
  }

  /**
   * Get creator statistics (tips received, etc.).
   *
   * Note: This is a placeholder that returns zero stats.
   * Full implementation would query on-chain events or an indexer.
   *
   * @returns Creator statistics
   */
  async getStats(): Promise<CreatorStats> {
    // Placeholder - in a full implementation, this would:
    // 1. Query transfer events to this creator's address
    // 2. Aggregate by token and unique senders
    // 3. Return comprehensive stats
    return {
      totalTipsReceived: {},
      uniqueTippers: 0,
      totalTipsCount: 0,
    };
  }

  /**
   * Create a Creator instance from just an address.
   *
   * @param address - Creator's Starknet address
   * @param provider - Optional RPC provider for queries
   * @returns Creator instance
   */
  static fromAddress(address: Address, provider?: RpcProvider): Creator {
    return new Creator({ address }, provider);
  }
}
