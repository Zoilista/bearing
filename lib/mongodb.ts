import { MongoClient } from 'mongodb';

const options = {};

declare global {
  // Allow global `_mongoClientPromise` in dev to survive HMR
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

/**
 * Returns a MongoClient promise.
 * Validation is deferred to runtime (not module load) so that
 * `next build` doesn't fail when MONGODB_URI is not in the build env.
 */
export function getMongoClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Add it to .env.local (development) or your deployment environment.'
    );
  }

  if (process.env.NODE_ENV === 'development') {
    // Reuse across HMR reloads
    if (!global._mongoClientPromise) {
      const client = new MongoClient(uri, options);
      global._mongoClientPromise = client.connect();
    }
    return global._mongoClientPromise!;
  }

  // Production: new client per cold start (no global)
  const client = new MongoClient(uri, options);
  return client.connect();
}
