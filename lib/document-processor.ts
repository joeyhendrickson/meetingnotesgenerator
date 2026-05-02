import { chatCompletion } from './openai';
import { PDFDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import WordExtractor from 'word-extractor';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Document, Packer, Paragraph, TextRun } from 'docx';
// Note: pdfkit may have issues in serverless - using simpler approach for PDFs

export interface DocumentTemplate {
  content: string;
  type: 'docx' | 'pdf' | 'txt';
}

function isPkZipBuffer(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b;
}

function stripOfficeXmlText(xml: string): string {
  return xml
    .replace(/<a:p[\s>]/gi, '\n')
    .replace(/<\/a:p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Detect Word .docx vs PowerPoint .pptx inside a ZIP (Office Open XML). */
async function extractFromOpenXmlOfficeZip(buffer: Buffer): Promise<string | null> {
  if (!isPkZipBuffer(buffer)) return null;
  const zip = await JSZip.loadAsync(buffer);
  if (zip.file('word/document.xml')) {
    return extractDocxWithMammoth(buffer);
  }
  const slideKeys = Object.keys(zip.files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
    .sort((a, b) => {
      const na = parseInt(/\d+/.exec(a)?.[0] || '0', 10);
      const nb = parseInt(/\d+/.exec(b)?.[0] || '0', 10);
      return na - nb;
    });
  if (slideKeys.length === 0 && !zip.file('ppt/presentation.xml')) {
    return null;
  }
  const keys = slideKeys.length > 0 ? slideKeys : [];
  if (keys.length === 0) {
    return '';
  }
  const parts: string[] = [];
  let n = 0;
  for (const key of keys) {
    const f = zip.file(key);
    if (!f) continue;
    const xml = await f.async('string');
    const text = stripOfficeXmlText(xml);
    if (text) {
      n += 1;
      parts.push(`Slide ${n}\n${text}`);
    }
  }
  return parts.join('\n\n---\n\n');
}

function isOleWordBinaryDoc(buf: Buffer): boolean {
  return (
    buf.length >= 4 &&
    buf[0] === 0xd0 &&
    buf[1] === 0xcf &&
    buf[2] === 0x11 &&
    buf[3] === 0xe0
  );
}

async function extractLegacyBinaryDoc(buffer: Buffer): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mng-doc-'));
  const filePath = path.join(dir, 'document.doc');
  try {
    await fs.writeFile(filePath, buffer);
    const extractor = new WordExtractor();
    const extracted = await extractor.extract(filePath);
    return extracted.getBody() || '';
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function extractDocxWithMammoth(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

export async function extractTextFromDocument(
  file: File | Buffer,
  mimeType: string,
  fileName?: string
): Promise<string> {
  let buffer: Buffer;

  if (file instanceof File) {
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else {
    buffer = file;
  }

  const nameLower = (file instanceof File ? file.name : fileName || '').toLowerCase();

  // Normalize mime type for matching
  const normalizedMimeType = mimeType.toLowerCase();
  
  if (normalizedMimeType.includes('pdf') || normalizedMimeType === 'application/pdf') {
    try {
      const data = await pdfParse(buffer);
      return data.text || '';
    } catch (error) {
      console.error('Error parsing PDF:', error);
      throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else if (
    normalizedMimeType.includes('presentationml') ||
    normalizedMimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    nameLower.endsWith('.pptx')
  ) {
    try {
      const fromZip = await extractFromOpenXmlOfficeZip(buffer);
      if (fromZip === null || fromZip === '') {
        throw new Error('No slide text found');
      }
      return fromZip;
    } catch (error) {
      console.error('Error parsing PPTX:', error);
      throw new Error(`Failed to parse PowerPoint (.pptx): ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else if (
    normalizedMimeType.includes('wordprocessingml') ||
    normalizedMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    normalizedMimeType.endsWith('.docx') ||
    nameLower.endsWith('.docx')
  ) {
    try {
      const fromZip = await extractFromOpenXmlOfficeZip(buffer);
      if (fromZip !== null) return fromZip;
      return await extractDocxWithMammoth(buffer);
    } catch (error) {
      console.error('Error parsing DOCX:', error);
      throw new Error(`Failed to parse DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else if (
    normalizedMimeType === 'application/msword' ||
    normalizedMimeType.includes('msword') ||
    nameLower.endsWith('.doc') ||
    isOleWordBinaryDoc(buffer)
  ) {
    try {
      return await extractLegacyBinaryDoc(buffer);
    } catch (error) {
      console.error('Error parsing legacy .doc:', error);
      throw new Error(`Failed to parse Word .doc file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else if (
    normalizedMimeType.includes('text') || 
    normalizedMimeType === 'text/plain' ||
    normalizedMimeType.endsWith('.txt')
  ) {
    return buffer.toString('utf-8');
  } else if (
    normalizedMimeType.includes('spreadsheet') ||
    normalizedMimeType.includes('excel') ||
    normalizedMimeType.includes('sheet')
  ) {
    // For spreadsheets, try to extract as text (basic)
    return buffer.toString('utf-8');
  }

  if (isPkZipBuffer(buffer)) {
    try {
      const routed = await extractFromOpenXmlOfficeZip(buffer);
      if (routed !== null) return routed;
    } catch (error) {
      console.error('Error parsing Office Open XML zip:', error);
    }
  }
  if (isOleWordBinaryDoc(buffer)) {
    try {
      return await extractLegacyBinaryDoc(buffer);
    } catch (error) {
      console.error('Error parsing file as legacy .doc:', error);
    }
  }

  // If we can't determine the type, try to extract as text
  console.warn(`Unknown mime type: ${mimeType}, attempting to extract as text`);
  try {
    return buffer.toString('utf-8');
  } catch (error) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

// Helper function to analyze template structure
function analyzeTemplateStructure(templateContent: string): {
  sections: Array<{ title: string; content: string; startIndex: number; endIndex: number }>;
  hasPlaceholders: boolean;
  structureType: 'structured' | 'simple';
} {
  const lines = templateContent.split('\n');
  const sections: Array<{ title: string; content: string; startIndex: number; endIndex: number }> = [];
  let currentSection: { title: string; content: string; startIndex: number; endIndex: number } | null = null;
  
  // Detect headings (lines that are short, uppercase, or have special formatting)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detect potential headings
    const isHeading = 
      (line.length < 100 && line.length > 0) &&
      (
        line === line.toUpperCase() ||
        /^[#]{1,6}\s/.test(line) ||
        /^[A-Z][^.!?]*:?\s*$/.test(line) && line.length < 80 ||
        /^[0-9]+\.\s+[A-Z]/.test(line) ||
        /^[IVX]+\.\s+[A-Z]/.test(line)
      );
    
    if (isHeading && line.length > 0) {
      // Save previous section
      if (currentSection) {
        currentSection.endIndex = i - 1;
        sections.push(currentSection);
      }
      // Start new section
      currentSection = {
        title: line,
        content: '',
        startIndex: i,
        endIndex: i,
      };
    } else if (currentSection && line.length > 0) {
      currentSection.content += (currentSection.content ? '\n' : '') + line;
    }
  }
  
  // Add final section
  if (currentSection) {
    currentSection.endIndex = lines.length - 1;
    sections.push(currentSection);
  }
  
  // If no clear sections found, treat entire document as one section
  if (sections.length === 0) {
    sections.push({
      title: 'Document',
      content: templateContent,
      startIndex: 0,
      endIndex: lines.length - 1,
    });
  }
  
  // Check for placeholders
  const placeholderRegex = /\{\{([^}]+)\}\}|\[([^\]]+)\]/g;
  const hasPlaceholders = placeholderRegex.test(templateContent);
  
  return {
    sections,
    hasPlaceholders,
    structureType: sections.length > 1 ? 'structured' : 'simple',
  };
}

export async function fillDocumentTemplate(
  templateContent: string,
  templateType: 'docx' | 'pdf' | 'txt',
  projectPrompt?: string
): Promise<{ content: string; filledContent: string }> {
  // Extract placeholders from template (e.g., {{placeholder}} or [PLACEHOLDER])
  const placeholderRegex = /\{\{([^}]+)\}\}|\[([^\]]+)\]/g;
  const placeholders: string[] = [];
  let match;

  while ((match = placeholderRegex.exec(templateContent)) !== null) {
    const placeholder = match[1] || match[2];
    if (!placeholders.includes(placeholder)) {
      placeholders.push(placeholder);
    }
  }

  // Analyze template structure
  const structure = analyzeTemplateStructure(templateContent);

  // If no explicit placeholders found, use AI to intelligently fill the document
  if (placeholders.length === 0 && projectPrompt) {
    // Build a very explicit prompt that emphasizes structure preservation
    // Include the template structure analysis to help GPT understand what to preserve
    const structureInfo = structure.sections.length > 1 
      ? `\n\nTemplate Structure Analysis:\nThe template has ${structure.sections.length} sections:\n${structure.sections.map((s, i) => `${i + 1}. ${s.title}`).join('\n')}\n\nYou must preserve all these sections and their headings exactly as they appear.`
      : '\n\nThe template structure must be preserved exactly as provided.';
    
    const structurePreservationPrompt = `You are filling in a project management document template. Your task is to COMPLETE the template by adding relevant content while PRESERVING its exact structure.

CRITICAL RULES - YOU MUST FOLLOW THESE:
1. PRESERVE the EXACT structure, headings, sections, formatting, and layout
2. Do NOT rewrite, reorganize, or restructure the template
3. Keep ALL headings, bullet points, numbered lists, and formatting exactly as they appear
4. Fill in blank areas, incomplete sections, or areas marked for content
5. Add content that is relevant to the project description
6. The output must look like the original template but with filled-in information
7. If a section is empty or has placeholder text, fill it with relevant content
8. Maintain the same line breaks, spacing, and formatting style

ORIGINAL TEMPLATE (PRESERVE THIS EXACT STRUCTURE):
---
${templateContent}
---

PROJECT DESCRIPTION:
${projectPrompt}
${structureInfo}

TASK: Fill in the template above while maintaining its EXACT structure. Return the complete document with all sections filled in, but with the same headings, formatting, and organization as the original template.`;
    
    // Use GPT to analyze template structure and fill it based on project prompt
    // Use lower temperature for more consistent, structure-preserving output
    const filledContent = await chatCompletion(
      [
        {
          role: 'system',
          content: 'You are a document template completion assistant. Your ONLY job is to fill in templates while preserving their EXACT structure, headings, formatting, sections, and organization. You must NEVER rewrite, reorganize, or restructure templates. You only add relevant content to complete the template.',
        },
        {
          role: 'user',
          content: structurePreservationPrompt,
        },
      ],
      undefined,
      { temperature: 0.3, preserveSystemMessage: true } // Lower temperature for more deterministic output
    );

    return {
      content: templateContent,
      filledContent: filledContent.trim(),
    };
  }

  // For each placeholder, find relevant context and generate content
  // Build a comprehensive query that combines placeholder and project context
  const replacements: Record<string, string> = {};

  for (const placeholder of placeholders) {
    // Create a query that combines the placeholder with project context
    const query = projectPrompt 
      ? `${placeholder} ${projectPrompt}`
      : placeholder;
    
    const systemContext = projectPrompt
      ? `Project Context: ${projectPrompt}`
      : 'No additional reference documents; use clear, professional project-management language.';

    // Enhanced prompt that considers template context
    const placeholderContext = `Template section context: ${structure.sections.find(s => 
      s.content.includes(`{{${placeholder}}}`) || s.content.includes(`[${placeholder}]`)
    )?.title || 'General document'}`;

    const generatedContent = await chatCompletion(
      [
        {
          role: 'system',
          content: 'You are filling in a document template. Generate content that fits naturally into the template structure and maintains the document\'s tone and formatting.',
        },
        {
          role: 'user',
          content: projectPrompt
            ? `Fill in the placeholder "${placeholder}" in a project management document.\n\n${placeholderContext}\n\n${systemContext}\n\nProvide content that:\n- Fits naturally into the document structure\n- Aligns with the project goals: ${projectPrompt}\n- Is specific, professional, and relevant\n- Matches the tone and style of project management documents\n- Is concise but informative`
            : `Fill in the placeholder "${placeholder}" with relevant, specific information about ADA Compliance.\n\n${placeholderContext}\n\n${systemContext}\n\nProvide a concise, professional response that fits naturally into the project management document.`,
        },
      ],
      systemContext,
      { temperature: 0.5, preserveSystemMessage: true } // Lower temperature for more consistent placeholder filling
    );

    replacements[placeholder] = generatedContent.trim();
  }

  // Replace placeholders in template while preserving structure
  let result = templateContent;
  for (const [placeholder, replacement] of Object.entries(replacements)) {
    // Use a more careful replacement that preserves surrounding formatting
    const placeholderPattern = new RegExp(
      `(\\{\\{${placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}|\\[${placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\])`,
      'g'
    );
    
    result = result.replace(placeholderPattern, (match) => {
      // Preserve any whitespace/formatting around the placeholder
      return replacement;
    });
  }

  return {
    content: templateContent,
    filledContent: result,
  };
}

export async function generateDocument(
  filledContent: string,
  type: 'docx' | 'pdf' | 'txt' | 'html',
  filename: string
): Promise<Buffer> {
  if (type === 'docx') {
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: filledContent
            .split('\n\n')
            .map(
              (paragraph) =>
                new Paragraph({
                  children: [
                    new TextRun({
                      text: paragraph,
                    }),
                  ],
                })
            ),
        },
      ],
    });

    return await Packer.toBuffer(doc);
  } else if (type === 'pdf') {
    // For PDF generation, we'll use pdf-lib with a simple text approach
    // In production, you may want to use a more robust PDF generation library
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // US Letter size
    
    // Note: pdf-lib requires embedding fonts for text rendering
    // For simplicity, we'll return the text content as a base64 encoded string
    // that can be converted to PDF on the client side, or use a service
    // For now, return as text file with .pdf extension suggestion
    // In production, consider using a PDF generation service or library with font support
    return Buffer.from(filledContent, 'utf-8');
  } else {
    // Plain text or HTML
    if (type === 'html') {
      // Generate HTML document with proper structure
      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${filename}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            line-height: 1.6;
            color: #333;
        }
        h1, h2, h3 {
            color: #1a1a1a;
            margin-top: 2em;
        }
        p {
            margin-bottom: 1em;
        }
        pre {
            background: #f5f5f5;
            padding: 1em;
            border-radius: 4px;
            overflow-x: auto;
        }
    </style>
</head>
<body>
${filledContent.split('\n\n').map(para => {
  if (para.trim().startsWith('# ')) {
    return `<h1>${para.replace(/^# /, '')}</h1>`;
  } else if (para.trim().startsWith('## ')) {
    return `<h2>${para.replace(/^## /, '')}</h2>`;
  } else if (para.trim().startsWith('### ')) {
    return `<h3>${para.replace(/^### /, '')}</h3>`;
  } else {
    return `<p>${para.replace(/\n/g, '<br>')}</p>`;
  }
}).join('\n')}
</body>
</html>`;
      return Buffer.from(htmlContent, 'utf-8');
    }
    
    // Plain text
    return Buffer.from(filledContent, 'utf-8');
  }
}

