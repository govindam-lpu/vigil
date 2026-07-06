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
  | "check_in"
  | "medication_changed"
  | "observation_logged"
  | "member_joined"
  | "system";
export type ReminderType =
  | "task_due"
  | "appointment_upcoming"
  | "medication_refill"
  | "document_expiring"
  | "custom";
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

// Phase 2 — Care Operations
export type NoteType = "standard" | "handoff";
export type ContactRole =
  | "doctor"
  | "specialist"
  | "pharmacist"
  | "attorney"
  | "insurance"
  | "caregiver"
  | "neighbor"
  | "other";
export type MedicationForm = "pill" | "liquid" | "patch" | "injection" | "inhaler" | "other";
export type MedicationStatus = "active" | "paused" | "discontinued";
export type CheckInStatus = "well" | "concerning" | "urgent";
export type ObservationType = "symptom" | "vital" | "behavior" | "mood" | "other";
export type ObservationSeverity = "mild" | "moderate" | "severe";
export type EscalationTriggerType =
  | "task_missed"
  | "reminder_unacknowledged"
  | "checkin_skipped"
  | "custom";
export type EscalationAction = "notify_role" | "notify_user" | "notify_emergency_contact";

// Phase 3 — AI-Assisted Capture
export type AiProvider = "anthropic" | "gemini" | "managed";
export type AiFeature = "extraction" | "summary" | "note_task_suggestion";
export type DocumentProcessingStatus = "pending" | "processing" | "indexed" | "failed";

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
  original_role: Role | null;
  elevation_expires_at: string | null;
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
  provider_contact_id: string | null;
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
  note_type: NoteType;
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
  ai_suggestions: DocumentAiSuggestions | null;
  ai_suggestions_dismissed_at: string | null;
  processing_status: DocumentProcessingStatus | null;
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

export type Contact = {
  id: string;
  care_circle_id: string;
  person_id: string;
  name: string;
  organization: string | null;
  role: ContactRole | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  npi: string | null;
  notes: string | null;
  is_primary: boolean;
  is_emergency_contact: boolean;
  pinned_in_crisis: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Medication = {
  id: string;
  care_circle_id: string;
  person_id: string;
  name: string;
  generic_name: string | null;
  brand_name: string | null;
  dosage: string | null;
  unit: string | null;
  form: MedicationForm | null;
  route: string | null;
  frequency: string;
  schedule: string[] | null;
  prescriber_id: string | null;
  pharmacy_id: string | null;
  rx_number: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  refills_remaining: number | null;
  next_refill_date: string | null;
  instructions: string | null;
  side_effects_to_watch: string | null;
  interactions: string | null;
  status: MedicationStatus;
  discontinued_reason: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MedicationAdministrationLog = {
  id: string;
  medication_id: string;
  care_circle_id: string;
  person_id: string;
  administered_by: string;
  administered_at: string;
  notes: string | null;
  created_at: string;
};

export type CheckIn = {
  id: string;
  care_circle_id: string;
  person_id: string;
  author_id: string;
  status: CheckInStatus;
  notes: string | null;
  occurred_at: string;
  created_at: string;
};

export type Observation = {
  id: string;
  care_circle_id: string;
  person_id: string;
  author_id: string;
  observation_type: ObservationType;
  body: string;
  severity: ObservationSeverity | null;
  occurred_at: string;
  linked_object_type: string | null;
  linked_object_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EscalationRule = {
  id: string;
  care_circle_id: string;
  trigger_type: EscalationTriggerType | null;
  trigger_object_id: string | null;
  trigger_condition: Json | null;
  action: EscalationAction | null;
  target_ids: string[] | null;
  target_role: Role | null;
  message: string | null;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CrisisModeSession = {
  id: string;
  care_circle_id: string;
  activated_by: string;
  activated_at: string;
  deactivated_by: string | null;
  deactivated_at: string | null;
  reason: string | null;
  summary: string | null;
  members_notified: string[] | null;
  created_at: string;
};

export type ExtractedAppointment = {
  date: string | null;
  provider: string | null;
  location: string | null;
  notes: string | null;
};

export type ExtractedMedication = {
  name: string | null;
  dosage: string | null;
  frequency: string | null;
  instructions: string | null;
};

export type DocumentAiSuggestions = {
  appointments: ExtractedAppointment[];
  medications: ExtractedMedication[];
  follow_up_tasks: string[];
  expiry_date: string | null;
};

export type AiProviderConfig = {
  id: string;
  care_circle_id: string;
  provider: AiProvider | null;
  encrypted_key: string | null;
  key_last4: string | null;
  gemini_free_tier_ack: boolean;
  model_overrides: Json | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AiUsageLog = {
  id: string;
  care_circle_id: string;
  provider: string;
  feature: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  est_cost: number;
  latency_ms: number | null;
  succeeded: boolean;
  created_at: string;
};

export type CareCircleSummary = {
  id: string;
  care_circle_id: string;
  generated_for_user_id: string;
  generated_at: string;
  summary_text: string;
  events_covered: Json | null;
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

export type HydratedMedication = Medication & {
  prescriber: Contact | null;
  pharmacy: Contact | null;
};

export type HydratedMedicationAdministration = MedicationAdministrationLog & {
  administeredByProfile: UserProfile | null;
};

export type HydratedCheckIn = CheckIn & {
  author: UserProfile | null;
};

export type HydratedObservation = Observation & {
  author: UserProfile | null;
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
