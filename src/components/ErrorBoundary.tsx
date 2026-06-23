import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Friendly label for the surface that failed, e.g. "Risk page". */
  label?: string;
  /** Clears a captured route error when this key changes. */
  resetKey?: string;
  /** Custom fallback override. */
  fallback?: (reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary. Catches render-time exceptions and shows a
 * friendly fallback. The raw error is logged to the console only - it is
 * NEVER rendered to the user (regulatory requirement: no raw error /
 * Edge-Function / Stream-failed strings ever visible).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Console-only - do not surface raw text to the user.
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error, info);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);
    return (
      <div className="p-8 flex flex-col items-center justify-center text-center gap-4 min-h-[40vh]">
        <div className="rounded-full bg-destructive/10 p-3">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            We hit an unexpected problem loading this page. The issue has been logged. You can try again or head back to the dashboard.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={this.reset}>
            <RotateCcw className="h-4 w-4" /> Try again
          </Button>
          <Button asChild>
            <a href="/dashboard">Go to dashboard</a>
          </Button>
        </div>
      </div>
    );
  }
}