import assert from "node:assert/strict";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Fixture, INITIAL_FAN_A, TEST_MINT, failure, success } from "./integration/helpers.js";

describe("default SBF mint configuration", () => {
  it("rejects the local test mint after the integration runner restores the default build", () => {
    const f = new Fixture();
    success(f.initialize());
    failure(f.contribute(1n), "InvalidMockUsdcMint");
    assert.equal(f.balance(f.ata(f.fanA.publicKey)), INITIAL_FAN_A);
    assert.equal(f.balance(f.ata(f.rider.publicKey)), 0n);
    assert.equal(f.account(TEST_MINT).owner.toBase58(), TOKEN_PROGRAM_ID.toBase58());
  });
});
