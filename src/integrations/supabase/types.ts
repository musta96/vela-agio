export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_sessions: {
        Row: {
          actor_email: string | null
          actor_id: string
          created_at: string
          ended_at: string | null
          expires_at: string
          id: string
          purpose: string
          target_email: string | null
          target_user_id: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_id: string
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          purpose: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_id?: string
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          purpose?: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      advisor_orders: {
        Row: {
          action: string
          asset_class: string
          created_at: string
          currency: string
          est_notional: number | null
          est_price: number | null
          id: string
          limit_price: number | null
          option_expiry: string | null
          option_right: string | null
          option_strike: number | null
          option_structure: string | null
          order_type: string
          paper_order_id: string | null
          qty: number
          rationale: string | null
          run_id: string
          seq: number
          side: string
          status: string
          status_message: string | null
          symbol: string
          symbol_label: string | null
          user_id: string
        }
        Insert: {
          action: string
          asset_class?: string
          created_at?: string
          currency?: string
          est_notional?: number | null
          est_price?: number | null
          id?: string
          limit_price?: number | null
          option_expiry?: string | null
          option_right?: string | null
          option_strike?: number | null
          option_structure?: string | null
          order_type?: string
          paper_order_id?: string | null
          qty?: number
          rationale?: string | null
          run_id: string
          seq?: number
          side: string
          status?: string
          status_message?: string | null
          symbol: string
          symbol_label?: string | null
          user_id: string
        }
        Update: {
          action?: string
          asset_class?: string
          created_at?: string
          currency?: string
          est_notional?: number | null
          est_price?: number | null
          id?: string
          limit_price?: number | null
          option_expiry?: string | null
          option_right?: string | null
          option_strike?: number | null
          option_structure?: string | null
          order_type?: string
          paper_order_id?: string | null
          qty?: number
          rationale?: string | null
          run_id?: string
          seq?: number
          side?: string
          status?: string
          status_message?: string | null
          symbol?: string
          symbol_label?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "advisor_orders_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "advisor_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      advisor_runs: {
        Row: {
          base_currency: string
          blended_weights: Json
          cash_available: number
          created_at: string
          gating: Json
          id: string
          notes: string | null
          picked_basis: string
          portfolio_id: string | null
          risk_profile: string | null
          run_at: string
          strategies: Json
          suitability_summary: string | null
          total_value: number
          user_id: string
          winner_strategy: string | null
        }
        Insert: {
          base_currency?: string
          blended_weights?: Json
          cash_available?: number
          created_at?: string
          gating?: Json
          id?: string
          notes?: string | null
          picked_basis?: string
          portfolio_id?: string | null
          risk_profile?: string | null
          run_at?: string
          strategies?: Json
          suitability_summary?: string | null
          total_value?: number
          user_id: string
          winner_strategy?: string | null
        }
        Update: {
          base_currency?: string
          blended_weights?: Json
          cash_available?: number
          created_at?: string
          gating?: Json
          id?: string
          notes?: string | null
          picked_basis?: string
          portfolio_id?: string | null
          risk_profile?: string | null
          run_at?: string
          strategies?: Json
          suitability_summary?: string | null
          total_value?: number
          user_id?: string
          winner_strategy?: string | null
        }
        Relationships: []
      }
      advisory_consents: {
        Row: {
          client_role: Database["public"]["Enums"]["client_role"]
          expires_at: string | null
          granted_at: string
          granted_to: string
          id: string
          mandate_ref: string | null
          note: string | null
          revoked_at: string | null
          scope: string
          user_id: string
        }
        Insert: {
          client_role?: Database["public"]["Enums"]["client_role"]
          expires_at?: string | null
          granted_at?: string
          granted_to: string
          id?: string
          mandate_ref?: string | null
          note?: string | null
          revoked_at?: string | null
          scope: string
          user_id: string
        }
        Update: {
          client_role?: Database["public"]["Enums"]["client_role"]
          expires_at?: string | null
          granted_at?: string
          granted_to?: string
          id?: string
          mandate_ref?: string | null
          note?: string | null
          revoked_at?: string | null
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_event_log: {
        Row: {
          created_at: string
          event_type: string
          feature: string | null
          id: number
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          feature?: string | null
          id?: number
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          feature?: string | null
          id?: number
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_output_cache: {
        Row: {
          analysis_type: string
          cache_key: string
          created_at: string
          day: string
          expires_at: string
          hit_count: number
          model: string | null
          payload: Json
          ticker: string
        }
        Insert: {
          analysis_type: string
          cache_key: string
          created_at?: string
          day: string
          expires_at?: string
          hit_count?: number
          model?: string | null
          payload: Json
          ticker: string
        }
        Update: {
          analysis_type?: string
          cache_key?: string
          created_at?: string
          day?: string
          expires_at?: string
          hit_count?: number
          model?: string | null
          payload?: Json
          ticker?: string
        }
        Relationships: []
      }
      ai_research_notes: {
        Row: {
          created_at: string
          focus: string | null
          generated_at: string
          id: string
          mode: string
          model: string | null
          name: string | null
          provider_notice: string | null
          report: Json
          share_created_at: string | null
          share_enabled: boolean
          share_expires_at: string | null
          share_permissions: Json
          share_token: string | null
          source_hash: string
          source_label: string | null
          source_note: string | null
          source_url: string | null
          symbol: string
          tags: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          focus?: string | null
          generated_at?: string
          id?: string
          mode: string
          model?: string | null
          name?: string | null
          provider_notice?: string | null
          report: Json
          share_created_at?: string | null
          share_enabled?: boolean
          share_expires_at?: string | null
          share_permissions?: Json
          share_token?: string | null
          source_hash: string
          source_label?: string | null
          source_note?: string | null
          source_url?: string | null
          symbol: string
          tags?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          focus?: string | null
          generated_at?: string
          id?: string
          mode?: string
          model?: string | null
          name?: string | null
          provider_notice?: string | null
          report?: Json
          share_created_at?: string | null
          share_enabled?: boolean
          share_expires_at?: string | null
          share_permissions?: Json
          share_token?: string | null
          source_hash?: string
          source_label?: string | null
          source_note?: string | null
          source_url?: string | null
          symbol?: string
          tags?: string[]
          user_id?: string
        }
        Relationships: []
      }
      ai_signal_log: {
        Row: {
          confidence: number | null
          created_at: string
          disclaimer: string | null
          id: string
          input: Json
          output: Json
          retracted_at: string | null
          retracted_by: string | null
          retracted_reason: string | null
          signal_type: string
          status: string
          symbol: string | null
          user_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          disclaimer?: string | null
          id?: string
          input?: Json
          output?: Json
          retracted_at?: string | null
          retracted_by?: string | null
          retracted_reason?: string | null
          signal_type: string
          status?: string
          symbol?: string | null
          user_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          disclaimer?: string | null
          id?: string
          input?: Json
          output?: Json
          retracted_at?: string | null
          retracted_by?: string | null
          retracted_reason?: string | null
          signal_type?: string
          status?: string
          symbol?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          cache_hit: boolean
          cost_cents: number | null
          created_at: string
          credits: number
          feature: string
          id: number
          model: string | null
          provider: string
          success: boolean
          tokens_in: number | null
          tokens_out: number | null
          user_id: string
        }
        Insert: {
          cache_hit?: boolean
          cost_cents?: number | null
          created_at?: string
          credits?: number
          feature: string
          id?: number
          model?: string | null
          provider?: string
          success?: boolean
          tokens_in?: number | null
          tokens_out?: number | null
          user_id: string
        }
        Update: {
          cache_hit?: boolean
          cost_cents?: number | null
          created_at?: string
          credits?: number
          feature?: string
          id?: number
          model?: string | null
          provider?: string
          success?: boolean
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
        }
        Relationships: []
      }
      alert_preferences: {
        Row: {
          daily_brief_email: boolean
          daily_brief_enabled: boolean
          daily_brief_hour_local: number
          daily_brief_last_sent_on: string | null
          daily_brief_push: boolean
          daily_brief_timezone: string
          daily_digest_enabled: boolean
          digest_hour_utc: number
          email_enabled: boolean
          immediate_only_critical: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          daily_brief_email?: boolean
          daily_brief_enabled?: boolean
          daily_brief_hour_local?: number
          daily_brief_last_sent_on?: string | null
          daily_brief_push?: boolean
          daily_brief_timezone?: string
          daily_digest_enabled?: boolean
          digest_hour_utc?: number
          email_enabled?: boolean
          immediate_only_critical?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          daily_brief_email?: boolean
          daily_brief_enabled?: boolean
          daily_brief_hour_local?: number
          daily_brief_last_sent_on?: string | null
          daily_brief_push?: boolean
          daily_brief_timezone?: string
          daily_digest_enabled?: boolean
          digest_hour_utc?: number
          email_enabled?: boolean
          immediate_only_critical?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      alert_rules: {
        Row: {
          cooldown_minutes: number
          created_at: string
          enabled: boolean
          id: string
          kind: string
          last_fired_at: string | null
          name: string | null
          notify_email_immediate: boolean
          params: Json
          symbol: string | null
          threshold: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cooldown_minutes?: number
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          last_fired_at?: string | null
          name?: string | null
          notify_email_immediate?: boolean
          params?: Json
          symbol?: string | null
          threshold?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cooldown_minutes?: number
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          last_fired_at?: string | null
          name?: string | null
          notify_email_immediate?: boolean
          params?: Json
          symbol?: string | null
          threshold?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          entity: string | null
          entity_id: string | null
          id: number
          ip: string | null
          payload: Json | null
          ts: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          entity?: string | null
          entity_id?: string | null
          id?: number
          ip?: string | null
          payload?: Json | null
          ts?: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          entity?: string | null
          entity_id?: string | null
          id?: number
          ip?: string | null
          payload?: Json | null
          ts?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      billing_settings: {
        Row: {
          created_at: string
          grace_period_days: number
          id: number
          retention_discount_type: Database["public"]["Enums"]["retention_discount_type"]
          retention_discount_value: number
          retention_duration_months: number
          retention_offer_copy: string
          retention_offer_enabled: boolean
          trial_length_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          grace_period_days?: number
          id?: number
          retention_discount_type?: Database["public"]["Enums"]["retention_discount_type"]
          retention_discount_value?: number
          retention_duration_months?: number
          retention_offer_copy?: string
          retention_offer_enabled?: boolean
          trial_length_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          grace_period_days?: number
          id?: number
          retention_discount_type?: Database["public"]["Enums"]["retention_discount_type"]
          retention_discount_value?: number
          retention_duration_months?: number
          retention_offer_copy?: string
          retention_offer_enabled?: boolean
          trial_length_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      blog_leads: {
        Row: {
          company: string | null
          consent: boolean
          country: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          kind: string
          last_name: string | null
          post_id: string | null
          role: string | null
          source: string | null
          user_agent: string | null
        }
        Insert: {
          company?: string | null
          consent?: boolean
          country?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          kind?: string
          last_name?: string | null
          post_id?: string | null
          role?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Update: {
          company?: string | null
          consent?: boolean
          country?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          kind?: string
          last_name?: string | null
          post_id?: string | null
          role?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_leads_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_leads_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts_public"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_name: string | null
          category: string | null
          content_html: string
          cover_image_url: string | null
          created_at: string
          excerpt: string | null
          gated_html: string | null
          has_gated: boolean | null
          id: string
          lead_magnet_cta: string | null
          lead_magnet_enabled: boolean
          lead_magnet_fields: Json
          lead_magnet_file_name: string | null
          lead_magnet_file_path: string | null
          lead_magnet_layout: string
          published: boolean
          published_at: string | null
          reading_minutes: number
          seo_description: string | null
          seo_title: string | null
          slug: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author_name?: string | null
          category?: string | null
          content_html?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          gated_html?: string | null
          has_gated?: boolean | null
          id?: string
          lead_magnet_cta?: string | null
          lead_magnet_enabled?: boolean
          lead_magnet_fields?: Json
          lead_magnet_file_name?: string | null
          lead_magnet_file_path?: string | null
          lead_magnet_layout?: string
          published?: boolean
          published_at?: string | null
          reading_minutes?: number
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author_name?: string | null
          category?: string | null
          content_html?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          gated_html?: string | null
          has_gated?: boolean | null
          id?: string
          lead_magnet_cta?: string | null
          lead_magnet_enabled?: boolean
          lead_magnet_fields?: Json
          lead_magnet_file_name?: string | null
          lead_magnet_file_path?: string | null
          lead_magnet_layout?: string
          published?: boolean
          published_at?: string | null
          reading_minutes?: number
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      blotter_trades: {
        Row: {
          created_at: string
          executed_at: string
          id: string
          note: string | null
          price: number
          quantity: number
          side: string
          symbol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          executed_at?: string
          id?: string
          note?: string | null
          price: number
          quantity: number
          side: string
          symbol: string
          user_id: string
        }
        Update: {
          created_at?: string
          executed_at?: string
          id?: string
          note?: string | null
          price?: number
          quantity?: number
          side?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      bond_saved_bonds: {
        Row: {
          created_at: string
          id: string
          inputs: Json
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inputs: Json
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inputs?: Json
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      broker_accounts: {
        Row: {
          cash: number | null
          currency: string | null
          external_id: string
          id: string
          institution: string | null
          name: string | null
          raw: Json | null
          source: string
          synced_at: string
          total_value: number | null
          user_id: string
        }
        Insert: {
          cash?: number | null
          currency?: string | null
          external_id: string
          id?: string
          institution?: string | null
          name?: string | null
          raw?: Json | null
          source: string
          synced_at?: string
          total_value?: number | null
          user_id: string
        }
        Update: {
          cash?: number | null
          currency?: string | null
          external_id?: string
          id?: string
          institution?: string | null
          name?: string | null
          raw?: Json | null
          source?: string
          synced_at?: string
          total_value?: number | null
          user_id?: string
        }
        Relationships: []
      }
      broker_positions: {
        Row: {
          account_id: string
          avg_price: number | null
          currency: string | null
          id: string
          market_price: number | null
          market_value: number | null
          name: string | null
          quantity: number | null
          raw: Json | null
          symbol: string
          synced_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          avg_price?: number | null
          currency?: string | null
          id?: string
          market_price?: number | null
          market_value?: number | null
          name?: string | null
          quantity?: number | null
          raw?: Json | null
          symbol: string
          synced_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          avg_price?: number | null
          currency?: string | null
          id?: string
          market_price?: number | null
          market_value?: number | null
          name?: string | null
          quantity?: number | null
          raw?: Json | null
          symbol?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_positions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "broker_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_targets: {
        Row: {
          category: string
          created_at: string
          currency: string
          id: string
          monthly_limit: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          currency?: string
          id?: string
          monthly_limit: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          currency?: string
          id?: string
          monthly_limit?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cancellation_feedback: {
        Row: {
          accepted_offer: boolean
          created_at: string
          event_type: string
          feedback: string | null
          id: string
          metadata: Json | null
          reason: string | null
          stripe_subscription_id: string | null
          user_id: string
        }
        Insert: {
          accepted_offer?: boolean
          created_at?: string
          event_type?: string
          feedback?: string | null
          id?: string
          metadata?: Json | null
          reason?: string | null
          stripe_subscription_id?: string | null
          user_id: string
        }
        Update: {
          accepted_offer?: boolean
          created_at?: string
          event_type?: string
          feedback?: string | null
          id?: string
          metadata?: Json | null
          reason?: string | null
          stripe_subscription_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cash_flow_entries: {
        Row: {
          amount: number
          category: string
          created_at: string
          currency: string
          direction: string
          entry_date: string
          id: string
          label: string | null
          notes: string | null
          paused_from: string | null
          recurring_monthly: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          currency?: string
          direction: string
          entry_date?: string
          id?: string
          label?: string | null
          notes?: string | null
          paused_from?: string | null
          recurring_monthly?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          currency?: string
          direction?: string
          entry_date?: string
          id?: string
          label?: string | null
          notes?: string | null
          paused_from?: string | null
          recurring_monthly?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      copilot_messages: {
        Row: {
          artifacts: Json | null
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          artifacts?: Json | null
          content?: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          artifacts?: Json | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "copilot_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_brief_insights: {
        Row: {
          as_of_date: string
          change_pct: number | null
          created_at: string
          id: string
          insight: string
          symbol: string
        }
        Insert: {
          as_of_date: string
          change_pct?: number | null
          created_at?: string
          id?: string
          insight: string
          symbol: string
        }
        Update: {
          as_of_date?: string
          change_pct?: number | null
          created_at?: string
          id?: string
          insight?: string
          symbol?: string
        }
        Relationships: []
      }
      deal_flow_cache: {
        Row: {
          cache_key: string
          expires_at: string
          fetched_at: string
          id: number
          kind: string
          payload: Json
        }
        Insert: {
          cache_key: string
          expires_at: string
          fetched_at?: string
          id?: number
          kind: string
          payload: Json
        }
        Update: {
          cache_key?: string
          expires_at?: string
          fetched_at?: string
          id?: number
          kind?: string
          payload?: Json
        }
        Relationships: []
      }
      edge_rate_limits: {
        Row: {
          bucket: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          window_start?: string
        }
        Update: {
          bucket?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      enterprise_firms: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          id: string
          legal_name: string | null
          name: string
          notes: string | null
          owner_user_id: string
          postal_code: string | null
          seat_limit: number
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          id?: string
          legal_name?: string | null
          name?: string
          notes?: string | null
          owner_user_id: string
          postal_code?: string | null
          seat_limit?: number
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          id?: string
          legal_name?: string | null
          name?: string
          notes?: string | null
          owner_user_id?: string
          postal_code?: string | null
          seat_limit?: number
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: []
      }
      enterprise_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          firm_id: string
          id: string
          invited_by: string
          role: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          firm_id: string
          id?: string
          invited_by: string
          role?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          firm_id?: string
          id?: string
          invited_by?: string
          role?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_invitations_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "enterprise_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_leads: {
        Row: {
          company: string | null
          created_at: string
          email: string
          firm_name: string | null
          first_name: string
          id: string
          internal_notes: string | null
          ip: unknown
          last_name: string
          message: string | null
          num_clients: number | null
          role: string
          source: string | null
          status: string
          team_size: string | null
          updated_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          firm_name?: string | null
          first_name: string
          id?: string
          internal_notes?: string | null
          ip?: unknown
          last_name: string
          message?: string | null
          num_clients?: number | null
          role: string
          source?: string | null
          status?: string
          team_size?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          firm_name?: string | null
          first_name?: string
          id?: string
          internal_notes?: string | null
          ip?: unknown
          last_name?: string
          message?: string | null
          num_clients?: number | null
          role?: string
          source?: string | null
          status?: string
          team_size?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      enterprise_memberships: {
        Row: {
          created_at: string
          firm_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          firm_id: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          firm_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_memberships_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "enterprise_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_catalog: {
        Row: {
          category: string
          created_at: string
          description: string | null
          key: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          key: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          key?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          category: string
          description: string | null
          enabled: boolean
          key: string
          label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string
          description?: string | null
          enabled?: boolean
          key: string
          label: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          description?: string | null
          enabled?: boolean
          key?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      feature_gate_blocks: {
        Row: {
          created_at: string
          current_plan_slug: string | null
          current_tier: string | null
          feature_key: string
          id: string
          page_path: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          current_plan_slug?: string | null
          current_tier?: string | null
          feature_key: string
          id?: string
          page_path?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          current_plan_slug?: string | null
          current_tier?: string | null
          feature_key?: string
          id?: string
          page_path?: string | null
          user_id?: string
        }
        Relationships: []
      }
      feature_requests: {
        Row: {
          ai_analysis: Json
          created_at: string
          id: string
          page_context: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          user_quote: string | null
          votes: number
        }
        Insert: {
          ai_analysis?: Json
          created_at?: string
          id?: string
          page_context?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
          user_quote?: string | null
          votes?: number
        }
        Update: {
          ai_analysis?: Json
          created_at?: string
          id?: string
          page_context?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          user_quote?: string | null
          votes?: number
        }
        Relationships: []
      }
      financial_goals: {
        Row: {
          created_at: string
          expected_return: number
          id: string
          initial: number
          monthly: number
          name: string
          target: number
          updated_at: string
          user_id: string
          volatility: number
          years: number
        }
        Insert: {
          created_at?: string
          expected_return?: number
          id?: string
          initial?: number
          monthly?: number
          name?: string
          target?: number
          updated_at?: string
          user_id: string
          volatility?: number
          years?: number
        }
        Update: {
          created_at?: string
          expected_return?: number
          id?: string
          initial?: number
          monthly?: number
          name?: string
          target?: number
          updated_at?: string
          user_id?: string
          volatility?: number
          years?: number
        }
        Relationships: []
      }
      gdpr_erasure_requests: {
        Row: {
          certificate_url: string | null
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          reason: string | null
          requested_by: string | null
          requested_by_email: string | null
          scheduled_for: string
          status: string
          updated_at: string
          user_email: string | null
          user_id: string
        }
        Insert: {
          certificate_url?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reason?: string | null
          requested_by?: string | null
          requested_by_email?: string | null
          scheduled_for?: string
          status?: string
          updated_at?: string
          user_email?: string | null
          user_id: string
        }
        Update: {
          certificate_url?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reason?: string | null
          requested_by?: string | null
          requested_by_email?: string | null
          scheduled_for?: string
          status?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      generated_memos: {
        Row: {
          base_currency: string | null
          created_at: string
          fingerprints: Json
          id: string
          input_snapshot: Json | null
          parent_id: string | null
          pdf_bytes: number | null
          storage_path: string
          tickers: string[]
          title: string
          user_id: string
          version: number
        }
        Insert: {
          base_currency?: string | null
          created_at?: string
          fingerprints?: Json
          id?: string
          input_snapshot?: Json | null
          parent_id?: string | null
          pdf_bytes?: number | null
          storage_path: string
          tickers?: string[]
          title: string
          user_id: string
          version?: number
        }
        Update: {
          base_currency?: string | null
          created_at?: string
          fingerprints?: Json
          id?: string
          input_snapshot?: Json | null
          parent_id?: string | null
          pdf_bytes?: number | null
          storage_path?: string
          tickers?: string[]
          title?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "generated_memos_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "generated_memos"
            referencedColumns: ["id"]
          },
        ]
      }
      health_checks: {
        Row: {
          detail: string | null
          last_checked: string
          latency_ms: number | null
          service: string
          status: string
        }
        Insert: {
          detail?: string | null
          last_checked?: string
          latency_ms?: number | null
          service: string
          status?: string
        }
        Update: {
          detail?: string | null
          last_checked?: string
          latency_ms?: number | null
          service?: string
          status?: string
        }
        Relationships: []
      }
      incident_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          category: string
          id: number
          payload: Json
          reason: string | null
          ts: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          category: string
          id?: number
          payload?: Json
          reason?: string | null
          ts?: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          category?: string
          id?: number
          payload?: Json
          reason?: string | null
          ts?: string
        }
        Relationships: []
      }
      investor_profiles: {
        Row: {
          answers: Json
          completed_at: string | null
          created_at: string
          esg_preference: string | null
          excluded_sectors: string[] | null
          horizon_years: number | null
          id: string
          loss_tolerance_pct: number | null
          notes: string | null
          objectives: string[] | null
          profile_name: string | null
          risk_level: number | null
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          answers?: Json
          completed_at?: string | null
          created_at?: string
          esg_preference?: string | null
          excluded_sectors?: string[] | null
          horizon_years?: number | null
          id?: string
          loss_tolerance_pct?: number | null
          notes?: string | null
          objectives?: string[] | null
          profile_name?: string | null
          risk_level?: number | null
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          answers?: Json
          completed_at?: string | null
          created_at?: string
          esg_preference?: string | null
          excluded_sectors?: string[] | null
          horizon_years?: number | null
          id?: string
          loss_tolerance_pct?: number | null
          notes?: string | null
          objectives?: string[] | null
          profile_name?: string | null
          risk_level?: number | null
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      landing_globals: {
        Row: {
          is_public: boolean
          key: string
          label: string | null
          updated_at: string
          value: Json
        }
        Insert: {
          is_public?: boolean
          key: string
          label?: string | null
          updated_at?: string
          value?: Json
        }
        Update: {
          is_public?: boolean
          key?: string
          label?: string | null
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      landing_sections: {
        Row: {
          content: Json
          created_at: string
          enabled: boolean
          id: string
          key: string
          kind: string
          sort_order: number
          updated_at: string
          variant: string
        }
        Insert: {
          content?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          key: string
          kind: string
          sort_order?: number
          updated_at?: string
          variant?: string
        }
        Update: {
          content?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          key?: string
          kind?: string
          sort_order?: number
          updated_at?: string
          variant?: string
        }
        Relationships: []
      }
      landing_settings: {
        Row: {
          ab: Json
          id: number
          seo: Json
          updated_at: string
        }
        Insert: {
          ab?: Json
          id?: number
          seo?: Json
          updated_at?: string
        }
        Update: {
          ab?: Json
          id?: number
          seo?: Json
          updated_at?: string
        }
        Relationships: []
      }
      landing_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          note: string | null
          snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          note?: string | null
          snapshot?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          note?: string | null
          snapshot?: Json
        }
        Relationships: []
      }
      legal_documents: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          published_at: string | null
          status: string
          title: string
          updated_at: string
          version: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          published_at?: string | null
          status?: string
          title: string
          updated_at?: string
          version: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          published_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      live_order_intents: {
        Row: {
          broker: string
          created_at: string
          expires_at: string
          id: string
          limit_price: number | null
          qty: number
          rationale: string | null
          result: Json
          side: string
          status: string
          symbol: string
          time_in_force: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          broker: string
          created_at?: string
          expires_at?: string
          id?: string
          limit_price?: number | null
          qty: number
          rationale?: string | null
          result?: Json
          side: string
          status?: string
          symbol: string
          time_in_force?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          broker?: string
          created_at?: string
          expires_at?: string
          id?: string
          limit_price?: number | null
          qty?: number
          rationale?: string | null
          result?: Json
          side?: string
          status?: string
          symbol?: string
          time_in_force?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mandate_audit: {
        Row: {
          action: string
          actor_id: string
          client_id: string
          client_role: Database["public"]["Enums"]["client_role"] | null
          created_at: string
          id: string
          metadata: Json
          scope: string | null
        }
        Insert: {
          action: string
          actor_id: string
          client_id: string
          client_role?: Database["public"]["Enums"]["client_role"] | null
          created_at?: string
          id?: string
          metadata?: Json
          scope?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          client_id?: string
          client_role?: Database["public"]["Enums"]["client_role"] | null
          created_at?: string
          id?: string
          metadata?: Json
          scope?: string | null
        }
        Relationships: []
      }
      market_data_cache: {
        Row: {
          cache_key: string
          expires_at: string
          fetched_at: string
          id: number
          interval: string | null
          kind: string
          payload: Json
          range: string | null
          symbol: string
        }
        Insert: {
          cache_key: string
          expires_at: string
          fetched_at?: string
          id?: number
          interval?: string | null
          kind: string
          payload: Json
          range?: string | null
          symbol: string
        }
        Update: {
          cache_key?: string
          expires_at?: string
          fetched_at?: string
          id?: number
          interval?: string | null
          kind?: string
          payload?: Json
          range?: string | null
          symbol?: string
        }
        Relationships: []
      }
      mcp_call_log: {
        Row: {
          client_id: string | null
          created_at: string
          duration_ms: number
          error: string | null
          id: string
          ok: boolean
          tool_name: string
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          ok: boolean
          tool_name: string
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          ok?: boolean
          tool_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      net_worth_accounts: {
        Row: {
          category: string
          created_at: string
          currency: string
          details: Json
          icon: string | null
          id: string
          include_in_total: boolean
          is_liability: boolean
          linked_portfolio_ids: string[] | null
          manual_value: number | null
          name: string
          notes: string | null
          purchase_date: string | null
          purchase_price: number | null
          quantity: number | null
          sort_order: number
          subcategory: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          currency?: string
          details?: Json
          icon?: string | null
          id?: string
          include_in_total?: boolean
          is_liability?: boolean
          linked_portfolio_ids?: string[] | null
          manual_value?: number | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          quantity?: number | null
          sort_order?: number
          subcategory?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          currency?: string
          details?: Json
          icon?: string | null
          id?: string
          include_in_total?: boolean
          is_liability?: boolean
          linked_portfolio_ids?: string[] | null
          manual_value?: number | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          quantity?: number | null
          sort_order?: number
          subcategory?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      net_worth_snapshots: {
        Row: {
          account_id: string
          created_at: string
          currency: string
          id: string
          notes: string | null
          snapshot_date: string
          user_id: string
          value: number
        }
        Insert: {
          account_id: string
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          snapshot_date?: string
          user_id: string
          value: number
        }
        Update: {
          account_id?: string
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          snapshot_date?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "net_worth_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "net_worth_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          digested_at: string | null
          emailed_at: string | null
          id: string
          kind: string
          payload: Json
          read_at: string | null
          rule_id: string | null
          severity: string
          symbol: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          digested_at?: string | null
          emailed_at?: string | null
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          rule_id?: string | null
          severity?: string
          symbol?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          digested_at?: string | null
          emailed_at?: string | null
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          rule_id?: string | null
          severity?: string
          symbol?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_cash: {
        Row: {
          cash: number
          created_at: string
          currency: string
          id: string
          portfolio_id: string
          starting_cash: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cash?: number
          created_at?: string
          currency?: string
          id?: string
          portfolio_id: string
          starting_cash?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cash?: number
          created_at?: string
          currency?: string
          id?: string
          portfolio_id?: string
          starting_cash?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      paper_trades: {
        Row: {
          created_at: string
          currency: string
          executed_at: string
          fees: number
          id: string
          name: string | null
          notes: string | null
          portfolio_id: string
          price: number
          quantity: number
          side: string
          symbol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          executed_at?: string
          fees?: number
          id?: string
          name?: string | null
          notes?: string | null
          portfolio_id: string
          price: number
          quantity: number
          side: string
          symbol: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          executed_at?: string
          fees?: number
          id?: string
          name?: string | null
          notes?: string | null
          portfolio_id?: string
          price?: number
          quantity?: number
          side?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      pdf_export_log: {
        Row: {
          created_at: string
          filename: string | null
          id: string
          params: Json
          report_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filename?: string | null
          id?: string
          params?: Json
          report_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          filename?: string | null
          id?: string
          params?: Json
          report_type?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_banners: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          message: string
          severity: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          message: string
          severity?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          message?: string
          severity?: string
        }
        Relationships: []
      }
      platform_controls: {
        Row: {
          enabled: boolean
          expires_at: string | null
          key: string
          reason: string | null
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          enabled?: boolean
          expires_at?: string | null
          key: string
          reason?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          enabled?: boolean
          expires_at?: string | null
          key?: string
          reason?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      portfolio_holdings: {
        Row: {
          avg_price: number
          created_at: string
          currency: string
          id: string
          name: string
          portfolio_id: string | null
          shares: number
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_price?: number
          created_at?: string
          currency?: string
          id?: string
          name: string
          portfolio_id?: string | null
          shares?: number
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_price?: number
          created_at?: string
          currency?: string
          id?: string
          name?: string
          portfolio_id?: string | null
          shares?: number
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portfolio_simulations: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          params: Json
          portfolio_id: string
          results: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          params?: Json
          portfolio_id: string
          results?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          params?: Json
          portfolio_id?: string
          results?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_simulations_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          base_currency: string
          benchmark_symbol: string
          created_at: string
          description: string | null
          id: string
          is_primary: boolean
          is_simulation: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_currency?: string
          benchmark_symbol?: string
          created_at?: string
          description?: string | null
          id?: string
          is_primary?: boolean
          is_simulation?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_currency?: string
          benchmark_symbol?: string
          created_at?: string
          description?: string | null
          id?: string
          is_primary?: boolean
          is_simulation?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_model: string | null
          ai_opt_out: boolean
          ai_provider: string
          allow_cross_asset: boolean
          allow_derivatives: boolean
          allow_shorts: boolean
          avatar_url: string | null
          base_currency: string | null
          billing_cycle: Database["public"]["Enums"]["billing_cycle"] | null
          bio: string | null
          briefing_focus: string | null
          cancel_at_period_end: boolean
          cancellation_scheduled_at: string | null
          country_residence: string | null
          country_tax_residence: string | null
          created_at: string
          current_period_end: string | null
          dashboard_tour_completed_at: string | null
          date_of_birth: string | null
          display_name: string | null
          dunning_email_sent_at: string | null
          first_run_completed_at: string | null
          first_run_symbol: string | null
          first_run_time_to_signal_ms: number | null
          id: string
          onboarding_dismissed: boolean
          past_due_since: string | null
          phone: string | null
          plan: Database["public"]["Enums"]["plan_tier"]
          preferred_market: string | null
          reactivated_at: string | null
          recommendation_verdicts_override: string
          retention_offer_applied_at: string | null
          reverted_to_free_at: string | null
          secondary_tax_residences: string[] | null
          subscription_status: Database["public"]["Enums"]["sub_status"] | null
          trial_canceled_at: string | null
          trial_ends_at: string | null
          trial_reminder_1d_sent_at: string | null
          trial_reminder_2d_sent_at: string | null
          trial_welcome_shown_at: string | null
          unrestricted_advice: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_model?: string | null
          ai_opt_out?: boolean
          ai_provider?: string
          allow_cross_asset?: boolean
          allow_derivatives?: boolean
          allow_shorts?: boolean
          avatar_url?: string | null
          base_currency?: string | null
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"] | null
          bio?: string | null
          briefing_focus?: string | null
          cancel_at_period_end?: boolean
          cancellation_scheduled_at?: string | null
          country_residence?: string | null
          country_tax_residence?: string | null
          created_at?: string
          current_period_end?: string | null
          dashboard_tour_completed_at?: string | null
          date_of_birth?: string | null
          display_name?: string | null
          dunning_email_sent_at?: string | null
          first_run_completed_at?: string | null
          first_run_symbol?: string | null
          first_run_time_to_signal_ms?: number | null
          id?: string
          onboarding_dismissed?: boolean
          past_due_since?: string | null
          phone?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          preferred_market?: string | null
          reactivated_at?: string | null
          recommendation_verdicts_override?: string
          retention_offer_applied_at?: string | null
          reverted_to_free_at?: string | null
          secondary_tax_residences?: string[] | null
          subscription_status?: Database["public"]["Enums"]["sub_status"] | null
          trial_canceled_at?: string | null
          trial_ends_at?: string | null
          trial_reminder_1d_sent_at?: string | null
          trial_reminder_2d_sent_at?: string | null
          trial_welcome_shown_at?: string | null
          unrestricted_advice?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_model?: string | null
          ai_opt_out?: boolean
          ai_provider?: string
          allow_cross_asset?: boolean
          allow_derivatives?: boolean
          allow_shorts?: boolean
          avatar_url?: string | null
          base_currency?: string | null
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"] | null
          bio?: string | null
          briefing_focus?: string | null
          cancel_at_period_end?: boolean
          cancellation_scheduled_at?: string | null
          country_residence?: string | null
          country_tax_residence?: string | null
          created_at?: string
          current_period_end?: string | null
          dashboard_tour_completed_at?: string | null
          date_of_birth?: string | null
          display_name?: string | null
          dunning_email_sent_at?: string | null
          first_run_completed_at?: string | null
          first_run_symbol?: string | null
          first_run_time_to_signal_ms?: number | null
          id?: string
          onboarding_dismissed?: boolean
          past_due_since?: string | null
          phone?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          preferred_market?: string | null
          reactivated_at?: string | null
          recommendation_verdicts_override?: string
          retention_offer_applied_at?: string | null
          reverted_to_free_at?: string | null
          secondary_tax_residences?: string[] | null
          subscription_status?: Database["public"]["Enums"]["sub_status"] | null
          trial_canceled_at?: string | null
          trial_ends_at?: string | null
          trial_reminder_1d_sent_at?: string | null
          trial_reminder_2d_sent_at?: string | null
          trial_welcome_shown_at?: string | null
          unrestricted_advice?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          kind: string
          label: string | null
          max_uses: number | null
          percent_off: number | null
          plan_id: string | null
          stripe_coupon_id: string | null
          updated_at: string
          uses_count: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          label?: string | null
          max_uses?: number | null
          percent_off?: number | null
          plan_id?: string | null
          stripe_coupon_id?: string | null
          updated_at?: string
          uses_count?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          label?: string | null
          max_uses?: number | null
          percent_off?: number | null
          plan_id?: string | null
          stripe_coupon_id?: string | null
          updated_at?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_redemptions: {
        Row: {
          code_id: string
          id: string
          kind: string
          plan_id: string | null
          redeemed_at: string
          user_id: string
        }
        Insert: {
          code_id: string
          id?: string
          kind: string
          plan_id?: string | null
          redeemed_at?: string
          user_id: string
        }
        Update: {
          code_id?: string
          id?: string
          kind?: string
          plan_id?: string | null
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_redemptions_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_redemptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      research_notes: {
        Row: {
          body: string
          created_at: string
          id: string
          symbol: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          symbol?: string
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          symbol?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sentiment_history: {
        Row: {
          article_count: number
          created_at: string
          id: string
          label: string | null
          score: number
          symbol: string
          tier1_score: number | null
          tier2_score: number | null
          weighted_score: number | null
        }
        Insert: {
          article_count?: number
          created_at?: string
          id?: string
          label?: string | null
          score: number
          symbol: string
          tier1_score?: number | null
          tier2_score?: number | null
          weighted_score?: number | null
        }
        Update: {
          article_count?: number
          created_at?: string
          id?: string
          label?: string | null
          score?: number
          symbol?: string
          tier1_score?: number | null
          tier2_score?: number | null
          weighted_score?: number | null
        }
        Relationships: []
      }
      simulation_runs: {
        Row: {
          cancel_requested: boolean
          canceled_at: string | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          kind: string
          logs: Json
          progress: number
          result: Json | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_requested?: boolean
          canceled_at?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          kind: string
          logs?: Json
          progress?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_requested?: boolean
          canceled_at?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          kind?: string
          logs?: Json
          progress?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      snaptrade_connections: {
        Row: {
          created_at: string
          last_sync_at: string | null
          snaptrade_user_id: string
          snaptrade_user_secret: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_sync_at?: string | null
          snaptrade_user_id: string
          snaptrade_user_secret: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_sync_at?: string | null
          snaptrade_user_id?: string
          snaptrade_user_secret?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strategy_presets: {
        Row: {
          created_at: string
          description: string | null
          entry_rules: Json
          exit_rules: Json
          family: string
          id: string
          name: string
          risk_config: Json
          slug: string
          tags: string[]
          timeframe: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entry_rules?: Json
          exit_rules?: Json
          family: string
          id?: string
          name: string
          risk_config?: Json
          slug: string
          tags?: string[]
          timeframe?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entry_rules?: Json
          exit_rules?: Json
          family?: string
          id?: string
          name?: string
          risk_config?: Json
          slug?: string
          tags?: string[]
          timeframe?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          ab_monthly_price_cents: number | null
          ab_price_label: string | null
          ab_price_period: string | null
          ab_test_enabled: boolean
          ab_variant_label: string | null
          ab_yearly_price_cents: number | null
          ai_model_tier: string
          ai_monthly_quota: number
          created_at: string
          cta_href: string
          cta_label: string
          feature_keys: string[]
          features: Json
          highlighted: boolean
          id: string
          is_active: boolean
          max_ai_questions_per_month: number | null
          max_portfolios: number | null
          max_positions_per_portfolio: number | null
          max_watchlist: number | null
          monthly_credit_cap: number
          monthly_price_cents: number | null
          name: string
          price_label: string
          price_period: string | null
          slug: string
          sort_order: number
          stripe_monthly_price_id: string | null
          stripe_yearly_price_id: string | null
          tier: string
          updated_at: string
          yearly_price_cents: number | null
        }
        Insert: {
          ab_monthly_price_cents?: number | null
          ab_price_label?: string | null
          ab_price_period?: string | null
          ab_test_enabled?: boolean
          ab_variant_label?: string | null
          ab_yearly_price_cents?: number | null
          ai_model_tier?: string
          ai_monthly_quota?: number
          created_at?: string
          cta_href?: string
          cta_label?: string
          feature_keys?: string[]
          features?: Json
          highlighted?: boolean
          id?: string
          is_active?: boolean
          max_ai_questions_per_month?: number | null
          max_portfolios?: number | null
          max_positions_per_portfolio?: number | null
          max_watchlist?: number | null
          monthly_credit_cap?: number
          monthly_price_cents?: number | null
          name: string
          price_label: string
          price_period?: string | null
          slug: string
          sort_order?: number
          stripe_monthly_price_id?: string | null
          stripe_yearly_price_id?: string | null
          tier?: string
          updated_at?: string
          yearly_price_cents?: number | null
        }
        Update: {
          ab_monthly_price_cents?: number | null
          ab_price_label?: string | null
          ab_price_period?: string | null
          ab_test_enabled?: boolean
          ab_variant_label?: string | null
          ab_yearly_price_cents?: number | null
          ai_model_tier?: string
          ai_monthly_quota?: number
          created_at?: string
          cta_href?: string
          cta_label?: string
          feature_keys?: string[]
          features?: Json
          highlighted?: boolean
          id?: string
          is_active?: boolean
          max_ai_questions_per_month?: number | null
          max_portfolios?: number | null
          max_positions_per_portfolio?: number | null
          max_watchlist?: number | null
          monthly_credit_cap?: number
          monthly_price_cents?: number | null
          name?: string
          price_label?: string
          price_period?: string | null
          slug?: string
          sort_order?: number
          stripe_monthly_price_id?: string | null
          stripe_yearly_price_id?: string | null
          tier?: string
          updated_at?: string
          yearly_price_cents?: number | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          admin_reply: string | null
          category: string
          created_at: string
          id: string
          message: string
          page_url: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source: string
          status: string
          subject: string
          updated_at: string
          user_agent: string | null
          user_email: string | null
          user_id: string
        }
        Insert: {
          admin_reply?: string | null
          category?: string
          created_at?: string
          id?: string
          message: string
          page_url?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source?: string
          status?: string
          subject: string
          updated_at?: string
          user_agent?: string | null
          user_email?: string | null
          user_id: string
        }
        Update: {
          admin_reply?: string | null
          category?: string
          created_at?: string
          id?: string
          message?: string
          page_url?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source?: string
          status?: string
          subject?: string
          updated_at?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tenant_settings: {
        Row: {
          brand_logo_url: string | null
          brand_primary_hex: string | null
          created_at: string
          data_residency: string
          id: string
          license_authority: string | null
          license_number: string | null
          licensed_professional: boolean
          owner_id: string
          tenant_name: string | null
          updated_at: string
        }
        Insert: {
          brand_logo_url?: string | null
          brand_primary_hex?: string | null
          created_at?: string
          data_residency?: string
          id?: string
          license_authority?: string | null
          license_number?: string | null
          licensed_professional?: boolean
          owner_id: string
          tenant_name?: string | null
          updated_at?: string
        }
        Update: {
          brand_logo_url?: string | null
          brand_primary_hex?: string | null
          created_at?: string
          data_residency?: string
          id?: string
          license_authority?: string | null
          license_number?: string | null
          licensed_professional?: boolean
          owner_id?: string
          tenant_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      thematic_watchlists: {
        Row: {
          created_at: string
          discovery_mode: boolean
          id: string
          name: string
          notes: string | null
          region: string
          size: string
          snapshot: Json
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          discovery_mode?: boolean
          id?: string
          name: string
          notes?: string | null
          region?: string
          size?: string
          snapshot: Json
          theme: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          discovery_mode?: boolean
          id?: string
          name?: string
          notes?: string | null
          region?: string
          size?: string
          snapshot?: Json
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trading_strategies: {
        Row: {
          created_at: string
          description: string | null
          entry_rules: Json
          exit_rules: Json
          id: string
          name: string
          parent_id: string | null
          risk_config: Json
          symbol: string | null
          timeframe: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          entry_rules?: Json
          exit_rules?: Json
          id?: string
          name: string
          parent_id?: string | null
          risk_config?: Json
          symbol?: string | null
          timeframe?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          entry_rules?: Json
          exit_rules?: Json
          id?: string
          name?: string
          parent_id?: string | null
          risk_config?: Json
          symbol?: string | null
          timeframe?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "trading_strategies_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "trading_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_strategy_versions: {
        Row: {
          change_note: string | null
          created_at: string
          description: string | null
          entry_rules: Json
          exit_rules: Json
          id: string
          name: string
          risk_config: Json
          strategy_id: string
          symbol: string | null
          timeframe: string | null
          user_id: string
          version: number
        }
        Insert: {
          change_note?: string | null
          created_at?: string
          description?: string | null
          entry_rules?: Json
          exit_rules?: Json
          id?: string
          name: string
          risk_config?: Json
          strategy_id: string
          symbol?: string | null
          timeframe?: string | null
          user_id: string
          version: number
        }
        Update: {
          change_note?: string | null
          created_at?: string
          description?: string | null
          entry_rules?: Json
          exit_rules?: Json
          id?: string
          name?: string
          risk_config?: Json
          strategy_id?: string
          symbol?: string | null
          timeframe?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "trading_strategy_versions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "trading_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_api_keys: {
        Row: {
          ciphertext: string
          created_at: string
          hint: string | null
          id: string
          iv: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          hint?: string | null
          id?: string
          iv: string
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          hint?: string | null
          id?: string
          iv?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_consents: {
        Row: {
          accepted_at: string
          id: string
          ip: string | null
          marketing_opt_in: boolean
          privacy_version: string
          tos_version: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          ip?: string | null
          marketing_opt_in?: boolean
          privacy_version: string
          tos_version: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          id?: string
          ip?: string | null
          marketing_opt_in?: boolean
          privacy_version?: string
          tos_version?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_suspensions: {
        Row: {
          reason: string | null
          suspended_at: string
          suspended_by: string | null
          user_id: string
        }
        Insert: {
          reason?: string | null
          suspended_at?: string
          suspended_by?: string | null
          user_id: string
        }
        Update: {
          reason?: string | null
          suspended_at?: string
          suspended_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      watchlist_items: {
        Row: {
          created_at: string
          id: string
          name: string
          symbol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          symbol: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      blog_posts_public: {
        Row: {
          author_name: string | null
          category: string | null
          content_html: string | null
          cover_image_url: string | null
          created_at: string | null
          excerpt: string | null
          has_gated: boolean | null
          id: string | null
          lead_magnet_cta: string | null
          lead_magnet_enabled: boolean | null
          lead_magnet_fields: Json | null
          lead_magnet_file_name: string | null
          lead_magnet_layout: string | null
          published: boolean | null
          published_at: string | null
          reading_minutes: number | null
          seo_description: string | null
          seo_title: string | null
          slug: string | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          author_name?: string | null
          category?: string | null
          content_html?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          excerpt?: string | null
          has_gated?: never
          id?: string | null
          lead_magnet_cta?: string | null
          lead_magnet_enabled?: boolean | null
          lead_magnet_fields?: Json | null
          lead_magnet_file_name?: string | null
          lead_magnet_layout?: string | null
          published?: boolean | null
          published_at?: string | null
          reading_minutes?: number | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          author_name?: string | null
          category?: string | null
          content_html?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          excerpt?: string | null
          has_gated?: never
          id?: string | null
          lead_magnet_cta?: string | null
          lead_magnet_enabled?: boolean | null
          lead_magnet_fields?: Json | null
          lead_magnet_file_name?: string | null
          lead_magnet_layout?: string | null
          published?: boolean | null
          published_at?: string | null
          reading_minutes?: number | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_api_keys_meta: {
        Row: {
          created_at: string | null
          hint: string | null
          id: string | null
          provider: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          hint?: string | null
          id?: string | null
          provider?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          hint?: string | null
          id?: string | null
          provider?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_check_ai_quota_mapping: {
        Args: never
        Returns: {
          detail: string
          issue: string
          tier: string
        }[]
      }
      admin_feature_block_summary:
        | {
            Args: { _days?: number }
            Returns: {
              blocks: number
              feature_key: string
              last_block: string
              unique_users: number
            }[]
          }
        | {
            Args: { _since?: string }
            Returns: {
              blocks: number
              feature_key: string
              last_block: string
              unique_users: number
            }[]
          }
      admin_gating_cta_breakdown: {
        Args: { _days?: number }
        Returns: {
          clicks: number
          cta: string
          feature: string
          last_click: string
          share_of_feature_clicks: number
          unique_clickers: number
        }[]
      }
      admin_gating_funnel: {
        Args: { _days?: number }
        Returns: {
          avg_dwell_ms: number
          conversion_rate: number
          cta_clicks: number
          ctr: number
          feature: string
          last_view: string
          median_dwell_ms: number
          required_plan: string
          unique_clickers: number
          unique_viewers: number
          upgrades: number
          views: number
        }[]
      }
      admin_gating_plan_breakdown: {
        Args: { _days?: number }
        Returns: {
          avg_dwell_ms: number
          conversion_rate: number
          cta_clicks: number
          ctas: Json
          ctr: number
          feature: string
          last_view: string
          median_dwell_ms: number
          required_plan: string
          source_plan: string
          unique_clickers: number
          unique_viewers: number
          upgrades: number
          views: number
        }[]
      }
      admin_list_blog_leads: {
        Args: never
        Returns: {
          company: string
          consent: boolean
          country: string
          created_at: string
          email: string
          first_name: string
          id: string
          kind: string
          last_name: string
          post_id: string
          post_slug: string
          post_title: string
          role: string
          source: string
        }[]
      }
      admin_list_blog_posts: {
        Args: never
        Returns: {
          author_name: string | null
          category: string | null
          content_html: string
          cover_image_url: string | null
          created_at: string
          excerpt: string | null
          gated_html: string | null
          has_gated: boolean | null
          id: string
          lead_magnet_cta: string | null
          lead_magnet_enabled: boolean
          lead_magnet_fields: Json
          lead_magnet_file_name: string | null
          lead_magnet_file_path: string | null
          lead_magnet_layout: string
          published: boolean
          published_at: string | null
          reading_minutes: number
          seo_description: string | null
          seo_title: string | null
          slug: string
          tags: string[]
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "blog_posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_new_enterprise_leads_count: { Args: never; Returns: number }
      admin_referral_analytics: {
        Args: never
        Returns: {
          active: boolean
          beta_signups: number
          code: string
          code_id: string
          created_at: string
          expires_at: string
          kind: string
          label: string
          last_redeemed_at: string
          max_uses: number
          paid_signups: number
          percent_off: number
          plan_id: string
          plan_name: string
          redemptions: number
          stripe_coupon_id: string
          unique_users: number
          uses_count: number
        }[]
      }
      admin_referral_redemption_log: {
        Args: { _limit?: number }
        Returns: {
          code: string
          code_id: string
          code_label: string
          current_plan_name: string
          current_sub_status: string
          has_beta_role: boolean
          kind: string
          percent_off: number
          plan_id: string
          plan_name: string
          redeemed_at: string
          redemption_id: string
          stripe_coupon_id: string
          user_email: string
          user_id: string
        }[]
      }
      admin_retention_audit: { Args: { _since?: string }; Returns: Json }
      admin_retention_events: {
        Args: { _limit?: number }
        Returns: {
          accepted_offer: boolean
          created_at: string
          event_type: string
          feedback: string
          id: string
          metadata: Json
          reason: string
          stripe_subscription_id: string
          user_email: string
          user_id: string
        }[]
      }
      admin_revenue_overview: { Args: { _env?: string }; Returns: Json }
      admin_rls_audit: {
        Args: never
        Returns: {
          allows_anon_select: boolean
          policy_count: number
          rls_enabled: boolean
          table_name: string
        }[]
      }
      admin_subscriptions_missing_plan: {
        Args: { _env?: string }
        Returns: {
          created_at: string
          price_id: string
          status: string
          subscription_id: string
          user_id: string
        }[]
      }
      ai_credits_this_month: { Args: { _user_id: string }; Returns: number }
      ai_margin_summary: {
        Args: never
        Returns: {
          ai_cost_cents: number
          ai_credits: number
          tier: string
          users: number
        }[]
      }
      ai_usage_this_month: { Args: { _user_id: string }; Returns: number }
      check_paid_plans_stripe_ids: {
        Args: never
        Returns: {
          missing_monthly: boolean
          missing_yearly: boolean
          slug: string
          tier: string
        }[]
      }
      consume_rate_limit: {
        Args: { _key: string; _limit: number; _window_seconds: number }
        Returns: boolean
      }
      get_enabled_feature_flags: {
        Args: never
        Returns: {
          enabled: boolean
          key: string
        }[]
      }
      get_retention_offer: {
        Args: never
        Returns: {
          copy: string
          discount_type: string
          discount_value: number
          duration_months: number
          enabled: boolean
        }[]
      }
      has_active_mandate: {
        Args: { _admin: string; _client: string; _scope: string }
        Returns: boolean
      }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_advisory_consent: {
        Args: { _admin: string; _client: string; _scope: string }
        Returns: boolean
      }
      has_feature: {
        Args: { _key: string; _user_id: string }
        Returns: boolean
      }
      has_pro_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_firm_member: {
        Args: { _firm_id: string; _user_id: string }
        Returns: boolean
      }
      is_firm_owner: {
        Args: { _firm_id: string; _user_id: string }
        Returns: boolean
      }
      lookup_referral_code: { Args: { _code: string }; Returns: Json }
      my_entitlements: {
        Args: never
        Returns: {
          beta_active: boolean
          feature_keys: string[]
          max_ai_questions_per_month: number
          max_portfolios: number
          max_positions_per_portfolio: number
          max_watchlist: number
          plan_name: string
          plan_slug: string
          source: string
          tier: string
        }[]
      }
      redeem_referral_code: { Args: { _code: string }; Returns: Json }
      unlock_blog_post: {
        Args: { p_email: string; p_slug: string }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "viewer"
        | "analyst"
        | "pm"
        | "admin"
        | "support"
        | "compliance"
        | "engineer"
        | "beta_tester"
      billing_cycle: "monthly" | "annual"
      client_role:
        | "principal"
        | "family_view"
        | "advisor_ro"
        | "accountant"
        | "broker_ro"
      plan_tier: "free" | "pro_trial" | "pro" | "enterprise"
      retention_discount_type: "percentage" | "fixed"
      sub_status: "active" | "trialing" | "past_due" | "canceled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "viewer",
        "analyst",
        "pm",
        "admin",
        "support",
        "compliance",
        "engineer",
        "beta_tester",
      ],
      billing_cycle: ["monthly", "annual"],
      client_role: [
        "principal",
        "family_view",
        "advisor_ro",
        "accountant",
        "broker_ro",
      ],
      plan_tier: ["free", "pro_trial", "pro", "enterprise"],
      retention_discount_type: ["percentage", "fixed"],
      sub_status: ["active", "trialing", "past_due", "canceled"],
    },
  },
} as const
