import { isToolLifecycleItemType, type ProviderRuntimeEvent } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";

type ItemUpdatedEvent = Extract<ProviderRuntimeEvent, { readonly type: "item.updated" }>;
type ContentDeltaEvent = Extract<ProviderRuntimeEvent, { readonly type: "content.delta" }>;
type BufferedRuntimeEvent = ItemUpdatedEvent | ContentDeltaEvent;

export const DEFAULT_CUMULATIVE_TOOL_CALL_UPDATE_INTERVAL = Duration.millis(100);
export const DEFAULT_INCREMENTAL_CONTENT_DELTA_INTERVAL = Duration.millis(32);

export interface CumulativeToolCallUpdateCoalescer {
  readonly offer: (event: ProviderRuntimeEvent) => Effect.Effect<void>;
  readonly flush: Effect.Effect<void>;
  readonly close: Effect.Effect<void>;
}

function isToolLifecyclePartial(event: ProviderRuntimeEvent): event is ItemUpdatedEvent {
  return (
    event.type === "item.updated" &&
    isToolLifecycleItemType(event.payload.itemType) &&
    (event.payload.status === undefined || event.payload.status === "inProgress") &&
    typeof event.payload.detail === "string"
  );
}

function isSameItem(left: ItemUpdatedEvent, right: ItemUpdatedEvent): boolean {
  return (
    left.provider === right.provider &&
    left.threadId === right.threadId &&
    left.turnId === right.turnId &&
    left.itemId === right.itemId &&
    left.payload.itemType === right.payload.itemType
  );
}

function canReplaceCumulativePartial(previous: ItemUpdatedEvent, next: ItemUpdatedEvent): boolean {
  const previousDetail = previous.payload.detail;
  const nextDetail = next.payload.detail;
  return (
    isSameItem(previous, next) &&
    previous.payload.status === next.payload.status &&
    previous.payload.title === next.payload.title &&
    typeof previousDetail === "string" &&
    typeof nextDetail === "string" &&
    nextDetail.startsWith(previousDetail)
  );
}

function isIncrementalAssistantText(event: ProviderRuntimeEvent): event is ContentDeltaEvent {
  return (
    event.type === "content.delta" &&
    event.payload.streamKind === "assistant_text" &&
    event.payload.delta.length > 0
  );
}

function isSameContentStream(left: ContentDeltaEvent, right: ContentDeltaEvent): boolean {
  return (
    left.provider === right.provider &&
    left.threadId === right.threadId &&
    left.turnId === right.turnId &&
    left.itemId === right.itemId &&
    left.payload.streamKind === right.payload.streamKind &&
    left.payload.contentIndex === right.payload.contentIndex &&
    left.payload.summaryIndex === right.payload.summaryIndex
  );
}

function mergeIncrementalContent(
  previous: ContentDeltaEvent,
  next: ContentDeltaEvent,
): ContentDeltaEvent {
  return {
    ...next,
    payload: {
      ...next.payload,
      delta: previous.payload.delta + next.payload.delta,
    },
  };
}

export const makeCumulativeToolCallUpdateCoalescer = Effect.fn(
  "makeCumulativeToolCallUpdateCoalescer",
)(function* (input: {
  readonly scope: Scope.Scope;
  readonly coalesceCumulativeToolCallUpdates?: boolean;
  readonly coalesceIncrementalContentDeltas?: boolean;
  readonly interval?: Duration.Input;
  readonly contentDeltaInterval?: Duration.Input;
  readonly publish: (event: ProviderRuntimeEvent) => Effect.Effect<void>;
}) {
  const gate = yield* Semaphore.make(1);
  const coalesceCumulativeToolCallUpdates = input.coalesceCumulativeToolCallUpdates ?? true;
  const coalesceIncrementalContentDeltas = input.coalesceIncrementalContentDeltas ?? false;
  const toolInterval = input.interval ?? DEFAULT_CUMULATIVE_TOOL_CALL_UPDATE_INTERVAL;
  const contentDeltaInterval =
    input.contentDeltaInterval ?? DEFAULT_INCREMENTAL_CONTENT_DELTA_INTERVAL;
  let pending: BufferedRuntimeEvent | undefined;
  let activeContentStream: ContentDeltaEvent | undefined;
  let timerFiber: Fiber.Fiber<void, never> | undefined;
  let closed = false;

  const publishPending = Effect.fn("CumulativeToolCallUpdateCoalescer.publishPending")(
    function* () {
      const event = pending;
      pending = undefined;
      if (event) {
        yield* input.publish(event);
      }
    },
  );

  const cancelTimer = Effect.fn("CumulativeToolCallUpdateCoalescer.cancelTimer")(function* () {
    const fiber = timerFiber;
    timerFiber = undefined;
    if (fiber) {
      yield* Fiber.interrupt(fiber);
    }
  });

  const flushFromTimer = gate.withPermit(
    Effect.gen(function* () {
      timerFiber = undefined;
      if (!closed) {
        yield* publishPending();
      }
    }),
  );

  const scheduleTimer = Effect.fn("CumulativeToolCallUpdateCoalescer.scheduleTimer")(function* (
    duration: Duration.Input,
  ) {
    timerFiber = yield* Effect.sleep(duration).pipe(
      Effect.andThen(flushFromTimer),
      Effect.forkIn(input.scope),
    );
  });

  const flush = gate.withPermit(
    Effect.gen(function* () {
      yield* cancelTimer();
      yield* publishPending();
      activeContentStream = undefined;
    }),
  );

  const offer = (event: ProviderRuntimeEvent): Effect.Effect<void> =>
    gate.withPermit(
      Effect.gen(function* () {
        if (closed) {
          return;
        }

        if (coalesceIncrementalContentDeltas && isIncrementalAssistantText(event)) {
          if (activeContentStream && isSameContentStream(activeContentStream, event)) {
            if (pending?.type === "content.delta" && isSameContentStream(pending, event)) {
              pending = mergeIncrementalContent(pending, event);
              return;
            }
            if (pending) {
              yield* cancelTimer();
              yield* publishPending();
            }
            pending = event;
            yield* scheduleTimer(contentDeltaInterval);
            return;
          }

          if (pending) {
            yield* cancelTimer();
            yield* publishPending();
          }
          activeContentStream = event;
          yield* input.publish(event);
          return;
        }

        activeContentStream = undefined;

        if (coalesceCumulativeToolCallUpdates && isToolLifecyclePartial(event)) {
          if (pending?.type === "item.updated" && canReplaceCumulativePartial(pending, event)) {
            pending = event;
            return;
          }
          if (pending) {
            yield* cancelTimer();
            yield* publishPending();
          }
          pending = event;
          yield* scheduleTimer(toolInterval);
          return;
        }

        if (pending) {
          yield* cancelTimer();
          yield* publishPending();
        }
        yield* input.publish(event);
      }),
    );

  const close = gate.withPermit(
    Effect.gen(function* () {
      if (closed) {
        return;
      }
      closed = true;
      yield* cancelTimer();
      pending = undefined;
      activeContentStream = undefined;
    }),
  );

  return { offer, flush, close } satisfies CumulativeToolCallUpdateCoalescer;
});
