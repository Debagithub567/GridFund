import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction,
  type AccountInfo,
} from "@solana/web3.js";
import {
  ACCOUNT_SIZE, AccountLayout, AccountState, getAssociatedTokenAddressSync,
  MINT_SIZE, MintLayout, TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { FailedTransactionMetadata, LiteSVM, TransactionMetadata } from "litesvm";

type IdlField = { name: string; type: string | { array: [string, number] } };
type IdlInstruction = {
  name: string;
  discriminator: number[];
  accounts: { name: string; writable?: boolean; signer?: boolean }[];
  args: IdlField[];
};
type IdlType = { name: string; type: { fields: IdlField[] } };
type IdlEntry = { name: string; discriminator: number[] };
type Idl = {
  address: string;
  instructions: IdlInstruction[];
  accounts: IdlEntry[];
  events: IdlEntry[];
  types: IdlType[];
};

const artifact = fileURLToPath(new URL("../../target/deploy/gridsupport.so", import.meta.url));
const idlPath = fileURLToPath(new URL("../../target/idl/gridsupport.json", import.meta.url));
assert.ok(existsSync(artifact), `Missing ${artifact}; run npm run test:integration`);
assert.ok(existsSync(idlPath), `Missing ${idlPath}; run npm run test:integration`);
const idl = JSON.parse(readFileSync(idlPath, "utf8")) as Idl;

export const PROGRAM_ID = new PublicKey(idl.address);
export const TEST_MINT = new PublicKey(new Uint8Array(32).fill(77));
export const U64_MAX = (1n << 64n) - 1n;
export const INITIAL_FAN_A = 20_000_000n;
export const INITIAL_FAN_B = 10_000_000n;
export const INITIAL_SUPPLY = INITIAL_FAN_A + INITIAL_FAN_B;

export type Result = TransactionMetadata | FailedTransactionMetadata;
export type State = Record<string, PublicKey | bigint | number | Buffer>;

export function pda(...seeds: Buffer[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

export function profilePda(rider: PublicKey): PublicKey {
  return pda(Buffer.from("rider"), rider.toBuffer());
}

export function seasonPda(profile: PublicKey): PublicKey {
  return pda(Buffer.from("season"), profile.toBuffer());
}

function le64(value: bigint): Buffer {
  assert.ok(value >= 0n && value <= U64_MAX, "u64 argument out of range");
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(value);
  return out;
}

export function expensePda(season: PublicKey, index: bigint): PublicKey {
  return pda(Buffer.from("expense"), season.toBuffer(), le64(index));
}

export function sponsorshipPda(expense: PublicKey, index: bigint): PublicKey {
  return pda(Buffer.from("sponsorship"), expense.toBuffer(), le64(index));
}

function encodeField(field: IdlField, value: PublicKey | bigint | number | Buffer): Buffer {
  if (field.type === "u64") return le64(BigInt(value as bigint | number));
  if (field.type === "u8") {
    const number = Number(value);
    assert.ok(Number.isInteger(number) && number >= 0 && number <= 255);
    return Buffer.from([number]);
  }
  if (field.type === "pubkey") return (value as PublicKey).toBuffer();
  if (typeof field.type === "object" && field.type.array[0] === "u8") {
    const bytes = Buffer.from(value as Buffer);
    assert.equal(bytes.length, field.type.array[1]);
    return bytes;
  }
  throw new Error(`Unsupported IDL type for ${field.name}`);
}

function decodeFields(fields: IdlField[], data: Buffer): State {
  const result: State = {};
  let offset = 0;
  for (const field of fields) {
    if (field.type === "pubkey") {
      result[field.name] = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;
    } else if (field.type === "u64") {
      result[field.name] = data.readBigUInt64LE(offset);
      offset += 8;
    } else if (field.type === "i64") {
      result[field.name] = data.readBigInt64LE(offset);
      offset += 8;
    } else if (field.type === "u8") {
      result[field.name] = data.readUInt8(offset++);
    } else if (typeof field.type === "object" && field.type.array[0] === "u8") {
      const length = field.type.array[1];
      result[field.name] = data.subarray(offset, offset + length);
      offset += length;
    } else {
      throw new Error(`Unsupported IDL type for ${field.name}`);
    }
  }
  assert.equal(offset, data.length, "IDL fields did not consume the full account or event");
  return result;
}

export function instruction(
  name: string,
  accounts: Record<string, PublicKey>,
  args: Record<string, PublicKey | bigint | number | Buffer> = {},
): TransactionInstruction {
  const definition = idl.instructions.find((entry) => entry.name === name);
  assert.ok(definition, `Unknown instruction ${name}`);
  const data = Buffer.concat([
    Buffer.from(definition.discriminator),
    ...definition.args.map((field) => encodeField(field, args[field.name])),
  ]);
  const supplied: Record<string, PublicKey> = {
    system_program: SystemProgram.programId, token_program: TOKEN_PROGRAM_ID, ...accounts,
  };
  const keys = definition.accounts.map((account) => {
    const pubkey = supplied[account.name];
    assert.ok(pubkey instanceof PublicKey, `Missing account ${account.name}`);
    return { pubkey, isSigner: account.signer === true, isWritable: account.writable === true };
  });
  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
}

export function success(result: Result): TransactionMetadata {
  if (result instanceof FailedTransactionMetadata) {
    assert.fail(`Transaction failed: ${result.toString()}\n${result.meta().logs().join("\n")}`);
  }
  return result;
}

export function failure(result: Result, expected?: string): FailedTransactionMetadata {
  assert.ok(result instanceof FailedTransactionMetadata, "Transaction unexpectedly succeeded");
  if (expected) {
    const details = `${result.toString()}\n${result.meta().logs().join("\n")}`;
    assert.ok(details.includes(expected), `Missing ${expected}: ${details}`);
  }
  return result;
}

export function assertEvent(meta: TransactionMetadata, eventName: string, expected: State): void {
  const event = idl.events.find((entry) => entry.name === eventName);
  const type = idl.types.find((entry) => entry.name === eventName);
  assert.ok(event && type, `Missing event ${eventName} in IDL`);
  const discriminator = Buffer.from(event.discriminator);
  const found = meta.logs()
    .filter((line) => line.includes("Program data: "))
    .map((line) => Buffer.from(line.split("Program data: ")[1], "base64"))
    .find((bytes) => bytes.subarray(0, 8).equals(discriminator));
  assert.ok(found, `Missing ${eventName} event in ${meta.logs().join("\n")}`);
  const actual = decodeFields(type.type.fields, found.subarray(8));
  for (const [key, value] of Object.entries(expected)) {
    if (value instanceof PublicKey) {
      assert.equal((actual[key] as PublicKey).toBase58(), value.toBase58(), `${eventName}.${key}`);
    } else {
      assert.deepEqual(actual[key], value, `${eventName}.${key}`);
    }
  }
}

export class Fixture {
  readonly svm = new LiteSVM();
  readonly rider = Keypair.generate();
  readonly secondRider = Keypair.generate();
  readonly merchantA = Keypair.generate();
  readonly merchantB = Keypair.generate();
  readonly fanA = Keypair.generate();
  readonly fanB = Keypair.generate();
  readonly outsider = Keypair.generate();

  constructor() {
    this.svm.addProgramFromFile(PROGRAM_ID, artifact);
    for (const signer of [this.rider, this.secondRider, this.merchantA, this.merchantB, this.fanA, this.fanB, this.outsider]) {
      const result = this.svm.airdrop(signer.publicKey, 10_000_000_000n);
      assert.ok(result && !(result instanceof FailedTransactionMetadata), "Test wallet airdrop failed");
    }
    this.setMint(6);
    this.setToken(this.ata(this.rider.publicKey), this.rider.publicKey, TEST_MINT, 0n);
    this.setToken(this.ata(this.secondRider.publicKey), this.secondRider.publicKey, TEST_MINT, 0n);
    this.setToken(this.ata(this.fanA.publicKey), this.fanA.publicKey, TEST_MINT, INITIAL_FAN_A);
    this.setToken(this.ata(this.fanB.publicKey), this.fanB.publicKey, TEST_MINT, INITIAL_FAN_B);
  }

  ata(owner: PublicKey, mint = TEST_MINT): PublicKey {
    return getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
  }

  setMint(decimals: number, owner = TOKEN_PROGRAM_ID, supply = INITIAL_SUPPLY): void {
    const data = Buffer.alloc(MINT_SIZE);
    MintLayout.encode({
      mintAuthorityOption: 0, mintAuthority: PublicKey.default,
      supply, decimals, isInitialized: true,
      freezeAuthorityOption: 0, freezeAuthority: PublicKey.default,
    }, data);
    this.svm.setAccount(TEST_MINT, {
      data, owner, lamports: Number(this.svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE))),
      executable: false, rentEpoch: 0,
    });
  }

  setToken(address: PublicKey, owner: PublicKey, mint: PublicKey, amount: bigint, programOwner = TOKEN_PROGRAM_ID): void {
    const data = Buffer.alloc(ACCOUNT_SIZE);
    AccountLayout.encode({
      mint, owner, amount, delegateOption: 0, delegate: PublicKey.default,
      state: AccountState.Initialized, isNativeOption: 0, isNative: 0n,
      delegatedAmount: 0n, closeAuthorityOption: 0, closeAuthority: PublicKey.default,
    }, data);
    this.svm.setAccount(address, {
      data, owner: programOwner, lamports: Number(this.svm.minimumBalanceForRentExemption(BigInt(ACCOUNT_SIZE))),
      executable: false, rentEpoch: 0,
    });
  }

  account(address: PublicKey): AccountInfo<Uint8Array> {
    const account = this.svm.getAccount(address);
    assert.ok(account, `Missing account ${address.toBase58()}`);
    return account;
  }

  accountData(address: PublicKey): Buffer {
    return Buffer.from(this.account(address).data);
  }

  rewriteAccount(address: PublicKey, changes: Partial<AccountInfo<Uint8Array>>): void {
    this.svm.setAccount(address, { ...this.account(address), ...changes });
  }

  state(name: string, address: PublicKey): State {
    const account = this.account(address);
    assert.equal(account.owner.toBase58(), PROGRAM_ID.toBase58(), `${name} has wrong program owner`);
    const entry = idl.accounts.find((item) => item.name === name);
    const type = idl.types.find((item) => item.name === name);
    assert.ok(entry && type, `Missing ${name} in IDL`);
    const data = Buffer.from(account.data);
    assert.ok(data.subarray(0, 8).equals(Buffer.from(entry.discriminator)), `Wrong ${name} discriminator`);
    return decodeFields(type.type.fields, data.subarray(8));
  }

  balance(address: PublicKey): bigint {
    const account = this.account(address);
    assert.equal(account.owner.toBase58(), TOKEN_PROGRAM_ID.toBase58());
    return AccountLayout.decode(Buffer.from(account.data)).amount;
  }

  supply(): bigint {
    return MintLayout.decode(this.accountData(TEST_MINT)).supply;
  }

  sendInstructions(payer: Keypair, instructions: TransactionInstruction[], additionalSigners: Keypair[] = []): Result {
    this.svm.expireBlockhash();
    const transaction = new Transaction({
      feePayer: payer.publicKey, recentBlockhash: this.svm.latestBlockhash(),
    }).add(...instructions);
    transaction.sign(payer, ...additionalSigners);
    return this.svm.sendTransaction(transaction);
  }

  send(name: string, accounts: Record<string, PublicKey>, args: Record<string, PublicKey | bigint | number | Buffer>, payer: Keypair): Result {
    return this.sendInstructions(payer, [instruction(name, accounts, args)]);
  }

  initialize(rider = this.rider): Result {
    return this.send("initialize_rider", {
      rider: rider.publicKey, rider_profile: profilePda(rider.publicKey),
    }, {}, rider);
  }

  createSeason(budget: bigint, rider = this.rider): Result {
    const profile = profilePda(rider.publicKey);
    return this.send("create_season", {
      rider: rider.publicKey, rider_profile: profile, season: seasonPda(profile),
    }, { budget_cents: budget, title_hash: Buffer.alloc(32, 7) }, rider);
  }

  addExpense(estimate: bigint, rider = this.rider): { address: PublicKey; result: Result } {
    const profile = profilePda(rider.publicKey);
    const season = seasonPda(profile);
    const index = this.state("Season", season).expense_count as bigint;
    const address = expensePda(season, index);
    const result = this.send("add_expense", {
      rider: rider.publicKey, rider_profile: profile, season, expense: address,
    }, { estimated_cost_cents: estimate, category: 3, description_hash: Buffer.alloc(32, 9) }, rider);
    return { address, result };
  }

  sponsor(expense: PublicKey, amount: bigint, merchant = this.merchantA, season = seasonPda(profilePda(this.rider.publicKey))): { address: PublicKey; result: Result } {
    const index = this.state("Expense", expense).sponsorship_count as bigint;
    const address = sponsorshipPda(expense, index);
    const result = this.send("sponsor_expense", {
      merchant: merchant.publicKey, season, expense, sponsorship: address,
    }, { amount_cents: amount }, merchant);
    return { address, result };
  }

  contribute(amount: bigint, fan = this.fanA, rider = this.rider): Result {
    return this.send("contribute_direct", {
      fan: fan.publicKey, rider_profile: profilePda(rider.publicKey), mock_usdc_mint: TEST_MINT,
      fan_token_account: this.ata(fan.publicKey), rider_token_account: this.ata(rider.publicKey),
    }, { amount }, fan);
  }
}
