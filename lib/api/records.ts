import { createClient } from "@/lib/supabase/server";
import type { Contact, Folder, UserProfile } from "@/lib/types";

export async function getProfilesById(userIds: string[]): Promise<Map<string, UserProfile>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));

  if (uniqueIds.length === 0) {
    return new Map<string, UserProfile>();
  }

  const supabase = createClient();
  const { data, error } = await supabase.from("users_profiles").select("*").in("id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  const profiles = (data ?? []) as UserProfile[];
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

export async function getFoldersById(folderIds: string[]): Promise<Map<string, Folder>> {
  const uniqueIds = Array.from(new Set(folderIds.filter(Boolean)));

  if (uniqueIds.length === 0) {
    return new Map<string, Folder>();
  }

  const supabase = createClient();
  const { data, error } = await supabase.from("folders").select("*").in("id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  const folders = (data ?? []) as Folder[];
  return new Map(folders.map((folder) => [folder.id, folder]));
}

export async function getContactsById(contactIds: string[]): Promise<Map<string, Contact>> {
  const uniqueIds = Array.from(new Set(contactIds.filter(Boolean)));

  if (uniqueIds.length === 0) {
    return new Map<string, Contact>();
  }

  const supabase = createClient();
  const { data, error } = await supabase.from("contacts").select("*").in("id", uniqueIds).is("deleted_at", null);

  if (error) {
    throw new Error(error.message);
  }

  const contacts = (data ?? []) as Contact[];
  return new Map(contacts.map((contact) => [contact.id, contact]));
}
