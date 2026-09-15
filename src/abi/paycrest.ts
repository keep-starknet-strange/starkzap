export const ABI = [
  {
    type: "impl",
    name: "UpgradeableImpl",
    interface_name: "openzeppelin_upgrades::interface::IUpgradeable",
  },
  {
    type: "interface",
    name: "openzeppelin_upgrades::interface::IUpgradeable",
    items: [
      {
        type: "function",
        name: "upgrade",
        inputs: [
          {
            name: "new_class_hash",
            type: "core::starknet::class_hash::ClassHash",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
    ],
  },
  {
    type: "impl",
    name: "GatewayImpl",
    interface_name: "paycrest::interfaces::IGateway::IGateway",
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
  {
    type: "struct",
    name: "core::byte_array::ByteArray",
    members: [
      {
        name: "data",
        type: "core::array::Array::<core::bytes_31::bytes31>",
      },
      {
        name: "pending_word",
        type: "core::felt252",
      },
      {
        name: "pending_word_len",
        type: "core::internal::bounded_int::BoundedInt::<0, 30>",
      },
    ],
  },
  {
    type: "enum",
    name: "core::bool",
    variants: [
      {
        name: "False",
        type: "()",
      },
      {
        name: "True",
        type: "()",
      },
    ],
  },
  {
    type: "struct",
    name: "paycrest::interfaces::IGateway::Order",
    members: [
      {
        name: "sender",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "token",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "sender_fee_recipient",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "sender_fee",
        type: "core::integer::u256",
      },
      {
        name: "protocol_fee",
        type: "core::integer::u256",
      },
      {
        name: "is_fulfilled",
        type: "core::bool",
      },
      {
        name: "is_refunded",
        type: "core::bool",
      },
      {
        name: "refund_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "current_bps",
        type: "core::integer::u64",
      },
      {
        name: "amount",
        type: "core::integer::u256",
      },
    ],
  },
  {
    type: "interface",
    name: "paycrest::interfaces::IGateway::IGateway",
    items: [
      {
        type: "function",
        name: "create_order",
        inputs: [
          {
            name: "token",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "amount",
            type: "core::integer::u256",
          },
          {
            name: "rate",
            type: "core::integer::u128",
          },
          {
            name: "sender_fee_recipient",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "sender_fee",
            type: "core::integer::u256",
          },
          {
            name: "refund_address",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "message_hash",
            type: "core::byte_array::ByteArray",
          },
        ],
        outputs: [
          {
            type: "core::felt252",
          },
        ],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "settle_out",
        inputs: [
          {
            name: "split_order_id",
            type: "core::felt252",
          },
          {
            name: "order_id",
            type: "core::felt252",
          },
          {
            name: "liquidity_provider",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "settle_percent",
            type: "core::integer::u64",
          },
          {
            name: "rebate_percent",
            type: "core::integer::u64",
          },
        ],
        outputs: [
          {
            type: "core::bool",
          },
        ],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "settle_in",
        inputs: [
          {
            name: "order_id",
            type: "core::felt252",
          },
          {
            name: "token",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "amount",
            type: "core::integer::u256",
          },
          {
            name: "sender_fee_recipient",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "sender_fee",
            type: "core::integer::u256",
          },
          {
            name: "recipient",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "rate",
            type: "core::integer::u128",
          },
        ],
        outputs: [
          {
            type: "core::bool",
          },
        ],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "refund",
        inputs: [
          {
            name: "fee",
            type: "core::integer::u256",
          },
          {
            name: "order_id",
            type: "core::felt252",
          },
        ],
        outputs: [
          {
            type: "core::bool",
          },
        ],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "is_token_supported",
        inputs: [
          {
            name: "token",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [
          {
            type: "core::bool",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_order_info",
        inputs: [
          {
            name: "order_id",
            type: "core::felt252",
          },
        ],
        outputs: [
          {
            type: "paycrest::interfaces::IGateway::Order",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_aggregator",
        inputs: [],
        outputs: [
          {
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        state_mutability: "view",
      },
    ],
  },
  {
    type: "impl",
    name: "OwnableTwoStepMixinImpl",
    interface_name:
      "openzeppelin_access::ownable::interface::OwnableTwoStepABI",
  },
  {
    type: "interface",
    name: "openzeppelin_access::ownable::interface::OwnableTwoStepABI",
    items: [
      {
        type: "function",
        name: "owner",
        inputs: [],
        outputs: [
          {
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "pending_owner",
        inputs: [],
        outputs: [
          {
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "accept_ownership",
        inputs: [],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "transfer_ownership",
        inputs: [
          {
            name: "new_owner",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "renounce_ownership",
        inputs: [],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "pendingOwner",
        inputs: [],
        outputs: [
          {
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "acceptOwnership",
        inputs: [],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "transferOwnership",
        inputs: [
          {
            name: "newOwner",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "renounceOwnership",
        inputs: [],
        outputs: [],
        state_mutability: "external",
      },
    ],
  },
  {
    type: "impl",
    name: "PausableImpl",
    interface_name: "openzeppelin_security::interface::IPausable",
  },
  {
    type: "interface",
    name: "openzeppelin_security::interface::IPausable",
    items: [
      {
        type: "function",
        name: "is_paused",
        inputs: [],
        outputs: [
          {
            type: "core::bool",
          },
        ],
        state_mutability: "view",
      },
    ],
  },
  {
    type: "constructor",
    name: "constructor",
    inputs: [
      {
        name: "owner",
        type: "core::starknet::contract_address::ContractAddress",
      },
    ],
  },
  {
    type: "function",
    name: "pause",
    inputs: [],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "unpause",
    inputs: [],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "setting_manager_bool",
    inputs: [
      {
        name: "what",
        type: "core::felt252",
      },
      {
        name: "value",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "status",
        type: "core::integer::u256",
      },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "update_protocol_address",
    inputs: [
      {
        name: "what",
        type: "core::felt252",
      },
      {
        name: "value",
        type: "core::starknet::contract_address::ContractAddress",
      },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "set_token_fee_settings",
    inputs: [
      {
        name: "token",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "sender_to_provider",
        type: "core::integer::u64",
      },
      {
        name: "provider_to_aggregator",
        type: "core::integer::u64",
      },
      {
        name: "sender_to_aggregator",
        type: "core::integer::u64",
      },
      {
        name: "provider_to_aggregator_fx",
        type: "core::integer::u64",
      },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "event",
    name: "openzeppelin_access::ownable::ownable::OwnableComponent::OwnershipTransferred",
    kind: "struct",
    members: [
      {
        name: "previous_owner",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
      {
        name: "new_owner",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
    ],
  },
  {
    type: "event",
    name: "openzeppelin_access::ownable::ownable::OwnableComponent::OwnershipTransferStarted",
    kind: "struct",
    members: [
      {
        name: "previous_owner",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
      {
        name: "new_owner",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
    ],
  },
  {
    type: "event",
    name: "openzeppelin_access::ownable::ownable::OwnableComponent::Event",
    kind: "enum",
    variants: [
      {
        name: "OwnershipTransferred",
        type: "openzeppelin_access::ownable::ownable::OwnableComponent::OwnershipTransferred",
        kind: "nested",
      },
      {
        name: "OwnershipTransferStarted",
        type: "openzeppelin_access::ownable::ownable::OwnableComponent::OwnershipTransferStarted",
        kind: "nested",
      },
    ],
  },
  {
    type: "event",
    name: "openzeppelin_security::pausable::PausableComponent::Paused",
    kind: "struct",
    members: [
      {
        name: "account",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "data",
      },
    ],
  },
  {
    type: "event",
    name: "openzeppelin_security::pausable::PausableComponent::Unpaused",
    kind: "struct",
    members: [
      {
        name: "account",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "data",
      },
    ],
  },
  {
    type: "event",
    name: "openzeppelin_security::pausable::PausableComponent::Event",
    kind: "enum",
    variants: [
      {
        name: "Paused",
        type: "openzeppelin_security::pausable::PausableComponent::Paused",
        kind: "nested",
      },
      {
        name: "Unpaused",
        type: "openzeppelin_security::pausable::PausableComponent::Unpaused",
        kind: "nested",
      },
    ],
  },
  {
    type: "event",
    name: "openzeppelin_upgrades::upgradeable::UpgradeableComponent::Upgraded",
    kind: "struct",
    members: [
      {
        name: "class_hash",
        type: "core::starknet::class_hash::ClassHash",
        kind: "data",
      },
    ],
  },
  {
    type: "event",
    name: "openzeppelin_upgrades::upgradeable::UpgradeableComponent::Event",
    kind: "enum",
    variants: [
      {
        name: "Upgraded",
        type: "openzeppelin_upgrades::upgradeable::UpgradeableComponent::Upgraded",
        kind: "nested",
      },
    ],
  },
  {
    type: "event",
    name: "paycrest::contracts::GatewaySettingManager::GatewaySettingManagerComponent::SettingManagerBool",
    kind: "struct",
    members: [
      {
        name: "what",
        type: "core::felt252",
        kind: "key",
      },
      {
        name: "value",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
      {
        name: "status",
        type: "core::integer::u256",
        kind: "data",
      },
    ],
  },
  {
    type: "event",
    name: "paycrest::contracts::GatewaySettingManager::GatewaySettingManagerComponent::ProtocolAddressUpdated",
    kind: "struct",
    members: [
      {
        name: "what",
        type: "core::felt252",
        kind: "key",
      },
      {
        name: "address",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
    ],
  },
  {
    type: "event",
    name: "paycrest::contracts::GatewaySettingManager::GatewaySettingManagerComponent::TokenFeeSettingsUpdated",
    kind: "struct",
    members: [
      {
        name: "token",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
      {
        name: "sender_to_provider",
        type: "core::integer::u64",
        kind: "data",
      },
      {
        name: "provider_to_aggregator",
        type: "core::integer::u64",
        kind: "data",
      },
      {
        name: "sender_to_aggregator",
        type: "core::integer::u64",
        kind: "data",
      },
      {
        name: "provider_to_aggregator_fx",
        type: "core::integer::u64",
        kind: "data",
      },
    ],
  },
  {
    type: "event",
    name: "paycrest::contracts::GatewaySettingManager::GatewaySettingManagerComponent::Event",
    kind: "enum",
    variants: [
      {
        name: "SettingManagerBool",
        type: "paycrest::contracts::GatewaySettingManager::GatewaySettingManagerComponent::SettingManagerBool",
        kind: "nested",
      },
      {
        name: "ProtocolAddressUpdated",
        type: "paycrest::contracts::GatewaySettingManager::GatewaySettingManagerComponent::ProtocolAddressUpdated",
        kind: "nested",
      },
      {
        name: "TokenFeeSettingsUpdated",
        type: "paycrest::contracts::GatewaySettingManager::GatewaySettingManagerComponent::TokenFeeSettingsUpdated",
        kind: "nested",
      },
    ],
  },
  {
    type: "event",
    name: "paycrest::interfaces::IGateway::OrderCreated",
    kind: "struct",
    members: [
      {
        name: "sender",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
      {
        name: "token",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
      {
        name: "amount",
        type: "core::integer::u256",
        kind: "key",
      },
      {
        name: "protocol_fee",
        type: "core::integer::u256",
        kind: "data",
      },
      {
        name: "order_id",
        type: "core::felt252",
        kind: "data",
      },
      {
        name: "rate",
        type: "core::integer::u128",
        kind: "data",
      },
      {
        name: "message_hash",
        type: "core::byte_array::ByteArray",
        kind: "data",
      },
    ],
  },
  {
    type: "event",
    name: "paycrest::interfaces::IGateway::SettleOut",
    kind: "struct",
    members: [
      {
        name: "split_order_id",
        type: "core::felt252",
        kind: "data",
      },
      {
        name: "order_id",
        type: "core::felt252",
        kind: "key",
      },
      {
        name: "liquidity_provider",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
      {
        name: "settle_percent",
        type: "core::integer::u64",
        kind: "data",
      },
      {
        name: "rebate_percent",
        type: "core::integer::u64",
        kind: "data",
      },
    ],
  },
  {
    type: "event",
    name: "paycrest::interfaces::IGateway::SettleIn",
    kind: "struct",
    members: [
      {
        name: "order_id",
        type: "core::felt252",
        kind: "key",
      },
      {
        name: "liquidity_provider",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
      {
        name: "recipient",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
      {
        name: "amount",
        type: "core::integer::u256",
        kind: "data",
      },
      {
        name: "token",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "data",
      },
      {
        name: "aggregator_fee",
        type: "core::integer::u256",
        kind: "data",
      },
      {
        name: "rate",
        type: "core::integer::u128",
        kind: "data",
      },
    ],
  },
  {
    type: "event",
    name: "paycrest::interfaces::IGateway::OrderRefunded",
    kind: "struct",
    members: [
      {
        name: "fee",
        type: "core::integer::u256",
        kind: "data",
      },
      {
        name: "order_id",
        type: "core::felt252",
        kind: "key",
      },
    ],
  },
  {
    type: "event",
    name: "paycrest::interfaces::IGateway::SenderFeeTransferred",
    kind: "struct",
    members: [
      {
        name: "order_id",
        type: "core::felt252",
        kind: "key",
      },
      {
        name: "sender",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
      {
        name: "amount",
        type: "core::integer::u256",
        kind: "key",
      },
    ],
  },
  {
    type: "event",
    name: "paycrest::interfaces::IGateway::LocalTransferFeeSplit",
    kind: "struct",
    members: [
      {
        name: "order_id",
        type: "core::felt252",
        kind: "key",
      },
      {
        name: "sender_amount",
        type: "core::integer::u256",
        kind: "data",
      },
      {
        name: "provider_amount",
        type: "core::integer::u256",
        kind: "data",
      },
      {
        name: "aggregator_amount",
        type: "core::integer::u256",
        kind: "data",
      },
    ],
  },
  {
    type: "event",
    name: "paycrest::interfaces::IGateway::FxTransferFeeSplit",
    kind: "struct",
    members: [
      {
        name: "order_id",
        type: "core::felt252",
        kind: "key",
      },
      {
        name: "sender_amount",
        type: "core::integer::u256",
        kind: "data",
      },
      {
        name: "aggregator_amount",
        type: "core::integer::u256",
        kind: "data",
      },
    ],
  },
  {
    type: "event",
    name: "paycrest::contracts::Gateway::Gateway::Event",
    kind: "enum",
    variants: [
      {
        name: "OwnableEvent",
        type: "openzeppelin_access::ownable::ownable::OwnableComponent::Event",
        kind: "flat",
      },
      {
        name: "PausableEvent",
        type: "openzeppelin_security::pausable::PausableComponent::Event",
        kind: "flat",
      },
      {
        name: "UpgradeableEvent",
        type: "openzeppelin_upgrades::upgradeable::UpgradeableComponent::Event",
        kind: "flat",
      },
      {
        name: "GatewaySettingManagerEvent",
        type: "paycrest::contracts::GatewaySettingManager::GatewaySettingManagerComponent::Event",
        kind: "flat",
      },
      {
        name: "OrderCreated",
        type: "paycrest::interfaces::IGateway::OrderCreated",
        kind: "nested",
      },
      {
        name: "SettleOut",
        type: "paycrest::interfaces::IGateway::SettleOut",
        kind: "nested",
      },
      {
        name: "SettleIn",
        type: "paycrest::interfaces::IGateway::SettleIn",
        kind: "nested",
      },
      {
        name: "OrderRefunded",
        type: "paycrest::interfaces::IGateway::OrderRefunded",
        kind: "nested",
      },
      {
        name: "SenderFeeTransferred",
        type: "paycrest::interfaces::IGateway::SenderFeeTransferred",
        kind: "nested",
      },
      {
        name: "LocalTransferFeeSplit",
        type: "paycrest::interfaces::IGateway::LocalTransferFeeSplit",
        kind: "nested",
      },
      {
        name: "FxTransferFeeSplit",
        type: "paycrest::interfaces::IGateway::FxTransferFeeSplit",
        kind: "nested",
      },
    ],
  },
] as const;
