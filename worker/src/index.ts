import Fastify from "fastify";
import { processDocument } from "./process";

// Vigil OCR/extraction worker. Runs OUTSIDE the serverless Next app because pdf-parse,
// Tesseract.js and (later) Whisper need a long-running container with real CPU/RAM.
// Next notifies POST /process-document after an upload; we ack immediately and process
// in the background, updating the document row (which the client polls).

const server = Fastify({ logger: true });

const SHARED_SECRET = process.env.WORKER_SHARED_SECRET;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  server.log.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}
if (!SHARED_SECRET) {
  server.log.error("WORKER_SHARED_SECRET is required");
  process.exit(1);
}
if (!process.env.AI_KEY_ENC_SECRET) {
  // Not fatal: OCR still runs; only the §2 extraction pass (which decrypts the BYOK key) is skipped.
  server.log.warn("AI_KEY_ENC_SECRET is not set — document extraction will be skipped");
}

server.get("/health", async () => ({ ok: true }));

server.post("/process-document", async (request, reply) => {
  const provided = request.headers["x-worker-secret"];
  if (provided !== SHARED_SECRET) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  const body = request.body as { documentId?: string; careCircleId?: string } | undefined;
  if (!body?.documentId || !body?.careCircleId) {
    return reply.code(400).send({ error: "documentId and careCircleId are required" });
  }

  const { documentId, careCircleId } = body;
  // Ack fast; do the heavy OCR/extraction after responding so the upload isn't blocked.
  void processDocument(documentId, careCircleId).catch((error) => {
    server.log.error({ error, documentId }, "processDocument failed");
  });

  return reply.code(202).send({ accepted: true });
});

const port = Number(process.env.PORT ?? 8787);
server
  .listen({ port, host: "0.0.0.0" })
  .then((address) => server.log.info(`Vigil worker listening on ${address}`))
  .catch((error) => {
    server.log.error(error);
    process.exit(1);
  });
