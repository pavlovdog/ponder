import { codegen } from "@graphql-codegen/core";
import * as typescriptPlugin from "@graphql-codegen/typescript";
import { GraphQLSchema, parse, printSchema } from "graphql";
import { writeFile } from "node:fs/promises";

import { toolConfig } from "./config";

const header = `
/* Autogenerated file. Do not edit manually. */
`;

const generateEntityTypes = async (gqlSchema: GraphQLSchema) => {
  const body = await codegen({
    documents: [],
    config: {},
    // used by a plugin internally, although the 'typescript' plugin currently
    // returns the string output, rather than writing to a file
    filename: "",
    schema: parse(printSchema(gqlSchema)),
    plugins: [
      {
        typescript: {},
      },
    ],
    pluginMap: {
      typescript: typescriptPlugin,
    },
  });

  const final = header + body;

  writeFile(`${toolConfig.pathToGeneratedDir}/schema.d.ts`, final, "utf8");

  console.log(`Regenerated schema.d.ts`);
};

export { generateEntityTypes };
