import { Router } from 'express';
import { loanPoolController } from '../controllers/loanpool.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

/**
 * Loan Pool Routes
 *
 * Handles interest-free lending operations including loan applications,
 * approvals, and queries.
 * All write operations use the CQRS outbox pattern.
 */

const router = Router();

/**
 * POST /api/v1/loans
 * Apply for a loan
 * Requires authentication (user can only apply for themselves)
 *
 * @body {borrowerId: string, amount: number, collateralHash: string}
 * @returns {commandId: string, loanId: string, message: string}
 */
router.post('/loans', authenticateJWT, loanPoolController.applyForLoan);

/**
 * POST /api/v1/loans/:loanId/approve
 * Approve loan (admin only)
 *
 * @param loanId - Loan ID
 * @returns {commandId: string, message: string}
 */
router.post('/loans/:loanId/approve', authenticateJWT, loanPoolController.approveLoan);

/**
 * GET /api/v1/users/:borrowerId/loans
 * Get user's loans
 * Requires authentication (user can only view own loans)
 *
 * @param borrowerId - User profile ID
 * @returns {loans: LoanDTO[]}
 */
router.get('/users/:borrowerId/loans', authenticateJWT, loanPoolController.getUserLoans);

/**
 * GET /api/v1/loans/:loanId
 * Get specific loan details
 * Requires authentication (user can only view own loans)
 *
 * @param loanId - Loan ID
 * @returns {loan: LoanDTO}
 */
router.get('/loans/:loanId', authenticateJWT, loanPoolController.getLoan);

export default router;
