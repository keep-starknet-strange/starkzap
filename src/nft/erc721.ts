// ERC721 ABI types and constants
export const ERC721_INTERFACE_ID = "0x80ac58cd";

/**
 * ERC721 ABI - minimal required entrypoints.
 */
export const ERC721_ABI = [
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
    name: "name",
    type: "function",
    inputs: [],
    outputs: [{ name: "name", type: "felt" }],
    stateMutability: "view",
  },
  {
    name: "symbol",
    type: "function",
    inputs: [],
    outputs: [{ name: "symbol", type: "felt" }],
    stateMutability: "view",
  },
  {
    name: "token_uri",
    type: "function",
    inputs: [{ name: "token_id", type: "Uint256" }],
    outputs: [{ name: "token_uri", type: "felt" }],
    stateMutability: "view",
  },
  // Token operations
  {
    name: "ownerOf",
    type: "function",
    inputs: [{ name: "token_id", type: "Uint256" }],
    outputs: [{ name: "owner", type: "felt" }],
    stateMutability: "view",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "owner", type: "felt" }],
    outputs: [{ name: "balance", type: "Uint256" }],
    stateMutability: "view",
  },
  // Transfers
  {
    name: "transferFrom",
    type: "function",
    inputs: [
      { name: "from", type: "felt" },
      { name: "to", type: "felt" },
      { name: "token_id", type: "Uint256" },
    ],
    outputs: [],
    stateMutability: "",
  },
  {
    name: "safeTransferFrom",
    type: "function",
    inputs: [
      { name: "from", type: "felt" },
      { name: "to", type: "felt" },
      { name: "token_id", type: "Uint256" },
      { name: "data_len", type: "felt" },
      { name: "data", type: "felt*" },
    ],
    outputs: [],
    stateMutability: "",
  },
  // Approvals
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "to", type: "felt" },
      { name: "token_id", type: "Uint256" },
    ],
    outputs: [],
    stateMutability: "",
  },
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
    name: "getApproved",
    type: "function",
    inputs: [{ name: "token_id", type: "Uint256" }],
    outputs: [{ name: "approved", type: "felt" }],
    stateMutability: "view",
  },
  {
    name: "isApprovedForAll",
    type: "function",
    inputs: [
      { name: "owner", type: "felt" },
      { name: "operator", type: "felt" },
    ],
    outputs: [{ name: "is_approved", type: "Bool" }],
    stateMutability: "view",
  },
] as const;

/**
 * ERC721 ABI as plain object for contract interactions.
 */
export const erc721Abi: Array<{
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
    name: "name",
    type: "function",
    inputs: [],
    outputs: [{ name: "name", type: "felt" }],
    stateMutability: "view",
  },
  {
    name: "symbol",
    type: "function",
    inputs: [],
    outputs: [{ name: "symbol", type: "felt" }],
    stateMutability: "view",
  },
  {
    name: "token_uri",
    type: "function",
    inputs: [{ name: "token_id", type: "Uint256" }],
    outputs: [{ name: "token_uri", type: "felt" }],
    stateMutability: "view",
  },
  {
    name: "ownerOf",
    type: "function",
    inputs: [{ name: "token_id", type: "Uint256" }],
    outputs: [{ name: "owner", type: "felt" }],
    stateMutability: "view",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "owner", type: "felt" }],
    outputs: [{ name: "balance", type: "Uint256" }],
    stateMutability: "view",
  },
  {
    name: "transferFrom",
    type: "function",
    inputs: [
      { name: "from", type: "felt" },
      { name: "to", type: "felt" },
      { name: "token_id", type: "Uint256" },
    ],
    outputs: [],
  },
  {
    name: "safeTransferFrom",
    type: "function",
    inputs: [
      { name: "from", type: "felt" },
      { name: "to", type: "felt" },
      { name: "token_id", type: "Uint256" },
      { name: "data_len", type: "felt" },
      { name: "data", type: "felt*" },
    ],
    outputs: [],
  },
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "to", type: "felt" },
      { name: "token_id", type: "Uint256" },
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
    name: "getApproved",
    type: "function",
    inputs: [{ name: "token_id", type: "Uint256" }],
    outputs: [{ name: "approved", type: "felt" }],
    stateMutability: "view",
  },
  {
    name: "isApprovedForAll",
    type: "function",
    inputs: [
      { name: "owner", type: "felt" },
      { name: "operator", type: "felt" },
    ],
    outputs: [{ name: "is_approved", type: "Bool" }],
    stateMutability: "view",
  },
];
