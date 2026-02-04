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
      {
        type: "function",
        name: "get_total_stake",
        inputs: [],
        outputs: [
          {
            type: "core::integer::u128",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_total_stake_for_token",
        inputs: [
          {
            name: "token_address",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [
          {
            type: "core::integer::u128",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "contract_parameters_v1",
        inputs: [],
        outputs: [
          {
            type: "staking::staking::interface::StakingContractInfoV1",
          },
        ],
        state_mutability: "view",
      },
    ],
  },
  {
    type: "struct",
    name: "staking::staking::interface::StakingContractInfoV1",
    members: [
      {
        name: "min_stake",
        type: "core::integer::u128",
      },
      {
        name: "token_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "attestation_contract",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "pool_contract_class_hash",
        type: "core::starknet::class_hash::ClassHash",
      },
      {
        name: "reward_supplier",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "exit_wait_window",
        type: "starkware_utils::types::time::time::TimeDelta",
      },
    ],
  },
  {
    type: "struct",
    name: "starkware_utils::types::time::time::TimeDelta",
    members: [
      {
        name: "seconds",
        type: "core::integer::u64",
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
