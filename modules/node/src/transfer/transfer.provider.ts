import { MessagingService } from "@connext/messaging";
import { NodeResponses } from "@connext/types";
import { FactoryProvider } from "@nestjs/common/interfaces";

import { AuthService } from "../auth/auth.service";
import { LoggerService } from "../logger/logger.service";
import { MessagingProviderId, TransferProviderId } from "../constants";
import { AbstractMessagingProvider } from "../messaging/abstract.provider";
import { LinkedTransferService } from "../linkedTransfer/linkedTransfer.service";

export class TransferMessaging extends AbstractMessagingProvider {
  constructor(
    private readonly authService: AuthService,
    log: LoggerService,
    messaging: MessagingService,
    private readonly linkedTransferService: LinkedTransferService,
  ) {
    super(log, messaging);
    this.log.setContext("TransferMessaging");
  }

  async getTransferHistory(pubId: string): Promise<NodeResponses.GetTransferHistory> {
    throw new Error("Unimplemented");
  }

  /**
   * Check in endpoint for client to call when it comes online to handle pending tasks
   * @param userIdentifier
   */
  async clientCheckIn(userIdentifier: string): Promise<void> {
    // reclaim collateral from redeemed transfers
    await this.linkedTransferService
      .unlockLinkedTransfersFromUser(userIdentifier);
  }

  async setupSubscriptions(): Promise<void> {
    await super.connectRequestReponse(
      "*.transfer.get-history",
      this.authService.parseIdentifier(this.getTransferHistory.bind(this)),
    );

    await super.connectRequestReponse(
      "*.client.check-in",
      this.authService.parseIdentifier(this.clientCheckIn.bind(this)),
    );
  }
}

export const transferProviderFactory: FactoryProvider<Promise<void>> = {
  inject: [AuthService, LoggerService, MessagingProviderId, LinkedTransferService],
  provide: TransferProviderId,
  useFactory: async (
    authService: AuthService,
    logging: LoggerService,
    messaging: MessagingService,
    linkedTransferService: LinkedTransferService,
  ): Promise<void> => {
    const transfer = new TransferMessaging(
      authService,
      logging,
      messaging,
      linkedTransferService,
    );
    await transfer.setupSubscriptions();
  },
};
