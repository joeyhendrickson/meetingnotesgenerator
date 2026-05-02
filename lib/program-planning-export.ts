import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import ExcelJS from 'exceljs';

export type QuestionnaireRecord = Record<string, string>;

function linesToParagraphs(text: string): Paragraph[] {
  const raw = (text || '').trim();
  if (!raw) {
    return [new Paragraph({ children: [new TextRun({ text: ' ' })] })];
  }
  return raw.split(/\r?\n/).map(
    (line) =>
      new Paragraph({
        children: [new TextRun({ text: line.length > 0 ? line.slice(0, 32000) : ' ' })],
      })
  );
}

function h1(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, bold: true })],
  });
}

function h2(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true })],
  });
}

function addQuestionnaireSection(children: Paragraph[], questionnaire: QuestionnaireRecord) {
  children.push(h2('Questionnaire inputs'));
  let any = false;
  for (const [k, v] of Object.entries(questionnaire)) {
    const s = String(v || '').trim();
    if (!s) continue;
    any = true;
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${k}: `, bold: true }),
          new TextRun({ text: s.slice(0, 32000) }),
        ],
      })
    );
  }
  if (!any) {
    children.push(new Paragraph({ children: [new TextRun({ text: '(No questionnaire fields filled.)' })] }));
  }
}

export async function buildPlanningPackDocx(
  synth: Record<string, unknown>,
  questionnaire: QuestionnaireRecord,
  title: string
): Promise<Buffer> {
  const children: Paragraph[] = [];
  children.push(h1('Program planning pack'));
  children.push(
    new Paragraph({
      children: [new TextRun({ text: title || 'Program', italics: true })],
    })
  );
  addQuestionnaireSection(children, questionnaire);

  const addBlock = (heading: string, body: unknown) => {
    children.push(h2(heading));
    const str = typeof body === 'string' ? body : JSON.stringify(body ?? '', null, 2);
    children.push(...linesToParagraphs(str));
  };

  addBlock('Roles and responsibilities', synth.rolesResponsibilitiesMarkdown);
  addBlock('Vendor dual-path options', synth.vendorDualApproachMarkdown);
  addBlock('Planning parameters (synthesized)', synth.planningParametersMarkdown);
  addBlock('Timeline — Mermaid Gantt (paste into mermaid.live; see Excel “Gantt_Mermaid” sheet)', synth.ganttMermaid);
  if (Array.isArray(synth.phaseOutline)) {
    addBlock('Phase outline (structured)', JSON.stringify(synth.phaseOutline, null, 2));
  }

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

export async function buildMasterPlanDocx(
  master: Record<string, unknown>,
  questionnaire: QuestionnaireRecord,
  title: string
): Promise<Buffer> {
  const children: Paragraph[] = [];
  children.push(h1('Program Master Plan'));
  children.push(
    new Paragraph({
      children: [new TextRun({ text: title || 'Program', italics: true })],
    })
  );
  addQuestionnaireSection(children, questionnaire);

  children.push(h2('Executive summary'));
  children.push(...linesToParagraphs(typeof master.executiveSummary === 'string' ? master.executiveSummary : ''));

  children.push(h2('Budget overview'));
  children.push(...linesToParagraphs(typeof master.budgetOverview === 'string' ? master.budgetOverview : ''));

  children.push(h2('Program-wide risks'));
  children.push(...linesToParagraphs(typeof master.programWideRisks === 'string' ? master.programWideRisks : ''));

  if (Array.isArray(master.phases)) {
    children.push(h2('Per-phase analysis'));
    for (const ph of master.phases as Record<string, string>[]) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: ph.phase || 'Phase', bold: true })],
        })
      );
      const bits = ['Benefits', 'Challenges', 'Risks', 'Budget considerations'] as const;
      for (const b of bits) {
        const key = b === 'Budget considerations' ? 'budgetConsiderations' : b.toLowerCase();
        const val = ph[key] || '';
        if (!val) continue;
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `${b}: `, bold: true }), new TextRun({ text: String(val).slice(0, 32000) })],
          })
        );
      }
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

function addTextSheet(wb: ExcelJS.Workbook, name: string, text: string, colWidth = 100) {
  const ws = wb.addWorksheet(name.substring(0, 31));
  ws.getColumn(1).width = colWidth;
  const lines = (text || '').split(/\r?\n/);
  if (lines.length === 0) ws.addRow(['']);
  else lines.forEach((line) => ws.addRow([line]));
}

export async function buildPlanningPackXlsx(
  synth: Record<string, unknown>,
  questionnaire: QuestionnaireRecord
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const q = wb.addWorksheet('Parameters');
  q.columns = [{ width: 28 }, { width: 72 }];
  q.addRow(['Field', 'Value']);
  for (const [k, v] of Object.entries(questionnaire)) {
    q.addRow([k, String(v ?? '')]);
  }

  addTextSheet(wb, 'Roles_RACI', String(synth.rolesResponsibilitiesMarkdown || ''));
  addTextSheet(wb, 'Vendor_paths', String(synth.vendorDualApproachMarkdown || ''));
  addTextSheet(wb, 'Planning_params', String(synth.planningParametersMarkdown || ''));
  addTextSheet(wb, 'Gantt_Mermaid', String(synth.ganttMermaid || ''), 120);

  const ph = wb.addWorksheet('Phase_outline');
  ph.columns = [{ width: 10 }, { width: 28 }, { width: 50 }, { width: 20 }];
  ph.addRow(['id', 'title', 'summary', 'weeksHint']);
  if (Array.isArray(synth.phaseOutline)) {
    for (const row of synth.phaseOutline as Record<string, string>[]) {
      ph.addRow([row.id ?? '', row.title ?? '', row.summary ?? '', row.weeksHint ?? '']);
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function buildMasterPlanXlsx(
  master: Record<string, unknown>,
  questionnaire: QuestionnaireRecord
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const q = wb.addWorksheet('Parameters');
  q.columns = [{ width: 28 }, { width: 72 }];
  q.addRow(['Field', 'Value']);
  for (const [k, v] of Object.entries(questionnaire)) {
    q.addRow([k, String(v ?? '')]);
  }

  addTextSheet(wb, 'Executive_summary', String(master.executiveSummary || ''));
  addTextSheet(wb, 'Budget_overview', String(master.budgetOverview || ''));
  addTextSheet(wb, 'Program_risks', String(master.programWideRisks || ''));

  const ps = wb.addWorksheet('Phase_analysis');
  ps.columns = [{ width: 22 }, { width: 36 }, { width: 36 }, { width: 36 }, { width: 36 }];
  ps.addRow(['Phase', 'Benefits', 'Challenges', 'Risks', 'Budget considerations']);
  if (Array.isArray(master.phases)) {
    for (const ph of master.phases as Record<string, string>[]) {
      ps.addRow([
        ph.phase ?? '',
        ph.benefits ?? '',
        ph.challenges ?? '',
        ph.risks ?? '',
        ph.budgetConsiderations ?? '',
      ]);
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
