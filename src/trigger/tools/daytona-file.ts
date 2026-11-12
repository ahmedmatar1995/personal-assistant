/**
 * Daytona "computer" tools for the Telegram chat agent.
 *
 * Two capabilities:
 *
 *  - processFile: receive a Telegram attachment (by file_id), download its
 *    bytes from Telegram's servers, upload them into an ephemeral Daytona
 *    sandbox, and extract text from it (PDF / Word / Excel / CSV / plain
 *    text; OCR for images via tesseract).
 *  - runCode: run arbitrary Python or TypeScript in an ephemeral sandbox,
 *    optionally with a Telegram file uploaded for the code to work on.
 *
 * Every call creates a fresh sandbox and deletes it in a `finally` block, so
 * nothing lingers consuming the org's vCPU/RAM/disk quota.
 *
 * Why download-then-upload instead of letting the sandbox fetch the file:
 * Daytona Tier 1/2 organizations can only reach a whitelist of essential
 * services from inside sandboxes and api.telegram.org is not on it — so the
 * Trigger.dev task fetches the bytes and pushes them in.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { Daytona, type Sandbox } from '@daytona/sdk';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : '';
const TG_FILE_API = BOT_TOKEN
  ? `https://api.telegram.org/file/bot${BOT_TOKEN}`
  : '';

// Telegram Bot API serves files via /file/bot<token>/<path> up to 20 MB.
const MAX_FILE_BYTES = 20 * 1024 * 1024;
// Caps on what we feed back into the model context.
const MAX_EXTRACT_CHARS = 6000;
const MAX_RUN_OUTPUT_CHARS = 4000;

// ---------------------------------------------------------------------------
// Telegram file helpers
// ---------------------------------------------------------------------------

export interface TelegramFile {
  fileId: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
}

interface GetFileResponse {
  ok: boolean;
  description?: string;
  result?: { file_id: string; file_path?: string };
}

/**
 * Resolve a Telegram file_id and download its bytes.
 * Returns the bytes plus a usable file name (document name, or the basename
 * of Telegram's file_path for photos/voice/etc.).
 */
export async function downloadTelegramFile(
  fileId: string
): Promise<{ file: TelegramFile; bytes: Buffer }> {
  if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  const infoRes = await fetch(`${TG_API}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const info = (await infoRes.json()) as GetFileResponse;
  if (!info.ok || !info.result?.file_path) {
    throw new Error(
      `Telegram getFile failed (${infoRes.status}): ${info.description ?? 'file not found'}`
    );
  }

  const filePath = info.result.file_path;
  const fileName = filePath.split('/').pop() ?? 'file';

  const bytesRes = await fetch(`${TG_FILE_API}/${filePath}`);
  if (!bytesRes.ok) {
    throw new Error(
      `Telegram file download failed (${bytesRes.status}) for ${filePath}`
    );
  }
  const bytes = Buffer.from(await bytesRes.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) {
    throw new Error(
      `File is ${bytes.length} bytes; Telegram bot downloads cap at ${MAX_FILE_BYTES} (20 MB).`
    );
  }

  return { file: { fileId, fileName }, bytes };
}

// ---------------------------------------------------------------------------
// Sandbox helpers
// ---------------------------------------------------------------------------

const UPLOAD_DIR = '/home/daytona/upload';

function uniqueName(base: string): string {
  return `${base}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function createSandbox(
  language: 'python' | 'typescript',
  nameBase: string
): Promise<Sandbox> {
  const daytona = new Daytona();
  // Short auto-stop/auto-delete as a safety net in case a run crashes before
  // the finally-block cleanup executes.
  return daytona.create({
    language,
    name: uniqueName(nameBase),
    labels: { project: 'ai-agent', purpose: nameBase },
    autoStopInterval: 5,
    autoDeleteInterval: 30,
  });
}

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp'];
const EXT_TO_PIP: Record<string, string> = {
  '.pdf': 'pypdf',
  '.docx': 'python-docx',
  '.xlsx': 'openpyxl',
  '.xls': 'openpyxl',
};

/**
 * Extract text from every file in the sandbox's upload directory.
 * Installs only the parser each file needs (pip from PyPI / apt for
 * tesseract OCR — both whitelisted on every Daytona tier).
 */
export async function extractFilesFromUploadDir(
  sandbox: Sandbox
): Promise<{ ok: boolean; files?: ExtractedFile[]; error?: string }> {
  const listing = await sandbox.fs.listFiles(UPLOAD_DIR);
  const names = listing.map((f) => f.name);
  if (names.length === 0) {
    return { ok: false, error: 'No files were uploaded into the sandbox.' };
  }

  // Install only what these specific files need.
  const pipPkgs = new Set<string>();
  let needsOcr = false;
  for (const name of names) {
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
    const pkg = EXT_TO_PIP[ext];
    if (pkg) pipPkgs.add(pkg);
    else if (!IMAGE_EXTS.includes(ext) && !ext.match(/^\.[a-z0-9]+$/)) {
      // unknown or extensionless — nothing to install
    }
    if (IMAGE_EXTS.includes(ext)) needsOcr = true;
  }

  if (pipPkgs.size > 0) {
    const pip = await sandbox.process.executeCommand(
      `python3 -m pip install -q --no-input ${[...pipPkgs].join(' ')}`,
      undefined,
      undefined,
      300
    );
    if (pip.exitCode !== 0) {
      return {
        ok: false,
        error: `Failed to install parsers (${pip.exitCode}): ${pip.result.slice(0, 500)}`,
      };
    }
  }

  if (needsOcr) {
    // Sandboxes run as user `daytona`; apt needs root, which is available
    // passwordless via sudo (verified: tesseract 5.5.0 installs cleanly).
    const apt = await sandbox.process.executeCommand(
      'sudo apt-get update -qq && sudo apt-get install -y -qq tesseract-ocr',
      undefined,
      undefined,
      300
    );
    if (apt.exitCode !== 0) {
      return {
        ok: false,
        error: `Failed to install OCR tooling (${apt.exitCode}). Images cannot be read this run.`,
      };
    }
  }

  const run = await sandbox.process.codeRun(EXTRACT_SCRIPT, undefined, 300);
  const stdout = run.artifacts?.stdout ?? run.result ?? '';

  let parsed: { ok: boolean; files?: ExtractedFile[]; error?: string };
  try {
    parsed = JSON.parse(stdout) as typeof parsed;
  } catch {
    return {
      ok: false,
      error: `Could not parse extractor output: ${stdout.slice(0, 300)}`,
    };
  }
  return parsed;
}

export interface ExtractedFile {
  file: string;
  sizeBytes: number;
  chars: number;
  truncated: boolean;
  text: string;
}

// Runs inside the sandbox. Prints exactly one JSON object to stdout.
// Errors are caught and reported as JSON so stdout stays parseable.
const EXTRACT_SCRIPT = `
import json, os, subprocess

UPLOAD_DIR = ${JSON.stringify(UPLOAD_DIR)}
MAX_CHARS = ${MAX_EXTRACT_CHARS}

def read_text(path):
    with open(path, "r", errors="replace") as f:
        return f.read()

def extract(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(path)
        pages = [(p.extract_text() or "") for p in reader.pages]
        return "\\n\\n".join(pages)
    if ext == ".docx":
        import docx
        d = docx.Document(path)
        return "\\n".join(p.text for p in d.paragraphs)
    if ext in (".xlsx", ".xls"):
        import openpyxl
        wb = openpyxl.load_workbook(path, data_only=True)
        out = []
        for ws in wb.worksheets[:3]:
            out.append("## Sheet: " + ws.title)
            for row in ws.iter_rows(values_only=True):
                out.append(",".join("" if c is None else str(c) for c in row))
        return "\\n".join(out)
    if ext in (".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".webp"):
        r = subprocess.run(["tesseract", path, "stdout"],
                           capture_output=True, text=True, timeout=120)
        return r.stdout.strip()
    return read_text(path)

try:
    results = []
    for fn in sorted(os.listdir(UPLOAD_DIR)):
        path = os.path.join(UPLOAD_DIR, fn)
        text = extract(path)
        truncated = len(text) > MAX_CHARS
        results.append({
            "file": fn,
            "sizeBytes": os.path.getsize(path),
            "chars": len(text),
            "truncated": truncated,
            "text": text[:MAX_CHARS],
        })
    print(json.dumps({"ok": True, "files": results}))
except Exception as e:
    print(json.dumps({"ok": False, "error": type(e).__name__ + ": " + str(e)}))
`.trim();

// ---------------------------------------------------------------------------
// Capability 1: processFile — Telegram attachment → sandbox → extracted text
// ---------------------------------------------------------------------------

export async function processTelegramFile(
  fileId: string,
  hints?: { fileName?: string; mimeType?: string }
): Promise<
  | { ok: true; file: ExtractedFile }
  | { ok: false; error: string }
> {
  const { bytes, file } = await downloadTelegramFile(fileId);
  const displayName = hints?.fileName ?? file.fileName;

  const sandbox = await createSandbox('python', 'ai-agent-file-processor');
  try {
    await sandbox.fs.uploadFile(bytes, `${UPLOAD_DIR}/${displayName}`, 120);
    const extraction = await extractFilesFromUploadDir(sandbox);
    if (!extraction.ok || !extraction.files?.length) {
      return { ok: false, error: extraction.error ?? 'Extraction returned no files.' };
    }
    return { ok: true, file: extraction.files[0]! };
  } finally {
    await sandbox.delete(60, true);
  }
}

export const processFileTool = tool({
  description: `Read a file the user attached in Telegram. Call this when a message contains an attachment reference like [document attached: ... file_id=...] or [image attached: ... file_id=...].
Extracts text from PDF, Word (.docx), Excel (.xlsx/.xls), CSV, and plain text/code files; runs OCR (tesseract) on images. Voice/audio/video cannot be transcribed.
Pass the exact file_id from the attachment reference.`,
  inputSchema: z.object({
    fileId: z
      .string()
      .describe('Telegram file_id from the attachment reference, e.g. BQACAgIA…'),
    fileName: z
      .string()
      .optional()
      .describe('File name from the attachment reference, if present.'),
    mimeType: z
      .string()
      .optional()
      .describe('MIME type from the attachment reference, if present.'),
  }),
  execute: async ({ fileId, fileName, mimeType }) => {
    try {
      const result = await processTelegramFile(fileId, { fileName, mimeType });
      if (!result.ok) return { ok: false, error: result.error };
      const f = result.file;
      return {
        ok: true,
        fileName: f.file,
        sizeBytes: f.sizeBytes,
        truncated: f.truncated,
        chars: f.chars,
        content: f.text,
        note: f.truncated
          ? `Content truncated to ${MAX_EXTRACT_CHARS} characters.`
          : undefined,
      };
    } catch (error) {
      console.error('processFile tool error:', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown file processing error',
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Capability 2: runCode — arbitrary Python/TypeScript in the sandbox
// ---------------------------------------------------------------------------

export interface RunCodeResult {
  exitCode: number;
  output: string;
  truncated: boolean;
}

export async function runSandboxCode(params: {
  code: string;
  language: 'python' | 'typescript';
  fileId?: string;
  fileName?: string;
}): Promise<RunCodeResult> {
  const { code, language, fileId, fileName } = params;

  const sandbox = await createSandbox(language, 'ai-agent-code-runner');
  try {
    if (fileId) {
      const { bytes, file } = await downloadTelegramFile(fileId);
      const displayName = fileName ?? file.fileName;
      await sandbox.fs.uploadFile(bytes, `${UPLOAD_DIR}/${displayName}`, 120);
    }

    // Write the code to a file and execute it with stderr merged into stdout
    // (ExecuteResponse only captures stdout; 2>&1 keeps error messages visible).
    const scriptPath =
      language === 'python' ? '/home/daytona/code.py' : '/home/daytona/code.ts';
    const cmd =
      language === 'python'
        ? `python3 ${scriptPath} 2>&1`
        : `node ${scriptPath} 2>&1`;

    await sandbox.fs.uploadFile(Buffer.from(code, 'utf8'), scriptPath, 60);
    const res = await sandbox.process.executeCommand(cmd, undefined, undefined, 300);
    const output = res.result ?? '';
    return {
      exitCode: res.exitCode,
      output: output.length > MAX_RUN_OUTPUT_CHARS
        ? output.slice(0, MAX_RUN_OUTPUT_CHARS)
        : output,
      truncated: output.length > MAX_RUN_OUTPUT_CHARS,
    };
  } finally {
    await sandbox.delete(60, true);
  }
}

export const runCodeTool = tool({
  description: `Run code in a secure cloud sandbox (full Linux computer with its own filesystem) to analyze attached files, crunch data, or compute something.
Available when: the user asks for calculations/analysis on an attached file, or asks the agent to run/verify code.
The sandbox has network access to package registries (pip for Python, npm for Node).
If a fileId is provided, the file is uploaded to ${UPLOAD_DIR}/ under its original name — open it from there.`,
  inputSchema: z.object({
    code: z.string().describe('The complete, self-contained program to run.'),
    language: z
      .enum(['python', 'typescript'])
      .default('python')
      .describe('Which runtime to execute the code in. Python is best for data work.'),
    fileId: z
      .string()
      .optional()
      .describe('Telegram file_id to upload into the sandbox, from an attachment reference.'),
    fileName: z
      .string()
      .optional()
      .describe('Original file name, if known, so the upload keeps it.'),
  }),
  execute: async ({ code, language, fileId, fileName }) => {
    try {
      const result = await runSandboxCode({ code, language, fileId, fileName });
      return {
        ok: result.exitCode === 0,
        exitCode: result.exitCode,
        output: result.output,
        note: result.truncated
          ? `Output truncated to ${MAX_RUN_OUTPUT_CHARS} characters.`
          : undefined,
      };
    } catch (error) {
      console.error('runCode tool error:', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown sandbox error',
      };
    }
  },
});
