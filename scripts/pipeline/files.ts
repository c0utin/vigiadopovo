import { Effect, FileSystem, Path } from "effect";

// Writes through a temporary file and a rename, so readers never see a partial file.
export const writeAtomic = Effect.fn("writeAtomic")(function* (
  path: string,
  body: string | Uint8Array,
) {
  const fs = yield* FileSystem.FileSystem;
  const { dirname } = yield* Path.Path;
  yield* fs.makeDirectory(dirname(path), { recursive: true });
  if (typeof body === "string") yield* fs.writeFileString(`${path}.tmp`, body);
  else yield* fs.writeFile(`${path}.tmp`, body);
  yield* fs.rename(`${path}.tmp`, path);
});
