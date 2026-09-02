from pydantic import BaseModel
from typing import Optional


class NutritionInfo(BaseModel):
    calories: Optional[float] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    fiber_g: Optional[float] = None
    sugar_g: Optional[float] = None
    sodium_mg: Optional[float] = None
    serving_size: Optional[str] = None  # e.g. "3 oz" - as FoodPro reports it

    @property
    def has_data(self) -> bool:
        return self.calories is not None


class FoodItem(BaseModel):
    id: str
    name: str
    hall_id: str
    hall_name: str
    menu_type: str  # breakfast / lunch / dinner
    date: str  # YYYY-MM-DD
    station: Optional[str] = None
    portion: Optional[str] = None  # menu-listed portion, e.g. "3 oz", "2 ea"
    nutrition: NutritionInfo
    icons: list[str] = []  # e.g. vegetarian, vegan, gluten-free


class MacroTarget(BaseModel):
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float


class TrayItem(BaseModel):
    food_id: str
    servings: float = 1.0


class TrayRequest(BaseModel):
    items: list[TrayItem]


class TrayTotals(BaseModel):
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float


class SuggestRequest(BaseModel):
    date: str
    menu_type: str
    remaining: MacroTarget
    hall_ids: Optional[list[str]] = None  # None = search all halls
