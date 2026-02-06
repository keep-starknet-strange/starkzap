export const ABI = [
  {
    type: "impl",
    name: "RewardSupplierImpl",
    interface_name: "staking::reward_supplier::interface::IRewardSupplier",
  },
  {
    type: "interface",
    name: "staking::reward_supplier::interface::IRewardSupplier",
    items: [
      {
        type: "function",
        name: "get_alpha",
        inputs: [],
        outputs: [
          {
            type: "core::integer::u128",
          },
        ],
        state_mutability: "view",
      },
    ],
  },
] as const;
