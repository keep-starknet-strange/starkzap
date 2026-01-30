export const ABI = [
  {
    type: "interface",
    name: "staking::staking::interface::IStaking",
    items: [
      {
        type: "function",
        name: "staker_pool_info",
        inputs: [
          {
            name: "staker_address",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [
          {
            type: "staking::staking::interface::StakerPoolInfoV2",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_active_tokens",
        inputs: [],
        outputs: [
          {
            type: "core::array::Span::<core::starknet::contract_address::ContractAddress>",
          },
        ],
        state_mutability: "view",
      },
    ],
  },
  {
    type: "struct",
    name: "staking::staking::interface::StakerPoolInfoV2",
    members: [
      {
        name: "commission",
        type: "core::option::Option::<core::integer::u16>",
      },
      {
        name: "pools",
        type: "core::array::Span::<staking::staking::interface::PoolInfo>",
      },
    ],
  },
  {
    type: "struct",
    name: "staking::staking::interface::PoolInfo",
    members: [
      {
        name: "pool_contract",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "token_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "amount",
        type: "core::integer::u128",
      },
    ],
  },
  {
    type: "impl",
    name: "StakingImpl",
    interface_name: "staking::staking::interface::IStaking",
  },
  {
    type: "enum",
    name: "core::option::Option::<core::integer::u16>",
    variants: [
      {
        name: "Some",
        type: "core::integer::u16",
      },
      {
        name: "None",
        type: "()",
      },
    ],
  },
  {
    type: "struct",
    name: "core::array::Span::<staking::staking::interface::PoolInfo>",
    members: [
      {
        name: "snapshot",
        type: "@core::array::Array::<staking::staking::interface::PoolInfo>",
      },
    ],
  },
  {
    type: "struct",
    name: "core::array::Span::<core::starknet::contract_address::ContractAddress>",
    members: [
      {
        name: "snapshot",
        type: "@core::array::Array::<core::starknet::contract_address::ContractAddress>",
      },
    ],
  },
] as const;
