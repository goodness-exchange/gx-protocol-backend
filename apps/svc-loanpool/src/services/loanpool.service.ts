import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';
import type {
  ApplyForLoanRequestDTO,
  ApproveLoanRequestDTO,
  LoanDTO,
} from '../types/dtos';

/**
 * Loan Pool Service
 *
 * Handles interest-free lending operations including:
 * - Loan applications (CQRS write via outbox)
 * - Loan approvals (CQRS write via outbox)
 * - Loan queries (read from Loan table)
 */

class LoanPoolService {
  /**
   * Apply for loan
   *
   * CQRS Write Operation:
   * 1. Validate loan application
   * 2. Create OutboxCommand for "APPLY_FOR_LOAN"
   * 3. Outbox-submitter submits to LoanPoolContract:ApplyForLoan
   * 4. Fabric emits LoanApplicationReceived event
   * 5. Projector updates Loan table
   */
  async applyForLoan(
    data: ApplyForLoanRequestDTO
  ): Promise<{ commandId: string; loanId: string; message: string }> {
    const { borrowerId, amount, collateralHash } = data;

    logger.info({ borrowerId, amount }, 'Processing loan application');

    // Validate application
    if (amount <= 0) {
      throw new Error('Loan amount must be greater than 0');
    }

    if (!collateralHash) {
      throw new Error('Collateral hash is required');
    }

    // Verify borrower exists
    const borrower = await db.userProfile.findUnique({
      where: { profileId: borrowerId },
    });

    if (!borrower) {
      throw new Error('Borrower not found');
    }

    // Generate loan ID
    const loanId = `loan-${borrowerId}-${Date.now()}`;

    // Create outbox command
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-loanpool',
        requestId: loanId,
        commandType: 'APPLY_FOR_LOAN',
        payload: {
          borrowerId,
          amount: amount.toString(),
          collateralHash,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id, loanId }, 'Loan application command created');

    return {
      commandId: command.id,
      loanId,
      message: 'Loan application submitted. Pending approval.',
    };
  }

  /**
   * Approve loan (admin only)
   *
   * CQRS Write Operation:
   * Admin approves loan and disburses funds to borrower
   */
  async approveLoan(
    data: ApproveLoanRequestDTO
  ): Promise<{ commandId: string; message: string }> {
    const { loanId } = data;

    logger.info({ loanId }, 'Approving loan');

    // Verify loan exists and is pending (optional pre-check)
    const loan = await db.loan.findUnique({
      where: { loanId },
    });

    if (!loan) {
      throw new Error('Loan not found');
    }

    if (loan.status !== 'PendingApproval') {
      throw new Error(`Loan cannot be approved. Current status: ${loan.status}`);
    }

    // Create outbox command
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-loanpool',
        requestId: `approve-${loanId}-${Date.now()}`,
        commandType: 'APPROVE_LOAN',
        payload: {
          loanId,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id, loanId }, 'Loan approval command created');

    return {
      commandId: command.id,
      message: 'Loan approval initiated.',
    };
  }

  /**
   * Get user's loans
   *
   * CQRS Read Operation: Queries projected Loan table
   */
  async getUserLoans(borrowerId: string): Promise<LoanDTO[]> {
    const loans = await db.loan.findMany({
      where: { borrowerId },
      orderBy: { appliedAt: 'desc' },
    });

    return loans.map((loan) => ({
      loanId: loan.loanId,
      borrowerId: loan.borrowerId,
      amount: Number(loan.amount),
      status: loan.status as 'PendingApproval' | 'Active' | 'Defaulted' | 'Paid',
      collateralHash: loan.collateralHash,
      appliedAt: loan.appliedAt,
      approvedAt: loan.approvedAt || undefined,
    }));
  }

  /**
   * Get specific loan
   *
   * CQRS Read Operation: Queries projected Loan table
   */
  async getLoan(loanId: string): Promise<LoanDTO> {
    const loan = await db.loan.findUnique({
      where: { loanId },
    });

    if (!loan) {
      throw new Error('Loan not found');
    }

    return {
      loanId: loan.loanId,
      borrowerId: loan.borrowerId,
      amount: Number(loan.amount),
      status: loan.status as 'PendingApproval' | 'Active' | 'Defaulted' | 'Paid',
      collateralHash: loan.collateralHash,
      appliedAt: loan.appliedAt,
      approvedAt: loan.approvedAt || undefined,
    };
  }
}

export const loanPoolService = new LoanPoolService();
