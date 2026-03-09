import { Amount, type EthereumAddress } from "@/types";
import {
  Contract,
  type ContractTransaction,
  type Provider,
  type Signer,
} from "ethers";
import ERC20_ABI from "@/abi/ethereum/erc20.json";

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

export class ERC20EthereumToken implements EthereumTokenInterface {
  private _name: string = "";
  private _symbol: string = "";
  private _decimals?: number = undefined;

  public static create(address: EthereumAddress, provider: Provider) {
    const contract = new Contract(address, ERC20_ABI, provider);
    return new ERC20EthereumToken(contract);
  }

  constructor(private readonly contract: Contract) {}

  public async name() {
    if (!this._name) {
      this._name = await this.contract.getFunction("name")();
    }
    return this._name;
  }

  public async symbol() {
    if (!this._symbol) {
      this._symbol = await this.contract.getFunction("symbol")();
    }
    return this._symbol;
  }

  public async decimals() {
    if (!this._decimals) {
      this._decimals = Number(await this.contract.getFunction("decimals")());
    }
    return this._decimals;
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

  public getContract(signer?: Signer | undefined): Contract {
    if (signer) {
      return this.contract.connect(signer) as Contract;
    } else {
      return this.contract;
    }
  }

  public async approve(
    spender: EthereumAddress,
    amount: Amount,
    signer: Signer
  ): Promise<ContractTransaction> {
    const contract = this.getContract(signer);
    return await contract
      .getFunction("approve")
      .populateTransaction(spender, amount);
  }

  public async amount(amount: bigint): Promise<Amount> {
    const decimals = await this.decimals();
    const symbol = await this.symbol();
    return Amount.fromRaw(amount, decimals, symbol);
  }

  public isNativeEth() {
    return false;
  }
}

export class EthereumToken implements EthereumTokenInterface {
  public static create(provider: Provider) {
    return new EthereumToken(provider);
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
    const decimals = await this.decimals();
    const symbol = await this.symbol();
    return Amount.fromRaw(amount, decimals, symbol);
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
