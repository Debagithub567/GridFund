use anchor_lang::{
    prelude::Pubkey,
    solana_program::{instruction::Instruction, system_program},
    AccountSerialize, InstructionData, ToAccountMetas,
};
use litesvm::LiteSVM;
use solana_account::Account;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

fn runner() -> LiteSVM {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/deploy/gridsupport.so"
    ));
    svm.add_program(gridsupport::id(), bytes).unwrap();
    svm
}

fn send(svm: &mut LiteSVM, payer: &Keypair, ix: Instruction) -> String {
    let message =
        Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[payer]).unwrap();
    format!("{:?}", svm.send_transaction(tx))
}

fn rider_pda(rider: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"rider", rider.as_ref()], &gridsupport::id())
}

#[test]
fn valid_accounts_reach_not_implemented_and_init_rolls_back() {
    let mut svm = runner();
    let rider = Keypair::new();
    svm.airdrop(&rider.pubkey(), 1_000_000_000).unwrap();
    let (profile, _) = rider_pda(&rider.pubkey());
    let ix = Instruction::new_with_bytes(
        gridsupport::id(),
        &gridsupport::instruction::InitializeRider {}.data(),
        gridsupport::accounts::InitializeRider {
            rider: rider.pubkey(),
            rider_profile: profile,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let result = send(&mut svm, &rider, ix);
    assert!(result.contains("Custom(6000)"), "{result}");
    assert!(
        svm.get_account(&profile).is_none(),
        "failed init must roll back"
    );
}

#[test]
fn wrong_rider_pda_is_rejected() {
    let mut svm = runner();
    let rider = Keypair::new();
    svm.airdrop(&rider.pubkey(), 1_000_000_000).unwrap();
    let wrong_profile = Keypair::new().pubkey();
    let ix = Instruction::new_with_bytes(
        gridsupport::id(),
        &gridsupport::instruction::InitializeRider {}.data(),
        gridsupport::accounts::InitializeRider {
            rider: rider.pubkey(),
            rider_profile: wrong_profile,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let result = send(&mut svm, &rider, ix);
    assert!(result.contains("Err("), "{result}");
    assert!(
        !result.contains("Custom(6000)"),
        "wrong PDA must fail validation: {result}"
    );
    assert!(svm.get_account(&wrong_profile).is_none());
}

fn create_season_ix(rider: Pubkey, profile: Pubkey) -> Instruction {
    let season = Pubkey::find_program_address(&[b"season", profile.as_ref()], &gridsupport::id()).0;
    Instruction::new_with_bytes(
        gridsupport::id(),
        &gridsupport::instruction::CreateSeason {
            budget_cents: 1,
            title_hash: [0; 32],
        }
        .data(),
        gridsupport::accounts::CreateSeason {
            rider,
            rider_profile: profile,
            season,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

#[test]
fn wrong_profile_owner_and_rider_relationship_are_rejected() {
    let mut svm = runner();
    let rider = Keypair::new();
    svm.airdrop(&rider.pubkey(), 1_000_000_000).unwrap();
    let (profile, bump) = rider_pda(&rider.pubkey());
    let data = {
        let mut bytes = Vec::new();
        gridsupport::state::RiderProfile {
            rider: rider.pubkey(),
            bump,
        }
        .try_serialize(&mut bytes)
        .unwrap();
        bytes
    };
    let wrong_owner = Account {
        lamports: 1_000_000,
        data: data.clone(),
        owner: system_program::ID,
        executable: false,
        rent_epoch: 0,
    };
    svm.set_account(profile, wrong_owner).unwrap();
    let owner_result = send(&mut svm, &rider, create_season_ix(rider.pubkey(), profile));
    assert!(owner_result.contains("Err("), "{owner_result}");
    assert!(
        !owner_result.contains("Custom(6000)"),
        "owner validation: {owner_result}"
    );

    let mut wrong_rider_data = Vec::new();
    gridsupport::state::RiderProfile {
        rider: Keypair::new().pubkey(),
        bump,
    }
    .try_serialize(&mut wrong_rider_data)
    .unwrap();
    svm.set_account(
        profile,
        Account {
            lamports: 1_000_000,
            data: wrong_rider_data,
            owner: gridsupport::id(),
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
    let relationship_result = send(&mut svm, &rider, create_season_ix(rider.pubkey(), profile));
    assert!(
        relationship_result.contains("Err("),
        "{relationship_result}"
    );
    assert!(
        !relationship_result.contains("Custom(6000)"),
        "rider validation: {relationship_result}"
    );
}
