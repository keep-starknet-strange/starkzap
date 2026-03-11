import {
  Amount,
  type BridgeToken,
  ConnectedEthereumWallet,
  type CCTPDepositFeeEstimation,
  type Eip1193Provider,
  Erc20,
  type EthereumDepositFeeEstimation,
  EthereumBridgeToken,
  ExternalChain,
  fromEthereumAddress,
  Protocol,
  type StarkZap,
  type ChainId,
  type WalletInterface,
} from "starkzap";
import { createAppKit, type AppKit } from "@reown/appkit";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { sepolia, mainnet } from "@reown/appkit/networks";

type LogFn = (
  message: string,
  type?: "info" | "success" | "error" | "default"
) => void;
type RenderFn = () => void;

export interface BridgeState {
  direction: "to-starknet" | "from-starknet";
  tokens: BridgeToken[];
  selectedToken: BridgeToken | null;
  connectedEthWallet: ConnectedEthereumWallet | undefined;
  starknetBalance: string | null;
  starknetBalanceLoading: boolean;
  externalBalance: string | null;
  externalBalanceUnit: string | null;
  externalBalanceLoading: boolean;
  allowance: string | null;
  allowanceLoading: boolean;
  feeEstimate: EthereumDepositFeeEstimation | null;
  feeLoading: boolean;
  fastTransfer: boolean;
  tokensLoading: boolean;
  refreshing: boolean;
  error: string | null;
}

function initialState(): BridgeState {
  return {
    direction: "to-starknet",
    tokens: [],
    selectedToken: null,
    connectedEthWallet: undefined,
    starknetBalance: null,
    starknetBalanceLoading: false,
    externalBalance: null,
    externalBalanceUnit: null,
    externalBalanceLoading: false,
    allowance: null,
    allowanceLoading: false,
    feeEstimate: null,
    feeLoading: false,
    fastTransfer: false,
    tokensLoading: false,
    refreshing: false,
    error: null,
  };
}

export function initializeAppKit(projectId: string): AppKit {
  const ethersAdapter = new EthersAdapter();

  return createAppKit({
    adapters: [ethersAdapter],
    networks: [mainnet, sepolia],
    projectId,
    metadata: {
      name: "StarkZap Web Example",
      description: "Bridge assets to and from Starknet",
      url: "https://starkzap.io/",
      icons: ["https://starkzap.io/logo.png"],
    },
    features: {
      swaps: false,
      onramp: false,
    },
  });
}

export class BridgeController {
  private state: BridgeState = initialState();
  private starknetWallet: WalletInterface | null = null;

  constructor(
    private readonly sdk: StarkZap,
    private readonly chainId: ChainId,
    private readonly log: LogFn,
    private readonly render: RenderFn
  ) {}

  getState(): Readonly<BridgeState> {
    return this.state;
  }

  setStarknetWallet(wallet: WalletInterface | null): void {
    this.starknetWallet = wallet;
    if (!wallet) {
      this.state = initialState();
    }
    this.render();
    if (wallet && this.state.tokens.length === 0) {
      this.fetchTokens();
    }
  }

  connectEthereumWallet(
    provider: Eip1193Provider,
    address: string,
    walletChainId: string
  ): void {
    try {
      const wallet = ConnectedEthereumWallet.from(
        {
          chain: ExternalChain.ETHEREUM,
          provider,
          address: fromEthereumAddress(address),
          chainId: walletChainId,
        },
        this.chainId
      );
      this.state.connectedEthWallet = wallet;
      this.log(
        `Ethereum wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`,
        "success"
      );
      this.render();
      this.fetchTokens();
    } catch (err) {
      this.log(`Failed to connect Ethereum wallet: ${err}`, "error");
    }
  }

  disconnectEthWallet(): void {
    this.state.connectedEthWallet = undefined;
    this.state.externalBalance = null;
    this.state.externalBalanceUnit = null;
    this.state.allowance = null;
    this.state.feeEstimate = null;
    this.log("Ethereum wallet disconnected", "info");
    this.render();
  }

  setDirection(dir: "to-starknet" | "from-starknet"): void {
    this.state.direction = dir;
    this.state.starknetBalance = null;
    this.state.externalBalance = null;
    this.state.externalBalanceUnit = null;
    this.state.allowance = null;
    this.state.feeEstimate = null;
    this.state.fastTransfer = false;
    this.render();
    this.fetchStarknetBalance();
    this.fetchExternalBalance();
    if (dir === "to-starknet") {
      this.fetchAllowance();
      this.fetchFeeEstimate();
    }
  }

  toggleDirection(): void {
    this.setDirection(
      this.state.direction === "to-starknet" ? "from-starknet" : "to-starknet"
    );
  }

  selectToken(tokenId: string | null): void {
    const token = tokenId
      ? (this.state.tokens.find((t) => t.id === tokenId) ?? null)
      : null;
    this.state.selectedToken = token;
    this.state.starknetBalance = null;
    this.state.externalBalance = null;
    this.state.externalBalanceUnit = null;
    this.state.allowance = null;
    this.state.feeEstimate = null;
    this.state.fastTransfer = false;
    this.render();
    if (token) {
      this.fetchStarknetBalance();
      this.fetchExternalBalance();
      if (this.state.direction === "to-starknet") {
        this.fetchAllowance();
        this.fetchFeeEstimate();
      }
    }
  }

  setFastTransfer(value: boolean): void {
    this.state.fastTransfer = value;
    this.render();
    this.fetchFeeEstimate();
  }

  async fetchTokens(): Promise<void> {
    this.state.tokensLoading = true;
    this.state.error = null;
    this.render();

    try {
      const tokens = await this.sdk.getBridgingTokens(ExternalChain.ETHEREUM);
      this.state.tokens = tokens;
      this.state.tokensLoading = false;
      this.log(`Loaded ${tokens.length} bridge tokens`, "success");
      this.render();
    } catch (err) {
      this.state.tokensLoading = false;
      this.state.error = String(err);
      this.log(`Failed to load bridge tokens: ${err}`, "error");
      this.render();
    }
  }

  private starknetErc20(token: BridgeToken): Erc20 {
    return new Erc20(
      {
        name: token.name,
        address: token.starknetAddress,
        decimals: token.decimals,
        symbol: token.symbol,
      },
      this.sdk.getProvider()
    );
  }

  async fetchStarknetBalance(): Promise<void> {
    const { selectedToken } = this.state;
    const wallet = this.starknetWallet;

    if (!selectedToken || !wallet) {
      this.state.starknetBalance = null;
      this.render();
      return;
    }

    this.state.starknetBalanceLoading = true;
    this.render();

    try {
      const erc20 = this.starknetErc20(selectedToken);
      const balance = await erc20.balanceOf(wallet);
      this.state.starknetBalance = balance.toFormatted(true);
    } catch (err) {
      this.log(`Failed to fetch Starknet balance: ${err}`, "error");
      this.state.starknetBalance = null;
    }

    this.state.starknetBalanceLoading = false;
    this.render();
  }

  async fetchExternalBalance(): Promise<void> {
    const { selectedToken, connectedEthWallet } = this.state;
    const wallet = this.starknetWallet;

    if (!selectedToken || !wallet || !connectedEthWallet) {
      this.state.externalBalance = null;
      this.state.externalBalanceUnit = null;
      this.render();
      return;
    }

    this.state.externalBalanceLoading = true;
    this.render();

    try {
      const balance = await wallet.getDepositBalance(
        selectedToken as EthereumBridgeToken,
        connectedEthWallet
      );
      this.state.externalBalance = balance ? balance.toFormatted(true) : null;
      this.state.externalBalanceUnit = balance ? balance.toUnit() : null;
    } catch (err) {
      this.log(
        `Failed to fetch ${selectedToken.chain} balance: ${err}`,
        "error"
      );
      this.state.externalBalance = null;
      this.state.externalBalanceUnit = null;
    }

    this.state.externalBalanceLoading = false;
    this.render();
  }

  async refresh(): Promise<void> {
    if (!this.state.selectedToken) return;

    this.state.refreshing = true;
    this.render();

    await Promise.allSettled([
      this.fetchStarknetBalance(),
      this.fetchExternalBalance(),
      this.state.direction === "to-starknet"
        ? this.fetchAllowance()
        : Promise.resolve(),
    ]);

    this.state.refreshing = false;
    this.render();
  }

  async fetchAllowance(): Promise<void> {
    const { selectedToken, direction, connectedEthWallet } = this.state;
    const wallet = this.starknetWallet;

    if (
      !selectedToken ||
      direction !== "to-starknet" ||
      !connectedEthWallet ||
      !wallet
    ) {
      this.state.allowance = null;
      this.render();
      return;
    }

    this.state.allowanceLoading = true;
    this.render();

    try {
      const allowance = await wallet.getAllowance(
        selectedToken as EthereumBridgeToken,
        connectedEthWallet
      );
      this.state.allowance = allowance ? allowance.toFormatted(true) : null;
    } catch (err) {
      this.log(`Failed to fetch allowance: ${err}`, "error");
      this.state.allowance = null;
    }

    this.state.allowanceLoading = false;
    this.render();
  }

  async fetchFeeEstimate(): Promise<void> {
    const { selectedToken, direction, connectedEthWallet, fastTransfer } =
      this.state;
    const wallet = this.starknetWallet;

    if (
      !wallet ||
      !selectedToken ||
      direction !== "to-starknet" ||
      selectedToken.chain !== ExternalChain.ETHEREUM ||
      !connectedEthWallet
    ) {
      this.state.feeEstimate = null;
      this.render();
      return;
    }

    this.state.feeLoading = true;
    this.render();

    try {
      const estimate = await wallet.getDepositFeeEstimate(
        selectedToken as EthereumBridgeToken,
        connectedEthWallet,
        { fastTransfer }
      );
      this.state.feeEstimate = estimate;
    } catch (err) {
      this.log(`Failed to estimate fees: ${err}`, "error");
      this.state.feeEstimate = null;
    }

    this.state.feeLoading = false;
    this.render();
  }

  async deposit(amountStr: string): Promise<void> {
    const { selectedToken, connectedEthWallet, fastTransfer } = this.state;
    const wallet = this.starknetWallet;

    if (!wallet || !selectedToken || !connectedEthWallet) {
      this.log("Missing wallet or token for deposit", "error");
      return;
    }

    this.log(
      `Depositing ${amountStr} ${selectedToken.symbol} to Starknet...`,
      "info"
    );

    try {
      const depositAmount = Amount.parse(
        amountStr,
        selectedToken.decimals,
        selectedToken.symbol
      );

      const txResponse = await wallet.deposit(
        wallet.address,
        depositAmount,
        selectedToken as EthereumBridgeToken,
        connectedEthWallet,
        { fastTransfer }
      );
      this.log(`Deposit tx sent: ${txResponse.hash}`, "success");
    } catch (err) {
      this.log(`Deposit failed: ${err}`, "error");
    }
  }

  isCCTP(): boolean {
    return this.state.selectedToken?.protocol === Protocol.CCTP;
  }
}

export function formatFeeEstimate(
  estimate: EthereumDepositFeeEstimation
): string {
  const lines: string[] = [];

  lines.push(
    `L1 Gas: ${estimate.l1Fee.toFormatted(false)}${estimate.l1FeeError ? " (est.)" : ""}`
  );
  lines.push(
    `L2 Msg: ${estimate.l2Fee.toFormatted(false)}${estimate.l2FeeError ? " (est.)" : ""}`
  );
  lines.push(
    `Approval: ${estimate.approvalFee.toFormatted(false)}${estimate.approvalFeeError ? " (est.)" : ""}`
  );

  const cctp = estimate as CCTPDepositFeeEstimation;
  if (cctp.fastTransferBpFee !== undefined) {
    lines.push(
      `Fast Transfer Fee: ${(cctp.fastTransferBpFee / 100).toFixed(2)}%`
    );
  }

  return lines.join("\n");
}
