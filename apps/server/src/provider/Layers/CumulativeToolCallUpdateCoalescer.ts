import { isToolLifecycleItemType, type ProviderRuntimeEvent } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";

type ItemUpdatedEvent = Extract<ProviderRuntimeEvent, { readonly type: "item.updated" }>;

export const DEFAULT_CUMULATIVE_TOOL_CALL_UPDATE_INTERVAL = Duration.millis(100);

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

export const makeCumulativeToolCallUpdateCoalescer = Effect.fn(
  "makeCumulativeToolCallUpdateCoalescer",
)(function* (input: {
  readonly scope: Scope.Scope;
  readonly interval?: Duration.Input;
  readonly publish: (event: ProviderRuntimeEvent) => Effect.Effect<void>;
}) {
  const gate = yield* Semaphore.make(1);
  const interval = input.interval ?? DEFAULT_CUMULATIVE_TOOL_CALL_UPDATE_INTERVAL;
  let pending: ItemUpdatedEvent | undefined;
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

  const scheduleTimer = Effect.fn("CumulativeToolCallUpdateCoalescer.scheduleTimer")(function* () {
    timerFiber = yield* Effect.sleep(interval).pipe(
      Effect.andThen(flushFromTimer),
      Effect.forkIn(input.scope),
    );
  });

  const flush = gate.withPermit(
    Effect.gen(function* () {
      yield* cancelTimer();
      yield* publishPending();
    }),
  );

  const offer = (event: ProviderRuntimeEvent): Effect.Effect<void> =>
    gate.withPermit(
      Effect.gen(function* () {
        if (closed) {
          return;
        }

        if (isToolLifecyclePartial(event)) {
          if (pending && canReplaceCumulativePartial(pending, event)) {
            pending = event;
            return;
          }
          if (pending) {
            yield* cancelTimer();
            yield* publishPending();
          }
          pending = event;
          yield* scheduleTimer();
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
    }),
  );

  return { offer, flush, close } satisfies CumulativeToolCallUpdateCoalescer;
});
