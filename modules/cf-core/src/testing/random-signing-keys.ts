import { getRandomChannelSigner } from "@connext/crypto";
import { IChannelSigner, createRandom32ByteHexString, getPublicIdentifier } from "@connext/types";
import { SigningKey } from "ethers/utils";

export function getRandomSigningKeys(length: number) {
  return Array(length)
    .fill(0)
    .map(_ => new SigningKey(createRandom32ByteHexString()));
}

export function getRandomChannelSigners(length: number, ethProviderUrl?: string): IChannelSigner[] {
  return Array(length).fill(0).map(() => getRandomChannelSigner(ethProviderUrl));
}

export function getRandomPublicIdentifiers(length: number, provider?: string): string[] {
  return getRandomChannelSigners(length, provider)
    .map((signer) => getPublicIdentifier(signer.publicKey));
}

