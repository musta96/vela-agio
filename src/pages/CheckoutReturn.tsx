import { useSearchParams, Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { TopNav } from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { UpgradeStepper } from "@/components/upgrade/UpgradeStepper";

export default function CheckoutReturn() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  return (
    <div className="min-h-screen bg-background">
      <SEO title="Checkout complete" description="Your subscription is being activated." path="/checkout/return" />
      <TopNav />
      <main className="container mx-auto px-6 py-20 max-w-xl text-center">
        <div className="flex justify-center mb-8">
          <UpgradeStepper current="confirm" />
        </div>
        {sessionId ? (
          <>
            <CheckCircle2 className="h-14 w-14 mx-auto text-success mb-4" />
            <h1 className="text-3xl font-bold">Payment received</h1>
            <p className="text-muted-foreground mt-3">
              Your subscription is being provisioned. It will appear in your account within a few seconds.
            </p>
            <p className="text-xs text-muted-foreground mt-2 font-mono break-all">Session: {sessionId}</p>
            <Button asChild className="mt-6"><Link to="/">Go to dashboard</Link></Button>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold">No session found</h1>
            <Button asChild className="mt-6" variant="outline"><Link to="/upgrade">Back to plans</Link></Button>
          </>
        )}
      </main>
    </div>
  );
}