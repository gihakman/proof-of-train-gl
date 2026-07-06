# ProofOfTrain

Trustless verification for decentralized GPU training. ProofOfTrain checks that a rented
GPU actually ran the training job it was paid for, and releases the escrow only when the
evidence holds up. It runs as a Python Intelligent Contract on
[GenLayer](https://genlayer.com) and settles payment based on multi-validator consensus,
not a single trusted evaluator.

## The problem

Decentralized compute networks can prove a GPU was reserved. They cannot prove the
requested work was done. A provider can start a machine, run a throwaway script, return
an untrained base model, and still collect the fee. The renter paid up front and has no
on-chain way to show the work was never performed. Manual audits and reputation systems
do not scale and put a central party back in the loop.

A deterministic smart contract cannot parse a training log or judge whether a loss curve
actually converged, and a single AI reviewer can be bribed or spoofed. The verdict has to
be reproducible by many independent parties for the settlement to be trustless.

## How it works

1. **Lock escrow.** The renter calls `create_job` with the spec (model, dataset hash,
   base model hash, target epochs, learning rate) and locks payment in the contract.
2. **Submit evidence.** The provider calls `submit_evidence` with a public URL to the raw
   training logs and the final model hash.
3. **Adjudicate.** Anyone calls `adjudicate`. The leader fetches the logs and evaluates
   them; validators independently re-fetch and agree on the objective verdict fields.
4. **Settle.** On a verified verdict the provider is paid minus a protocol fee. On
   rejection the renter is refunded in full. Provider reputation is updated on-chain.

A job is marked valid only if every criterion holds: epoch progress consistent with the
requested count, a genuine downward loss trend, and no fatal out-of-memory, NaN, or early
termination in the final portion of the run.

## Why GenLayer

The core decision, "was this training run real and complete?", is subjective and reads
unstructured evidence. GenLayer's Intelligent Contracts can fetch the logs directly and
run an evaluation inside the contract, while Optimistic Democracy makes many validators
reach consensus on the outcome. The contract uses a custom leader/validator equivalence
rule (`gl.vm.run_nondet_unsafe`) that compares only the objective decision fields
(`valid`, `epochs_ok`, `loss_converged`, `fatal_error`), so validators agree on the
verdict even though their free-text analysis differs.

## Live on Bradbury testnet

| | |
|---|---|
| Contract | [`0xFe8299f2b66DA5d2A65587D52F2AeE2D740d4aEF`](https://explorer-bradbury.genlayer.com/address/0xFe8299f2b66DA5d2A65587D52F2AeE2D740d4aEF) |
| Deploy transaction | [`0xe476549c…f22b8ab2`](https://explorer-bradbury.genlayer.com/tx/0xe476549c43c6b21f7feff473f9337de922d86a64c0eb608c7027a9762c478677) |
| Protocol fee | 1% of a verified payout |

## Tech stack

- **Intelligent Contract:** Python on GenVM (`genlayer` SDK), pinned runner version.
- **Frontend:** React 19 + Vite 8, [`genlayer-js`](https://www.npmjs.com/package/genlayer-js)
  for reads, writes, and wallet signing.
- **Testing:** `genlayer-test` direct mode; `genvm-linter` for static validation.
- **Deploy:** `genlayer-js` script using `createClient` / `createAccount`.

## Repository structure

```
contracts/proof_of_train.py     Intelligent Contract (GenVM, Python)
tests/direct/                   direct-mode contract tests
deploy/deploy.mjs               genlayer-js deploy script (Bradbury)
frontend/                       React + Vite dapp
vercel.json                     one-step Vercel deployment for the frontend
gltest.config.yaml              network configuration for tests and deploy
```

## Contract: validate and test

Requires Python 3.12 or newer (the GenLayer SDK needs 3.12+).

```bash
python3.12 -m venv .venv
. .venv/bin/activate
pip install genvm-linter genlayer-test

genvm-lint check contracts/proof_of_train.py    # static lint + SDK validation
pytest tests/direct/ -v                          # contract test suite
```

## Frontend

```bash
cd frontend
npm install
npm run dev      # start the dev server
npm run build    # production build into frontend/dist
```

The app defaults to the live contract above, so it works with no extra configuration. To
point it at your own deployment, set `VITE_CONTRACT_ADDRESS` (see `frontend/.env.example`)
or paste an address into the console. Writes require a browser wallet on Bradbury; reads
work without one.

### Deploy the frontend to Vercel

Import the repository in Vercel. The included `vercel.json` builds the app in `frontend/`
and serves `frontend/dist`, so no dashboard configuration is needed.

## Deploy the contract

Deployment needs a funded Bradbury testnet key. Get test GEN from the
[faucet](https://testnet-faucet.genlayer.foundation).

```bash
cp .env.example .env      # then set ACCOUNT_PRIVATE_KEY

cd deploy
npm install
npm run deploy            # prints the deployed contract address
```

The private key is read from `.env` (which is gitignored) and is never printed or logged.

### Network

| Setting | Value |
|---------|-------|
| RPC | `https://rpc-bradbury.genlayer.com` |
| Chain ID | 4221 |
| Currency | GEN |
| Explorer | https://explorer-bradbury.genlayer.com |
| Faucet | https://testnet-faucet.genlayer.foundation |

## Security notes

- `.env` and every `.env.*` except `.env.example` are gitignored. Never commit a private
  key.
- `create_job` is payable and holds escrow in the contract until adjudication settles it.
- Adjudication is idempotent: a job can only be settled once.

## License

MIT
