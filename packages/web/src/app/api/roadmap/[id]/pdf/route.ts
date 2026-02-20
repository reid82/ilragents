import { NextRequest } from 'next/server';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../../.env') });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return new Response(
      JSON.stringify({ error: 'Roadmap ID is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { getSupabaseClient } = await import('@/lib/supabase');
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('roadmaps')
      .select('id, status, report_markdown, report_data, profile_snapshot, created_at')
      .eq('id', id)
      .single();

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: 'Roadmap not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (data.status !== 'completed' || !data.report_markdown) {
      return new Response(
        JSON.stringify({ error: 'Roadmap not yet completed' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const ReactPDF = await import('@react-pdf/renderer');
    const { createElement } = await import('react');
    const { RoadmapPdfDocument } = await import('@/components/pdf/roadmap-pdf-document');

    const profileSnapshot = data.profile_snapshot as Record<string, unknown>;
    const firstName = (profileSnapshot?.personal as Record<string, unknown>)?.firstName as string || 'Client';

    const doc = createElement(RoadmapPdfDocument, {
      markdown: data.report_markdown,
      clientName: firstName,
      generatedDate: new Date(data.created_at).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await ReactPDF.renderToBuffer(doc as any);

    const safeName = firstName.replace(/[^a-zA-Z0-9]/g, '-');
    const filename = `ILRE-Roadmap-${safeName}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate PDF' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
