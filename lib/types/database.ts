import type {
  AuditLog,
  Appointment,
  CalendarConnection,
  CheckIn,
  Contact,
  CrisisModeSession,
  Document,
  CareCircle,
  EscalationRule,
  Folder,
  Household,
  HouseholdAccessNote,
  Invitation,
  Json,
  Medication,
  MedicationAdministrationLog,
  Membership,
  MembershipPermissionOverride,
  Note,
  Notification,
  Observation,
  Person,
  Reminder,
  SearchResult,
  Task,
  TaskComment,
  TimelineEvent,
  UserDeviceToken,
  UserProfile
} from "./core";

type InsertOf<T, GeneratedKeys extends keyof T> = Omit<T, GeneratedKeys>;
type UpdateOf<T> = Partial<T>;

export type Database = {
  public: {
    Tables: {
      users_profiles: {
        Row: UserProfile;
        Insert: InsertOf<UserProfile, "created_at" | "updated_at"> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: UpdateOf<UserProfile>;
        Relationships: [];
      };
      care_circles: {
        Row: CareCircle;
        Insert: InsertOf<CareCircle, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: UpdateOf<CareCircle>;
        Relationships: [];
      };
      persons: {
        Row: Person;
        Insert: InsertOf<Person, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: UpdateOf<Person>;
        Relationships: [];
      };
      memberships: {
        Row: Membership;
        Insert: InsertOf<Membership, "id" | "created_at" | "deleted_at"> & {
          id?: string;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: UpdateOf<Membership>;
        Relationships: [];
      };
      membership_permission_overrides: {
        Row: MembershipPermissionOverride;
        Insert: InsertOf<MembershipPermissionOverride, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: UpdateOf<MembershipPermissionOverride>;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: InsertOf<Task, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: UpdateOf<Task>;
        Relationships: [];
      };
      appointments: {
        Row: Appointment;
        Insert: InsertOf<Appointment, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: UpdateOf<Appointment>;
        Relationships: [];
      };
      notes: {
        Row: Note;
        Insert: InsertOf<Note, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: UpdateOf<Note>;
        Relationships: [];
      };
      timeline_events: {
        Row: TimelineEvent;
        Insert: InsertOf<TimelineEvent, "id" | "created_at" | "occurred_at"> & {
          id?: string;
          created_at?: string;
          occurred_at?: string;
        };
        Update: UpdateOf<TimelineEvent>;
        Relationships: [];
      };
      reminders: {
        Row: Reminder;
        Insert: InsertOf<Reminder, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: UpdateOf<Reminder>;
        Relationships: [];
      };
      documents: {
        Row: Document;
        Insert: InsertOf<Document, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: UpdateOf<Document>;
        Relationships: [];
      };
      task_comments: {
        Row: TaskComment;
        Insert: InsertOf<TaskComment, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: UpdateOf<TaskComment>;
        Relationships: [];
      };
      contacts: {
        Row: Contact;
        Insert: InsertOf<Contact, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: UpdateOf<Contact>;
        Relationships: [];
      };
      medications: {
        Row: Medication;
        Insert: InsertOf<Medication, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: UpdateOf<Medication>;
        Relationships: [];
      };
      medication_administration_logs: {
        Row: MedicationAdministrationLog;
        Insert: InsertOf<MedicationAdministrationLog, "id" | "created_at" | "administered_at"> & {
          id?: string;
          created_at?: string;
          administered_at?: string;
        };
        Update: UpdateOf<MedicationAdministrationLog>;
        Relationships: [];
      };
      check_ins: {
        Row: CheckIn;
        Insert: InsertOf<CheckIn, "id" | "created_at" | "occurred_at"> & {
          id?: string;
          created_at?: string;
          occurred_at?: string;
        };
        Update: UpdateOf<CheckIn>;
        Relationships: [];
      };
      observations: {
        Row: Observation;
        Insert: InsertOf<Observation, "id" | "created_at" | "updated_at" | "occurred_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          occurred_at?: string;
        };
        Update: UpdateOf<Observation>;
        Relationships: [];
      };
      escalation_rules: {
        Row: EscalationRule;
        Insert: InsertOf<EscalationRule, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: UpdateOf<EscalationRule>;
        Relationships: [];
      };
      crisis_mode_sessions: {
        Row: CrisisModeSession;
        Insert: InsertOf<CrisisModeSession, "id" | "created_at" | "activated_at"> & {
          id?: string;
          created_at?: string;
          activated_at?: string;
        };
        Update: UpdateOf<CrisisModeSession>;
        Relationships: [];
      };
      folders: {
        Row: Folder;
        Insert: InsertOf<Folder, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: UpdateOf<Folder>;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLog;
        Insert: InsertOf<AuditLog, "id" | "occurred_at"> & {
          id?: string;
          occurred_at?: string;
        };
        Update: UpdateOf<AuditLog>;
        Relationships: [];
      };
      invitations: {
        Row: Invitation;
        Insert: InsertOf<Invitation, "id" | "created_at" | "accepted_at"> & {
          id?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: UpdateOf<Invitation>;
        Relationships: [];
      };
      notifications: {
        Row: Notification;
        Insert: InsertOf<Notification, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: UpdateOf<Notification>;
        Relationships: [];
      };
      households: {
        Row: Household;
        Insert: InsertOf<Household, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: UpdateOf<Household>;
        Relationships: [];
      };
      household_access_notes: {
        Row: HouseholdAccessNote;
        Insert: InsertOf<HouseholdAccessNote, "updated_at"> & {
          updated_at?: string;
        };
        Update: UpdateOf<HouseholdAccessNote>;
        Relationships: [];
      };
      user_device_tokens: {
        Row: UserDeviceToken;
        Insert: InsertOf<UserDeviceToken, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: UpdateOf<UserDeviceToken>;
        Relationships: [];
      };
      calendar_connections: {
        Row: CalendarConnection;
        Insert: InsertOf<CalendarConnection, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: UpdateOf<CalendarConnection>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_default_folders: {
        Args: {
          person_id: string;
          care_circle_id: string;
        };
        Returns: undefined;
      };
      create_onboarding_care_circle: {
        Args: {
          care_circle_name: string;
          person_first_name: string;
          person_last_name: string;
          person_date_of_birth: string;
          person_preferred_name?: string | null;
          person_pronouns?: string | null;
        };
        Returns: Json;
      };
      create_timeline_event: {
        Args: {
          care_circle_id: string;
          person_id: string;
          event_type: string;
          title: string;
          body: string | null;
          author_id: string | null;
          linked_object_type: string | null;
          linked_object_id: string | null;
        };
        Returns: TimelineEvent;
      };
      search_phase1: {
        Args: {
          search_query: string;
          target_person_id: string;
          target_care_circle_id: string;
          search_all_circles?: boolean;
        };
        Returns: SearchResult[];
      };
      mark_membership_caught_up: {
        Args: {
          target_care_circle_id: string;
        };
        Returns: undefined;
      };
      complete_task: {
        Args: {
          target_task_id: string;
        };
        Returns: Task;
      };
      activate_crisis_mode: {
        Args: {
          target_care_circle_id: string;
          activation_reason: string;
        };
        Returns: CrisisModeSession;
      };
      deactivate_crisis_mode: {
        Args: {
          target_care_circle_id: string;
          deactivation_summary: string;
        };
        Returns: CrisisModeSession | null;
      };
      process_due_reminders: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      get_care_circle_analytics: {
        Args: {
          target_care_circle_id: string;
          since_ts: string;
        };
        Returns: Json;
      };
      create_notification: {
        Args: {
          target_care_circle_id: string;
          recipient_ids: string[];
          notification_title: string;
          notification_body: string | null;
          notification_category: string;
          notification_type: string;
          action_url: string | null;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type { Json };
