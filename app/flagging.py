"""Explainable flags from the original VAE output and separate synthetic flag evidence."""

FLAG_EVIDENCE_FIELDS = [
    "duplicate_identity_reference_count", "identity_document_consistency",
    "application_detail_consistency", "contact_reference_consistency",
    "beneficiary_reference_consistency", "repeat_submission_count",
]


def build_application_flags(application, score, threshold, review_recommended):
    """Return flags only when the corresponding score/input condition is present."""
    flags = []
    if review_recommended:
        flags.append({
            "code": "review_suggested", "category": "model", "name": "Review Suggested",
            "severity": "review", "triggering_value": score, "reference": f"> {threshold:g}",
            "explanation": "The returned reconstruction score is above the calibrated review threshold; a human should assess it.",
        })
    else:
        flags.append({
            "code": "within_range", "category": "model", "name": "Within Range",
            "severity": "info", "triggering_value": score, "reference": f"≤ {threshold:g}",
            "explanation": "The returned reconstruction score is at or below the calibrated review threshold.",
        })

    if threshold > 0 and score >= 3 * threshold:
        flags.append({
            "code": "high_statistical_deviation", "category": "statistical", "name": "High Statistical Deviation",
            "severity": "high", "triggering_value": score, "reference": f"≥ 3× threshold ({3 * threshold:g})",
            "explanation": "The raw reconstruction score is at least three times the calibrated threshold; this is statistical deviation, not evidence of wrongdoing.",
        })

    consistency_fields = (
        "identity_document_consistency", "application_detail_consistency",
        "contact_reference_consistency", "beneficiary_reference_consistency",
    )
    inconsistent = [(field, application.get(field, 0.98)) for field in consistency_fields if application.get(field, 0.98) < 0.8]
    if inconsistent:
        value = ", ".join(f"{field}={actual:g}" for field, actual in inconsistent)
        flags.append({
            "code": "synthetic_consistency_deviation", "category": "consistency", "name": "Synthetic consistency deviation",
            "severity": "warning", "triggering_value": value, "reference": "demo rule: indicator < 0.80",
            "explanation": "An optional synthetic consistency value is below the demo rule. It is separate from VAE scoring and does not verify identity or establish wrongdoing.",
        })

    duplicate_count = application.get("duplicate_identity_reference_count", 0)
    if duplicate_count > 1:
        flags.append({
            "code": "repeated_opaque_reference_count", "category": "consistency", "name": "Repeated opaque reference count",
            "severity": "warning", "triggering_value": duplicate_count, "reference": "demo rule: count > 1",
            "explanation": "The optional synthetic count exceeds its demo rule. No underlying identity value is present and no identity check was performed.",
        })

    behavior_values = []
    velocity = application["submission_velocity_24h"]
    changes = application["recent_change_count"]
    repeats = application.get("repeat_submission_count", 0)
    if velocity > 5:
        behavior_values.append(f"submission_velocity_24h={velocity:g}")
    if changes > 6:
        behavior_values.append(f"recent_change_count={changes:g}")
    if repeats > 3:
        behavior_values.append(f"repeat_submission_count={repeats:g}")
    if behavior_values:
        flags.append({
            "code": "unusual_submission_behaviour", "category": "behavior", "name": "Unusual Submission Behaviour",
            "severity": "warning", "triggering_value": ", ".join(behavior_values),
            "reference": "demo rule: >5 submissions/24h, >6 recent changes, or >3 repeated submissions",
            "explanation": "One or more submitted counts exceed an explicit demo rule. This signal does not establish intent.",
        })
    return flags
