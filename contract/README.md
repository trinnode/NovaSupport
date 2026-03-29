# NovaSupport Contract

This Soroban workspace contains a single minimal contract under `contracts/support_page/`.

## Purpose

The initial contract is intentionally small:

- accept a support action
- require supporter authorization
- emit a support event
- keep a simple support counter

## Why It Is Small

The MVP only needs to show clear Soroban intent for the Stellar Wave submission. This contract is a safe extension point for future work such as:

- token transfer enforcement
- recurring support logic
- onchain profile ownership
- milestones or attestations

## Local Use

```bash
cd contract
cargo test
```

## Contract Invocation

After deploying the contract to Testnet, you can invoke the `support()` function using either the Stellar CLI or JavaScript.

### CLI Example

Use the Stellar CLI to call the contract directly:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source mykey \
  -- support \
  --supporter <SUPPORTER_ADDRESS> \
  --recipient <RECIPIENT_ADDRESS> \
  --amount 10000000 \
  --asset_code XLM \
  --message "Great work!"
```

**Note:** The `amount` is in stroops (1 XLM = 10,000,000 stroops).

### JavaScript Example

Use `@stellar/stellar-sdk` to invoke the contract from JavaScript:

```javascript
import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Address,
  nativeToScVal,
} from "@stellar/stellar-sdk";

const server = new SorobanRpc.Server("https://soroban-testnet.stellar.org");
const contract = new Contract("<CONTRACT_ID>");

// Get the supporter account
const account = await server.getAccount("<SUPPORTER_ADDRESS>");

// Build the transaction
const tx = new TransactionBuilder(account, {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(
    contract.call(
      "support",
      nativeToScVal(Address.fromString("<SUPPORTER_ADDRESS>"), {
        type: "address",
      }),
      nativeToScVal(Address.fromString("<RECIPIENT_ADDRESS>"), {
        type: "address",
      }),
      nativeToScVal(10000000, { type: "i128" }), // amount in stroops
      nativeToScVal("XLM", { type: "string" }),
      nativeToScVal("Great work!", { type: "string" }),
    ),
  )
  .setTimeout(30)
  .build();

// Prepare the transaction
const preparedTx = await server.prepareTransaction(tx);

// Sign with Freighter or a keypair
// preparedTx.sign(keypair);

// Submit the transaction
// const result = await server.sendTransaction(preparedTx);
```

**Note:** Remember to sign the transaction with the supporter's keypair or using a wallet like Freighter before submitting.

### Build & Deploy to Testnet

Follow these steps to build the WASM and deploy the contract to Stellar Testnet.

Prerequisites

- Rust stable toolchain installed
- Add the wasm32 target: `rustup target add wasm32-unknown-unknown`
- Install the Stellar CLI: `cargo install --locked stellar-cli`

Generate and fund a Testnet key (alternative: use the Stellar Laboratory):

```bash
# generate a named keypair for deployment
stellar keys generate --global mykey --network testnet

# fund the account (Testnet)
stellar keys fund mykey --network testnet
```

Build

```bash
cd contract
stellar contract build
# Output: target/wasm32-unknown-unknown/release/support_page.wasm
```

Deploy

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/support_page.wasm \
  --network testnet \
  --source mykey
```

After a successful deploy the CLI will print the contract ID. Add that value to your frontend environment as `NEXT_PUBLIC_CONTRACT_ID` (for example, in `frontend/.env.local`).

Notes

- If you prefer a browser-based alternative for funding testnet accounts, see: https://laboratory.stellar.org
- Keep your deploy key secure; consider using ephemeral or CI-specific keys for automated deploys.
### Query Functions

You can also query the contract state:

**Get global support count:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- support_count
```

**Get recipient-specific support count:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- recipient_count \
  --recipient <RECIPIENT_ADDRESS>
```
