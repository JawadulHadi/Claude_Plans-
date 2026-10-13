export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          plan: 'free' | 'pro' | 'agency';
          stripe_customer_id: string | null;
          applications_this_month: number;
          plan_reset_at: string;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          plan?: 'free' | 'pro' | 'agency';
          stripe_customer_id?: string | null;
          applications_this_month?: number;
          plan_reset_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          plan?: 'free' | 'pro' | 'agency';
          stripe_customer_id?: string | null;
          applications_this_month?: number;
          plan_reset_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      resumes: {
        Row: {
          id: string;
          user_id: string;
          file_path: string | null;
          content_text: string;
          embedding: string | null;
          variants: Json;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          file_path?: string | null;
          content_text: string;
          embedding?: string | null;
          variants?: Json;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          file_path?: string | null;
          content_text?: string;
          embedding?: string | null;
          variants?: Json;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'resumes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      job_listings: {
        Row: {
          id: string;
          title: string;
          company: string;
          location: string | null;
          remote_ok: boolean;
          board: string;
          external_id: string | null;
          url: string;
          jd_text: string;
          embedding: string | null;
          salary_min: number | null;
          salary_max: number | null;
          salary_currency: string;
          scraped_at: string;
          expires_at: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          company: string;
          location?: string | null;
          remote_ok?: boolean;
          board: string;
          external_id?: string | null;
          url: string;
          jd_text: string;
          embedding?: string | null;
          salary_min?: number | null;
          salary_max?: number | null;
          salary_currency?: string;
          scraped_at?: string;
          expires_at?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          company?: string;
          location?: string | null;
          remote_ok?: boolean;
          board?: string;
          external_id?: string | null;
          url?: string;
          jd_text?: string;
          embedding?: string | null;
          salary_min?: number | null;
          salary_max?: number | null;
          salary_currency?: string;
          scraped_at?: string;
          expires_at?: string | null;
        };
        Relationships: [];
      };
      applications: {
        Row: {
          id: string;
          user_id: string;
          job_id: string;
          resume_id: string | null;
          resume_variant_label: string | null;
          cover_letter_text: string | null;
          match_score: number | null;
          status:
            | 'pending_review'
            | 'approved'
            | 'applying'
            | 'applied'
            | 'bounced'
            | 'replied'
            | 'interview'
            | 'offer'
            | 'rejected'
            | 'ghosted'
            | 'withdrawn';
          applied_at: string | null;
          last_event_at: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_id: string;
          resume_id?: string | null;
          resume_variant_label?: string | null;
          cover_letter_text?: string | null;
          match_score?: number | null;
          status?:
            | 'pending_review'
            | 'approved'
            | 'applying'
            | 'applied'
            | 'bounced'
            | 'replied'
            | 'interview'
            | 'offer'
            | 'rejected'
            | 'ghosted'
            | 'withdrawn';
          applied_at?: string | null;
          last_event_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          job_id?: string;
          resume_id?: string | null;
          resume_variant_label?: string | null;
          cover_letter_text?: string | null;
          match_score?: number | null;
          status?:
            | 'pending_review'
            | 'approved'
            | 'applying'
            | 'applied'
            | 'bounced'
            | 'replied'
            | 'interview'
            | 'offer'
            | 'rejected'
            | 'ghosted'
            | 'withdrawn';
          applied_at?: string | null;
          last_event_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'applications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'applications_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'job_listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'applications_resume_id_fkey';
            columns: ['resume_id'];
            isOneToOne: false;
            referencedRelation: 'resumes';
            referencedColumns: ['id'];
          },
        ];
      };
      pipeline_events: {
        Row: {
          id: string;
          application_id: string;
          event_type: string;
          from_status: string | null;
          to_status: string | null;
          payload: Json;
          source: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          event_type: string;
          from_status?: string | null;
          to_status?: string | null;
          payload?: Json;
          source?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          event_type?: string;
          from_status?: string | null;
          to_status?: string | null;
          payload?: Json;
          source?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pipeline_events_application_id_fkey';
            columns: ['application_id'];
            isOneToOne: false;
            referencedRelation: 'applications';
            referencedColumns: ['id'];
          },
        ];
      };
      sessions: {
        Row: {
          id: string;
          user_id: string;
          application_id: string | null;
          type: 'phone_screen' | 'technical' | 'behavioral' | 'onsite' | 'offer_call' | 'followup';
          scheduled_at: string | null;
          duration_minutes: number;
          google_calendar_event_id: string | null;
          interviewer_names: string[];
          prep_notes: string | null;
          outcome: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          application_id?: string | null;
          type: 'phone_screen' | 'technical' | 'behavioral' | 'onsite' | 'offer_call' | 'followup';
          scheduled_at?: string | null;
          duration_minutes?: number;
          google_calendar_event_id?: string | null;
          interviewer_names?: string[];
          prep_notes?: string | null;
          outcome?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          application_id?: string | null;
          type?: 'phone_screen' | 'technical' | 'behavioral' | 'onsite' | 'offer_call' | 'followup';
          scheduled_at?: string | null;
          duration_minutes?: number;
          google_calendar_event_id?: string | null;
          interviewer_names?: string[];
          prep_notes?: string | null;
          outcome?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_application_id_fkey';
            columns: ['application_id'];
            isOneToOne: false;
            referencedRelation: 'applications';
            referencedColumns: ['id'];
          },
        ];
      };
      ats_knowledge: {
        Row: {
          id: string;
          category: 'site' | 'ats_playbook' | 'dropdown_map';
          key: string;
          content: Json;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category: 'site' | 'ats_playbook' | 'dropdown_map';
          key: string;
          content: Json;
          updated_at?: string;
        };
        Update: {
          id?: string;
          category?: 'site' | 'ats_playbook' | 'dropdown_map';
          key?: string;
          content?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_jobs_for_resume: {
        Args: {
          resume_embedding: string;
          match_threshold?: number;
          match_count?: number;
        };
        Returns: Array<{
          id: string;
          title: string;
          company: string;
          board: string;
          url: string;
          similarity: number;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
