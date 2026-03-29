import { Client } from "./contract";
import { CONTRACT_ID, NETWORK_PASSPHRASE, SOROBAN_RPC_URL } from "./config";

// Export a ready-to-use client instance. If CONTRACT_ID is not set this will still
// construct a client with an empty id — calling code should handle missing ID.
export const contractClient = new Client({
  contractId: CONTRACT_ID,
  networkPassphrase: NETWORK_PASSPHRASE,
  rpcUrl: SOROBAN_RPC_URL,
});

export default contractClient;
