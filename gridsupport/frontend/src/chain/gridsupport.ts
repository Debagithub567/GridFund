/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/gridsupport.json`.
 */
export type Gridsupport = {
  "address": "H98fSKptEE9rVR11K75GY5xdUkDk8bEGYsyjuosX9wVQ",
  "metadata": {
    "name": "gridsupport",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "addExpense",
      "discriminator": [
        171,
        23,
        8,
        240,
        62,
        31,
        254,
        144
      ],
      "accounts": [
        {
          "name": "rider",
          "writable": true,
          "signer": true
        },
        {
          "name": "riderProfile",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "rider"
              }
            ]
          }
        },
        {
          "name": "season",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  97,
                  115,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "riderProfile"
              }
            ]
          }
        },
        {
          "name": "expense",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  112,
                  101,
                  110,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "season"
              },
              {
                "kind": "account",
                "path": "season.expenseCount",
                "account": "season"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "estimatedCostCents",
          "type": "u64"
        },
        {
          "name": "category",
          "type": "u8"
        },
        {
          "name": "descriptionHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "contributeDirect",
      "discriminator": [
        123,
        85,
        52,
        210,
        34,
        70,
        211,
        182
      ],
      "accounts": [
        {
          "name": "fan",
          "signer": true
        },
        {
          "name": "riderProfile",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "riderProfile.rider",
                "account": "riderProfile"
              }
            ]
          }
        },
        {
          "name": "mockUsdcMint"
        },
        {
          "name": "fanTokenAccount",
          "writable": true
        },
        {
          "name": "riderTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createSeason",
      "discriminator": [
        38,
        108,
        29,
        127,
        60,
        126,
        101,
        3
      ],
      "accounts": [
        {
          "name": "rider",
          "writable": true,
          "signer": true
        },
        {
          "name": "riderProfile",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "rider"
              }
            ]
          }
        },
        {
          "name": "season",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  97,
                  115,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "riderProfile"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "budgetCents",
          "type": "u64"
        },
        {
          "name": "titleHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "initializeRider",
      "discriminator": [
        25,
        156,
        215,
        47,
        4,
        112,
        8,
        198
      ],
      "accounts": [
        {
          "name": "rider",
          "writable": true,
          "signer": true
        },
        {
          "name": "riderProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  105,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "rider"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "sponsorExpense",
      "discriminator": [
        30,
        124,
        30,
        182,
        251,
        83,
        225,
        81
      ],
      "accounts": [
        {
          "name": "merchant",
          "writable": true,
          "signer": true
        },
        {
          "name": "season"
        },
        {
          "name": "expense",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  112,
                  101,
                  110,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "season"
              },
              {
                "kind": "account",
                "path": "expense.expenseId",
                "account": "expense"
              }
            ]
          }
        },
        {
          "name": "sponsorship",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  112,
                  111,
                  110,
                  115,
                  111,
                  114,
                  115,
                  104,
                  105,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "expense"
              },
              {
                "kind": "account",
                "path": "expense.sponsorshipCount",
                "account": "expense"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amountCents",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "expense",
      "discriminator": [
        49,
        167,
        206,
        160,
        209,
        254,
        24,
        100
      ]
    },
    {
      "name": "riderProfile",
      "discriminator": [
        65,
        122,
        118,
        216,
        124,
        74,
        229,
        218
      ]
    },
    {
      "name": "season",
      "discriminator": [
        76,
        67,
        93,
        156,
        180,
        157,
        248,
        47
      ]
    },
    {
      "name": "sponsorship",
      "discriminator": [
        191,
        110,
        48,
        7,
        9,
        44,
        168,
        248
      ]
    }
  ],
  "events": [
    {
      "name": "directContribution",
      "discriminator": [
        34,
        229,
        37,
        174,
        54,
        196,
        235,
        84
      ]
    },
    {
      "name": "expenseCreated",
      "discriminator": [
        79,
        218,
        230,
        237,
        5,
        12,
        150,
        71
      ]
    },
    {
      "name": "riderInitialized",
      "discriminator": [
        142,
        106,
        99,
        32,
        132,
        150,
        136,
        185
      ]
    },
    {
      "name": "seasonCreated",
      "discriminator": [
        69,
        129,
        125,
        162,
        208,
        173,
        40,
        68
      ]
    },
    {
      "name": "sponsorshipCreated",
      "discriminator": [
        65,
        136,
        14,
        91,
        51,
        0,
        123,
        238
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "notImplemented",
      "msg": "Instruction is reserved for a later implementation stage"
    },
    {
      "code": 6001,
      "name": "unauthorizedRider",
      "msg": "Only the rider may perform this action"
    },
    {
      "code": 6002,
      "name": "invalidRiderProfile",
      "msg": "Invalid rider profile"
    },
    {
      "code": 6003,
      "name": "invalidSeason",
      "msg": "Invalid season"
    },
    {
      "code": 6004,
      "name": "seasonNotActive",
      "msg": "Season is not active"
    },
    {
      "code": 6005,
      "name": "invalidExpense",
      "msg": "Invalid expense"
    },
    {
      "code": 6006,
      "name": "invalidExpenseAmount",
      "msg": "Expense amount must be positive"
    },
    {
      "code": 6007,
      "name": "invalidSponsorshipAmount",
      "msg": "Sponsorship amount must be positive"
    },
    {
      "code": 6008,
      "name": "expenseFullyCovered",
      "msg": "Expense is fully covered"
    },
    {
      "code": 6009,
      "name": "coverageExceeded",
      "msg": "Sponsorship exceeds remaining expense coverage"
    },
    {
      "code": 6010,
      "name": "arithmeticOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6011,
      "name": "invalidMerchant",
      "msg": "Invalid merchant signer"
    },
    {
      "code": 6012,
      "name": "invalidMockUsdcMint",
      "msg": "Mock USDC mint is not the approved mint or is not configured"
    },
    {
      "code": 6013,
      "name": "invalidMintDecimals",
      "msg": "Mock USDC mint must have six decimals"
    },
    {
      "code": 6014,
      "name": "invalidTokenAccountOwner",
      "msg": "Token account has the wrong owner"
    },
    {
      "code": 6015,
      "name": "invalidTokenAccountMint",
      "msg": "Token account has the wrong mint"
    },
    {
      "code": 6016,
      "name": "invalidRecipientTokenAccount",
      "msg": "Recipient must be the rider's canonical associated token account"
    },
    {
      "code": 6017,
      "name": "invalidTokenProgram",
      "msg": "Only the standard SPL Token program is allowed"
    },
    {
      "code": 6018,
      "name": "invalidContributionAmount",
      "msg": "Contribution amount must be positive"
    },
    {
      "code": 6019,
      "name": "invalidSeasonBudget",
      "msg": "Season budget must be positive"
    }
  ],
  "types": [
    {
      "name": "directContribution",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fan",
            "type": "pubkey"
          },
          {
            "name": "rider",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "expense",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "season",
            "type": "pubkey"
          },
          {
            "name": "expenseId",
            "type": "u64"
          },
          {
            "name": "estimatedCostCents",
            "type": "u64"
          },
          {
            "name": "committedCoverageCents",
            "type": "u64"
          },
          {
            "name": "sponsorshipCount",
            "type": "u64"
          },
          {
            "name": "category",
            "type": "u8"
          },
          {
            "name": "descriptionHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "expenseCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "season",
            "type": "pubkey"
          },
          {
            "name": "expense",
            "type": "pubkey"
          },
          {
            "name": "expenseId",
            "type": "u64"
          },
          {
            "name": "estimatedCostCents",
            "type": "u64"
          },
          {
            "name": "category",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "riderInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "rider",
            "type": "pubkey"
          },
          {
            "name": "riderProfile",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "riderProfile",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "rider",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "season",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "rider",
            "type": "pubkey"
          },
          {
            "name": "seasonId",
            "type": "u64"
          },
          {
            "name": "budgetCents",
            "type": "u64"
          },
          {
            "name": "titleHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "expenseCount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "seasonCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "rider",
            "type": "pubkey"
          },
          {
            "name": "season",
            "type": "pubkey"
          },
          {
            "name": "seasonId",
            "type": "u64"
          },
          {
            "name": "budgetCents",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "sponsorship",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "expense",
            "type": "pubkey"
          },
          {
            "name": "merchant",
            "type": "pubkey"
          },
          {
            "name": "sponsorshipId",
            "type": "u64"
          },
          {
            "name": "amountCents",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "sponsorshipCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "expense",
            "type": "pubkey"
          },
          {
            "name": "sponsorship",
            "type": "pubkey"
          },
          {
            "name": "merchant",
            "type": "pubkey"
          },
          {
            "name": "sponsorshipId",
            "type": "u64"
          },
          {
            "name": "amountCents",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
