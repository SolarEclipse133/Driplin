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
  Image,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { DroughtStage } from "@/lib/jurisdictions";

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
    stageName: string;
    utility: string;
    confirmedAt: string | null;
    sourceLink: string | null;
  };
  /**
   * The period day by day. The unchecked count is included on purpose: a
   * compliance record with holes in it should say so, rather than letting
   * a percentage imply days nobody looked at were fine.
   */
  history: {
    summary: string;
    compliantDays: number;
    violationDays: number;
    uncheckedDays: number;
    longestCompliantRun: number;
  } | null;
  /**
   * How Driplin reached its verdict: which utility, stage and published
   * table. A board asked to accept "compliant" is entitled to know
   * compliant with what, and both the Austin and Leander tables once
   * shipped wrong for commercial accounts.
   */
  reasoning: {
    headline: string;
    points: string[];
    caveat: string | null;
  } | null;
  /**
   * An approved variance in force over the period, if any.
   *
   * A board reading "compliant" while the property watered on a day the
   * city's published schedule forbids deserves to know why. Leaving it
   * out would make the report look either wrong or dishonest, and this
   * report exists to be shown to people who did not run it.
   */
  variance: {
    description: string;
    utility: string;
    expiringSoon: boolean;
    stageAdvanced: boolean;
  } | null;
  /**
   * Photos taken when someone confirmed a hands-on fix. Optional
   * throughout: most reports will have none, and the appendix is
   * simply left out then.
   */
  photos: {
    date: string;
    by: string;
    via: "manager" | "vendor";
    note: string | null;
    verified: boolean | null;
    /** data: URI, or null when the format can't be embedded. */
    dataUri: string | null;
  }[];
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
  reasoningBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 6,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  reasoningTitle: { fontSize: 10, fontWeight: 700, marginBottom: 4 },
  reasoningBody: { fontSize: 9, color: "#334155", marginBottom: 4 },
  reasoningPoint: { fontSize: 9, color: "#475569", marginBottom: 2 },
  reasoningCaveat: { fontSize: 9, color: "#9a3412", marginTop: 4 },
  varianceBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 6,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  varianceTitle: { fontSize: 10, fontWeight: 700, marginBottom: 4 },
  varianceBody: { fontSize: 9, color: "#334155", marginBottom: 3 },
  varianceWarn: { fontSize: 9, color: "#9a3412", marginTop: 3 },
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
  photoCard: {
    border: "1 solid #e2e8f0",
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  },
  photoImage: {
    marginTop: 6,
    maxHeight: 220,
    objectFit: "contain",
  },
  photoMeta: { fontSize: 9, color: "#475569" },
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
  const { property, stats, stage, variance, reasoning, history } = data;
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

        {/* Why a property can be compliant while watering on a day the
            city's standard schedule forbids. A board shown "compliant"
            without this would think the report was wrong. */}
        {variance && (
          <View style={styles.varianceBox}>
            <Text style={styles.varianceTitle}>
              Watering under an approved variance
            </Text>
            <Text style={styles.varianceBody}>{variance.description}</Text>
            <Text style={styles.varianceBody}>
              {variance.utility} granted this variance and the property manager
              recorded it in Driplin. Compliance above is measured against the
              variance rather than {variance.utility}&apos;s standard schedule.
              Driplin has not independently verified the approval with{" "}
              {variance.utility}.
            </Text>
            {variance.expiringSoon && (
              <Text style={styles.varianceWarn}>
                This variance expires shortly. Once it lapses the property is
                held to {variance.utility}&apos;s standard schedule again.
              </Text>
            )}
            {variance.stageAdvanced && (
              <Text style={styles.varianceWarn}>
                The drought stage has tightened since this variance was
                approved. {variance.utility} restricts which variances remain
                valid at stricter stages, so it should be re-confirmed.
              </Text>
            )}
          </View>
        )}

        {history && (
          <View style={styles.reasoningBox}>
            <Text style={styles.reasoningTitle}>Over this period</Text>
            <Text style={styles.reasoningBody}>{history.summary}</Text>
            <Text style={styles.reasoningPoint}>
              • Compliant on {history.compliantDays} day
              {history.compliantDays === 1 ? "" : "s"}, something wrong on{" "}
              {history.violationDays}, not checked on {history.uncheckedDays}.
            </Text>
            {history.longestCompliantRun > 1 && (
              <Text style={styles.reasoningPoint}>
                • Longest unbroken compliant run: {history.longestCompliantRun}{" "}
                days.
              </Text>
            )}
          </View>
        )}

        {reasoning && (
          <View style={styles.reasoningBox}>
            <Text style={styles.reasoningTitle}>How this was judged</Text>
            <Text style={styles.reasoningBody}>{reasoning.headline}</Text>
            {reasoning.points.map((point, i) => (
              <Text key={i} style={styles.reasoningPoint}>
                • {point}
              </Text>
            ))}
            {reasoning.caveat && (
              <Text style={styles.reasoningCaveat}>{reasoning.caveat}</Text>
            )}
          </View>
        )}

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

        {data.photos.length > 0 && (
          <>
            <Text style={styles.sectionTitle} break>
              Appendix — photos of completed work
            </Text>
            {data.photos.map((p, i) => (
              <View key={i} style={styles.photoCard} wrap={false}>
                <Text style={styles.photoMeta}>
                  {fmtDate(p.date)} · {p.by}
                  {p.via === "vendor" ? " (vendor)" : ""}
                  {p.verified === true
                    ? " · schedule verified by Driplin afterwards"
                    : p.verified === false
                      ? " · schedule still did not match afterwards"
                      : ""}
                </Text>
                {p.note && (
                  <Text style={[styles.photoMeta, { marginTop: 2 }]}>
                    “{p.note}”
                  </Text>
                )}
                {p.dataUri ? (
                  // react-pdf's Image is a PDF primitive, not an HTML
                  // <img>; it has no alt prop to give.
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <Image src={p.dataUri} style={styles.photoImage} />
                ) : (
                  <Text style={[styles.photoMeta, { marginTop: 4 }]}>
                    A photo is on file for this confirmation but is in a
                    format this report can&apos;t display.
                  </Text>
                )}
              </View>
            ))}
          </>
        )}

        <View style={styles.footer} fixed>
          <Text>
            Drought restrictions applied: {stage.utility} {stage.stageName}
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
