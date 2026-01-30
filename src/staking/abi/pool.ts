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
] as const;
