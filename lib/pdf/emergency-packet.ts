import PDFDocument from "pdfkit";

// Server-side Emergency Packet PDF (Phase 4). Uses pdfkit's built-in Helvetica
// (no external font files). Pinned documents are LINKED via signed URL rather
// than embedded (DESIGN allows "linked otherwise"); true PDF-merge is deferred.

export type PacketPerson = {
  dateOfBirth: string | null;
  age: number | null;
  bloodType: string | null;
  allergies: string[];
  diagnoses: string[];
};

export type PacketMedication = {
  name: string;
  dose: string;
  frequency: string;
  instructions: string | null;
};

export type PacketContact = {
  name: string;
  role: string | null;
  phone: string | null;
  organization: string | null;
};

export type PacketDocument = {
  title: string;
  documentType: string | null;
  url: string | null;
};

export type PacketTimelineEntry = {
  occurredAt: string;
  author: string;
  title: string;
  body: string | null;
};

export type EmergencyPacketInput = {
  personName: string;
  person: PacketPerson;
  medications: PacketMedication[];
  contacts: PacketContact[];
  documents: PacketDocument[];
  timeline: PacketTimelineEntry[];
  generatedAt: string;
  generatedBy: string;
};

const RED = "#DC2626";
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
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).lineWidth(0.5).strokeColor(NEUTRAL_300).stroke();
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

export function buildEmergencyPacketPdf(input: EmergencyPacketInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Emergency Packet — ${input.personName}` } });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header
      doc.fillColor(RED).font("Helvetica-Bold").fontSize(22).text("Emergency Packet");
      doc.moveDown(0.15);
      doc.fillColor(NEUTRAL_900).font("Helvetica-Bold").fontSize(16).text(input.personName);
      doc.fillColor(NEUTRAL_500).font("Helvetica").fontSize(9).text(
        `Generated ${formatDateTime(input.generatedAt)} by ${input.generatedBy}`
      );
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
      fieldRow(doc, "Allergies", p.allergies.length ? p.allergies.join(", ") : "None recorded");
      fieldRow(doc, "Diagnoses", p.diagnoses.length ? p.diagnoses.join(", ") : "None recorded");

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

      // Emergency contacts
      sectionHeading(doc, `Emergency Contacts (${input.contacts.length})`);
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
        doc.moveDown(0.25);
      }

      // Pinned documents
      sectionHeading(doc, `Pinned Documents (${input.documents.length})`);
      if (input.documents.length === 0) {
        doc.font("Helvetica").fontSize(10).fillColor(NEUTRAL_500).text("None pinned.");
      }
      for (const document of input.documents) {
        const badge = document.documentType ? ` [${document.documentType}]` : "";
        doc.font("Helvetica-Bold").fontSize(10).fillColor(NEUTRAL_900).text(`${document.title}${badge}`);
        if (document.url) {
          doc.font("Helvetica").fontSize(8).fillColor("#2563EB").text(document.url, { link: document.url, underline: true });
        } else {
          doc.font("Helvetica").fontSize(8).fillColor(NEUTRAL_500).text("Link unavailable");
        }
        doc.moveDown(0.25);
      }

      // Recent timeline (last 5)
      sectionHeading(doc, "Recent Timeline");
      if (input.timeline.length === 0) {
        doc.font("Helvetica").fontSize(10).fillColor(NEUTRAL_500).text("No recent entries.");
      }
      for (const entry of input.timeline) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(NEUTRAL_500).text(
          `${formatDateTime(entry.occurredAt)} · ${entry.author}`
        );
        doc.font("Helvetica-Bold").fontSize(10).fillColor(NEUTRAL_900).text(entry.title);
        if (entry.body) {
          doc.font("Helvetica").fontSize(9).fillColor(NEUTRAL_600).text(entry.body);
        }
        doc.moveDown(0.35);
      }

      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Failed to build PDF"));
    }
  });
}
