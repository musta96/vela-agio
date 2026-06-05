// Operating entity. The platform is currently operated as a pre-incorporation
// project — there is no registered company yet. These constants are referenced
// from the legal documents and footer so that, once the entity is registered,
// the new name / VAT number / registered office can be filled in here in ONE
// place and propagate everywhere.
export const LEGAL_ENTITY = {
  name: null as string | null,
  vatNumber: null as string | null,
  registeredAddress: null as string | null,
  contactEmail: "privacy@vela.ai",
} as const;

export const LEGAL_ENTITY_DISPLAY = LEGAL_ENTITY.name ?? "Vela.ai (pre-incorporation operator — legal entity to be registered)";