import { NextRequest, NextResponse } from 'next/server';
import {
  buildMasterPlanDocx,
  buildMasterPlanXlsx,
  buildPlanningPackDocx,
  buildPlanningPackXlsx,
} from '@/lib/program-planning-export';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const format = body.format === 'xlsx' ? 'xlsx' : 'docx';
    const exportKind = body.exportKind === 'master-plan' ? 'master-plan' : 'planning-pack';
    const synthData =
      body.synthData && typeof body.synthData === 'object' ? (body.synthData as Record<string, unknown>) : null;
    const masterData =
      body.masterData && typeof body.masterData === 'object' ? (body.masterData as Record<string, unknown>) : null;
    const questionnaire =
      body.questionnaire && typeof body.questionnaire === 'object'
        ? (body.questionnaire as Record<string, string>)
        : {};
    const programTitle = typeof body.programTitle === 'string' ? body.programTitle : questionnaire.programName || '';

    let buffer: Buffer;
    let filename: string;

    if (exportKind === 'planning-pack') {
      if (!synthData) {
        return NextResponse.json({ error: 'synthData is required for planning-pack export.' }, { status: 400 });
      }
      if (format === 'docx') {
        buffer = await buildPlanningPackDocx(synthData, questionnaire, programTitle);
        filename = 'program-planning-pack.docx';
      } else {
        buffer = await buildPlanningPackXlsx(synthData, questionnaire);
        filename = 'program-planning-pack.xlsx';
      }
    } else {
      if (!masterData) {
        return NextResponse.json({ error: 'masterData is required for master-plan export.' }, { status: 400 });
      }
      if (format === 'docx') {
        buffer = await buildMasterPlanDocx(masterData, questionnaire, programTitle);
        filename = 'program-master-plan.docx';
      } else {
        buffer = await buildMasterPlanXlsx(masterData, questionnaire);
        filename = 'program-master-plan.xlsx';
      }
    }

    const mime =
      format === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('program-planning export:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Export failed' },
      { status: 500 }
    );
  }
}
