// Operating entity. Vela.ai is currently operated as a sole proprietorship
// (ditta individuale / libero professionista) in Italy. Once an S.R.L. is
// incorporated, replace the values below in this single file and they will
// propagate to every legal document.
//
// These details are referenced ONLY where the law requires it (GDPR Art. 13:
// identity & contact of the data controller in the Privacy Policy). They are
// deliberately NOT shown in the footer, Terms, Disclaimer or Cookies pages
// to minimise PII exposure.
export const LEGAL_ENTITY = {
  // Natural person operating the service (ditta individuale)
  name: "Edoardo Mustarelli" as string | null,
  // Partita IVA
  vatNumber: "IT03005170182" as string | null,
  // Codice Fiscale (natural person)
  taxCode: "MSTDRD96L12F205U" as string | null,
  // Sede legale (registered address tied to the P.IVA)
  registeredAddress: "Via Case Basse di San Vittore 17, 27100 Pavia, Italy" as string | null,
  // Public contact email for privacy / GDPR requests
  contactEmail: "mustarelli.edoardo@gmail.com",
  // PEC - certified email (official Italian channel for legal notices)
  pec: "edoardo.mustarelli@pec.it" as string | null,
  // Form of organisation, shown in the Privacy Policy for clarity
  form: "Sole proprietorship (ditta individuale) - Italy" as string | null,
} as const;

export const LEGAL_ENTITY_DISPLAY = LEGAL_ENTITY.name ?? "Vela.ai";

// "No PII shown publicly" mode. When true, public-facing legal pages strip
// fields that are NOT strictly required to publish:
//   • Codice Fiscale (not required under D.lgs. 70/2003 or GDPR Art. 13 for a
//     P.IVA holder - P.IVA is the public tax identifier)
//   • Personal contact email (PEC is sufficient as an official channel in IT)
// The legally-required fields remain visible: name, form, P.IVA, sede legale, PEC.
//
// This default can be overridden at runtime by the `public_pii_redacted` row
// in `platform_controls`. Default: redacted = true (privacy-preserving).
export const PII_REDACTED_DEFAULT = true;

export function getPublicLegalEntity(redacted: boolean) {
  if (!redacted) return LEGAL_ENTITY;
  return {
    ...LEGAL_ENTITY,
    taxCode: null,
    contactEmail: LEGAL_ENTITY.pec ?? LEGAL_ENTITY.contactEmail,
  };
}

// Generic placeholders used on Terms/Cookies/Disclaimer where no PII at all
// should appear. These are stable, brand-only strings.
export const GENERIC_CONTACT = {
  support: "support@vela.ai",
  privacy: "privacy@vela.ai",
  security: "security@vela.ai",
  legal: "legal@vela.ai",
} as const;