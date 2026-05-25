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
          ai_provider: string
          avatar_url: string | null
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
          secondary_tax_residences: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_model?: string | null
          ai_provider?: string
          avatar_url?: string | null
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
          secondary_tax_residences?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_model?: string | null
          ai_provider?: string
          avatar_url?: string | null
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
          secondary_tax_residences?: string[] | null
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "viewer" | "analyst" | "pm" | "admin"
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
      app_role: ["viewer", "analyst", "pm", "admin"],
    },
  },
} as const
