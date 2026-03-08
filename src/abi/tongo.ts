/**
 * Minimal ABI for Tongo confidential payment contract.
 *
 * The Tongo contract provides confidential ERC20 transfers using
 * ElGamal encryption and zero-knowledge proofs.
 *
 * @see https://docs.tongo.cash/
 */
export const ABI = [
  // Account state query
  {
    "name": "get_account",
    "type": "function",
    "inputs": [
      {
        "name": "public_key",
        "type": "struct",
        "members": [
          { "name": "x", "type": "felt252" },
          { "name": "y", "type": "felt252" }
        ]
      }
    ],
    "outputs": [
      {
        "type": "struct",
        "members": [
          { "name": "current_balance", "type": "CipherBalance" },
          { "name": "pending_balance", "type": "CipherBalance" },
          { "name": "nonce", "type": "felt252" },
          { "name": "ae_balance", "type": "Option<AEBalance>" }
        ]
      }
    ],
    "state_mutability": "view"
  },
  // Fund operation - convert ERC20 to Tongo
  {
    "name": "fund",
    "type": "function",
    "inputs": [
      { "name": "amount", "type": "Uint256" }
    ],
    "outputs": [],
    "state_mutability": "external"
  },
  // Transfer operation - confidential transfer
  {
    "name": "transfer",
    "type": "function",
    "inputs": [
      {
        "name": "recipient",
        "type": "struct",
        "members": [
          { "name": "x", "type": "felt252" },
          { "name": "y", "type": "felt252" }
        ]
      },
      { "name": "amount", "type": "Uint256" },
      {
        "name": "proof",
        "type": "struct",
        "members": [
          { "name": "A_x", "type": "Point" },
          { "name": "A_r", "type": "Point" },
          { "name": "A_v", "type": "Point" },
          { "name": "sx", "type": "felt252" },
          { "name": "sb", "type": "felt252" },
          { "name": "sr", "type": "felt252" },
          { "name": "range", "type": "RangeProof" }
        ]
      },
      {
        "name": "cipher_for_sender",
        "type": "struct",
        "members": [
          { "name": "L", "type": "Point" },
          { "name": "R", "type": "Point" }
        ]
      },
      {
        "name": "cipher_for_recipient",
        "type": "struct",
        "members": [
          { "name": "L", "type": "Point" },
          { "name": "R", "type": "Point" }
        ]
      }
    ],
    "outputs": [],
    "state_mutability": "external"
  },
  // Withdraw operation - convert Tongo to ERC20
  {
    "name": "withdraw",
    "type": "function",
    "inputs": [
      { "name": "to", "type": "ContractAddress" },
      { "name": "amount", "type": "Uint256" },
      {
        "name": "proof",
        "type": "struct",
        "members": [
          { "name": "A_x", "type": "Point" },
          { "name": "A_r", "type": "Point" },
          { "name": "A", "type": "Point" },
          { "name": "A_v", "type": "Point" },
          { "name": "sx", "type": "felt252" },
          { "name": "sb", "type": "felt252" },
          { "name": "sr", "type": "felt252" },
          { "name": "range", "type": "RangeProof" }
        ]
      }
    ],
    "outputs": [],
    "state_mutability": "external"
  },
  // Rollover - move pending to current balance
  {
    "name": "rollover",
    "type": "function",
    "inputs": [
      {
        "name": "proof",
        "type": "struct",
        "members": [
          { "name": "A", "type": "Point" },
          { "name": "s", "type": "felt252" }
        ]
      },
      {
        "name": "new_cipher",
        "type": "struct",
        "members": [
          { "name": "L", "type": "Point" },
          { "name": "R", "type": "Point" }
        ]
      }
    ],
    "outputs": [],
    "state_mutability": "external"
  },
  // Ragequit - emergency withdrawal
  {
    "name": "ragequit",
    "type": "function",
    "inputs": [
      { "name": "to", "type": "ContractAddress" },
      {
        "name": "proof",
        "type": "struct",
        "members": [
          { "name": "Ax", "type": "Point" },
          { "name": "AR", "type": "Point" },
          { "name": "sx", "type": "felt252" }
        ]
      }
    ],
    "outputs": [],
    "state_mutability": "external"
  },
  // Events
  {
    "name": "Fund",
    "type": "event",
    "inputs": [
      { "name": "account", "type": "Point", "indexed": true },
      { "name": "amount", "type": "Uint256", "indexed": false }
    ]
  },
  {
    "name": "Transfer",
    "type": "event",
    "inputs": [
      { "name": "from", "type": "Point", "indexed": true },
      { "name": "to", "type": "Point", "indexed": true },
      { "name": "amount", "type": "Uint256", "indexed": false }
    ]
  },
  {
    "name": "Withdraw",
    "type": "event",
    "inputs": [
      { "name": "account", "type": "Point", "indexed": true },
      { "name": "to", "type": "ContractAddress", "indexed": true },
      { "name": "amount", "type": "Uint256", "indexed": false }
    ]
  },
  {
    "name": "Rollover",
    "type": "event",
    "inputs": [
      { "name": "account", "type": "Point", "indexed": true }
    ]
  },
  {
    "name": "Ragequit",
    "type": "event",
    "inputs": [
      { "name": "account", "type": "Point", "indexed": true },
      { "name": "to", "type": "ContractAddress", "indexed": true },
      { "name": "amount", "type": "Uint256", "indexed": false }
    ]
  }
] as const;

/**
 * Type alias for the Tongo ABI.
 */
export type TongoAbi = typeof ABI;
