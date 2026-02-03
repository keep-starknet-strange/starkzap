export const ABI = [
  {
    type: "interface",
    name: "staking::pool::interface::IPool",
    items: [
      {
        type: "function",
        name: "contract_parameters_v1",
        inputs: [],
        outputs: [
          {
            type: "staking::pool::interface::PoolContractInfoV1",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_pool_member_info_v1",
        inputs: [
          {
            name: "pool_member",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [
          {
            type: "core::option::Option::<staking::pool::interface::PoolMemberInfoV1>",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "enter_delegation_pool",
        inputs: [
          {
            name: "reward_address",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "amount",
            type: "core::integer::u128",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "add_to_delegation_pool",
        inputs: [
          {
            name: "pool_member",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "amount",
            type: "core::integer::u128",
          },
        ],
        outputs: [
          {
            type: "core::integer::u128",
          },
        ],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "exit_delegation_pool_intent",
        inputs: [
          {
            name: "amount",
            type: "core::integer::u128",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "exit_delegation_pool_action",
        inputs: [
          {
            name: "pool_member",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [
          {
            type: "core::integer::u128",
          },
        ],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "claim_rewards",
        inputs: [
          {
            name: "pool_member",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [
          {
            type: "core::integer::u128",
          },
        ],
        state_mutability: "external",
      },
    ],
  },
  {
    type: "struct",
    name: "staking::pool::interface::PoolContractInfoV1",
    members: [
      {
        name: "staker_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "staker_removed",
        type: "core::bool",
      },
      {
        name: "staking_contract",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "token_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "commission",
        type: "core::integer::u16",
      },
    ],
  },
  {
    type: "enum",
    name: "core::option::Option::<staking::pool::interface::PoolMemberInfoV1>",
    variants: [
      {
        name: "Some",
        type: "staking::pool::interface::PoolMemberInfoV1",
      },
      {
        name: "None",
        type: "()",
      },
    ],
  },
  {
    type: "struct",
    name: "staking::pool::interface::PoolMemberInfoV1",
    members: [
      {
        name: "reward_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "amount",
        type: "core::integer::u128",
      },
      {
        name: "unclaimed_rewards",
        type: "core::integer::u128",
      },
      {
        name: "commission",
        type: "core::integer::u16",
      },
      {
        name: "unpool_amount",
        type: "core::integer::u128",
      },
      {
        name: "unpool_time",
        type: "core::option::Option::<starkware_utils::types::time::time::Timestamp>",
      },
    ],
  },
  {
    type: "enum",
    name: "core::option::Option::<starkware_utils::types::time::time::Timestamp>",
    variants: [
      {
        name: "Some",
        type: "starkware_utils::types::time::time::Timestamp",
      },
      {
        name: "None",
        type: "()",
      },
    ],
  },
  {
    type: "struct",
    name: "starkware_utils::types::time::time::Timestamp",
    members: [
      {
        name: "seconds",
        type: "core::integer::u64",
      },
    ],
  },
] as const;
