import { Schema } from "effect";

export class PipelineError extends Schema.TaggedError<PipelineError>()(
  "PipelineError",
  {
    stage: Schema.Literals([
      "collection",
      "validation",
      "inference",
      "storage",
      "cli",
    ]),
    message: Schema.String,
  },
) {}

export class SourceError extends Schema.TaggedError<SourceError>()(
  "SourceError",
  {
    message: Schema.String,
    retryable: Schema.Boolean,
    retryAfterMillis: Schema.NullOr(Schema.Number),
  },
) {}
