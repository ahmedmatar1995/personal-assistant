/**
 * Daytona file-parsing pipeline test.
 *
 * Verifies the same extraction path the agent's processFile tool uses,
 * minus the Telegram download leg:
 *   1. Creates a Python sandbox.
 *   2. Generates real test files inside it (PDF, DOCX, XLSX, CSV, PNG with text).
 *   3. Runs extractFilesFromUploadDir() — the exact function processFile uses.
 *   4. Prints what came back and deletes the sandbox.
 *
 * Run with: bun scripts/daytona-parse-test.ts
 */

import { Daytona } from '@daytona/sdk';
import { extractFilesFromUploadDir } from '../src/trigger/tools/daytona-file.ts';

const UPLOAD_DIR = '/home/daytona/upload';

// Generates all test files. Pillow draws text on a PNG (for the OCR path),
// reportlab makes a two-line PDF, python-docx/openpyxl the office formats.
const GENERATOR_SCRIPT = `
import os, random, string
from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
import docx
import openpyxl

os.makedirs("${UPLOAD_DIR}", exist_ok=True)

# PDF
pdf = canvas.Canvas("${UPLOAD_DIR}/test.pdf", pagesize=A4)
pdf.drawString(72, 750, "Hello from a generated PDF.")
pdf.drawString(72, 730, "Second line: the extractor must find both.")
pdf.save()

# DOCX
d = docx.Document()
d.add_heading("Docx heading", level=1)
d.add_paragraph("This paragraph lives inside a Word document.")
d.save("${UPLOAD_DIR}/test.docx")

# XLSX
wb = openpyxl.Workbook()
ws = wb.active
ws.append(["month", "revenue"])
ws.append(["Jan", 1200])
ws.append(["Feb", 1350])
wb.save("${UPLOAD_DIR}/test.xlsx")

# CSV
with open("${UPLOAD_DIR}/test.csv", "w") as f:
    f.write("name,score\\n")
    f.write("ada,99\\n")
    f.write("grace,98\\n")

# PNG with visible text (OCR target) — default bitmap font is too small and
# aliases badly; Pillow >= 10.1 can render the default font at a real size.
from PIL import ImageFont
font = ImageFont.load_default(size=48)
img = Image.new("RGB", (900, 160), "white")
draw = ImageDraw.Draw(img)
draw.text((20, 50), "OCR CAN READ THIS", fill="black", font=font)
img.save("${UPLOAD_DIR}/test.png")

print("generated:", sorted(os.listdir("${UPLOAD_DIR}")))
`.trim();

async function main() {
  if (!process.env.DAYTONA_API_KEY) {
    console.error('DAYTONA_API_KEY is not set (add it to .env).');
    process.exit(1);
  }

  const daytona = new Daytona();
  console.log('Creating sandbox…');
  const sandbox = await daytona.create({
    language: 'python',
    name: `ai-agent-parse-test-${Date.now().toString(36)}`,
    labels: { project: 'ai-agent', purpose: 'parse-test' },
  });
  console.log(`Sandbox created: id=${sandbox.id}`);

  try {
    console.log('Installing file generators (reportlab, python-docx, openpyxl, pillow)…');
    const pip = await sandbox.process.executeCommand(
      'python3 -m pip install -q --no-input reportlab python-docx openpyxl pillow',
      undefined,
      undefined,
      300
    );
    if (pip.exitCode !== 0) {
      throw new Error(`pip install failed (${pip.exitCode}): ${pip.result.slice(0, 400)}`);
    }

    console.log('Generating test files inside the sandbox…');
    const gen = await sandbox.process.codeRun(GENERATOR_SCRIPT, undefined, 120);
    console.log(gen.result.trim());

    console.log('\nRunning extractFilesFromUploadDir() — the same function the agent tool uses…');
    const t0 = Date.now();
    const result = await extractFilesFromUploadDir(sandbox);
    console.log(`(extraction took ${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);

    if (!result.ok) {
      console.error('EXTRACTION FAILED:', result.error);
      process.exit(1);
    }

    let failures = 0;
    for (const f of result.files ?? []) {
      const expected: Record<string, string> = {
        'test.pdf': 'Hello from a generated PDF.',
        'test.docx': 'This paragraph lives inside a Word document.',
        'test.csv': 'grace,98',
        'test.png': 'OCR CAN READ THIS',
        'test.xlsx': 'Feb,1350',
      };
      const mustContain = expected[f.file] ?? '';
      const pass = mustContain === '' || f.text.includes(mustContain);
      if (!pass) failures++;
      console.log(
        `${pass ? '✅' : '❌'} ${f.file} (${f.chars} chars${f.truncated ? ', truncated' : ''})` +
          `${mustContain ? ` — looking for "${mustContain}"` : ''}`
      );
      console.log(`   first 120 chars: ${JSON.stringify(f.text.slice(0, 120))}`);
    }

    if (failures > 0) {
      console.error(`\n${failures} file(s) FAILED the content check.`);
      process.exit(1);
    }
    console.log('\nAll files parsed with the expected content. Pipeline verified.');
  } finally {
    console.log('Deleting sandbox…');
    await sandbox.delete(60, true);
    console.log('Sandbox deleted.');
  }
}

main().catch((error) => {
  console.error('Parse test failed:', error);
  process.exit(1);
});
