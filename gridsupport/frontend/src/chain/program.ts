import {AnchorProvider, Program} from '@anchor-lang/core';
import type {Connection} from '@solana/web3.js';
import type {AnchorWallet} from '@solana/wallet-adapter-react';
import idl from './gridsupport.json';
import type {Gridsupport} from './gridsupport';

export const gridIdl = idl as unknown as Gridsupport;

export function createAnchorProvider(connection: Connection, wallet: AnchorWallet) {
  return new AnchorProvider(connection, wallet, {commitment: 'confirmed'});
}

export function createGridProgram(connection: Connection, wallet?: AnchorWallet): Program<Gridsupport> {
  const provider = wallet ? createAnchorProvider(connection, wallet) : {connection};
  return new Program(gridIdl, provider);
}
