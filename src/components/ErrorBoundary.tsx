import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { submitTicket } from "@/lib/supportTickets";

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
  digest: string | null;
  reported: boolean;
}

/**
 * Top-level error boundary. Catches render-time exceptions and shows a
 * friendly fallback. The raw error is logged to the console only - it is
 * NEVER rendered to the user (regulatory requirement: no raw error /
 * Edge-Function / Stream-failed strings ever visible).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, digest: null, reported: false };

  static getDerivedStateFromError(error: Error): State {
    // 8-char digest derived from the message so users can quote it in support.
    let h = 0;
    const src = `${error.name}:${error.message}`;
    for (let i = 0; i < src.length; i++) h = ((h << 5) - h + src.charCodeAt(i)) | 0;
    const digest = (h >>> 0).toString(36).padStart(7, "0").slice(0, 8).toUpperCase();
    return { error, digest, reported: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Console-only - do not surface raw text to the user.
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error, info);
    // Fire-and-forget: log the crash as a support ticket so it lands in the
    // Owner Console without the user having to do anything. We only try
    // once per mounted error to avoid hammering the function on retries.
    if (this.state.reported) return;
    this.setState({ reported: true });
    const label = this.props.label ?? "route";
    const digest = this.state.digest ?? "UNKNOWN";
    const page =
      typeof window !== "undefined" ? window.location.pathname + window.location.search : "(ssr)";
    const subject = `[crash:${label}] ${digest} — ${error.message.slice(0, 140)}`;
    const stack = (info?.componentStack ?? "").trim().split("\n").slice(0, 12).join("\n");
    const message = [
      `Error: ${error.name}: ${error.message}`,
      `Digest: ${digest}`,
      `Surface: ${label}`,
      `Page: ${page}`,
      `UA: ${typeof navigator !== "undefined" ? navigator.userAgent : "n/a"}`,
      ``,
      `Stack:`,
      (error.stack ?? "").split("\n").slice(0, 14).join("\n"),
      ``,
      `Component stack:`,
      stack,
    ].join("\n").slice(0, 4900);
    submitTicket({
      subject,
      message,
      category: "bug",
      severity: "high",
      source: "other",
      page_url: page,
    }).catch((e) => {
      // eslint-disable-next-line no-console
      console.error("[ErrorBoundary] auto-ticket failed", e);
    });
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset = () => this.setState({ error: null, digest: null, reported: false });

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
            We hit an unexpected problem loading this page. The issue has been logged and a ticket was opened in support. You can try again or head back to the dashboard.
          </p>
          {this.state.digest && (
            <p className="text-[11px] text-muted-foreground/80 font-mono">
              Reference: {this.state.digest}
            </p>
          )}
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