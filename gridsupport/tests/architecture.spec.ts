import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";

const idl = JSON.parse(readFileSync(new URL("../target/idl/gridsupport.json", import.meta.url), "utf8"));
const programId = new PublicKey(idl.address);
const rider = new PublicKey("11111111111111111111111111111112");
const merchant = new PublicKey("11111111111111111111111111111113");
const otherMerchant = new PublicKey("11111111111111111111111111111114");
const le64 = (value: bigint) => { const buffer = Buffer.alloc(8); buffer.writeBigUInt64LE(value); return buffer; };
const pda = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, programId)[0];
const utf8 = (value: string) => Buffer.from(value, "utf8");

test("IDL exposes exactly the approved five interfaces and arguments", () => {
  const expected: Record<string, string[]> = {
    initialize_rider: [],
    create_season: ["budget_cents", "title_hash"],
    add_expense: ["estimated_cost_cents", "category", "description_hash"],
    sponsor_expense: ["amount_cents"],
    contribute_direct: ["amount"],
  };
  assert.deepEqual(idl.instructions.map((ix: any) => ix.name).sort(), Object.keys(expected).sort());
  for (const ix of idl.instructions) {
    assert.deepEqual(ix.args.map((arg: any) => arg.name), expected[ix.name]);
    const discriminator = createHash("sha256").update(`global:${ix.name}`).digest().subarray(0, 8);
    assert.deepEqual(Buffer.from(ix.discriminator), discriminator);
  }
  const accounts: Record<string, string[]> = {
    initialize_rider: ["rider", "rider_profile", "system_program"],
    create_season: ["rider", "rider_profile", "season", "system_program"],
    add_expense: ["rider", "rider_profile", "season", "expense", "system_program"],
    sponsor_expense: ["merchant", "season", "expense", "sponsorship", "system_program"],
    contribute_direct: ["fan", "rider_profile", "mock_usdc_mint", "fan_token_account", "rider_token_account", "token_program"],
  };
  for (const ix of idl.instructions) {
    assert.deepEqual(ix.accounts.map((account: any) => account.name), accounts[ix.name]);
  }
});

test("IDL account fields retain the four fixed-width layouts", () => {
  const sizes: Record<string, number> = { RiderProfile: 41, Season: 98, Expense: 106, Sponsorship: 97 };
  const scalarSize = (type: any): number => {
    if (type === "pubkey") return 32;
    if (type === "u64" || type === "i64") return 8;
    if (type === "u8") return 1;
    if (type.array && type.array[0] === "u8") return type.array[1];
    throw new Error(`Unexpected field type ${JSON.stringify(type)}`);
  };
  assert.deepEqual(idl.accounts.map((account: any) => account.name).sort(), Object.keys(sizes).sort());
  for (const [name, expected] of Object.entries(sizes)) {
    const accountType = idl.types.find((type: any) => type.name === name);
    assert.ok(accountType, `${name} type missing`);
    assert.equal(8 + accountType.type.fields.reduce((sum: number, field: any) => sum + scalarSize(field.type), 0), expected);
  }
});

test("PDA seeds derive deterministic independent expense and sponsorship records", () => {
  const profile = pda(utf8("rider"), rider.toBuffer());
  const season = pda(utf8("season"), profile.toBuffer());
  const expense0 = pda(utf8("expense"), season.toBuffer(), le64(0n));
  const expense1 = pda(utf8("expense"), season.toBuffer(), le64(1n));
  const sponsorship0 = pda(utf8("sponsorship"), expense0.toBuffer(), le64(0n));
  const sponsorship1 = pda(utf8("sponsorship"), expense0.toBuffer(), le64(1n));
  assert.equal(profile.toBase58(), pda(utf8("rider"), rider.toBuffer()).toBase58());
  assert.equal(season.toBase58(), pda(utf8("season"), profile.toBuffer()).toBase58());
  assert.notEqual(expense0.toBase58(), expense1.toBase58());
  assert.notEqual(sponsorship0.toBase58(), sponsorship1.toBase58());
  const sponsorshipFor = (_signer: PublicKey, id: bigint) =>
    pda(utf8("sponsorship"), expense0.toBuffer(), le64(id));
  assert.equal(sponsorshipFor(merchant, 0n).toBase58(), sponsorship0.toBase58());
  assert.equal(sponsorshipFor(merchant, 1n).toBase58(), sponsorship1.toBase58());
  assert.equal(sponsorshipFor(otherMerchant, 0n).toBase58(), sponsorship0.toBase58());
});
