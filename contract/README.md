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
