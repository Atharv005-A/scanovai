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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          authority_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          new_value: Json | null
          previous_value: Json | null
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          authority_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          authority_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
          reason?: string | null
        }
        Relationships: []
      }
      authorities: {
        Row: {
          code: string
          contact_email: string | null
          created_at: string
          id: string
          is_demo: boolean
          name: string
          state: string | null
        }
        Insert: {
          code: string
          contact_email?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
          state?: string | null
        }
        Update: {
          code?: string
          contact_email?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
          state?: string | null
        }
        Relationships: []
      }
      authority_members: {
        Row: {
          authority_id: string
          created_at: string
          id: string
          is_active: boolean
          member_role: Database["public"]["Enums"]["app_role"]
          office_id: string | null
          user_id: string
        }
        Insert: {
          authority_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          member_role?: Database["public"]["Enums"]["app_role"]
          office_id?: string | null
          user_id: string
        }
        Update: {
          authority_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          member_role?: Database["public"]["Enums"]["app_role"]
          office_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "authority_members_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authority_members_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      authority_request_responses: {
        Row: {
          created_at: string
          evidence_path: string | null
          id: string
          message: string
          request_id: string
          responder_id: string
        }
        Insert: {
          created_at?: string
          evidence_path?: string | null
          id?: string
          message: string
          request_id: string
          responder_id: string
        }
        Update: {
          created_at?: string
          evidence_path?: string | null
          id?: string
          message?: string
          request_id?: string
          responder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "authority_request_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "authority_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      authority_requests: {
        Row: {
          authority_id: string | null
          batch_id: string | null
          created_at: string
          created_by: string
          due_date: string | null
          id: string
          inspection_id: string | null
          manufacturer_id: string | null
          message: string
          product_id: string | null
          request_code: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          authority_id?: string | null
          batch_id?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          id?: string
          inspection_id?: string | null
          manufacturer_id?: string | null
          message: string
          product_id?: string | null
          request_code?: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          authority_id?: string | null
          batch_id?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          id?: string
          inspection_id?: string | null
          manufacturer_id?: string | null
          message?: string
          product_id?: string | null
          request_code?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "authority_requests_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authority_requests_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authority_requests_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authority_requests_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authority_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          batch_code: string
          created_at: string
          created_by: string
          declared_mrp: number | null
          declared_net_quantity: string | null
          expiry_date: string | null
          id: string
          notes: string | null
          packing_date: string | null
          product_id: string
          production_date: string | null
          quantity_produced: number | null
          quantity_unit: string | null
          status: Database["public"]["Enums"]["batch_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          batch_code: string
          created_at?: string
          created_by: string
          declared_mrp?: number | null
          declared_net_quantity?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          packing_date?: string | null
          product_id: string
          production_date?: string | null
          quantity_produced?: number | null
          quantity_unit?: string | null
          status?: Database["public"]["Enums"]["batch_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          batch_code?: string
          created_at?: string
          created_by?: string
          declared_mrp?: number | null
          declared_net_quantity?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          packing_date?: string | null
          product_id?: string
          production_date?: string | null
          quantity_produced?: number | null
          quantity_unit?: string | null
          status?: Database["public"]["Enums"]["batch_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_updates: {
        Row: {
          actor_id: string | null
          complaint_id: string
          created_at: string
          id: string
          is_public: boolean
          note: string
          status: Database["public"]["Enums"]["complaint_status"] | null
        }
        Insert: {
          actor_id?: string | null
          complaint_id: string
          created_at?: string
          id?: string
          is_public?: boolean
          note?: string
          status?: Database["public"]["Enums"]["complaint_status"] | null
        }
        Update: {
          actor_id?: string | null
          complaint_id?: string
          created_at?: string
          id?: string
          is_public?: boolean
          note?: string
          status?: Database["public"]["Enums"]["complaint_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "complaint_updates_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          ai_classification: Json | null
          assigned_at: string | null
          assigned_to: string | null
          authority_id: string | null
          barcode: string | null
          category: string | null
          complainant_id: string | null
          complaint_code: string
          created_at: string
          description: string
          duplicate_of: string | null
          guest_email: string | null
          guest_name: string | null
          id: string
          image_path: string | null
          inspection_id: string | null
          latitude: number | null
          longitude: number | null
          manufacturer_name: string | null
          office_id: string | null
          package_scan_id: string | null
          priority: string
          product_id: string | null
          product_name: string
          region: string | null
          resolution_note: string | null
          source: Database["public"]["Enums"]["scan_source"]
          status: Database["public"]["Enums"]["complaint_status"]
          tracking_token: string | null
          updated_at: string
        }
        Insert: {
          ai_classification?: Json | null
          assigned_at?: string | null
          assigned_to?: string | null
          authority_id?: string | null
          barcode?: string | null
          category?: string | null
          complainant_id?: string | null
          complaint_code?: string
          created_at?: string
          description: string
          duplicate_of?: string | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          image_path?: string | null
          inspection_id?: string | null
          latitude?: number | null
          longitude?: number | null
          manufacturer_name?: string | null
          office_id?: string | null
          package_scan_id?: string | null
          priority?: string
          product_id?: string | null
          product_name: string
          region?: string | null
          resolution_note?: string | null
          source?: Database["public"]["Enums"]["scan_source"]
          status?: Database["public"]["Enums"]["complaint_status"]
          tracking_token?: string | null
          updated_at?: string
        }
        Update: {
          ai_classification?: Json | null
          assigned_at?: string | null
          assigned_to?: string | null
          authority_id?: string | null
          barcode?: string | null
          category?: string | null
          complainant_id?: string | null
          complaint_code?: string
          created_at?: string
          description?: string
          duplicate_of?: string | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          image_path?: string | null
          inspection_id?: string | null
          latitude?: number | null
          longitude?: number | null
          manufacturer_name?: string | null
          office_id?: string | null
          package_scan_id?: string | null
          priority?: string
          product_id?: string | null
          product_name?: string
          region?: string | null
          resolution_note?: string | null
          source?: Database["public"]["Enums"]["scan_source"]
          status?: Database["public"]["Enums"]["complaint_status"]
          tracking_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_package_scan_id_fkey"
            columns: ["package_scan_id"]
            isOneToOne: false
            referencedRelation: "package_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_checks: {
        Row: {
          confidence: number
          created_at: string
          detected_value: string | null
          evidence_image_id: string | null
          expected_condition: string | null
          explanation: string
          field_key: string | null
          id: string
          inspection_id: string
          previous_result: Database["public"]["Enums"]["check_result"] | null
          requirement: string
          result: Database["public"]["Enums"]["check_result"]
          rule_code: string
          rule_id: string | null
          rule_number: string
          rule_version_id: string | null
          source_page: number | null
          source_section: string | null
          title: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          detected_value?: string | null
          evidence_image_id?: string | null
          expected_condition?: string | null
          explanation?: string
          field_key?: string | null
          id?: string
          inspection_id: string
          previous_result?: Database["public"]["Enums"]["check_result"] | null
          requirement: string
          result: Database["public"]["Enums"]["check_result"]
          rule_code: string
          rule_id?: string | null
          rule_number: string
          rule_version_id?: string | null
          source_page?: number | null
          source_section?: string | null
          title: string
        }
        Update: {
          confidence?: number
          created_at?: string
          detected_value?: string | null
          evidence_image_id?: string | null
          expected_condition?: string | null
          explanation?: string
          field_key?: string | null
          id?: string
          inspection_id?: string
          previous_result?: Database["public"]["Enums"]["check_result"] | null
          requirement?: string
          result?: Database["public"]["Enums"]["check_result"]
          rule_code?: string
          rule_id?: string | null
          rule_number?: string
          rule_version_id?: string | null
          source_page?: number | null
          source_section?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_checks_evidence_image_id_fkey"
            columns: ["evidence_image_id"]
            isOneToOne: false
            referencedRelation: "inspection_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_checks_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_checks_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rule_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_checks_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "rule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          authority_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          authority_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          authority_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "authorities"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_declarations: {
        Row: {
          band: Database["public"]["Enums"]["confidence_band"]
          confidence: number
          corrected: boolean
          created_at: string
          detected: boolean
          field_key: string
          field_label: string
          id: string
          inspection_id: string
          ocr_bbox: Json | null
          ocr_snippet: string | null
          original_confidence: number | null
          original_value: string | null
          source_image_id: string | null
          updated_at: string
          value: string | null
        }
        Insert: {
          band?: Database["public"]["Enums"]["confidence_band"]
          confidence?: number
          corrected?: boolean
          created_at?: string
          detected?: boolean
          field_key: string
          field_label: string
          id?: string
          inspection_id: string
          ocr_bbox?: Json | null
          ocr_snippet?: string | null
          original_confidence?: number | null
          original_value?: string | null
          source_image_id?: string | null
          updated_at?: string
          value?: string | null
        }
        Update: {
          band?: Database["public"]["Enums"]["confidence_band"]
          confidence?: number
          corrected?: boolean
          created_at?: string
          detected?: boolean
          field_key?: string
          field_label?: string
          id?: string
          inspection_id?: string
          ocr_bbox?: Json | null
          ocr_snippet?: string | null
          original_confidence?: number | null
          original_value?: string | null
          source_image_id?: string | null
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extracted_declarations_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_declarations_source_image_id_fkey"
            columns: ["source_image_id"]
            isOneToOne: false
            referencedRelation: "inspection_images"
            referencedColumns: ["id"]
          },
        ]
      }
      extractions: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          input_source: string
          inspection_id: string
          model: string | null
          ocr_result_id: string | null
          provider: string
          raw_text: string | null
          status: string
          structured: Json
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_source?: string
          inspection_id: string
          model?: string | null
          ocr_result_id?: string | null
          provider?: string
          raw_text?: string | null
          status?: string
          structured?: Json
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_source?: string
          inspection_id?: string
          model?: string | null
          ocr_result_id?: string | null
          provider?: string
          raw_text?: string | null
          status?: string
          structured?: Json
        }
        Relationships: [
          {
            foreignKeyName: "extractions_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extractions_ocr_result_id_fkey"
            columns: ["ocr_result_id"]
            isOneToOne: false
            referencedRelation: "ocr_results"
            referencedColumns: ["id"]
          },
        ]
      }
      field_corrections: {
        Row: {
          corrected_by: string
          created_at: string
          field_key: string
          id: string
          inspection_id: string
          new_value: string | null
          previous_value: string | null
          reason: string | null
        }
        Insert: {
          corrected_by: string
          created_at?: string
          field_key: string
          id?: string
          inspection_id: string
          new_value?: string | null
          previous_value?: string | null
          reason?: string | null
        }
        Update: {
          corrected_by?: string
          created_at?: string
          field_key?: string
          id?: string
          inspection_id?: string
          new_value?: string | null
          previous_value?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_corrections_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_amendments: {
        Row: {
          applied_at: string | null
          approved_by: string | null
          changes: Json
          created_at: string
          decided_at: string | null
          id: string
          inspection_id: string
          reason: string
          requested_by: string
          status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          applied_at?: string | null
          approved_by?: string | null
          changes?: Json
          created_at?: string
          decided_at?: string | null
          id?: string
          inspection_id: string
          reason: string
          requested_by: string
          status?: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          applied_at?: string | null
          approved_by?: string | null
          changes?: Json
          created_at?: string
          decided_at?: string | null
          id?: string
          inspection_id?: string
          reason?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "inspection_amendments_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_images: {
        Row: {
          bytes: number | null
          client_ref: string | null
          created_at: string
          height: number | null
          id: string
          inspection_id: string
          kind: string
          ocr_status: Database["public"]["Enums"]["ocr_status"]
          preprocess_note: string | null
          processed_path: string | null
          quality_note: string | null
          quality_score: number | null
          side: string
          storage_path: string
          width: number | null
        }
        Insert: {
          bytes?: number | null
          client_ref?: string | null
          created_at?: string
          height?: number | null
          id?: string
          inspection_id: string
          kind?: string
          ocr_status?: Database["public"]["Enums"]["ocr_status"]
          preprocess_note?: string | null
          processed_path?: string | null
          quality_note?: string | null
          quality_score?: number | null
          side?: string
          storage_path: string
          width?: number | null
        }
        Update: {
          bytes?: number | null
          client_ref?: string | null
          created_at?: string
          height?: number | null
          id?: string
          inspection_id?: string
          kind?: string
          ocr_status?: Database["public"]["Enums"]["ocr_status"]
          preprocess_note?: string | null
          processed_path?: string | null
          quality_note?: string | null
          quality_score?: number | null
          side?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_images_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          ai_suggested_category: string | null
          amended_count: number
          assessment_score: number | null
          authority_id: string | null
          barcode: string | null
          barcode_format: string | null
          batch_id: string | null
          category: string
          category_confirmed: boolean
          category_confirmed_at: string | null
          category_confirmed_by: string | null
          client_ref: string | null
          conflict_flag: boolean
          conflict_note: string | null
          created_at: string
          finalized_at: string | null
          id: string
          inspector_id: string
          inspector_notes: string | null
          is_demo: boolean
          last_synced_at: string | null
          latitude: number | null
          location_label: string | null
          longitude: number | null
          manufacturer_name: string | null
          ocr_provider: string | null
          ocr_status: Database["public"]["Enums"]["ocr_status"]
          office_id: string | null
          product_id: string | null
          product_name: string | null
          reference_code: string
          region: string | null
          registry_match: Database["public"]["Enums"]["registry_match"]
          result: Database["public"]["Enums"]["overall_result"]
          review_requested: boolean
          rule_version_id: string | null
          status: Database["public"]["Enums"]["inspection_status"]
          supervisor_decision: string | null
          supervisor_id: string | null
          supervisor_notes: string | null
          supervisor_reviewed_at: string | null
          sync_status: Database["public"]["Enums"]["sync_status"]
          updated_at: string
        }
        Insert: {
          ai_suggested_category?: string | null
          amended_count?: number
          assessment_score?: number | null
          authority_id?: string | null
          barcode?: string | null
          barcode_format?: string | null
          batch_id?: string | null
          category?: string
          category_confirmed?: boolean
          category_confirmed_at?: string | null
          category_confirmed_by?: string | null
          client_ref?: string | null
          conflict_flag?: boolean
          conflict_note?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          inspector_id: string
          inspector_notes?: string | null
          is_demo?: boolean
          last_synced_at?: string | null
          latitude?: number | null
          location_label?: string | null
          longitude?: number | null
          manufacturer_name?: string | null
          ocr_provider?: string | null
          ocr_status?: Database["public"]["Enums"]["ocr_status"]
          office_id?: string | null
          product_id?: string | null
          product_name?: string | null
          reference_code?: string
          region?: string | null
          registry_match?: Database["public"]["Enums"]["registry_match"]
          result?: Database["public"]["Enums"]["overall_result"]
          review_requested?: boolean
          rule_version_id?: string | null
          status?: Database["public"]["Enums"]["inspection_status"]
          supervisor_decision?: string | null
          supervisor_id?: string | null
          supervisor_notes?: string | null
          supervisor_reviewed_at?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
        }
        Update: {
          ai_suggested_category?: string | null
          amended_count?: number
          assessment_score?: number | null
          authority_id?: string | null
          barcode?: string | null
          barcode_format?: string | null
          batch_id?: string | null
          category?: string
          category_confirmed?: boolean
          category_confirmed_at?: string | null
          category_confirmed_by?: string | null
          client_ref?: string | null
          conflict_flag?: boolean
          conflict_note?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          inspector_id?: string
          inspector_notes?: string | null
          is_demo?: boolean
          last_synced_at?: string | null
          latitude?: number | null
          location_label?: string | null
          longitude?: number | null
          manufacturer_name?: string | null
          ocr_provider?: string | null
          ocr_status?: Database["public"]["Enums"]["ocr_status"]
          office_id?: string | null
          product_id?: string | null
          product_name?: string | null
          reference_code?: string
          region?: string | null
          registry_match?: Database["public"]["Enums"]["registry_match"]
          result?: Database["public"]["Enums"]["overall_result"]
          review_requested?: boolean
          rule_version_id?: string | null
          status?: Database["public"]["Enums"]["inspection_status"]
          supervisor_decision?: string | null
          supervisor_id?: string | null
          supervisor_notes?: string | null
          supervisor_reviewed_at?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "rule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturers: {
        Row: {
          address: string | null
          city: string | null
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          gstin: string | null
          id: string
          is_demo: boolean
          name: string
          owner_id: string | null
          pincode: string | null
          registration_no: string | null
          state: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          is_demo?: boolean
          name: string
          owner_id?: string | null
          pincode?: string | null
          registration_no?: string | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          owner_id?: string | null
          pincode?: string | null
          registration_no?: string | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          email_error: string | null
          email_status: string | null
          entity: string | null
          entity_id: string | null
          id: string
          is_read: boolean
          kind: string
          link: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          channel?: string
          created_at?: string
          email_error?: string | null
          email_status?: string | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          is_read?: boolean
          kind?: string
          link?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          email_error?: string | null
          email_status?: string | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          is_read?: boolean
          kind?: string
          link?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      ocr_results: {
        Row: {
          blocks: Json
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          image_id: string | null
          inspection_id: string | null
          mean_confidence: number | null
          model: string | null
          package_scan_id: string | null
          provider: string
          provider_label: string
          raw_text: string | null
          status: Database["public"]["Enums"]["ocr_status"]
          word_count: number | null
        }
        Insert: {
          blocks?: Json
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          image_id?: string | null
          inspection_id?: string | null
          mean_confidence?: number | null
          model?: string | null
          package_scan_id?: string | null
          provider: string
          provider_label?: string
          raw_text?: string | null
          status?: Database["public"]["Enums"]["ocr_status"]
          word_count?: number | null
        }
        Update: {
          blocks?: Json
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          image_id?: string | null
          inspection_id?: string | null
          mean_confidence?: number | null
          model?: string | null
          package_scan_id?: string | null
          provider?: string
          provider_label?: string
          raw_text?: string | null
          status?: Database["public"]["Enums"]["ocr_status"]
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ocr_results_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "inspection_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_results_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_results_package_scan_id_fkey"
            columns: ["package_scan_id"]
            isOneToOne: false
            referencedRelation: "package_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      offices: {
        Row: {
          authority_id: string
          created_at: string
          department_id: string | null
          district: string | null
          id: string
          name: string
          state: string | null
        }
        Insert: {
          authority_id: string
          created_at?: string
          department_id?: string | null
          district?: string | null
          id?: string
          name: string
          state?: string | null
        }
        Update: {
          authority_id?: string
          created_at?: string
          department_id?: string | null
          district?: string | null
          id?: string
          name?: string
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offices_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offices_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      package_scans: {
        Row: {
          assessment: Json
          barcode: string | null
          barcode_format: string | null
          batch_id: string | null
          category: string | null
          client_ref: string | null
          created_at: string
          id: string
          image_path: string | null
          inspection_id: string | null
          latitude: number | null
          longitude: number | null
          mismatch_notes: string | null
          observed: Json
          ocr_provider: string | null
          ocr_status: Database["public"]["Enums"]["ocr_status"]
          product_id: string | null
          region: string | null
          registry_match: Database["public"]["Enums"]["registry_match"]
          scan_code: string
          scanned_by: string | null
          source: Database["public"]["Enums"]["scan_source"]
        }
        Insert: {
          assessment?: Json
          barcode?: string | null
          barcode_format?: string | null
          batch_id?: string | null
          category?: string | null
          client_ref?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          inspection_id?: string | null
          latitude?: number | null
          longitude?: number | null
          mismatch_notes?: string | null
          observed?: Json
          ocr_provider?: string | null
          ocr_status?: Database["public"]["Enums"]["ocr_status"]
          product_id?: string | null
          region?: string | null
          registry_match?: Database["public"]["Enums"]["registry_match"]
          scan_code?: string
          scanned_by?: string | null
          source?: Database["public"]["Enums"]["scan_source"]
        }
        Update: {
          assessment?: Json
          barcode?: string | null
          barcode_format?: string | null
          batch_id?: string | null
          category?: string | null
          client_ref?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          inspection_id?: string | null
          latitude?: number | null
          longitude?: number | null
          mismatch_notes?: string | null
          observed?: Json
          ocr_provider?: string | null
          ocr_status?: Database["public"]["Enums"]["ocr_status"]
          product_id?: string | null
          region?: string | null
          registry_match?: Database["public"]["Enums"]["registry_match"]
          scan_code?: string
          scanned_by?: string | null
          source?: Database["public"]["Enums"]["scan_source"]
        }
        Relationships: [
          {
            foreignKeyName: "package_scans_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_scans_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_scans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_barcodes: {
        Row: {
          barcode: string
          barcode_format: string | null
          created_at: string
          created_by: string | null
          id: string
          is_primary: boolean
          product_id: string
        }
        Insert: {
          barcode: string
          barcode_format?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          product_id: string
        }
        Update: {
          barcode?: string
          barcode_format?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_declarations: {
        Row: {
          created_at: string
          field_key: string
          field_label: string
          id: string
          product_id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          field_key: string
          field_label?: string
          id?: string
          product_id: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          field_key?: string
          field_label?: string
          id?: string
          product_id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_declarations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category: string
          country_of_origin: string | null
          created_at: string
          created_by: string | null
          declared_mrp: number | null
          declared_net_quantity: string | null
          id: string
          importer_name: string | null
          is_demo: boolean
          manufacturer_id: string | null
          name: string
          pack_type: string | null
          packer_name: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sku_code: string | null
          status: Database["public"]["Enums"]["product_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category?: string
          country_of_origin?: string | null
          created_at?: string
          created_by?: string | null
          declared_mrp?: number | null
          declared_net_quantity?: string | null
          id?: string
          importer_name?: string | null
          is_demo?: boolean
          manufacturer_id?: string | null
          name: string
          pack_type?: string | null
          packer_name?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sku_code?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category?: string
          country_of_origin?: string | null
          created_at?: string
          created_by?: string | null
          declared_mrp?: number | null
          declared_net_quantity?: string | null
          id?: string
          importer_name?: string | null
          is_demo?: boolean
          manufacturer_id?: string | null
          name?: string
          pack_type?: string | null
          packer_name?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sku_code?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          designation: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          designation?: string | null
          email?: string
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          designation?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          id: string
          subject: string
          updated_at: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          id?: string
          subject: string
          updated_at?: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          id?: string
          subject?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      registry_evidence: {
        Row: {
          batch_id: string | null
          caption: string | null
          created_at: string
          height: number | null
          id: string
          kind: string
          product_id: string
          side: string | null
          storage_path: string
          uploaded_by: string
          width: number | null
        }
        Insert: {
          batch_id?: string | null
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          kind?: string
          product_id: string
          side?: string | null
          storage_path: string
          uploaded_by: string
          width?: number | null
        }
        Update: {
          batch_id?: string | null
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          kind?: string
          product_id?: string
          side?: string | null
          storage_path?: string
          uploaded_by?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "registry_evidence_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registry_evidence_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          checksum: string
          created_at: string
          generated_by: string
          id: string
          inspection_id: string
          payload: Json
          report_code: string
          rule_version_id: string | null
        }
        Insert: {
          checksum: string
          created_at?: string
          generated_by: string
          id?: string
          inspection_id: string
          payload?: Json
          report_code: string
          rule_version_id?: string | null
        }
        Update: {
          checksum?: string
          created_at?: string
          generated_by?: string
          id?: string
          inspection_id?: string
          payload?: Json
          report_code?: string
          rule_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "rule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      retail_scans: {
        Row: {
          alert: Database["public"]["Enums"]["retail_alert"]
          barcode: string
          batch_id: string | null
          created_at: string
          held_for_review: boolean
          id: string
          note: string | null
          package_scan_id: string | null
          product_id: string | null
          retailer_id: string
          session_id: string | null
        }
        Insert: {
          alert?: Database["public"]["Enums"]["retail_alert"]
          barcode: string
          batch_id?: string | null
          created_at?: string
          held_for_review?: boolean
          id?: string
          note?: string | null
          package_scan_id?: string | null
          product_id?: string | null
          retailer_id: string
          session_id?: string | null
        }
        Update: {
          alert?: Database["public"]["Enums"]["retail_alert"]
          barcode?: string
          batch_id?: string | null
          created_at?: string
          held_for_review?: boolean
          id?: string
          note?: string | null
          package_scan_id?: string | null
          product_id?: string | null
          retailer_id?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retail_scans_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retail_scans_package_scan_id_fkey"
            columns: ["package_scan_id"]
            isOneToOne: false
            referencedRelation: "package_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retail_scans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retail_scans_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "retail_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      retail_sessions: {
        Row: {
          closed_at: string | null
          id: string
          location_label: string | null
          opened_at: string
          retailer_id: string
          store_name: string | null
        }
        Insert: {
          closed_at?: string | null
          id?: string
          location_label?: string | null
          opened_at?: string
          retailer_id: string
          store_name?: string | null
        }
        Update: {
          closed_at?: string | null
          id?: string
          location_label?: string | null
          opened_at?: string
          retailer_id?: string
          store_name?: string | null
        }
        Relationships: []
      }
      role_grants: {
        Row: {
          authority_id: string | null
          created_at: string
          granted_by: string | null
          id: string
          reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          authority_id?: string | null
          created_at?: string
          granted_by?: string | null
          id?: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          authority_id?: string | null
          created_at?: string
          granted_by?: string | null
          id?: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_grants_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "authorities"
            referencedColumns: ["id"]
          },
        ]
      }
      role_invitations: {
        Row: {
          authority_id: string | null
          code: string
          created_at: string
          created_by: string | null
          email: string | null
          expires_at: string
          id: string
          is_active: boolean
          max_uses: number
          note: string | null
          office_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          uses: number
        }
        Insert: {
          authority_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean
          max_uses?: number
          note?: string | null
          office_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          uses?: number
        }
        Update: {
          authority_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean
          max_uses?: number
          note?: string | null
          office_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "role_invitations_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_invitations_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      role_requests: {
        Row: {
          authority_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          justification: string | null
          requested_role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["request_status"]
          user_id: string
        }
        Insert: {
          authority_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          justification?: string | null
          requested_role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["request_status"]
          user_id: string
        }
        Update: {
          authority_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          justification?: string | null
          requested_role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["request_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_requests_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "authorities"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_definitions: {
        Row: {
          applicable_categories: string[]
          check_type: string
          created_at: string
          display_order: number
          exceptions: string | null
          field_key: string | null
          id: string
          is_active: boolean
          parameters: Json
          requirement: string
          rule_code: string
          rule_number: string
          rule_version_id: string
          source_page: number | null
          source_section: string
          title: string
        }
        Insert: {
          applicable_categories?: string[]
          check_type: string
          created_at?: string
          display_order?: number
          exceptions?: string | null
          field_key?: string | null
          id?: string
          is_active?: boolean
          parameters?: Json
          requirement: string
          rule_code: string
          rule_number: string
          rule_version_id: string
          source_page?: number | null
          source_section: string
          title: string
        }
        Update: {
          applicable_categories?: string[]
          check_type?: string
          created_at?: string
          display_order?: number
          exceptions?: string | null
          field_key?: string | null
          id?: string
          is_active?: boolean
          parameters?: Json
          requirement?: string
          rule_code?: string
          rule_number?: string
          rule_version_id?: string
          source_page?: number | null
          source_section?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_definitions_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "rule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_versions: {
        Row: {
          created_at: string
          effective_from: string | null
          id: string
          is_active: boolean
          notes: string | null
          source_document: string
          version_label: string
        }
        Insert: {
          created_at?: string
          effective_from?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          source_document: string
          version_label: string
        }
        Update: {
          created_at?: string
          effective_from?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          source_document?: string
          version_label?: string
        }
        Relationships: []
      }
      sync_queue: {
        Row: {
          attempts: number
          client_op_id: string | null
          completed_at: string | null
          created_at: string
          entity: string
          id: string
          inspection_id: string | null
          last_error: string | null
          next_attempt_at: string
          operation: string
          payload: Json
          status: Database["public"]["Enums"]["sync_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          client_op_id?: string | null
          completed_at?: string | null
          created_at?: string
          entity?: string
          id?: string
          inspection_id?: string | null
          last_error?: string | null
          next_attempt_at?: string
          operation: string
          payload?: Json
          status?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          client_op_id?: string | null
          completed_at?: string | null
          created_at?: string
          entity?: string
          id?: string
          inspection_id?: string | null
          last_error?: string | null
          next_attempt_at?: string
          operation?: string
          payload?: Json
          status?: Database["public"]["Enums"]["sync_status"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_inspection_amendment: {
        Args: { _amendment_id: string }
        Returns: Json
      }
      can_request_role: { Args: { _authority: string }; Returns: boolean }
      can_view_authority_request: {
        Args: { _request_id: string }
        Returns: boolean
      }
      can_view_complaint: { Args: { _complaint_id: string }; Returns: boolean }
      can_view_inspection: {
        Args: { _inspection_id: string }
        Returns: boolean
      }
      consume_rate_limit: {
        Args: {
          _bucket: string
          _limit: number
          _subject: string
          _window_seconds: number
        }
        Returns: boolean
      }
      grant_role: {
        Args: {
          _reason: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_authority_staff: { Args: { _authority_id: string }; Returns: boolean }
      is_gov_staff: { Args: { _user_id: string }; Returns: boolean }
      my_authority_id: { Args: never; Returns: string }
      my_manufacturer_id: { Args: never; Returns: string }
      owns_inspection: { Args: { _inspection_id: string }; Returns: boolean }
      owns_manufacturer: {
        Args: { _manufacturer_id: string }
        Returns: boolean
      }
      owns_product: { Args: { _product_id: string }; Returns: boolean }
      product_is_active: { Args: { _product_id: string }; Returns: boolean }
      public_barcode_lookup: { Args: { _barcode: string }; Returns: Json }
      record_supervisor_decision: {
        Args: { _decision: string; _inspection_id: string; _notes: string }
        Returns: Json
      }
      redeem_role_invitation: { Args: { _code: string }; Returns: Json }
      revoke_role: {
        Args: {
          _reason: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: Json
      }
      track_complaint: { Args: { _token: string }; Returns: Json }
      write_audit_log: {
        Args: {
          _action: string
          _actor?: string
          _authority?: string
          _entity: string
          _entity_id?: string
          _new?: Json
          _previous?: Json
          _reason?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "citizen"
        | "inspector"
        | "supervisor"
        | "manufacturer"
        | "authority_admin"
        | "system_admin"
        | "retailer"
      batch_status: "draft" | "submitted" | "active" | "recalled" | "closed"
      check_result:
        | "pass"
        | "fail"
        | "needs_review"
        | "not_applicable"
        | "unable_to_verify"
        | "manual_verification_required"
      complaint_status:
        | "submitted"
        | "under_review"
        | "assigned"
        | "investigation"
        | "resolved"
        | "rejected"
        | "closed"
      confidence_band: "high" | "medium" | "low" | "none"
      inspection_status:
        | "draft"
        | "capturing"
        | "extracted"
        | "checked"
        | "finalized"
        | "cancelled"
      ocr_status:
        | "pending"
        | "processing"
        | "succeeded"
        | "failed"
        | "not_configured"
        | "skipped"
      overall_result:
        | "compliant"
        | "non_compliant"
        | "needs_review"
        | "unable_to_verify"
        | "pending"
      product_status:
        | "draft"
        | "submitted"
        | "active"
        | "suspended"
        | "rejected"
      registry_match:
        | "barcode_absent"
        | "barcode_unknown"
        | "product_found_batch_unknown"
        | "batch_found"
        | "match"
        | "mismatch"
        | "review"
        | "insufficient_evidence"
      request_status: "pending" | "approved" | "rejected" | "expired"
      retail_alert:
        | "verified"
        | "potential_mismatch"
        | "review_required"
        | "product_not_found"
        | "registry_unavailable"
      scan_source: "public" | "retail" | "inspector"
      sync_status: "synced" | "pending" | "processing" | "failed"
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
        "citizen",
        "inspector",
        "supervisor",
        "manufacturer",
        "authority_admin",
        "system_admin",
        "retailer",
      ],
      batch_status: ["draft", "submitted", "active", "recalled", "closed"],
      check_result: [
        "pass",
        "fail",
        "needs_review",
        "not_applicable",
        "unable_to_verify",
        "manual_verification_required",
      ],
      complaint_status: [
        "submitted",
        "under_review",
        "assigned",
        "investigation",
        "resolved",
        "rejected",
        "closed",
      ],
      confidence_band: ["high", "medium", "low", "none"],
      inspection_status: [
        "draft",
        "capturing",
        "extracted",
        "checked",
        "finalized",
        "cancelled",
      ],
      ocr_status: [
        "pending",
        "processing",
        "succeeded",
        "failed",
        "not_configured",
        "skipped",
      ],
      overall_result: [
        "compliant",
        "non_compliant",
        "needs_review",
        "unable_to_verify",
        "pending",
      ],
      product_status: ["draft", "submitted", "active", "suspended", "rejected"],
      registry_match: [
        "barcode_absent",
        "barcode_unknown",
        "product_found_batch_unknown",
        "batch_found",
        "match",
        "mismatch",
        "review",
        "insufficient_evidence",
      ],
      request_status: ["pending", "approved", "rejected", "expired"],
      retail_alert: [
        "verified",
        "potential_mismatch",
        "review_required",
        "product_not_found",
        "registry_unavailable",
      ],
      scan_source: ["public", "retail", "inspector"],
      sync_status: ["synced", "pending", "processing", "failed"],
    },
  },
} as const
