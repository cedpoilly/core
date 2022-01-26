import "reflect-metadata";
import dotenv from "dotenv";
dotenv.config({ debug: false });
import { ApolloServer } from "apollo-server";
import * as path from "path";
import { buildSchema } from "type-graphql";
import { Sequelize } from "sequelize-typescript";
import { privateTables, sequelize } from "./libs/db";
import { JwtPayload } from "jsonwebtoken";
import { decryptAndVerifyToken } from "./utils/decrypt-and-verify-token";

const PORT = process.env.PORT ?? 4000;

interface MainContext {
  sequelize: Sequelize;
  decryptedToken: string | null | JwtPayload;
}

export type Context = Readonly<MainContext>;

async function bootstrap() {
  await sequelize.authenticate();
  if (process.env.DATABASE_FORCE_SYNC === "yes") {
    await sequelize.query("CREATE EXTENSION IF NOT EXISTS citext;");
    await sequelize.sync();
    // NOTES: We only want to make the keys table
    // Any other table isn't needed here
    await Promise.all(
      privateTables.map((dbModel) =>
        sequelize.query(`DROP TABLE IF EXISTS "${dbModel.getTableName()}";`)
      )
    );
  }
  // build TypeGraphQL executable schema
  const schema = await buildSchema({
    resolvers: [__dirname + "/**/*.resolver.{ts,js}"],
    // automatically create `schema.gql` file with schema definition in current folder
    emitSchemaFile: path.resolve(__dirname, "schema.gql"),
  });

  // Create GraphQL server
  const server = new ApolloServer({
    schema,
    context: async (integrationContext): Promise<Context> => ({
      sequelize,
      decryptedToken: await decryptAndVerifyToken(
        integrationContext.req.headers,
        sequelize
      ),
    }),
  });

  // Start the server
  const { url } = await server.listen(PORT);
  console.log(`Server is running, GraphQL Playground available at ${url}`);
}

bootstrap();
