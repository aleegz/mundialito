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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          mundialito_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          mundialito_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          mundialito_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_mundialito_id_fkey"
            columns: ["mundialito_id"]
            isOneToOne: false
            referencedRelation: "mundialitos"
            referencedColumns: ["id"]
          },
        ]
      }
      mundialitos: {
        Row: {
          created_at: string
          description: string | null
          id: string
          mode: string
          name: string
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          mode?: string
          name: string
          owner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          mode?: string
          name?: string
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      participants: {
        Row: {
          auth_user_id: string | null
          created_at: string
          display_name: string
          id: string
          invite_token_hash: string | null
          mundialito_id: string
          status: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          display_name: string
          id?: string
          invite_token_hash?: string | null
          mundialito_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          display_name?: string
          id?: string
          invite_token_hash?: string | null
          mundialito_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_mundialito_id_fkey"
            columns: ["mundialito_id"]
            isOneToOne: false
            referencedRelation: "mundialitos"
            referencedColumns: ["id"]
          },
        ]
      }
      votes: {
        Row: {
          created_at: string
          item_id: string
          mundialito_id: string
          participant_id: string
          score: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          item_id: string
          mundialito_id: string
          participant_id: string
          score: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          item_id?: string
          mundialito_id?: string
          participant_id?: string
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_mundialito_item_fk"
            columns: ["mundialito_id", "item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["mundialito_id", "id"]
          },
          {
            foreignKeyName: "votes_mundialito_participant_fk"
            columns: ["mundialito_id", "participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["mundialito_id", "id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          id: string
          item_a_id: string | null
          item_b_id: string | null
          mundialito_id: string
          position: number
          round: number
          status: string
          updated_at: string
          vote_round: number
          winner_item_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_a_id?: string | null
          item_b_id?: string | null
          mundialito_id: string
          position: number
          round: number
          status?: string
          updated_at?: string
          vote_round?: number
          winner_item_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_a_id?: string | null
          item_b_id?: string | null
          mundialito_id?: string
          position?: number
          round?: number
          status?: string
          updated_at?: string
          vote_round?: number
          winner_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_item_a_fk"
            columns: ["mundialito_id", "item_a_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["mundialito_id", "id"]
          },
          {
            foreignKeyName: "matches_item_b_fk"
            columns: ["mundialito_id", "item_b_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["mundialito_id", "id"]
          },
          {
            foreignKeyName: "matches_mundialito_id_fkey"
            columns: ["mundialito_id"]
            isOneToOne: false
            referencedRelation: "mundialitos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_fk"
            columns: ["mundialito_id", "winner_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["mundialito_id", "id"]
          },
        ]
      }
      match_votes: {
        Row: {
          chosen_item_id: string
          created_at: string
          match_id: string
          mundialito_id: string
          participant_id: string
          updated_at: string
          vote_round: number
        }
        Insert: {
          chosen_item_id: string
          created_at?: string
          match_id: string
          mundialito_id: string
          participant_id: string
          updated_at?: string
          vote_round?: number
        }
        Update: {
          chosen_item_id?: string
          created_at?: string
          match_id?: string
          mundialito_id?: string
          participant_id?: string
          updated_at?: string
          vote_round?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_votes_chosen_fk"
            columns: ["mundialito_id", "chosen_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["mundialito_id", "id"]
          },
          {
            foreignKeyName: "match_votes_match_fk"
            columns: ["mundialito_id", "match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["mundialito_id", "id"]
          },
          {
            foreignKeyName: "match_votes_participant_fk"
            columns: ["mundialito_id", "participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["mundialito_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_read_mundialito: {
        Args: { target_mundialito_id: string }
        Returns: boolean
      }
      can_vote_in_match: {
        Args: {
          target_item_id: string
          target_match_id: string
          target_participant_id: string
          target_vote_round: number
        }
        Returns: boolean
      }
      cast_match_vote: {
        Args: {
          p_chosen_item_id: string
          p_match_id: string
          p_participant_id: string
          p_vote_round?: number
        }
        Returns: boolean
      }
      current_participant_id: {
        Args: { target_mundialito_id: string }
        Returns: string
      }
      is_mundialito_owner: {
        Args: { target_mundialito_id: string }
        Returns: boolean
      }
      is_mundialito_participant: {
        Args: { target_mundialito_id: string }
        Returns: boolean
      }
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
    Enums: {},
  },
} as const
