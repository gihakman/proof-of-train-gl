"""Direct-mode tests for the ProofOfTrain intelligent contract.

Run with:  pytest tests/direct/ -v

Direct mode runs the leader function in-memory (no server/consensus). Web and LLM calls
are mocked. Validator agreement is exercised separately in integration tests.

Note: direct-mode address fixtures are raw 20-byte `bytes`; `_hex()` normalizes them to
0x-prefixed hex strings for the contract's string arguments.
"""

import json
from pathlib import Path

CONTRACT = str(Path(__file__).resolve().parents[2] / "contracts" / "proof_of_train.py")

ONE_GEN = 10**18
FEE_BPS = 100  # 1%


def _hex(addr) -> str:
    if isinstance(addr, (bytes, bytearray)):
        return "0x" + bytes(addr).hex()
    return addr.as_hex


GOOD_LOG = """\
2024-06-01 12:00:01 INFO Starting training run on 4x A100
Epoch 1/3 - step 100 - loss: 2.9134 - lr: 0.0002
Epoch 1/3 - step 200 - loss: 2.4011 - lr: 0.0002
Epoch 2/3 - step 300 - loss: 1.8552 - lr: 0.0002
Epoch 2/3 - step 400 - loss: 1.3007 - lr: 0.0002
Epoch 3/3 - step 500 - loss: 0.8423 - lr: 0.0002
Epoch 3/3 - step 600 - loss: 0.5121 - lr: 0.0002
Training complete. Saved final model checkpoint sha256:abcd.
"""

VERDICT_VERIFIED = json.dumps({
    "valid": True, "epochs_ok": True, "loss_converged": True,
    "fatal_error": False, "confidence": 93,
    "analysis": "Loss decreases monotonically across all 3 epochs; no fatal errors.",
})

VERDICT_REJECTED = json.dumps({
    "valid": False, "epochs_ok": False, "loss_converged": False,
    "fatal_error": True, "confidence": 88,
    "analysis": "Loss values are static and the run ends with a NaN/OOM.",
})


def _deploy(direct_vm, direct_deploy, owner, fee_recipient):
    direct_vm.sender = owner
    return direct_deploy(CONTRACT, _hex(fee_recipient), FEE_BPS)


def _create_job(direct_vm, contract, renter, provider, payment=ONE_GEN):
    direct_vm.sender = renter
    direct_vm.value = payment
    contract.create_job(
        _hex(provider), "llama-3-8b", "ds:0xdeadbeef", "base:0xcafe", 3, "2e-4",
    )
    direct_vm.value = 0


# --- deployment & protocol config --------------------------------------------------

def test_deploy_sets_protocol_info(direct_vm, direct_deploy, direct_owner, direct_charlie):
    contract = _deploy(direct_vm, direct_deploy, direct_owner, direct_charlie)
    info = contract.get_protocol_info()
    assert info["fee_bps"] == FEE_BPS
    assert info["job_count"] == 0
    assert info["owner"].lower() == _hex(direct_owner).lower()
    assert info["fee_recipient"].lower() == _hex(direct_charlie).lower()


# --- create_job / escrow -----------------------------------------------------------

def test_create_job_locks_escrow(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_vm, direct_deploy, direct_owner, direct_charlie)
    _create_job(direct_vm, contract, direct_alice, direct_bob)

    assert contract.get_job_count() == 1
    job = contract.get_job(0)
    assert job["status"] == "AWAITING_EVIDENCE"
    assert job["payment"] == str(ONE_GEN)
    assert job["renter"].lower() == _hex(direct_alice).lower()
    assert job["provider"].lower() == _hex(direct_bob).lower()
    assert job["target_epochs"] == 3
    assert job["log_url"] == ""


def test_create_job_requires_payment(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_vm, direct_deploy, direct_owner, direct_charlie)
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    with direct_vm.expect_revert("payment required"):
        contract.create_job(_hex(direct_bob), "llama", "ds", "base", 3, "2e-4")


def test_create_job_rejects_zero_epochs(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_vm, direct_deploy, direct_owner, direct_charlie)
    direct_vm.sender = direct_alice
    direct_vm.value = ONE_GEN
    with direct_vm.expect_revert("target_epochs must be positive"):
        contract.create_job(_hex(direct_bob), "llama", "ds", "base", 0, "2e-4")


# --- submit_evidence ---------------------------------------------------------------

def test_submit_evidence_only_provider(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_vm, direct_deploy, direct_owner, direct_charlie)
    _create_job(direct_vm, contract, direct_alice, direct_bob)

    direct_vm.sender = direct_alice  # renter is not the provider
    with direct_vm.expect_revert("only the assigned provider"):
        contract.submit_evidence(0, "https://logs.example.com/run", "model:0x1")

    direct_vm.sender = direct_bob  # provider can submit
    contract.submit_evidence(0, "https://logs.example.com/run", "model:0x1")
    job = contract.get_job(0)
    assert job["log_url"] == "https://logs.example.com/run"
    assert job["final_model_hash"] == "model:0x1"


def test_submit_evidence_rejects_bad_url(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_vm, direct_deploy, direct_owner, direct_charlie)
    _create_job(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("public http(s) URL"):
        contract.submit_evidence(0, "ftp://nope", "model:0x1")


# --- adjudicate: verified path -----------------------------------------------------

def test_adjudicate_verified_releases_to_provider(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_vm, direct_deploy, direct_owner, direct_charlie)
    _create_job(direct_vm, contract, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    contract.submit_evidence(0, "https://logs.example.com/run", "model:0x1")

    direct_vm.mock_web(r".*logs\.example\.com.*", {"status": 200, "body": GOOD_LOG})
    direct_vm.mock_llm(r"forensic verifier", VERDICT_VERIFIED)

    direct_vm.sender = direct_alice
    contract.adjudicate(0)

    job = contract.get_job(0)
    assert job["status"] == "VERIFIED"
    assert job["verdict_valid"] is True
    assert job["loss_converged"] is True
    assert job["fatal_error"] is False
    expected_fee = ONE_GEN * FEE_BPS // 10000
    assert job["fee_amount"] == str(expected_fee)
    assert job["settled_amount"] == str(ONE_GEN - expected_fee)

    rep = contract.get_provider_reputation(_hex(direct_bob))
    assert rep["verified"] == 1
    assert rep["rejected"] == 0


# --- adjudicate: rejected path -----------------------------------------------------

def test_adjudicate_rejected_refunds_renter(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_vm, direct_deploy, direct_owner, direct_charlie)
    _create_job(direct_vm, contract, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    contract.submit_evidence(0, "https://logs.example.com/run", "model:0x1")

    direct_vm.mock_web(r".*logs\.example\.com.*", {"status": 200, "body": "loss: nan\nloss: nan\n"})
    direct_vm.mock_llm(r"forensic verifier", VERDICT_REJECTED)

    direct_vm.sender = direct_alice
    contract.adjudicate(0)

    job = contract.get_job(0)
    assert job["status"] == "REJECTED"
    assert job["verdict_valid"] is False
    assert job["settled_amount"] == str(ONE_GEN)  # full refund
    assert job["fee_amount"] == "0"

    rep = contract.get_provider_reputation(_hex(direct_bob))
    assert rep["verified"] == 0
    assert rep["rejected"] == 1


def test_adjudicate_requires_evidence(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_vm, direct_deploy, direct_owner, direct_charlie)
    _create_job(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("no evidence submitted"):
        contract.adjudicate(0)


def test_cannot_adjudicate_twice(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_vm, direct_deploy, direct_owner, direct_charlie)
    _create_job(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    contract.submit_evidence(0, "https://logs.example.com/run", "model:0x1")

    direct_vm.mock_web(r".*logs\.example\.com.*", {"status": 200, "body": GOOD_LOG})
    direct_vm.mock_llm(r"forensic verifier", VERDICT_VERIFIED)
    direct_vm.sender = direct_alice
    contract.adjudicate(0)

    with direct_vm.expect_revert("already settled"):
        contract.adjudicate(0)


def test_adjudicate_empty_log_reverts(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_vm, direct_deploy, direct_owner, direct_charlie)
    _create_job(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    contract.submit_evidence(0, "https://logs.example.com/run", "model:0x1")

    direct_vm.mock_web(r".*logs\.example\.com.*", {"status": 200, "body": "   "})
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("training log is empty"):
        contract.adjudicate(0)


# --- pagination --------------------------------------------------------------------

def test_get_jobs_pagination(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    contract = _deploy(direct_vm, direct_deploy, direct_owner, direct_charlie)
    for _ in range(3):
        _create_job(direct_vm, contract, direct_alice, direct_bob)

    assert contract.get_job_count() == 3
    all_jobs = contract.get_jobs(0, 50)
    assert len(all_jobs) == 3
    page = contract.get_jobs(1, 1)
    assert len(page) == 1
    assert page[0]["id"] == 1
