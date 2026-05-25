
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country_residence text,
  ADD COLUMN IF NOT EXISTS country_tax_residence text,
  ADD COLUMN IF NOT EXISTS secondary_tax_residences text[];
