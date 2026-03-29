# NovaSupport Contract ABI

Reference implementation: `contract/contracts/support_page/src/lib.rs`

## Contract ID

Deploy the contract to Stellar Testnet, then set `NEXT_PUBLIC_CONTRACT_ID` in `frontend/.env.local` to the deployed contract ID.

This repository does not currently include a checked-in deployed contract ID.

## Functions

### `support(env, supporter, recipient, amount, asset_code, message) -> u32`

Records a support action, requires authorization from the supporter, emits a `support` event, increments the global support counter, and returns the updated global count.

Parameters:

- `env: Env` - Soroban execution environment.
- `supporter: Address` - Address that must authorize the call via `require_auth()`.
- `recipient: Address` - Address receiving support.
- `amount: i128` - Raw onchain support amount. The contract only checks that it is greater than zero.
- `asset_code: String` - Asset code label such as `"XLM"` or `"USDC"`.
- `message: String` - Arbitrary support message emitted with the event.

Returns:

- `u32` - Global support count after the current call completes.

Behavior:

- Rejects calls where `amount <= 0`.
- Reads the current `SupportCount` from persistent storage.
- Increments and stores the new `SupportCount`.
- Emits a `support` event with the full payload.

Errors:

- No numeric Soroban error enum is defined in the current contract.
- If `amount <= 0`, the contract panics with `amount must be positive`.
- If `supporter` does not authorize the call, Soroban authorization fails.

### `support_count(env) -> u32`

Returns the total number of successful `support()` calls recorded by the contract.

Parameters:

- `env: Env` - Soroban execution environment.

Returns:

- `u32` - Current global support count.

Behavior:

- Reads `SupportCount` from persistent storage.
- Returns `0` when no support has been recorded yet.

## Events

### Topic: `"support"`

Emitted on every successful `support()` call.

Event payload type:

```json
{
  "supporter": "G...",
  "recipient": "G...",
  "amount": 10000000,
  "asset_code": "XLM",
  "message": "Keep building!"
}
```

Event fields:

- `supporter: Address` - Authorized caller.
- `recipient: Address` - Support recipient.
- `amount: i128` - Raw amount passed to `support()`.
- `asset_code: String` - Asset code label.
- `message: String` - Support message.

Notes:

- The event topic is the single symbol `support`.
- The event payload does not include a timestamp.
- The event payload does not include the global support count.

## Storage Keys

| Key | Type | Description |
| --- | --- | --- |
| `SupportCount` | `u32` | Global count of successful `support()` calls stored in persistent storage. |

## Error Codes

The current contract does not define numeric error codes or a custom Soroban error enum.

| Error | Value | Meaning |
| --- | --- | --- |
| `amount must be positive` | N/A | Triggered when `support()` is called with `amount <= 0`. |
| Soroban auth failure | N/A | Triggered when `supporter` does not authorize the call. |

## ABI Notes

- `recipient_count(recipient)` is not implemented in the current contract.
- `get_total_amount(recipient)` is not implemented in the current contract.
- Per-recipient counters and per-recipient totals are not stored in the current contract.
