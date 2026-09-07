// A loading placeholder shaped like the real .food-row it stands in for
// (name-width bar + meta-width bar + a circular add-button placeholder), not
// a generic centered spinner - so the page shell/structure is visible
// immediately and the loading state doesn't jump the layout once real rows
// replace it.

export function SkeletonFoodRow() {
  return (
    <div className="food-row skeleton-row" aria-hidden="true">
      <div className="food-row-info">
        <div className="skeleton-bar skeleton-bar-name" />
        <div className="skeleton-bar skeleton-bar-meta" />
      </div>
      <div className="skeleton-circle" />
    </div>
  );
}
