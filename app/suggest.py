"""
Suggests menu items that best fill a remaining macro gap.

v1 approach: greedy best-fit. For each candidate item, score how well it
moves you toward ALL remaining targets at once (protein/carbs/fat/calories)
without blowing past any of them too badly. Pick the best, subtract it from
the remaining target, repeat.

This isn't true knapsack-optimal, but it's fast, explainable, and good
enough for "here's 3-5 things that'd get you close." A real optimization
pass (e.g. integer programming via PuLP, or DP on calories) is a natural
v2 if you want to flex more CS on this.
"""

from app.models import FoodItem, MacroTarget


def _score_item(item: FoodItem, remaining: MacroTarget) -> float:
    """Lower is better. Penalizes overshooting any single macro target."""
    n = item.nutrition
    if not n.has_data:
        return float("inf")

    def gap_score(have: float, need: float) -> float:
        if need <= 0:
            # already at/over target for this macro - any more is a penalty
            return have * 2
        # reward getting close to the need, penalize overshoot harder than undershoot
        diff = need - have
        if diff < 0:
            return abs(diff) * 1.5  # overshoot penalty
        return diff * 0.5  # undershoot is fine, still counts as "left to find"

    score = 0.0
    score += gap_score(n.calories or 0, remaining.calories)
    score += gap_score(n.protein_g or 0, remaining.protein_g) * 3  # weight protein higher - usually the hard macro to hit
    score += gap_score(n.carbs_g or 0, remaining.carbs_g)
    score += gap_score(n.fat_g or 0, remaining.fat_g)
    return score


def suggest_items(items: list[FoodItem], remaining: MacroTarget, max_suggestions: int = 5) -> list[FoodItem]:
    """Greedily pick items that best close the remaining macro gap."""
    candidates = [i for i in items if i.nutrition.has_data]
    picked: list[FoodItem] = []
    remaining_copy = remaining.model_copy()

    for _ in range(max_suggestions):
        if remaining_copy.calories <= 50:  # close enough, stop
            break
        if not candidates:
            break

        scored = sorted(candidates, key=lambda i: _score_item(i, remaining_copy))
        best = scored[0]
        picked.append(best)
        candidates.remove(best)

        n = best.nutrition
        remaining_copy = MacroTarget(
            calories=remaining_copy.calories - (n.calories or 0),
            protein_g=remaining_copy.protein_g - (n.protein_g or 0),
            carbs_g=remaining_copy.carbs_g - (n.carbs_g or 0),
            fat_g=remaining_copy.fat_g - (n.fat_g or 0),
        )

    return picked
