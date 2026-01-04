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

  async listAdmins(params: { role?: string; isActive?: boolean; page?: number; limit?: number; search?: string }) {
    const { role, isActive, page = 1, limit = 50, search } = params;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [admins, total] = await Promise.all([
      db.adminUser.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          displayName: true,
          role: true,
          isActive: true,
          mfaEnabled: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.adminUser.count({ where }),
    ]);

    return {
      admins,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAdminById(id: string) {
    const admin = await db.adminUser.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        mfaEnabled: true,
        lastLoginAt: true,
        lastLoginIp: true,
        loginFailedAttempts: true,
        lockedUntil: true,
        createdAt: true,
        updatedAt: true,
        customPermissions: true,
      },
    });
    if (!admin) throw new Error('Admin not found');
    return admin;
  }

  /**
   * Get country allocations for supply management
   * Returns per-country phase allocation tracking data
   */
  async getCountryAllocations() {
    const allocations = await db.countryAllocation.findMany({
      orderBy: [
        { totalUsers: 'desc' },
        { countryCode: 'asc' },
      ],
    });

    // Transform allocations to API response format
    const result: Array<{
      countryCode: string;
      countryName: string;
      percentage: number;
      phase1Remaining: number;
      phase2Remaining: number;
      phase3Remaining: number;
      phase4Remaining: number;
      phase5Remaining: number;
      phase6Remaining: number;
      totalUsers: number;
      totalMinted: string;
      currentPhase: number;
      treasuryId: string | null;
      treasuryBalance: string;
      treasuryLocked: boolean;
    }> = [];

    for (const a of allocations) {
      result.push({
        countryCode: a.countryCode,
        countryName: a.countryName,
        percentage: Number(a.percentage),
        phase1Remaining: Number(a.phase1Remaining),
        phase2Remaining: Number(a.phase2Remaining),
        phase3Remaining: Number(a.phase3Remaining),
        phase4Remaining: Number(a.phase4Remaining),
        phase5Remaining: Number(a.phase5Remaining),
        phase6Remaining: Number(a.phase6Remaining),
        totalUsers: Number(a.totalUsers),
        totalMinted: a.totalMinted.toString(),
        currentPhase: a.currentPhase,
        treasuryId: a.treasuryId,
        treasuryBalance: a.treasuryBalance.toString(),
        treasuryLocked: a.treasuryLocked,
      });
    }

    return result;
  }
}

export const adminService = new AdminService();
