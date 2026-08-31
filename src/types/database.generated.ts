export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          action: string
          actor_email: string
          actor_name: string | null
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          legacy_id: string | null
          metadata: Json
          occurred_at: string
          summary: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_email: string
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          legacy_id?: string | null
          metadata?: Json
          occurred_at?: string
          summary: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_email?: string
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          legacy_id?: string | null
          metadata?: Json
          occurred_at?: string
          summary?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      commits: {
        Row: {
          actor_user_id: string
          applied_at: string | null
          auto_merged: boolean
          base_data_version: number | null
          client_created_at: string | null
          commit_id: string
          created_at: string
          error_code: string | null
          id: string
          operation_count: number
          operation_counts: Json
          request_checksum: string
          result_data_version: number | null
          status: Database["public"]["Enums"]["commit_status"]
          workspace_id: string
        }
        Insert: {
          actor_user_id: string
          applied_at?: string | null
          auto_merged?: boolean
          base_data_version?: number | null
          client_created_at?: string | null
          commit_id: string
          created_at?: string
          error_code?: string | null
          id?: string
          operation_count?: number
          operation_counts?: Json
          request_checksum?: string
          result_data_version?: number | null
          status?: Database["public"]["Enums"]["commit_status"]
          workspace_id: string
        }
        Update: {
          actor_user_id?: string
          applied_at?: string | null
          auto_merged?: boolean
          base_data_version?: number | null
          client_created_at?: string | null
          commit_id?: string
          created_at?: string
          error_code?: string | null
          id?: string
          operation_count?: number
          operation_counts?: Json
          request_checksum?: string
          result_data_version?: number | null
          status?: Database["public"]["Enums"]["commit_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_operations: {
        Row: {
          base_values: Json | null
          changes: Json | null
          created_at: string
          decision_note: string | null
          draft_submission_id: string
          entity_id: string | null
          id: string
          operation_id: string
          operation_type: string
          profile_legacy_id: string | null
          sequence_number: number
          status: Database["public"]["Enums"]["draft_operation_status"]
          updated_at: string
          value: Json | null
          workspace_id: string
        }
        Insert: {
          base_values?: Json | null
          changes?: Json | null
          created_at?: string
          decision_note?: string | null
          draft_submission_id: string
          entity_id?: string | null
          id?: string
          operation_id: string
          operation_type: string
          profile_legacy_id?: string | null
          sequence_number: number
          status?: Database["public"]["Enums"]["draft_operation_status"]
          updated_at?: string
          value?: Json | null
          workspace_id: string
        }
        Update: {
          base_values?: Json | null
          changes?: Json | null
          created_at?: string
          decision_note?: string | null
          draft_submission_id?: string
          entity_id?: string | null
          id?: string
          operation_id?: string
          operation_type?: string
          profile_legacy_id?: string | null
          sequence_number?: number
          status?: Database["public"]["Enums"]["draft_operation_status"]
          updated_at?: string
          value?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_operations_draft_submission_id_fkey"
            columns: ["draft_submission_id"]
            isOneToOne: false
            referencedRelation: "draft_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_operations_submission_workspace_fk"
            columns: ["workspace_id", "draft_submission_id"]
            isOneToOne: false
            referencedRelation: "draft_submissions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "draft_operations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_review_events: {
        Row: {
          created_at: string
          decision: string
          draft_revision: number
          draft_submission_id: string
          id: string
          note: string | null
          operation_ids: string[]
          reviewer_user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          decision: string
          draft_revision: number
          draft_submission_id: string
          id?: string
          note?: string | null
          operation_ids: string[]
          reviewer_user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          decision?: string
          draft_revision?: number
          draft_submission_id?: string
          id?: string
          note?: string | null
          operation_ids?: string[]
          reviewer_user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_review_events_draft_submission_id_fkey"
            columns: ["draft_submission_id"]
            isOneToOne: false
            referencedRelation: "draft_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_review_events_submission_workspace_fk"
            columns: ["workspace_id", "draft_submission_id"]
            isOneToOne: false
            referencedRelation: "draft_submissions"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "draft_review_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_submissions: {
        Row: {
          base_data_version: number
          checksum: string
          contributor_user_id: string
          created_at: string
          id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          revision: number
          status: Database["public"]["Enums"]["draft_status"]
          submitted_at: string | null
          terminal_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          base_data_version: number
          checksum: string
          contributor_user_id: string
          created_at?: string
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          revision?: number
          status?: Database["public"]["Enums"]["draft_status"]
          submitted_at?: string | null
          terminal_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          base_data_version?: number
          checksum?: string
          contributor_user_id?: string
          created_at?: string
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          revision?: number
          status?: Database["public"]["Enums"]["draft_status"]
          submitted_at?: string | null
          terminal_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_submissions_member_fk"
            columns: ["workspace_id", "contributor_user_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["workspace_id", "user_id"]
          },
          {
            foreignKeyName: "draft_submissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      family_profiles: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          legacy_id: string
          legacy_photo_file_id: string | null
          lineage_surname: string
          name: string
          requires_secret: boolean
          subject_person_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          legacy_id: string
          legacy_photo_file_id?: string | null
          lineage_surname?: string
          name: string
          requires_secret?: boolean
          subject_person_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          legacy_id?: string
          legacy_photo_file_id?: string | null
          lineage_surname?: string
          name?: string
          requires_secret?: boolean
          subject_person_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_profiles_subject_person_fk"
            columns: ["workspace_id", "id", "subject_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["workspace_id", "family_profile_id", "id"]
          },
          {
            foreignKeyName: "family_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          byte_size: number | null
          caption: string
          checksum: string | null
          created_at: string
          family_profile_id: string
          id: string
          is_primary: boolean
          legacy_drive_file_id: string | null
          legacy_id: string
          mime_type: string | null
          person_id: string
          sort_order: number | null
          storage_bucket: string | null
          storage_path: string | null
          storage_status: string
          taken_date: string | null
          thumbnail_storage_path: string | null
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          byte_size?: number | null
          caption?: string
          checksum?: string | null
          created_at?: string
          family_profile_id: string
          id?: string
          is_primary?: boolean
          legacy_drive_file_id?: string | null
          legacy_id: string
          mime_type?: string | null
          person_id: string
          sort_order?: number | null
          storage_bucket?: string | null
          storage_path?: string | null
          storage_status?: string
          taken_date?: string | null
          thumbnail_storage_path?: string | null
          type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          byte_size?: number | null
          caption?: string
          checksum?: string | null
          created_at?: string
          family_profile_id?: string
          id?: string
          is_primary?: boolean
          legacy_drive_file_id?: string | null
          legacy_id?: string
          mime_type?: string | null
          person_id?: string
          sort_order?: number | null
          storage_bucket?: string | null
          storage_path?: string | null
          storage_status?: string
          taken_date?: string | null
          thumbnail_storage_path?: string | null
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_person_fk"
            columns: ["workspace_id", "family_profile_id", "person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["workspace_id", "family_profile_id", "id"]
          },
        ]
      }
      media_cleanup_queue: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          original_path: string
          status: Database["public"]["Enums"]["media_cleanup_status"]
          thumbnail_path: string | null
          workspace_id: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          original_path: string
          status?: Database["public"]["Enums"]["media_cleanup_status"]
          thumbnail_path?: string | null
          workspace_id: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          original_path?: string
          status?: Database["public"]["Enums"]["media_cleanup_status"]
          thumbnail_path?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_cleanup_queue_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      media_uploads: {
        Row: {
          byte_size: number | null
          checksum: string | null
          claimed_legacy_id: string | null
          created_at: string
          created_by_user_id: string
          expires_at: string
          family_profile_id: string
          id: string
          mime_type: string | null
          object_prefix: string
          original_path: string | null
          person_id: string
          status: Database["public"]["Enums"]["media_upload_status"]
          thumbnail_byte_size: number | null
          thumbnail_path: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          byte_size?: number | null
          checksum?: string | null
          claimed_legacy_id?: string | null
          created_at?: string
          created_by_user_id: string
          expires_at?: string
          family_profile_id: string
          id?: string
          mime_type?: string | null
          object_prefix: string
          original_path?: string | null
          person_id: string
          status?: Database["public"]["Enums"]["media_upload_status"]
          thumbnail_byte_size?: number | null
          thumbnail_path?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          byte_size?: number | null
          checksum?: string | null
          claimed_legacy_id?: string | null
          created_at?: string
          created_by_user_id?: string
          expires_at?: string
          family_profile_id?: string
          id?: string
          mime_type?: string | null
          object_prefix?: string
          original_path?: string | null
          person_id?: string
          status?: Database["public"]["Enums"]["media_upload_status"]
          thumbnail_byte_size?: number | null
          thumbnail_path?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_uploads_person_fk"
            columns: ["workspace_id", "family_profile_id", "person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["workspace_id", "family_profile_id", "id"]
          },
          {
            foreignKeyName: "media_uploads_profile_fk"
            columns: ["workspace_id", "family_profile_id"]
            isOneToOne: false
            referencedRelation: "family_profiles"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "media_uploads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          dry_run: boolean
          id: string
          manifest_checksum: string | null
          report: Json
          resume_cursor: number
          source_checksum: string | null
          source_revision: string | null
          source_type: string
          started_at: string | null
          started_by_user_id: string
          status: Database["public"]["Enums"]["migration_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          dry_run?: boolean
          id?: string
          manifest_checksum?: string | null
          report?: Json
          resume_cursor?: number
          source_checksum?: string | null
          source_revision?: string | null
          source_type?: string
          started_at?: string | null
          started_by_user_id: string
          status?: Database["public"]["Enums"]["migration_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          dry_run?: boolean
          id?: string
          manifest_checksum?: string | null
          report?: Json
          resume_cursor?: number
          source_checksum?: string | null
          source_revision?: string | null
          source_type?: string
          started_at?: string | null
          started_by_user_id?: string
          status?: Database["public"]["Enums"]["migration_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "migration_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      persons: {
        Row: {
          address: string
          ancestral_role: Database["public"]["Enums"]["ancestral_role"]
          birth_date: string | null
          birth_date_confidence:
            | Database["public"]["Enums"]["fact_confidence"]
            | null
          created_at: string
          death_date: string | null
          death_date_confidence:
            | Database["public"]["Enums"]["fact_confidence"]
            | null
          death_lunar_day: number | null
          death_lunar_leap_month: boolean | null
          death_lunar_month: number | null
          family_profile_id: string
          gender: Database["public"]["Enums"]["gender_type"]
          id: string
          is_deceased: boolean
          legacy_id: string
          name: string
          nickname: string | null
          note: string
          phone1: string
          phone2: string
          sort_order: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address?: string
          ancestral_role?: Database["public"]["Enums"]["ancestral_role"]
          birth_date?: string | null
          birth_date_confidence?:
            | Database["public"]["Enums"]["fact_confidence"]
            | null
          created_at?: string
          death_date?: string | null
          death_date_confidence?:
            | Database["public"]["Enums"]["fact_confidence"]
            | null
          death_lunar_day?: number | null
          death_lunar_leap_month?: boolean | null
          death_lunar_month?: number | null
          family_profile_id: string
          gender?: Database["public"]["Enums"]["gender_type"]
          id?: string
          is_deceased?: boolean
          legacy_id: string
          name: string
          nickname?: string | null
          note?: string
          phone1?: string
          phone2?: string
          sort_order?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          address?: string
          ancestral_role?: Database["public"]["Enums"]["ancestral_role"]
          birth_date?: string | null
          birth_date_confidence?:
            | Database["public"]["Enums"]["fact_confidence"]
            | null
          created_at?: string
          death_date?: string | null
          death_date_confidence?:
            | Database["public"]["Enums"]["fact_confidence"]
            | null
          death_lunar_day?: number | null
          death_lunar_leap_month?: boolean | null
          death_lunar_month?: number | null
          family_profile_id?: string
          gender?: Database["public"]["Enums"]["gender_type"]
          id?: string
          is_deceased?: boolean
          legacy_id?: string
          name?: string
          nickname?: string | null
          note?: string
          phone1?: string
          phone2?: string
          sort_order?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "persons_profile_fk"
            columns: ["workspace_id", "family_profile_id"]
            isOneToOne: false
            referencedRelation: "family_profiles"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      relationships: {
        Row: {
          confidence: Database["public"]["Enums"]["fact_confidence"] | null
          created_at: string
          end_date: string | null
          family_profile_id: string
          id: string
          legacy_id: string
          person1_id: string
          person2_id: string
          sort_order: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["spouse_status"] | null
          type: Database["public"]["Enums"]["relationship_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          confidence?: Database["public"]["Enums"]["fact_confidence"] | null
          created_at?: string
          end_date?: string | null
          family_profile_id: string
          id?: string
          legacy_id: string
          person1_id: string
          person2_id: string
          sort_order?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["spouse_status"] | null
          type: Database["public"]["Enums"]["relationship_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          confidence?: Database["public"]["Enums"]["fact_confidence"] | null
          created_at?: string
          end_date?: string | null
          family_profile_id?: string
          id?: string
          legacy_id?: string
          person1_id?: string
          person2_id?: string
          sort_order?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["spouse_status"] | null
          type?: Database["public"]["Enums"]["relationship_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationships_person1_fk"
            columns: ["workspace_id", "family_profile_id", "person1_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["workspace_id", "family_profile_id", "id"]
          },
          {
            foreignKeyName: "relationships_person2_fk"
            columns: ["workspace_id", "family_profile_id", "person2_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["workspace_id", "family_profile_id", "id"]
          },
          {
            foreignKeyName: "relationships_profile_fk"
            columns: ["workspace_id", "family_profile_id"]
            isOneToOne: false
            referencedRelation: "family_profiles"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          created_at: string
          email: string
          expires_at: string | null
          id: string
          invited_by_user_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          token_hash: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string | null
          id?: string
          invited_by_user_id: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string | null
          id?: string
          invited_by_user_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          invited_by_user_id: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by_user_id?: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by_user_id?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_snapshots: {
        Row: {
          created_at: string
          created_by_user_id: string
          data_version: number
          family_data: Json
          id: string
          reason: string
          schema_version: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          data_version: number
          family_data: Json
          id?: string
          reason: string
          schema_version: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          data_version?: number
          family_data?: Json
          id?: string
          reason?: string
          schema_version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      encrypted_private_key_bundles: {
        Row: {
          auth_user_id: string
          bundle: Json
          created_at: string
          principal_id: string
          recovery_epoch: number
          signing_fingerprint: string
          state: "pending_drive" | "active"
          unwrap_fingerprint: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string
          bundle: Json
          created_at?: string
          principal_id: string
          recovery_epoch: number
          signing_fingerprint: string
          state?: "pending_drive" | "active"
          unwrap_fingerprint: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          bundle?: Json
          created_at?: string
          principal_id?: string
          recovery_epoch?: number
          signing_fingerprint?: string
          state?: "pending_drive" | "active"
          unwrap_fingerprint?: string
          updated_at?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          canonical_ready: boolean
          created_at: string
          data_version: number
          duplicate_suppressions: Json
          id: string
          legacy_drive_folder_id: string | null
          locale: string
          name: string
          owner_user_id: string
          schema_version: number
          timezone: string
          updated_at: string
        }
        Insert: {
          canonical_ready?: boolean
          created_at?: string
          data_version?: number
          duplicate_suppressions?: Json
          id?: string
          legacy_drive_folder_id?: string | null
          locale?: string
          name: string
          owner_user_id: string
          schema_version?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          canonical_ready?: boolean
          created_at?: string
          data_version?: number
          duplicate_suppressions?: Json
          id?: string
          legacy_drive_folder_id?: string | null
          locale?: string
          name?: string
          owner_user_id?: string
          schema_version?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_private_key_bundle: {
        Args: { expected_principal_id: string }
        Returns: undefined
      }
      _family_apply_operations: {
        Args: { data: Json; operations: Json }
        Returns: Json
      }
      _family_filter_person_references: {
        Args: { data: Json; person_legacy_id: string }
        Returns: Json
      }
      _family_find_entity: {
        Args: { array_name: string; data: Json; legacy_id: string }
        Returns: Json
      }
      _family_remove_entity: {
        Args: { array_name: string; data: Json; legacy_id: string }
        Returns: Json
      }
      _family_snapshot_json: {
        Args: { target_workspace_id: string }
        Returns: Json
      }
      _replace_family_data: {
        Args: { family_data: Json; target_workspace_id: string }
        Returns: undefined
      }
      _resolve_family_media_uploads: {
        Args: { family_data: Json; target_workspace_id: string }
        Returns: Json
      }
      accept_workspace_invitation: {
        Args: { p_token_hash: string }
        Returns: string
      }
      can_commit_workspace: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      can_edit_own_draft: {
        Args: { target_draft_id: string }
        Returns: boolean
      }
      can_manage_workspace: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      can_read_draft: { Args: { target_draft_id: string }; Returns: boolean }
      can_read_media_object: { Args: { object_name: string }; Returns: boolean }
      can_read_workspace: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      can_read_workspace_profile: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      can_review_workspace: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      can_write_media_object: {
        Args: { object_name: string }
        Returns: boolean
      }
      cleanup_terminal_family_drafts: {
        Args: { p_workspace_id: string }
        Returns: number
      }
      commit_family_operations: {
        Args: {
          p_base_data_version: number
          p_client_created_at: string
          p_commit_id: string
          p_operations: Json
          p_workspace_id: string
        }
        Returns: Json
      }
      create_family_snapshot: {
        Args: { p_reason: string; p_workspace_id: string }
        Returns: Json
      }
      create_family_workspace: { Args: { p_name: string }; Returns: string }
      create_workspace_invitation: {
        Args: {
          p_email: string
          p_expires_at: string
          p_role: Database["public"]["Enums"]["workspace_role"]
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: Json
      }
      discard_media_upload: { Args: { p_upload_id: string }; Returns: Json }
      discard_reviewed_media_upload: {
        Args: { p_upload_id: string; p_workspace_id: string }
        Returns: Json
      }
      drive_migration_snapshot: { Args: { p_run_id: string }; Returns: Json }
      fail_drive_bundle_migration: {
        Args: { p_report: Json; p_resume_cursor: number; p_run_id: string }
        Returns: undefined
      }
      finalize_family_draft_review: {
        Args: {
          p_decision: string
          p_draft_id: string
          p_expected_revision: number
          p_note: string
          p_operation_ids: string[]
          p_result_data_version: number
          p_workspace_id: string
        }
        Returns: Json
      }
      get_family_commit_status: {
        Args: { p_commit_id: string; p_workspace_id: string }
        Returns: Json
      }
      is_workspace_member: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      is_workspace_owner: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      load_drive_bundle_migration: {
        Args: {
          p_family_data: Json
          p_media_metadata: Json
          p_report: Json
          p_run_id: string
        }
        Returns: Json
      }
      mark_family_draft_needs_changes: {
        Args: {
          p_draft_id: string
          p_expected_revision: number
          p_note: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      media_object_upload_id: { Args: { object_name: string }; Returns: string }
      media_object_workspace_id: {
        Args: { object_name: string }
        Returns: string
      }
      prepare_media_upload: {
        Args: {
          p_person_legacy_id: string
          p_profile_legacy_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      publish_drive_bundle_migration: {
        Args: { p_report: Json; p_run_id: string }
        Returns: Json
      }
      replace_family_dataset: {
        Args: {
          p_expected_data_version: number
          p_family_data: Json
          p_mode: string
          p_workspace_id: string
        }
        Returns: Json
      }
      revoke_workspace_invitation: {
        Args: { p_invitation_id: string; p_workspace_id: string }
        Returns: undefined
      }
      rollback_incomplete_drive_migration: {
        Args: { p_run_id: string }
        Returns: Json
      }
      start_drive_bundle_migration: {
        Args: {
          p_legacy_drive_folder_id: string
          p_manifest_checksum: string
          p_name: string
          p_owner_user_id: string
          p_run_id: string
          p_source_checksum: string
          p_source_revision: string
          p_workspace_id: string
        }
        Returns: Json
      }
      submit_family_draft: {
        Args: {
          p_base_data_version: number
          p_checksum: string
          p_client_created_at: string
          p_operations: Json
          p_workspace_id: string
        }
        Returns: Json
      }
      verify_media_upload: {
        Args: {
          p_byte_size: number
          p_checksum: string
          p_mime_type: string
          p_original_path: string
          p_thumbnail_byte_size: number
          p_thumbnail_path: string
          p_upload_id: string
        }
        Returns: Json
      }
      workspace_role: {
        Args: { target_workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      ancestral_role: "none" | "founding_ancestor"
      commit_status: "pending" | "applied" | "conflict" | "failed"
      draft_operation_status: "pending" | "approved" | "rejected" | "conflict"
      draft_status:
        | "draft"
        | "pending"
        | "partially_reviewed"
        | "needs_changes"
        | "approved"
        | "rejected"
        | "invalid"
      fact_confidence: "confirmed" | "likely" | "estimated" | "unknown"
      gender_type: "male" | "female" | "other" | "unknown"
      invitation_status: "pending" | "accepted" | "revoked" | "expired"
      media_cleanup_status: "pending" | "completed" | "failed"
      media_upload_status:
        | "staging"
        | "verified"
        | "attached"
        | "discarded"
        | "expired"
      migration_status:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
      relationship_type: "spouse" | "parent"
      spouse_status:
        | "married"
        | "partner"
        | "separated"
        | "divorced"
        | "widowed"
        | "unknown"
      workspace_role: "owner" | "editor" | "contributor" | "viewer"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ancestral_role: ["none", "founding_ancestor"],
      commit_status: ["pending", "applied", "conflict", "failed"],
      draft_operation_status: ["pending", "approved", "rejected", "conflict"],
      draft_status: [
        "draft",
        "pending",
        "partially_reviewed",
        "needs_changes",
        "approved",
        "rejected",
        "invalid",
      ],
      fact_confidence: ["confirmed", "likely", "estimated", "unknown"],
      gender_type: ["male", "female", "other", "unknown"],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      media_cleanup_status: ["pending", "completed", "failed"],
      media_upload_status: [
        "staging",
        "verified",
        "attached",
        "discarded",
        "expired",
      ],
      migration_status: [
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
      ],
      relationship_type: ["spouse", "parent"],
      spouse_status: [
        "married",
        "partner",
        "separated",
        "divorced",
        "widowed",
        "unknown",
      ],
      workspace_role: ["owner", "editor", "contributor", "viewer"],
    },
  },
} as const
