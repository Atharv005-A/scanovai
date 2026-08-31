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
      complaints: {
        Row: {
          assigned_to: string | null
          authority_id: string | null
          barcode: string | null
          complainant_id: string
          complaint_code: string
          created_at: string
          description: string
          id: string
          image_path: string | null
          latitude: number | null
          longitude: number | null
          manufacturer_name: string | null
          product_name: string
          resolution_note: string | null
          status: Database["public"]["Enums"]["complaint_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          authority_id?: string | null
          barcode?: string | null
          complainant_id: string
          complaint_code?: string
          created_at?: string
          description: string
          id?: string
          image_path?: string | null
          latitude?: number | null
          longitude?: number | null
          manufacturer_name?: string | null
          product_name: string
          resolution_note?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          authority_id?: string | null
          barcode?: string | null
          complainant_id?: string
          complaint_code?: string
          created_at?: string
          description?: string
          id?: string
          image_path?: string | null
          latitude?: number | null
          longitude?: number | null
          manufacturer_name?: string | null
          product_name?: string
          resolution_note?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
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
          id: string
          inspection_id: string
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
          id?: string
          inspection_id: string
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
          id?: string
          inspection_id?: string
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
          error_message: string | null
          id: string
          inspection_id: string
          model: string | null
          provider: string
          raw_text: string | null
          status: string
          structured: Json
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          inspection_id: string
          model?: string | null
          provider?: string
          raw_text?: string | null
          status?: string
          structured?: Json
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          inspection_id?: string
          model?: string | null
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
      inspection_images: {
        Row: {
          created_at: string
          height: number | null
          id: string
          inspection_id: string
          quality_note: string | null
          quality_score: number | null
          side: string
          storage_path: string
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          inspection_id: string
          quality_note?: string | null
          quality_score?: number | null
          side?: string
          storage_path: string
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          inspection_id?: string
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
          assessment_score: number | null
          authority_id: string | null
          barcode: string | null
          barcode_format: string | null
          category: string
          conflict_flag: boolean
          conflict_note: string | null
          created_at: string
          finalized_at: string | null
          id: string
          inspector_id: string
          inspector_notes: string | null
          is_demo: boolean
          latitude: number | null
          location_label: string | null
          longitude: number | null
          manufacturer_name: string | null
          office_id: string | null
          product_id: string | null
          product_name: string | null
          reference_code: string
          result: Database["public"]["Enums"]["overall_result"]
          rule_version_id: string | null
          status: Database["public"]["Enums"]["inspection_status"]
          supervisor_decision: string | null
          supervisor_id: string | null
          supervisor_notes: string | null
          sync_status: Database["public"]["Enums"]["sync_status"]
          updated_at: string
        }
        Insert: {
          assessment_score?: number | null
          authority_id?: string | null
          barcode?: string | null
          barcode_format?: string | null
          category?: string
          conflict_flag?: boolean
          conflict_note?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          inspector_id: string
          inspector_notes?: string | null
          is_demo?: boolean
          latitude?: number | null
          location_label?: string | null
          longitude?: number | null
          manufacturer_name?: string | null
          office_id?: string | null
          product_id?: string | null
          product_name?: string | null
          reference_code?: string
          result?: Database["public"]["Enums"]["overall_result"]
          rule_version_id?: string | null
          status?: Database["public"]["Enums"]["inspection_status"]
          supervisor_decision?: string | null
          supervisor_id?: string | null
          supervisor_notes?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
        }
        Update: {
          assessment_score?: number | null
          authority_id?: string | null
          barcode?: string | null
          barcode_format?: string | null
          category?: string
          conflict_flag?: boolean
          conflict_note?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          inspector_id?: string
          inspector_notes?: string | null
          is_demo?: boolean
          latitude?: number | null
          location_label?: string | null
          longitude?: number | null
          manufacturer_name?: string | null
          office_id?: string | null
          product_id?: string | null
          product_name?: string | null
          reference_code?: string
          result?: Database["public"]["Enums"]["overall_result"]
          rule_version_id?: string | null
          status?: Database["public"]["Enums"]["inspection_status"]
          supervisor_decision?: string | null
          supervisor_id?: string | null
          supervisor_notes?: string | null
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
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          id: string
          is_demo: boolean
          name: string
          owner_id: string | null
          registration_no: string | null
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
          owner_id?: string | null
          registration_no?: string | null
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
          owner_id?: string | null
          registration_no?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
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
      products: {
        Row: {
          barcode: string | null
          category: string
          created_at: string
          created_by: string | null
          declared_mrp: number | null
          declared_net_quantity: string | null
          id: string
          is_demo: boolean
          manufacturer_id: string | null
          name: string
        }
        Insert: {
          barcode?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          declared_mrp?: number | null
          declared_net_quantity?: string | null
          id?: string
          is_demo?: boolean
          manufacturer_id?: string | null
          name: string
        }
        Update: {
          barcode?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          declared_mrp?: number | null
          declared_net_quantity?: string | null
          id?: string
          is_demo?: boolean
          manufacturer_id?: string | null
          name?: string
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
          created_at: string
          id: string
          inspection_id: string | null
          last_error: string | null
          operation: string
          payload: Json
          status: Database["public"]["Enums"]["sync_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          inspection_id?: string | null
          last_error?: string | null
          operation: string
          payload?: Json
          status?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          inspection_id?: string | null
          last_error?: string | null
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
      can_view_inspection: {
        Args: { _inspection_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_gov_staff: { Args: { _user_id: string }; Returns: boolean }
      my_authority_id: { Args: never; Returns: string }
      owns_inspection: { Args: { _inspection_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "citizen"
        | "inspector"
        | "supervisor"
        | "manufacturer"
        | "authority_admin"
        | "system_admin"
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
      overall_result:
        | "compliant"
        | "non_compliant"
        | "needs_review"
        | "unable_to_verify"
        | "pending"
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
        "citizen",
        "inspector",
        "supervisor",
        "manufacturer",
        "authority_admin",
        "system_admin",
      ],
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
      overall_result: [
        "compliant",
        "non_compliant",
        "needs_review",
        "unable_to_verify",
        "pending",
      ],
      sync_status: ["synced", "pending", "processing", "failed"],
    },
  },
} as const
