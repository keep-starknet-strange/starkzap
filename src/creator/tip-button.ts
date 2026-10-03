import { ChainId, CreatorConfig, TipButtonConfig, TipState, TipButtonStyles } from './types';

const DEFAULT_STYLES: TipButtonStyles = {
  primaryColor: '#4F46E5',
  secondaryColor: '#7C3AED',
  bgColor: '#FFFFFF',
  textColor: '#1F2937',
  buttonRadius: '12px',
  fontSize: '14px',
};

const CHAIN_CONFIGS: Record<ChainId, { name: string; color: string }> = {
  base: { name: 'Base', color: '#0052FF' },
  arbitrum: { name: 'Arbitrum', color: '#28A0F0' },
  starknet: { name: 'Starknet', color: '#9B4DFF' },
  ethereum: { name: 'Ethereum', color: '#627EEA' },
  polygon: { name: 'Polygon', color: '#8247E5' },
};

export class TipButton {
  private config: TipButtonConfig;
  private creatorAddress: string;
  private displayName: string;
  private state: TipState;
  private styles: TipButtonStyles;

  constructor(config: TipButtonConfig, creatorAddress: string, displayName: string) {
    this.config = config;
    this.creatorAddress = creatorAddress;
    this.displayName = displayName;
    this.styles = { ...DEFAULT_STYLES };
    this.state = {
      selectedChain: config.chains[0],
      selectedToken: config.tokens[0],
      amount: config.suggestedAmounts[0] || '1',
      recipientAddress: creatorAddress,
      isProcessing: false,
      isDone: false,
    };
  }

  setStyles(customStyles: Partial<TipButtonStyles>): void {
    this.styles = { ...this.styles, ...customStyles };
  }

  private getButtonStyle(): string {
    const { primaryColor, buttonRadius } = this.styles;
    return `background: linear-gradient(135deg, ${primaryColor}, ${this.styles.secondaryColor || primaryColor}); border-radius: ${buttonRadius}; color: white; border: none; padding: 12px 24px; font-size: ${this.styles.fontSize}; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;`;
  }

  private getSelectedChainConfig(): { name: string; color: string } {
    return CHAIN_CONFIGS[this.state.selectedChain] || { name: this.state.selectedChain, color: '#666' };
  }

  render(): string {
    const { primaryColor, bgColor, textColor, buttonRadius, fontSize } = this.styles;
    const selectedChain = this.getSelectedChainConfig();

    const buttonsHtml = this.config.suggestedAmounts
      .map((amount, idx) => `
        <button class="sz-amount-btn ${idx === 0 ? 'sz-amount-btn-active' : ''}" 
                data-amount="${amount}" 
                onclick="selectAmount(this, '${amount}')"
                style="padding: 8px 16px; border: 1px solid #e5e7eb; border-radius: ${buttonRadius}; background: ${bgColor}; color: ${textColor}; cursor: pointer; font-size: ${fontSize};">
          ${amount} ${this.state.selectedToken}
        </button>`)
      .join('');

    const chainsHtml = this.config.chains
      .map(chain => `
        <div class="sz-chain-option ${chain === this.state.selectedChain ? 'sz-chain-selected' : ''}" 
             data-chain="${chain}"
             onclick="selectChain('${chain}')"
             style="display: flex; align-items: center; gap: 6px; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: ${buttonRadius}; cursor: pointer; ${chain === this.state.selectedChain ? `border-color: ${primaryColor};` : ''}">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: ${CHAIN_CONFIGS[chain as ChainId]?.color || '#666'};"></span>
          <span style="font-size: 12px; color: ${textColor};">${CHAIN_CONFIGS[chain as ChainId]?.name || chain}</span>
        </div>`)
      .join('');

    const tokensHtml = this.config.tokens
      .map(token => `
        <div class="sz-token-option ${token === this.state.selectedToken ? 'sz-token-selected' : ''}" 
             data-token="${token}"
             onclick="selectToken('${token}')"
             style="display: flex; align-items: center; gap: 6px; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: ${buttonRadius}; cursor: pointer; ${token === this.state.selectedToken ? `border-color: ${primaryColor};` : ''}">
          <span style="font-weight: 600; font-size: 12px; color: ${textColor};">${token}</span>
        </div>`)
      .join('');

    return `
    <div class="sz-tip-widget" id="sz-tip-widget" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 400px; border: 1px solid #e5e7eb; border-radius: ${buttonRadius}; background: ${bgColor}; overflow: hidden;">
      <style>
        .sz-tip-widget * { box-sizing: border-box; }
        .sz-tip-widget .sz-chain-option:hover { border-color: ${primaryColor}; }
        .sz-tip-widget .sz-token-option:hover { border-color: ${primaryColor}; }
        .sz-tip-widget .sz-amount-btn:hover { border-color: ${primaryColor}; transform: translateY(-1px); }
        .sz-tip-widget .sz-amount-btn-active { border-color: ${primaryColor} !important; background: ${primaryColor}15 !important; color: ${primaryColor} !important; font-weight: 600; }
        .sz-tip-widget .sz-custom-amount { width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: ${buttonRadius}; font-size: ${fontSize}; color: ${textColor}; margin-top: 12px; }
        .sz-tip-widget .sz-tip-btn { width: 100%; padding: 14px; font-weight: 600; margin-top: 16px; font-size: ${fontSize}; }
        .sz-tip-widget .sz-tip-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        .sz-tip-widget .sz-tip-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .sz-tip-widget .sz-row { display: flex; gap: 8px; margin-top: 12px; }
        .sz-tip-widget .sz-section-title { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 16px; margin-bottom: 8px; }
        .sz-tip-widget .sz-to-row { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #f9fafb; border-radius: ${buttonRadius}; font-size: 12px; color: #6b7280; margin-top: 12px; }
        .sz-tip-widget .sz-processing { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px; }
        .sz-tip-widget .sz-spinner { width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: ${primaryColor}; border-radius: 50%; animation: sz-spin 0.8s linear infinite; }
        @keyframes sz-spin { to { transform: rotate(360deg); } }
        .sz-tip-widget .sz-success { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px; }
        .sz-tip-widget .sz-checkmark { width: 48px; height: 48px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; }
        .sz-tip-widget .sz-handle-tip { background: none; border: none; color: ${primaryColor}; cursor: pointer; font-size: 12px; text-decoration: underline; margin-top: 8px; }
      </style>

      <div class="sz-tip-header" style="padding: 16px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 12px;">
        <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, ${primaryColor}, ${this.styles.secondaryColor || primaryColor}); display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 16px;">
          ${this.displayName.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style="font-weight: 600; color: ${textColor};">${this.displayName}</div>
          <div style="font-size: 12px; color: #6b7280;">Receive a tip</div>
        </div>
      </div>

      <div class="sz-tip-body" style="padding: 16px;" id="sz-tip-body">
        ${this.state.isDone ? this.renderSuccess() : this.renderForm()}
      </div>

      <script>
        (function() {
          var selectedAmount = '${this.state.amount}';
          var selectedChain = '${this.state.selectedChain}';
          var selectedToken = '${this.state.selectedToken}';
          var creatorAddress = '${this.creatorAddress}';
          
          window.selectAmount = function(btn, amount) {
            document.querySelectorAll('.sz-amount-btn').forEach(b => b.classList.remove('sz-amount-btn-active'));
            btn.classList.add('sz-amount-btn-active');
            selectedAmount = amount;
          };
          
          window.selectChain = function(chain) {
            selectedChain = chain;
            document.querySelectorAll('.sz-chain-option').forEach(el => {
              el.classList.remove('sz-chain-selected');
              el.style.borderColor = '#e5e7eb';
            });
            document.querySelector('[data-chain="'+chain+'"]').classList.add('sz-chain-selected');
            document.querySelector('[data-chain="'+chain+'"]').style.borderColor = '${primaryColor}';
          };
          
          window.selectToken = function(token) {
            selectedToken = token;
            document.querySelectorAll('.sz-token-option').forEach(el => {
              el.classList.remove('sz-token-selected');
              el.style.borderColor = '#e5e7eb';
            });
            document.querySelector('[data-token="'+token+'"]').classList.add('sz-token-selected');
            document.querySelector('[data-token="'+token+'"]').style.borderColor = '${primaryColor}';
          };
          
          window.handleTip = async function() {
            var btn = document.getElementById('sz-tip-btn');
            var body = document.getElementById('sz-tip-body');
            btn.disabled = true;
            body.innerHTML = '<div class="sz-processing"><div class="sz-spinner"></div><div style="color: #6b7280; font-size: 14px;">Processing tip...</div></div>';
            
            try {
              // TODO: Integrate with ChainRails for cross-chain payment
              // Simulate successful tip for now
              await new Promise(r => setTimeout(r, 1500));
              var hash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
              body.innerHTML = buildSuccess(selectedAmount, selectedToken, hash, selectedChain);
            } catch(e) {
              body.innerHTML = '<div style="padding: 16px; color: #dc2626; font-size: 14px; text-align: center;">Failed to process tip. Please try again.</div>';
              btn.disabled = false;
            }
          };
          
          window.buildSuccess = function(amount, token, hash, chain) {
            return '<div class="sz-success"><div class="sz-checkmark">✓</div><div style="font-size: 16px; font-weight: 600; color: #111;">Tip sent!</div><div style="font-size: 13px; color: #6b7280;">' + amount + ' ' + token + ' via ' + chain.charAt(0).toUpperCase() + chain.slice(1) + '</div><div style="font-size: 12px; color: #9ca3af; word-break: break-all;">' + hash + '</div><button class="sz-handle-tip" onclick="resetTip()">Send another tip</button></div>';
          };
          
          window.resetTip = function() {
            location.reload();
          };
        })();
      </script>
    </div>`;
  }

  private renderForm(): string {
    const { primaryColor, bgColor, textColor, buttonRadius, fontSize } = this.styles;

    if (this.config.showAmountSelector !== false) {
      const buttonsHtml = this.config.suggestedAmounts
        .map((amount, idx) => `
          <button class="sz-amount-btn ${idx === 0 ? 'sz-amount-btn-active' : ''}" 
                  data-amount="${amount}" 
                  onclick="selectAmount(this, '${amount}')"
                  style="padding: 8px 16px; border: 1px solid #e5e7eb; border-radius: ${buttonRadius}; background: ${bgColor}; color: ${textColor}; cursor: pointer; font-size: ${fontSize};">
            ${amount} ${this.state.selectedToken}
          </button>`)
        .join('');

      return `
        ${this.config.showChainSelector !== false ? `
        <div class="sz-section-title">Chain</div>
        <div class="sz-row" style="flex-wrap: wrap;">
          ${this.config.chains.map(chain => `
            <div class="sz-chain-option ${chain === this.state.selectedChain ? 'sz-chain-selected' : ''}" 
                 data-chain="${chain}"
                 onclick="selectChain('${chain}')"
                 style="display: flex; align-items: center; gap: 6px; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: ${buttonRadius}; cursor: pointer; ${chain === this.state.selectedChain ? `border-color: ${primaryColor};` : ''}">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: ${CHAIN_CONFIGS[chain as ChainId]?.color || '#666'};"></span>
              <span style="font-size: 12px; color: ${textColor};">${CHAIN_CONFIGS[chain as ChainId]?.name || chain}</span>
            </div>`).join('')}
        </div>` : ''}
        
        ${this.config.showTokenSelector !== false ? `
        <div class="sz-section-title">Token</div>
        <div class="sz-row" style="flex-wrap: wrap;">
          ${this.config.tokens.map(token => `
            <div class="sz-token-option ${token === this.state.selectedToken ? 'sz-token-selected' : ''}" 
                 data-token="${token}"
                 onclick="selectToken('${token}')"
                 style="display: flex; align-items: center; gap: 6px; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: ${buttonRadius}; cursor: pointer; ${token === this.state.selectedToken ? `border-color: ${primaryColor};` : ''}">
              <span style="font-weight: 600; font-size: 12px; color: ${textColor};">${token}</span>
            </div>`).join('')}
        </div>` : ''}
        
        <div class="sz-section-title">Amount</div>
        <div class="sz-row" style="flex-wrap: wrap;">
          ${buttonsHtml}
        </div>
        <input type="number" class="sz-custom-amount" placeholder="Or enter custom amount" min="0" step="0.01"
               style="width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: ${buttonRadius}; font-size: ${fontSize}; color: ${textColor}; margin-top: 12px;"
               oninput="selectedAmount = this.value">
        <div class="sz-to-row">
          <span>→</span>
          <span style="font-family: monospace;">${this.creatorAddress.slice(0, 8)}...${this.creatorAddress.slice(-6)}</span>
        </div>
        <button id="sz-tip-btn" class="sz-tip-btn" onclick="handleTip()" style="${this.getButtonStyle()}">
          Tip ${this.state.amount} ${this.state.selectedToken}
        </button>`;
    }

    return `
      <div class="sz-section-title">Amount</div>
      <input type="number" class="sz-custom-amount" placeholder="Enter amount" min="0" step="0.01"
             style="width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: ${buttonRadius}; font-size: ${fontSize}; color: ${textColor}; margin-top: 12px;"
             oninput="selectedAmount = this.value">
      <button id="sz-tip-btn" class="sz-tip-btn" onclick="handleTip()" style="${this.getButtonStyle()}">
        Tip
      </button>`;
  }

  private renderSuccess(): string {
    const { primaryColor } = this.styles;
    return `
      <div class="sz-success">
        <div class="sz-checkmark">✓</div>
        <div style="font-size: 16px; font-weight: 600; color: #111;">Tip sent!</div>
        <div style="font-size: 13px; color: #6b7280;">${this.state.amount} ${this.state.selectedToken} via ${this.state.selectedChain}</div>
        <div style="font-size: 12px; color: #9ca3af; word-break: break-all;">${this.state.transactionHash}</div>
        <button class="sz-handle-tip" onclick="resetTip()" style="background: none; border: none; color: ${primaryColor}; cursor: pointer; font-size: 12px; text-decoration: underline;">Send another tip</button>
      </div>`;
  }

  getState(): TipState {
    return { ...this.state };
  }
}

export function createTipButtonHTML(config: TipButtonConfig, creatorAddress: string, displayName: string): string {
  const tipButton = new TipButton(config, creatorAddress, displayName);
  return tipButton.render();
}
