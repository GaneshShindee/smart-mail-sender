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
      email_history: {
        Row: {
          attachments: Json
          bcc: string | null
          body: string
          error: string | null
          first_opened_at: string | null
          gmail_account_id: string | null
          id: string
          last_opened_at: string | null
          open_count: number
          recipient: string
          recipient_count: number
          sender_email: string | null
          sent_at: string
          status: string
          subject: string
          template_id: string | null
          template_name: string | null
          tracking_enabled: boolean
          tracking_token: string | null
          user_id: string
        }
        Insert: {
          attachments?: Json
          bcc?: string | null
          body: string
          error?: string | null
          first_opened_at?: string | null
          gmail_account_id?: string | null
          id?: string
          last_opened_at?: string | null
          open_count?: number
          recipient: string
          recipient_count?: number
          sender_email?: string | null
          sent_at?: string
          status?: string
          subject: string
          template_id?: string | null
          template_name?: string | null
          tracking_enabled?: boolean
          tracking_token?: string | null
          user_id: string
        }
        Update: {
          attachments?: Json
          bcc?: string | null
          body?: string
          error?: string | null
          first_opened_at?: string | null
          gmail_account_id?: string | null
          id?: string
          last_opened_at?: string | null
          open_count?: number
          recipient?: string
          recipient_count?: number
          sender_email?: string | null
          sent_at?: string
          status?: string
          subject?: string
          template_id?: string | null
          template_name?: string | null
          tracking_enabled?: boolean
          tracking_token?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_history_gmail_account_id_fkey"
            columns: ["gmail_account_id"]
            isOneToOne: false
            referencedRelation: "gmail_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_history_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_recipients: {
        Row: {
          click_count: number
          company: string | null
          created_at: string
          email: string
          email_history_id: string
          first_opened_at: string | null
          id: string
          last_clicked_at: string | null
          last_opened_at: string | null
          name: string | null
          open_count: number
          status: string
          tracking_token: string | null
          user_id: string
        }
        Insert: {
          click_count?: number
          company?: string | null
          created_at?: string
          email: string
          email_history_id: string
          first_opened_at?: string | null
          id?: string
          last_clicked_at?: string | null
          last_opened_at?: string | null
          name?: string | null
          open_count?: number
          status?: string
          tracking_token?: string | null
          user_id: string
        }
        Update: {
          click_count?: number
          company?: string | null
          created_at?: string
          email?: string
          email_history_id?: string
          first_opened_at?: string | null
          id?: string
          last_clicked_at?: string | null
          last_opened_at?: string | null
          name?: string | null
          open_count?: number
          status?: string
          tracking_token?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_recipients_email_history_id_fkey"
            columns: ["email_history_id"]
            isOneToOne: false
            referencedRelation: "email_history"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_connections: {
        Row: {
          access_token: string | null
          avatar_url: string | null
          connected_at: string
          display_name: string | null
          expires_at: string | null
          full_name: string | null
          gmail_email: string
          id: string
          is_default: boolean
          label: string | null
          refresh_token: string
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          avatar_url?: string | null
          connected_at?: string
          display_name?: string | null
          expires_at?: string | null
          full_name?: string | null
          gmail_email: string
          id?: string
          is_default?: boolean
          label?: string | null
          refresh_token: string
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          avatar_url?: string | null
          connected_at?: string
          display_name?: string | null
          expires_at?: string | null
          full_name?: string | null
          gmail_email?: string
          id?: string
          is_default?: boolean
          label?: string | null
          refresh_token?: string
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      instruction_templates: {
        Row: {
          batch_size: number
          company_domain: string
          created_at: string
          custom_pattern: string
          custom_rules: Json
          email_pattern: string
          id: string
          name: string
          prefixes: Json
          rules: Json
          surname_min_length: number
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_size?: number
          company_domain?: string
          created_at?: string
          custom_pattern?: string
          custom_rules?: Json
          email_pattern?: string
          id?: string
          name: string
          prefixes?: Json
          rules?: Json
          surname_min_length?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_size?: number
          company_domain?: string
          created_at?: string
          custom_pattern?: string
          custom_rules?: Json
          email_pattern?: string
          id?: string
          name?: string
          prefixes?: Json
          rules?: Json
          surname_min_length?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          compose_prefs: Json
          created_at: string
          default_template_id: string | null
          email: string | null
          follow_up_template_id: string | null
          full_name: string | null
          id: string
          tracking_open_enabled: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          compose_prefs?: Json
          created_at?: string
          default_template_id?: string | null
          email?: string | null
          follow_up_template_id?: string | null
          full_name?: string | null
          id: string
          tracking_open_enabled?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          compose_prefs?: Json
          created_at?: string
          default_template_id?: string | null
          email?: string | null
          follow_up_template_id?: string | null
          full_name?: string | null
          id?: string
          tracking_open_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_template_id_fkey"
            columns: ["default_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_follow_up_template_id_fkey"
            columns: ["follow_up_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      resumes: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          mime_type: string
          name: string
          original_filename: string
          size_bytes: number
          storage_path: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          mime_type: string
          name: string
          original_filename: string
          size_bytes: number
          storage_path: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          mime_type?: string
          name?: string
          original_filename?: string
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      template_saves: {
        Row: {
          created_at: string
          id: string
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_saves_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          body: string
          category: string | null
          created_at: string
          default_sender_id: string | null
          follow_up_template_id: string | null
          id: string
          is_default: boolean
          is_public: boolean
          name: string
          preferred_resume_id: string | null
          published_at: string | null
          saves_count: number
          source_template_id: string | null
          subject: string
          updated_at: string
          user_id: string
          uses_count: number
        }
        Insert: {
          body?: string
          category?: string | null
          created_at?: string
          default_sender_id?: string | null
          follow_up_template_id?: string | null
          id?: string
          is_default?: boolean
          is_public?: boolean
          name: string
          preferred_resume_id?: string | null
          published_at?: string | null
          saves_count?: number
          source_template_id?: string | null
          subject?: string
          updated_at?: string
          user_id: string
          uses_count?: number
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          default_sender_id?: string | null
          follow_up_template_id?: string | null
          id?: string
          is_default?: boolean
          is_public?: boolean
          name?: string
          preferred_resume_id?: string | null
          published_at?: string | null
          saves_count?: number
          source_template_id?: string | null
          subject?: string
          updated_at?: string
          user_id?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "templates_default_sender_id_fkey"
            columns: ["default_sender_id"]
            isOneToOne: false
            referencedRelation: "gmail_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_follow_up_template_id_fkey"
            columns: ["follow_up_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_preferred_resume_id_fkey"
            columns: ["preferred_resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
