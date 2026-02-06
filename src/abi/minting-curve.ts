export const ABI = [
  {
    type: "impl",
    name: "MintingImpl",
    interface_name: "staking::minting_curve::interface::IMintingCurve",
  },
  {
    type: "interface",
    name: "staking::minting_curve::interface::IMintingCurve",
    items: [
      {
        type: "function",
        name: "yearly_mint",
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
