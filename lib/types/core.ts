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
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type TaskStatus = "open" | "in_progress" | "done" | "missed" | "cancelled";
export type AppointmentType = "medical" | "legal" | "financial" | "home_service" | "other";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "missed";
export type TimelineEventType =
  | "user_entry"
  | "task_completed"
  | "task_missed"
  | "appointment_completed"
  | "appointment_created"
  | "document_uploaded"
  | "note_created"
  | "member_joined"
  | "system";
export type ReminderType = "task_due" | "appointment_upcoming" | "document_expiring" | "custom";
export type ReminderStatus = "pending" | "sent" | "acknowledged" | "snoozed" | "expired";
export type DocumentType =
  | "medical_record"
  | "insurance"
  | "legal"
  | "financial"
  | "identification"
  | "care_plan"
  | "correspondence"
  | "other";

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
  last_caught_up_at: string | null;
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

export type Task = {
  id: string;
  care_circle_id: string;
  person_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  assigned_by: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  recurrence: Json | null;
  linked_object_type: string | null;
  linked_object_id: string | null;
  tags: string[] | null;
  completed_at: string | null;
  completed_by: string | null;
  missed_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Appointment = {
  id: string;
  care_circle_id: string;
  person_id: string;
  title: string;
  provider_name: string | null;
  location: string | null;
  address: string | null;
  appointment_type: AppointmentType | null;
  scheduled_at: string;
  duration_minutes: number | null;
  status: AppointmentStatus;
  prep_notes: string | null;
  outcome: string | null;
  attendee_ids: string[] | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Note = {
  id: string;
  care_circle_id: string;
  person_id: string;
  author_id: string;
  content: string;
  is_private: boolean;
  linked_object_type: string | null;
  linked_object_id: string | null;
  pinned_in_crisis: boolean;
  tags: string[] | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TimelineEvent = {
  id: string;
  care_circle_id: string;
  person_id: string;
  event_type: TimelineEventType;
  title: string;
  body: string | null;
  author_id: string | null;
  occurred_at: string;
  is_editable: boolean;
  linked_object_type: string | null;
  linked_object_id: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type Reminder = {
  id: string;
  care_circle_id: string;
  person_id: string;
  linked_object_type: string | null;
  linked_object_id: string | null;
  reminder_type: ReminderType | null;
  scheduled_at: string;
  message: string | null;
  recipient_ids: string[] | null;
  repeat_rule: Json | null;
  acknowledgements: Json;
  status: ReminderStatus;
  snooze_count: number;
  snooze_until: string | null;
  created_at: string;
  updated_at: string;
};

export type Document = {
  id: string;
  care_circle_id: string;
  person_id: string;
  folder_id: string | null;
  title: string;
  description: string | null;
  document_type: DocumentType | null;
  file_url: string | null;
  storage_path: string | null;
  appointment_id: string | null;
  file_type: string | null;
  file_size_bytes: number | null;
  uploaded_by: string | null;
  issued_at: string | null;
  expires_at: string | null;
  source_name: string | null;
  tags: string[] | null;
  extracted_text: string | null;
  is_private: boolean;
  pinned_in_crisis: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskComment = {
  id: string;
  care_circle_id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
};

export type SearchResult = {
  result_type: "timeline" | "task" | "appointment" | "document" | "note";
  object_id: string;
  care_circle_id: string;
  person_id: string;
  title: string;
  snippet: string;
  occurred_at: string;
  rank: number;
};

export type DashboardChanges = {
  lastCaughtUpAt: string | null;
  totalTimelineEntries: number;
  tasksCompleted: number;
  tasksMissed: number;
  newDocuments: number;
  notesAdded: number;
};

export type HydratedTask = Task & {
  assignee: UserProfile | null;
  assignedByProfile: UserProfile | null;
  comments: Array<TaskComment & { author: UserProfile | null }>;
};

export type HydratedAppointment = Appointment & {
  attendees: UserProfile[];
};

export type HydratedDocument = Document & {
  folder: Folder | null;
  uploader: UserProfile | null;
};

export type HydratedNote = Note & {
  author: UserProfile | null;
};

export type HydratedTimelineEvent = TimelineEvent & {
  author: UserProfile | null;
  linked_title: string | null;
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
