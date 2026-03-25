import { Amount, type EthereumAddress, EthereumBridgeToken } from "@/types";
import {
  Contract,
  type ContractTransaction,
  getAddress,
  type Provider,
  type Signer,
} from "ethers";
import ERC20_ABI from "@/abi/ethereum/erc20.json";
import { type EthereumWalletConfig } from "@/bridge/ethereum/types";
import { fromEthereumAddress } from "@/connect/ethersRuntime";

export async function ethereumAddress(
  contract: Contract
): Promise<EthereumAddress> {
  const target = contract.target;
  const address =
    typeof target === "string" ? target : await target.getAddress();
  return fromEthereumAddress(address, { getAddress });
}

export type EthereumTokenInterface = {
  name(): Promise<string>;
  symbol(): Promise<string>;
  decimals(): Promise<number>;
  balanceOf(account: EthereumAddress): Promise<Amount>;
  allowance(
    owner: EthereumAddress,
    spender: EthereumAddress
  ): Promise<Amount | null>;
  getContract(signer?: Signer | undefined): Contract | null;
  approve(
    spender: EthereumAddress,
    amount: Amount,
    signer: Signer
  ): Promise<ContractTransaction | null>;
  amount(from: bigint): Promise<Amount>;
  isNativeEth(): boolean;
};

export function intoEthereumToken(
  bridgeToken: EthereumBridgeToken,
  config: EthereumWalletConfig
): EthereumTokenInterface {
  return bridgeToken.id === "eth"
    ? EtherToken.create(config.provider)
    : ERC20EthereumToken.create(bridgeToken.address, config.provider);
}

export class ERC20EthereumToken implements EthereumTokenInterface {
  private _metadata?: Promise<{
    name: string;
    symbol: string;
    decimals: number;
  }>;

  public static create(address: EthereumAddress, provider: Provider) {
    const contract = new Contract(address, ERC20_ABI, provider);
    return new ERC20EthereumToken(contract);
  }

  constructor(private readonly contract: Contract) {}

  private metadata() {
    this._metadata ??= Promise.all([
      this.contract.getFunction("name")() as Promise<string>,
      this.contract.getFunction("symbol")() as Promise<string>,
      this.contract.getFunction("decimals")() as Promise<bigint>,
    ]).then(([name, symbol, decimals]) => {
      return {
        name,
        symbol,
        decimals: Number(decimals),
      };
    });
    return this._metadata;
  }

  public async name() {
    return (await this.metadata()).name;
  }

  public async symbol() {
    return (await this.metadata()).symbol;
  }

  public async decimals() {
    return (await this.metadata()).decimals;
  }

  public async balanceOf(account: EthereumAddress) {
    const balance: bigint =
      await this.contract.getFunction("balanceOf")(account);

    return this.amount(balance);
  }

  public async allowance(owner: EthereumAddress, spender: EthereumAddress) {
    const allowance: bigint = await this.contract.getFunction("allowance")(
      owner,
      spender
    );
    return this.amount(allowance);
  }

  public getContract(signer?: Signer): Contract {
    return signer ? (this.contract.connect(signer) as Contract) : this.contract;
  }

  public async approve(
    spender: EthereumAddress,
    amount: Amount,
    signer: Signer
  ): Promise<ContractTransaction> {
    const contract = this.getContract(signer);
    return await contract
      .getFunction("approve")
      .populateTransaction(spender, amount.toBase());
  }

  public async amount(amount: bigint): Promise<Amount> {
    const decimals = await this.decimals();
    const symbol = await this.symbol();
    return Amount.fromRaw(amount, decimals, symbol);
  }

  public isNativeEth() {
    return false;
  }

  public async getAddress(): Promise<EthereumAddress> {
    return ethereumAddress(this.getContract());
  }
}

export class EtherToken implements EthereumTokenInterface {
  public static create(provider: Provider) {
    return new EtherToken(provider);
  }

  private constructor(private readonly _provider: Provider) {}

  public async name() {
    return "Ether";
  }

  public async symbol() {
    return "ETH";
  }

  public async decimals() {
    return 18;
  }

  public async balanceOf(account: EthereumAddress) {
    const amount: bigint = await this._provider.getBalance(account, "pending");
    return this.amount(amount);
  }

  public async amount(amount: bigint): Promise<Amount> {
    return Amount.fromRaw(amount, 18, "ETH");
  }

  async allowance(): Promise<Amount | null> {
    return null;
  }

  async approve(): Promise<null> {
    return null;
  }

  getContract(): null {
    return null;
  }

  isNativeEth() {
    return true;
  }
}
