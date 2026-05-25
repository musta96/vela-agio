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
          id: string
          name: string
          shares: number
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_price?: number
          created_at?: string
          id?: string
          name: string
          shares?: number
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_price?: number
          created_at?: string
          id?: string
          name?: string
          shares?: number
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
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
