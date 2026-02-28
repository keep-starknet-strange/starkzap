// ERC1155 ABI types and constants
export const ERC1155_INTERFACE_ID = "0x4e2312e0";

/**
 * ERC1155 ABI - minimal required entrypoints.
 */
export const ERC1155_ABI = [
  // ERC165
  {
    name: "supportsInterface",
    type: "function",
    inputs: [{ name: "interface_id", type: "felt" }],
    outputs: [{ name: "supported", type: "Bool" }],
    stateMutability: "view",
  },
  // Metadata
  {
    name: "uri",
    type: "function",
    inputs: [{ name: "id", type: "Uint256" }],
    outputs: [{ name: "uri", type: "felt" }],
    stateMutability: "view",
  },
  // Token operations
  {
    name: "balanceOf",
    type: "function",
    inputs: [
      { name: "account", type: "felt" },
      { name: "id", type: "Uint256" },
    ],
    outputs: [{ name: "balance", type: "Uint256" }],
    stateMutability: "view",
  },
  {
    name: "balanceOfBatch",
    type: "function",
    inputs: [
      { name: "accounts_len", type: "felt" },
      { name: "accounts", type: "felt*" },
      { name: "ids_len", type: "felt" },
      { name: "ids", type: "Uint256*" },
    ],
    outputs: [{ name: "balances", type: "Uint256*" }],
    stateMutability: "view",
  },
  // Transfers
  {
    name: "safeTransferFrom",
    type: "function",
    inputs: [
      { name: "from", type: "felt" },
      { name: "to", type: "felt" },
      { name: "id", type: "Uint256" },
      { name: "value", type: "Uint256" },
      { name: "data_len", type: "felt" },
      { name: "data", type: "felt*" },
    ],
    outputs: [],
    stateMutability: "",
  },
  {
    name: "safeBatchTransferFrom",
    type: "function",
    inputs: [
      { name: "from", type: "felt" },
      { name: "to", type: "felt" },
      { name: "ids_len", type: "felt" },
      { name: "ids", type: "Uint256*" },
      { name: "amounts_len", type: "felt" },
      { name: "amounts", type: "Uint256*" },
      { name: "data_len", type: "felt" },
      { name: "data", type: "felt*" },
    ],
    outputs: [],
    stateMutability: "",
  },
  // Approvals
  {
    name: "setApprovalForAll",
    type: "function",
    inputs: [
      { name: "operator", type: "felt" },
      { name: "approved", type: "Bool" },
    ],
    outputs: [],
    stateMutability: "",
  },
  {
    name: "isApprovedForAll",
    type: "function",
    inputs: [
      { name: "account", type: "felt" },
      { name: "operator", type: "felt" },
    ],
    outputs: [{ name: "is_approved", type: "Bool" }],
    stateMutability: "view",
  },
] as const;

/**
 * ERC1155 ABI as plain object for contract interactions.
 */
export const erc1155Abi: Array<{
  name: string;
  type: string;
  inputs?: Array<{ name: string; type: string }>;
  outputs?: Array<{ name: string; type: string }>;
  stateMutability?: string;
}> = [
  {
    name: "supportsInterface",
    type: "function",
    inputs: [{ name: "interface_id", type: "felt" }],
    outputs: [{ name: "supported", type: "Bool" }],
    stateMutability: "view",
  },
  {
    name: "uri",
    type: "function",
    inputs: [{ name: "id", type: "Uint256" }],
    outputs: [{ name: "uri", type: "felt" }],
    stateMutability: "view",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [
      { name: "account", type: "felt" },
      { name: "id", type: "Uint256" },
    ],
    outputs: [{ name: "balance", type: "Uint256" }],
    stateMutability: "view",
  },
  {
    name: "balanceOfBatch",
    type: "function",
    inputs: [
      { name: "accounts_len", type: "felt" },
      { name: "accounts", type: "felt*" },
      { name: "ids_len", type: "felt" },
      { name: "ids", type: "Uint256*" },
    ],
    outputs: [{ name: "balances", type: "Uint256*" }],
    stateMutability: "view",
  },
  {
    name: "safeTransferFrom",
    type: "function",
    inputs: [
      { name: "from", type: "felt" },
      { name: "to", type: "felt" },
      { name: "id", type: "Uint256" },
      { name: "value", type: "Uint256" },
      { name: "data_len", type: "felt" },
      { name: "data", type: "felt*" },
    ],
    outputs: [],
  },
  {
    name: "safeBatchTransferFrom",
    type: "function",
    inputs: [
      { name: "from", type: "felt" },
      { name: "to", type: "felt" },
      { name: "ids_len", type: "felt" },
      { name: "ids", type: "Uint256*" },
      { name: "amounts_len", type: "felt" },
      { name: "amounts", type: "Uint256*" },
      { name: "data_len", type: "felt" },
      { name: "data", type: "felt*" },
    ],
    outputs: [],
  },
  {
    name: "setApprovalForAll",
    type: "function",
    inputs: [
      { name: "operator", type: "felt" },
      { name: "approved", type: "Bool" },
    ],
    outputs: [],
  },
  {
    name: "isApprovedForAll",
    type: "function",
    inputs: [
      { name: "account", type: "felt" },
      { name: "operator", type: "felt" },
    ],
    outputs: [{ name: "is_approved", type: "Bool" }],
    stateMutability: "view",
  },
];
