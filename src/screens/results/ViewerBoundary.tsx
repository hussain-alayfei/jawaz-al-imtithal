import { Component, type ErrorInfo, type ReactNode } from "react";

/* Keeps the register usable when the 3D viewer cannot start (no WebGL, or its code failed to load):
   the frame shows the fallback instead of the whole screen going blank. */

interface ViewerBoundaryProps {
  fallback: ReactNode;
  /** A new key (another file) gives the viewer a fresh start. */
  resetKey?: string;
  children: ReactNode;
}

export class ViewerBoundary extends Component<ViewerBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("3D viewer failed", error, info.componentStack);
  }

  componentDidUpdate(previous: ViewerBoundaryProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
