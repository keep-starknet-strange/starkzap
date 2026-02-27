import { type SDKConfig, StarkSDK as CoreStarkSDK } from "starkzap";

export class StarkSDK extends CoreStarkSDK {
  constructor(config: SDKConfig) {
    super(config);
  }
}

export { StarkSDK as StarkZap };
