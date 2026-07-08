import PDFDocument from "pdfkit";

// Server-side Care Summary PDF (Phase 5 — §5 export). Same pdfkit approach as the
// Phase 4 Emergency Packet: built-in Helvetica, no external font files, streamed to a
// Buffer. Human-readable summary of the person's current state.

export type CareSummaryPerson = {
  dateOfBirth: string | null;
  age: number | null;
  bloodType: string | null;
  primaryLanguage: string | null;
  allergies: string[];
  diagnoses: string[];
  about: string | null;
};

export type CareSummaryMedication = {
  name: string;
  dose: string;
  frequency: string;
  instructions: string | null;
};

export type CareSummaryAppointment = {
  title: string;
  provider: string | null;
  scheduledAt: string;
  location: string | null;
};

export type CareSummaryTask = {
  title: string;
  assignee: string;
  dueDate: string | null;
  priority: string;
  status: string;
};

export type CareSummaryContact = {
  name: string;
  role: string | null;
  phone: string | null;
  organization: string | null;
};

export type CareSummaryTimelineEntry = {
  occurredAt: string;
  author: string;
  title: string;
  body: string | null;
};

export type CareSummaryInput = {
  personName: string;
  person: CareSummaryPerson;
  medications: CareSummaryMedication[];
  appointments: CareSummaryAppointment[];
  tasks: CareSummaryTask[];
  contacts: CareSummaryContact[];
  timeline: CareSummaryTimelineEntry[];
  generatedAt: string;
  generatedBy: string;
};

const BLUE = "#2563EB";
const NEUTRAL_900 = "#111827";
const NEUTRAL_600 = "#4B5563";
const NEUTRAL_500 = "#6B7280";
const NEUTRAL_300 = "#D1D5DB";

type Doc = PDFKit.PDFDocument;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function divider(doc: Doc): void {
  const y = doc.y + 4;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .lineWidth(0.5)
    .strokeColor(NEUTRAL_300)
    .stroke();
  doc.moveDown(0.8);
}

function sectionHeading(doc: Doc, label: string): void {
  doc.moveDown(0.6);
  doc.fillColor(NEUTRAL_900).font("Helvetica-Bold").fontSize(12).text(label);
  doc.moveDown(0.3);
}

function fieldRow(doc: Doc, label: string, value: string): void {
  doc.font("Helvetica-Bold").fontSize(9).fillColor(NEUTRAL_500).text(`${label}: `, { continued: true });
  doc.font("Helvetica").fontSize(10).fillColor(NEUTRAL_900).text(value);
}

export function buildCareSummaryPdf(input: CareSummaryInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Care Summary — ${input.personName}` } });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header
      doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(22).text("Care Summary");
      doc.moveDown(0.15);
      doc.fillColor(NEUTRAL_900).font("Helvetica-Bold").fontSize(16).text(input.personName);
      doc
        .fillColor(NEUTRAL_500)
        .font("Helvetica")
        .fontSize(9)
        .text(`Generated ${formatDateTime(input.generatedAt)} by ${input.generatedBy}`);
      doc.moveDown(0.3);
      divider(doc);

      // Person
      sectionHeading(doc, "Person");
      const p = input.person;
      fieldRow(
        doc,
        "Date of birth",
        p.dateOfBirth ? `${formatDate(p.dateOfBirth)}${p.age != null ? ` (age ${p.age})` : ""}` : "—"
      );
      fieldRow(doc, "Blood type", p.bloodType || "—");
      fieldRow(doc, "Primary language", p.primaryLanguage || "—");
      fieldRow(doc, "Allergies", p.allergies.length ? p.allergies.join(", ") : "None recorded");
      fieldRow(doc, "Diagnoses", p.diagnoses.length ? p.diagnoses.join(", ") : "None recorded");
      if (p.about) {
        doc.moveDown(0.2);
        doc.font("Helvetica").fontSize(9).fillColor(NEUTRAL_600).text(p.about);
      }

      // Active medications
      sectionHeading(doc, `Active Medications (${input.medications.length})`);
      if (input.medications.length === 0) {
        doc.font("Helvetica").fontSize(10).fillColor(NEUTRAL_500).text("None recorded.");
      }
      for (const med of input.medications) {
        const meta = [med.dose, med.frequency].filter(Boolean).join(" · ");
        doc.font("Helvetica-Bold").fontSize(10).fillColor(NEUTRAL_900).text(med.name, { continued: meta.length > 0 });
        if (meta.length > 0) {
          doc.font("Helvetica").fontSize(10).fillColor(NEUTRAL_600).text(`   ${meta}`);
        }
        if (med.instructions) {
          doc.font("Helvetica").fontSize(9).fillColor(NEUTRAL_500).text(med.instructions);
        }
        doc.moveDown(0.25);
      }

      // Upcoming appointments (next 90 days)
      sectionHeading(doc, `Upcoming Appointments (${input.appointments.length})`);
      if (input.appointments.length === 0) {
        doc.font("Helvetica").fontSize(10).fillColor(NEUTRAL_500).text("None in the next 90 days.");
      }
      for (const appointment of input.appointments) {
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(NEUTRAL_500)
          .text(formatDateTime(appointment.scheduledAt));
        const meta = [appointment.provider, appointment.location].filter(Boolean).join(" · ");
        doc.font("Helvetica-Bold").fontSize(10).fillColor(NEUTRAL_900).text(appointment.title);
        if (meta.length > 0) {
          doc.font("Helvetica").fontSize(9).fillColor(NEUTRAL_600).text(meta);
        }
        doc.moveDown(0.25);
      }

      // Open tasks
      sectionHeading(doc, `Open Tasks (${input.tasks.length})`);
      if (input.tasks.length === 0) {
        doc.font("Helvetica").fontSize(10).fillColor(NEUTRAL_500).text("No open tasks.");
      }
      for (const task of input.tasks) {
        const meta = [
          `Assigned: ${task.assignee}`,
          task.dueDate ? `Due ${formatDate(task.dueDate)}` : null,
          task.priority
        ]
          .filter(Boolean)
          .join(" · ");
        doc.font("Helvetica-Bold").fontSize(10).fillColor(NEUTRAL_900).text(task.title);
        doc.font("Helvetica").fontSize(9).fillColor(NEUTRAL_500).text(meta);
        doc.moveDown(0.2);
      }

      // Contacts
      sectionHeading(doc, `Contacts (${input.contacts.length})`);
      if (input.contacts.length === 0) {
        doc.font("Helvetica").fontSize(10).fillColor(NEUTRAL_500).text("None recorded.");
      }
      for (const contact of input.contacts) {
        const meta = [contact.role, contact.organization].filter(Boolean).join(" · ");
        doc.font("Helvetica-Bold").fontSize(10).fillColor(NEUTRAL_900).text(contact.name, { continued: Boolean(contact.phone) });
        if (contact.phone) {
          doc.font("Helvetica").fontSize(10).fillColor(NEUTRAL_600).text(`   ${contact.phone}`);
        }
        if (meta.length > 0) {
          doc.font("Helvetica").fontSize(9).fillColor(NEUTRAL_500).text(meta);
        }
        doc.moveDown(0.2);
      }

      // Recent timeline (last 30 days)
      sectionHeading(doc, "Recent Activity (last 30 days)");
      if (input.timeline.length === 0) {
        doc.font("Helvetica").fontSize(10).fillColor(NEUTRAL_500).text("No recent activity.");
      }
      for (const entry of input.timeline) {
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(NEUTRAL_500)
          .text(`${formatDateTime(entry.occurredAt)} · ${entry.author}`);
        doc.font("Helvetica-Bold").fontSize(10).fillColor(NEUTRAL_900).text(entry.title);
        if (entry.body) {
          doc.font("Helvetica").fontSize(9).fillColor(NEUTRAL_600).text(entry.body);
        }
        doc.moveDown(0.3);
      }

      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Failed to build PDF"));
    }
  });
}
