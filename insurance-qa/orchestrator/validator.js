const REQUIRED_BY_TYPE = {
  claimcard: ["type", "claim_scene", "conditions", "missing_info", "notes"],
  coveragecard: ["type", "coverage"],
  policyselectcard: ["type", "title", "reason", "options"],
  materialcard: ["type", "claim_type"],
  hospitalcard: ["type", "title", "scopes"],
  enrollmentcard: ["type", "title", "eligible_groups"],
};

function validateCard(card) {
  if (!card || typeof card !== "object") {
    return { ok: false, errors: ["card must be an object"] };
  }
  const type = card.type;
  const required = REQUIRED_BY_TYPE[type];
  if (!required) return { ok: false, errors: [`unsupported card type: ${type}`] };
  const errors = required.filter(field => card[field] === undefined).map(field => `missing field: ${field}`);
  if (type === "claimcard" && card.claim_scene) {
    for (const field of ["claim_type", "coverage_name", "support_status", "confidence", "reason"]) {
      if (card.claim_scene[field] === undefined) errors.push(`missing claim_scene.${field}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function validateCards(cards, intents) {
  const results = cards.map(item => validateCard(item.card || item));
  const errors = results.flatMap((result, index) => result.errors.map(error => `card ${index + 1}: ${error}`));
  if (cards.length !== intents.length) {
    errors.push(`card count ${cards.length} does not match intent count ${intents.length}`);
  }
  return { ok: errors.length === 0, errors, results };
}

module.exports = {
  validateCard,
  validateCards,
};

