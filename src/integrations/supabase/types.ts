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
      carriers: {
        Row: {
          id: string
          name: string
          type: string
          phone: string | null
          email: string | null
          vehicle_description: string | null
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          type?: string
          phone?: string | null
          email?: string | null
          vehicle_description?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: string
          phone?: string | null
          email?: string | null
          vehicle_description?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      freight_runs: {
        Row: {
          id: string
          name: string | null
          pickup_location: string
          pickup_address: string | null
          pickup_city: string | null
          pickup_state: string | null
          carrier_id: string | null
          driver_name: string | null
          status: string
          pickup_date: string | null
          estimated_arrival: string | null
          actual_cost: number | null
          freight_notes: string | null
          share_token: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name?: string | null
          pickup_location?: string
          pickup_address?: string | null
          pickup_city?: string | null
          pickup_state?: string | null
          carrier_id?: string | null
          driver_name?: string | null
          status?: string
          pickup_date?: string | null
          estimated_arrival?: string | null
          actual_cost?: number | null
          freight_notes?: string | null
          share_token?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string | null
          pickup_location?: string
          pickup_address?: string | null
          pickup_city?: string | null
          pickup_state?: string | null
          carrier_id?: string | null
          driver_name?: string | null
          status?: string
          pickup_date?: string | null
          estimated_arrival?: string | null
          actual_cost?: number | null
          freight_notes?: string | null
          share_token?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "freight_runs_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          }
        ]
      }
      freight_run_stops: {
        Row: {
          id: string
          freight_run_id: string
          order_id: string | null
          stop_order: number
          customer_name: string | null
          delivery_address: string | null
          delivery_city: string | null
          delivery_state: string | null
          delivery_zip: string | null
          delivery_phone: string | null
          delivery_instructions: string | null
          unloading_equipment: string | null
          status: string
          delivered_at: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          freight_run_id: string
          order_id?: string | null
          stop_order?: number
          customer_name?: string | null
          delivery_address?: string | null
          delivery_city?: string | null
          delivery_state?: string | null
          delivery_zip?: string | null
          delivery_phone?: string | null
          delivery_instructions?: string | null
          unloading_equipment?: string | null
          status?: string
          delivered_at?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          freight_run_id?: string
          order_id?: string | null
          stop_order?: number
          customer_name?: string | null
          delivery_address?: string | null
          delivery_city?: string | null
          delivery_state?: string | null
          delivery_zip?: string | null
          delivery_phone?: string | null
          delivery_instructions?: string | null
          unloading_equipment?: string | null
          status?: string
          delivered_at?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "freight_run_stops_freight_run_id_fkey"
            columns: ["freight_run_id"]
            isOneToOne: false
            referencedRelation: "freight_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_run_stops_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          }
        ]
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
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
          qb_item_id: string | null
          qb_item_name: string | null
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
          qb_item_id?: string | null
          qb_item_name?: string | null
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
          qb_item_id?: string | null
          qb_item_name?: string | null
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
      call_log: {
        Row: {
          ai_summary: string | null
          audio_file_name: string | null
          audio_file_size_bytes: number | null
          audio_storage_path: string | null
          call_date: string | null
          call_sentiment: string | null
          commitments: Json | null
          created_at: string | null
          customer_id: string | null
          customer_name_detected: string | null
          direction: string | null
          duration_seconds: number | null
          equipment_mentioned: Json | null
          freight_details: string | null
          id: string
          match_confidence: number | null
          match_method: string | null
          next_action: string | null
          order_id: string | null
          phone_number: string | null
          phone_number_normalized: string | null
          pricing_discussed: Json | null
          processing_error: string | null
          processing_status: string | null
          timeline_entry_id: string | null
          transcript: string | null
          transcript_segments: Json | null
          transcription_confidence: number | null
          transcription_model: string | null
          updated_at: string | null
        }
        Insert: {
          ai_summary?: string | null
          audio_file_name?: string | null
          audio_file_size_bytes?: number | null
          audio_storage_path?: string | null
          call_date?: string | null
          call_sentiment?: string | null
          commitments?: Json | null
          created_at?: string | null
          customer_id?: string | null
          customer_name_detected?: string | null
          direction?: string | null
          duration_seconds?: number | null
          equipment_mentioned?: Json | null
          freight_details?: string | null
          id?: string
          match_confidence?: number | null
          match_method?: string | null
          next_action?: string | null
          order_id?: string | null
          phone_number?: string | null
          phone_number_normalized?: string | null
          pricing_discussed?: Json | null
          processing_error?: string | null
          processing_status?: string | null
          timeline_entry_id?: string | null
          transcript?: string | null
          transcript_segments?: Json | null
          transcription_confidence?: number | null
          transcription_model?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_summary?: string | null
          audio_file_name?: string | null
          audio_file_size_bytes?: number | null
          audio_storage_path?: string | null
          call_date?: string | null
          call_sentiment?: string | null
          commitments?: Json | null
          created_at?: string | null
          customer_id?: string | null
          customer_name_detected?: string | null
          direction?: string | null
          duration_seconds?: number | null
          equipment_mentioned?: Json | null
          freight_details?: string | null
          id?: string
          match_confidence?: number | null
          match_method?: string | null
          next_action?: string | null
          order_id?: string | null
          phone_number?: string | null
          phone_number_normalized?: string | null
          pricing_discussed?: Json | null
          processing_error?: string | null
          processing_status?: string | null
          timeline_entry_id?: string | null
          transcript?: string | null
          transcript_segments?: Json | null
          transcription_confidence?: number | null
          transcription_model?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          approved: boolean | null
          approved_by: string | null
          approved_date: string | null
          change_number: number
          changes_summary: Json | null
          created_at: string | null
          description: string
          id: string
          new_config: Json | null
          new_total: number | null
          order_id: string | null
          previous_config: Json | null
          price_impact: number | null
          requested_by: string
          requested_via: string | null
          requires_approval: boolean | null
          source: string | null
          updated_at: string | null
        }
        Insert: {
          all_applied?: boolean | null
          applied_customer_estimate?: boolean | null
          applied_internal?: boolean | null
          applied_mfg_order?: boolean | null
          applied_qb_estimate?: boolean | null
          applied_qb_po?: boolean | null
          approved?: boolean | null
          approved_by?: string | null
          approved_date?: string | null
          change_number: number
          changes_summary?: Json | null
          created_at?: string | null
          description: string
          id?: string
          new_config?: Json | null
          new_total?: number | null
          order_id?: string | null
          previous_config?: Json | null
          price_impact?: number | null
          requested_by: string
          requested_via?: string | null
          requires_approval?: boolean | null
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          all_applied?: boolean | null
          applied_customer_estimate?: boolean | null
          applied_internal?: boolean | null
          applied_mfg_order?: boolean | null
          applied_qb_estimate?: boolean | null
          applied_qb_po?: boolean | null
          approved?: boolean | null
          approved_by?: string | null
          approved_date?: string | null
          change_number?: number
          changes_summary?: Json | null
          created_at?: string | null
          description?: string
          id?: string
          new_config?: Json | null
          new_total?: number | null
          order_id?: string | null
          previous_config?: Json | null
          price_impact?: number | null
          requested_by?: string
          requested_via?: string | null
          requires_approval?: boolean | null
          source?: string | null
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
      debug_log: {
        Row: {
          created_at: string | null
          function_name: string | null
          id: number
          message: string | null
          step: string | null
        }
        Insert: {
          created_at?: string | null
          function_name?: string | null
          id?: number
          message?: string | null
          step?: string | null
        }
        Update: {
          created_at?: string | null
          function_name?: string | null
          id?: number
          message?: string | null
          step?: string | null
        }
        Relationships: []
      }
      doc_scan_log: {
        Row: {
          attachment_filename: string | null
          attachment_size_bytes: number | null
          document_id: string | null
          drive_file_id: string | null
          drive_file_url: string | null
          error_message: string | null
          gmail_message_id: string
          gmail_thread_id: string | null
          id: string
          matched_contract_number: string | null
          matched_order_id: string | null
          scanned_at: string | null
          sender_email: string | null
          status: string
          subject: string | null
        }
        Insert: {
          attachment_filename?: string | null
          attachment_size_bytes?: number | null
          document_id?: string | null
          drive_file_id?: string | null
          drive_file_url?: string | null
          error_message?: string | null
          gmail_message_id: string
          gmail_thread_id?: string | null
          id?: string
          matched_contract_number?: string | null
          matched_order_id?: string | null
          scanned_at?: string | null
          sender_email?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          attachment_filename?: string | null
          attachment_size_bytes?: number | null
          document_id?: string | null
          drive_file_id?: string | null
          drive_file_url?: string | null
          error_message?: string | null
          gmail_message_id?: string
          gmail_thread_id?: string | null
          id?: string
          matched_contract_number?: string | null
          matched_order_id?: string | null
          scanned_at?: string | null
          sender_email?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_scan_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "order_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_scan_log_matched_order_id_fkey"
            columns: ["matched_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_scan_sources: {
        Row: {
          created_at: string | null
          document_type: string
          id: string
          is_active: boolean | null
          manufacturer_id: string | null
          sender_email: string
          sender_name: string | null
          subject_pattern: string | null
        }
        Insert: {
          created_at?: string | null
          document_type?: string
          id?: string
          is_active?: boolean | null
          manufacturer_id?: string | null
          sender_email: string
          sender_name?: string | null
          subject_pattern?: string | null
        }
        Update: {
          created_at?: string | null
          document_type?: string
          id?: string
          is_active?: boolean | null
          manufacturer_id?: string | null
          sender_email?: string
          sender_name?: string | null
          subject_pattern?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_scan_sources_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_folders: {
        Row: {
          created_at: string | null
          folder_id: string
          folder_name: string | null
          folder_url: string | null
          id: string
          manufacturer_id: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          folder_id: string
          folder_name?: string | null
          folder_url?: string | null
          id?: string
          manufacturer_id?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          folder_id?: string
          folder_name?: string | null
          folder_url?: string | null
          id?: string
          manufacturer_id?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "drive_folders_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          error_message: string | null
          estimate_id: string | null
          id: string
          order_id: string | null
          recipient_email: string
          recipient_name: string | null
          resend_message_id: string | null
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          error_message?: string | null
          estimate_id?: string | null
          id?: string
          order_id?: string | null
          recipient_email: string
          recipient_name?: string | null
          resend_message_id?: string | null
          sent_at?: string | null
          status: string
          subject: string
        }
        Update: {
          error_message?: string | null
          estimate_id?: string | null
          id?: string
          order_id?: string | null
          recipient_email?: string
          recipient_name?: string | null
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          approved_date: string | null
          base_model_id: string | null
          build_shorthand: string | null
          contract_name: string | null
          conversion_type: string | null
          converted_at: string | null
          converted_to_order: boolean | null
          created_at: string | null
          customer_id: string | null
          discount_amount: number | null
          discount_type: string | null
          emailed_at: string | null
          emailed_to: string | null
          estimate_date: string | null
          estimate_number: string | null
          freight_estimate: number | null
          id: string
          is_approved: boolean | null
          is_current: boolean | null
          label: string | null
          line_items: Json | null
          manufacturer_id: string | null
          notes: string | null
          order_id: string | null
          our_cost: number | null
          qb_doc_number: string | null
          qb_estimate_id: string | null
          qb_last_modified_at: string | null
          qb_last_pushed_at: string | null
          qb_sync_status: string | null
          selected_options: Json | null
          signed: boolean | null
          signed_date: string | null
          status: string
          subtotal: number | null
          tax_amount: number | null
          tax_rate: number | null
          tax_state: string | null
          total_price: number | null
          total_with_tax: number | null
          version_number: number
        }
        Insert: {
          approved_date?: string | null
          base_model_id?: string | null
          build_shorthand?: string | null
          contract_name?: string | null
          conversion_type?: string | null
          converted_at?: string | null
          converted_to_order?: boolean | null
          created_at?: string | null
          customer_id?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          emailed_at?: string | null
          emailed_to?: string | null
          estimate_date?: string | null
          estimate_number?: string | null
          freight_estimate?: number | null
          id?: string
          is_approved?: boolean | null
          is_current?: boolean | null
          label?: string | null
          line_items?: Json | null
          manufacturer_id?: string | null
          notes?: string | null
          order_id?: string | null
          our_cost?: number | null
          qb_doc_number?: string | null
          qb_estimate_id?: string | null
          qb_last_modified_at?: string | null
          qb_last_pushed_at?: string | null
          qb_sync_status?: string | null
          selected_options?: Json | null
          signed?: boolean | null
          signed_date?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          tax_state?: string | null
          total_price?: number | null
          total_with_tax?: number | null
          version_number: number
        }
        Update: {
          approved_date?: string | null
          base_model_id?: string | null
          build_shorthand?: string | null
          contract_name?: string | null
          conversion_type?: string | null
          converted_at?: string | null
          converted_to_order?: boolean | null
          created_at?: string | null
          customer_id?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          emailed_at?: string | null
          emailed_to?: string | null
          estimate_date?: string | null
          estimate_number?: string | null
          freight_estimate?: number | null
          id?: string
          is_approved?: boolean | null
          is_current?: boolean | null
          label?: string | null
          line_items?: Json | null
          manufacturer_id?: string | null
          notes?: string | null
          order_id?: string | null
          our_cost?: number | null
          qb_doc_number?: string | null
          qb_estimate_id?: string | null
          qb_last_modified_at?: string | null
          qb_last_pushed_at?: string | null
          qb_sync_status?: string | null
          selected_options?: Json | null
          signed?: boolean | null
          signed_date?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          tax_state?: string | null
          total_price?: number | null
          total_with_tax?: number | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimates_base_model_id_fkey"
            columns: ["base_model_id"]
            isOneToOne: false
            referencedRelation: "base_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
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
      google_tokens: {
        Row: {
          access_token: string
          access_token_expires_at: string
          account_email: string
          account_name: string | null
          id: string
          refresh_token: string
          scopes: string[] | null
          updated_at: string | null
        }
        Insert: {
          access_token: string
          access_token_expires_at: string
          account_email: string
          account_name?: string | null
          id?: string
          refresh_token: string
          scopes?: string[] | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          access_token_expires_at?: string
          account_email?: string
          account_name?: string | null
          id?: string
          refresh_token?: string
          scopes?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      manufacturers: {
        Row: {
          avg_lead_days: number | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          google_drive_parent_folder_id: string | null
          google_drive_parent_folder_url: string | null
          id: string
          name: string
          notes: string | null
          ordering_method: string | null
          ordering_portal_url: string | null
          qb_vendor_id: string | null
          short_name: string
        }
        Insert: {
          avg_lead_days?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          google_drive_parent_folder_id?: string | null
          google_drive_parent_folder_url?: string | null
          id?: string
          name: string
          notes?: string | null
          ordering_method?: string | null
          ordering_portal_url?: string | null
          qb_vendor_id?: string | null
          short_name: string
        }
        Update: {
          avg_lead_days?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          google_drive_parent_folder_id?: string | null
          google_drive_parent_folder_url?: string | null
          id?: string
          name?: string
          notes?: string | null
          ordering_method?: string | null
          ordering_portal_url?: string | null
          qb_vendor_id?: string | null
          short_name?: string
        }
        Relationships: []
      }
      mfg_item_mapping: {
        Row: {
          base_model_id: string | null
          comparison_key: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          item_type: string
          manufacturer_id: string
          mfg_item_category: string
          mfg_item_description: string
          notes: string | null
          option_id: string | null
          side: string | null
        }
        Insert: {
          base_model_id?: string | null
          comparison_key?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          item_type: string
          manufacturer_id: string
          mfg_item_category: string
          mfg_item_description: string
          notes?: string | null
          option_id?: string | null
          side?: string | null
        }
        Update: {
          base_model_id?: string | null
          comparison_key?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          item_type?: string
          manufacturer_id?: string
          mfg_item_category?: string
          mfg_item_description?: string
          notes?: string | null
          option_id?: string | null
          side?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mfg_item_mapping_base_model_id_fkey"
            columns: ["base_model_id"]
            isOneToOne: false
            referencedRelation: "base_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_item_mapping_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_item_mapping_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "model_options"
            referencedColumns: ["id"]
          },
        ]
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
          qb_item_id: string | null
          qb_item_name: string | null
          qb_item_name_by_model: Json | null
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
          qb_item_id?: string | null
          qb_item_name?: string | null
          qb_item_name_by_model?: Json | null
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
          qb_item_id?: string | null
          qb_item_name?: string | null
          qb_item_name_by_model?: Json | null
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
      order_document_slots: {
        Row: {
          base_model: string | null
          chute_length: string | null
          comparison_notes: string | null
          comparison_status: string | null
          created_at: string
          discount_amount: number | null
          document_id: string | null
          filled_at: string | null
          floor_type: string | null
          freight_amount: number | null
          id: string
          is_filled: boolean
          last_compared_at: string | null
          line_items: Json
          order_id: string
          parse_confidence: number | null
          parsed_by: string | null
          qb_doc_id: string | null
          qb_doc_number: string | null
          raw_extracted_text: string | null
          slot_type: string
          subtotal: number | null
          tax_amount: number | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          base_model?: string | null
          chute_length?: string | null
          comparison_notes?: string | null
          comparison_status?: string | null
          created_at?: string
          discount_amount?: number | null
          document_id?: string | null
          filled_at?: string | null
          floor_type?: string | null
          freight_amount?: number | null
          id?: string
          is_filled?: boolean
          last_compared_at?: string | null
          line_items?: Json
          order_id: string
          parse_confidence?: number | null
          parsed_by?: string | null
          qb_doc_id?: string | null
          qb_doc_number?: string | null
          raw_extracted_text?: string | null
          slot_type: string
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          base_model?: string | null
          chute_length?: string | null
          comparison_notes?: string | null
          comparison_status?: string | null
          created_at?: string
          discount_amount?: number | null
          document_id?: string | null
          filled_at?: string | null
          floor_type?: string | null
          freight_amount?: number | null
          id?: string
          is_filled?: boolean
          last_compared_at?: string | null
          line_items?: Json
          order_id?: string
          parse_confidence?: number | null
          parsed_by?: string | null
          qb_doc_id?: string | null
          qb_doc_number?: string | null
          raw_extracted_text?: string | null
          slot_type?: string
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_document_slots_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "order_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_document_slots_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_documents: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          document_type: string
          file_name: string | null
          file_size_bytes: number | null
          file_type: string | null
          file_url: string | null
          id: string
          is_unmatched: boolean | null
          manufacturer_ref: string | null
          match_attempted_at: string | null
          match_keywords: string[] | null
          order_id: string | null
          resend_email_id: string | null
          source: string | null
          source_email_date: string | null
          source_email_from: string | null
          source_email_subject: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_type: string
          file_name?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_unmatched?: boolean | null
          manufacturer_ref?: string | null
          match_attempted_at?: string | null
          match_keywords?: string[] | null
          order_id?: string | null
          resend_email_id?: string | null
          source?: string | null
          source_email_date?: string | null
          source_email_from?: string | null
          source_email_subject?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_type?: string
          file_name?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_unmatched?: boolean | null
          manufacturer_ref?: string | null
          match_attempted_at?: string | null
          match_keywords?: string[] | null
          order_id?: string | null
          resend_email_id?: string | null
          source?: string | null
          source_email_date?: string | null
          source_email_from?: string | null
          source_email_subject?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_timeline: {
        Row: {
          contact_method: string | null
          contact_with: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          event_type: string
          id: string
          order_id: string | null
          title: string
        }
        Insert: {
          contact_method?: string | null
          contact_with?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_type: string
          id?: string
          order_id?: string | null
          title: string
        }
        Update: {
          contact_method?: string | null
          contact_with?: string | null
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
          build_shorthand: string | null
          catl_number: string | null
          contract_name: string | null
          created_at: string | null
          current_estimate_version: number | null
          customer_id: string | null
          customer_location: string | null
          customer_price: number | null
          delivered_date: string | null
          delivery_instructions: string | null
          discount_amount: number | null
          discount_type: string | null
          equip_location: string | null
          equipment_type: string | null
          est_completion_date: string | null
          estimate_date: string | null
          freight_estimate: number | null
          from_inventory: boolean | null
          google_drive_folder_id: string | null
          google_drive_folder_url: string | null
          id: string
          inventory_location: string | null
          invoiced_date: string | null
          linked_order_id: string | null
          manufacturer_id: string | null
          margin_amount: number | null
          margin_percent: number | null
          mfg_contract_number: string | null
          mfg_po_number: string | null
          mfg_so_number: string | null
          moly_contract_number: string | null
          moly_invoice_matched: boolean | null
          moly_invoice_total: number | null
          moly_so_accepted: boolean | null
          moly_so_accepted_at: string | null
          moly_so_accepted_by: string | null
          notes: string | null
          notion_id: string | null
          order_number: string | null
          ordered_date: string | null
          our_cost: number | null
          paid_date: string | null
          qb_bill_doc_number: string | null
          qb_bill_id: string | null
          qb_bill_sync_status: string | null
          qb_estimate_doc_number: string | null
          qb_estimate_id: string | null
          qb_invoice_doc_number: string | null
          qb_invoice_id: string | null
          qb_invoice_sync_status: string | null
          qb_po_doc_number: string | null
          qb_po_id: string | null
          qb_po_last_pushed_at: string | null
          qb_po_sync_status: string | null
          selected_options: Json | null
          serial_number: string | null
          so_received_date: string | null
          source_type: string | null
          status: string
          subtotal: number | null
          tax_amount: number | null
          tax_rate: number | null
          tax_state: string | null
          total_with_tax: number | null
          updated_at: string | null
        }
        Insert: {
          actual_completion_date?: string | null
          approved_date?: string | null
          base_model?: string | null
          base_model_id?: string | null
          build_description?: string | null
          build_shorthand?: string | null
          catl_number?: string | null
          contract_name?: string | null
          created_at?: string | null
          current_estimate_version?: number | null
          customer_id?: string | null
          customer_location?: string | null
          customer_price?: number | null
          delivered_date?: string | null
          delivery_instructions?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          equip_location?: string | null
          equipment_type?: string | null
          est_completion_date?: string | null
          estimate_date?: string | null
          freight_estimate?: number | null
          from_inventory?: boolean | null
          google_drive_folder_id?: string | null
          google_drive_folder_url?: string | null
          id?: string
          inventory_location?: string | null
          invoiced_date?: string | null
          linked_order_id?: string | null
          manufacturer_id?: string | null
          margin_amount?: number | null
          margin_percent?: number | null
          mfg_contract_number?: string | null
          mfg_po_number?: string | null
          mfg_so_number?: string | null
          moly_contract_number?: string | null
          moly_invoice_matched?: boolean | null
          moly_invoice_total?: number | null
          moly_so_accepted?: boolean | null
          moly_so_accepted_at?: string | null
          moly_so_accepted_by?: string | null
          notes?: string | null
          notion_id?: string | null
          order_number?: string | null
          ordered_date?: string | null
          our_cost?: number | null
          paid_date?: string | null
          qb_bill_doc_number?: string | null
          qb_bill_id?: string | null
          qb_bill_sync_status?: string | null
          qb_estimate_doc_number?: string | null
          qb_estimate_id?: string | null
          qb_invoice_doc_number?: string | null
          qb_invoice_id?: string | null
          qb_invoice_sync_status?: string | null
          qb_po_doc_number?: string | null
          qb_po_id?: string | null
          qb_po_last_pushed_at?: string | null
          qb_po_sync_status?: string | null
          selected_options?: Json | null
          serial_number?: string | null
          so_received_date?: string | null
          source_type?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          tax_state?: string | null
          total_with_tax?: number | null
          updated_at?: string | null
        }
        Update: {
          actual_completion_date?: string | null
          approved_date?: string | null
          base_model?: string | null
          base_model_id?: string | null
          build_description?: string | null
          build_shorthand?: string | null
          catl_number?: string | null
          contract_name?: string | null
          created_at?: string | null
          current_estimate_version?: number | null
          customer_id?: string | null
          customer_location?: string | null
          customer_price?: number | null
          delivered_date?: string | null
          delivery_instructions?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          equip_location?: string | null
          equipment_type?: string | null
          est_completion_date?: string | null
          estimate_date?: string | null
          freight_estimate?: number | null
          from_inventory?: boolean | null
          google_drive_folder_id?: string | null
          google_drive_folder_url?: string | null
          id?: string
          inventory_location?: string | null
          invoiced_date?: string | null
          linked_order_id?: string | null
          manufacturer_id?: string | null
          margin_amount?: number | null
          margin_percent?: number | null
          mfg_contract_number?: string | null
          mfg_po_number?: string | null
          mfg_so_number?: string | null
          moly_contract_number?: string | null
          moly_invoice_matched?: boolean | null
          moly_invoice_total?: number | null
          moly_so_accepted?: boolean | null
          moly_so_accepted_at?: string | null
          moly_so_accepted_by?: string | null
          notes?: string | null
          notion_id?: string | null
          order_number?: string | null
          ordered_date?: string | null
          our_cost?: number | null
          paid_date?: string | null
          qb_bill_doc_number?: string | null
          qb_bill_id?: string | null
          qb_bill_sync_status?: string | null
          qb_estimate_doc_number?: string | null
          qb_estimate_id?: string | null
          qb_invoice_doc_number?: string | null
          qb_invoice_id?: string | null
          qb_invoice_sync_status?: string | null
          qb_po_doc_number?: string | null
          qb_po_id?: string | null
          qb_po_last_pushed_at?: string | null
          qb_po_sync_status?: string | null
          selected_options?: Json | null
          serial_number?: string | null
          so_received_date?: string | null
          source_type?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          tax_state?: string | null
          total_with_tax?: number | null
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
            foreignKeyName: "orders_linked_order_id_fkey"
            columns: ["linked_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      qb_tokens: {
        Row: {
          access_token: string
          access_token_expires_at: string
          id: string
          realm_id: string
          refresh_token: string
          refresh_token_expires_at: string
          updated_at: string | null
        }
        Insert: {
          access_token: string
          access_token_expires_at: string
          id?: string
          realm_id: string
          refresh_token: string
          refresh_token_expires_at: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          access_token_expires_at?: string
          id?: string
          realm_id?: string
          refresh_token?: string
          refresh_token_expires_at?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      quick_builds: {
        Row: {
          base_model_id: string | null
          created_at: string | null
          default_selections: Json | null
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
          default_selections?: Json | null
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
          default_selections?: Json | null
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
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          description: string | null
          due_date: string | null
          id: string
          order_id: string | null
          priority: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
          task_type: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          order_id?: string | null
          priority?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          task_type?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          order_id?: string | null
          priority?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          task_type?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          id: string
          is_active: boolean | null
          rate_percent: number
          state_code: string
          state_name: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          is_active?: boolean | null
          rate_percent: number
          state_code: string
          state_name: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          is_active?: boolean | null
          rate_percent?: number
          state_code?: string
          state_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      voice_memos: {
        Row: {
          ai_summary: string | null
          audio_file_name: string | null
          audio_file_size_bytes: number | null
          audio_storage_path: string | null
          commitments: Json | null
          created_at: string | null
          customer_id: string | null
          customer_name_detected: string | null
          deadline: string | null
          drive_file_id: string | null
          duration_seconds: number | null
          equipment_mentioned: Json | null
          id: string
          memo_type: string | null
          order_id: string | null
          processing_error: string | null
          processing_status: string | null
          recorded_by: string | null
          source_app: string | null
          transcript: string | null
          transcription_confidence: number | null
          updated_at: string | null
        }
        Insert: {
          ai_summary?: string | null
          audio_file_name?: string | null
          audio_file_size_bytes?: number | null
          audio_storage_path?: string | null
          commitments?: Json | null
          created_at?: string | null
          customer_id?: string | null
          customer_name_detected?: string | null
          deadline?: string | null
          drive_file_id?: string | null
          duration_seconds?: number | null
          equipment_mentioned?: Json | null
          id?: string
          memo_type?: string | null
          order_id?: string | null
          processing_error?: string | null
          processing_status?: string | null
          recorded_by?: string | null
          source_app?: string | null
          transcript?: string | null
          transcription_confidence?: number | null
          updated_at?: string | null
        }
        Update: {
          ai_summary?: string | null
          audio_file_name?: string | null
          audio_file_size_bytes?: number | null
          audio_storage_path?: string | null
          commitments?: Json | null
          created_at?: string | null
          customer_id?: string | null
          customer_name_detected?: string | null
          deadline?: string | null
          drive_file_id?: string | null
          duration_seconds?: number | null
          equipment_mentioned?: Json | null
          id?: string
          memo_type?: string | null
          order_id?: string | null
          processing_error?: string | null
          processing_status?: string | null
          recorded_by?: string | null
          source_app?: string | null
          transcript?: string | null
          transcription_confidence?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_memos_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_memos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      order_activity_feed: {
        Row: {
          created_by: string | null
          description: string | null
          event_date: string | null
          event_type: string | null
          feed_source: string | null
          file_name: string | null
          file_url: string | null
          id: string | null
          order_id: string | null
          paperwork_id: string | null
          price_impact: number | null
          side: string | null
          status: string | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      generate_estimate_number: { Args: never; Returns: string }
      list_customers_with_stats: {
        Args: {
          page_number?: number
          page_size?: number
          search_term?: string
          sort_column?: string
          sort_direction?: string
        }
        Returns: {
          address_city: string
          address_state: string
          company: string
          created_at: string
          customer_type: string
          email: string
          estimate_count: number
          id: string
          name: string
          order_count: number
          phone: string
          qb_customer_id: string
          total_count: number
          total_revenue: number
        }[]
      }
      normalize_phone: { Args: { raw_phone: string }; Returns: string }
      search_customers: {
        Args: { search_term: string }
        Returns: {
          address_city: string
          address_state: string
          company: string
          customer_type: string
          email: string
          id: string
          name: string
          phone: string
          qb_customer_id: string
        }[]
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
