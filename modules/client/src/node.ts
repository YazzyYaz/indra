import { Address } from "@counterfactual/types";
import { Client as NatsClient } from "ts-nats";

import { Logger } from "./lib/logger";
import { NodeConfig, NodeInitializationParameters } from "./types";
import { Wallet } from "./wallet";

// TODO: move to types.ts?
const API_TIMEOUT = 2000;

export interface INodeApiClient {
  config(): Promise<NodeConfig>;
}

export class NodeApiClient implements INodeApiClient {
  public nodeUrl: string;
  public nats: NatsClient; // TODO: rename to messaging?
  public wallet: Wallet;
  public address: Address;
  public log: Logger;
  public nonce: string | undefined;
  public signature: string | undefined;

  constructor(opts: NodeInitializationParameters) {
    this.nodeUrl = opts.nodeUrl;
    this.nats = opts.nats;
    this.wallet = opts.wallet;
    this.address = opts.wallet.address;
    this.log = new Logger("NodeApiClient", opts.logLevel);
  }

  ///////////////////////////////////
  //////////// PUBLIC //////////////
  /////////////////////////////////

  public async config(): Promise<NodeConfig> {
    // get the config from the hub
    try {
      const configRes: NodeConfig = await this.send("config.get");
      return configRes;
    } catch (e) {
      return Promise.reject(e);
    }
  }

  // TODO: NATS authentication procedure?
  // Use TLS based auth, eventually tied to HNS
  // names, for 2.0-2.x will need to generate our
  // own certs linked to their public key
  public authenticate(): void {}

  // TODO: @layne, should we have our xpub accessible in this class instead of passing it in?
  public async getChannel(myXpub: string): Promise<any> {
    try {
      const channelRes = await this.send(`channel.get.${myXpub}`);
      return channelRes;
    } catch (e) {
      return Promise.reject(e);
    }
  }

  // TODO: can we abstract this try-catch thing into a separate function?
  public async createChannel(myXpub: string): Promise<any> {
    try {
      const channelRes = await this.send(`channel.create.${myXpub}`);
      console.log('channelRes: ', channelRes);
      return channelRes;
    } catch (e) {
      return Promise.reject(e);
    }
  }

  ///////////////////////////////////
  //////////// PRIVATE /////////////
  /////////////////////////////////
  private async send(subject: string, data?: any): Promise<any> {
    console.log(`Sending request to ${subject} ${data ? `with body: ${data}` : `without body`}`);
    const msg = await this.nats.request(subject, API_TIMEOUT, JSON.stringify(data));
    return JSON.parse(msg.data);
  }
}
