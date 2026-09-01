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
      authorization_nonce_ledger: {
        Row: {
          authorization_id: string
          consumed_at: string
          consumed_by_commit_id: string
          consumed_by_principal_id: string
          nonce_hash: string
          workspace_id: string
        }
        Insert: {
          authorization_id: string
          consumed_at?: string
          consumed_by_commit_id: string
          consumed_by_principal_id: string
          nonce_hash: string
          workspace_id: string
        }
        Update: {
          authorization_id?: string
          consumed_at?: string
          consumed_by_commit_id?: string
          consumed_by_principal_id?: string
          nonce_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "authorization_nonce_ledger_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "signed_policy_authorizations"
            referencedColumns: ["authorization_id"]
          },
          {
            foreignKeyName: "authorization_nonce_ledger_consumed_by_principal_id_fkey"
            columns: ["consumed_by_principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "authorization_nonce_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      collaboration_cutovers: {
        Row: {
          activated_at: string | null
          activated_membership_epoch: number | null
          inventory_completed_at: string | null
          state: Database["public"]["Enums"]["collaboration_cutover_state"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          activated_at?: string | null
          activated_membership_epoch?: number | null
          inventory_completed_at?: string | null
          state?: Database["public"]["Enums"]["collaboration_cutover_state"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          activated_at?: string | null
          activated_membership_epoch?: number | null
          inventory_completed_at?: string | null
          state?: Database["public"]["Enums"]["collaboration_cutover_state"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaboration_cutovers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
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
      contact_field_states: {
        Row: {
          active_policy_id: string
          field_class: Database["public"]["Enums"]["private_field_class"]
          key_epoch: number
          key_id: string
          lifecycle: Database["public"]["Enums"]["contact_field_lifecycle"]
          person_id: string
          rotation_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active_policy_id: string
          field_class: Database["public"]["Enums"]["private_field_class"]
          key_epoch: number
          key_id: string
          lifecycle: Database["public"]["Enums"]["contact_field_lifecycle"]
          person_id: string
          rotation_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active_policy_id?: string
          field_class?: Database["public"]["Enums"]["private_field_class"]
          key_epoch?: number
          key_id?: string
          lifecycle?: Database["public"]["Enums"]["contact_field_lifecycle"]
          person_id?: string
          rotation_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_field_states_active_policy_id_fkey"
            columns: ["active_policy_id"]
            isOneToOne: false
            referencedRelation: "contact_policy_artifacts"
            referencedColumns: ["policy_id"]
          },
          {
            foreignKeyName: "contact_field_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      contact_key_rotations: {
        Row: {
          audience_manifest_hmac: string
          completed_at: string | null
          created_at: string
          field_class: Database["public"]["Enums"]["private_field_class"]
          from_key_epoch: number
          from_key_id: string | null
          person_id: string
          policy_id: string
          request_hash: string
          result: Json | null
          rotation_id: string
          state: Database["public"]["Enums"]["contact_rotation_state"]
          to_key_epoch: number
          to_key_id: string
          workspace_id: string
        }
        Insert: {
          audience_manifest_hmac: string
          completed_at?: string | null
          created_at?: string
          field_class: Database["public"]["Enums"]["private_field_class"]
          from_key_epoch: number
          from_key_id?: string | null
          person_id: string
          policy_id: string
          request_hash: string
          result?: Json | null
          rotation_id: string
          state?: Database["public"]["Enums"]["contact_rotation_state"]
          to_key_epoch: number
          to_key_id: string
          workspace_id: string
        }
        Update: {
          audience_manifest_hmac?: string
          completed_at?: string | null
          created_at?: string
          field_class?: Database["public"]["Enums"]["private_field_class"]
          from_key_epoch?: number
          from_key_id?: string | null
          person_id?: string
          policy_id?: string
          request_hash?: string
          result?: Json | null
          rotation_id?: string
          state?: Database["public"]["Enums"]["contact_rotation_state"]
          to_key_epoch?: number
          to_key_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_key_rotations_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "contact_policy_artifacts"
            referencedColumns: ["policy_id"]
          },
          {
            foreignKeyName: "contact_key_rotations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      contact_policy_artifacts: {
        Row: {
          active: boolean
          allow_principal_ids: Json
          artifact: Json
          audience: Database["public"]["Enums"]["contact_audience"]
          binding_revision: number
          created_at: string
          deny_principal_ids: Json
          expires_at: string
          field_class: Database["public"]["Enums"]["private_field_class"]
          graph_revision: number
          key_epoch: number
          nonce_hash: string
          person_id: string
          policy_id: string
          policy_principal_id: string
          policy_revision: number
          profile_id: string
          recipient_principal_ids: Json
          revoked_at: string | null
          signer_fingerprint: string
          subject_binding_id: string | null
          verified_at: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          allow_principal_ids?: Json
          artifact: Json
          audience: Database["public"]["Enums"]["contact_audience"]
          binding_revision: number
          created_at?: string
          deny_principal_ids?: Json
          expires_at: string
          field_class: Database["public"]["Enums"]["private_field_class"]
          graph_revision: number
          key_epoch: number
          nonce_hash: string
          person_id: string
          policy_id: string
          policy_principal_id: string
          policy_revision: number
          profile_id: string
          recipient_principal_ids: Json
          revoked_at?: string | null
          signer_fingerprint: string
          subject_binding_id?: string | null
          verified_at: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          allow_principal_ids?: Json
          artifact?: Json
          audience?: Database["public"]["Enums"]["contact_audience"]
          binding_revision?: number
          created_at?: string
          deny_principal_ids?: Json
          expires_at?: string
          field_class?: Database["public"]["Enums"]["private_field_class"]
          graph_revision?: number
          key_epoch?: number
          nonce_hash?: string
          person_id?: string
          policy_id?: string
          policy_principal_id?: string
          policy_revision?: number
          profile_id?: string
          recipient_principal_ids?: Json
          revoked_at?: string | null
          signer_fingerprint?: string
          subject_binding_id?: string | null
          verified_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_policy_artifacts_policy_principal_id_fkey"
            columns: ["policy_principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "contact_policy_artifacts_subject_binding_id_fkey"
            columns: ["subject_binding_id"]
            isOneToOne: false
            referencedRelation: "member_person_bindings"
            referencedColumns: ["binding_id"]
          },
          {
            foreignKeyName: "contact_policy_artifacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "contact_policy_principal_directory_fk"
            columns: ["workspace_id", "policy_principal_id"]
            isOneToOne: false
            referencedRelation: "workspace_principal_directory"
            referencedColumns: ["workspace_id", "principal_id"]
          },
        ]
      }
      contact_recipient_grants: {
        Row: {
          binding_id: string
          binding_version: number
          envelope_id: string
          field_class: Database["public"]["Enums"]["private_field_class"]
          granted_at: string
          key_epoch: number
          person_id: string
          policy_id: string
          recipient_principal_id: string
          revoked_at: string | null
          workspace_id: string
        }
        Insert: {
          binding_id: string
          binding_version: number
          envelope_id: string
          field_class: Database["public"]["Enums"]["private_field_class"]
          granted_at?: string
          key_epoch: number
          person_id: string
          policy_id: string
          recipient_principal_id: string
          revoked_at?: string | null
          workspace_id: string
        }
        Update: {
          binding_id?: string
          binding_version?: number
          envelope_id?: string
          field_class?: Database["public"]["Enums"]["private_field_class"]
          granted_at?: string
          key_epoch?: number
          person_id?: string
          policy_id?: string
          recipient_principal_id?: string
          revoked_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_grant_envelope_fk"
            columns: ["workspace_id", "envelope_id"]
            isOneToOne: false
            referencedRelation: "encrypted_key_envelopes"
            referencedColumns: ["workspace_id", "envelope_id"]
          },
          {
            foreignKeyName: "contact_grant_field_fk"
            columns: ["workspace_id", "person_id", "field_class"]
            isOneToOne: false
            referencedRelation: "contact_field_states"
            referencedColumns: ["workspace_id", "person_id", "field_class"]
          },
          {
            foreignKeyName: "contact_recipient_grants_binding_id_fkey"
            columns: ["binding_id"]
            isOneToOne: false
            referencedRelation: "member_person_bindings"
            referencedColumns: ["binding_id"]
          },
          {
            foreignKeyName: "contact_recipient_grants_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "contact_policy_artifacts"
            referencedColumns: ["policy_id"]
          },
          {
            foreignKeyName: "contact_recipient_grants_recipient_principal_id_fkey"
            columns: ["recipient_principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
          },
        ]
      }
      crypto_invitations: {
        Row: {
          artifact_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          invitation_id: string
          invited_email_hash: string
          state: Database["public"]["Enums"]["crypto_invitation_state"]
          token_hash: string
          workspace_id: string
        }
        Insert: {
          artifact_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          invitation_id?: string
          invited_email_hash: string
          state?: Database["public"]["Enums"]["crypto_invitation_state"]
          token_hash: string
          workspace_id: string
        }
        Update: {
          artifact_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          invitation_id?: string
          invited_email_hash?: string
          state?: Database["public"]["Enums"]["crypto_invitation_state"]
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crypto_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      crypto_principals: {
        Row: {
          auth_user_id: string
          created_at: string
          principal_id: string
          recovery_epoch: number
          signing_fingerprint: string
          signing_public_key: Json
          unwrap_fingerprint: string
          unwrap_public_key: Json
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          principal_id: string
          recovery_epoch: number
          signing_fingerprint: string
          signing_public_key: Json
          unwrap_fingerprint: string
          unwrap_public_key: Json
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          principal_id?: string
          recovery_epoch?: number
          signing_fingerprint?: string
          signing_public_key?: Json
          unwrap_fingerprint?: string
          unwrap_public_key?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crypto_principals_active_bundle_fk"
            columns: ["auth_user_id", "principal_id"]
            isOneToOne: false
            referencedRelation: "encrypted_private_key_bundles"
            referencedColumns: ["auth_user_id", "principal_id"]
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
      editor_commit_delegations: {
        Row: {
          artifact: Json
          created_at: string
          delegation_id: string
          expires_at: string
          membership_epoch: number
          principal_id: string
          revoked_at: string | null
          scopes: string[]
          signer_fingerprint: string
          verified_at: string
          workspace_id: string
        }
        Insert: {
          artifact: Json
          created_at?: string
          delegation_id: string
          expires_at: string
          membership_epoch: number
          principal_id: string
          revoked_at?: string | null
          scopes: string[]
          signer_fingerprint: string
          verified_at: string
          workspace_id: string
        }
        Update: {
          artifact?: Json
          created_at?: string
          delegation_id?: string
          expires_at?: string
          membership_epoch?: number
          principal_id?: string
          revoked_at?: string | null
          scopes?: string[]
          signer_fingerprint?: string
          verified_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "editor_commit_delegations_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "editor_commit_delegations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      encrypted_commits: {
        Row: {
          actor_principal_id: string
          base_data_version: number
          checkpoint_revision: number | null
          commit_id: string
          created_at: string
          membership_epoch: number | null
          operation_count: number
          request_checksum: string
          request_payload: Json
          result_data_version: number
          workspace_id: string
        }
        Insert: {
          actor_principal_id: string
          base_data_version: number
          checkpoint_revision?: number | null
          commit_id: string
          created_at?: string
          membership_epoch?: number | null
          operation_count: number
          request_checksum: string
          request_payload: Json
          result_data_version: number
          workspace_id: string
        }
        Update: {
          actor_principal_id?: string
          base_data_version?: number
          checkpoint_revision?: number | null
          commit_id?: string
          created_at?: string
          membership_epoch?: number | null
          operation_count?: number
          request_checksum?: string
          request_payload?: Json
          result_data_version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "encrypted_commits_actor_principal_id_fkey"
            columns: ["actor_principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "encrypted_commits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      encrypted_entities: {
        Row: {
          created_at: string
          entity_id: string
          envelope: Json
          field_class: Database["public"]["Enums"]["encrypted_entity_class"]
          key_epoch: number
          key_id: string
          row_version: number
          updated_at: string
          workspace_id: string
          writer_id: string | null
          writer_principal_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          envelope: Json
          field_class: Database["public"]["Enums"]["encrypted_entity_class"]
          key_epoch: number
          key_id: string
          row_version: number
          updated_at?: string
          workspace_id: string
          writer_id?: string | null
          writer_principal_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          envelope?: Json
          field_class?: Database["public"]["Enums"]["encrypted_entity_class"]
          key_epoch?: number
          key_id?: string
          row_version?: number
          updated_at?: string
          workspace_id?: string
          writer_id?: string | null
          writer_principal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "encrypted_entities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "encrypted_entities_writer_principal_id_fkey"
            columns: ["writer_principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
          },
        ]
      }
      encrypted_key_envelopes: {
        Row: {
          created_at: string
          directory_revision: number
          entity_id: string
          envelope_id: string
          expires_at: string | null
          issuer_principal_id: string
          issuer_signing_fingerprint: string
          key_epoch: number
          key_id: string
          key_purpose: Database["public"]["Enums"]["encrypted_key_purpose"]
          recipient_principal_id: string
          recipient_unwrap_fingerprint: string
          revoked_at: string | null
          workspace_id: string
          wrapped_envelope: Json
        }
        Insert: {
          created_at?: string
          directory_revision: number
          entity_id: string
          envelope_id: string
          expires_at?: string | null
          issuer_principal_id: string
          issuer_signing_fingerprint: string
          key_epoch: number
          key_id: string
          key_purpose: Database["public"]["Enums"]["encrypted_key_purpose"]
          recipient_principal_id: string
          recipient_unwrap_fingerprint: string
          revoked_at?: string | null
          workspace_id: string
          wrapped_envelope: Json
        }
        Update: {
          created_at?: string
          directory_revision?: number
          entity_id?: string
          envelope_id?: string
          expires_at?: string | null
          issuer_principal_id?: string
          issuer_signing_fingerprint?: string
          key_epoch?: number
          key_id?: string
          key_purpose?: Database["public"]["Enums"]["encrypted_key_purpose"]
          recipient_principal_id?: string
          recipient_unwrap_fingerprint?: string
          revoked_at?: string | null
          workspace_id?: string
          wrapped_envelope?: Json
        }
        Relationships: [
          {
            foreignKeyName: "encrypted_key_envelope_issuer_directory_fk"
            columns: ["workspace_id", "issuer_principal_id"]
            isOneToOne: false
            referencedRelation: "workspace_principal_directory"
            referencedColumns: ["workspace_id", "principal_id"]
          },
          {
            foreignKeyName: "encrypted_key_envelope_recipient_directory_fk"
            columns: ["workspace_id", "recipient_principal_id"]
            isOneToOne: false
            referencedRelation: "workspace_principal_directory"
            referencedColumns: ["workspace_id", "principal_id"]
          },
          {
            foreignKeyName: "encrypted_key_envelopes_issuer_principal_id_fkey"
            columns: ["issuer_principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "encrypted_key_envelopes_recipient_principal_id_fkey"
            columns: ["recipient_principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "encrypted_key_envelopes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      encrypted_private_fields: {
        Row: {
          created_at: string
          envelope: Json
          field_class: Database["public"]["Enums"]["private_field_class"]
          key_epoch: number
          key_id: string
          person_id: string
          row_version: number
          updated_at: string
          workspace_id: string
          writer_id: string | null
          writer_principal_id: string
        }
        Insert: {
          created_at?: string
          envelope: Json
          field_class: Database["public"]["Enums"]["private_field_class"]
          key_epoch: number
          key_id: string
          person_id: string
          row_version: number
          updated_at?: string
          workspace_id: string
          writer_id?: string | null
          writer_principal_id: string
        }
        Update: {
          created_at?: string
          envelope?: Json
          field_class?: Database["public"]["Enums"]["private_field_class"]
          key_epoch?: number
          key_id?: string
          person_id?: string
          row_version?: number
          updated_at?: string
          workspace_id?: string
          writer_id?: string | null
          writer_principal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "encrypted_private_fields_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "encrypted_private_fields_writer_principal_id_fkey"
            columns: ["writer_principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
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
          state: string
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
          state?: string
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
          state?: string
          unwrap_fingerprint?: string
          updated_at?: string
        }
        Relationships: []
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
      legacy_collaboration_inventory: {
        Row: {
          artifact_id: string
          artifact_kind: string
          disposition: Database["public"]["Enums"]["legacy_collaboration_disposition"]
          legacy_role: string | null
          recorded_at: string
          workspace_id: string
        }
        Insert: {
          artifact_id: string
          artifact_kind: string
          disposition: Database["public"]["Enums"]["legacy_collaboration_disposition"]
          legacy_role?: string | null
          recorded_at?: string
          workspace_id: string
        }
        Update: {
          artifact_id?: string
          artifact_kind?: string
          disposition?: Database["public"]["Enums"]["legacy_collaboration_disposition"]
          legacy_role?: string | null
          recorded_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "legacy_collaboration_inventory_workspace_id_fkey"
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
      member_binding_events: {
        Row: {
          action: Database["public"]["Enums"]["member_person_binding_action"]
          actor_principal_id: string
          binding_id: string
          binding_revision: number
          created_at: string
          event_id: number
          from_state:
            | Database["public"]["Enums"]["member_person_binding_state"]
            | null
          reason_code: string
          request_hash: string
          result: Json
          to_state: Database["public"]["Enums"]["member_person_binding_state"]
          transition_id: string
          workspace_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["member_person_binding_action"]
          actor_principal_id: string
          binding_id: string
          binding_revision: number
          created_at?: string
          event_id?: never
          from_state?:
            | Database["public"]["Enums"]["member_person_binding_state"]
            | null
          reason_code: string
          request_hash: string
          result: Json
          to_state: Database["public"]["Enums"]["member_person_binding_state"]
          transition_id: string
          workspace_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["member_person_binding_action"]
          actor_principal_id?: string
          binding_id?: string
          binding_revision?: number
          created_at?: string
          event_id?: never
          from_state?:
            | Database["public"]["Enums"]["member_person_binding_state"]
            | null
          reason_code?: string
          request_hash?: string
          result?: Json
          to_state?: Database["public"]["Enums"]["member_person_binding_state"]
          transition_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_binding_event_actor_directory_fk"
            columns: ["workspace_id", "actor_principal_id"]
            isOneToOne: false
            referencedRelation: "workspace_principal_directory"
            referencedColumns: ["workspace_id", "principal_id"]
          },
          {
            foreignKeyName: "member_binding_events_actor_principal_id_fkey"
            columns: ["actor_principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "member_binding_events_binding_id_fkey"
            columns: ["binding_id"]
            isOneToOne: false
            referencedRelation: "member_person_bindings"
            referencedColumns: ["binding_id"]
          },
          {
            foreignKeyName: "member_binding_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      member_person_bindings: {
        Row: {
          binding_id: string
          binding_version: number | null
          confirmed_by_principal_id: string | null
          created_at: string
          decided_at: string | null
          person_id: string
          pinned_signing_fingerprint: string | null
          pinned_unwrap_fingerprint: string | null
          principal_id: string
          profile_id: string
          proposed_by_principal_id: string
          revoked_at: string | null
          state: Database["public"]["Enums"]["member_person_binding_state"]
          workspace_id: string
        }
        Insert: {
          binding_id?: string
          binding_version?: number | null
          confirmed_by_principal_id?: string | null
          created_at?: string
          decided_at?: string | null
          person_id: string
          pinned_signing_fingerprint?: string | null
          pinned_unwrap_fingerprint?: string | null
          principal_id: string
          profile_id: string
          proposed_by_principal_id: string
          revoked_at?: string | null
          state?: Database["public"]["Enums"]["member_person_binding_state"]
          workspace_id: string
        }
        Update: {
          binding_id?: string
          binding_version?: number | null
          confirmed_by_principal_id?: string | null
          created_at?: string
          decided_at?: string | null
          person_id?: string
          pinned_signing_fingerprint?: string | null
          pinned_unwrap_fingerprint?: string | null
          principal_id?: string
          profile_id?: string
          proposed_by_principal_id?: string
          revoked_at?: string | null
          state?: Database["public"]["Enums"]["member_person_binding_state"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_binding_confirmer_directory_fk"
            columns: ["workspace_id", "confirmed_by_principal_id"]
            isOneToOne: false
            referencedRelation: "workspace_principal_directory"
            referencedColumns: ["workspace_id", "principal_id"]
          },
          {
            foreignKeyName: "member_binding_principal_directory_fk"
            columns: ["workspace_id", "principal_id"]
            isOneToOne: false
            referencedRelation: "workspace_principal_directory"
            referencedColumns: ["workspace_id", "principal_id"]
          },
          {
            foreignKeyName: "member_binding_proposer_directory_fk"
            columns: ["workspace_id", "proposed_by_principal_id"]
            isOneToOne: false
            referencedRelation: "workspace_principal_directory"
            referencedColumns: ["workspace_id", "principal_id"]
          },
          {
            foreignKeyName: "member_person_bindings_confirmed_by_principal_id_fkey"
            columns: ["confirmed_by_principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "member_person_bindings_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "member_person_bindings_proposed_by_principal_id_fkey"
            columns: ["proposed_by_principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "member_person_bindings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
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
      opaque_backup_audit: {
        Row: {
          actor_user_id: string
          capability_id: string | null
          created_at: string
          entity_count: number
          envelope_count: number
          id: number
          private_field_count: number
          status: string
          workspace_id: string
        }
        Insert: {
          actor_user_id: string
          capability_id?: string | null
          created_at?: string
          entity_count?: number
          envelope_count?: number
          id?: never
          private_field_count?: number
          status: string
          workspace_id: string
        }
        Update: {
          actor_user_id?: string
          capability_id?: string | null
          created_at?: string
          entity_count?: number
          envelope_count?: number
          id?: never
          private_field_count?: number
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opaque_backup_audit_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "opaque_backup_capabilities"
            referencedColumns: ["capability_id"]
          },
          {
            foreignKeyName: "opaque_backup_audit_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      opaque_backup_capabilities: {
        Row: {
          capability_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          owner_user_id: string
          reauthenticated_at: string
          state: Database["public"]["Enums"]["backup_capability_state"]
          token_hash: string
          workspace_id: string
        }
        Insert: {
          capability_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          owner_user_id: string
          reauthenticated_at: string
          state?: Database["public"]["Enums"]["backup_capability_state"]
          token_hash: string
          workspace_id: string
        }
        Update: {
          capability_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          owner_user_id?: string
          reauthenticated_at?: string
          state?: Database["public"]["Enums"]["backup_capability_state"]
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opaque_backup_capabilities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
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
      portability_export_scopes: {
        Row: {
          authorization_id: string
          consumed_at: string | null
          created_at: string
          fields: Json
          format: string
          living_policy: string
          person_ids: Json
          profile_id: string
          workspace_id: string
        }
        Insert: {
          authorization_id: string
          consumed_at?: string | null
          created_at?: string
          fields: Json
          format: string
          living_policy: string
          person_ids: Json
          profile_id: string
          workspace_id: string
        }
        Update: {
          authorization_id?: string
          consumed_at?: string | null
          created_at?: string
          fields?: Json
          format?: string
          living_policy?: string
          person_ids?: Json
          profile_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portability_export_scopes_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: true
            referencedRelation: "signed_policy_authorizations"
            referencedColumns: ["authorization_id"]
          },
          {
            foreignKeyName: "portability_export_scopes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
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
      signed_policy_authorizations: {
        Row: {
          actor_principal_id: string
          artifact: Json
          authorization_id: string
          binding_revision: number
          created_at: string
          expires_at: string
          field_class: Database["public"]["Enums"]["private_field_class"] | null
          graph_revision: number
          key_epoch: number
          nonce_hash: string
          person_id: string | null
          policy_revision: number
          purpose: Database["public"]["Enums"]["policy_authorization_purpose"]
          revoked_at: string | null
          verified_at: string
          workspace_id: string
        }
        Insert: {
          actor_principal_id: string
          artifact: Json
          authorization_id: string
          binding_revision: number
          created_at?: string
          expires_at: string
          field_class?:
            | Database["public"]["Enums"]["private_field_class"]
            | null
          graph_revision: number
          key_epoch: number
          nonce_hash: string
          person_id?: string | null
          policy_revision: number
          purpose: Database["public"]["Enums"]["policy_authorization_purpose"]
          revoked_at?: string | null
          verified_at: string
          workspace_id: string
        }
        Update: {
          actor_principal_id?: string
          artifact?: Json
          authorization_id?: string
          binding_revision?: number
          created_at?: string
          expires_at?: string
          field_class?:
            | Database["public"]["Enums"]["private_field_class"]
            | null
          graph_revision?: number
          key_epoch?: number
          nonce_hash?: string
          person_id?: string | null
          policy_revision?: number
          purpose?: Database["public"]["Enums"]["policy_authorization_purpose"]
          revoked_at?: string | null
          verified_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signed_policy_authorizations_actor_principal_id_fkey"
            columns: ["actor_principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "signed_policy_authorizations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
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
      verified_checkpoint_intents: {
        Row: {
          actor_principal_id: string
          artifact: Json
          checkpoint_id: string
          consumed_at: string | null
          consumed_by_commit_id: string | null
          created_at: string
          delegation_id: string | null
          expires_at: string
          external_anchor_hash: string
          key_epoch: number
          membership_epoch: number
          next_checkpoint_hash: string
          previous_checkpoint_hash: string | null
          previous_checkpoint_revision: number
          request_checksum: string
          verified_at: string
          workspace_id: string
        }
        Insert: {
          actor_principal_id: string
          artifact: Json
          checkpoint_id: string
          consumed_at?: string | null
          consumed_by_commit_id?: string | null
          created_at?: string
          delegation_id?: string | null
          expires_at: string
          external_anchor_hash: string
          key_epoch: number
          membership_epoch: number
          next_checkpoint_hash: string
          previous_checkpoint_hash?: string | null
          previous_checkpoint_revision: number
          request_checksum: string
          verified_at: string
          workspace_id: string
        }
        Update: {
          actor_principal_id?: string
          artifact?: Json
          checkpoint_id?: string
          consumed_at?: string | null
          consumed_by_commit_id?: string | null
          created_at?: string
          delegation_id?: string | null
          expires_at?: string
          external_anchor_hash?: string
          key_epoch?: number
          membership_epoch?: number
          next_checkpoint_hash?: string
          previous_checkpoint_hash?: string | null
          previous_checkpoint_revision?: number
          request_checksum?: string
          verified_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_intent_delegation_fk"
            columns: ["workspace_id", "delegation_id"]
            isOneToOne: false
            referencedRelation: "editor_commit_delegations"
            referencedColumns: ["workspace_id", "delegation_id"]
          },
          {
            foreignKeyName: "verified_checkpoint_intents_actor_principal_id_fkey"
            columns: ["actor_principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "verified_checkpoint_intents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      workspace_crypto_states: {
        Row: {
          binding_revision: number
          checkpoint_hash: string | null
          checkpoint_revision: number
          crypto_version: number
          data_version: number
          directory_revision: number
          encrypted_schema_version: number
          graph_revision: number
          key_epoch: number
          membership_epoch: number
          migration_state: Database["public"]["Enums"]["crypto_migration_state"]
          policy_revision: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          binding_revision?: number
          checkpoint_hash?: string | null
          checkpoint_revision?: number
          crypto_version?: number
          data_version?: number
          directory_revision?: number
          encrypted_schema_version?: number
          graph_revision?: number
          key_epoch?: number
          membership_epoch?: number
          migration_state?: Database["public"]["Enums"]["crypto_migration_state"]
          policy_revision?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          binding_revision?: number
          checkpoint_hash?: string | null
          checkpoint_revision?: number
          crypto_version?: number
          data_version?: number
          directory_revision?: number
          encrypted_schema_version?: number
          graph_revision?: number
          key_epoch?: number
          membership_epoch?: number
          migration_state?: Database["public"]["Enums"]["crypto_migration_state"]
          policy_revision?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_crypto_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      workspace_join_requests: {
        Row: {
          created_at: string
          id: string
          requested_role: Database["public"]["Enums"]["workspace_role"]
          requester_user_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          requested_role?: Database["public"]["Enums"]["workspace_role"]
          requester_user_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          requested_role?: Database["public"]["Enums"]["workspace_role"]
          requester_user_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_join_requests_workspace_id_fkey"
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
      workspace_operation_checkpoints: {
        Row: {
          actor_principal_id: string
          artifact: Json
          checkpoint_hash: string
          checkpoint_id: string
          checkpoint_revision: number
          commit_id: string
          created_at: string
          external_anchor_hash: string
          key_epoch: number
          membership_epoch: number
          previous_checkpoint_hash: string | null
          workspace_id: string
        }
        Insert: {
          actor_principal_id: string
          artifact: Json
          checkpoint_hash: string
          checkpoint_id: string
          checkpoint_revision: number
          commit_id: string
          created_at?: string
          external_anchor_hash: string
          key_epoch: number
          membership_epoch: number
          previous_checkpoint_hash?: string | null
          workspace_id: string
        }
        Update: {
          actor_principal_id?: string
          artifact?: Json
          checkpoint_hash?: string
          checkpoint_id?: string
          checkpoint_revision?: number
          commit_id?: string
          created_at?: string
          external_anchor_hash?: string
          key_epoch?: number
          membership_epoch?: number
          previous_checkpoint_hash?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_checkpoint_commit_fk"
            columns: ["workspace_id", "commit_id"]
            isOneToOne: true
            referencedRelation: "encrypted_commits"
            referencedColumns: ["workspace_id", "commit_id"]
          },
          {
            foreignKeyName: "workspace_operation_checkpoints_actor_principal_id_fkey"
            columns: ["actor_principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "workspace_operation_checkpoints_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_crypto_states"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      workspace_principal_directory: {
        Row: {
          auth_user_id: string
          directory_revision: number
          enrolled_at: string
          principal_id: string
          revoked_at: string | null
          workspace_id: string
        }
        Insert: {
          auth_user_id: string
          directory_revision: number
          enrolled_at?: string
          principal_id: string
          revoked_at?: string | null
          workspace_id: string
        }
        Update: {
          auth_user_id?: string
          directory_revision?: number
          enrolled_at?: string
          principal_id?: string
          revoked_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_directory_member_fk"
            columns: ["workspace_id", "auth_user_id"]
            isOneToOne: true
            referencedRelation: "workspace_members"
            referencedColumns: ["workspace_id", "user_id"]
          },
          {
            foreignKeyName: "workspace_directory_principal_identity_fk"
            columns: ["auth_user_id", "principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["auth_user_id", "principal_id"]
          },
          {
            foreignKeyName: "workspace_principal_directory_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "crypto_principals"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "workspace_principal_directory_workspace_id_fkey"
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
      workspaces: {
        Row: {
          canonical_ready: boolean
          created_at: string
          data_version: number
          duplicate_suppressions: Json
          id: string
          join_code: string | null
          join_code_epoch: number
          join_code_rotated_at: string | null
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
          join_code?: string | null
          join_code_epoch?: number
          join_code_rotated_at?: string | null
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
          join_code?: string | null
          join_code_epoch?: number
          join_code_rotated_at?: string | null
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
      activate_private_key_bundle: {
        Args: { expected_principal_id: string }
        Returns: undefined
      }
      begin_contact_key_rotation: {
        Args: {
          p_audience_manifest_hmac: string
          p_expected_from_epoch: number
          p_field_class: Database["public"]["Enums"]["private_field_class"]
          p_person_id: string
          p_policy_id: string
          p_rotation_id: string
          p_to_key_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      binding_request_hash: { Args: { candidate: Json }; Returns: string }
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
      commit_contact_field_write: {
        Args: {
          p_authorization_id: string
          p_clear?: boolean
          p_commit_id: string
          p_envelope: Json
          p_expected_data_version: number
          p_expected_row_version: number
          p_field_class: Database["public"]["Enums"]["private_field_class"]
          p_key_epoch: number
          p_key_id: string
          p_person_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_encrypted_workspace: {
        Args: {
          p_commit_id: string
          p_expected_data_version: number
          p_expected_key_epoch: number
          p_operations: Json
          p_request_checksum: string
          p_workspace_id: string
        }
        Returns: Json
      }
      commit_encrypted_workspace_v2: {
        Args: {
          p_checkpoint_id: string
          p_commit_id: string
          p_dependencies: Json
          p_expected_data_version: number
          p_expected_key_epoch: number
          p_expected_membership_epoch: number
          p_operations: Json
          p_request_checksum: string
          p_workspace_id: string
        }
        Returns: Json
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
      complete_contact_key_rotation: {
        Args: {
          p_envelope: Json
          p_expected_data_version: number
          p_rotation_id: string
          p_workspace_id: string
          p_wrapped_envelopes: Json
        }
        Returns: Json
      }
      consume_portability_export_authorization: {
        Args: {
          p_authorization_id: string
          p_export_id: string
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
      current_crypto_principal: {
        Args: { target_workspace_id: string }
        Returns: string
      }
      decide_member_person_binding: {
        Args: {
          p_binding_id: string
          p_decision: string
          p_expected_binding_revision: number
          p_transition_id: string
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
      encrypted_envelope_matches: {
        Args: {
          candidate: Json
          expected_data_version: number
          expected_entity_id: string
          expected_field_class: string
          expected_key_epoch: number
          expected_key_id: string
          expected_purpose: string
          expected_workspace_id: string
          expected_writer_id: string
        }
        Returns: boolean
      }
      export_opaque_workspace_backup: {
        Args: { p_capability_token: string; p_workspace_id: string }
        Returns: Json
      }
      fail_drive_bundle_migration: {
        Args: { p_report: Json; p_resume_cursor: number; p_run_id: string }
        Returns: undefined
      }
      generate_workspace_join_code: { Args: never; Returns: string }
      get_family_commit_status: {
        Args: { p_commit_id: string; p_workspace_id: string }
        Returns: Json
      }
      initialize_workspace_crypto: {
        Args: { p_principal_id: string; p_workspace_id: string }
        Returns: undefined
      }
      is_workspace_member: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      is_workspace_owner: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      jsonb_opaque_id_array: { Args: { candidate: Json }; Returns: boolean }
      load_drive_bundle_migration: {
        Args: {
          p_family_data: Json
          p_media_metadata: Json
          p_report: Json
          p_run_id: string
        }
        Returns: Json
      }
      media_object_upload_id: { Args: { object_name: string }; Returns: string }
      media_object_workspace_id: {
        Args: { object_name: string }
        Returns: string
      }
      mint_opaque_backup_capability: {
        Args: {
          p_expires_at: string
          p_owner_user_id: string
          p_reauthenticated_at: string
          p_token_hash: string
          p_workspace_id: string
        }
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
      propose_member_person_binding: {
        Args: {
          p_person_id: string
          p_profile_id: string
          p_transition_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      publish_drive_bundle_migration: {
        Args: { p_report: Json; p_run_id: string }
        Returns: Json
      }
      register_crypto_principal: {
        Args: {
          p_principal_id: string
          p_recovery_epoch: number
          p_signing_fingerprint: string
          p_signing_public_key: Json
          p_unwrap_fingerprint: string
          p_unwrap_public_key: Json
        }
        Returns: undefined
      }
      register_verified_checkpoint_intent: {
        Args: {
          p_actor_principal_id: string
          p_artifact: Json
          p_checkpoint_id: string
          p_delegation_id: string
          p_expires_at: string
          p_external_anchor_hash: string
          p_key_epoch: number
          p_membership_epoch: number
          p_next_checkpoint_hash: string
          p_previous_checkpoint_hash: string
          p_previous_checkpoint_revision: number
          p_request_checksum: string
          p_verified_at: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      register_verified_contact_edit_authorization: {
        Args: {
          p_actor_principal_id: string
          p_artifact: Json
          p_authorization_id: string
          p_binding_revision: number
          p_expires_at: string
          p_field_class: Database["public"]["Enums"]["private_field_class"]
          p_graph_revision: number
          p_key_epoch: number
          p_nonce_hash: string
          p_person_id: string
          p_policy_revision: number
          p_verified_at: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      register_verified_contact_policy: {
        Args: {
          p_allow_principal_ids: Json
          p_artifact: Json
          p_audience: Database["public"]["Enums"]["contact_audience"]
          p_binding_revision: number
          p_deny_principal_ids: Json
          p_expires_at: string
          p_field_class: Database["public"]["Enums"]["private_field_class"]
          p_graph_revision: number
          p_key_epoch: number
          p_nonce_hash: string
          p_person_id: string
          p_policy_id: string
          p_policy_principal_id: string
          p_policy_revision: number
          p_profile_id: string
          p_recipient_principal_ids: Json
          p_signer_fingerprint: string
          p_subject_binding_id: string
          p_verified_at: string
          p_workspace_id: string
        }
        Returns: Json
      }
      register_verified_editor_delegation: {
        Args: {
          p_artifact: Json
          p_delegation_id: string
          p_expires_at: string
          p_membership_epoch: number
          p_principal_id: string
          p_scopes: string[]
          p_signer_fingerprint: string
          p_verified_at: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      register_verified_portability_export_authorization: {
        Args: {
          p_actor_principal_id: string
          p_artifact: Json
          p_authorization_id: string
          p_binding_revision: number
          p_expires_at: string
          p_fields: Json
          p_format: string
          p_graph_revision: number
          p_key_epoch: number
          p_nonce_hash: string
          p_person_ids: Json
          p_policy_revision: number
          p_profile_id: string
          p_verified_at: string
          p_workspace_id: string
        }
        Returns: undefined
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
      rotate_workspace_join_code: {
        Args: { p_workspace_id: string }
        Returns: string
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
      backup_capability_state: "active" | "consumed" | "revoked" | "expired"
      collaboration_cutover_state: "inventory" | "ready" | "active" | "blocked"
      commit_status: "pending" | "applied" | "conflict" | "failed"
      contact_audience:
        | "self_only"
        | "direct_family"
        | "close_blood"
        | "blood_only"
        | "workspace_members"
        | "custom"
      contact_field_lifecycle: "active" | "rotating"
      contact_rotation_state: "prepared" | "complete"
      crypto_invitation_state: "pending" | "consumed" | "revoked" | "expired"
      crypto_migration_state:
        | "parallel"
        | "preview_ready"
        | "canonical"
        | "blocked"
      draft_operation_status: "pending" | "approved" | "rejected" | "conflict"
      draft_status:
        | "draft"
        | "pending"
        | "partially_reviewed"
        | "needs_changes"
        | "approved"
        | "rejected"
        | "invalid"
      encrypted_entity_class:
        | "family_profile"
        | "person_core"
        | "relationship"
        | "media_manifest"
        | "workspace_settings"
      encrypted_key_purpose: "workspace" | "contact" | "media"
      fact_confidence: "confirmed" | "likely" | "estimated" | "unknown"
      gender_type: "male" | "female" | "other" | "unknown"
      invitation_status: "pending" | "accepted" | "revoked" | "expired"
      legacy_collaboration_disposition:
        | "viewer"
        | "revoked"
        | "export_required"
        | "discarded"
      media_cleanup_status: "pending" | "completed" | "failed"
      media_upload_status:
        | "staging"
        | "verified"
        | "attached"
        | "discarded"
        | "expired"
      member_person_binding_action:
        | "propose"
        | "confirm"
        | "reject"
        | "revoke"
        | "supersede"
      member_person_binding_state:
        | "pending"
        | "confirmed"
        | "rejected"
        | "revoked"
        | "superseded"
      migration_status:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
      policy_authorization_purpose:
        | "contact_view"
        | "contact_edit"
        | "portability_export"
      private_field_class: "phone" | "email" | "address" | "private_note"
      relationship_type: "spouse" | "parent"
      spouse_status:
        | "married"
        | "partner"
        | "separated"
        | "divorced"
        | "widowed"
        | "unknown"
      workspace_role: "owner" | "editor" | "viewer"
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
      backup_capability_state: ["active", "consumed", "revoked", "expired"],
      collaboration_cutover_state: ["inventory", "ready", "active", "blocked"],
      commit_status: ["pending", "applied", "conflict", "failed"],
      contact_audience: [
        "self_only",
        "direct_family",
        "close_blood",
        "blood_only",
        "workspace_members",
        "custom",
      ],
      contact_field_lifecycle: ["active", "rotating"],
      contact_rotation_state: ["prepared", "complete"],
      crypto_invitation_state: ["pending", "consumed", "revoked", "expired"],
      crypto_migration_state: [
        "parallel",
        "preview_ready",
        "canonical",
        "blocked",
      ],
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
      encrypted_entity_class: [
        "family_profile",
        "person_core",
        "relationship",
        "media_manifest",
        "workspace_settings",
      ],
      encrypted_key_purpose: ["workspace", "contact", "media"],
      fact_confidence: ["confirmed", "likely", "estimated", "unknown"],
      gender_type: ["male", "female", "other", "unknown"],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      legacy_collaboration_disposition: [
        "viewer",
        "revoked",
        "export_required",
        "discarded",
      ],
      media_cleanup_status: ["pending", "completed", "failed"],
      media_upload_status: [
        "staging",
        "verified",
        "attached",
        "discarded",
        "expired",
      ],
      member_person_binding_action: [
        "propose",
        "confirm",
        "reject",
        "revoke",
        "supersede",
      ],
      member_person_binding_state: [
        "pending",
        "confirmed",
        "rejected",
        "revoked",
        "superseded",
      ],
      migration_status: [
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
      ],
      policy_authorization_purpose: [
        "contact_view",
        "contact_edit",
        "portability_export",
      ],
      private_field_class: ["phone", "email", "address", "private_note"],
      relationship_type: ["spouse", "parent"],
      spouse_status: [
        "married",
        "partner",
        "separated",
        "divorced",
        "widowed",
        "unknown",
      ],
      workspace_role: ["owner", "editor", "viewer"],
    },
  },
} as const

