import { Router } from 'express';
import { businessSubAccountsController } from '../controllers/business-subaccounts.controller';
import { employeesController } from '../controllers/employees.controller';
import { payrollController } from '../controllers/payroll.controller';
import { businessReportsController } from '../controllers/business-reports.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

/**
 * Business Routes
 *
 * Phase 3: Business & Enterprise Features
 *
 * All endpoints require JWT authentication.
 */

const router = Router();

// ============================================
// Business Sub-Accounts
// ============================================

/**
 * GET /api/v1/business-accounts/:businessAccountId/sub-accounts
 * Get all sub-accounts for a business account
 */
router.get(
  '/business-accounts/:businessAccountId/sub-accounts',
  authenticateJWT,
  businessSubAccountsController.getBusinessSubAccounts
);

/**
 * GET /api/v1/business-accounts/:businessAccountId/budget-summary
 * Get budget summary for a business account
 */
router.get(
  '/business-accounts/:businessAccountId/budget-summary',
  authenticateJWT,
  businessSubAccountsController.getBudgetSummary
);

/**
 * GET /api/v1/business-sub-accounts/:id
 * Get a single business sub-account
 */
router.get(
  '/business-sub-accounts/:id',
  authenticateJWT,
  businessSubAccountsController.getBusinessSubAccount
);

/**
 * POST /api/v1/business-sub-accounts
 * Create a new business sub-account
 */
router.post(
  '/business-sub-accounts',
  authenticateJWT,
  businessSubAccountsController.createBusinessSubAccount
);

/**
 * PUT /api/v1/business-sub-accounts/:id
 * Update a business sub-account
 */
router.put(
  '/business-sub-accounts/:id',
  authenticateJWT,
  businessSubAccountsController.updateBusinessSubAccount
);

/**
 * DELETE /api/v1/business-sub-accounts/:id
 * Delete a business sub-account
 */
router.delete(
  '/business-sub-accounts/:id',
  authenticateJWT,
  businessSubAccountsController.deleteBusinessSubAccount
);

/**
 * POST /api/v1/business-sub-accounts/:id/allocate
 * Allocate funds to a business sub-account
 */
router.post(
  '/business-sub-accounts/:id/allocate',
  authenticateJWT,
  businessSubAccountsController.allocateFunds
);

/**
 * POST /api/v1/business-sub-accounts/:id/expense
 * Record an expense from a business sub-account
 */
router.post(
  '/business-sub-accounts/:id/expense',
  authenticateJWT,
  businessSubAccountsController.recordExpense
);

/**
 * POST /api/v1/business-sub-accounts/transfer
 * Transfer between business sub-accounts
 */
router.post(
  '/business-sub-accounts/transfer',
  authenticateJWT,
  businessSubAccountsController.transferBetweenSubAccounts
);

/**
 * GET /api/v1/business-sub-accounts/:id/transactions
 * Get transactions for a business sub-account
 */
router.get(
  '/business-sub-accounts/:id/transactions',
  authenticateJWT,
  businessSubAccountsController.getTransactions
);

/**
 * POST /api/v1/business-sub-accounts/:id/budget-periods
 * Create a budget period for a business sub-account
 */
router.post(
  '/business-sub-accounts/:id/budget-periods',
  authenticateJWT,
  businessSubAccountsController.createBudgetPeriod
);

// ============================================
// Employees
// ============================================

/**
 * GET /api/v1/business-accounts/:businessAccountId/employees
 * Get all employees for a business account
 */
router.get(
  '/business-accounts/:businessAccountId/employees',
  authenticateJWT,
  employeesController.getEmployees
);

/**
 * GET /api/v1/business-accounts/:businessAccountId/employees/stats
 * Get employee statistics
 */
router.get(
  '/business-accounts/:businessAccountId/employees/stats',
  authenticateJWT,
  employeesController.getEmployeeStats
);

/**
 * GET /api/v1/business-accounts/:businessAccountId/employees/due-for-payment
 * Get employees due for payment
 */
router.get(
  '/business-accounts/:businessAccountId/employees/due-for-payment',
  authenticateJWT,
  employeesController.getEmployeesDueForPayment
);

/**
 * GET /api/v1/business-accounts/:businessAccountId/departments
 * Get departments for a business account
 */
router.get(
  '/business-accounts/:businessAccountId/departments',
  authenticateJWT,
  employeesController.getDepartments
);

/**
 * GET /api/v1/employees/:id
 * Get a single employee
 */
router.get(
  '/employees/:id',
  authenticateJWT,
  employeesController.getEmployee
);

/**
 * POST /api/v1/employees
 * Create a new employee
 */
router.post(
  '/employees',
  authenticateJWT,
  employeesController.createEmployee
);

/**
 * PUT /api/v1/employees/:id
 * Update an employee
 */
router.put(
  '/employees/:id',
  authenticateJWT,
  employeesController.updateEmployee
);

/**
 * POST /api/v1/employees/:id/terminate
 * Terminate an employee
 */
router.post(
  '/employees/:id/terminate',
  authenticateJWT,
  employeesController.terminateEmployee
);

/**
 * DELETE /api/v1/employees/:id
 * Delete an employee
 */
router.delete(
  '/employees/:id',
  authenticateJWT,
  employeesController.deleteEmployee
);

/**
 * POST /api/v1/employees/:id/link-user
 * Link employee to GX user profile
 */
router.post(
  '/employees/:id/link-user',
  authenticateJWT,
  employeesController.linkEmployeeToUser
);

// ============================================
// Payroll Records
// ============================================

/**
 * GET /api/v1/employees/:employeeId/payroll
 * Get payroll records for an employee
 */
router.get(
  '/employees/:employeeId/payroll',
  authenticateJWT,
  payrollController.getEmployeePayrollRecords
);

/**
 * POST /api/v1/payroll-records
 * Create a payroll record
 */
router.post(
  '/payroll-records',
  authenticateJWT,
  payrollController.createPayrollRecord
);

/**
 * PUT /api/v1/payroll-records/:id
 * Update a payroll record
 */
router.put(
  '/payroll-records/:id',
  authenticateJWT,
  payrollController.updatePayrollRecord
);

/**
 * POST /api/v1/payroll-records/:id/submit
 * Submit payroll record for approval
 */
router.post(
  '/payroll-records/:id/submit',
  authenticateJWT,
  payrollController.submitPayrollForApproval
);

/**
 * POST /api/v1/payroll-records/:id/approve
 * Approve a payroll record
 */
router.post(
  '/payroll-records/:id/approve',
  authenticateJWT,
  payrollController.approvePayrollRecord
);

/**
 * POST /api/v1/payroll-records/:id/cancel
 * Cancel a payroll record
 */
router.post(
  '/payroll-records/:id/cancel',
  authenticateJWT,
  payrollController.cancelPayrollRecord
);

// ============================================
// Payroll Batches
// ============================================

/**
 * GET /api/v1/business-accounts/:businessAccountId/payroll-batches
 * Get all payroll batches for a business account
 */
router.get(
  '/business-accounts/:businessAccountId/payroll-batches',
  authenticateJWT,
  payrollController.getPayrollBatches
);

/**
 * GET /api/v1/business-accounts/:businessAccountId/payroll-summary
 * Get payroll summary for a business account
 */
router.get(
  '/business-accounts/:businessAccountId/payroll-summary',
  authenticateJWT,
  payrollController.getPayrollSummary
);

/**
 * GET /api/v1/payroll-batches/:id
 * Get a single payroll batch
 */
router.get(
  '/payroll-batches/:id',
  authenticateJWT,
  payrollController.getPayrollBatch
);

/**
 * POST /api/v1/payroll-batches
 * Create a payroll batch
 */
router.post(
  '/payroll-batches',
  authenticateJWT,
  payrollController.createPayrollBatch
);

/**
 * POST /api/v1/payroll-batches/:id/submit
 * Submit batch for approval
 */
router.post(
  '/payroll-batches/:id/submit',
  authenticateJWT,
  payrollController.submitBatchForApproval
);

/**
 * POST /api/v1/payroll-batches/:id/approve
 * Approve a payroll batch
 */
router.post(
  '/payroll-batches/:id/approve',
  authenticateJWT,
  payrollController.approveBatch
);

/**
 * POST /api/v1/payroll-batches/:id/process
 * Process batch payments
 */
router.post(
  '/payroll-batches/:id/process',
  authenticateJWT,
  payrollController.processBatchPayments
);

// ============================================
// Business Reports
// ============================================

/**
 * GET /api/v1/business-accounts/:businessAccountId/reports
 * Get all reports for a business account
 */
router.get(
  '/business-accounts/:businessAccountId/reports',
  authenticateJWT,
  businessReportsController.getReports
);

/**
 * GET /api/v1/business-accounts/:businessAccountId/dashboard
 * Get dashboard summary (real-time)
 */
router.get(
  '/business-accounts/:businessAccountId/dashboard',
  authenticateJWT,
  businessReportsController.getDashboardSummary
);

/**
 * GET /api/v1/business-accounts/:businessAccountId/budget-vs-actual
 * Get budget vs actual comparison
 */
router.get(
  '/business-accounts/:businessAccountId/budget-vs-actual',
  authenticateJWT,
  businessReportsController.getBudgetVsActual
);

/**
 * POST /api/v1/business-accounts/:businessAccountId/reports/daily
 * Generate daily summary
 */
router.post(
  '/business-accounts/:businessAccountId/reports/daily',
  authenticateJWT,
  businessReportsController.generateDailySummary
);

/**
 * POST /api/v1/business-accounts/:businessAccountId/reports/monthly-pl
 * Generate monthly P&L
 */
router.post(
  '/business-accounts/:businessAccountId/reports/monthly-pl',
  authenticateJWT,
  businessReportsController.generateMonthlyPL
);

/**
 * POST /api/v1/business-accounts/:businessAccountId/reports/payroll
 * Generate payroll report
 */
router.post(
  '/business-accounts/:businessAccountId/reports/payroll',
  authenticateJWT,
  businessReportsController.generatePayrollReport
);

/**
 * POST /api/v1/business-accounts/:businessAccountId/reports/annual
 * Generate annual report
 */
router.post(
  '/business-accounts/:businessAccountId/reports/annual',
  authenticateJWT,
  businessReportsController.generateAnnualReport
);

/**
 * POST /api/v1/business-reports
 * Generate a custom business report
 */
router.post(
  '/business-reports',
  authenticateJWT,
  businessReportsController.generateReport
);

/**
 * GET /api/v1/business-reports/:id
 * Get a single report
 */
router.get(
  '/business-reports/:id',
  authenticateJWT,
  businessReportsController.getReport
);

/**
 * DELETE /api/v1/business-reports/:id
 * Delete a report
 */
router.delete(
  '/business-reports/:id',
  authenticateJWT,
  businessReportsController.deleteReport
);

export default router;
