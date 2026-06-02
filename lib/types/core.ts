export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Role =
  | "owner"
  | "coordinator"
  | "contributor"
  | "caregiver"
  | "viewer"
  | "emergency";

export type CareMode = "normal" | "elevated" | "crisis";

export type FolderType = "system" | "user_created";

export type UserProfile = {
  id: string;
  display_name: string;
  phone: string | null;
  avatar_url: string | null;
  timezone: string;
  notification_preferences: Json;
  created_at: string;
  updated_at: string;
};

export type CareCircle = {
  id: string;
  name: string;
  person_id: string | null;
  owner_id: string;
  settings: Json;
  crisis_mode: boolean;
  crisis_mode_activated_at: string | null;
  crisis_mode_activated_by: string | null;
  created_at: string;
};

export type Person = {
  id: string;
  care_circle_id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  date_of_birth: string | null;
  pronouns: string | null;
  primary_language: string;
  photo_url: string | null;
  primary_diagnoses: string[] | null;
  allergies: string[] | null;
  blood_type: string | null;
  insurance_summary: Json;
  medical_record_numbers: Json;
  current_care_mode: CareMode;
  about_note: string | null;
  created_at: string;
  updated_at: string;
};

export type Membership = {
  id: string;
  care_circle_id: string;
  user_id: string;
  role: Role;
  relationship_label: string | null;
  expires_at: string | null;
  created_at: string;
};

export type Folder = {
  id: string;
  care_circle_id: string;
  person_id: string;
  name: string;
  slug: string;
  parent_folder_id: string | null;
  folder_type: FolderType;
  color: string | null;
  is_pinned: boolean;
  is_emergency_visible: boolean;
  is_archived: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditLog = {
  id: string;
  care_circle_id: string | null;
  actor_id: string;
  action_type: string;
  object_type: string;
  object_id: string | null;
  diff: Json | null;
  ip_address: string | null;
  user_agent: string | null;
  occurred_at: string;
};

export type Invitation = {
  id: string;
  care_circle_id: string;
  invited_by: string;
  email: string;
  role: Role;
  token: string;
  personal_note: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

export type CircleSummary = {
  careCircle: CareCircle;
  membership: Membership;
  person: Person | null;
};

export type MemberSummary = {
  membership: Membership;
  profile: UserProfile | null;
};
