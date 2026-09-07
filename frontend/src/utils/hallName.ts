// Shared short-name convention for a hall's full display name (e.g. "John R.
// Lewis & College Nine Dining Hall" -> "John R. Lewis") - used anywhere a
// hall name needs to fit a compact control (the Menu hall picker, a food
// row's hall tag, the Goals "Preferred Dining Hall" row) rather than each
// call site reimplementing the same split-on-"&" logic slightly differently.
export function shortHallName(name: string): string {
  return name.split("&")[0].trim();
}
