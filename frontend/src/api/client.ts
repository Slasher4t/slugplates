// Fetch wrappers around the SlugEats FastAPI/Playwright scraper backend.
//
// Base URL comes from VITE_API_BASE_URL (see .env.example) so the same build
// can point at localhost in dev and a real deployment in prod. That backend
// is NOT Vercel-hostable itself - it runs Playwright and a cold hall scrape
// can take up to ~90s, which blows past serverless function time limits - so
// it needs a host with a persistent process (Fly.io/Render/Railway/a VPS).
// See the README for the deployment note this implies.

import type { FoodItem, LocationGroups, MealType } from "./types";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* non-JSON error body - keep statusText */
    }
    throw new ApiError(detail, res.status);
  }
  return res.json();
}

export function getLocations(): Promise<LocationGroups> {
  return request<LocationGroups>("/locations");
}

export function getHallMenu(hallId: string, mealType: MealType, date: string): Promise<FoodItem[]> {
  const qs = new URLSearchParams({ menu_type: mealType, date });
  return request<FoodItem[]>(`/menu/${encodeURIComponent(hallId)}?${qs}`);
}

export function searchFood(query: string, mealType: MealType, date: string): Promise<FoodItem[]> {
  const qs = new URLSearchParams({ q: query, menu_type: mealType, date });
  return request<FoodItem[]>(`/search?${qs}`);
}

export { ApiError, BASE_URL };
