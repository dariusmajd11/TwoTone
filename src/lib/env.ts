function read(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

export const env = {
  anthropicApiKey: read("ANTHROPIC_API_KEY"),
  anthropicModel: read("ANTHROPIC_MODEL") ?? "claude-opus-4-7",

  awsRegion: read("AWS_REGION") ?? "us-west-2",
  awsAccessKeyId: read("AWS_ACCESS_KEY_ID"),
  awsSecretAccessKey: read("AWS_SECRET_ACCESS_KEY"),

  s3Bucket: read("TWOTONE_S3_BUCKET"),
  dynamoUsersTable: read("TWOTONE_DDB_USERS_TABLE"),
  dynamoHistoryTable: read("TWOTONE_DDB_HISTORY_TABLE"),

  cognitoUserPoolId: read("TWOTONE_COGNITO_USER_POOL_ID"),
  cognitoClientId: read("TWOTONE_COGNITO_CLIENT_ID"),
  cognitoClientSecret: read("TWOTONE_COGNITO_CLIENT_SECRET"),

  ebayClientId: read("EBAY_CLIENT_ID"),
  ebayClientSecret: read("EBAY_CLIENT_SECRET"),
  /** `EBAY_US`, `EBAY_GB`, … — decides which site's inventory is searched. */
  ebayMarketplaceId: read("EBAY_MARKETPLACE_ID") ?? "EBAY_US",
  /** Set to `https://api.sandbox.ebay.com` to run against eBay's sandbox. */
  ebayApiBase: read("EBAY_API_BASE") ?? "https://api.ebay.com",

  sessionSecret: read("TWOTONE_SESSION_SECRET"),
};

const hasAwsCredentials = Boolean(env.awsAccessKeyId && env.awsSecretAccessKey);

/**
 * Each backend picks its AWS implementation independently so the project can be
 * migrated one service at a time rather than in a single all-or-nothing switch.
 */
export const backends = {
  storage: hasAwsCredentials && env.s3Bucket ? "s3" : "local",
  auth:
    hasAwsCredentials && env.cognitoUserPoolId && env.cognitoClientId
      ? "cognito"
      : "local",
  database:
    hasAwsCredentials && env.dynamoUsersTable && env.dynamoHistoryTable
      ? "dynamodb"
      : "local",
  identification: env.anthropicApiKey ? "claude" : "mock",
  /**
   * Unlike the others, this falls back to "none" rather than "mock" in
   * production. The other mocks stand in for a service while you build; sample
   * *listings* are prices and sizes for items that do not exist, and a deployed
   * site showing those is not a placeholder, it is a lie. Locally the sample
   * data is how the grid gets developed at all.
   */
  listings:
    env.ebayClientId && env.ebayClientSecret
      ? "ebay"
      : process.env.NODE_ENV === "production"
        ? "none"
        : "mock",
} as const;
