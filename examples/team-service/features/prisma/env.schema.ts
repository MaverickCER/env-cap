import { createEnv, documentEnv } from "env-cap";

/**
 * Prisma isn't itself a database backend -- it's an ORM layer that targets
 * whichever one is active, so it's categorized separately ("orm", not
 * "database") and carries no exclusiveGroup: there's only one ORM choice in
 * this boilerplate, nothing for it to conflict with.
 */
const prismaSchema = {
  DATABASE_PROVIDER: {
    validator: (value: string) =>
      ["postgresql", "mongodb"].includes(value) || `Unsupported provider "${value}".`,
  },
};

export const prismaEnv = createEnv(prismaSchema, { name: "prisma", source: import.meta.url });

documentEnv(prismaSchema, {
  category: "orm",
  owner: "data-platform-team",
  metadata: {
    docs: "https://www.prisma.io/docs/orm/reference/connection-urls",
  },
  variables: {
    DATABASE_PROVIDER: { description: "Which database provider Prisma should target." },
  },
});
