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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      base_models: {
        Row: {
          category: string | null
          cost_price: number
          created_at: string | null
          id: string
          is_active: boolean | null
          manufacturer_id: string | null
          margin_percent: number | null
          name: string
          notes: string | null
          retail_price: number
          short_name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          cost_price: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          manufacturer_id?: string | null
          margin_percent?: number | null
          name: string
          notes?: string | null
          retail_price: number
          short_name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          cost_price?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          manufacturer_id?: string | null
          margin_percent?: number | null
          name?: string
          notes?: string | null
          retail_price?: number
          short_name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "base_models_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      change_orders: {
        Row: {
          all_applied: boolean | null
          applied_customer_estimate: boolean | null
          applied_internal: boolean | null
          applied_mfg_order: boolean | null
          applied_qb_estimate: boolean | null
          applied_qb_po: boolean | null
          change_number: number
          created_at: string | null
          description: string
          id: string
          new_total: number | null
          order_id: string | null
          price_impact: number | null
          requested_by: string
          requested_via: string | null
          updated_at: string | null
        }
        Insert: {
          all_applied?: boolean | null
          applied_customer_estimate?: boolean | null
          applied_internal?: boolean | null
          applied_mfg_order?: boolean | null
          applied_qb_estimate?: boolean | null
          applied_qb_po?: boolean | null
          change_number: number
          created_at?: string | null
          description: string
          id?: string
          new_total?: number | null
          order_id?: string | null
          price_impact?: number | null
          requested_by: string
          requested_via?: string | null
          updated_at?: string | null
        }
        Update: {
          all_applied?: boolean | null
          applied_customer_estimate?: boolean | null
          applied_internal?: boolean | null
          applied_mfg_order?: boolean | null
          applied_qb_estimate?: boolean | null
          applied_qb_po?: boolean | null
          change_number?: number
          created_at?: string | null
          description?: string
          id?: string
          new_total?: number | null
          order_id?: string | null
          price_impact?: number | null
          requested_by?: string
          requested_via?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address_city: string | null
          address_line1: string | null
          address_state: string | null
          address_zip: string | null
          company: string | null
          created_at: string | null
          customer_type: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          qb_customer_id: string | null
          updated_at: string | null
        }
        Insert: {
          address_city?: string | null
          address_line1?: string | null
          address_state?: string | null
          address_zip?: string | null
          company?: string | null
          created_at?: string | null
          customer_type?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          qb_customer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          address_city?: string | null
          address_line1?: string | null
          address_state?: string | null
          address_zip?: string | null
          company?: string | null
          created_at?: string | null
          customer_type?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          qb_customer_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      estimates: {
        Row: {
          approved_date: string | null
          build_shorthand: string
          created_at: string | null
          id: string
          is_approved: boolean | null
          is_current: boolean | null
          line_items: Json
          notes: string | null
          order_id: string | null
          signed: boolean | null
          signed_date: string | null
          total_price: number
          version_number: number
        }
        Insert: {
          approved_date?: string | null
          build_shorthand: string
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          is_current?: boolean | null
          line_items?: Json
          notes?: string | null
          order_id?: string | null
          signed?: boolean | null
          signed_date?: string | null
          total_price: number
          version_number: number
        }
        Update: {
          approved_date?: string | null
          build_shorthand?: string
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          is_current?: boolean | null
          line_items?: Json
          notes?: string | null
          order_id?: string | null
          signed?: boolean | null
          signed_date?: string | null
          total_price?: number
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimates_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      eta_updates: {
        Row: {
          created_at: string | null
          id: string
          new_date: string
          order_id: string | null
          previous_date: string | null
          reason: string | null
          source: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          new_date: string
          order_id?: string | null
          previous_date?: string | null
          reason?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          new_date?: string
          order_id?: string | null
          previous_date?: string | null
          reason?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eta_updates_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturers: {
        Row: {
          avg_lead_days: number | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          id: string
          name: string
          notes: string | null
          ordering_method: string | null
          short_name: string
        }
        Insert: {
          avg_lead_days?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          name: string
          notes?: string | null
          ordering_method?: string | null
          short_name: string
        }
        Update: {
          avg_lead_days?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          ordering_method?: string | null
          short_name?: string
        }
        Relationships: []
      }
      model_option_availability: {
        Row: {
          base_model_id: string | null
          id: string
          is_default: boolean | null
          option_id: string | null
          price_override_cost: number | null
          price_override_retail: number | null
        }
        Insert: {
          base_model_id?: string | null
          id?: string
          is_default?: boolean | null
          option_id?: string | null
          price_override_cost?: number | null
          price_override_retail?: number | null
        }
        Update: {
          base_model_id?: string | null
          id?: string
          is_default?: boolean | null
          option_id?: string | null
          price_override_cost?: number | null
          price_override_retail?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "model_option_availability_base_model_id_fkey"
            columns: ["base_model_id"]
            isOneToOne: false
            referencedRelation: "base_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_option_availability_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "model_options"
            referencedColumns: ["id"]
          },
        ]
      }
      model_options: {
        Row: {
          allows_quantity: boolean | null
          conflicts_with: string[] | null
          cost_price: number
          created_at: string | null
          display_name: string | null
          id: string
          is_active: boolean | null
          is_included: boolean | null
          is_upgrade_of: string | null
          manufacturer_id: string | null
          margin_percent: number | null
          max_per_side: number | null
          model_restriction: string[] | null
          name: string
          notes: string | null
          option_group: string | null
          requires_extended: boolean | null
          requires_options: string[] | null
          retail_price: number
          selection_type: string | null
          short_code: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          allows_quantity?: boolean | null
          conflicts_with?: string[] | null
          cost_price: number
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          is_included?: boolean | null
          is_upgrade_of?: string | null
          manufacturer_id?: string | null
          margin_percent?: number | null
          max_per_side?: number | null
          model_restriction?: string[] | null
          name: string
          notes?: string | null
          option_group?: string | null
          requires_extended?: boolean | null
          requires_options?: string[] | null
          retail_price: number
          selection_type?: string | null
          short_code: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          allows_quantity?: boolean | null
          conflicts_with?: string[] | null
          cost_price?: number
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          is_included?: boolean | null
          is_upgrade_of?: string | null
          manufacturer_id?: string | null
          margin_percent?: number | null
          max_per_side?: number | null
          model_restriction?: string[] | null
          name?: string
          notes?: string | null
          option_group?: string | null
          requires_extended?: boolean | null
          requires_options?: string[] | null
          retail_price?: number
          selection_type?: string | null
          short_code?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_options_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_timeline: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          event_type: string
          id: string
          order_id: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_type: string
          id?: string
          order_id?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_type?: string
          id?: string
          order_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_timeline_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          actual_completion_date: string | null
          approved_date: string | null
          base_model: string | null
          base_model_id: string | null
          build_description: string | null
          build_shorthand: string
          catl_number: string | null
          created_at: string | null
          current_estimate_version: number | null
          customer_id: string | null
          customer_price: number | null
          delivered_date: string | null
          discount_amount: number | null
          discount_type: string | null
          est_completion_date: string | null
          estimate_date: string | null
          freight_estimate: number | null
          from_inventory: boolean | null
          id: string
          inventory_location: string | null
          invoiced_date: string | null
          manufacturer_id: string | null
          margin_amount: number | null
          margin_percent: number | null
          mfg_po_number: string | null
          mfg_so_number: string | null
          notes: string | null
          order_number: string
          ordered_date: string | null
          our_cost: number | null
          paid_date: string | null
          qb_bill_id: string | null
          qb_estimate_id: string | null
          qb_invoice_id: string | null
          qb_po_id: string | null
          selected_options: Json | null
          serial_number: string | null
          so_received_date: string | null
          status: string
          subtotal: number | null
          updated_at: string | null
        }
        Insert: {
          actual_completion_date?: string | null
          approved_date?: string | null
          base_model?: string | null
          base_model_id?: string | null
          build_description?: string | null
          build_shorthand: string
          catl_number?: string | null
          created_at?: string | null
          current_estimate_version?: number | null
          customer_id?: string | null
          customer_price?: number | null
          delivered_date?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          est_completion_date?: string | null
          estimate_date?: string | null
          freight_estimate?: number | null
          from_inventory?: boolean | null
          id?: string
          inventory_location?: string | null
          invoiced_date?: string | null
          manufacturer_id?: string | null
          margin_amount?: number | null
          margin_percent?: number | null
          mfg_po_number?: string | null
          mfg_so_number?: string | null
          notes?: string | null
          order_number: string
          ordered_date?: string | null
          our_cost?: number | null
          paid_date?: string | null
          qb_bill_id?: string | null
          qb_estimate_id?: string | null
          qb_invoice_id?: string | null
          qb_po_id?: string | null
          selected_options?: Json | null
          serial_number?: string | null
          so_received_date?: string | null
          status?: string
          subtotal?: number | null
          updated_at?: string | null
        }
        Update: {
          actual_completion_date?: string | null
          approved_date?: string | null
          base_model?: string | null
          base_model_id?: string | null
          build_description?: string | null
          build_shorthand?: string
          catl_number?: string | null
          created_at?: string | null
          current_estimate_version?: number | null
          customer_id?: string | null
          customer_price?: number | null
          delivered_date?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          est_completion_date?: string | null
          estimate_date?: string | null
          freight_estimate?: number | null
          from_inventory?: boolean | null
          id?: string
          inventory_location?: string | null
          invoiced_date?: string | null
          manufacturer_id?: string | null
          margin_amount?: number | null
          margin_percent?: number | null
          mfg_po_number?: string | null
          mfg_so_number?: string | null
          notes?: string | null
          order_number?: string
          ordered_date?: string | null
          our_cost?: number | null
          paid_date?: string | null
          qb_bill_id?: string | null
          qb_estimate_id?: string | null
          qb_invoice_id?: string | null
          qb_po_id?: string | null
          selected_options?: Json | null
          serial_number?: string | null
          so_received_date?: string | null
          status?: string
          subtotal?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_base_model_id_fkey"
            columns: ["base_model_id"]
            isOneToOne: false
            referencedRelation: "base_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      paperwork: {
        Row: {
          blocked_reason: string | null
          completed_date: string | null
          created_at: string | null
          document_type: string
          file_url: string | null
          id: string
          notes: string | null
          order_id: string | null
          side: string
          status: string
          updated_at: string | null
        }
        Insert: {
          blocked_reason?: string | null
          completed_date?: string | null
          created_at?: string | null
          document_type: string
          file_url?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          side: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          blocked_reason?: string | null
          completed_date?: string | null
          created_at?: string | null
          document_type?: string
          file_url?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          side?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paperwork_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_builds: {
        Row: {
          base_model_id: string | null
          created_at: string | null
          description: string | null
          id: string
          included_option_ids: string[] | null
          is_active: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          base_model_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          included_option_ids?: string[] | null
          is_active?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          base_model_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          included_option_ids?: string[] | null
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quick_builds_base_model_id_fkey"
            columns: ["base_model_id"]
            isOneToOne: false
            referencedRelation: "base_models"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      attention_items: {
        Row: {
          attention_type: string | null
          build_shorthand: string | null
          customer_name: string | null
          description: string | null
          order_id: string | null
          order_number: string | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      generate_order_number: { Args: never; Returns: string }
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
