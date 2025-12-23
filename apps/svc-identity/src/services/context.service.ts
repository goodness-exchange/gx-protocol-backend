import { db } from '@gx/core-db';
import { ContextType } from '@prisma/client';

/**
 * Context Service
 *
 * Manages user account contexts for SSO switching between personal and business wallets.
 * Users can have one personal context and multiple business contexts.
 *
 * This service enables:
 * - Unified authentication across personal and business accounts
 * - Quick switching between contexts without re-authentication
 * - Context-aware wallet and transaction display
 */

export interface AccountContextDTO {
  id: string;
  type: ContextType;
  name: string;
  icon: string | null;
  isDefault: boolean;
  isActive: boolean;
  lastAccessedAt: Date | null;
  businessAccountId: string | null;
  walletId: string | null;
  balance: number | null;
}

export interface CreateContextDTO {
  type: ContextType;
  name: string;
  icon?: string;
  businessAccountId?: string;
  isDefault?: boolean;
}

export interface SwitchContextResultDTO {
  previousContextId: string | null;
  currentContext: AccountContextDTO;
  wallet: {
    walletId: string;
    balance: number;
    walletName: string;
  } | null;
}

class ContextService {
  private readonly tenantId = 'default';

  /**
   * Get all contexts for a user
   */
  async getUserContexts(profileId: string): Promise<AccountContextDTO[]> {
    const contexts = await db.accountContext.findMany({
      where: {
        tenantId: this.tenantId,
        profileId,
        isActive: true,
      },
      include: {
        businessAccount: {
          include: {
            wallet: true,
          },
        },
      },
      orderBy: [
        { isDefault: 'desc' },
        { type: 'asc' },
        { lastAccessedAt: 'desc' },
      ],
    });

    // For personal contexts, get the user's personal wallet
    const personalWallet = await db.wallet.findFirst({
      where: {
        profileId,
        deletedAt: null,
        businessAccount: null, // Personal wallet has no business account link
      },
    });

    return contexts.map((ctx) => {
      let walletId: string | null = null;
      let balance: number | null = null;

      if (ctx.type === 'PERSONAL' && personalWallet) {
        walletId = personalWallet.walletId;
        balance = Number(personalWallet.cachedBalance);
      } else if (ctx.type === 'BUSINESS' && ctx.businessAccount?.wallet) {
        walletId = ctx.businessAccount.wallet.walletId;
        balance = Number(ctx.businessAccount.wallet.cachedBalance);
      }

      return {
        id: ctx.id,
        type: ctx.type,
        name: ctx.name,
        icon: ctx.icon,
        isDefault: ctx.isDefault,
        isActive: ctx.isActive,
        lastAccessedAt: ctx.lastAccessedAt,
        businessAccountId: ctx.businessAccountId,
        walletId,
        balance,
      };
    });
  }

  /**
   * Get the current (default or last accessed) context for a user
   */
  async getCurrentContext(profileId: string): Promise<AccountContextDTO | null> {
    // First try to find the default context
    let context = await db.accountContext.findFirst({
      where: {
        tenantId: this.tenantId,
        profileId,
        isDefault: true,
        isActive: true,
      },
      include: {
        businessAccount: {
          include: {
            wallet: true,
          },
        },
      },
    });

    // If no default, find the most recently accessed
    if (!context) {
      context = await db.accountContext.findFirst({
        where: {
          tenantId: this.tenantId,
          profileId,
          isActive: true,
        },
        include: {
          businessAccount: {
            include: {
              wallet: true,
            },
          },
        },
        orderBy: { lastAccessedAt: 'desc' },
      });
    }

    if (!context) {
      return null;
    }

    // Get wallet info
    let walletId: string | null = null;
    let balance: number | null = null;

    if (context.type === 'PERSONAL') {
      const personalWallet = await db.wallet.findFirst({
        where: {
          profileId,
          deletedAt: null,
          businessAccount: null,
        },
      });
      if (personalWallet) {
        walletId = personalWallet.walletId;
        balance = Number(personalWallet.cachedBalance);
      }
    } else if (context.businessAccount?.wallet) {
      walletId = context.businessAccount.wallet.walletId;
      balance = Number(context.businessAccount.wallet.cachedBalance);
    }

    return {
      id: context.id,
      type: context.type,
      name: context.name,
      icon: context.icon,
      isDefault: context.isDefault,
      isActive: context.isActive,
      lastAccessedAt: context.lastAccessedAt,
      businessAccountId: context.businessAccountId,
      walletId,
      balance,
    };
  }

  /**
   * Switch to a different context
   */
  async switchContext(
    profileId: string,
    contextId: string
  ): Promise<SwitchContextResultDTO> {
    // Get the current default context
    const currentDefault = await db.accountContext.findFirst({
      where: {
        tenantId: this.tenantId,
        profileId,
        isDefault: true,
      },
    });

    // Get the target context
    const targetContext = await db.accountContext.findFirst({
      where: {
        id: contextId,
        tenantId: this.tenantId,
        profileId,
        isActive: true,
      },
      include: {
        businessAccount: {
          include: {
            wallet: true,
          },
        },
      },
    });

    if (!targetContext) {
      throw new Error('Context not found or not accessible');
    }

    // Update the context as last accessed
    await db.accountContext.update({
      where: { id: contextId },
      data: { lastAccessedAt: new Date() },
    });

    // Get wallet info for the new context
    let wallet: SwitchContextResultDTO['wallet'] = null;

    if (targetContext.type === 'PERSONAL') {
      const personalWallet = await db.wallet.findFirst({
        where: {
          profileId,
          deletedAt: null,
          businessAccount: null,
        },
      });
      if (personalWallet) {
        wallet = {
          walletId: personalWallet.walletId,
          balance: Number(personalWallet.cachedBalance),
          walletName: personalWallet.walletName,
        };
      }
    } else if (targetContext.businessAccount?.wallet) {
      wallet = {
        walletId: targetContext.businessAccount.wallet.walletId,
        balance: Number(targetContext.businessAccount.wallet.cachedBalance),
        walletName: targetContext.businessAccount.wallet.walletName,
      };
    }

    return {
      previousContextId: currentDefault?.id || null,
      currentContext: {
        id: targetContext.id,
        type: targetContext.type,
        name: targetContext.name,
        icon: targetContext.icon,
        isDefault: targetContext.isDefault,
        isActive: targetContext.isActive,
        lastAccessedAt: new Date(),
        businessAccountId: targetContext.businessAccountId,
        walletId: wallet?.walletId || null,
        balance: wallet?.balance || null,
      },
      wallet,
    };
  }

  /**
   * Set a context as the default
   */
  async setDefaultContext(profileId: string, contextId: string): Promise<AccountContextDTO> {
    // Verify the context belongs to the user
    const context = await db.accountContext.findFirst({
      where: {
        id: contextId,
        tenantId: this.tenantId,
        profileId,
        isActive: true,
      },
    });

    if (!context) {
      throw new Error('Context not found or not accessible');
    }

    // Remove default from all other contexts
    await db.accountContext.updateMany({
      where: {
        tenantId: this.tenantId,
        profileId,
        isDefault: true,
      },
      data: { isDefault: false },
    });

    // Set the new default
    const updatedContext = await db.accountContext.update({
      where: { id: contextId },
      data: {
        isDefault: true,
        lastAccessedAt: new Date(),
      },
      include: {
        businessAccount: {
          include: {
            wallet: true,
          },
        },
      },
    });

    let walletId: string | null = null;
    let balance: number | null = null;

    if (updatedContext.type === 'PERSONAL') {
      const personalWallet = await db.wallet.findFirst({
        where: {
          profileId,
          deletedAt: null,
          businessAccount: null,
        },
      });
      if (personalWallet) {
        walletId = personalWallet.walletId;
        balance = Number(personalWallet.cachedBalance);
      }
    } else if (updatedContext.businessAccount?.wallet) {
      walletId = updatedContext.businessAccount.wallet.walletId;
      balance = Number(updatedContext.businessAccount.wallet.cachedBalance);
    }

    return {
      id: updatedContext.id,
      type: updatedContext.type,
      name: updatedContext.name,
      icon: updatedContext.icon,
      isDefault: updatedContext.isDefault,
      isActive: updatedContext.isActive,
      lastAccessedAt: updatedContext.lastAccessedAt,
      businessAccountId: updatedContext.businessAccountId,
      walletId,
      balance,
    };
  }

  /**
   * Create a personal context for a user (called during registration)
   */
  async createPersonalContext(profileId: string): Promise<AccountContextDTO> {
    // Check if personal context already exists
    const existing = await db.accountContext.findFirst({
      where: {
        tenantId: this.tenantId,
        profileId,
        type: 'PERSONAL',
      },
    });

    if (existing) {
      throw new Error('Personal context already exists');
    }

    const context = await db.accountContext.create({
      data: {
        tenantId: this.tenantId,
        profileId,
        type: 'PERSONAL',
        name: 'Personal Wallet',
        icon: 'user',
        isDefault: true,
        isActive: true,
        lastAccessedAt: new Date(),
      },
    });

    // Get personal wallet
    const personalWallet = await db.wallet.findFirst({
      where: {
        profileId,
        deletedAt: null,
        businessAccount: null,
      },
    });

    return {
      id: context.id,
      type: context.type,
      name: context.name,
      icon: context.icon,
      isDefault: context.isDefault,
      isActive: context.isActive,
      lastAccessedAt: context.lastAccessedAt,
      businessAccountId: null,
      walletId: personalWallet?.walletId || null,
      balance: personalWallet ? Number(personalWallet.cachedBalance) : null,
    };
  }

  /**
   * Create a business context (called when user gains access to a business account)
   */
  async createBusinessContext(
    profileId: string,
    businessAccountId: string,
    name: string,
    icon?: string
  ): Promise<AccountContextDTO> {
    // Verify the business account exists and user has access
    const businessAccount = await db.businessAccount.findFirst({
      where: {
        businessAccountId,
        signatories: {
          some: {
            profileId,
            revokedAt: null,
          },
        },
      },
      include: {
        wallet: true,
      },
    });

    if (!businessAccount) {
      throw new Error('Business account not found or user does not have access');
    }

    // Check if context already exists
    const existing = await db.accountContext.findFirst({
      where: {
        tenantId: this.tenantId,
        profileId,
        businessAccountId,
      },
    });

    if (existing) {
      throw new Error('Business context already exists for this account');
    }

    const context = await db.accountContext.create({
      data: {
        tenantId: this.tenantId,
        profileId,
        type: 'BUSINESS',
        businessAccountId,
        name,
        icon: icon || 'building',
        isDefault: false,
        isActive: true,
        lastAccessedAt: new Date(),
      },
    });

    return {
      id: context.id,
      type: context.type,
      name: context.name,
      icon: context.icon,
      isDefault: context.isDefault,
      isActive: context.isActive,
      lastAccessedAt: context.lastAccessedAt,
      businessAccountId: context.businessAccountId,
      walletId: businessAccount.wallet?.walletId || null,
      balance: businessAccount.wallet ? Number(businessAccount.wallet.cachedBalance) : null,
    };
  }

  /**
   * Deactivate a context (for business contexts when user loses access)
   */
  async deactivateContext(profileId: string, contextId: string): Promise<void> {
    const context = await db.accountContext.findFirst({
      where: {
        id: contextId,
        tenantId: this.tenantId,
        profileId,
      },
    });

    if (!context) {
      throw new Error('Context not found');
    }

    if (context.type === 'PERSONAL') {
      throw new Error('Cannot deactivate personal context');
    }

    await db.accountContext.update({
      where: { id: contextId },
      data: { isActive: false },
    });

    // If this was the default, set personal as default
    if (context.isDefault) {
      const personalContext = await db.accountContext.findFirst({
        where: {
          tenantId: this.tenantId,
          profileId,
          type: 'PERSONAL',
        },
      });

      if (personalContext) {
        await db.accountContext.update({
          where: { id: personalContext.id },
          data: { isDefault: true },
        });
      }
    }
  }
}

export const contextService = new ContextService();
