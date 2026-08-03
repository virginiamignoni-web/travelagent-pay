const form = document.querySelector("#trip-form");
const idle = document.querySelector("#idle");
const run = document.querySelector("#run");
const steps = document.querySelector("#steps");
const payButton = document.querySelector("#approve-payment");
const networkLabel = document.querySelector("#network-label");
const walletButton = document.querySelector("#connect-wallet");
let runtimeMode = "local";
let connectedWallet = null;

function shortAddress(address) {
  return `${address.slice(0, 5)}…${address.slice(-4)}`;
}

function setWalletButton(label, state = "idle") {
  walletButton.textContent = label;
  walletButton.dataset.state = state;
}

async function connectFreighter() {
  const api = window.freighterApi;
  if (!api) {
    setWalletButton("Install Freighter", "error");
    window.open("https://freighter.app/", "_blank", "noopener,noreferrer");
    return;
  }

  setWalletButton("Connecting…", "pending");
  walletButton.disabled = true;

  try {
    const connection = await api.isConnected();
    if (!connection.isConnected) throw new Error("Freighter extension not detected");

    const access = await api.requestAccess();
    if (access.error || !access.address) throw new Error(access.error || "Wallet access was not approved");

    const network = await api.getNetwork();
    if (network.error) throw new Error(network.error);
    if (network.network !== "TESTNET") throw new Error(`Switch Freighter from ${network.network} to TESTNET`);

    connectedWallet = { address: access.address, network: network.network };
    setWalletButton(`${shortAddress(access.address)} · Testnet`, "connected");
  } catch (error) {
    connectedWallet = null;
    setWalletButton(error.message, "error");
  } finally {
    walletButton.disabled = false;
  }
}

walletButton.addEventListener("click", connectFreighter);

fetch("/api/health")
  .then((response) => response.json())
  .then((health) => {
    runtimeMode = health.paymentMode;
    networkLabel.textContent = runtimeMode === "stellar" ? "Stellar Testnet · MPP live" : "Local rehearsal mode";
  })
  .catch(() => {
    networkLabel.textContent = "Payment mode unavailable";
  });
const planNode = document.querySelector("#plan");
const agentCity = document.querySelector("#agent-city");

let tripInput;

function addStep(text, state = "done") {
  const item = document.createElement("li");
  item.className = state;
  item.textContent = text;
  steps.append(item);
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function renderPlan(plan) {
  planNode.innerHTML = `
    <h3>${plan.headline}</h3>
    <p>${plan.destination} · ${plan.planningNote}</p>
    <div class="plan-grid">
      <div><b>Stay near</b><br>${plan.recommendedAreas.slice(0,2).join(" or ")}</div>
      <div><b>Budget</b><br>R$ ${plan.budget.totalBrl.toLocaleString()}</div>
      <div><b>Transport</b><br>${plan.transportPlan[0]}</div>
      <div><b>First day</b><br>${plan.itinerary[0].focus}</div>
    </div>`;
  planNode.classList.remove("hidden");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  tripInput = Object.fromEntries(new FormData(form));
  tripInput.days = Number(tripInput.days);
  tripInput.budget = Number(tripInput.budget);
  steps.innerHTML = "";
  planNode.classList.add("hidden");
  payButton.classList.add("hidden");
  idle.classList.add("hidden");
  run.classList.remove("hidden");
  agentCity.textContent = `Planning ${tripInput.destination}`;

  addStep("Trip request understood");
  if (connectedWallet) addStep(`Traveler wallet connected · ${shortAddress(connectedWallet.address)}`);
  await wait(350);
  const previewResponse = await fetch("/api/trip-preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tripInput) });
  const preview = await previewResponse.json();
  addStep(`Itinerary strategy created for ${preview.days} days`);
  await wait(350);
  addStep("Premium travel intelligence selected");
  await wait(350);

  const paidResponse = await fetch("/api/premium-trip-plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tripInput) });
  if (paidResponse.status === 402) {
    addStep("Payment required — 0.01 test USDC", "wait");
    payButton.innerHTML = runtimeMode === "local"
      ? "Approve demo payment — 0.01 test USDC <span>→</span>"
      : "Complete payment with npm run pay";
    payButton.disabled = runtimeMode !== "local";
    payButton.classList.remove("hidden");
  }
});

payButton.addEventListener("click", async () => {
  payButton.disabled = true;
  payButton.innerHTML = "Creating rehearsal receipt… <span>◌</span>";
  await wait(650);
  const response = await fetch("/api/premium-trip-plan", {
    method: "POST",
    headers: { "content-type": "application/json", "x-demo-payment": "approved" },
    body: JSON.stringify(tripInput),
  });
  if (!response.ok) throw new Error(`Payment flow returned ${response.status}`);
  const plan = await response.json();
  addStep("Demo payment receipt created");
  await wait(350);
  addStep("Premium itinerary unlocked");
  renderPlan(plan);
  payButton.classList.add("hidden");
  payButton.disabled = false;
});
