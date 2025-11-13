import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';
import type { CalculateFeeRequestDTO, ApplyVelocityTaxRequestDTO } from '../types/dtos';

class TaxService {
  async calculateFee(data: CalculateFeeRequestDTO): Promise<{ fee: number }> {
    // TODO: Implement actual fee calculation logic based on system parameters
    const feeRateBps = 10; // 0.1% (10 basis points)
    const fee = (data.amount * feeRateBps) / 10000;
    logger.info({ amount: data.amount, fee }, 'Fee calculated');
    return { fee };
  }

  async applyVelocityTax(data: ApplyVelocityTaxRequestDTO): Promise<{ commandId: string; message: string }> {
    const { accountId, taxRateBps } = data;
    logger.info({ accountId, taxRateBps }, 'Applying velocity tax');

    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-tax',
        requestId: `velocity-tax-${accountId}-${Date.now()}`,
        commandType: 'APPLY_VELOCITY_TAX',
        payload: { accountId, taxRateBps },
        status: 'PENDING',
        attempts: 0,
      },
    });

    return { commandId: command.id, message: 'Velocity tax application initiated.' };
  }

  async checkEligibility(accountId: string): Promise<{ eligible: boolean; reason: string }> {
    // TODO: Implement actual eligibility check logic
    logger.info({ accountId }, 'Checking velocity tax eligibility');
    return { eligible: false, reason: 'Not yet implemented' };
  }
}

export const taxService = new TaxService();
