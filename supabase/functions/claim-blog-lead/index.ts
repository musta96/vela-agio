import { createClient } from 'npm:@supabase/supabase-js@2.45.0'
import { z } from 'npm:zod@3.23.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BodySchema = z.object({
  slug: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255),
  first_name: z.string().trim().max(120).optional().nullable(),
  last_name: z.string().trim().max(120).optional().nullable(),
  company: z.string().trim().max(200).optional().nullable(),
  role: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  consent: z.boolean().optional().default(false),
  kind: z.enum(['gate', 'lead_magnet']).default('gate'),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'validation', details: parsed.error.flatten().fieldErrors }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const input = parsed.data

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // Look up the post (service role bypasses RLS, so we can read gated_html + file_path)
  const { data: post, error: postErr } = await supabase
    .from('blog_posts')
    .select('id, slug, published, gated_html, lead_magnet_enabled, lead_magnet_file_path, lead_magnet_fields')
    .eq('slug', input.slug)
    .eq('published', true)
    .maybeSingle()

  if (postErr) {
    return new Response(JSON.stringify({ error: 'lookup_failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!post) {
    return new Response(JSON.stringify({ error: 'post_not_found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Enforce required fields based on the post's configuration when it's a lead magnet
  const cfg = (post.lead_magnet_fields as Record<string, boolean> | null) || {}
  if (input.kind === 'lead_magnet') {
    if (cfg.first_name && !input.first_name) return badField('first_name')
    if (cfg.last_name && !input.last_name) return badField('last_name')
    if (cfg.company && !input.company) return badField('company')
    if (cfg.role && !input.role) return badField('role')
    if (cfg.country && !input.country) return badField('country')
    if (cfg.consent && !input.consent) return badField('consent')
  }

  // Insert the lead row
  const { error: insertErr } = await supabase.from('blog_leads').insert({
    post_id: post.id,
    email: input.email.toLowerCase(),
    first_name: input.first_name || null,
    last_name: input.last_name || null,
    company: input.company || null,
    role: input.role || null,
    country: input.country || null,
    consent: !!input.consent,
    kind: input.kind,
    source: input.kind === 'lead_magnet' ? 'lead-magnet' : 'blog-gate',
  })
  if (insertErr) {
    return new Response(JSON.stringify({ error: 'save_failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const response: Record<string, unknown> = { ok: true }

  // Lead magnet: hand out a short-lived signed URL to the PDF
  if (input.kind === 'lead_magnet' && post.lead_magnet_enabled && post.lead_magnet_file_path) {
    const { data: signed, error: signErr } = await supabase
      .storage
      .from('blog-assets')
      .createSignedUrl(post.lead_magnet_file_path, 60 * 15) // 15 min
    if (signErr || !signed?.signedUrl) {
      return new Response(JSON.stringify({ error: 'sign_failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    response.download_url = signed.signedUrl
  }

  // Gate flow: return the members-only HTML (existing behavior)
  if (input.kind === 'gate' && post.gated_html) {
    response.gated_html = post.gated_html
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

function badField(field: string) {
  return new Response(JSON.stringify({ error: 'missing_field', field }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}