from app.flagging import build_application_flags


def application(**overrides):
    values = {
        "submission_velocity_24h": 1,
        "recent_change_count": 0,
    }
    return {**values, **overrides}


def test_flags_follow_actual_scoring_and_input_signals():
    assert [flag["code"] for flag in build_application_flags(application(), 0.1, 0.2, False)] == ["within_range"]
    flags = build_application_flags(application(
        identity_document_consistency=0.79,
        duplicate_identity_reference_count=2,
        submission_velocity_24h=6,
        repeat_submission_count=4,
    ), 0.61, 0.2, True)
    assert {flag["code"] for flag in flags} == {
        "review_suggested", "high_statistical_deviation", "synthetic_consistency_deviation",
        "repeated_opaque_reference_count", "unusual_submission_behaviour",
    }
    assert all(flag["explanation"] for flag in flags)


def test_threshold_equality_is_within_range_but_high_deviation_boundary_is_inclusive():
    equal_threshold = build_application_flags(application(), 0.2, 0.2, False)
    assert equal_threshold[0]["code"] == "within_range"
    assert not any(flag["code"] == "high_statistical_deviation" for flag in equal_threshold)
    high_boundary = build_application_flags(application(), 0.61, 0.2, True)
    assert any(flag["code"] == "high_statistical_deviation" for flag in high_boundary)
