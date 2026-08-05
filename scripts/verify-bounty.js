import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const online = process.argv.includes("--online");
const results = [];

function check(label, condition, detail = "") {
  results.push({ label, pass: Boolean(condition), detail });
  if (!condition) process.exitCode = 1;
}

function file(path) { return readFileSync(join(root, path), "utf8"); }

const requiredFiles = [
  "README.md", "ARCHITECTURE.md", "BOUNTY_EVIDENCE.md", "BOUNTY_MANIFEST.json",
  "DEMO.md", "LIVE_TESTNET_PROOF.md", "ORIGINALITY.md", ".env.example",
  "src/payment.js", "src/client.js", "src/stellar-voucher-settlement.js",
  "src/etherfuse.js", "src/etherfuse-stellar.js", "test/payment.test.js",
  "test/bounty-flow.test.js"
];
check("Required evaluator files", requiredFiles.every((path) => existsSync(join(root, path))), `${requiredFiles.length} expected files`);

let manifest;
try { manifest = JSON.parse(file("BOUNTY_MANIFEST.json")); }
catch (error) { check("Machine-readable manifest", false, error.message); }

if (manifest) {
  check("Machine-readable manifest", manifest.schemaVersion === "1.0" && manifest.project?.name, manifest.project?.name);
  check("Agentic payment declaration", manifest.submissions?.agenticPayments?.protocol === "HTTP 402 / MPP Charge", `${manifest.submissions?.agenticPayments?.amount} ${manifest.submissions?.agenticPayments?.asset}`);
  check("Off-ramp declaration", manifest.submissions?.passengerVoucherOffRamp?.destinationRail === "PIX", `${manifest.submissions?.passengerVoucherOffRamp?.sourceAsset} -> ${manifest.submissions?.passengerVoucherOffRamp?.destinationCurrency}/PIX`);
}

const paymentSource = file("src/payment.js");
const serverSource = file("src/server.js");
const stellarVoucherSource = file("src/stellar-voucher-settlement.js");
const etherfuseSource = file("src/etherfuse.js") + file("src/etherfuse-stellar.js");
check("HTTP 402 implementation", /status:\s*402/.test(paymentSource) && /x-payment-amount/.test(paymentSource), "machine-readable challenge");
check("MPP Stellar configuration", /stellar\.charge/.test(paymentSource) && /stellar:testnet/.test(paymentSource), "MPP Charge on Testnet");
check("Protected paid endpoint", /\/api\/premium-trip-plan/.test(serverSource), "POST /api/premium-trip-plan");
check("Full symbolic voucher funding", /voucher face value/.test(stellarVoucherSource) && /Operation\.payment/.test(stellarVoucherSource), "issuer treasury -> traveler");
check("Etherfuse off-ramp adapter", /\/ramp\/quote/.test(etherfuseSource) && /\/ramp\/order/.test(etherfuseSource), "quote + order + Stellar anchor");
check("No committed local secrets", !existsSync(join(root, ".env")) || file(".gitignore").split(/\r?\n/).includes(".env"), ".env is ignored");

const tests = spawnSync(process.execPath, ["--test"], { cwd: root, encoding: "utf8" });
const testSummary = `${tests.stdout}\n${tests.stderr}`.match(/tests\s+(\d+)/)?.[1] || "unknown";
check("Automated test suite", tests.status === 0, `${testSummary} tests`);

if (online && manifest) {
  const proofs = [
    ["MPP payment", manifest.submissions?.agenticPayments?.liveProof],
    ["Booking proof", manifest.submissions?.agenticPayments?.bookingProof],
    ["Voucher funding", manifest.submissions?.passengerVoucherOffRamp?.voucherFundingProof],
    ["Off-ramp anchor", manifest.submissions?.passengerVoucherOffRamp?.offRampAnchorProof]
  ];
  for (const [label, proof] of proofs) {
    const hash = proof?.transactionHash;
    if (!hash) { check(`Online Stellar proof: ${label}`, false, "missing transaction hash"); continue; }
    try {
      const response = await fetch(`https://horizon-testnet.stellar.org/transactions/${hash}`, { signal: AbortSignal.timeout(15000) });
      const transaction = response.ok ? await response.json() : null;
      check(`Online Stellar proof: ${label}`, response.ok && transaction?.hash === hash && transaction?.successful === true, response.ok ? `ledger ${transaction.ledger}` : `HTTP ${response.status}`);
    } catch (error) {
      check(`Online Stellar proof: ${label}`, false, error.message);
    }
  }
}

console.log("\nBIT Travels bounty verification\n");
for (const result of results) console.log(`${result.pass ? "PASS" : "FAIL"}  ${result.label}${result.detail ? ` — ${result.detail}` : ""}`);
const passed = results.filter((result) => result.pass).length;
console.log(`\n${passed}/${results.length} checks passed${online ? " (including online proof)" : ""}.`);
if (process.exitCode) console.log("Bounty readiness: FAIL");
else console.log("Bounty readiness: PASS");
