"""
Regression tests for the nutrition-label parser and recipe-cache state model
(app/foodpro_scraper.py's parse_label / _record_status / _nutrition_from /
RecipeCache.needs_enrichment).

None of these touch the live site - see tests/fixtures/ for real, saved
label.aspx response text (captured live against nutrition.sa.ucsc.edu on
2026-09-06 as part of the nutrition-correctness audit) plus a couple of
clearly-labeled synthetic fragments for cases that don't have a real observed
example (most importantly: parse_failed, since a full 257-recipe live census
found zero real instances of it - see the audit report). Live-site checks are
separate integration verification, run manually against the real scraper.

The one property every test here ultimately guards: a parse failure must
never be indistinguishable from a confirmed, genuine value - in particular,
never from a genuine numeric zero.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.foodpro_scraper import (  # noqa: E402
    _looks_suspicious,
    _nutrition_from,
    _record_status,
    parse_label,
    RecipeCache,
)

FIXTURES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")


def _load(filename: str) -> str:
    with open(os.path.join(FIXTURES_DIR, filename), encoding="utf-8") as f:
        return f.read()


# --------------------------------------------------------------------------
# Real fixtures: normal success, fractional serving size, genuine zero,
# intentionally-blank, confirmed-no-label - all captured live, 2026-09-06.
# --------------------------------------------------------------------------


def test_normal_label_extracts_real_nonzero_values():
    """Steamed Rice - an ordinary, fully-populated label."""
    record = parse_label(_load("label_normal_success.txt"))
    assert record["status"] == "success"
    assert record["calories"] == 144.0
    assert record["protein_g"] == 2.8
    assert record["carbs_g"] == 33.2
    assert record["serving_size"] == "4 oz"
    assert _looks_suspicious(record) is None

    nutrition = _nutrition_from(record)
    assert nutrition.pending is False
    assert nutrition.has_data is True
    assert nutrition.calories == 144.0


def test_fractional_serving_size_chicken_thigh():
    """
    The item that triggered this whole audit. Confirmed against the live
    source (see the audit report): FoodPro itself reports every field as
    literally 0 for this recipe, with a real fractional serving size
    ("3+1/2 oz" - FoodPro's own "+"-separated whole+fraction format). The
    parser must extract this faithfully, AND flag it as suspicious for a
    human to check against FoodPro's own data (a real chicken thigh having
    zero protein is implausible) - without ever changing the value itself.
    """
    record = parse_label(_load("label_chicken_thigh_allzero.txt"))
    assert record["status"] == "success"  # a real value was found: zero
    assert record["calories"] == 0.0
    assert record["protein_g"] == 0.0
    assert record["serving_size"] == "3+1/2 oz"

    reason = _looks_suspicious(record)
    assert reason is not None, "an implausible all-zero real food must be flagged for review"
    assert "3+1/2 oz" in reason

    nutrition = _nutrition_from(record)
    assert nutrition.pending is False, "a genuinely scraped zero is not pending"
    assert nutrition.calories == 0.0, "must not fabricate a nonzero value FoodPro doesn't report"
    assert nutrition.protein_g == 0.0


def test_intentionally_blank_recipe_is_not_flagged_suspicious():
    """
    "Pasta Bar" - a station/build-your-own concept entry. Also genuinely
    all-zero, but FoodPro's own INGREDIENTS line explains it directly
    ("This recipe was intentionally left blank"), so this should NOT be
    flagged the same way an unexplained all-zero result would be.
    """
    record = parse_label(_load("label_intentionally_blank.txt"))
    assert record["status"] == "success"
    assert record["calories"] == 0.0
    assert "intentionally left blank" in (record["ingredients"] or "").lower()
    assert _looks_suspicious(record) is None, "a self-explained zero is not suspicious"

    nutrition = _nutrition_from(record)
    assert nutrition.pending is False
    assert nutrition.calories == 0.0


def test_confirmed_no_label():
    """Organic Gala Apples - FoodPro states outright it has no label."""
    record = parse_label(_load("label_not_available.txt"))
    assert record["status"] == "confirmed_no_label"
    assert record["calories"] is None

    nutrition = _nutrition_from(record)
    assert nutrition.pending is False, "confirmed absence is final, not pending"
    assert nutrition.calories is None
    assert nutrition.has_data is False

    cache = RecipeCache(path="/dev/null")
    cache.put("APPLE", record)
    assert cache.needs_enrichment("APPLE") is False, "a confirmed-absent recipe is never retried"


# --------------------------------------------------------------------------
# Synthetic fixtures: no real observed example exists (a full 257-recipe
# live census found zero parse failures - see the audit report), but the
# code must handle it correctly if one ever occurs. These are deliberately
# minimal, clearly-synthetic fragments, not claimed as real captures.
# --------------------------------------------------------------------------


def test_parser_failure_is_never_confirmed_absent_or_zero():
    """
    A page that loaded, is NOT the "not available" page, but for whatever
    reason (unexpected markup, a genuinely new label layout, a partial
    response) has no parseable Calories value. This is the exact case the
    nutrition-correctness audit was opened over: this must never collapse
    into either "confirmed no label" or a numeric zero.
    """
    adversarial_text = (
        "Some Recipe With Unexpected Markup\n"
        "Nutrition Facts\n"
        "Serving Size 4 oz\n"
        "*Percent Daily Values (DV) are based on a 2,000 calorie diet.\n"
        "Total Fat 5g 8%\n"
        "INGREDIENTS: Something\n"
    )
    record = parse_label(adversarial_text)
    assert record["status"] == "parse_failed"
    assert record["calories"] is None

    nutrition = _nutrition_from(record)
    assert nutrition.pending is True, "a parse failure must present as pending, not confirmed/zero"
    assert nutrition.calories is None
    assert nutrition.calories != 0.0

    cache = RecipeCache(path="/dev/null")
    cache.put("BROKEN", record)
    assert cache.needs_enrichment("BROKEN") is True, "a parse failure must be retried, never treated as final"


def test_missing_optional_nutrient_stays_null_not_zero():
    """
    A label missing one optional field (fiber, here) - a partial extraction
    gap in one field must not be papered over as 0, and must not affect the
    other, successfully-parsed fields.
    """
    partial_text = (
        "Some Item\n"
        "Nutrition Facts\n"
        "Serving Size 1 ea\n"
        "Calories 120\n"
        "Total Fat 4g 6%\n"
        "Tot. Carb. 15g 5%\n"
        "Sugars 2g\n"
        "Protein 6g\n"
        "Sodium 200mg 9%\n"
        "INGREDIENTS: Something\n"
    )
    record = parse_label(partial_text)
    assert record["status"] == "success"
    assert record["calories"] == 120.0
    assert record["protein_g"] == 6.0
    assert record["fiber_g"] is None, "an absent field must stay null"
    assert record["fiber_g"] != 0

    nutrition = _nutrition_from(record)
    assert nutrition.calories == 120.0
    assert nutrition.fiber_g is None


def test_old_cache_format_migrates_without_data_loss():
    """
    Pre-audit cache records only ever carried an "available" boolean, not
    "status". Verifies the exact collapsing bug this audit found: an old
    record with available=True but no calories (the shape a parse failure
    silently produced under the old code) must now be reinterpreted as
    parse_failed/pending/retryable - not left stuck looking like a
    confirmed-absent recipe forever. Real successes and real confirmed-
    absent records in the old format must still resolve correctly too.
    """
    old_confirmed_absent = {"available": False, "calories": None}
    assert _record_status(old_confirmed_absent) == "confirmed_no_label"
    assert _nutrition_from(old_confirmed_absent).pending is False

    old_ambiguous = {"available": True, "calories": None}  # the bug's exact old shape
    assert _record_status(old_ambiguous) == "parse_failed"
    healed = _nutrition_from(old_ambiguous)
    assert healed.pending is True, "must self-heal to retryable, not stay stuck as confirmed-absent"

    old_success = {
        "available": True, "calories": 150.0, "protein_g": 5.0,
        "carbs_g": 10.0, "fat_g": 3.0, "fiber_g": 0.0, "sugar_g": 0.0,
        "sodium_mg": 5.0, "serving_size": "1 ea",
    }
    assert _record_status(old_success) == "success"
    assert _nutrition_from(old_success).calories == 150.0


def test_never_scraped_is_pending_not_zero():
    assert _nutrition_from(None).pending is True
    assert _nutrition_from(None).calories is None
    assert _nutrition_from(None).calories != 0.0


if __name__ == "__main__":
    import pytest

    raise SystemExit(pytest.main([__file__, "-v"]))
