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
      advisory_consents: {
        Row: {
          granted_at: string
          granted_to: string
          id: string
          mandate_ref: string | null
          revoked_at: string | null
          scope: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_to: string
          id?: string
          mandate_ref?: string | null
          revoked_at?: string | null
          scope: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_to?: string
          id?: string
          mandate_ref?: string | null
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
          cost_cents: number | null
          created_at: string
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
          cost_cents?: number | null
          created_at?: string
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
          cost_cents?: number | null
          created_at?: string
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
          daily_digest_enabled: boolean
          digest_hour_utc: number
          email_enabled: boolean
          immediate_only_critical: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          daily_digest_enabled?: boolean
          digest_hour_utc?: number
          email_enabled?: boolean
          immediate_only_critical?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
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
          key: string
          label: string | null
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          label?: string | null
          updated_at?: string
          value?: Json
        }
        Update: {
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
          avatar_url: string | null
          base_currency: string | null
          bio: string | null
          briefing_focus: string | null
          country_residence: string | null
          country_tax_residence: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          id: string
          onboarding_dismissed: boolean
          phone: string | null
          preferred_market: string | null
          secondary_tax_residences: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_model?: string | null
          ai_opt_out?: boolean
          ai_provider?: string
          avatar_url?: string | null
          base_currency?: string | null
          bio?: string | null
          briefing_focus?: string | null
          country_residence?: string | null
          country_tax_residence?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          id?: string
          onboarding_dismissed?: boolean
          phone?: string | null
          preferred_market?: string | null
          secondary_tax_residences?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_model?: string | null
          ai_opt_out?: boolean
          ai_provider?: string
          avatar_url?: string | null
          base_currency?: string | null
          bio?: string | null
          briefing_focus?: string | null
          country_residence?: string | null
          country_tax_residence?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          id?: string
          onboarding_dismissed?: boolean
          phone?: string | null
          preferred_market?: string | null
          secondary_tax_residences?: string[] | null
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
      subscription_plans: {
        Row: {
          ai_model_tier: string
          ai_monthly_quota: number
          created_at: string
          cta_href: string
          cta_label: string
          features: Json
          highlighted: boolean
          id: string
          is_active: boolean
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
          ai_model_tier?: string
          ai_monthly_quota?: number
          created_at?: string
          cta_href?: string
          cta_label?: string
          features?: Json
          highlighted?: boolean
          id?: string
          is_active?: boolean
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
          ai_model_tier?: string
          ai_monthly_quota?: number
          created_at?: string
          cta_href?: string
          cta_label?: string
          features?: Json
          highlighted?: boolean
          id?: string
          is_active?: boolean
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
      ai_usage_this_month: { Args: { _user_id: string }; Returns: number }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_advisory_consent: {
        Args: { _admin: string; _client: string; _scope: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      ],
    },
  },
} as const
