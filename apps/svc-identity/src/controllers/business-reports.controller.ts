/**
 * Business Reports Controller
 *
 * Phase 3: Business & Enterprise Features
 *
 * Handles HTTP requests for business reporting operations.
 */

import { Request, Response } from 'express';
import * as businessReportsService from '../services/business-reports.service';

// Type alias for enum
type BusinessReportType =
  | 'DAILY_SUMMARY' | 'WEEKLY_SUMMARY' | 'MONTHLY_PROFIT_LOSS' | 'QUARTERLY_REPORT'
  | 'ANNUAL_REPORT' | 'TAX_SUMMARY' | 'PAYROLL_REPORT' | 'EXPENSE_REPORT'
  | 'BUDGET_VS_ACTUAL' | 'CUSTOM';

// Default tenant ID for this deployment
const DEFAULT_TENANT_ID = 'gx-tenant-001';

/**
 * Generate a business report
 * POST /api/v1/business-reports
 */
export async function generateReport(req: Request, res: Response): Promise<void> {
  try {
    const {
      businessAccountId,
      reportType,
      name,
      periodStart,
      periodEnd,
    } = req.body;
    const user = (req as any).user;

    if (!businessAccountId || !reportType || !name || !periodStart || !periodEnd) {
      res.status(400).json({
        success: false,
        error: 'businessAccountId, reportType, name, periodStart, and periodEnd are required',
      });
      return;
    }

    const report = await businessReportsService.generateReport({
      tenantId: DEFAULT_TENANT_ID,
      businessAccountId,
      reportType: reportType as BusinessReportType,
      name,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      generatedById: user?.profileId || user?.adminId || 'system',
    });

    res.status(201).json({
      success: true,
      data: { report },
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get a single report
 * GET /api/v1/business-reports/:id
 */
export async function getReport(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const report = await businessReportsService.getReport(DEFAULT_TENANT_ID, id);

    if (!report) {
      res.status(404).json({
        success: false,
        error: 'Report not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { report },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get all reports for a business account
 * GET /api/v1/business-accounts/:businessAccountId/reports
 */
export async function getReports(req: Request, res: Response): Promise<void> {
  try {
    const { businessAccountId } = req.params;
    const { reportType, year, limit, offset } = req.query;

    const result = await businessReportsService.getReports(
      DEFAULT_TENANT_ID,
      businessAccountId,
      {
        reportType: reportType as BusinessReportType | undefined,
        year: year ? parseInt(year as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      }
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Delete a report
 * DELETE /api/v1/business-reports/:id
 */
export async function deleteReport(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    await businessReportsService.deleteReport(DEFAULT_TENANT_ID, id);

    res.json({
      success: true,
      message: 'Report deleted successfully',
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get dashboard summary (real-time, not persisted)
 * GET /api/v1/business-accounts/:businessAccountId/dashboard
 */
export async function getDashboardSummary(req: Request, res: Response): Promise<void> {
  try {
    const { businessAccountId } = req.params;

    const dashboard = await businessReportsService.getDashboardSummary(
      DEFAULT_TENANT_ID,
      businessAccountId
    );

    res.json({
      success: true,
      data: { dashboard },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get budget vs actual comparison
 * GET /api/v1/business-accounts/:businessAccountId/budget-vs-actual
 */
export async function getBudgetVsActual(req: Request, res: Response): Promise<void> {
  try {
    const { businessAccountId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: 'startDate and endDate query parameters are required',
      });
      return;
    }

    const comparison = await businessReportsService.getBudgetVsActual(
      DEFAULT_TENANT_ID,
      businessAccountId,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json({
      success: true,
      data: { comparison },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Quick report generation endpoints for common report types
 */

/**
 * Generate daily summary
 * POST /api/v1/business-accounts/:businessAccountId/reports/daily
 */
export async function generateDailySummary(req: Request, res: Response): Promise<void> {
  try {
    const { businessAccountId } = req.params;
    const { date } = req.body;
    const user = (req as any).user;

    const reportDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(reportDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(reportDate);
    endOfDay.setHours(23, 59, 59, 999);

    const report = await businessReportsService.generateReport({
      tenantId: DEFAULT_TENANT_ID,
      businessAccountId,
      reportType: 'DAILY_SUMMARY',
      name: `Daily Summary - ${reportDate.toISOString().split('T')[0]}`,
      periodStart: startOfDay,
      periodEnd: endOfDay,
      generatedById: user?.profileId || user?.adminId || 'system',
    });

    res.status(201).json({
      success: true,
      data: { report },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Generate monthly P&L
 * POST /api/v1/business-accounts/:businessAccountId/reports/monthly-pl
 */
export async function generateMonthlyPL(req: Request, res: Response): Promise<void> {
  try {
    const { businessAccountId } = req.params;
    const { year, month } = req.body;
    const user = (req as any).user;

    const now = new Date();
    const reportYear = year ?? now.getFullYear();
    const reportMonth = month ?? now.getMonth();

    const startOfMonth = new Date(reportYear, reportMonth, 1);
    const endOfMonth = new Date(reportYear, reportMonth + 1, 0, 23, 59, 59, 999);

    const monthName = startOfMonth.toLocaleString('default', { month: 'long' });

    const report = await businessReportsService.generateReport({
      tenantId: DEFAULT_TENANT_ID,
      businessAccountId,
      reportType: 'MONTHLY_PROFIT_LOSS',
      name: `P&L - ${monthName} ${reportYear}`,
      periodStart: startOfMonth,
      periodEnd: endOfMonth,
      generatedById: user?.profileId || user?.adminId || 'system',
    });

    res.status(201).json({
      success: true,
      data: { report },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Generate payroll report
 * POST /api/v1/business-accounts/:businessAccountId/reports/payroll
 */
export async function generatePayrollReport(req: Request, res: Response): Promise<void> {
  try {
    const { businessAccountId } = req.params;
    const { periodStart, periodEnd, name } = req.body;
    const user = (req as any).user;

    if (!periodStart || !periodEnd) {
      res.status(400).json({
        success: false,
        error: 'periodStart and periodEnd are required',
      });
      return;
    }

    const report = await businessReportsService.generateReport({
      tenantId: DEFAULT_TENANT_ID,
      businessAccountId,
      reportType: 'PAYROLL_REPORT',
      name: name || `Payroll Report - ${new Date(periodStart).toISOString().split('T')[0]} to ${new Date(periodEnd).toISOString().split('T')[0]}`,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      generatedById: user?.profileId || user?.adminId || 'system',
    });

    res.status(201).json({
      success: true,
      data: { report },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Generate annual report
 * POST /api/v1/business-accounts/:businessAccountId/reports/annual
 */
export async function generateAnnualReport(req: Request, res: Response): Promise<void> {
  try {
    const { businessAccountId } = req.params;
    const { year } = req.body;
    const user = (req as any).user;

    const reportYear = year ?? new Date().getFullYear();
    const startOfYear = new Date(reportYear, 0, 1);
    const endOfYear = new Date(reportYear, 11, 31, 23, 59, 59, 999);

    const report = await businessReportsService.generateReport({
      tenantId: DEFAULT_TENANT_ID,
      businessAccountId,
      reportType: 'ANNUAL_REPORT',
      name: `Annual Report - ${reportYear}`,
      periodStart: startOfYear,
      periodEnd: endOfYear,
      generatedById: user?.profileId || user?.adminId || 'system',
    });

    res.status(201).json({
      success: true,
      data: { report },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

export const businessReportsController = {
  generateReport,
  getReport,
  getReports,
  deleteReport,
  getDashboardSummary,
  getBudgetVsActual,
  generateDailySummary,
  generateMonthlyPL,
  generatePayrollReport,
  generateAnnualReport,
};
