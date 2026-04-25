/**
 * Round 41 — withTabBoundary HOC.
 *
 * Wraps a tab screen's default export with `<ErrorBoundary variant="tab">`
 * so a JS error in one tab doesn't blank the whole app — the tab itself
 * shows a "This section isn't working right now" fallback with Retry.
 *
 * Usage:
 *   function Screen() { ... }
 *   export default withTabBoundary(Screen, 'Home');
 */
import React from 'react';
import ErrorBoundary from './ErrorBoundary';

export function withTabBoundary<P extends object>(
  Component: React.ComponentType<P>,
  tabName: string,
): React.ComponentType<P> {
  const Wrapped: React.FC<P> = (props) => (
    <ErrorBoundary variant="tab" tabName={tabName}>
      <Component {...props} />
    </ErrorBoundary>
  );
  Wrapped.displayName = `withTabBoundary(${tabName})`;
  return Wrapped;
}
