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
      grant_providers: {
        Row: {
          aliases: string[]
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["provider_kind"]
          name: string
        }
        Insert: {
          aliases?: string[]
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["provider_kind"]
          name: string
        }
        Update: {
          aliases?: string[]
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["provider_kind"]
          name?: string
        }
        Relationships: []
      }
      grant_sources: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          last_error: string | null
          last_run_at: string | null
          name: string
          scrape_config: Json
          url: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          name: string
          scrape_config?: Json
          url: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          name?: string
          scrape_config?: Json
          url?: string
        }
        Relationships: []
      }
      grants: {
        Row: {
          amount: number | null
          application_method: string | null
          area: string | null
          beneficiaries: string | null
          cofunding_percentage: number | null
          cofunding_required: number | null
          complexity: Database["public"]["Enums"]["complexity_level"] | null
          contact_info: string | null
          created_at: string
          deadline: string | null
          detail_fetch_attempts: number
          detail_fetched_at: string | null
          discovered_at: string
          eligible_expenses: string | null
          eligible_types: string[]
          funding_type: Database["public"]["Enums"]["funding_type"] | null
          geo_scope: Database["public"]["Enums"]["geo_scope"] | null
          id: string
          import_mode: string
          max_amount: number | null
          min_amount: number | null
          opening_date: string | null
          provider_id: string | null
          raw: Json | null
          required_documents: string[]
          requirements: string | null
          source_id: string | null
          status: Database["public"]["Enums"]["grant_status"]
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          amount?: number | null
          application_method?: string | null
          area?: string | null
          beneficiaries?: string | null
          cofunding_percentage?: number | null
          cofunding_required?: number | null
          complexity?: Database["public"]["Enums"]["complexity_level"] | null
          contact_info?: string | null
          created_at?: string
          deadline?: string | null
          detail_fetch_attempts?: number
          detail_fetched_at?: string | null
          discovered_at?: string
          eligible_expenses?: string | null
          eligible_types?: string[]
          funding_type?: Database["public"]["Enums"]["funding_type"] | null
          geo_scope?: Database["public"]["Enums"]["geo_scope"] | null
          id?: string
          import_mode?: string
          max_amount?: number | null
          min_amount?: number | null
          opening_date?: string | null
          provider_id?: string | null
          raw?: Json | null
          required_documents?: string[]
          requirements?: string | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["grant_status"]
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          amount?: number | null
          application_method?: string | null
          area?: string | null
          beneficiaries?: string | null
          cofunding_percentage?: number | null
          cofunding_required?: number | null
          complexity?: Database["public"]["Enums"]["complexity_level"] | null
          contact_info?: string | null
          created_at?: string
          deadline?: string | null
          detail_fetch_attempts?: number
          detail_fetched_at?: string | null
          discovered_at?: string
          eligible_expenses?: string | null
          eligible_types?: string[]
          funding_type?: Database["public"]["Enums"]["funding_type"] | null
          geo_scope?: Database["public"]["Enums"]["geo_scope"] | null
          id?: string
          import_mode?: string
          max_amount?: number | null
          min_amount?: number | null
          opening_date?: string | null
          provider_id?: string | null
          raw?: Json | null
          required_documents?: string[]
          requirements?: string | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["grant_status"]
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "grants_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "grant_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grants_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "grant_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activity_description: string | null
          annual_budget: string | null
          beneficiaries: string[]
          cofunding_capacity: number | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_role: string | null
          coprogettazione: boolean
          created_at: string
          dedicated_admin: boolean | null
          doc_bilancio: boolean
          doc_certificazioni: boolean
          doc_durc: boolean
          doc_rasd: boolean
          doc_runts: boolean
          doc_statuto: boolean
          eu_funds: boolean
          eu_project: boolean | null
          founded_year: number | null
          funded_projects_3y: string | null
          id: string
          income_sources: string[]
          legal_type: string | null
          municipality: string | null
          name: string | null
          networks: string | null
          notes: string | null
          operating_provinces: string[]
          operating_scope: string | null
          private_funds: boolean
          private_partners: boolean
          private_partners_detail: string | null
          project_history: Json
          province: string | null
          public_funds: boolean
          public_partners: boolean
          public_partners_detail: string | null
          rasd_number: string | null
          region: string | null
          reporting_experience: string | null
          sport_body: string | null
          stable_staff: string | null
          tax_code: string | null
          themes: string[]
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          activity_description?: string | null
          annual_budget?: string | null
          beneficiaries?: string[]
          cofunding_capacity?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          coprogettazione?: boolean
          created_at?: string
          dedicated_admin?: boolean | null
          doc_bilancio?: boolean
          doc_certificazioni?: boolean
          doc_durc?: boolean
          doc_rasd?: boolean
          doc_runts?: boolean
          doc_statuto?: boolean
          eu_funds?: boolean
          eu_project?: boolean | null
          founded_year?: number | null
          funded_projects_3y?: string | null
          id?: string
          income_sources?: string[]
          legal_type?: string | null
          municipality?: string | null
          name?: string | null
          networks?: string | null
          notes?: string | null
          operating_provinces?: string[]
          operating_scope?: string | null
          private_funds?: boolean
          private_partners?: boolean
          private_partners_detail?: string | null
          project_history?: Json
          province?: string | null
          public_funds?: boolean
          public_partners?: boolean
          public_partners_detail?: string | null
          rasd_number?: string | null
          region?: string | null
          reporting_experience?: string | null
          sport_body?: string | null
          stable_staff?: string | null
          tax_code?: string | null
          themes?: string[]
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          activity_description?: string | null
          annual_budget?: string | null
          beneficiaries?: string[]
          cofunding_capacity?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          coprogettazione?: boolean
          created_at?: string
          dedicated_admin?: boolean | null
          doc_bilancio?: boolean
          doc_certificazioni?: boolean
          doc_durc?: boolean
          doc_rasd?: boolean
          doc_runts?: boolean
          doc_statuto?: boolean
          eu_funds?: boolean
          eu_project?: boolean | null
          founded_year?: number | null
          funded_projects_3y?: string | null
          id?: string
          income_sources?: string[]
          legal_type?: string | null
          municipality?: string | null
          name?: string | null
          networks?: string | null
          notes?: string | null
          operating_provinces?: string[]
          operating_scope?: string | null
          private_funds?: boolean
          private_partners?: boolean
          private_partners_detail?: string | null
          project_history?: Json
          province?: string | null
          public_funds?: boolean
          public_partners?: boolean
          public_partners_detail?: string | null
          rasd_number?: string | null
          region?: string | null
          reporting_experience?: string | null
          sport_body?: string | null
          stable_staff?: string | null
          tax_code?: string | null
          themes?: string[]
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      saved_grants: {
        Row: {
          created_at: string
          grant_id: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["saved_grant_status"]
          track_record_written: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grant_id: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["saved_grant_status"]
          track_record_written?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          grant_id?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["saved_grant_status"]
          track_record_written?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_grants_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_logs: {
        Row: {
          detail_errors: string[]
          duration_ms: number | null
          errors: string[]
          id: string
          inserted: number
          phase: string
          ran_at: string
          skipped: number
          source_id: string
          updated: number
        }
        Insert: {
          detail_errors?: string[]
          duration_ms?: number | null
          errors?: string[]
          id?: string
          inserted?: number
          phase?: string
          ran_at?: string
          skipped?: number
          source_id: string
          updated?: number
        }
        Update: {
          detail_errors?: string[]
          duration_ms?: number | null
          errors?: string[]
          id?: string
          inserted?: number
          phase?: string
          ran_at?: string
          skipped?: number
          source_id?: string
          updated?: number
        }
        Relationships: [
          {
            foreignKeyName: "scrape_logs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "grant_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          ai_calls_count: number
          ai_calls_window_start: string | null
          alert_frequency: Database["public"]["Enums"]["alert_frequency"]
          alert_threshold: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_calls_count?: number
          ai_calls_window_start?: string | null
          alert_frequency?: Database["public"]["Enums"]["alert_frequency"]
          alert_threshold?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_calls_count?: number
          ai_calls_window_start?: string | null
          alert_frequency?: Database["public"]["Enums"]["alert_frequency"]
          alert_threshold?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      expire_grants: { Args: never; Returns: undefined }
      set_saved_grant_status: {
        Args: {
          p_saved_grant_id: string
          p_status: Database["public"]["Enums"]["saved_grant_status"]
        }
        Returns: undefined
      }
    }
    Enums: {
      alert_frequency: "weekly" | "off"
      capacity_level: "bassa" | "media" | "alta"
      complexity_level: "bassa" | "media" | "alta"
      funding_type:
        | "fondo_perduto"
        | "prestito_agevolato"
        | "contributo_misto"
        | "garanzia"
        | "premio"
      geo_scope:
        | "comunale"
        | "provinciale"
        | "regionale"
        | "nazionale"
        | "europeo"
      grant_status: "aperto" | "chiuso" | "scaduto"
      provider_kind: "pubblico" | "privato" | "eu"
      saved_grant_status:
        | "salvato"
        | "in_preparazione"
        | "candidato"
        | "finanziato"
        | "non_ammesso"
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
      alert_frequency: ["weekly", "off"],
      capacity_level: ["bassa", "media", "alta"],
      complexity_level: ["bassa", "media", "alta"],
      funding_type: [
        "fondo_perduto",
        "prestito_agevolato",
        "contributo_misto",
        "garanzia",
        "premio",
      ],
      geo_scope: [
        "comunale",
        "provinciale",
        "regionale",
        "nazionale",
        "europeo",
      ],
      grant_status: ["aperto", "chiuso", "scaduto"],
      provider_kind: ["pubblico", "privato", "eu"],
      saved_grant_status: [
        "salvato",
        "in_preparazione",
        "candidato",
        "finanziato",
        "non_ammesso",
      ],
    },
  },
} as const
