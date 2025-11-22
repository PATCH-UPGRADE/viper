import type React from "react";

/**
 * Adds a display name to a React component
 * Useful for React DevTools and debugging
 *
 * @param Component - React component to add display name to
 * @param name - Display name (defaults to component's function name)
 * @returns The same component with display name set
 *
 * @example
 * const MyComponent = forwardRef<HTMLDivElement>((props, ref) => <div ref={ref} />);
 * export default withDisplayName(MyComponent, 'MyComponent');
 */
export function withDisplayName<T extends React.ComponentType<any>>(
  Component: T,
  name?: string,
): T {
  Component.displayName = name || Component.name;
  return Component;
}
