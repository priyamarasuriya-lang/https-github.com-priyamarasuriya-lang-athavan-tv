export type ColumnType = 'text' | 'number' | 'duration' | 'datetime';

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
  width?: number;
}

export type Cell = string | number | null;

export interface Report {
  key: string;
  title: string;
  station: string;
  period: string;
  channel: string;
  /** Zone used to render datetime columns. */
  timeZone: string;
  generatedAt: Date;
  columns: ReportColumn[];
  rows: Array<Record<string, Cell>>;
  totals?: Record<string, number>;
  notes?: string[];
  truncated?: boolean;
}

export const MAX_REPORT_ROWS = 50_000;
