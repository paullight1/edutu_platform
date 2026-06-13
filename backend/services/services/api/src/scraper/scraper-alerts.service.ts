/**
 * Scraper Alerts Service
 *
 * Monitors scraper health and sends alerts when anomalies are detected:
 * - Daily yield drop >50% vs 7-day average
 * - Error rate >20% in the last hour
 * - Source failing for >3 consecutive days
 */

import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service';

export interface ScraperAlert {
  type: 'yield_drop' | 'error_spike' | 'source_failing' | 'source_disabled';
  severity: 'warning' | 'critical';
  message: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface YieldStats {
  opportunitiesPerDay: number;
  sevenDayAverage: number;
  dropPercent: number;
}

export interface ErrorStats {
  errorRate: number;
  totalJobs: number;
  failedJobs: number;
  windowMinutes: number;
}

@Injectable()
export class ScraperAlertsService {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Run all alert checks and return any triggered alerts.
   * Called after each scrape job completes.
   */
  async checkAlertConditions(
    sourcesStatus: Array<{
      sourceId: number;
      sourceName: string;
      lastSuccessAt: string | null;
      consecutiveFailures: number;
    }>,
  ): Promise<ScraperAlert[]> {
    const alerts: ScraperAlert[] = [];

    // Check for sources with consecutive failures
    for (const source of sourcesStatus) {
      if (source.consecutiveFailures >= 3) {
        const alert = this.createAlert('source_failing', 'critical', {
          sourceId: source.sourceId,
          sourceName: source.sourceName,
          consecutiveFailures: source.consecutiveFailures,
          lastSuccessAt: source.lastSuccessAt,
        });

        alerts.push(alert);
        await this.sendAlert(alert);
      }
    }

    return alerts;
  }

  /**
   * Check if daily yield has dropped significantly.
   */
  async checkYieldDrop(stats: YieldStats): Promise<ScraperAlert | null> {
    if (stats.dropPercent > 50) {
      const alert = this.createAlert('yield_drop', 'warning', {
        opportunitiesPerDay: stats.opportunitiesPerDay,
        sevenDayAverage: stats.sevenDayAverage,
        dropPercent: stats.dropPercent,
      });

      await this.sendAlert(alert);
      return alert;
    }

    return null;
  }

  /**
   * Check if error rate has spiked.
   */
  async checkErrorSpike(stats: ErrorStats): Promise<ScraperAlert | null> {
    if (stats.errorRate > 20 && stats.totalJobs >= 5) {
      const alert = this.createAlert('error_spike', 'critical', {
        errorRate: stats.errorRate,
        totalJobs: stats.totalJobs,
        failedJobs: stats.failedJobs,
        windowMinutes: stats.windowMinutes,
      });

      await this.sendAlert(alert);
      return alert;
    }

    return null;
  }

  /**
   * Send an alert. In production, this would also trigger email/Slack notifications.
   */
  async sendAlert(alert: ScraperAlert): Promise<void> {
    // Log as structured JSON for log aggregation
    console.log(
      JSON.stringify({
        event: 'scraper_alert',
        ...alert,
      }),
    );

    // Write to audit log
    await this.auditService.log(
      `scraper.alert.${alert.type}`,
      'system',
      'scraper',
      {
        severity: alert.severity,
        message: alert.message,
        ...alert.metadata,
      },
    );

    // TODO: Integrate with external notification channels
    // - Slack webhook for critical alerts
    // - Email to admin for source_disabled alerts
    // - PagerDuty for consecutive critical alerts
  }

  private createAlert(
    type: ScraperAlert['type'],
    severity: ScraperAlert['severity'],
    metadata: Record<string, unknown>,
  ): ScraperAlert {
    const messages: Record<ScraperAlert['type'], string> = {
      yield_drop: `Daily yield dropped by ${metadata.dropPercent}% vs 7-day average`,
      error_spike: `Error rate at ${metadata.errorRate}% — ${metadata.failedJobs}/${metadata.totalJobs} jobs failed`,
      source_failing: `Source "${metadata.sourceName}" has ${metadata.consecutiveFailures} consecutive failures`,
      source_disabled: `Source "${metadata.sourceName}" has been auto-disabled after repeated failures`,
    };

    return {
      type,
      severity,
      message: messages[type],
      metadata,
      timestamp: new Date().toISOString(),
    };
  }
}
