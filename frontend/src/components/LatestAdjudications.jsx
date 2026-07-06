import { useEffect, useState } from "react";
import { CONTRACT_ADDRESS, getJobs } from "../lib/genlayer.js";
import { formatGen, truncate, VERDICT } from "../lib/format.js";

function Badge({ status }) {
  const v = VERDICT[status] || { label: status, cls: "review" };
  return <span className={`verdict ${v.cls}`}>{v.label}</span>;
}

export function LatestAdjudications() {
  const [rows, setRows] = useState(null); // null = loading

  useEffect(() => {
    let alive = true;
    (async () => {
      // Small stagger so this read does not collide with the console's reads on load
      // (the RPC rate-limits gen_call per IP).
      await new Promise((r) => setTimeout(r, 1300));
      try {
        const jobs = await getJobs(CONTRACT_ADDRESS, 0, 100);
        const settled = (jobs || [])
          .filter((j) => j.status === "VERIFIED" || j.status === "REJECTED")
          .sort((a, b) => b.id - a.id)
          .slice(0, 6);
        if (alive) setRows(settled);
      } catch {
        if (alive) setRows([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (rows !== null && rows.length === 0) return null; // nothing settled yet, hide section

  return (
    <section id="latest">
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">Latest adjudications</div>
          <h2>Real verdicts, settled on-chain.</h2>
          <p>
            Every row below is a real job read live from the contract on Bradbury. The
            verdict, confidence, and settlement were decided by validator consensus, not by
            this page.
          </p>
        </div>

        {rows === null ? (
          <div className="empty">Reading verdicts from the contract…</div>
        ) : (
          <div className="adj-grid">
            {rows.map((j) => (
              <div key={j.id} className="panel adj-card">
                <div className="adj-top">
                  <span className="mono adj-model">{j.model_arch || "training job"}</span>
                  <Badge status={j.status} />
                </div>
                <div className="adj-meta mono">
                  <span>job #{j.id}</span>
                  <span>{j.target_epochs} epochs</span>
                  <span>{formatGen(j.payment)} GEN</span>
                  <span>conf {j.confidence}</span>
                </div>
                <div className="adj-flags mono">
                  <span className={j.epochs_ok ? "flag-ok" : "flag-no"}>epochs {j.epochs_ok ? "ok" : "short"}</span>
                  <span className={j.loss_converged ? "flag-ok" : "flag-no"}>{j.loss_converged ? "converged" : "no convergence"}</span>
                  <span className={j.fatal_error ? "flag-no" : "flag-ok"}>{j.fatal_error ? "fatal error" : "no fatal error"}</span>
                </div>
                {j.analysis && <p className="adj-analysis">“{j.analysis.slice(0, 160)}{j.analysis.length > 160 ? "…" : ""}”</p>}
                <div className="adj-foot mono">
                  <span>
                    {j.status === "VERIFIED"
                      ? `released ${formatGen(j.settled_amount)} GEN to provider`
                      : `refunded ${formatGen(j.settled_amount)} GEN to renter`}
                  </span>
                  {j.log_url && (
                    <a href={j.log_url} target="_blank" rel="noreferrer">evidence ↗</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
