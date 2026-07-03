import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return `${first}${second}`.toUpperCase() || "V";
}

export function formatPersonName(firstName: string, lastName: string, preferredName: string | null): string {
  if (preferredName && preferredName.trim().length > 0) {
    return preferredName;
  }

  return `${firstName} ${lastName}`.trim();
}

export function calculateAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) {
    return null;
  }

  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDelta = today.getMonth() - birthDate.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

export function formatMonth(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric"
  }).format(new Date(value));
}

export function formatRelativeDueDate(value: string | null): { label: string; overdue: boolean } {
  if (!value) {
    return { label: "No due date", overdue: false };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${value}T00:00:00`);
  const deltaDays = Math.round((due.getTime() - today.getTime()) / 86400000);

  if (deltaDays === 0) return { label: "Today", overdue: false };
  if (deltaDays === 1) return { label: "Tomorrow", overdue: false };
  if (deltaDays > 1 && deltaDays <= 6) return { label: `In ${deltaDays} days`, overdue: false };
  if (deltaDays === -1) return { label: "Yesterday", overdue: true };
  if (deltaDays < -1) return { label: `${Math.abs(deltaDays)} days ago`, overdue: true };

  return { label: formatShortDate(value), overdue: false };
}

export function toDateInputValue(value: string | null): string {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

export function toDateTimeLocalValue(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export function relativeTime(value: string | null): string {
  if (!value) {
    return "your last visit";
  }

  const then = new Date(value).getTime();
  const now = Date.now();
  const diffHours = Math.max(1, Math.round((now - then) / 3600000));

  if (diffHours < 24) {
    return `${diffHours} hours ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} days ago`;
}
