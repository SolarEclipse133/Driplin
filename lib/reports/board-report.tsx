/**
 * The board-ready compliance report PDF, built with @react-pdf/renderer
 * (chosen because it renders declarative React components to PDF inside
 * a serverless function — no headless browser needed on Vercel).
 *
 * One page (flowing to more if the event log is long): header,
 * summary stats, activity log, and the audit footer carrying the
 * verified drought stage and its official source link.
 */

import {
  Document,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { STAGE_NAMES } from "@/lib/rules/watering-config";
import type { DroughtStage } from "@/lib/rules/watering-config";

export interface ReportData {
  orgName: string;
  property: {
    name: string;
    address: string;
    unitCount: number;
  };
  period: { from: string; to: string }; // ISO dates
  stats: {
    checksRun: number;
    violationsFound: number;
    autoCorrections: number;
    manualFixesFlagged: number;
    estimatedGallonsSaved: number;
    currentStatus: string; // e.g. "Compliant"
  };
  events: {
    date: string;
    type: string;
    summary: string;
  }[];
  stage: {
    stage: DroughtStage;
    confirmedAt: string | null;
    sourceLink: string | null;
  };
  generatedAt: string;
}

const styles = StyleSheet.create({
  page: {
    padding: 48,
    paddingBottom: 96,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1e293b",
  },
  brand: { fontSize: 11, color: "#0369a1", fontFamily: "Helvetica-Bold" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 6 },
  subtitle: { fontSize: 10, color: "#64748b", marginTop: 4 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 22,
    marginBottom: 8,
  },
  statRow: { flexDirection: "row", gap: 8 },
  statBox: {
    flex: 1,
    border: "1 solid #e2e8f0",
    borderRadius: 6,
    padding: 10,
  },
  statLabel: { fontSize: 7.5, color: "#64748b", textTransform: "uppercase" },
  statValue: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 3 },
  statusLine: {
    marginTop: 10,
    padding: 10,
    borderRadius: 6,
    backgroundColor: "#f0f9ff",
    fontSize: 10,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottom: "1 solid #cbd5e1",
    paddingBottom: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: "#475569",
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5 solid #e2e8f0",
    paddingVertical: 4,
  },
  colDate: { width: 80 },
  colType: { width: 90 },
  colSummary: { flex: 1 },
  footer: {
    position: "absolute",
    left: 48,
    right: 48,
    bottom: 32,
    borderTop: "1 solid #cbd5e1",
    paddingTop: 8,
    fontSize: 8,
    color: "#64748b",
  },
});

const TYPE_LABELS: Record<string, string> = {
  check: "Check",
  violation: "Violation",
  auto_correction: "Auto-corrected",
  push_failed: "Manual fix needed",
  stage_confirmed: "Stage confirmed",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BoardReport({ data }: { data: ReportData }) {
  const { property, stats, stage } = data;
  return (
    <Document
      title={`Driplin compliance report — ${property.name}`}
      author="Driplin"
    >
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.brand}>DRIPLIN · DROUGHT COMPLIANCE</Text>
        <Text style={styles.title}>{property.name}</Text>
        <Text style={styles.subtitle}>
          {property.address} · {property.unitCount} units · Prepared for{" "}
          {data.orgName}
        </Text>
        <Text style={styles.subtitle}>
          Reporting period: {fmtDate(data.period.from)} –{" "}
          {fmtDate(data.period.to)}
        </Text>

        <Text style={styles.sectionTitle}>Summary</Text>
        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Compliance checks</Text>
            <Text style={styles.statValue}>{stats.checksRun}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Violations found</Text>
            <Text style={styles.statValue}>{stats.violationsFound}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Auto-corrected</Text>
            <Text style={styles.statValue}>{stats.autoCorrections}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Est. water saved (gal)</Text>
            <Text style={styles.statValue}>
              {Math.round(stats.estimatedGallonsSaved).toLocaleString()}
            </Text>
          </View>
        </View>
        <Text style={styles.statusLine}>
          Current status: {stats.currentStatus}
          {stats.manualFixesFlagged > 0 &&
            ` · ${stats.manualFixesFlagged} item(s) flagged for manual attention`}
        </Text>

        <Text style={styles.sectionTitle}>Activity during this period</Text>
        {data.events.length === 0 ? (
          <Text style={{ color: "#64748b" }}>
            No compliance activity recorded in this period.
          </Text>
        ) : (
          <View>
            <View style={styles.tableHeader}>
              <Text style={styles.colDate}>DATE</Text>
              <Text style={styles.colType}>EVENT</Text>
              <Text style={styles.colSummary}>DETAIL</Text>
            </View>
            {data.events.map((e, i) => (
              <View key={i} style={styles.tableRow} wrap={false}>
                <Text style={styles.colDate}>{fmtDate(e.date)}</Text>
                <Text style={styles.colType}>
                  {TYPE_LABELS[e.type] ?? e.type}
                </Text>
                <Text style={styles.colSummary}>{e.summary}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>
            Drought restrictions applied: {STAGE_NAMES[stage.stage]}
            {stage.confirmedAt
              ? `, verified ${fmtDate(stage.confirmedAt)} against the official notice`
              : " (default)"}
            {stage.sourceLink ? " — " : ""}
            {stage.sourceLink && (
              <Link src={stage.sourceLink}>{stage.sourceLink}</Link>
            )}
          </Text>
          <Text style={{ marginTop: 3 }}>
            Water-savings figures are estimates based on scheduled runtime
            reduction at a typical system flow rate. Generated by Driplin on{" "}
            {fmtDate(data.generatedAt)}.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
