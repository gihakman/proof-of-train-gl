// Deploy ProofOfTrain to GenLayer Bradbury testnet using genlayer-js.
//
// Usage:
//   1. Set ACCOUNT_PRIVATE_KEY in the repo-root .env (see .env.example).
//   2. From this folder:  npm install && npm run deploy
//
// The private key is read from the environment and is never printed or logged.
// The deployed contract address IS printed (it is public, not a secret).

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// --- minimal .env loader (no dependency) -------------------------------------------
function loadEnv() {
  const envPath = resolve(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

async function main() {
  loadEnv();

  const pk = process.env.ACCOUNT_PRIVATE_KEY;
  if (!pk || pk.length < 10) {
    console.error(
      "ACCOUNT_PRIVATE_KEY is not set.\n" +
      "Create a repo-root .env from .env.example and add a funded Bradbury key.\n" +
      "Fund it at https://testnet-faucet.genlayer.foundation",
    );
    process.exit(1);
  }

  // Deploy constructor args: fee_recipient ("" = deployer), fee_bps (100 = 1%).
  const feeRecipient = process.env.FEE_RECIPIENT || "";
  const feeBps = Number(process.env.FEE_BPS || 100);

  const account = createAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
  const client = createClient({ chain: testnetBradbury, account });

  const codePath = resolve(ROOT, "contracts", "proof_of_train.py");
  const code = new Uint8Array(readFileSync(codePath));

  console.log("Deployer:", account.address);
  console.log("Network : Bradbury testnet (chain 4221)");
  console.log("Contract:", codePath);
  console.log("Args    :", { fee_recipient: feeRecipient || "(deployer)", fee_bps: feeBps });
  console.log("Deploying...");

  await client.initializeConsensusSmartContract();

  const txHash = await client.deployContract({
    code,
    args: [feeRecipient, feeBps],
  });
  console.log("Deploy tx:", txHash);

  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    status: TransactionStatus.ACCEPTED,
    retries: 200,
  });

  const address =
    receipt?.data?.contract_address ||
    receipt?.txDataDecoded?.contractAddress ||
    receipt?.contractAddress;

  if (!address) {
    console.error("Deployment did not return a contract address. Receipt:", JSON.stringify(receipt, null, 2));
    process.exit(1);
  }

  console.log("\n✓ ProofOfTrain accepted by consensus");
  console.log("  Contract address:", address);
  console.log("  Explorer        : https://explorer-bradbury.genlayer.com/tx/" + txHash);
  console.log("\nThe contract becomes readable once the deploy tx FINALIZES (Bradbury");
  console.log("finality window). Set VITE_CONTRACT_ADDRESS=" + address + " in frontend/.env.local");
}

main().catch((e) => {
  console.error("Deployment failed:", e?.message || e);
  process.exit(1);
});
