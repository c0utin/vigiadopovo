// Mirrors deputy photos between static/fotos/deputados and the R2 media
// bucket, which the Worker serves at the same /fotos/... URLs.
//
//   node scripts/media.mjs pull   # before `pnpm data:deputies`: fetch only new photos
//   node scripts/media.mjs push   # after it, before deploying: upload new/changed
//   node scripts/media.mjs prune  # after a successful deploy: delete departed
//
// Prune runs only once the new build is live: until then the old site still
// lists (and links to the photos of) deputies who left office.
//
// Needs R2_ENDPOINT, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (R2 API token
// with Object Read & Write on the bucket). MEDIA_BUCKET defaults to vigia-media.
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const DIR = "static/fotos/deputados";
const PREFIX = "fotos/deputados/";
const NAME = /^\d{1,9}\.jpg$/;

const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
const bucket = process.env.MEDIA_BUCKET || "vigia-media";
const mode = process.argv[2];
if (
  !["pull", "push", "prune"].includes(mode) ||
  !R2_ENDPOINT ||
  !R2_ACCESS_KEY_ID
) {
  console.error(
    "Uso: node scripts/media.mjs pull|push|prune, com R2_ENDPOINT, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY",
  );
  process.exit(1);
}
const client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  maxAttempts: 3,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY ?? "",
  },
});

const md5 = (bytes) => createHash("md5").update(bytes).digest("hex");

async function remote() {
  const objects = new Map();
  let token;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: PREFIX,
        ContinuationToken: token,
      }),
    );
    for (const { Key, ETag } of page.Contents ?? [])
      objects.set(Key.slice(PREFIX.length), ETag.replaceAll('"', ""));
    token = page.NextContinuationToken;
  } while (token);
  return objects;
}

async function local() {
  await mkdir(DIR, { recursive: true });
  const files = new Map();
  for (const name of await readdir(DIR))
    if (NAME.test(name)) files.set(name, md5(await readFile(`${DIR}/${name}`)));
  return files;
}

const [objects, files] = await Promise.all([remote(), local()]);
let changed = 0;
if (mode === "pull") {
  for (const [name, etag] of objects) {
    if (!NAME.test(name) || files.get(name) === etag) continue;
    const object = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: PREFIX + name }),
    );
    await writeFile(
      `${DIR}/${name}.tmp`,
      await object.Body.transformToByteArray(),
    );
    await rename(`${DIR}/${name}.tmp`, `${DIR}/${name}`);
    changed++;
  }
  console.log(`${changed} fotos baixadas do R2; ${objects.size} no bucket.`);
} else {
  // An empty folder means data:deputies did not run; never empty the bucket.
  if (!files.size) {
    console.error(`Nenhuma foto em ${DIR}; nada enviado nem removido.`);
    process.exit(1);
  }
  if (mode === "push")
    for (const [name, hash] of files) {
      if (objects.get(name) === hash) continue;
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: PREFIX + name,
          Body: await readFile(`${DIR}/${name}`),
          ContentType: "image/jpeg",
        }),
      );
      changed++;
    }
  // data:deputies removes photos of deputies no longer in office; mirror that.
  const departed =
    mode === "prune"
      ? [...objects.keys()].filter((name) => !files.has(name))
      : [];
  for (let i = 0; i < departed.length; i += 1000)
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: departed
            .slice(i, i + 1000)
            .map((name) => ({ Key: PREFIX + name })),
        },
      }),
    );
  console.log(
    mode === "push"
      ? `${changed} fotos enviadas ao R2; ${files.size} publicadas.`
      : `${departed.length} fotos de ex-deputados removidas do R2.`,
  );
}
client.destroy();
