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
        commandType: 'INITIALIZE_COUNTRY_DATA',
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
        payload: data as any,
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
        payload: data as any,
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
        payload: data as any,
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
        payload: data as any,
        status: 'PENDING',
        attempts: 0,
      },
    });
    return { commandId: command.id, message: 'Treasury activation initiated.' };
  }

  async getSystemStatus() {
    const status = await db.systemParameter.findUnique({
      where: { tenantId_paramKey: { tenantId: 'default', paramKey: 'SYSTEM_STATUS' } }
    });
    if (!status) throw new Error('System status not found');
    return status;
  }

  async getSystemParameter(paramKey: string) {
    const param = await db.systemParameter.findUnique({
      where: { tenantId_paramKey: { tenantId: 'default', paramKey } }
    });
    if (!param) throw new Error('System parameter not found');
    return param;
  }

  async getCountryStats(countryCode: string) {
    const stats = await db.country.findUnique({ where: { countryCode } });
    if (!stats) throw new Error('Country stats not found');
    return stats;
  }

  async listAllCountries() {
    return db.country.findMany({ orderBy: { countryCode: 'asc' } });
  }

  async getGlobalCounters() {
    const counters = await db.systemParameter.findFirst();
    if (!counters) throw new Error('Global counters not found');
    return counters;
  }
}

export const adminService = new AdminService();
