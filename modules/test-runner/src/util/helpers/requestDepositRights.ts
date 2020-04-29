import {
  AppInstanceJson,
  IConnextClient,
  DepositAppState,
  DepositAppName,
  DefaultApp,
} from "@connext/types";
import { delay } from "@connext/utils";
import { Contract, BigNumber, constants } from "ethers";
import tokenAbi from "human-standard-token-abi";

import { expect } from "../";
import { ethProvider } from "../ethprovider";

export const requestDepositRights = async (
  client: IConnextClient,
  assetId: string = constants.AddressZero,
  clientIsRecipient: boolean = true,
): Promise<void> => {
  // NOTE: will use instantaneous multisig balance as the assumed balance
  const multisigBalance =
    assetId === constants.AddressZero
      ? await ethProvider.getBalance(client.multisigAddress)
      : await new Contract(assetId, tokenAbi, ethProvider).functions.balanceOf(
          client.multisigAddress,
        );
  // get coin balance app details
  const network = await ethProvider.getNetwork();
  const { appDefinitionAddress: appDefinition } = (await client.getAppRegistry({
    name: DepositAppName,
    chainId: network.chainId,
  })) as DefaultApp;
  // install the app and get the state
  let depositApp: DepositAppState;
  if (clientIsRecipient) {
    // give client rights
    await client.requestDepositRights({ assetId });
    // get latest installed app
    const latestApp = (await client.getAppInstances()).sort(
      (a: AppInstanceJson, b: AppInstanceJson) => b.appSeqNo - a.appSeqNo,
    )[0];
    // make sure its the coin balance refund app
    expect(latestApp.appInterface.addr).to.be.eq(appDefinition);
    depositApp = latestApp.latestState as DepositAppState;
  } else {
    // node is installing, params must be manually generated
    const [latestState]: any = await Promise.race([
      new Promise(async (res, rej) => {
        await delay(10_000);
        rej(`No install event caught within 10s`);
      }),
      Promise.all([
        new Promise(async (resolve) => {
          const subject = `${client.publicIdentifier}.channel.${client.multisigAddress}.app-instance.*.install`;
          client.messaging.subscribe(subject, (msg: any) => {
            const data = JSON.parse(msg.data);
            resolve(data.latestState);
          });
        }),
        await client.requestCollateral(assetId),
      ]),
    ]);
    depositApp = latestState as DepositAppState;
  }
  // verify the latest deposit state is correct
  expect(depositApp.multisigAddress).to.be.eq(client.multisigAddress);
  expect(depositApp.assetId).to.be.eq(assetId);
  expect(BigNumber.from(depositApp.startingMultisigBalance).toString()).to.be.eq(
    multisigBalance.toString(),
  );
  expect(BigNumber.from(depositApp.startingTotalAmountWithdrawn).toString()).to.be.eq(
    constants.Zero,
  );
  const transfers = depositApp.transfers;
  expect(transfers[0].amount).to.be.eq(constants.Zero);
  expect(transfers[1].amount).to.be.eq(constants.Zero);
  const clientIdx = clientIsRecipient ? 0 : 1;
  expect(transfers[clientIdx].to).to.be.eq(client.signerAddress);
  expect(transfers[clientIdx === 0 ? 1 : 0].to).to.be.eq(client.nodeSignerAddress);
};
