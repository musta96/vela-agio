// ============================================================================
// company-registries — official, public company registers.
//
// Every record here comes from a government or regulator source, never from a
// model. Each one carries the register it came from and a link so the user can
// open the original entry.
//
//   GLEIF          global   free, no key   legal entity, jurisdiction, status
//   France         FR       free, no key   SIREN register (recherche-entreprises)
//   SEC EDGAR      US       free, no key   registrant + Form D fundraising filings
//   Companies Hse  UK       free API key   COMPANIES_HOUSE_API_KEY
//   OpenCorporates global   paid key       OPENCORPORATES_API_KEY
//   Italy          IT       deep link to the "startup innovative" register
// ============================================================================

export interface RegistryRecord {
  register: string;         // "GLEIF", "SEC EDGAR", "Registro Imprese", ...
  jurisdiction: string;     // ISO country code where known
  legalName: string;
  identifier?: string | null;   // LEI, SIREN, CIK, company number
  identifierType?: string | null;
  status?: string | null;
  registeredAt?: string | null;
  address?: string | null;
  activity?: string | null;
  url?: string | null;
  innovativeStartup?: boolean | null;
}

export interface RegistryFiling {
  register: string;
  type: string;
  title: string;
  date: string | null;
  url: string;
  amount?: number | null;
}

export interface RegistryResult {
  records: RegistryRecord[];
  filings: RegistryFiling[];
  registersQueried: string[];
  warnings: string[];
}

const UA = { 'User-Agent': 'VelaResearch/1.0 (registry lookup; contact@vela.ai)' };

async function jget(url: string, headers: Record<string, string> = {}, ms = 12000): Promise<any | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    const r = await fetch(url, { headers: { ...UA, Accept: 'application/json', ...headers }, signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function tget(url: string, headers: Record<string, string> = {}, ms = 12000): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    const r = await fetch(url, { headers: { ...UA, ...headers }, signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function looksLike(candidate: string, query: string): boolean {
  const a = norm(candidate), b = norm(query);
  return a === b || a.startsWith(b) || a.includes(b);
}

// ------------------------------------------------------------------- GLEIF

async function gleif(name: string, country?: string): Promise<RegistryRecord[]> {
  const url = `https://api.gleif.org/api/v1/lei-records?filter%5Bentity.legalName%5D=${encodeURIComponent(name)}&page%5Bsize%5D=10`;
  const j = await jget(url);
  const rows: any[] = j?.data ?? [];
  return rows
    .filter((r) => looksLike(r?.attributes?.entity?.legalName?.name ?? '', name))
    .filter((r) => !country || (r?.attributes?.entity?.legalAddress?.country ?? '') === country.toUpperCase())
    .slice(0, 5)
    .map((r) => {
      const e = r.attributes.entity;
      const addr = e.legalAddress;
      return {
        register: 'GLEIF (global LEI index)',
        jurisdiction: e.jurisdiction ?? addr?.country ?? '',
        legalName: e.legalName?.name ?? name,
        identifier: r.attributes.lei,
        identifierType: 'LEI',
        status: e.status ?? r.attributes.registration?.status ?? null,
        registeredAt: r.attributes.registration?.initialRegistrationDate?.slice(0, 10) ?? null,
        address: [addr?.addressLines?.join(' '), addr?.city, addr?.country].filter(Boolean).join(', ') || null,
        activity: e.legalForm?.id ? `Legal form ${e.legalForm.id}` : null,
        url: `https://search.gleif.org/#/record/${r.attributes.lei}`,
      } as RegistryRecord;
    });
}

// ------------------------------------------------------------------ France

async function france(name: string): Promise<RegistryRecord[]> {
  const j = await jget(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(name)}&per_page=5`);
  const rows: any[] = j?.results ?? [];
  return rows
    .filter((r) => looksLike(r?.nom_complet ?? '', name))
    .slice(0, 5)
    .map((r) => ({
      register: 'Registre national des entreprises (INSEE/INPI)',
      jurisdiction: 'FR',
      legalName: r.nom_complet,
      identifier: r.siren,
      identifierType: 'SIREN',
      status: r.etat_administratif === 'A' ? 'Active' : 'Ceased',
      registeredAt: r.date_creation ?? null,
      address: r.siege?.adresse ?? null,
      activity: r.siege?.activite_principale ? `NAF ${r.siege.activite_principale}` : null,
      url: `https://annuaire-entreprises.data.gouv.fr/entreprise/${r.siren}`,
    }));
}

// ------------------------------------------------------------------ US SEC

async function sec(name: string): Promise<{ records: RegistryRecord[]; filings: RegistryFiling[] }> {
  const records: RegistryRecord[] = [];
  const filings: RegistryFiling[] = [];

  const atom = await tget(
    `https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(name)}&type=&dateb=&owner=include&count=10&action=getcompany&output=atom`,
  );
  if (atom) {
    const blocks = atom.split('<entry>').slice(1);
    for (const b of blocks.slice(0, 5)) {
      const legal = b.match(/<company-info>[\s\S]*?<conformed-name>([^<]+)</i)?.[1] ?? b.match(/<title>([^<]+)</)?.[1];
      const cik = b.match(/<cik>(\d+)</i)?.[1];
      if (!legal || !cik || !looksLike(legal, name)) continue;
      records.push({
        register: 'SEC EDGAR',
        jurisdiction: 'US',
        legalName: legal.trim(),
        identifier: cik,
        identifierType: 'CIK',
        status: 'Registrant',
        registeredAt: null,
        address: b.match(/<state>([^<]+)</i)?.[1] ?? null,
        activity: b.match(/<assigned-sic-desc>([^<]+)</i)?.[1] ?? null,
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=&dateb=&owner=include&count=40`,
      });
    }
  }

  const efts = await jget(
    `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(name)}%22`,
  ) ?? await jget(
    `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${name}"`)}&forms=D`,
  ) ?? await jget(
    `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${name}"`)}`,
  );
  const hits: any[] = efts?.hits?.hits ?? [];
  for (const h of hits.slice(0, 10)) {
    const src = h?._source ?? {};
    const display = (src.display_names ?? [])[0] ?? '';
    if (!looksLike(display, name)) continue;
    const [adsh, doc] = String(h._id ?? '').split(':');
    const cik = String(src.ciks?.[0] ?? '').replace(/^0+/, '');
    filings.push({
      register: 'SEC EDGAR',
      type: src.file_type ?? src.root_form ?? 'filing',
      title: `${src.file_type ?? 'Filing'} — ${display}`,
      date: src.file_date ?? null,
      url: cik && adsh
        ? `https://www.sec.gov/Archives/edgar/data/${cik}/${adsh.replace(/-/g, '')}/${doc ?? ''}`
        : 'https://www.sec.gov/edgar/search/',
    });
  }

  return { records, filings };
}

// ------------------------------------------------------- UK Companies House

async function companiesHouse(name: string): Promise<{ records: RegistryRecord[]; filings: RegistryFiling[] }> {
  const key = Deno.env.get('COMPANIES_HOUSE_API_KEY');
  if (!key) return { records: [], filings: [] };
  const auth = { Authorization: `Basic ${btoa(`${key}:`)}` };
  const j = await jget(`https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(name)}&items_per_page=5`, auth);
  const records: RegistryRecord[] = (j?.items ?? [])
    .filter((r: any) => looksLike(r.title ?? '', name))
    .map((r: any) => ({
      register: 'Companies House',
      jurisdiction: 'GB',
      legalName: r.title,
      identifier: r.company_number,
      identifierType: 'Company number',
      status: r.company_status ?? null,
      registeredAt: r.date_of_creation ?? null,
      address: r.address_snippet ?? null,
      activity: null,
      url: `https://find-and-update.company-information.service.gov.uk/company/${r.company_number}`,
    }));

  const filings: RegistryFiling[] = [];
  const first = records[0];
  if (first?.identifier) {
    const fh = await jget(`https://api.company-information.service.gov.uk/company/${first.identifier}/filing-history?items_per_page=10`, auth);
    for (const it of fh?.items ?? []) {
      filings.push({
        register: 'Companies House',
        type: it.type ?? 'filing',
        title: it.description_values?.description ?? it.description ?? it.type,
        date: it.date ?? null,
        url: `https://find-and-update.company-information.service.gov.uk/company/${first.identifier}/filing-history`,
      });
    }
  }
  return { records, filings };
}

// ----------------------------------------------------------- OpenCorporates

async function openCorporates(name: string, country?: string): Promise<RegistryRecord[]> {
  const key = Deno.env.get('OPENCORPORATES_API_KEY');
  if (!key) return [];
  const q = `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(name)}&api_token=${key}${country ? `&country_code=${country.toLowerCase()}` : ''}`;
  const j = await jget(q);
  return (j?.results?.companies ?? []).slice(0, 5).map(({ company: c }: any) => ({
    register: `OpenCorporates — ${c.jurisdiction_code}`,
    jurisdiction: (c.jurisdiction_code ?? '').slice(0, 2).toUpperCase(),
    legalName: c.name,
    identifier: c.company_number,
    identifierType: 'Company number',
    status: c.current_status ?? null,
    registeredAt: c.incorporation_date ?? null,
    address: c.registered_address_in_full ?? null,
    activity: c.company_type ?? null,
    url: c.opencorporates_url ?? null,
  }));
}

// -------------------------------------------------------------------- Italy

/**
 * Italy publishes the "startup innovative" special section of the Registro
 * Imprese, but the search behind it is session-bound and cannot be queried
 * server-to-server. We match the legal entity through GLEIF and hand the user
 * a direct link into the official register so they can confirm the flag.
 */
function italyPointer(name: string): RegistryRecord {
  return {
    register: 'Registro Imprese — sezione startup innovative',
    jurisdiction: 'IT',
    legalName: name,
    identifier: null,
    identifierType: null,
    status: 'Check the official register',
    registeredAt: null,
    address: null,
    activity: 'Special section for innovative startups (D.L. 179/2012)',
    url: 'https://startup.registroimprese.it/isin/search',
    innovativeStartup: null,
  };
}

// --------------------------------------------------------------- entrypoint

export async function lookupRegistries(name: string, country?: string): Promise<RegistryResult> {
  const clean = (name || '').trim();
  const warnings: string[] = [];
  const registersQueried: string[] = ['GLEIF'];
  if (clean.length < 2) return { records: [], filings: [], registersQueried: [], warnings: ['Company name is too short to search a register.'] };

  const cc = (country || '').toUpperCase();
  const tasks: Array<Promise<any>> = [gleif(clean, cc || undefined)];

  if (!cc || cc === 'FR') { tasks.push(france(clean)); registersQueried.push('Registre national des entreprises (FR)'); }
  if (!cc || cc === 'US') { tasks.push(sec(clean)); registersQueried.push('SEC EDGAR (US)'); }
  if ((!cc || cc === 'GB' || cc === 'UK') && Deno.env.get('COMPANIES_HOUSE_API_KEY')) { tasks.push(companiesHouse(clean)); registersQueried.push('Companies House (UK)'); }
  if (Deno.env.get('OPENCORPORATES_API_KEY')) { tasks.push(openCorporates(clean, cc || undefined)); registersQueried.push('OpenCorporates'); }

  const settled = await Promise.allSettled(tasks);
  const records: RegistryRecord[] = [];
  const filings: RegistryFiling[] = [];
  for (const s of settled) {
    if (s.status !== 'fulfilled' || !s.value) continue;
    if (Array.isArray(s.value)) records.push(...s.value);
    else {
      records.push(...(s.value.records ?? []));
      filings.push(...(s.value.filings ?? []));
    }
  }

  if (cc === 'IT' || (!cc && records.some((r) => r.jurisdiction === 'IT'))) {
    registersQueried.push('Registro Imprese (IT)');
    records.push(italyPointer(clean));
  }
  if (!cc && !Deno.env.get('COMPANIES_HOUSE_API_KEY')) warnings.push('UK filing history needs a free Companies House key.');
  if (records.length === 0) warnings.push('No official register entry matched this name. Try the full legal name, including the company suffix.');

  // Newest and most identifiable first.
  records.sort((a, b) => (b.identifier ? 1 : 0) - (a.identifier ? 1 : 0));
  filings.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));

  return { records: records.slice(0, 12), filings: filings.slice(0, 15), registersQueried, warnings };
}
