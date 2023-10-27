import { createSchema, createTable, p } from "@ponder/core";

export const schema = createSchema({
  SetupEntity: createTable({
    id: p.string(),
  }),
  Account: createTable({
    id: p.string(),
    tokens: p.virtual("Token.ownerId"),
  }),

  Token: createTable({
    id: p.bigint(),
    claimedById: p.string({
      references: "Account.id",
      optional: true,
    }),
    ownerId: p.string({ references: "Account.id" }),
  }),
});
