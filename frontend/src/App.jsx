import { LossCurveMark, LossCurvePlot } from "./components/LossCurveMark.jsx";
import { Console } from "./components/Console.jsx";
import { CONTRACT_ADDRESS } from "./lib/genlayer.js";
import { truncate } from "./lib/format.js";

const REPO_URL = "https://github.com/gihakman/proof-of-train-gl";

function GitHubIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.79 2.73 1.27 3.4.97.1-.76.41-1.27.74-1.56-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.42.36.8 1.08.8 2.18v3.23c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

function TopBar() {
  return (
    <header className="topbar">
      <div className="wrap topbar-inner">
        <div className="brand">
          <LossCurveMark size={26} />
          <span className="brand-name">Proof<span>OfTrain</span></span>
        </div>
        <nav className="nav">
          <a href="#overview">Overview</a>
          <a href="#how">How it works</a>
          <a href="#console">Console</a>
          <a href="#developers">Developers</a>
        </nav>
        <span className="spacer" />
        <a
          className="icon-link"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="View source on GitHub"
          title="View source on GitHub"
        >
          <GitHubIcon size={19} />
        </a>
        <a className="btn btn-sm" href="#console">Open console</a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="overview" className="hero" style={{ borderBottom: "1px solid var(--grid)" }}>
      <div className="wrap hero-grid">
        <div>
          <div className="eyebrow">DePIN compute verification</div>
          <h1>Verify the training, then release the payment.</h1>
          <p className="lead">
            ProofOfTrain checks that a rented GPU actually ran the training job you paid
            for. Payment is released only when the evidence holds up.
          </p>
          <p className="sub">
            When a renter commissions a job, funds are locked in an Intelligent Contract.
            The provider submits the training logs and the final model hash. GenLayer
            validators independently read the logs and reach consensus on whether the run
            was real and complete. The contract then releases the escrow to the provider
            or refunds the renter.
          </p>
          <div className="hero-actions">
            <a className="btn btn-signal" href="#console">Open the console</a>
            <a className="btn" href="#how">See how it works</a>
          </div>
          <div className="hero-scope">
            <span className="chip">python intelligent contract</span>
            <span className="chip">optimistic democracy consensus</span>
            <span className="chip">bradbury testnet</span>
          </div>
        </div>
        <div className="panel scope-panel">
          <div className="eyebrow">reading: loss trace</div>
          <LossCurvePlot />
          <div className="scope-caption">
            <span className="mono">epoch 0 → N</span>
            <span className="mono">verdict: converged</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <section>
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">The problem</div>
          <h2>Decentralized compute proves allocation, not integrity.</h2>
        </div>
        <div className="grid-2">
          <div className="panel">
            <h3>What breaks today</h3>
            <p>
              Decentralized GPU networks can prove a machine was reserved. They cannot
              prove the requested work was done. A provider can start a VM, run a dummy
              script, return a base model instead of the fine tuned one, and still collect
              the fee.
            </p>
            <p>
              The renter paid up front and has no on chain way to show the work was not
              done. Manual audits and trusted reputations do not scale and reintroduce a
              central party.
            </p>
          </div>
          <div className="panel">
            <h3>Why a normal contract cannot fix it</h3>
            <p>
              A deterministic smart contract cannot parse a PyTorch training log or decide
              whether a loss curve shows real convergence. Standard oracles handle numeric
              feeds, not the subjective reading of unstructured evidence.
            </p>
            <p>
              A single AI evaluator could be bribed or spoofed. The judgment has to be
              reproducible by many independent parties for the settlement to be trustless.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { i: "01", t: "Lock escrow", d: "The renter creates a job with the spec (model, dataset hash, base model hash, target epochs, learning rate) and locks payment in the contract." },
  { i: "02", t: "Submit evidence", d: "The provider posts a public URL to the raw training logs and the final model hash after completing the run." },
  { i: "03", t: "Adjudicate", d: "Validators fetch the same logs, run the evaluation prompt, and agree on the core verdict fields under Optimistic Democracy." },
  { i: "04", t: "Settle", d: "On a verified verdict the provider is paid minus the protocol fee. On rejection the renter is refunded in full." },
];

function HowItWorks() {
  return (
    <section id="how">
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">How it works</div>
          <h2>Four steps from commission to settlement.</h2>
        </div>
        <div className="steps">
          {STEPS.map((s) => (
            <div key={s.i} className="panel step">
              <div className="idx">{s.i}</div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          ))}
        </div>

        <div className="section-head" style={{ marginTop: "var(--s16)" }}>
          <div className="eyebrow">The equivalence criteria</div>
          <h2>A run passes only if every criterion holds.</h2>
          <p>
            Validators do not need to reproduce the training. They read the leader's
            verdict against the raw logs and agree only on the objective decision fields.
            The contract marks a job valid only when all three criteria pass.
          </p>
        </div>
        <div className="criteria">
          <div className="criterion">
            <span className="mono">epochs_ok</span>
            <span>Step and epoch logs are consistent with completing the requested epoch count, using real framework output such as PyTorch, HuggingFace, or Keras.</span>
          </div>
          <div className="criterion">
            <span className="mono">loss_converged</span>
            <span>Reported loss values show a genuine downward trend, not random noise, static numbers, or fabricated values.</span>
          </div>
          <div className="criterion">
            <span className="mono">fatal_error</span>
            <span>No fatal out of memory, NaN loss, or early termination in the final portion of training.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

const METHODS = [
  ["write", "create_job(provider, model_arch, dataset_hash, base_model_hash, target_epochs, learning_rate) payable"],
  ["write", "submit_evidence(job_id, log_url, final_model_hash)"],
  ["write", "adjudicate(job_id)"],
  ["view", "get_job(job_id) -> job"],
  ["view", "get_jobs(offset, limit) -> [job]"],
  ["view", "get_job_count() -> int"],
  ["view", "get_provider_reputation(provider) -> {verified, rejected}"],
  ["view", "get_protocol_info() -> {owner, fee_recipient, fee_bps, job_count}"],
];

const SNIPPET = `import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const client = createClient({ chain: testnetBradbury });

// Read every job (public, no wallet needed)
const jobs = await client.readContract({
  address: CONTRACT_ADDRESS,
  functionName: "get_jobs",
  args: [0, 100],
});

// Adjudicate a job (wallet signs; runs LLM consensus)
const hash = await client.writeContract({
  address: CONTRACT_ADDRESS,
  functionName: "adjudicate",
  args: [jobId],
  value: 0n,
});`;

function Developers() {
  return (
    <section id="developers">
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">Developers</div>
          <h2>Integrate the adjudication engine.</h2>
          <p>
            The contract is written in Python for GenVM. Compute networks integrate it as
            an optional verified training layer. Reads are free; writes go through
            consensus.
          </p>
        </div>

        <div className="devgrid">
          <div className="panel">
            <div className="eyebrow">contract interface</div>
            <div className="method-list" style={{ marginTop: "var(--s3)" }}>
              {METHODS.map(([kind, sig]) => (
                <div key={sig} className="method">
                  <span className={`tag ${kind}`}>{kind}</span>
                  <span>{sig}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="eyebrow">genlayer-js</div>
            <pre style={{ marginTop: "var(--s3)" }}>{SNIPPET}</pre>
          </div>
        </div>

        <div className="devgrid" style={{ marginTop: "var(--s4)" }}>
          <div className="panel">
            <div className="eyebrow">network · bradbury testnet</div>
            <dl className="kv" style={{ marginTop: "var(--s3)" }}>
              <dt>rpc</dt><dd>https://rpc-bradbury.genlayer.com</dd>
              <dt>chain id</dt><dd>4221</dd>
              <dt>currency</dt><dd>GEN</dd>
              <dt>explorer</dt><dd><a href="https://explorer-bradbury.genlayer.com" target="_blank" rel="noreferrer">explorer-bradbury.genlayer.com</a></dd>
              <dt>faucet</dt><dd><a href="https://testnet-faucet.genlayer.foundation" target="_blank" rel="noreferrer">testnet-faucet.genlayer.foundation</a></dd>
            </dl>
          </div>
          <div className="panel">
            <div className="eyebrow">deployment</div>
            <dl className="kv" style={{ marginTop: "var(--s3)" }}>
              <dt>runner</dt><dd>py-genlayer (pinned)</dd>
              <dt>address</dt>
              <dd>{CONTRACT_ADDRESS ? truncate(CONTRACT_ADDRESS, 10, 8) : "not deployed yet"}</dd>
            </dl>
            <p className="dim" style={{ marginTop: "var(--s3)", fontSize: "0.82rem" }}>
              Set VITE_CONTRACT_ADDRESS after deploying, or paste the address into the
              console.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="brand" style={{ marginBottom: "var(--s3)" }}>
          <LossCurveMark size={22} />
          <span className="brand-name" style={{ fontSize: "0.95rem" }}>Proof<span>OfTrain</span></span>
        </div>
        <p className="mono" style={{ fontSize: "0.8rem" }}>
          Trustless QA for decentralized GPU training. Built on GenLayer.
        </p>
        <a className="icon-link footer-gh" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="GitHub repository">
          <GitHubIcon size={18} />
          <span className="mono">gihakman/proof-of-train-gl</span>
        </a>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <>
      <TopBar />
      <Hero />
      <Problem />
      <HowItWorks />
      <Console />
      <Developers />
      <Footer />
    </>
  );
}
