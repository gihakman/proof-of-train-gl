# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# ProofOfTrain: a trustless QA / adjudication layer for decentralized GPU compute.
#
# A renter locks payment when commissioning a training job. The GPU provider submits a
# public URL to the raw training logs plus the final model hash. Validators independently
# fetch the logs and reach consensus (Optimistic Democracy) on whether the training job
# was genuinely executed to specification. On a verified verdict the escrow is released to
# the provider (minus a protocol fee); on rejection it is refunded to the renter.
#
# The consensus-critical decision ("was this training run real and complete?") lives
# here. The frontend only submits inputs and displays state.

from genlayer import *
from dataclasses import dataclass

# --- Error classification prefixes -------------------------------------------------
# Validators use these to decide how to compare leader/validator failures.
ERROR_EXPECTED = "[EXPECTED]"    # business logic (deterministic) — must match exactly
ERROR_EXTERNAL = "[EXTERNAL]"    # external 4xx (deterministic) — must match exactly
ERROR_TRANSIENT = "[TRANSIENT]"  # network / 5xx — agree if both hit it
ERROR_LLM = "[LLM_ERROR]"        # LLM misbehavior — disagree, force rotation

# --- Job lifecycle statuses (stored as str, never Enum) ----------------------------
STATUS_AWAITING_EVIDENCE = "AWAITING_EVIDENCE"
STATUS_VERIFIED = "VERIFIED"   # escrow released to provider
STATUS_REJECTED = "REJECTED"   # escrow refunded to renter


@allow_storage
@dataclass
class Job:
    renter: Address
    provider: Address
    payment: u256            # atto-scale GEN held in escrow
    model_arch: str
    dataset_hash: str
    base_model_hash: str
    target_epochs: u32
    learning_rate: str
    status: str
    log_url: str
    final_model_hash: str
    verdict_valid: bool
    epochs_ok: bool
    loss_converged: bool
    fatal_error: bool
    confidence: u32          # 0..100
    analysis: str
    settled_amount: u256
    fee_amount: u256


# Empty EVM interface used only to send native GEN to an EOA (renter/provider) via the
# documented external-message pattern. Value transfers execute on finalization through
# the contract's ghost contract on the GenLayer Chain.
@gl.evm.contract_interface
class _Payable:
    class View:
        pass

    class Write:
        pass


# --- Pure helpers (module level, deterministic) ------------------------------------

def _err_text(obj) -> str:
    """UserError exposes .data, VMError exposes .message — read whichever exists."""
    for attr in ("message", "data"):
        v = getattr(obj, attr, None)
        if v is not None:
            return str(v)
    return str(obj)


def _to_bool(v) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    if isinstance(v, str):
        return v.strip().lower() in ("true", "yes", "1", "valid", "pass", "passed")
    return False


def _to_conf(v) -> int:
    try:
        c = int(round(float(str(v).strip())))
    except (ValueError, TypeError):
        return 0
    return max(0, min(100, c))


def _trim_log(body: str, head: int = 4000, mid: int = 2000, tail: int = 4000) -> str:
    """Bound GenVM cost: keep the first, middle and final segments of the log so the
    verifier still sees the first epoch, a mid-run epoch, and the final epoch."""
    if len(body) <= head + mid + tail:
        return body
    n = len(body)
    mid_start = (n // 2) - (mid // 2)
    return (
        body[:head]
        + "\n...[trimmed]...\n"
        + body[mid_start:mid_start + mid]
        + "\n...[trimmed]...\n"
        + body[n - tail:]
    )


def _build_prompt(model_arch: str, base_model_hash: str, final_model_hash: str,
                  target_epochs: int, learning_rate: str, evidence: str) -> str:
    return (
        "You are a forensic verifier for AI model training jobs run on decentralized "
        "GPU compute. Analyze the raw training log below and decide whether the job was "
        "genuinely executed to specification.\n\n"
        "Job specification:\n"
        f"- Model architecture: {model_arch}\n"
        f"- Base model hash: {base_model_hash}\n"
        f"- Final model hash claimed by provider: {final_model_hash}\n"
        f"- Target epochs: {target_epochs}\n"
        f"- Learning rate: {learning_rate}\n\n"
        "Evaluate strictly against these criteria:\n"
        f"1. epochs_ok: the log shows step/epoch progress consistent with completing "
        f"{target_epochs} epochs (framework step logs such as PyTorch / HuggingFace / "
        "Keras).\n"
        "2. loss_converged: reported loss values show a genuine downward trend "
        "(convergence), not random noise, flat/static numbers, or fabricated values.\n"
        "3. fatal_error: TRUE if there is a fatal OOM (out of memory), NaN loss, or early "
        "termination in the final portion of training; otherwise FALSE.\n"
        "4. valid: TRUE only if epochs_ok is true AND loss_converged is true AND "
        "fatal_error is false.\n\n"
        "Raw training log (may be trimmed to first / middle / final segments):\n"
        "--- BEGIN LOG ---\n"
        f"{evidence}\n"
        "--- END LOG ---\n\n"
        "Respond ONLY with a JSON object, no prose, exactly:\n"
        '{"valid": true|false, "epochs_ok": true|false, "loss_converged": true|false, '
        '"fatal_error": true|false, "confidence": 0-100, "analysis": "one concise sentence"}'
    )


def _normalize_verdict(analysis: dict) -> dict:
    """Defensively parse the LLM response and enforce the rule-based Pass criteria so the
    verdict does not rely purely on the model's self-reported `valid` flag."""
    epochs_ok = _to_bool(analysis.get("epochs_ok", analysis.get("epochs_completed", False)))
    loss_converged = _to_bool(analysis.get("loss_converged", analysis.get("converged", False)))
    fatal_error = _to_bool(analysis.get("fatal_error", analysis.get("fatal", analysis.get("errors", False))))

    valid_raw = analysis.get("valid")
    rule_pass = epochs_ok and loss_converged and (not fatal_error)
    if valid_raw is None:
        valid = rule_pass
    else:
        # Both the model's own judgment and the objective criteria must agree.
        valid = _to_bool(valid_raw) and rule_pass

    txt = analysis.get("analysis", analysis.get("reasoning", analysis.get("summary", "")))
    return {
        "valid": valid,
        "epochs_ok": epochs_ok,
        "loss_converged": loss_converged,
        "fatal_error": fatal_error,
        "confidence": _to_conf(analysis.get("confidence", analysis.get("score", 0))),
        "analysis": str(txt)[:2000],
    }


def _handle_leader_error(leaders_res, leader_fn) -> bool:
    """Canonical validator error handler — decides agreement when the leader errored."""
    leader_msg = _err_text(leaders_res)
    try:
        leader_fn()
        return False  # leader errored, validator succeeded -> disagree
    except gl.vm.UserError as e:
        validator_msg = _err_text(e)
        if validator_msg.startswith(ERROR_EXPECTED) or validator_msg.startswith(ERROR_EXTERNAL):
            return validator_msg == leader_msg
        if validator_msg.startswith(ERROR_TRANSIENT) and leader_msg.startswith(ERROR_TRANSIENT):
            return True
        return False
    except Exception:
        return False


class ProofOfTrain(gl.Contract):
    # Storage fields — class-level typed annotations only.
    owner: Address
    fee_recipient: Address
    fee_bps: u32                              # basis points; 100 = 1%
    job_count: u256
    jobs: TreeMap[u256, Job]
    provider_verified: TreeMap[Address, u256]  # reputation / trust graph
    provider_rejected: TreeMap[Address, u256]

    def __init__(self, fee_recipient: str = "", fee_bps: int = 100):
        self.owner = gl.message.sender_address
        self.fee_recipient = Address(fee_recipient) if fee_recipient else gl.message.sender_address
        if fee_bps < 0 or fee_bps > 1000:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} fee_bps out of range (0..1000)")
        self.fee_bps = u32(fee_bps)
        self.job_count = u256(0)

    # ---- internal helpers ----------------------------------------------------------

    def _get_job(self, job_id: int) -> Job:
        jid = u256(job_id)
        if jid not in self.jobs:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} job {job_id} not found")
        return self.jobs[jid]

    def _job_to_dict(self, job_id: int, job: Job) -> dict:
        return {
            "id": job_id,
            "renter": job.renter.as_hex,
            "provider": job.provider.as_hex,
            "payment": str(int(job.payment)),
            "model_arch": job.model_arch,
            "dataset_hash": job.dataset_hash,
            "base_model_hash": job.base_model_hash,
            "target_epochs": int(job.target_epochs),
            "learning_rate": job.learning_rate,
            "status": job.status,
            "log_url": job.log_url,
            "final_model_hash": job.final_model_hash,
            "verdict_valid": job.verdict_valid,
            "epochs_ok": job.epochs_ok,
            "loss_converged": job.loss_converged,
            "fatal_error": job.fatal_error,
            "confidence": int(job.confidence),
            "analysis": job.analysis,
            "settled_amount": str(int(job.settled_amount)),
            "fee_amount": str(int(job.fee_amount)),
        }

    # ---- write methods --------------------------------------------------------------

    @gl.public.write.payable
    def create_job(self, provider: str, model_arch: str, dataset_hash: str,
                   base_model_hash: str, target_epochs: int, learning_rate: str) -> None:
        """Renter commissions a job and locks payment (the GEN sent with this call)."""
        value = gl.message.value
        if value == u256(0):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} payment required to lock escrow")
        if target_epochs <= 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} target_epochs must be positive")

        job_id = self.job_count
        self.jobs[job_id] = Job(
            renter=gl.message.sender_address,
            provider=Address(provider),
            payment=value,
            model_arch=model_arch,
            dataset_hash=dataset_hash,
            base_model_hash=base_model_hash,
            target_epochs=u32(target_epochs),
            learning_rate=learning_rate,
            status=STATUS_AWAITING_EVIDENCE,
            log_url="",
            final_model_hash="",
            verdict_valid=False,
            epochs_ok=False,
            loss_converged=False,
            fatal_error=False,
            confidence=u32(0),
            analysis="",
            settled_amount=u256(0),
            fee_amount=u256(0),
        )
        self.job_count = job_id + u256(1)

    @gl.public.write
    def submit_evidence(self, job_id: int, log_url: str, final_model_hash: str) -> None:
        """Provider submits the public training-log URL and the final model hash."""
        job = self._get_job(job_id)
        if gl.message.sender_address != job.provider:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} only the assigned provider can submit evidence")
        if job.status != STATUS_AWAITING_EVIDENCE:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} job is not awaiting evidence")
        if not (log_url.startswith("http://") or log_url.startswith("https://")):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} log_url must be a public http(s) URL")
        if len(final_model_hash.strip()) == 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} final_model_hash required")
        job.log_url = log_url
        job.final_model_hash = final_model_hash

    @gl.public.write
    def adjudicate(self, job_id: int) -> None:
        """Fetch the logs, evaluate them under consensus, and settle the escrow."""
        job = self._get_job(job_id)
        if job.status != STATUS_AWAITING_EVIDENCE:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} job already settled")
        if job.log_url == "":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} no evidence submitted yet")

        # Copy spec into memory: storage is not accessible inside nondet blocks.
        model_arch = job.model_arch
        base_model_hash = job.base_model_hash
        final_model_hash = job.final_model_hash
        target_epochs = int(job.target_epochs)
        learning_rate = job.learning_rate
        log_url = job.log_url

        def leader_fn() -> dict:
            resp = gl.nondet.web.get(log_url)
            if resp.status >= 500:
                raise gl.vm.UserError(f"{ERROR_TRANSIENT} log host unavailable ({resp.status})")
            if resp.status >= 400:
                raise gl.vm.UserError(f"{ERROR_EXTERNAL} log fetch failed ({resp.status})")
            body = resp.body.decode("utf-8", errors="replace") if resp.body else ""
            if len(body.strip()) == 0:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} training log is empty")
            evidence = _trim_log(body)
            prompt = _build_prompt(model_arch, base_model_hash, final_model_hash,
                                   target_epochs, learning_rate, evidence)
            analysis = gl.nondet.exec_prompt(prompt, response_format="json")
            if not isinstance(analysis, dict):
                raise gl.vm.UserError(f"{ERROR_LLM} LLM returned non-dict: {type(analysis)}")
            return _normalize_verdict(analysis)

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)
            mine = leader_fn()
            theirs = leaders_res.calldata
            # Agree only on the core, objective decision fields. Free-text analysis and
            # confidence may differ between validators and are not compared.
            return (
                _to_bool(theirs.get("valid")) == mine["valid"]
                and _to_bool(theirs.get("epochs_ok")) == mine["epochs_ok"]
                and _to_bool(theirs.get("loss_converged")) == mine["loss_converged"]
                and _to_bool(theirs.get("fatal_error")) == mine["fatal_error"]
            )

        verdict = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        # Deterministic context: persist verdict and settle escrow.
        job.verdict_valid = bool(verdict["valid"])
        job.epochs_ok = bool(verdict["epochs_ok"])
        job.loss_converged = bool(verdict["loss_converged"])
        job.fatal_error = bool(verdict["fatal_error"])
        job.confidence = u32(int(verdict["confidence"]))
        job.analysis = str(verdict["analysis"])[:2000]

        payment = int(job.payment)
        if job.verdict_valid:
            fee = payment * int(self.fee_bps) // 10000
            provider_amount = payment - fee
            job.status = STATUS_VERIFIED
            job.settled_amount = u256(provider_amount)
            job.fee_amount = u256(fee)
            self.provider_verified[job.provider] = (
                self.provider_verified.get(job.provider, u256(0)) + u256(1)
            )
            if provider_amount > 0:
                _Payable(job.provider).emit_transfer(value=u256(provider_amount))
            if fee > 0:
                _Payable(self.fee_recipient).emit_transfer(value=u256(fee))
        else:
            job.status = STATUS_REJECTED
            job.settled_amount = u256(payment)
            job.fee_amount = u256(0)
            self.provider_rejected[job.provider] = (
                self.provider_rejected.get(job.provider, u256(0)) + u256(1)
            )
            _Payable(job.renter).emit_transfer(value=u256(payment))

    # ---- view methods ---------------------------------------------------------------

    @gl.public.view
    def get_job_count(self) -> int:
        return int(self.job_count)

    @gl.public.view
    def get_job(self, job_id: int) -> dict:
        return self._job_to_dict(job_id, self._get_job(job_id))

    @gl.public.view
    def get_jobs(self, offset: int = 0, limit: int = 50) -> list:
        out = []
        total = int(self.job_count)
        start = max(0, offset)
        end = min(total, start + max(0, limit))
        for i in range(start, end):
            jid = u256(i)
            if jid in self.jobs:
                out.append(self._job_to_dict(i, self.jobs[jid]))
        return out

    @gl.public.view
    def get_provider_reputation(self, provider: str) -> dict:
        addr = Address(provider)
        return {
            "provider": addr.as_hex,
            "verified": int(self.provider_verified.get(addr, u256(0))),
            "rejected": int(self.provider_rejected.get(addr, u256(0))),
        }

    @gl.public.view
    def get_protocol_info(self) -> dict:
        return {
            "owner": self.owner.as_hex,
            "fee_recipient": self.fee_recipient.as_hex,
            "fee_bps": int(self.fee_bps),
            "job_count": int(self.job_count),
        }
