import {
  EventNames,
  EventPayloads,
  PublicParams,
  PublicResults,
  SimpleLinkedTransferAppState,
  SimpleLinkedTransferAppName,
} from "@connext/types";

import { AbstractController } from "./AbstractController";
import { stringify } from "@connext/utils";

export class ResolveLinkedTransferController extends AbstractController {
  // properly logs error and emits a receive transfer failed event
  private handleResolveErr = (paymentId: string, e: any): void => {
    this.log.error(`Failed to resolve linked transfer ${paymentId}: ${e.stack || e.message}`);
    this.connext.emit(EventNames.CONDITIONAL_TRANSFER_FAILED_EVENT, {
      error: e.stack || e.message,
      paymentId,
    } as EventPayloads.LinkedTransferFailed);
  };

  public resolveLinkedTransfer = async (
    params: PublicParams.ResolveLinkedTransfer,
  ): Promise<PublicResults.ResolveLinkedTransfer> => {
    // because this function is only used internally, it is safe to add
    // the amount / assetId to the api params without breaking interfaces
    const { paymentId, preImage } = params;

    this.log.info(`Resolving link transfer with params: ${stringify(params)}`);

    const installed = await this.connext.getAppInstances();
    const existing = installed.find(
      app =>
        (
          app.appInterface.addr ===
            this.connext.appRegistry.find(app => app.name === SimpleLinkedTransferAppName)
              .appDefinitionAddress && (app.latestState as SimpleLinkedTransferAppState)
        ).paymentId === paymentId,
    );
    let resolveRes: PublicResults.ResolveLinkedTransfer;
    try {
      // node installs app, validation happens in listener
      this.log.debug(`Requesting node installs app`);
      if (existing) {
        resolveRes = {
          paymentId,
          appIdentityHash: existing.identityHash,
          amount: (existing.latestState as SimpleLinkedTransferAppState).coinTransfers[0].amount,
          assetId: existing.singleAssetTwoPartyCoinTransferInterpreterParams.tokenAddress,
          sender: existing.meta["sender"],
          meta: existing.meta,
        };
      } else {
        resolveRes = await this.connext.node.resolveLinkedTransfer(paymentId);
      }
      this.log.debug(
        `Installed linked transfer app ${resolveRes.appIdentityHash}. Taking action with preImage: ${preImage}`,
      );
      await this.connext.takeAction(resolveRes.appIdentityHash, { preImage });
      await this.connext.uninstallApp(resolveRes.appIdentityHash);
    } catch (e) {
      this.handleResolveErr(paymentId, e);
      throw e;
    }

    this.log.info(
      `Successfully redeemed linked transfer with id: ${paymentId} using preimage: ${preImage}`,
    );
    return resolveRes;
  };
}
