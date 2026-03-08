/**
 * ABI for Vesu Reward Distributor contracts.
 *
 * These contracts handle STRK reward distribution from Starknet Foundation
 * programs like DeFi Spring and BTCFi Season.
 */
export const DISTRIBUTOR_ABI = [
  {
    type: "function",
    name: "get_claimable",
    inputs: [
      {
        name: "user",
        type: "core::starknet::contract_address::ContractAddress",
      },
    ],
    outputs: [
      {
        type: "core::integer::u256",
      },
    ],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "get_claimed",
    inputs: [
      {
        name: "user",
        type: "core::starknet::contract_address::ContractAddress",
      },
    ],
    outputs: [
      {
        type: "core::integer::u256",
      },
    ],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "claim",
    inputs: [
      {
        name: "recipient",
        type: "core::starknet::contract_address::ContractAddress",
      },
    ],
    outputs: [
      {
        type: "core::integer::u256",
      },
    ],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "reward_token",
    inputs: [],
    outputs: [
      {
        type: "core::starknet::contract_address::ContractAddress",
      },
    ],
    state_mutability: "view",
  },
  {
    type: "struct",
    name: "core::integer::u256",
    members: [
      {
        name: "low",
        type: "core::integer::u128",
      },
      {
        name: "high",
        type: "core::integer::u128",
      },
    ],
  },
] as const;

/**
 * ABI type for the distributor contract.
 */
export type DistributorABI = typeof DISTRIBUTOR_ABI;
