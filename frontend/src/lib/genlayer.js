// Thin wrapper around genlayer-js for reading and writing the ProofOfTrain contract on
// Bradbury testnet. Uses a wallet provider (MetaMask) for signing writes; reads work
// without a wallet.

import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

export const NETWORK_KEY = "testnetBradbury";

// Live ProofOfTrain contract on Bradbury. Public address (not a secret); used as the
// default so the deployed site works without extra configuration. Override with
// VITE_CONTRACT_ADDRESS if you deploy your own instance.
const DEFAULT_CONTRACT_ADDRESS = "0xFe8299f2b66DA5d2A65587D52F2AeE2D740d4aEF";
export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || DEFAULT_CONTRACT_ADDRESS;

// Read-only client. No wallet required. Reused across reads to avoid overhead.
let _readClient = null;
export function readClient() {
  if (!_readClient) _readClient = createClient({ chain: testnetBradbury });
  return _readClient;
}

// The Bradbury RPC rate-limits gen_call (~2 req/s per IP). Retry reads with backoff so
// a burst on page load degrades gracefully instead of erroring.
function isRateLimit(e) {
  const msg = (e?.details || e?.shortMessage || e?.message || "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("exceeds defined limit") ||
    e?.code === -32005 ||
    e?.code === 429
  );
}

async function withRetry(fn, tries = 5) {
  let delay = 700;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isRateLimit(e) || i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, delay + Math.random() * 300));
      delay *= 1.8;
    }
  }
}

// Write client bound to a connected wallet account + provider.
export function writeClient(account, provider) {
  return createClient({ chain: testnetBradbury, account, provider });
}

const BRADBURY_CHAIN_HEX = "0x" + (4221).toString(16); // 0x107d

// Switch (or add) the Bradbury chain in the wallet without touching MetaMask Snaps.
// genlayer-js's connect() probes wallet_getSnaps, which throws on wallets that do not
// implement Snaps. Signing never uses the snap, so we only need the chain switch.
async function ensureBradbury(provider) {
  let current = null;
  try {
    current = await provider.request({ method: "eth_chainId" });
  } catch {
    current = null;
  }
  if (current === BRADBURY_CHAIN_HEX) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BRADBURY_CHAIN_HEX }],
    });
  } catch (e) {
    const notAdded = e?.code === 4902 || /unrecognized chain|not been added|add.*chain/i.test(e?.message || "");
    if (!notAdded) throw e;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: BRADBURY_CHAIN_HEX,
        chainName: "GenLayer Bradbury",
        rpcUrls: ["https://rpc-bradbury.genlayer.com"],
        nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
        blockExplorerUrls: ["https://explorer-bradbury.genlayer.com"],
      }],
    });
  }
}

export async function connectWallet() {
  const provider = window.ethereum;
  if (!provider) {
    throw new Error("No EVM wallet found. Install a browser wallet like MetaMask to submit transactions.");
  }
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const account = accounts?.[0];
  if (!account) throw new Error("Wallet returned no account.");
  await ensureBradbury(provider);
  const client = writeClient(account, provider);
  return { account, client };
}

// ---- reads ----------------------------------------------------------------------

export async function readContract(address, functionName, args = []) {
  return withRetry(() => readClient().readContract({ address, functionName, args }));
}

export async function getProtocolInfo(address) {
  return readContract(address, "get_protocol_info", []);
}

export async function getJobs(address, offset = 0, limit = 50) {
  return readContract(address, "get_jobs", [offset, limit]);
}

export async function getProviderReputation(address, provider) {
  return readContract(address, "get_provider_reputation", [provider]);
}

// ---- writes ---------------------------------------------------------------------

// Explicit gas limit for writes. Value-bearing GenLayer transactions (escrow) do extra
// work in the consensus contract, and the auto-estimate can be too low, causing an inner
// call to run out of gas. Unused gas is refunded, so a generous cap is safe.
const WRITE_GAS = 8_000_000n;

export const EXPLORER_TX = "https://explorer-bradbury.genlayer.com/tx/";

async function send(client, address, functionName, args, value = 0n, onHash) {
  const hash = await client.writeContract({ address, functionName, args, value, gas: WRITE_GAS });
  if (onHash) onHash(hash);
  await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED });
  return hash;
}

export async function createJob(client, address, params, valueAtto, onHash) {
  const { provider, modelArch, datasetHash, baseModelHash, targetEpochs, learningRate } = params;
  return send(
    client,
    address,
    "create_job",
    [provider, modelArch, datasetHash, baseModelHash, Number(targetEpochs), learningRate],
    BigInt(valueAtto),
    onHash,
  );
}

export async function submitEvidence(client, address, jobId, logUrl, finalModelHash, onHash) {
  return send(client, address, "submit_evidence", [Number(jobId), logUrl, finalModelHash], 0n, onHash);
}

export async function adjudicate(client, address, jobId, onHash) {
  return send(client, address, "adjudicate", [Number(jobId)], 0n, onHash);
}
