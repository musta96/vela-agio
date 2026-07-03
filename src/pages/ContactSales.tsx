import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";

const schema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  role: z.string().trim().min(1, "Role is required").max(120),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  firm_name: z.string().trim().max(200).optional().or(z.literal("")),
  num_clients: z
    .string()
    .trim()
    .max(10)
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || (/^\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 1_000_000), {
      message: "Enter a whole number of clients",
    }),
  team_size: z.string().trim().max(50).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});

type FormState = z.infer<typeof schema>;

const TEAM_SIZES = ["1–5", "6–20", "21–100", "101–500", "500+"];

export default function ContactSales() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const source = searchParams.get("source") ?? "pricing_enterprise";

  const [form, setForm] = React.useState<FormState>({
    first_name: "",
    last_name: "",
    email: user?.email ?? "",
    role: "",
    company: "",
    firm_name: "",
    num_clients: "",
    team_size: "",
    message: "",
  });
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (user?.email && !form.email) {
      setForm((f) => ({ ...f, email: user.email ?? "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setSubmitting(true);
    try {
      const { data: inserted, error } = await supabase.from("enterprise_leads").insert({
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
        email: parsed.data.email,
        role: parsed.data.role,
        company: parsed.data.company || null,
        firm_name: parsed.data.firm_name || parsed.data.company || null,
        num_clients: parsed.data.num_clients ? Number(parsed.data.num_clients) : null,
        team_size: parsed.data.team_size || null,
        message: parsed.data.message || null,
        source,
        user_id: user?.id ?? null,
        user_agent: navigator.userAgent.slice(0, 500),
      }).select("id").maybeSingle();
      if (error) throw error;
      setSubmitted(true);
      // Fire-and-forget: notify admins in-app + attempt email.
      if (inserted?.id) {
        supabase.functions
          .invoke("notify-enterprise-lead", { body: { lead_id: inserted.id } })
          .catch((e) => console.warn("[contact-sales] notify skipped", e?.message));
      }
      toast({
        title: "Request sent",
        description: "Thanks — we'll be in touch within one business day.",
      });
    } catch (err) {
      console.error("[contact-sales] submit failed", err);
      toast({
        title: "Something went wrong",
        description: "Please try again or email sales@vela.ai.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg,#f6f8fb 0%,#eef2f7 100%)" }}>
      <Helmet>
        <title>Contact Sales — Vela Enterprise</title>
        <meta
          name="description"
          content="Talk to Vela's enterprise team about advisor seats, MiFID II tooling, SSO, API access and dedicated support."
        />
        <meta name="robots" content="noindex,follow" />
      </Helmet>

      <div className="mx-auto max-w-3xl px-4 py-10 md:py-16">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium transition hover:opacity-80"
          style={{ color: "#185FA5" }}
        >
          <ArrowLeft className="size-4" />
          Back
        </button>

        <div className="rounded-2xl border bg-white/90 p-6 md:p-10 shadow-sm backdrop-blur"
             style={{ borderColor: "rgba(4,44,83,0.1)" }}>
          <div className="text-[11px] font-bold tracking-[0.25em] uppercase" style={{ color: "#1D9E75" }}>
            Enterprise
          </div>
          <h1 className="mt-2 text-3xl md:text-4xl font-extrabold tracking-tight" style={{ color: "#042C53" }}>
            Talk to our team
          </h1>
          <p className="mt-3 text-base" style={{ color: "#3d4f66" }}>
            Advisor seats, MiFID II tooling, SSO, API access and dedicated support — tell us a bit
            about your team and we'll be in touch within one business day.
          </p>

          {submitted ? (
            <div className="mt-8 rounded-xl border p-6 text-center"
                 style={{ borderColor: "rgba(29,158,117,0.35)", background: "rgba(29,158,117,0.08)" }}>
              <CheckCircle2 className="mx-auto size-10" style={{ color: "#1D9E75" }} />
              <h2 className="mt-3 text-xl font-bold" style={{ color: "#042C53" }}>Thanks — we got it.</h2>
              <p className="mt-2 text-sm" style={{ color: "#3d4f66" }}>
                A member of the Vela enterprise team will reach out to{" "}
                <span className="font-medium">{form.email}</span> shortly.
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <Link
                  to="/"
                  className="inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                  style={{ background: "linear-gradient(135deg,#042C53 0%,#185FA5 50%,#1D9E75 100%)" }}
                >
                  Back to home
                </Link>
                <Link
                  to="/features"
                  className="inline-flex items-center rounded-full border px-5 py-2 text-sm font-semibold transition hover:bg-[#042C53] hover:text-white"
                  style={{ borderColor: "rgba(4,44,83,0.2)", color: "#042C53" }}
                >
                  See features
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label="First name" required error={errors.first_name} htmlFor="first_name">
                  <Input
                    id="first_name"
                    autoComplete="given-name"
                    value={form.first_name}
                    maxLength={100}
                    onChange={(e) => update("first_name", e.target.value)}
                    aria-invalid={!!errors.first_name}
                  />
                </Field>
                <Field label="Last name" required error={errors.last_name} htmlFor="last_name">
                  <Input
                    id="last_name"
                    autoComplete="family-name"
                    value={form.last_name}
                    maxLength={100}
                    onChange={(e) => update("last_name", e.target.value)}
                    aria-invalid={!!errors.last_name}
                  />
                </Field>
                <Field label="Work email" required error={errors.email} htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    maxLength={255}
                    onChange={(e) => update("email", e.target.value)}
                    aria-invalid={!!errors.email}
                  />
                </Field>
                <Field label="Role / title" required error={errors.role} htmlFor="role">
                  <Input
                    id="role"
                    autoComplete="organization-title"
                    placeholder="e.g. Head of Advisory"
                    value={form.role}
                    maxLength={120}
                    onChange={(e) => update("role", e.target.value)}
                    aria-invalid={!!errors.role}
                  />
                </Field>
                <Field label="Firm / company name" error={errors.company} htmlFor="company">
                  <Input
                    id="company"
                    autoComplete="organization"
                    value={form.company}
                    maxLength={200}
                    onChange={(e) => update("company", e.target.value)}
                  />
                </Field>
                <Field
                  label="Approx. number of clients"
                  error={errors.num_clients}
                  htmlFor="num_clients"
                >
                  <Input
                    id="num_clients"
                    inputMode="numeric"
                    placeholder="e.g. 25"
                    value={form.num_clients}
                    maxLength={10}
                    onChange={(e) => update("num_clients", e.target.value.replace(/[^\d]/g, ""))}
                    aria-invalid={!!errors.num_clients}
                  />
                </Field>
              </div>

              <Field label="What are you hoping to solve?" error={errors.message} htmlFor="message">
                <Textarea
                  id="message"
                  rows={4}
                  maxLength={2000}
                  placeholder="Optional — e.g. we need SSO, MiFID II reporting and API access for 12 advisors."
                  value={form.message}
                  onChange={(e) => update("message", e.target.value)}
                />
              </Field>

              <div className="flex items-center justify-between gap-4 pt-2">
                <p className="text-xs" style={{ color: "#6b7a8c" }}>
                  By submitting, you agree to be contacted by Vela's sales team. We never share your info.
                </p>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-110"
                  style={{ background: "linear-gradient(135deg,#042C53 0%,#185FA5 50%,#1D9E75 100%)" }}
                >
                  {submitting ? (
                    <><Loader2 className="mr-2 size-4 animate-spin" /> Sending…</>
                  ) : (
                    "Send request"
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium" style={{ color: "#042C53" }}>
        {label} {required && <span style={{ color: "#c8321f" }}>*</span>}
      </Label>
      {children}
      {error && (
        <p className="mt-1 text-xs" style={{ color: "#c8321f" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}