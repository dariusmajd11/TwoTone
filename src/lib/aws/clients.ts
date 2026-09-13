import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { env } from "@/lib/env";

const credentials = () => ({
  accessKeyId: env.awsAccessKeyId!,
  secretAccessKey: env.awsSecretAccessKey!,
});

// Cached per module instance: Vercel reuses warm lambdas, and rebuilding a
// client per request re-resolves credentials on every call.
let s3: S3Client | null = null;
let ddb: DynamoDBDocumentClient | null = null;
let cognito: CognitoIdentityProviderClient | null = null;

export function s3Client(): S3Client {
  s3 ??= new S3Client({ region: env.awsRegion, credentials: credentials() });
  return s3;
}

export function dynamoClient(): DynamoDBDocumentClient {
  ddb ??= DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: env.awsRegion, credentials: credentials() }),
  );
  return ddb;
}

export function cognitoClient(): CognitoIdentityProviderClient {
  cognito ??= new CognitoIdentityProviderClient({
    region: env.awsRegion,
    credentials: credentials(),
  });
  return cognito;
}
