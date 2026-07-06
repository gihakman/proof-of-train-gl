import { useCallback, useEffect, useState } from "react";
import {
  CONTRACT_ADDRESS,
  EXPLORER_TX,
  connectWallet,
  getProtocolInfo,
  getJobs,
  createJob,
  submitEvidence,
  adjudicate,
} from "../lib/genlayer.js";
import { truncate, formatGen, genToAtto, VERDICT } from "../lib/format.js";

function TxBanner({ tx, onDismiss }) {
  if (!tx) return null;
  const cls = tx.phase === "err" ? "err" : tx.phase === "ok" ? "ok" : "";
  return (
    <div className={`notice txbanner ${cls}`}>
      <div className="tx-row">
        {tx.phase === "pending" ? <span className="spinner" /> : <span className={`tx-dot ${cls}`} />}
        <span>{tx.label}</span>
      </div>
      <div className="tx-meta">
        {tx.hash && (
          <a className="mono" href={`${EXPLORER_TX}${tx.hash}`} target="_blank" rel="noreferrer">
            {truncate(tx.hash, 10, 8)} on explorer ↗
          </a>
        )}
        {tx.phase !== "pending" && (
          <button className="tx-x" onClick={onDismiss} aria-label="dismiss">dismiss</button>
        )}
      </div>
    </div>
  );
}

function Verdict({ status }) {
  const v = VERDICT[status] || { label: status, cls: "review" };
  return <span className={`verdict ${v.cls}`}>{v.label}</span>;
}

function JobRow({ job, wallet, onAction, busy }) {
  const [open, setOpen] = useState(false);
  const isProvider = wallet && wallet.account?.toLowerCase() === job.provider?.toLowerCase();
  const awaiting = job.status === "AWAITING_EVIDENCE";
  const hasEvidence = job.log_url && job.log_url.length > 0;

  return (
    <div className="panel job-wrap">
      <div className="job">
        <div className="job-id">#{job.id}</div>
        <div className="job-main">
          <div className="job-title">{job.model_arch || "training job"}</div>
          <div className="job-meta">
            <span>renter {truncate(job.renter)}</span>
            <span>provider {truncate(job.provider)}</span>
            <span>{job.target_epochs} epochs</span>
            <span>{formatGen(job.payment)} GEN escrow</span>
          </div>
        </div>
        <div className="job-actions">
          <Verdict status={job.status} />
          <button className="btn btn-sm" onClick={() => setOpen((o) => !o)}>
            {open ? "hide" : "details"}
          </button>
        </div>
      </div>

      {open && (
        <div className="job-detail">
          <dl className="kv">
            <dt>dataset</dt><dd>{job.dataset_hash || "not set"}</dd>
            <dt>base model</dt><dd>{job.base_model_hash || "not set"}</dd>
            <dt>final model</dt><dd>{job.final_model_hash || "not set"}</dd>
            <dt>learning rate</dt><dd>{job.learning_rate || "not set"}</dd>
            <dt>log url</dt><dd>{job.log_url ? <a href={job.log_url} target="_blank" rel="noreferrer">{truncate(job.log_url, 28, 6)}</a> : "not submitted"}</dd>
            {job.status !== "AWAITING_EVIDENCE" && (
              <>
                <dt>epochs ok</dt><dd>{String(job.epochs_ok)}</dd>
                <dt>loss converged</dt><dd>{String(job.loss_converged)}</dd>
                <dt>fatal error</dt><dd>{String(job.fatal_error)}</dd>
                <dt>confidence</dt><dd>{job.confidence}/100</dd>
                <dt>settled</dt><dd>{formatGen(job.settled_amount)} GEN{Number(job.fee_amount) > 0 ? ` (fee ${formatGen(job.fee_amount)})` : ""}</dd>
              </>
            )}
          </dl>
          {job.analysis && <p className="analysis">“{job.analysis}”</p>}

          {wallet && awaiting && (
            <div className="job-actions" style={{ marginTop: "var(--s4)" }}>
              {isProvider && !hasEvidence && (
                <EvidenceForm jobId={job.id} onSubmit={onAction} busy={busy} />
              )}
              {hasEvidence && (
                <button className="btn btn-signal btn-sm" disabled={busy}
                  onClick={() => onAction("adjudicate", { jobId: job.id })}>
                  run adjudication
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EvidenceForm({ jobId, onSubmit, busy }) {
  const [logUrl, setLogUrl] = useState("");
  const [hash, setHash] = useState("");
  return (
    <div style={{ width: "100%" }}>
      <div className="grid-2">
        <div className="field">
          <label>training log URL (public http/https)</label>
          <input value={logUrl} onChange={(e) => setLogUrl(e.target.value)} placeholder="https://gist.github.com/…/raw" />
        </div>
        <div className="field">
          <label>final model hash</label>
          <input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="sha256:…" />
        </div>
      </div>
      <button className="btn btn-sm" disabled={busy || !logUrl || !hash}
        onClick={() => onSubmit("submit", { jobId, logUrl, finalModelHash: hash })}>
        submit evidence
      </button>
    </div>
  );
}

function CreateForm({ onSubmit, busy }) {
  const [f, setF] = useState({
    provider: "", modelArch: "", datasetHash: "", baseModelHash: "",
    targetEpochs: "3", learningRate: "2e-4", paymentGen: "1",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.provider && f.modelArch && f.paymentGen;
  return (
    <div className="panel">
      <div className="eyebrow">commission a verified training job</div>
      <div className="grid-2" style={{ marginTop: "var(--s4)" }}>
        <div className="field">
          <label>GPU provider address</label>
          <input value={f.provider} onChange={set("provider")} placeholder="0x…" />
        </div>
        <div className="field">
          <label>model architecture</label>
          <input value={f.modelArch} onChange={set("modelArch")} placeholder="llama-3-8b" />
        </div>
        <div className="field">
          <label>dataset hash</label>
          <input value={f.datasetHash} onChange={set("datasetHash")} placeholder="ds:0x…" />
        </div>
        <div className="field">
          <label>base model hash</label>
          <input value={f.baseModelHash} onChange={set("baseModelHash")} placeholder="base:0x…" />
        </div>
        <div className="field">
          <label>target epochs</label>
          <input value={f.targetEpochs} onChange={set("targetEpochs")} type="number" min="1" />
        </div>
        <div className="field">
          <label>learning rate</label>
          <input value={f.learningRate} onChange={set("learningRate")} placeholder="2e-4" />
        </div>
        <div className="field">
          <label>escrow payment (GEN)</label>
          <input value={f.paymentGen} onChange={set("paymentGen")} />
          <span className="hint">locked until adjudication releases or refunds it</span>
        </div>
      </div>
      <button className="btn btn-signal" disabled={busy || !ok}
        onClick={() => onSubmit("create", { params: f, valueAtto: genToAtto(f.paymentGen) })}>
        lock escrow & create job
      </button>
    </div>
  );
}

export function Console() {
  const [address, setAddress] = useState(CONTRACT_ADDRESS);
  const [wallet, setWallet] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [info, setInfo] = useState(null);
  const [tab, setTab] = useState("jobs");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [tx, setTx] = useState(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const [i, j] = await Promise.all([getProtocolInfo(address), getJobs(address, 0, 100)]);
      setInfo(i);
      setJobs((j || []).slice().reverse());
    } catch (e) {
      setMsg({ type: "err", text: `Could not read contract at ${truncate(address)}: ${e.message}` });
    }
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  async function onConnect() {
    setMsg(null);
    try {
      const w = await connectWallet();
      setWallet(w);
      setMsg({ type: "ok", text: `Connected ${truncate(w.account)} on Bradbury.` });
    } catch (e) {
      setMsg({ type: "err", text: e.message });
    }
  }

  async function onAction(kind, payload) {
    if (!wallet) { setMsg({ type: "err", text: "Connect a wallet first." }); return; }
    if (!address) { setMsg({ type: "err", text: "Set the contract address first." }); return; }
    const verb =
      kind === "create" ? "Creating job and locking escrow"
      : kind === "submit" ? "Submitting evidence"
      : "Running adjudication";
    setBusy(true);
    setMsg(null);
    setTx({ phase: "pending", label: `${verb}: confirm in your wallet…`, hash: null });
    const onHash = (h) =>
      setTx({ phase: "pending", label: `${verb}: submitted, waiting for consensus…`, hash: h });
    try {
      const { client } = wallet;
      if (kind === "create") {
        await createJob(client, address, payload.params, payload.valueAtto, onHash);
      } else if (kind === "submit") {
        await submitEvidence(client, address, payload.jobId, payload.logUrl, payload.finalModelHash, onHash);
      } else if (kind === "adjudicate") {
        await adjudicate(client, address, payload.jobId, onHash);
      }
      setTx((t) => ({ phase: "pending", label: "Accepted by consensus. Refreshing state…", hash: t?.hash || null }));
      await refresh();
      const done =
        kind === "create" ? "Job created and escrow locked."
        : kind === "submit" ? "Evidence submitted."
        : "Adjudication settled. See the verdict below.";
      setTx((t) => ({ phase: "ok", label: done, hash: t?.hash || null }));
    } catch (e) {
      const text = e?.shortMessage || e?.message || String(e);
      setTx((t) => ({ phase: "err", label: `Failed: ${text}`, hash: t?.hash || null }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="console">
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">Console</div>
          <h2>Commission, submit, and adjudicate jobs</h2>
          <p>
            The interactive protocol surface. Reading job state is public. Creating a job,
            submitting evidence, or triggering adjudication requires a connected wallet on
            Bradbury.
          </p>
        </div>

        <div className="panel">
          <div className="console-head">
            <div className="wallet">
              <span className={`dot ${wallet ? "" : "off"}`} />
              {wallet
                ? <span className="addr">{truncate(wallet.account)}</span>
                : <button className="btn btn-signal btn-sm" onClick={onConnect}>connect wallet</button>}
              {info && <span className="addr">fee {info.fee_bps / 100}%</span>}
              {info && <span className="addr">{info.job_count} jobs</span>}
            </div>
            <div className="field" style={{ margin: 0, minWidth: "320px" }}>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value.trim())}
                placeholder="contract address 0x… (set after deployment)"
              />
            </div>
          </div>

          {msg && <div className={`notice ${msg.type}`} style={{ marginTop: "var(--s4)" }}>{msg.text}</div>}
          <div style={{ marginTop: "var(--s4)" }}>
            <TxBanner tx={tx} onDismiss={() => setTx(null)} />
          </div>

          {!address && (
            <div className="empty">
              No contract address set. Deploy to Bradbury, then paste the address above or
              set VITE_CONTRACT_ADDRESS.
            </div>
          )}

          {address && (
            <>
              <div className="tabs">
                <button className={`tab ${tab === "jobs" ? "active" : ""}`} onClick={() => setTab("jobs")}>jobs</button>
                <button className={`tab ${tab === "create" ? "active" : ""}`} onClick={() => setTab("create")}>new job</button>
              </div>

              {tab === "create" && <CreateForm onSubmit={onAction} busy={busy} />}

              {tab === "jobs" && (
                <div className="jobs">
                  {jobs.length === 0 && <div className="empty">No jobs yet. Create one to lock the first escrow.</div>}
                  {jobs.map((job) => (
                    <JobRow key={job.id} job={job} wallet={wallet} onAction={onAction} busy={busy} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
