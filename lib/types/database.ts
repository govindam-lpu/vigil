import type {
  AuditLog,
  CareCircle,
  Folder,
  Invitation,
  Json,
  Membership,
  Person,
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
        Insert: InsertOf<Membership, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: UpdateOf<Membership>;
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
