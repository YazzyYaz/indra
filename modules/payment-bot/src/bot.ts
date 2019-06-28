import { EventName, SupportedApplication } from "@connext/types";
import { Node as NodeTypes, SolidityABIEncoderV2Type } from "@counterfactual/types";
import { utils } from "ethers";
import { Zero } from "ethers/constants";
import { BigNumber } from "ethers/utils";
import inquirer from "inquirer";

import { getConnextClient } from "./";

interface Transfers {
  to: string;
  amount: BigNumber;
}

type AppState = SolidityABIEncoderV2Type & {
  transfers: Transfers[];
  finalized: boolean;
};

let currentPrompt: any;

export function getCurrentPrompt(): any {
  return currentPrompt;
}

export function closeCurrentPrompt(): void {
  const p = getCurrentPrompt();
  if (!p || !p.ui) return;

  p.ui.close();
}

export const delay = (ms: number): Promise<void> =>
  new Promise((res: any): any => setTimeout(res, ms));

export async function showMainPrompt(): Promise<any> {
  const client = getConnextClient();
  const appInstances = await client.getAppInstances();
  if (appInstances.length > 0) {
    showAppInstancesPrompt();
  } else {
    showDirectionPrompt();
  }
}

export async function showAppInstancesPrompt(): Promise<any> {
  closeCurrentPrompt();
  const client = getConnextClient();
  const appInstances = await client.getAppInstances();

  if (appInstances.length === 0) {
    return;
  }

  currentPrompt = inquirer.prompt({
    choices: appInstances.map((app: any): any => app.id),
    message: "Select a payment thread to view options",
    name: "viewApp",
    type: "list",
  });
  currentPrompt.then((answers: any) => {
    const { viewApp } = answers as Record<string, string>;
    showAppOptions(viewApp);
  });
}

function logThreadBalances(balances: AppState): void {
  const senderBalance = balances.transfers[0].amount
    ? utils.formatEther(balances.transfers[0].amount)
    : utils.formatEther(balances.transfers[0][1]);

  const receiverBalance = balances.transfers[1].amount
    ? utils.formatEther(balances.transfers[1].amount)
    : utils.formatEther(balances.transfers[1][1]);
  console.log(`Balances: Sender - ${senderBalance}, Receiver - ${receiverBalance}`);
}

async function showAppOptions(appId: string): Promise<any> {
  closeCurrentPrompt();
  const client = getConnextClient();
  const getAppInstancesResult = await client.getAppInstanceDetails(appId);
  console.log("getAppInstancesResult: ", getAppInstancesResult);
  const choices = ["balances", "uninstall"];
  if (
    // TODO: make this comparison more resilient
    !new BigNumber((getAppInstancesResult.appInstance as any).myDeposit).isZero()
  ) {
    choices.unshift("send");
  }

  const getStateResult = await client.getAppState(appId);

  currentPrompt = inquirer.prompt({
    choices,
    message: "Select an action to take",
    name: "viewOptions",
    type: "list",
  });

  currentPrompt.then(
    async (answers: any): Promise<any> => {
      const { viewOptions } = answers as Record<string, string>;
      if (viewOptions === "balances") {
        logThreadBalances(getStateResult.state as AppState);
        showAppOptions(appId);
      } else if (viewOptions === "send") {
        logThreadBalances(getStateResult.state as AppState);
        showSendPrompt(appId);
      } else if (viewOptions === "uninstall") {
        await uninstallVirtualApp(appId);
      }
    },
  );
}

async function showSendPrompt(appId: string): Promise<any> {
  closeCurrentPrompt();
  const client = getConnextClient();

  currentPrompt = inquirer.prompt({
    message: "Amount to send",
    name: "sendInVirtualApp",
    type: "input",
  });

  currentPrompt.then(
    async (answers: any): Promise<any> => {
      const { sendInVirtualApp } = answers as Record<string, string>;
      await client.takeAction(appId, {
        finalize: false,
        transferAmount: utils.parseEther(sendInVirtualApp),
      });
    },
  );
}

export async function showDirectionPrompt(): Promise<void> {
  closeCurrentPrompt();
  currentPrompt = inquirer.prompt([
    {
      choices: ["receiving", "sending", "withdrawing"],
      message: "Are you sending payments, receiving payments, or withdrawing?",
      name: "direction",
      type: "list",
    },
  ]);

  currentPrompt.then((answers: any): any => {
    if ((answers as Record<string, string>).direction === "sending") {
      showOpenVirtualChannelPrompt();
    } else if ((answers as Record<string, string>).direction === "receiving") {
      console.log("Waiting to receive virtual install request...");
    } else {
      showWithdrawalPrompt();
    }
  });
}

export async function showWithdrawalPrompt(): Promise<void> {
  closeCurrentPrompt();
  currentPrompt = inquirer.prompt([
    {
      message: "Enter withdrawal amount:",
      name: "amount",
      type: "input",
    },
    {
      message: "Enter withdrawal recipient (optional):",
      name: "recipient",
      type: "input",
    },
  ]);

  currentPrompt.then((answers: any): void => {
    const { recipient, amount } = answers as Record<string, string>;
    withdrawBalance(amount, recipient);
  });
}

export async function showOpenVirtualChannelPrompt(): Promise<void> {
  closeCurrentPrompt();
  currentPrompt = inquirer.prompt([
    {
      message: "Enter counterparty public identifier:",
      name: "counterpartyPublicId",
      type: "input",
    },
    {
      message: "Enter Party A deposit amount:",
      name: "depositPartyA",
      type: "input",
    },
  ]);

  currentPrompt.then((answers: any): void => {
    const { counterpartyPublicId, depositPartyA } = answers as Record<string, string>;
    openVirtualChannel(depositPartyA, counterpartyPublicId);
  });
}

async function withdrawBalance(amount: string, recipient: string | undefined): Promise<any> {
  const client = getConnextClient();
  await client.withdrawal(utils.parseEther(amount), recipient);
}

export function registerClientListeners(): void {
  const client = getConnextClient();
  client.on(
    EventName.PROPOSE_INSTALL_VIRTUAL,
    async (data: NodeTypes.ProposeInstallVirtualResult) => {
      const appInstanceId = data.appInstanceId;
      console.log("Installing appInstanceId:", appInstanceId);
      await client.installVirtualApp(appInstanceId);
      // TODO: why doesnt the event for install virtual get emitted
      // in your node if you send the install first??
      while ((await client.getAppInstances()).length === 0) {
        console.log("no new apps found for client, waiting one second and trying again...");
        await delay(1000);
      }
      await showAppInstancesPrompt();
    },
  );

  client.on(EventName.INSTALL_VIRTUAL, async (data: NodeTypes.ProposeInstallVirtualResult) => {
    console.log("Successfully installed app:", JSON.stringify(data, null, 2));
    await showAppInstancesPrompt();
  });

  client.on(EventName.UPDATE_STATE, async (data: NodeTypes.UpdateStateResult) => {
    console.log("Successfully updated state:", JSON.stringify(data, null, 2));
    logThreadBalances(data.newState as AppState);
    if (!(data.newState as AppState).finalized) {
      await showAppOptions((data as any).appInstanceId);
    }
  });

  client.on(EventName.UNINSTALL_VIRTUAL, async (data: NodeTypes.UninstallVirtualResult) => {
    console.log("Successfully uninstalled virtual app:", JSON.stringify(data, null, 2));
    while ((await client.getAppInstances()).length > 0) {
      console.log(
        "app still found in client, waiting 1s to uninstall. open apps: ",
        (await client.getAppInstances()).length,
      );
      await delay(1000);
    }
    client.logEthFreeBalance(await client.getFreeBalance());
    await showMainPrompt();
  });

  client.on(EventName.WITHDRAWAL, async (data: any) => {
    await showMainPrompt();
  });

  if (
    client.listener.listenerCount(EventName.PROPOSE_INSTALL_VIRTUAL) === 0 ||
    client.listener.listenerCount(EventName.INSTALL_VIRTUAL) === 0 ||
    client.listener.listenerCount(EventName.UPDATE_STATE) === 0 ||
    client.listener.listenerCount(EventName.UNINSTALL_VIRTUAL) === 0 ||
    client.listener.listenerCount(EventName.WITHDRAWAL) === 0
  ) {
    throw Error("Listeners failed to register.");
  }
}

async function openVirtualChannel(
  depositPartyA: string,
  counterpartyPublicId: string,
): Promise<any> {
  const client = getConnextClient();

  await client.proposeInstallVirtualApp(
    "EthUnidirectionalTransferApp" as SupportedApplication,
    utils.parseEther(depositPartyA),
    counterpartyPublicId,
  );
}

async function uninstallVirtualApp(appInstanceId: string): Promise<any> {
  const client = getConnextClient();
  await client.takeAction(appInstanceId, {
    finalize: true,
    transferAmount: Zero,
  });
  await client.uninstallVirtualApp(appInstanceId);

  while ((await client.getAppInstances()).length > 0) {
    console.log(
      "app still found in client, waiting 1s to uninstall. open apps: ",
      (await client.getAppInstances()).length,
    );
    await delay(1000);
  }

  await showMainPrompt();
}
