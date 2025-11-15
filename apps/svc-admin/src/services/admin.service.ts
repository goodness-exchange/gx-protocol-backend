import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';
import type {
  InitializeCountryDataRequestDTO,
  UpdateSystemParameterRequestDTO,
  PauseSystemRequestDTO,
  AppointAdminRequestDTO,
  ActivateTreasuryRequestDTO,
} from '../types/dtos';

class AdminService {
  async bootstrapSystem(): Promise<{ commandId: string; message: string }> {
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-admin',
        requestId: `bootstrap-${Date.now()}`,
        commandType: 'BOOTSTRAP_SYSTEM',
        payload: {},
        status: 'PENDING',
        attempts: 0,
      },
    });
    return { commandId: command.id, message: 'System bootstrap initiated.' };
  }

  async initializeCountryData(data: InitializeCountryDataRequestDTO): Promise<{ commandId: string; message: string }> {
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-admin',
        requestId: `init-countries-${Date.now()}`,
        commandType: 'INITIALIZE_COUNTRY',
        payload: { countriesData: data.countriesData },
        status: 'PENDING',
        attempts: 0,
      },
    });
    return { commandId: command.id, message: 'Country data initialization initiated.' };
  }

  async updateSystemParameter(data: UpdateSystemParameterRequestDTO): Promise<{ commandId: string; message: string }> {
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-admin',
        requestId: `update-param-${data.paramId}-${Date.now()}`,
        commandType: 'UPDATE_SYSTEM_PARAMETER',
        payload: data,
        status: 'PENDING',
        attempts: 0,
      },
    });
    return { commandId: command.id, message: 'System parameter update initiated.' };
  }

  async pauseSystem(data: PauseSystemRequestDTO): Promise<{ commandId: string; message: string }> {
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-admin',
        requestId: `pause-${Date.now()}`,
        commandType: 'PAUSE_SYSTEM',
        payload: data,
        status: 'PENDING',
        attempts: 0,
      },
    });
    return { commandId: command.id, message: 'System pause initiated.' };
  }

  async resumeSystem(): Promise<{ commandId: string; message: string }> {
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-admin',
        requestId: `resume-${Date.now()}`,
        commandType: 'RESUME_SYSTEM',
        payload: {},
        status: 'PENDING',
        attempts: 0,
      },
    });
    return { commandId: command.id, message: 'System resume initiated.' };
  }

  async appointAdmin(data: AppointAdminRequestDTO): Promise<{ commandId: string; message: string }> {
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-admin',
        requestId: `appoint-admin-${data.newAdminId}-${Date.now()}`,
        commandType: 'APPOINT_ADMIN',
        payload: data,
        status: 'PENDING',
        attempts: 0,
      },
    });
    return { commandId: command.id, message: 'Admin appointment initiated.' };
  }

  async activateTreasury(data: ActivateTreasuryRequestDTO): Promise<{ commandId: string; message: string }> {
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-admin',
        requestId: `activate-treasury-${data.countryCode}-${Date.now()}`,
        commandType: 'ACTIVATE_TREASURY',
        payload: data,
        status: 'PENDING',
        attempts: 0,
      },
    });
    return { commandId: command.id, message: 'Treasury activation initiated.' };
  }

  async getSystemStatus() {
    const status = await db.systemStatus.findFirst();
    if (!status) throw new Error('System status not found');
    return status;
  }

  async getSystemParameter(paramId: string) {
    const param = await db.systemParameter.findUnique({ where: { paramId } });
    if (!param) throw new Error('System parameter not found');
    return param;
  }

  async getCountryStats(countryCode: string) {
    const stats = await db.countryStats.findUnique({ where: { countryCode } });
    if (!stats) throw new Error('Country stats not found');
    return stats;
  }

  async listAllCountries() {
    return db.country.findMany({ orderBy: { code: 'asc' } });
  }

  async getGlobalCounters() {
    const counters = await db.globalCounters.findFirst();
    if (!counters) throw new Error('Global counters not found');
    return counters;
  }
}

export const adminService = new AdminService();
