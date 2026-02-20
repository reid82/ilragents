import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';

// Register Inter font (TTF format for @react-pdf compatibility)
Font.register({
  family: 'Inter',
  fonts: [
    {
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZFhjQ.ttf',
      fontWeight: 400,
    },
    {
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYAZFhjQ.ttf',
      fontWeight: 600,
    },
    {
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZFhjQ.ttf',
      fontWeight: 700,
    },
  ],
});

Font.registerHyphenationCallback((word: string) => [word]);

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Inter',
    fontSize: 11,
    lineHeight: 1.6,
    color: '#1a1a2e',
    flexDirection: 'column',
  },
  header: {
    textAlign: 'center',
    paddingBottom: 20,
    borderBottomWidth: 3,
    borderBottomColor: '#e80909',
    marginBottom: 30,
  },
  logo: {
    fontSize: 12,
    color: '#e80909',
    textTransform: 'uppercase',
    letterSpacing: 3,
    marginBottom: 8,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: 8,
  },
  clientName: {
    fontSize: 20,
    fontWeight: 600,
    color: '#e80909',
    marginBottom: 4,
  },
  meta: {
    fontSize: 10,
    color: '#666',
  },
  h1: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1a1a2e',
    marginTop: 25,
    marginBottom: 15,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  h2: {
    fontSize: 18,
    fontWeight: 700,
    color: '#1a1a2e',
    marginTop: 20,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  h3: {
    fontSize: 14,
    fontWeight: 600,
    color: '#1a1a2e',
    marginTop: 15,
    marginBottom: 8,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  h4: {
    fontSize: 12,
    fontWeight: 600,
    color: '#1a1a2e',
    marginTop: 12,
    marginBottom: 6,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  paragraph: {
    marginBottom: 10,
    textAlign: 'justify',
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  bold: {
    fontWeight: 600,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingLeft: 10,
  },
  bullet: {
    width: 15,
    color: '#e80909',
  },
  listText: {
    flex: 1,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  table: {
    marginVertical: 15,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tableHeader: {
    backgroundColor: '#f8f9fa',
    fontWeight: 600,
  },
  tableCell: {
    flex: 1,
    padding: 8,
    fontSize: 10,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    marginVertical: 20,
  },
  contentWrapper: {
    flexDirection: 'column',
    flexShrink: 1,
    width: '100%',
  },
  footer: {
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    textAlign: 'center',
    fontSize: 9,
    color: '#666',
  },
});

interface RoadmapPdfProps {
  markdown: string;
  clientName: string;
  generatedDate: string;
}

function sanitizeText(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^\x00-\xFF\u20AC\u00A3\u00A5\u00A9\u00AE\u2122]/g, '');
}

function stripBold(text: string): string {
  return text.replace(/\*\*/g, '');
}

function parseTableRow(row: string): string[] {
  return row
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell, index, arr) => {
      if (cell === '' && (index === 0 || index === arr.length - 1)) return false;
      return true;
    });
}

function isTableSeparator(line: string): boolean {
  return /^\|?\s*:?-+:?\s*\|/.test(line);
}

function parseMarkdown(markdown: string): React.ReactNode[] {
  const sanitized = sanitizeText(markdown);
  const lines = sanitized.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let tableState: { headers: string[]; rows: string[][] } | null = null;

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <View key={`list-${elements.length}`} style={{ marginVertical: 8 }}>
          {currentList.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={styles.bullet}>
                {listType === 'ol' ? `${i + 1}.` : '-'}
              </Text>
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>
      );
      currentList = [];
      listType = null;
    }
  };

  const flushTable = () => {
    if (tableState && tableState.headers.length > 0) {
      elements.push(
        <View key={`table-${elements.length}`} style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            {tableState.headers.map((header, idx) => (
              <Text key={idx} style={styles.tableCell}>
                {stripBold(header)}
              </Text>
            ))}
          </View>
          {tableState.rows.map((row, rowIdx) => (
            <View key={rowIdx} style={styles.tableRow}>
              {row.map((cell, cellIdx) => (
                <Text key={cellIdx} style={styles.tableCell}>
                  {stripBold(cell)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
      tableState = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Table rows
    if (line.trim().startsWith('|')) {
      if (isTableSeparator(line)) continue;
      flushList();
      const cells = parseTableRow(line);
      if (!tableState) {
        tableState = { headers: cells, rows: [] };
      } else {
        tableState.rows.push(cells);
      }
      continue;
    }

    if (tableState) flushTable();

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      flushList();
      elements.push(<View key={`hr-${i}`} style={styles.hr} />);
      continue;
    }

    // Headers
    if (line.startsWith('#### ')) {
      flushList();
      elements.push(<Text key={i} style={styles.h4}>{stripBold(line.slice(5))}</Text>);
      continue;
    }
    if (line.startsWith('### ')) {
      flushList();
      elements.push(<Text key={i} style={styles.h3}>{stripBold(line.slice(4))}</Text>);
      continue;
    }
    if (line.startsWith('## ')) {
      flushList();
      elements.push(<Text key={i} style={styles.h2}>{stripBold(line.slice(3))}</Text>);
      continue;
    }
    if (line.startsWith('# ')) {
      flushList();
      elements.push(<Text key={i} style={styles.h1}>{stripBold(line.slice(2))}</Text>);
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (listType !== 'ul') { flushList(); listType = 'ul'; }
      currentList.push(stripBold(ulMatch[1]));
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (listType !== 'ol') { flushList(); listType = 'ol'; }
      currentList.push(stripBold(olMatch[1]));
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      flushList();
      continue;
    }

    // Bold lines (e.g., **Prepared for:** ...)
    if (line.startsWith('**')) {
      flushList();
      elements.push(
        <Text key={i} style={[styles.paragraph, styles.bold]}>
          {stripBold(line)}
        </Text>
      );
      continue;
    }

    // Italic / disclaimer lines
    if (line.startsWith('*') && line.endsWith('*')) {
      flushList();
      elements.push(
        <Text key={i} style={[styles.paragraph, { fontSize: 9, color: '#666' }]}>
          {line.replace(/^\*|\*$/g, '')}
        </Text>
      );
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(<Text key={i} style={styles.paragraph}>{stripBold(line)}</Text>);
  }

  flushList();
  flushTable();
  return elements;
}

export function RoadmapPdfDocument({ markdown, clientName, generatedDate }: RoadmapPdfProps) {
  const safeName = sanitizeText(clientName);
  const content = parseMarkdown(markdown);

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.logo}>I Love Real Estate</Text>
          <Text style={styles.pageTitle}>Property Investment Roadmap</Text>
          <Text style={styles.clientName}>{safeName}</Text>
          <Text style={styles.meta}>Prepared on {generatedDate}</Text>
        </View>

        <View style={styles.contentWrapper}>{content}</View>

        <View style={styles.footer} fixed>
          <Text>Confidential - Prepared exclusively for {safeName}</Text>
          <Text style={{ marginTop: 4, fontSize: 8, color: '#999' }}>
            This report is AI-generated and for general information only. It does not constitute financial advice.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
