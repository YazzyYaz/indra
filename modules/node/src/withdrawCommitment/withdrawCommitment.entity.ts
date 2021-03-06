import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from "typeorm";
import { BigNumber } from "ethers/utils";
import { Channel } from "../channel/channel.entity";

@Entity()
export class WithdrawCommitment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column("text", {
    transformer: {
      from: (value: string): BigNumber => new BigNumber(value),
      to: (value: BigNumber): string => value.toString(),
    },
  })
  value!: BigNumber;

  @Column("text")
  to: string;

  @Column("text")
  data!: string;

  @ManyToOne(
    (type: any) => Channel,
    (channel: Channel) => channel.withdrawalCommitments,
  )
  channel!: Channel;
}
