import { randomUUID } from "node:crypto";

const sessions = new Map();

function publicSession(session) {
  return structuredClone(session);
}

export function createApprovalSession({ input = {}, contingencyPlan, decision } = {}) {
  const sessionId = randomUUID();
  const createdAt = new Date().toISOString();
  const maxAutoActionBrl = Math.max(0, Number(input.autonomyLimitBrl) || 100);
  const actions = (contingencyPlan?.actions || []).map((item) => ({
    id: randomUUID(),
    sourceActionId: item.id,
    category: item.category,
    title: item.action,
    trigger: item.trigger,
    target: item.target,
    estimatedDeltaBrl: item.estimatedDeltaBrl,
    reserveCovers: item.reserveCovers,
    status: "pending_approval",
    requiresApproval: true,
    autoEligible: item.estimatedDeltaBrl !== null && item.estimatedDeltaBrl <= maxAutoActionBrl,
    supplierExecutionAvailable: false,
    audit: [{ at: createdAt, event: "proposed", actor: "BIT Travels Concierge" }],
  }));

  const session = {
    sessionId,
    createdAt,
    updatedAt: createdAt,
    status: actions.length ? "awaiting_decisions" : "no_actions",
    protectionScore: decision?.protectionScore ?? null,
    policy: {
      maxAutoActionBrl,
      mode: "human-in-control",
      rule: "Supplier purchases, bookings, cancellations, and itinerary changes always require explicit traveler approval.",
    },
    actions,
    ledger: [{ at: createdAt, event: "session_created", actionCount: actions.length }],
    disclaimer: "Authorization is recorded by this working prototype. It does not issue a ticket, reserve a room, charge a supplier, or change an itinerary until the corresponding commercial API is connected.",
  };
  sessions.set(sessionId, session);
  return publicSession(session);
}

export function decideApprovalAction({ sessionId, actionId, decision, actor = "traveler" } = {}) {
  const session = sessions.get(sessionId);
  if (!session) throw Object.assign(new Error("Approval session was not found or expired"), { statusCode: 404 });
  const action = session.actions.find((item) => item.id === actionId);
  if (!action) throw Object.assign(new Error("Approval action was not found"), { statusCode: 404 });
  if (!['authorized', 'rejected'].includes(decision)) throw Object.assign(new Error("Decision must be authorized or rejected"), { statusCode: 400 });
  if (action.status !== "pending_approval") throw Object.assign(new Error("This action already has a final decision"), { statusCode: 409 });

  const at = new Date().toISOString();
  action.status = decision;
  action.decidedAt = at;
  action.decidedBy = actor;
  action.audit.push({ at, event: decision, actor });
  session.updatedAt = at;
  session.ledger.push({ at, event: `action_${decision}`, actionId, actor });
  const pending = session.actions.filter((item) => item.status === "pending_approval").length;
  session.status = pending ? "awaiting_decisions" : "decisions_complete";
  return publicSession(session);
}

export function getApprovalSession(sessionId) {
  const session = sessions.get(sessionId);
  return session ? publicSession(session) : null;
}

