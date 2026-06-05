INSERT INTO public.platform_controls (key, enabled, value)
VALUES ('public_pii_redacted', true, '{"description": "When ON, the public Privacy Policy hides Codice Fiscale and the personal contact email, exposing only the minimum required identifiers (name, form, P.IVA, sede legale, PEC)."}'::jsonb)
ON CONFLICT (key) DO NOTHING;